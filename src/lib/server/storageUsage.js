import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { sendStaffEmail } from '@/lib/email';
import { buildAlertEmail, levelFor, usagePercent } from '@/lib/storageMath';
import { audit } from './audit';
import { getSettings } from './settings';
import { measureFiles } from './storageFiles';

const REMIND_AFTER_MS = 7 * 24 * 3600 * 1000;
const CACHE_MS = 60 * 1000;
let cache = null;

/**
 * How full the hosting plan is: the database (pg_database_size, what the plan's database quota counts) and the stored
 * files (screenshots, pictures, backups). Limits and the warning percentage come from Shop Settings.
 * Cached for a minute so several open admin screens do not each re-measure; pass { fresh: true } to force it.
 */
export async function measureUsage({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const s = await getSettings();
  const st = s.storage;
  const [d] = await db.execute(sql`select pg_database_size(current_database())::float8 as bytes`);
  const files = await measureFiles();
  const dbBytes = Number(d.bytes);
  const dbPercent = usagePercent(dbBytes, st.db_limit_mb);
  const filesPercent = usagePercent(files.totalBytes, st.files_limit_mb);
  const database = { bytes: dbBytes, limitMb: Number(st.db_limit_mb), percent: dbPercent, level: levelFor(dbPercent, st.warn_percent) };
  const filesOut = { ...files, limitMb: Number(st.files_limit_mb), percent: filesPercent, level: levelFor(filesPercent, st.warn_percent) };
  const value = {
    checkedAt: new Date().toISOString(),
    warnPercent: Number(st.warn_percent),
    alerts: !!st.alerts,
    level: Math.max(database.level, filesOut.level),
    database,
    files: filesOut,
  };
  cache = { at: Date.now(), value };
  return value;
}

export const forgetUsage = () => { cache = null; };

/**
 * Measures, and warns the owner and every active admin by email when the plan is filling up.
 * A warning goes out when the level rises (80% -> 90% -> 95%), and again as a weekly reminder while it stays high. When
 * usage falls back under the warning percentage the memory is reset, so the next climb warns again. One row in
 * shop_settings (key storage_alert, locked while deciding) is the memory, so two open screens never send twice.
 * Never throws: monitoring must not break the page or the job that called it.
 */
export async function checkStorageAndAlert({ origin = '', fresh = false } = {}) {
  let usage;
  try {
    usage = await measureUsage({ fresh });
  } catch (e) {
    console.error('storage: measuring usage failed:', e.message);
    return { usage: null, alerted: null };
  }
  try {
    const decision = await db.transaction(async (tx) => {
      await tx.execute(sql`insert into shop_settings (key, value) values ('storage_alert', '{"level":0,"sent_at":null}'::jsonb) on conflict (key) do nothing`);
      const [row] = await tx.execute(sql`select value from shop_settings where key = 'storage_alert' for update`);
      const memory = (typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value) || {}; // raw queries may hand jsonb back as text
      const prev = Number(memory.level) || 0;
      const sentAt = memory.sent_at ? new Date(memory.sent_at).getTime() : 0;
      let next = prev;
      let send = false;
      if (usage.level === 0) next = 0;
      else if (usage.level < prev) next = usage.level; // eased off but still high: a later climb warns again
      else if (usage.alerts && (usage.level > prev || Date.now() - sentAt >= REMIND_AFTER_MS)) { next = usage.level; send = true; }
      if (next !== prev || send) {
        const value = { level: next, sent_at: send ? new Date().toISOString() : memory.sent_at ?? null };
        await tx.execute(sql`update shop_settings set value = ${JSON.stringify(value)}::jsonb, updated_at = now() where key = 'storage_alert'`);
      }
      return { send };
    });
    if (!decision.send) return { usage, alerted: null };

    const people = await db
      .select({ email: schema.profiles.email, role: schema.profiles.role })
      .from(schema.profiles)
      .where(and(eq(schema.profiles.isActive, true), inArray(schema.profiles.role, ['owner', 'admin'])));
    const link = origin ? `${origin}/admin/storage` : '';
    const mail = buildAlertEmail({ usage, link });
    const results = await Promise.allSettled(people.map((p) => sendStaffEmail(p.email, mail)));
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value?.ok).length;
    await audit(null, 'storage.alert', 'storage', String(usage.level), null, {
      level: usage.level, databasePercent: usage.database.percent, filesPercent: usage.files.percent, emailed: sent, recipients: people.length,
    });
    return { usage, alerted: { level: usage.level, emailed: sent, recipients: people.length } };
  } catch (e) {
    console.error('storage: warning check failed:', e.message);
    return { usage, alerted: null };
  }
}
