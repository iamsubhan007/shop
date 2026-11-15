import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { BUCKET, STORAGE_DIR, sb, storageBackend } from './storage';

// Backup files and storage measurements. Same three modes as storage.js (supabase / disk / unavailable):
//  - Supabase: backups go to their own PRIVATE bucket (`<bucket>-backups`), so a growing backup is never held to the
//    5 MB limit of the picture bucket, and they are only read back through this app's checked routes.
//  - disk: STORAGE_DIR/backups, as before.
//  - unavailable (Vercel with no Supabase key and no disk): saving fails with a message that says what to set up.

export const BACKUP_BUCKET = `${BUCKET}-backups`;
export const BACKUP_FILE_RE = /^hbt-backup-[\w.-]+\.json\.gz$/;
// A Vercel function can only return about 4.5 MB; bigger backups are handed over through a short-lived signed link.
export const PROXY_MAX_BYTES = 4 * 1024 * 1024;
const BACKUP_DIR = path.join(STORAGE_DIR, 'backups');

const alreadyThere = (e) => /already exists|duplicate|409/i.test(`${e?.message} ${e?.statusCode ?? ''} ${e?.status ?? ''}`);
const errText = (e) => `${e?.message || e}`;

let backupBucketReady;
async function ensureBackupBucket() {
  backupBucketReady ||= (async () => {
    // No per-bucket size cap: the plan's own per-file limit applies.
    const { error } = await sb().storage.createBucket(BACKUP_BUCKET, { public: false });
    if (error && !alreadyThere(error)) console.warn('storage: could not create the backups bucket (it may already exist):', error.message);
  })();
  return backupBucketReady;
}

function unavailable() {
  return new Error('Backups cannot be saved on this server: set SUPABASE_SERVICE_ROLE_KEY (Supabase Storage) or STORAGE_DIR (a persistent disk).');
}

/** Saves one backup file. Throws with a readable message when it could not be stored. */
export async function saveBackupFile(filename, buf) {
  const backend = storageBackend();
  if (backend === 'unavailable') throw unavailable();
  if (backend === 'supabase') {
    await ensureBackupBucket();
    const put = () => sb().storage.from(BACKUP_BUCKET).upload(filename, buf, { contentType: 'application/gzip', upsert: false });
    let { error } = await put();
    if (error && /bucket not found/i.test(error.message || '')) { backupBucketReady = undefined; await ensureBackupBucket(); ({ error } = await put()); }
    if (error) throw new Error(`Supabase Storage: ${errText(error)}`);
    return;
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.writeFile(path.join(BACKUP_DIR, filename), buf);
}

/** The file's bytes, or null when it is not there any more. */
export async function readBackupFile(filename) {
  if (!BACKUP_FILE_RE.test(String(filename || ''))) return null;
  try {
    const backend = storageBackend();
    if (backend === 'supabase') {
      const { data, error } = await sb().storage.from(BACKUP_BUCKET).download(filename);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    }
    if (backend === 'disk') return await fs.readFile(path.join(BACKUP_DIR, filename));
  } catch {
    // fall through: treat as not found
  }
  return null;
}

/** A link that lets the browser download a (large) backup straight from storage for a minute. Supabase mode only. */
export async function signedBackupUrl(filename, seconds = 60) {
  if (storageBackend() !== 'supabase' || !BACKUP_FILE_RE.test(String(filename || ''))) return null;
  try {
    const { data, error } = await sb().storage.from(BACKUP_BUCKET).createSignedUrl(filename, seconds, { download: filename });
    return error ? null : data?.signedUrl || null;
  } catch {
    return null;
  }
}

/** Backup files that exist now, newest first: [{ name, size }]. */
export async function listBackupFiles() {
  const backend = storageBackend();
  let out = [];
  try {
    if (backend === 'supabase') {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await sb().storage.from(BACKUP_BUCKET).list('', { limit: 1000, offset });
        if (error || !data) break;
        out.push(...data.filter((f) => BACKUP_FILE_RE.test(f.name)).map((f) => ({ name: f.name, size: Number(f.metadata?.size) || 0 })));
        if (data.length < 1000) break;
      }
    } else if (backend === 'disk') {
      const names = (await fs.readdir(BACKUP_DIR).catch(() => [])).filter((f) => BACKUP_FILE_RE.test(f));
      out = await Promise.all(names.map(async (name) => ({ name, size: (await fs.stat(path.join(BACKUP_DIR, name)).catch(() => null))?.size || 0 })));
    }
  } catch (e) {
    console.error('storage: listing backups failed:', errText(e));
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Keeps the newest `keep` backups (at least one) and removes the rest. Returns the removed names. */
export async function pruneBackupFiles(keep) {
  const files = await listBackupFiles();
  const old = files.slice(Math.max(1, Number(keep) || 1)).map((f) => f.name);
  if (!old.length) return [];
  try {
    if (storageBackend() === 'supabase') await sb().storage.from(BACKUP_BUCKET).remove(old);
    else await Promise.all(old.map((n) => fs.unlink(path.join(BACKUP_DIR, n)).catch(() => {})));
  } catch (e) {
    console.error('storage: pruning old backups failed:', errText(e));
    return [];
  }
  return old;
}

/**
 * Removes stored pictures in one go and says whether it worked. A file that is already gone counts as removed.
 * (storage.js deleteImage is the quiet best-effort version used when whole orders are deleted.)
 */
export async function removeImages(sub, names) {
  const list = [...new Set((names || []).filter((n) => /^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(String(n))))];
  if (!list.length) return { ok: true, removed: 0 };
  const backend = storageBackend();
  try {
    if (backend === 'supabase') {
      for (let i = 0; i < list.length; i += 500) {
        const { error } = await sb().storage.from(BUCKET).remove(list.slice(i, i + 500).map((n) => `${sub}/${n}`));
        if (error) return { ok: false, error: errText(error) };
      }
      return { ok: true, removed: list.length };
    }
    if (backend === 'disk') {
      for (const n of list) {
        try { await fs.unlink(path.join(STORAGE_DIR, sub, n)); } catch (e) { if (e?.code !== 'ENOENT') return { ok: false, error: errText(e) }; }
      }
      return { ok: true, removed: list.length };
    }
    return { ok: false, error: 'Storage is not set up on this server.' };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

// ---------- how much room the stored files take ----------
const FOLDERS = { proofs: 'Payment screenshots', products: 'Product & deal pictures', backups: 'Backups', other: 'Other files' };

function foldersFrom(map) {
  return Object.entries(FOLDERS).map(([key, label]) => ({ key, label, count: map[key]?.count || 0, bytes: map[key]?.bytes || 0 })).filter((f) => f.count || f.key !== 'other');
}

async function listAllSize(bucket, prefix) {
  let count = 0, bytes = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb().storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data) break;
    for (const f of data) {
      if (f.id === null && !f.metadata) continue; // a sub-folder placeholder
      count += 1; bytes += Number(f.metadata?.size) || 0;
    }
    if (data.length < 1000) break;
  }
  return { count, bytes };
}

/**
 * Total size of the stored files.
 *  supabase: the whole project's storage (every bucket) read straight from storage.objects, which is exactly what the
 *            plan's file-storage quota counts. If that table is not reachable, this app's own buckets are added up
 *            through the Storage API instead (source "supabase-api", partial = true).
 *  disk:     the folders under STORAGE_DIR.
 * Returns { source, totalBytes, partial, folders } (totalBytes null when nothing can be measured).
 */
export async function measureFiles() {
  const backend = storageBackend();
  if (backend === 'unavailable') return { source: 'unavailable', totalBytes: null, partial: false, folders: [] };
  const map = {};
  const add = (key, count, bytes) => { map[key] ||= { count: 0, bytes: 0 }; map[key].count += count; map[key].bytes += bytes; };

  if (backend === 'supabase') {
    try {
      const rows = await db.execute(sql`select bucket_id, split_part(name, '/', 1) as folder, count(*)::int as n, coalesce(sum((metadata->>'size')::bigint), 0)::float8 as bytes from storage.objects group by 1, 2`);
      let total = 0;
      for (const r of rows) {
        const bytes = Number(r.bytes) || 0;
        total += bytes;
        if (r.bucket_id === BACKUP_BUCKET) add('backups', r.n, bytes);
        else if (r.bucket_id === BUCKET && r.folder === 'proofs') add('proofs', r.n, bytes);
        else if (r.bucket_id === BUCKET && r.folder === 'products') add('products', r.n, bytes);
        else add('other', r.n, bytes);
      }
      return { source: 'supabase', totalBytes: total, partial: false, folders: foldersFrom(map) };
    } catch {
      // storage.objects is not readable from here: use the API for this app's own buckets
    }
    try {
      const [p, g, b] = await Promise.all([listAllSize(BUCKET, 'proofs'), listAllSize(BUCKET, 'products'), listAllSize(BACKUP_BUCKET, '')]);
      add('proofs', p.count, p.bytes); add('products', g.count, g.bytes); add('backups', b.count, b.bytes);
      return { source: 'supabase-api', totalBytes: p.bytes + g.bytes + b.bytes, partial: true, folders: foldersFrom(map) };
    } catch (e) {
      console.error('storage: measuring files failed:', errText(e));
      return { source: 'unknown', totalBytes: null, partial: false, folders: [] };
    }
  }

  let total = 0;
  for (const key of ['proofs', 'products', 'backups']) {
    const dir = path.join(STORAGE_DIR, key);
    for (const name of await fs.readdir(dir).catch(() => [])) {
      const st = await fs.stat(path.join(dir, name)).catch(() => null);
      if (st?.isFile()) { add(key, 1, st.size); total += st.size; }
    }
  }
  return { source: 'disk', totalBytes: total, partial: false, folders: foldersFrom(map) };
}
