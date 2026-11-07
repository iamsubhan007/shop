import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { tokenOk } from '@/lib/server/token';
import { BACKUP_DIR } from '@/lib/server/backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Used only by scripts/sync-backups.mjs on the owner's PC. Authenticated with BACKUP_SYNC_TOKEN (separate from staff logins).
// GET            -> list of available backup files
// GET ?file=NAME -> download that file
export async function GET(request) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!tokenOk(bearer, process.env.BACKUP_SYNC_TOKEN)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  const file = new URL(request.url).searchParams.get('file');
  if (!file) {
    const rows = await db.select().from(schema.backups).where(eq(schema.backups.status, 'success')).orderBy(desc(schema.backups.createdAt)).limit(100);
    return NextResponse.json({ files: rows.filter((r) => r.filename).map((r) => ({ name: r.filename, size: r.sizeBytes, createdAt: r.createdAt })) });
  }
  if (!/^hbt-backup-[\w.-]+\.json\.gz$/.test(file)) return NextResponse.json({ error: 'Bad file name.' }, { status: 400 });
  const buf = await fs.readFile(path.join(BACKUP_DIR, file)).catch(() => null);
  if (!buf) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/gzip', 'Cache-Control': 'no-store' } });
}
