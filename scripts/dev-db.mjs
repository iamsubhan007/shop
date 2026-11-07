// Local development Postgres (real Postgres via embedded-postgres). Data lives in .localdb/ (gitignored).
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'fs';

const dir = '.localdb';
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'hbt',
  password: 'hbt_local_dev',
  port: 54329,
  persistent: true,
});
if (!fs.existsSync(`${dir}/PG_VERSION`)) await pg.initialise();
await pg.start();
try { await pg.createDatabase('hbt'); } catch {}
console.log('Local Postgres ready: postgresql://hbt:hbt_local_dev@localhost:54329/hbt');
const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
