import type { BarcodeDecodeResult } from "./barcode";

/** Barcode + position locked during live preview before burst capture. */
export interface LockedScanContext {
  barcode: BarcodeDecodeResult;
  triggerFrame?: HTMLCanvasElement;
}
