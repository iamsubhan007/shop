import { z } from 'zod';
import { menuPdfAdminRoute } from '@/lib/server/menuPdf/http';
import { commitDirectUpload, menuPdfOverview, startDirectUpload } from '@/lib/server/menuPdf/admin';
import { StateError } from '@/lib/server/menuPdf/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Large files (Supabase only): 1) POST asks for a one-off upload link, 2) the browser uploads to storage, 3) PUT checks
// the stored file and records it. Nothing changes for customers until step 3 succeeds.

const start = z.object({ originalName: z.string().min(1).max(300), size: z.number().int().positive() });
const commit = z.object({ name: z.string().max(60), originalName: z.string().max(300), activate: z.boolean() });

export const POST = menuPdfAdminRoute(async (request) => {
  const body = start.safeParse(await request.json().catch(() => null));
  if (!body.success) throw new StateError('Invalid request.', 400);
  return startDirectUpload(body.data);
});

export const PUT = menuPdfAdminRoute(async (request, { staff }) => {
  const body = commit.safeParse(await request.json().catch(() => null));
  if (!body.success) throw new StateError('Invalid request.', 400);
  const file = await commitDirectUpload(staff, body.data, { activate: body.data.activate });
  return { success: true, id: file.id, ...(await menuPdfOverview()) };
});
