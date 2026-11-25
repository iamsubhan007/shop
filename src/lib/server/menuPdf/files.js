import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { BUCKET, STORAGE_DIR, sb, storageBackend } from '@/lib/server/storage';
import { MAX_PDF_BYTES } from '@/lib/menuPdf/validate';

// Uploaded menu PDFs. Same three modes as the other files (see storage.js). In Supabase they live in their own PRIVATE
// bucket and are only ever read through this app's routes or a link that works for one minute.

export const MENU_BUCKET = `${BUCKET}-menu`;
const DIR = path.join(STORAGE_DIR, 'menu-pdf');
export const MENU_FILE_RE = /^[a-f0-9-]{36}\.pdf$/;

export const newMenuFileName = () => `${crypto.randomUUID()}.pdf`;

const notFound = (e) => /not.?found|404/i.test(`${e?.message} ${e?.statusCode ?? ''} ${e?.status ?? ''}`);

let bucketReady;
async function ensureBucket() {
  bucketReady ||= (async () => {
    const { error } = await sb().storage.createBucket(MENU_BUCKET, { public: false, fileSizeLimit: MAX_PDF_BYTES, allowedMimeTypes: ['application/pdf'] });
    if (error && !/already exists|duplicate|409/i.test(`${error.message} ${error.statusCode ?? ''} ${error.status ?? ''}`)) {
      console.warn('menu pdf: could not create the bucket (it may already exist):', error.message);
    }
  })();
  return bucketReady;
}

function usable() {
  const backend = storageBackend();
  if (backend === 'unavailable') throw new Error('File storage is not set up on this server: set SUPABASE_SERVICE_ROLE_KEY.');
  return backend;
}

export async function saveMenuFile(name, buf) {
  if (usable() === 'supabase') {
    await ensureBucket();
    const put = () => sb().storage.from(MENU_BUCKET).upload(name, buf, { contentType: 'application/pdf', upsert: false });
    let { error } = await put();
    if (error && /bucket not found/i.test(error.message || '')) {
      bucketReady = undefined;
      await ensureBucket();
      ({ error } = await put());
    }
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    return;
  }
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, name), buf);
}

/** The file's bytes, or null when it does not exist. Throws when storage cannot be reached. */
export async function readMenuFile(name) {
  if (!MENU_FILE_RE.test(String(name || ''))) return null;
  if (usable() === 'supabase') {
    const { data, error } = await sb().storage.from(MENU_BUCKET).download(name);
    if (error) {
      if (notFound(error)) return null;
      throw new Error(`Supabase Storage: ${error.message}`);
    }
    return Buffer.from(await data.arrayBuffer());
  }
  try {
    return await fs.readFile(path.join(DIR, name));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** Best effort; a file left behind is unreachable (private bucket, not listed anywhere). */
export async function removeMenuFile(name) {
  if (!MENU_FILE_RE.test(String(name || ''))) return;
  try {
    if (storageBackend() === 'supabase') await sb().storage.from(MENU_BUCKET).remove([name]);
    else await fs.unlink(path.join(DIR, name));
  } catch {
    // already gone or storage unreachable
  }
}

/** A one-minute link straight to storage, for files too big to pass through a serverless function. */
export async function signedMenuUrl(name, { download } = {}) {
  if (storageBackend() !== 'supabase' || !MENU_FILE_RE.test(String(name || ''))) return null;
  const { data, error } = await sb().storage.from(MENU_BUCKET).createSignedUrl(name, 60, download ? { download } : undefined);
  return error ? null : data?.signedUrl || null;
}

/** A link that lets the admin's browser upload one file, to exactly this name, straight to storage. */
export async function signedMenuUploadUrl(name) {
  await ensureBucket();
  const { data, error } = await sb().storage.from(MENU_BUCKET).createSignedUploadUrl(name);
  if (error || !data?.signedUrl) throw new Error(`Supabase Storage: ${error?.message || 'no upload link'}`);
  return data.signedUrl;
}
