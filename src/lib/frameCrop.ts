/** Matches BarcodeGuide SVG (viewBox 0–100). */
export const GUIDE_BARCODE = {
  x: 0.06,
  y: 0.22,
  w: 0.88,
  h: 0.28,
} as const;

/** Barcode + tracking text (often above and below the bars on shipping labels). */
export const GUIDE_BARCODE_AND_PRINTED = {
  x: 0.04,
  y: 0.08,
  w: 0.92,
  h: 0.58,
} as const;

export function cropFrameRegion(
  frame: HTMLCanvasElement,
  region: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const sx = Math.round(frame.width * region.x);
  const sy = Math.round(frame.height * region.y);
  const sw = Math.max(1, Math.round(frame.width * region.w));
  const sh = Math.max(1, Math.round(frame.height * region.h));
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  out.getContext("2d")!.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

export function upscaleCanvas(
  canvas: HTMLCanvasElement,
  factor: number,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * factor));
  out.height = Math.max(1, Math.round(canvas.height * factor));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = factor > 1;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export function enhanceContrast(
  canvas: HTMLCanvasElement,
  filter = "grayscale(1) contrast(2.2) brightness(1.08)",
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.filter = filter;
  ctx.drawImage(canvas, 0, 0);
  return out;
}
