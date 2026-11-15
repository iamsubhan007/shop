import { NextResponse, after } from 'next/server';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requireStaff } from '@/lib/server/guard';
import { backupDue, runBackup } from '@/lib/server/backup';
import { listBackupFiles } from '@/lib/server/storageFiles';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Backups hold all customer data: owner and admin only (the people who are warned when storage is filling up).
export async function GET(request) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  // Opportunistic schedule: an owner visiting this page also triggers a due backup.
  if (await backupDue()) after(() => runBackup('scheduled'));
  const rows = await db.select().from(schema.backups).orderBy(desc(schema.backups.createdAt)).limit(50);
  // `available`: the file is still in storage (older ones are removed by the retention setting), so the page can hide dead Download links.
  const present = new Set((await listBackupFiles()).map((f) => f.name));
  return NextResponse.json({ backups: rows.map((b) => ({ ...b, available: !!b.filename && present.has(b.filename) })) });
}

export async function POST(request) {
  const g = await requireStaff(request, ['owner', 'admin']);
  if (g.error) return g.error;
  const r = await runBackup('manual', g.staff);
  if (!r.ok) return NextResponse.json({ error: `Backup failed: ${r.error}` }, { status: 500 });
  return NextResponse.json({ success: true, backup: r.backup });
}
