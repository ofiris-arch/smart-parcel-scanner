import { decodeBarcode, prepareBarcodeEngine } from "./barcode";

export interface BarcodeCaptureResult {
  barcode: string;
  processingMs: number;
}

function cropBand(
  source: HTMLCanvasElement,
  topFraction: number,
  heightFraction: number,
): HTMLCanvasElement {
  const sy = Math.round(source.height * topFraction);
  const sh = Math.max(1, Math.round(source.height * heightFraction));
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = sh;
  out.getContext("2d")!.drawImage(
    source,
    0,
    sy,
    source.width,
    sh,
    0,
    0,
    out.width,
    out.height,
  );
  return out;
}

function upscale(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * factor));
  out.height = Math.max(1, Math.round(canvas.height * factor));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = factor > 1;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/** Higher contrast for thin bars on glossy / wrinkled labels. */
function enhanceForBarcode(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(2) brightness(1.05)";
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/**
 * Try multiple crops and scales. Uses ZXing C++ WASM (not legacy @zxing/library RGBA).
 */
export async function captureBarcodeFromFrame(
  frame: HTMLCanvasElement,
): Promise<BarcodeCaptureResult | null> {
  await prepareBarcodeEngine();
  const start = performance.now();

  const bands = [0, 0.06, 0.12, 0.18, 0.24];
  const bandH = 0.38;

  const candidates: HTMLCanvasElement[] = [frame, enhanceForBarcode(frame)];

  for (const top of bands) {
    const band = cropBand(frame, top, bandH);
    candidates.push(band, enhanceForBarcode(band));
    candidates.push(upscale(band, 2));
    candidates.push(upscale(enhanceForBarcode(band), 2));
  }

  candidates.push(upscale(cropBand(frame, 0, 0.55), 2));

  for (const canvas of candidates) {
    const hit = await decodeBarcode(canvas);
    if (hit?.value) {
      return {
        barcode: hit.value,
        processingMs: Math.round(performance.now() - start),
      };
    }
  }

  return null;
}
