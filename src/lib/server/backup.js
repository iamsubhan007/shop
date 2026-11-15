import 'server-only';
import { desc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { db, schema } from '@/db';
import { getSettings } from './settings';
import { buildBackup } from './backupCore.mjs';
import { pruneBackupFiles, saveBackupFile } from './storageFiles';
import { audit } from './audit';

function dbUrl() {
  // same normalisation as src/db/index.js
  const v = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  const m = v.match(/^(postgres(?:ql)?):\/\/([^:]+):(.*)@([^@]+)$/);
  if (!m) return v;
  let pass = m[3];
  try { pass = decodeURIComponent(pass); } catch {}
  return `${m[1]}://${m[2]}:${encodeURIComponent(pass)}@${m[4]}`;
}

let running = false;

/** Takes a backup now. Records success or failure; failures never throw to callers. */
export async function runBackup(trigger, actor = null) {
  if (running) return { ok: false, error: 'A backup is already running.' };
  running = true;
  const sql = postgres(dbUrl(), { max: 1, prepare: false });
  try {
    // Backups are kept in the app's file storage (Supabase Storage in production; a Vercel disk is read-only).
    const { filename, buf } = await buildBackup(sql);
    await saveBackupFile(filename, buf);
    const [row] = await db.insert(schema.backups).values({ filename, sizeBytes: buf.length, status: 'success', trigger }).returning();
    const s = await getSettings();
    await pruneBackupFiles(Number(s.backup.keep));
    await audit(actor, 'backup.run', 'backup', row.id, null, { trigger, filename });
    return { ok: true, backup: row };
  } catch (e) {
    const [row] = await db.insert(schema.backups).values({ status: 'failed', error: String(e.message).slice(0, 300), trigger }).returning();
    return { ok: false, error: e.message, backup: row };
  } finally {
    running = false;
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

export async function backupDue() {
  const s = await getSettings();
  if (!s.backup.enabled) return false;
  const [last] = await db.select().from(schema.backups).where(eq(schema.backups.status, 'success')).orderBy(desc(schema.backups.createdAt)).limit(1);
  return !last || Date.now() - new Date(last.createdAt).getTime() >= Number(s.backup.every_hours) * 3600 * 1000;
}
