import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { BACKUP_DIR } from '@/lib/server/backup';
import { audit } from '@/lib/server/audit';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const g = await requireStaff(request, ['owner']);
  if (g.error) return g.error;
  const { id } = await params;
  const [b] = await db.select().from(schema.backups).where(eq(schema.backups.id, id));
  if (!b?.filename) return NextResponse.json({ error: 'Backup not found.' }, { status: 404 });
  const file = path.join(BACKUP_DIR, path.basename(b.filename));
  const buf = await fs.readFile(file).catch(() => null);
  if (!buf) return NextResponse.json({ error: 'The backup file is no longer on the server (removed by the retention policy).' }, { status: 404 });
  await audit(g.staff, 'backup.download', 'backup', id, null, { filename: b.filename });
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${b.filename}"`, 'Cache-Control': 'no-store' } });
}
