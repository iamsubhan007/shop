import { NextResponse } from 'next/server';
import { tokenOk } from '@/lib/server/token';
import { backupDue, runBackup } from '@/lib/server/backup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Called by a scheduler (Vercel Cron, cron-job.org, Windows Task Scheduler...) with `Authorization: Bearer $CRON_SECRET`.
// Runs a backup only when one is due according to Settings (use ?force=1 to override).
export async function GET(request) {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!tokenOk(bearer, process.env.CRON_SECRET)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  const force = new URL(request.url).searchParams.get('force') === '1';
  if (!force && !(await backupDue())) return NextResponse.json({ skipped: true });
  const r = await runBackup('scheduled');
  return NextResponse.json({ ok: r.ok, error: r.error });
}
