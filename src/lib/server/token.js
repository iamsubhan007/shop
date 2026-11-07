import 'server-only';
import crypto from 'node:crypto';

export function tokenOk(provided, expected) {
  if (!expected || expected.length < 16 || !provided) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
