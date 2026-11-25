// Checks for an uploaded menu PDF. The file's bytes decide, not its name or the type the browser claims. Pure, so the
// admin page can run the same checks before uploading.

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_VERSIONS = 5;

/** null when the bytes are acceptable, otherwise a message for the person. */
export function checkPdf(bytes, { name, type } = {}) {
  if (!bytes || !bytes.length) return 'The file is empty.';
  if (bytes.length > MAX_PDF_BYTES) return `The PDF is too large (the most allowed is ${MAX_PDF_BYTES / 1024 / 1024} MB).`;
  if (name && !/\.pdf$/i.test(name)) return 'Choose a file whose name ends in .pdf.';
  if (type && !['application/pdf', 'application/x-pdf', 'application/octet-stream'].includes(type)) return 'Only PDF files are allowed.';
  const ascii = (from, to) => Array.from(bytes.subarray(from, to), (b) => String.fromCharCode(b)).join('');
  if (ascii(0, 5) !== '%PDF-') return 'That file is not a PDF.';
  // A complete PDF ends with %%EOF (some tools add a few bytes after it). Without it the upload was cut off.
  if (!ascii(Math.max(0, bytes.length - 2048), bytes.length).includes('%%EOF')) return 'The PDF looks incomplete or damaged. Please export it again.';
  return null;
}

/** The uploader's file name, kept only for display: no folders, no control characters, not endless. */
export function safeOriginalName(value) {
  const base = String(value || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  const name = base.slice(-120) || 'menu.pdf';
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}
