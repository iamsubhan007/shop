import { menuPdfAdminRoute } from '@/lib/server/menuPdf/http';
import { automaticMenuPdf, pdfResponse } from '@/lib/server/menuPdf/source';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The automatically generated menu, whatever is currently active. Also the way to check PDF printing works live. */
export const GET = menuPdfAdminRoute(async () => {
  const pdf = await automaticMenuPdf();
  return pdfResponse(pdf.buf, { ...pdf, inline: true });
});
