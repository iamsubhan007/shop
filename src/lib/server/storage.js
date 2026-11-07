import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Private storage outside /public. Set STORAGE_DIR to a persistent volume in production.
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'storage');
const MAX_BYTES = 5 * 1024 * 1024;

// Detect real image type from magic bytes (never trust the client MIME type or file name).
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export async function saveImage(file, sub) {
  if (!file || typeof file.arrayBuffer !== 'function') return { error: 'No file provided.' };
  if (file.size > MAX_BYTES) return { error: 'Image is too large (max 5 MB).' };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) return { error: 'Only JPG, PNG or WebP images are allowed.' };
  const name = `${crypto.randomUUID()}.${type.ext}`;
  const dir = path.join(STORAGE_DIR, sub);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buf);
  return { name, mime: type.mime };
}

export async function readImage(sub, name) {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name)) return null;
  try {
    const buf = await fs.readFile(path.join(STORAGE_DIR, sub, name));
    const type = sniff(buf);
    return type ? { buf, mime: type.mime } : null;
  } catch {
    return null;
  }
}
