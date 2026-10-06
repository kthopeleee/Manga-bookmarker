// Shrink a cover image to a small thumbnail before storing it in the repo.

const MAX_WIDTH = 360;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasToBlob(canvas, type, quality) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Resize an image Blob to at most MAX_WIDTH wide.
 * Returns { bytes: Uint8Array, type } — webp when the browser can encode it, else jpeg.
 */
export async function makeThumbnail(blob, maxWidth = MAX_WIDTH) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  let out = await canvasToBlob(canvas, 'image/webp', 0.82);
  if (!out || out.type !== 'image/webp') out = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  return { bytes: new Uint8Array(await out.arrayBuffer()), type: out.type };
}
