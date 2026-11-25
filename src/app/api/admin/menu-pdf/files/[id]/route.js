import { audit } from '@/lib/server/audit';
import { menuPdfAdminRoute } from '@/lib/server/menuPdf/http';
import { menuPdfOverview } from '@/lib/server/menuPdf/admin';
import { deleteMenuVersion, getMenuPdfState, StateError } from '@/lib/server/menuPdf/state';
import { removeMenuFile } from '@/lib/server/menuPdf/files';
import { uploadedPdfResponse } from '@/lib/server/menuPdf/source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Preview any uploaded version, active or not. Owner/admin only: inactive menus are never public. */
export const GET = menuPdfAdminRoute(async (_request, { params }) => {
  const file = (await getMenuPdfState()).files.find((f) => f.id === params.id);
  if (!file) throw new StateError('That PDF no longer exists.', 404);
  const response = await uploadedPdfResponse(file, { filename: `preview-${file.id.slice(0, 8)}.pdf`, inline: true });
  if (!response) throw new StateError('That PDF file is missing from storage.', 404);
  return response;
});

export const DELETE = menuPdfAdminRoute(async (_request, { staff, params }) => {
  const r = await deleteMenuVersion(params.id);
  await removeMenuFile(r.file.name);
  await audit(staff, 'menu_pdf.delete', 'menu_pdf', params.id, { file: r.file.original }, null);
  return { success: true, ...(await menuPdfOverview()) };
});
