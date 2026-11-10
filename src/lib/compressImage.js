// Browser-only. Shrinks big photos/screenshots before they are uploaded.
//
// Phone screenshots are often 2-6 MB. Vercel rejects any request body over 4.5 MB before the app even sees it,
// which shows up as a plain "upload failed". A 1600 px JPEG of a payment screenshot is still perfectly readable
// (transaction ID and amount) at roughly 150-400 KB, and uploads far faster on mobile data.
// If anything goes wrong the original file is returned unchanged, so this can never block an upload.

const MAX_SIDE = 1600;
const TARGET_BYTES = 1_200_000;

const loadBitmap = async (file) => {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function prepareImage(file) {
  try {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
    // Already small: leave it alone (a JPEG/WebP under 600 KB, or any image under 250 KB).
    if (file.size <= 250_000 || (file.type !== 'image/png' && file.size <= 600_000)) return file;

    const bmp = await loadBitmap(file);
    const w0 = bmp.width || bmp.naturalWidth;
    const h0 = bmp.height || bmp.naturalHeight;
    if (!w0 || !h0) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * scale));
    canvas.height = Math.max(1, Math.round(h0 * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();

    let quality = 0.82;
    let blob = await toBlob(canvas, 'image/jpeg', quality);
    while (blob && blob.size > TARGET_BYTES && quality > 0.45) {
      quality -= 0.12;
      blob = await toBlob(canvas, 'image/jpeg', quality);
    }
    if (!blob || blob.size >= file.size) return file;
    const base = (file.name || 'image').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
