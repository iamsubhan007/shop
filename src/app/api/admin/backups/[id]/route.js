import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { PROXY_MAX_BYTES, readBackupFile, signedBackupUrl } from '@/lib/server/storageFiles';
import { audit } from '@/lib/server/audit';

export const runtime = 'nodejs';

// Backups hold all customer data: owner and admin only. A UUID in the URL that is not a UUID is simply "not found".
export async function GET(request, { params }) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Backup not found.' }, { status: 404 });
  const [b] = await db.select().from(schema.backups).where(eq(schema.backups.id, id));
  if (!b?.filename) return NextResponse.json({ error: 'Backup not found.' }, { status: 404 });

  // A serverless function cannot return more than about 4.5 MB, so a large backup is downloaded straight from storage
  // through a link that works for one minute. Smaller ones (the normal case) are passed through here.
  if (Number(b.sizeBytes) > PROXY_MAX_BYTES) {
    const url = await signedBackupUrl(b.filename);
    if (url) {
      await audit(g.staff, 'backup.download', 'backup', id, null, { filename: b.filename });
      return NextResponse.redirect(url);
    }
  }
  const buf = await readBackupFile(b.filename);
  if (!buf) return NextResponse.json({ error: 'The backup file is no longer in storage (removed by the retention policy).' }, { status: 404 });
  await audit(g.staff, 'backup.download', 'backup', id, null, { filename: b.filename });
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${b.filename}"`, 'Cache-Control': 'no-store' } });
}
