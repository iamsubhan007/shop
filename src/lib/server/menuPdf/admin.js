import 'server-only';
import crypto from 'node:crypto';
import { audit } from '@/lib/server/audit';
import { storageBackend } from '@/lib/server/storage';
import { PROXY_MAX_BYTES } from '@/lib/server/storageFiles';
import { checkPdf, MAX_PDF_BYTES, safeOriginalName } from '@/lib/menuPdf/validate';
import { getPrintableMenu } from './data';
import { MENU_FILE_RE, newMenuFileName, readMenuFile, removeMenuFile, saveMenuFile, signedMenuUploadUrl } from './files';
import { activeFile, addMenuVersion, getMenuPdfState, StateError } from './state';

// Managing uploaded menu PDFs. Callers have already checked that the person is an owner or admin.

/** Everything the admin page shows. Storage names are not sent: files are addressed by id. */
export async function menuPdfOverview() {
  const [state, data] = await Promise.all([getMenuPdfState(), getPrintableMenu()]);
  const backend = storageBackend();
  const active = activeFile(state);
  let activeFileMissing = false;
  if (active && backend !== 'unavailable') {
    try {
      activeFileMissing = (await readMenuFile(active.name)) === null;
    } catch {
      activeFileMissing = false;
    }
  }
  return {
    source: state.source,
    activeId: state.activeId,
    activeFileMissing,
    files: state.files.map((f) => ({ id: f.id, original: f.original, size: f.size, uploadedAt: f.uploadedAt, uploadedBy: f.uploadedBy, active: f.id === state.activeId })),
    maxBytes: MAX_PDF_BYTES,
    storage: backend,
    // Above this size a Supabase upload goes straight from the browser to storage (Vercel limits request bodies).
    directUploadAbove: backend === 'supabase' ? PROXY_MAX_BYTES : null,
    auto: { categories: data.categories.length, items: data.categories.reduce((n, c) => n + c.items.length, 0), deals: data.deals.length },
  };
}

/** Records a file that is already in storage. If recording fails, the file is removed and nothing changes. */
async function register(actor, { name, original, size }, activate) {
  const file = { id: crypto.randomUUID(), name, original: safeOriginalName(original), size, uploadedAt: new Date().toISOString(), uploadedBy: actor.email };
  let result;
  try {
    result = await addMenuVersion(file, { activate });
  } catch (e) {
    await removeMenuFile(name);
    throw e;
  }
  await Promise.all(result.dropped.map((f) => removeMenuFile(f.name)));
  await audit(actor, activate ? 'menu_pdf.upload_activate' : 'menu_pdf.upload', 'menu_pdf', file.id, { source: result.before.source }, { file: file.original, size, source: result.state.source });
  return file;
}

/** A file sent through the server. */
export async function uploadMenuPdf(actor, upload, { activate }) {
  if (!upload || typeof upload.arrayBuffer !== 'function') throw new StateError('Choose a PDF file.', 400);
  if (upload.size > MAX_PDF_BYTES) throw new StateError(checkPdf({ length: upload.size }), 400);
  const buf = Buffer.from(await upload.arrayBuffer());
  const problem = checkPdf(buf, { name: upload.name, type: upload.type });
  if (problem) throw new StateError(problem, 400);
  const name = newMenuFileName();
  await saveMenuFile(name, buf);
  return register(actor, { name, original: upload.name, size: buf.length }, activate);
}

/** For a large file: a link for the browser to upload it to storage; `commitDirectUpload` then checks it. */
export async function startDirectUpload({ originalName, size }) {
  if (storageBackend() !== 'supabase') throw new StateError('Direct upload is not used on this server.');
  if (!/\.pdf$/i.test(String(originalName || ''))) throw new StateError('Choose a file whose name ends in .pdf.', 400);
  if (!(Number(size) > 0) || Number(size) > MAX_PDF_BYTES) throw new StateError(checkPdf({ length: Number(size) || 0 }) || 'Invalid file size.', 400);
  const name = newMenuFileName();
  return { name, uploadUrl: await signedMenuUploadUrl(name) };
}

export async function commitDirectUpload(actor, { name, originalName }, { activate }) {
  if (!MENU_FILE_RE.test(String(name || ''))) throw new StateError('Unknown upload.', 400);
  const state = await getMenuPdfState();
  if (state.files.some((f) => f.name === name)) throw new StateError('That upload was already saved.');
  const buf = await readMenuFile(name);
  if (!buf) throw new StateError('The upload did not arrive. Please try again.', 404);
  const problem = checkPdf(buf);
  if (problem) {
    await removeMenuFile(name);
    throw new StateError(problem, 400);
  }
  return register(actor, { name, original: originalName, size: buf.length }, activate);
}
