import { decodeBarcode, prepareBarcodeEngine, type BarcodeDecodeResult } from "./barcode";
import { captureBarcodeFromFrame } from "./captureBarcode";
import {
  cropFrameRegion,
  enhanceContrast,
  GUIDE_BARCODE,
  upscaleCanvas,
} from "./frameCrop";

function mapBarcodeToFrame(
  hit: BarcodeDecodeResult,
  region: { x: number; y: number; w: number; h: number },
  crop: HTMLCanvasElement,
  frame: HTMLCanvasElement,
): BarcodeDecodeResult {
  const ox = frame.width * region.x;
  const oy = frame.height * region.y;
  const scaleX = crop.width > 0 ? (frame.width * region.w) / crop.width : 1;
  const scaleY = crop.height > 0 ? (frame.height * region.h) / crop.height : 1;
  return {
    value: hit.value,
    bottomY: oy + hit.bottomY * scaleY,
    leftX: ox + hit.leftX * scaleX,
    rightX: ox + hit.rightX * scaleX,
  };
}

async function tryCanvases(
  canvases: HTMLCanvasElement[],
  frame: HTMLCanvasElement,
  region: typeof GUIDE_BARCODE,
  crop: HTMLCanvasElement,
): Promise<BarcodeDecodeResult | null> {
  for (const canvas of canvases) {
    const hit = await decodeBarcode(canvas);
    if (hit?.value) return mapBarcodeToFrame(hit, region, crop, frame);
  }
  return null;
}

/**
 * Decode barcode — guide ROI first, then multi-crop fallback on guide + full frame.
 */
export async function decodeBarcodeFromFrame(
  frame: HTMLCanvasElement,
  options?: { aggressive?: boolean },
): Promise<BarcodeDecodeResult | null> {
  await prepareBarcodeEngine();

  const guide = cropFrameRegion(frame, GUIDE_BARCODE);
  const guide2x = upscaleCanvas(guide, 2);
  const guideEnhanced = enhanceContrast(guide);

  const quick = await tryCanvases(
    [guide, guide2x, guideEnhanced, enhanceContrast(guide2x)],
    frame,
    GUIDE_BARCODE,
    guide,
  );
  if (quick) return quick;

  if (!options?.aggressive) return null;

  const guideFallback = await captureBarcodeFromFrame(guide);
  if (guideFallback) {
    return mapBarcodeToFrame(
      {
        value: guideFallback.barcode,
        bottomY: guide.height * 0.85,
        leftX: guide.width * 0.05,
        rightX: guide.width * 0.95,
      },
      GUIDE_BARCODE,
      guide,
      frame,
    );
  }

  const full = await captureBarcodeFromFrame(frame);
  return full
    ? {
        value: full.barcode,
        bottomY: frame.height * 0.35,
        leftX: frame.width * 0.1,
        rightX: frame.width * 0.9,
      }
    : null;
}
