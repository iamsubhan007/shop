// Optional: copies new backups from the live site to a folder on the owner's PC.
// The database itself is never exposed; this only downloads backup files using a secret sync token.
//
//   set BACKUP_SITE_URL=https://your-site.pk
//   set BACKUP_SYNC_TOKEN=<same value as the server's BACKUP_SYNC_TOKEN>
//   set BACKUP_LOCAL_DIR=D:\HBT-Backups
//   node scripts/sync-backups.mjs
//
// Schedule it with Windows Task Scheduler (e.g. daily). Safe to run repeatedly: existing files are skipped.
import fs from 'node:fs/promises';
import path from 'node:path';

const site = (process.env.BACKUP_SITE_URL || '').replace(/\/$/, '');
const token = process.env.BACKUP_SYNC_TOKEN;
const dir = process.env.BACKUP_LOCAL_DIR || './hbt-backups';
if (!site || !token) {
  console.error('Set BACKUP_SITE_URL and BACKUP_SYNC_TOKEN.');
  process.exit(2);
}
const headers = { Authorization: `Bearer ${token}` };
await fs.mkdir(dir, { recursive: true });

const res = await fetch(`${site}/api/backup-sync`, { headers });
if (!res.ok) { console.error(`List failed: HTTP ${res.status}`); process.exit(1); }
const { files } = await res.json();
let got = 0;
for (const f of files) {
  const dest = path.join(dir, f.name);
  if (await fs.stat(dest).then(() => true, () => false)) continue;
  const r = await fetch(`${site}/api/backup-sync?file=${encodeURIComponent(f.name)}`, { headers });
  if (!r.ok) { console.error(`Skipped ${f.name}: HTTP ${r.status}`); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest + '.part', buf);
  await fs.rename(dest + '.part', dest);
  got++;
  console.log('Downloaded', f.name);
}
console.log(`Done. ${got} new, ${files.length - got} already present. Folder: ${path.resolve(dir)}`);
