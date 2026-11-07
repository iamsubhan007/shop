// Proves a backup restores correctly: restores a backup file into a throwaway database and compares every table
// to the live data (row count + content hash). Usage: node --env-file=.env.local scripts/verify-restore.mjs <backup.json.gz>
// Take the backup right before running this (data that changed afterwards will legitimately differ).
import postgres from 'postgres';
import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file) { console.error('Usage: node --env-file=.env.local scripts/verify-restore.mjs <backup.json.gz>'); process.exit(2); }
const liveUrl = process.env.DATABASE_URL;
const base = liveUrl.replace(/\/[^/]+$/, '');
const live = postgres(liveUrl, { prepare: false });
const admin = postgres(`${base}/postgres`, { prepare: false });
const scratchName = `hbt_restore_test_${Date.now()}`;
const scratch = `${base}/${scratchName}`;
await admin.unsafe(`create database ${scratchName}`);
const env = { ...process.env, DATABASE_URL: scratch };
const run = (args) => {
  try { return execFileSync(process.execPath, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return `EXIT ${e.status} ${e.stdout}${e.stderr}`; }
};
let ok = true;
try {
  const mig = run(['node_modules/drizzle-kit/bin.cjs', 'migrate']);
  console.log('migrate scratch DB:', mig.includes('applied successfully') ? 'ok' : `FAILED\n${mig}`);
  console.log(run(['scripts/restore.mjs', file, scratch]).trim().split('\n')[0]);
  console.log('second restore into same DB (must refuse):', run(['scripts/restore.mjs', file, scratch]).trim().split('\n')[0]);
  const dst = postgres(scratch, { prepare: false });
  const tables = ['profiles', 'categories', 'products', 'deals', 'deal_items', 'coupons', 'orders', 'order_items', 'payment_submissions', 'order_status_history', 'notifications', 'stock_movements', 'shop_settings', 'business_days', 'audit_logs'];
  for (const t of tables) {
    const q = `select count(*)::int n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') h from "${t}" x`;
    const [a] = await live.unsafe(q);
    const [b] = await dst.unsafe(q);
    const same = a.n === b.n && a.h === b.h;
    ok &&= same;
    console.log(`${same ? 'MATCH' : 'DIFF '} ${t.padEnd(22)} ${a.n} rows`);
  }
  await dst.end();
  console.log(ok ? 'RESTORE VERIFIED: every table identical to the live data' : 'RESTORE MISMATCH');
} finally {
  await live.end();
  await admin.unsafe(`drop database if exists ${scratchName} with (force)`).catch((e) => console.error('cleanup:', e.message));
  await admin.end();
}
process.exit(ok ? 0 : 1);
