// Plain-Node backup/restore core (no Next.js imports) so the app AND the CLI scripts share it.
// Format: gzip'd JSON { version, createdAt, tables: { name: [rows] } }. Restored with jsonb_populate_recordset,
// so column types round-trip exactly. Sessions, OTP codes and rate limits are intentionally NOT backed up.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Parents first, so restore satisfies foreign keys.
export const BACKUP_TABLES = [
  'profiles', 'categories', 'products', 'deals', 'shop_settings', 'deal_items', 'coupons', 'orders', 'order_items',
  'payment_submissions', 'order_status_history', 'notifications', 'stock_movements', 'customer_addresses',
  'wishlist', 'cart_items', 'business_days', 'audit_logs', 'backups',
];

export async function dumpToFile(sql, dir) {
  await fs.mkdir(dir, { recursive: true });
  const tables = {};
  let rows = 0;
  await sql.begin('isolation level repeatable read read only', async (tx) => {
    for (const t of BACKUP_TABLES) {
      // to_jsonb keeps full timestamp precision (JS Dates would truncate microseconds).
      tables[t] = (await tx.unsafe(`select to_jsonb(x) as r from "${t}" x`)).map((row) => row.r);
      rows += tables[t].length;
    }
  });
  const buf = await gzip(Buffer.from(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), tables })));
  const filename = `hbt-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
  await fs.writeFile(path.join(dir, filename), buf);
  return { filename, sizeBytes: buf.length, rows };
}

export async function restoreFromFile(sql, file) {
  const data = JSON.parse((await gunzip(await fs.readFile(file))).toString());
  if (data.version !== 1) throw new Error('Unsupported backup version');
  // Refuse to touch a database that already has data.
  for (const t of ['orders', 'products', 'profiles']) {
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from "${t}"`);
    if (n > 0) throw new Error(`Target database is not empty ("${t}" has rows). Restore into a fresh database after running migrations.`);
  }
  let total = 0;
  await sql.begin(async (tx) => {
    for (const t of BACKUP_TABLES) {
      const rows = data.tables[t] || [];
      if (!rows.length) continue;
      await tx`insert into ${tx(t)} select * from jsonb_populate_recordset(null::${tx(t)}, ${tx.json(rows)})`;
      total += rows.length;
    }
  });
  return { tables: Object.fromEntries(BACKUP_TABLES.map((t) => [t, (data.tables[t] || []).length])), total };
}

export async function pruneBackups(dir, keep) {
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.startsWith('hbt-backup-')).sort().reverse();
  const old = files.slice(Math.max(1, keep));
  for (const f of old) await fs.unlink(path.join(dir, f)).catch(() => {});
  return old;
}
