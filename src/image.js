// Image helpers shared by the service worker and the side panel. Both run in
// contexts that have fetch, createImageBitmap and OffscreenCanvas, so a single
// implementation serves both.

// Vision models read text fine well below their input limit, and a smaller
// picture keeps the request (and the bill) down.
const MAX_SIDE = 2000;
// Anything smaller than this, in screenshot pixels, is a stray click.
const MIN_REGION = 12;

/** Splits `data:image/png;base64,AAA…` into the parts Gemini wants separately. */
export function splitDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Expected a base64 data URL.");
  return { mime: match[1], base64: match[2] };
}

/** FileReader does not exist in a service worker, so base64 the bytes by hand. */
export async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

async function toBitmap(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

async function draw(bitmap, sx, sy, sw, sh, dw, dh) {
  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d");
  // Screenshots of dark pages keep their background; PNG alpha would be lost on
  // some providers, so flatten onto white first.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  bitmap.close?.();
  return blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
}

/** Caps a picture at MAX_SIDE, leaving anything smaller at native resolution. */
export async function fitImage(dataUrl) {
  const bitmap = await toBitmap(dataUrl);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_SIDE) {
    bitmap.close?.();
    return dataUrl;
  }
  const scale = MAX_SIDE / longest;
  return draw(
    bitmap,
    0,
    0,
    bitmap.width,
    bitmap.height,
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale)
  );
}

/**
 * Cuts a CSS-pixel rect out of a screenshot of the visible tab. The screenshot
 * comes back at device resolution, so the scale is recovered from the viewport
 * width the page reported rather than from devicePixelRatio, which browser zoom
 * and pinch zoom both disagree with.
 */
export async function cropRegion(shotDataUrl, rect, viewportWidth) {
  const bitmap = await toBitmap(shotDataUrl);
  const scale = viewportWidth > 0 ? bitmap.width / viewportWidth : 1;

  const x = Math.max(0, Math.round(rect.x * scale));
  const y = Math.max(0, Math.round(rect.y * scale));
  const width = Math.min(bitmap.width - x, Math.round(rect.width * scale));
  const height = Math.min(bitmap.height - y, Math.round(rect.height * scale));

  if (width < MIN_REGION || height < MIN_REGION) {
    bitmap.close?.();
    throw new Error("That area is too small to read — drag across the text.");
  }

  const shrink = Math.min(1, MAX_SIDE / Math.max(width, height));
  return draw(
    bitmap,
    x,
    y,
    width,
    height,
    Math.round(width * shrink),
    Math.round(height * shrink)
  );
}
