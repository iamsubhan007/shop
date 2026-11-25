import 'server-only';
import { NextResponse } from 'next/server';
import { PROXY_MAX_BYTES } from '@/lib/server/storageFiles';
import { menuFileName } from '@/lib/menuPdf/normalize';
import { shopDay } from '@/lib/shopTime';
import { getSettings } from '@/lib/server/settings';
import { getPrintableMenu } from './data';
import { renderMenuPdf } from './render';
import { activeFile, getMenuPdfState } from './state';
import { readMenuFile, signedMenuUrl } from './files';

// The one place that decides what "the menu PDF" is. The website and the mobile app both download it from
// /api/menu/pdf, so they always get the same file.

export const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate', Pragma: 'no-cache' };

export function pdfResponse(buf, { filename, source, inline = false }) {
  return new NextResponse(buf, {
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Content-Length': String(buf.length),
      'X-Content-Type-Options': 'nosniff',
      'X-Menu-Source': source,
    },
  });
}

export async function automaticMenuPdf() {
  const data = await getPrintableMenu();
  return { buf: await renderMenuPdf(data), filename: menuFileName(data.restaurant.name, data.day), source: 'auto' };
}

/** An uploaded file as a response: small ones pass through, big ones are handed over by a one-minute storage link. */
export async function uploadedPdfResponse(file, { filename, inline = false }) {
  if (file.size > PROXY_MAX_BYTES) {
    const url = await signedMenuUrl(file.name, inline ? {} : { download: filename });
    if (url) return new NextResponse(null, { status: 302, headers: { ...NO_STORE, Location: url, 'X-Menu-Source': 'custom' } });
  }
  const buf = await readMenuFile(file.name);
  return buf ? pdfResponse(buf, { filename, source: 'custom', inline }) : null;
}

/** The active menu: the custom PDF when one is active, otherwise generated from the live database. */
export async function activeMenuResponse() {
  const custom = activeFile(await getMenuPdfState());
  if (custom) {
    const { shop } = await getSettings();
    const response = await uploadedPdfResponse(custom, { filename: menuFileName(shop.name, shopDay()) });
    if (response) return response;
    // Better a correct generated menu than no menu; the admin page shows that the file is missing.
    console.error('menu pdf: the active custom file is missing from storage; serving the generated menu', custom.name);
  }
  const auto = await automaticMenuPdf();
  return pdfResponse(auto.buf, auto);
}
