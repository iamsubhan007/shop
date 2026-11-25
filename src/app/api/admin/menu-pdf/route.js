import { z } from 'zod';
import { audit } from '@/lib/server/audit';
import { menuPdfAdminRoute } from '@/lib/server/menuPdf/http';
import { menuPdfOverview, uploadMenuPdf } from '@/lib/server/menuPdf/admin';
import { activateMenuVersion, getMenuPdfState, StateError, switchToAutomaticMenu } from '@/lib/server/menuPdf/state';
import { readMenuFile } from '@/lib/server/menuPdf/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = menuPdfAdminRoute(() => menuPdfOverview());

/** Upload a PDF (multipart: file, activate=true|false). */
export const POST = menuPdfAdminRoute(async (request, { staff }) => {
  const form = await request.formData().catch(() => null);
  if (!form) throw new StateError('Choose a PDF file (the upload may have been too large).', 400);
  const file = await uploadMenuPdf(staff, form.get('file'), { activate: form.get('activate') === 'true' });
  return { success: true, id: file.id, ...(await menuPdfOverview()) };
});

const change = z.discriminatedUnion('action', [
  z.object({ action: z.literal('activate'), id: z.string().uuid() }),
  z.object({ action: z.literal('automatic') }),
]);

/** Publish an uploaded PDF, or go back to the automatically generated menu. */
export const PATCH = menuPdfAdminRoute(async (request, { staff }) => {
  const body = change.safeParse(await request.json().catch(() => null));
  if (!body.success) throw new StateError('Invalid request.', 400);
  if (body.data.action === 'activate') {
    // Never publish a file that is not really there.
    const file = (await getMenuPdfState()).files.find((f) => f.id === body.data.id);
    if (!file || (await readMenuFile(file.name)) === null) throw new StateError('That PDF file is missing from storage. Upload it again.', 404);
    const r = await activateMenuVersion(body.data.id);
    await audit(staff, 'menu_pdf.activate', 'menu_pdf', body.data.id, { source: r.before.source, activeId: r.before.activeId }, { source: 'custom' });
  } else {
    const r = await switchToAutomaticMenu();
    await audit(staff, 'menu_pdf.automatic', 'menu_pdf', 'menu_pdf', { source: r.before.source, activeId: r.before.activeId }, { source: 'auto' });
  }
  return { success: true, ...(await menuPdfOverview()) };
});
