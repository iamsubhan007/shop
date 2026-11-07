// Restore a backup into an EMPTY database (run `npm run db:migrate` against it first).
// Usage: node scripts/restore.mjs <backup-file.json.gz> <DATABASE_URL>
import postgres from 'postgres';
import { restoreFromFile } from '../src/lib/server/backupCore.mjs';

const [file, url] = process.argv.slice(2);
if (!file || !url) {
  console.error('Usage: node scripts/restore.mjs <backup-file.json.gz> <DATABASE_URL>');
  process.exit(2);
}
const sql = postgres(url, { max: 1, prepare: false });
try {
  const r = await restoreFromFile(sql, file);
  console.log(`Restored ${r.total} rows.`, r.tables);
} catch (e) {
  console.error('Restore FAILED (nothing was changed):', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
