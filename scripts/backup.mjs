// Manual / scheduled backup from the command line (works on the server where the app and DATABASE_URL live).
// Usage: node --env-file=.env.local scripts/backup.mjs [outputDir]
import postgres from 'postgres';
import { dumpToFile, pruneBackups } from '../src/lib/server/backupCore.mjs';

const raw = (process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
const m = raw.match(/^(postgres(?:ql)?):\/\/([^:]+):(.*)@([^@]+)$/);
const url = m ? `${m[1]}://${m[2]}:${encodeURIComponent(decodeURIComponent(m[3]))}@${m[4]}` : raw;
const dir = process.argv[2] || `${process.env.STORAGE_DIR || './storage'}/backups`;
const sql = postgres(url, { max: 1, prepare: false });
try {
  const r = await dumpToFile(sql, dir);
  await pruneBackups(dir, Number(process.env.BACKUP_KEEP || 14));
  console.log(`Backup written: ${dir}/${r.filename} (${r.rows} rows, ${r.sizeBytes} bytes)`);
} catch (e) {
  console.error('Backup FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
