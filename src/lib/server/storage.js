import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cleanEnv } from '@/lib/env';
import { deriveSupabaseUrl } from '@/lib/supabaseUrl';

// Where uploaded images (payment proofs, product/deal pictures) live. Three modes, picked automatically:
//
//  supabase     SUPABASE_SERVICE_ROLE_KEY is set. Files go to a PRIVATE Supabase Storage bucket and are only ever
//               read back through this app's own routes (which check who is asking). The project URL is taken from
//               DATABASE_URL unless SUPABASE_URL is set. This is what production (Vercel) needs.
//  disk         local development, or a server with a persistent disk (STORAGE_DIR).
//  unavailable  running on Vercel with neither of the above. A serverless disk is read-only or thrown away between
//               requests, so writing there fails; we say so clearly instead of crashing with a vague 500.
//
// STORAGE_DIR is still used for backups (see backup.js).
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');
const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = cleanEnv(process.env.SUPABASE_STORAGE_BUCKET) || 'hbt-files';

function supabaseConfig() {
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!key) return null;
  const url = cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) || deriveSupabaseUrl(process.env.DATABASE_URL);
  return url ? { url, key } : null;
}

export function storageBackend() {
  if (supabaseConfig()) return 'supabase';
  if (process.env.VERCEL && !process.env.STORAGE_DIR) return 'unavailable';
  return 'disk';
}

let client;
let clientFor;
function sb() {
  const cfg = supabaseConfig();
  const id = `${cfg.url}|${cfg.key}`;
  if (!client || clientFor !== id) {
    client = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    clientFor = id;
  }
  return client;
}

let bucketReady;
async function ensureBucket() {
  bucketReady ||= (async () => {
    const { error } = await sb().storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });
    if (error && !/already exists|duplicate|409/i.test(`${error.message} ${error.statusCode ?? ''} ${error.status ?? ''}`)) {
      console.warn('storage: could not create the bucket (it may already exist):', error.message);
    }
  })();
  return bucketReady;
}

// Detect real image type from magic bytes (never trust the client MIME type or file name).
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

const hint = (sub) => (sub === 'proofs' ? ' You can enter the transaction ID instead.' : '');

/** Returns { name, mime } on success, or { error, status } (never throws). */
export async function saveImage(file, sub) {
  if (!file || typeof file.arrayBuffer !== 'function') return { error: 'No file provided.', status: 400 };
  if (file.size > MAX_BYTES) return { error: 'Image is too large (max 5 MB).', status: 400 };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) return { error: 'Only JPG, PNG or WebP images are allowed.', status: 400 };
  const name = `${crypto.randomUUID()}.${type.ext}`;
  const backend = storageBackend();

  try {
    if (backend === 'unavailable') {
      console.error('storage: image uploads are not set up on this server. Set SUPABASE_SERVICE_ROLE_KEY (Supabase Storage) or STORAGE_DIR (persistent disk).');
      return { error: `Photo upload is not available right now.${hint(sub)}`, status: 503 };
    }
    if (backend === 'supabase') {
      const put = () => sb().storage.from(BUCKET).upload(`${sub}/${name}`, buf, { contentType: type.mime, upsert: false });
      await ensureBucket();
      let { error } = await put();
      if (error && /bucket not found/i.test(error.message || '')) { bucketReady = undefined; await ensureBucket(); ({ error } = await put()); }
      if (error) throw Object.assign(new Error(error.message), { code: error.statusCode || error.status });
    } else {
      const dir = path.join(STORAGE_DIR, sub);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, name), buf);
    }
    return { name, mime: type.mime };
  } catch (err) {
    console.error('storage: saving the image failed:', { backend, code: err?.code, message: err?.message });
    return { error: `We could not save the image right now. Please try again.${hint(sub)}`, status: 503 };
  }
}

export async function readImage(sub, name) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name)) return null;
  try {
    let buf;
    if (storageBackend() === 'supabase') {
      const { data, error } = await sb().storage.from(BUCKET).download(`${sub}/${name}`);
      if (error || !data) return null;
      buf = Buffer.from(await data.arrayBuffer());
    } else {
      buf = await fs.readFile(path.join(STORAGE_DIR, sub, name));
    }
    const type = sniff(buf);
    return type ? { buf, mime: type.mime } : null;
  } catch {
    return null;
  }
}
