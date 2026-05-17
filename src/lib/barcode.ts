import {
  BarcodeDetector,
  prepareZXingModule,
} from "barcode-detector/ponyfill";
import type { OcrWord } from "./types";
import {
  extractTrackingToken,
  normalizeTracking,
  trackingNumbersMatch,
} from "./tracking";

export interface BarcodeVerification {
  barcode: string | null;
  printedNumber: string | null;
  match: boolean | null;
  status: string;
}

export interface BarcodeDecodeResult {
  value: string;
  bottomY: number;
  leftX: number;
  rightX: number;
}

let detector: BarcodeDetector | null = null;
let wasmReady: Promise<void> | null = null;

export function prepareBarcodeEngine(): Promise<void> {
  wasmReady ??= Promise.resolve(prepareZXingModule()).then(() => undefined);
  return wasmReady;
}

async function getDetector(): Promise<BarcodeDetector> {
  await prepareBarcodeEngine();
  if (!detector) {
    detector = new BarcodeDetector({
      formats: [
        "code_128",
        "code_39",
        "ean_13",
        "itf",
        "codabar",
      ],
    });
  }
  return detector;
}

function resultFromDetection(
  codes: DetectedBarcodeLike[],
): BarcodeDecodeResult | null {
  if (!codes.length) return null;

  const best =
    codes.find((c) => c.format === "code_128") ??
    codes.find((c) => c.format === "code_39") ??
    codes[0];

  const text = best.rawValue?.trim();
  if (!text) return null;

  const box = best.boundingBox;
  return {
    value: normalizeTracking(text),
    bottomY: box.y + box.height,
    leftX: box.x,
    rightX: box.x + box.width,
  };
}

interface DetectedBarcodeLike {
  rawValue: string;
  format: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

async function detectOnCanvas(
  canvas: HTMLCanvasElement,
): Promise<BarcodeDecodeResult | null> {
  if (canvas.width < 8 || canvas.height < 8) return null;

  const det = await getDetector();
  const bitmap = await createImageBitmap(canvas);
  try {
    const codes = await det.detect(bitmap);
    return resultFromDetection(codes as DetectedBarcodeLike[]);
  } finally {
    bitmap.close();
  }
}

/** Decode 1D barcode from a canvas (ZXing C++ via WASM — works on photos). */
export async function decodeBarcode(
  canvas: HTMLCanvasElement,
): Promise<BarcodeDecodeResult | null> {
  return detectOnCanvas(canvas);
}

export function findPrintedNumberBelowBarcode(
  words: OcrWord[],
  barcode: BarcodeDecodeResult | null,
  labelHeight: number,
): string | null {
  const candidates: { text: string; score: number }[] = [];

  for (const w of words) {
    const token = extractTrackingToken(w.text);
    if (!token) continue;

    let score = 10;
    if (barcode) {
      const below = w.bbox.y0 >= barcode.bottomY - 8;
      const notTooFar = w.bbox.y0 <= barcode.bottomY + labelHeight * 0.2;
      const xOverlap =
        w.bbox.x1 >= barcode.leftX - 40 && w.bbox.x0 <= barcode.rightX + 40;
      if (below && notTooFar && xOverlap) score += 100;
      else if (below && notTooFar) score += 50;
    } else if (w.bbox.y0 < labelHeight * 0.55) {
      score += 20;
    }
    candidates.push({ text: token, score });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].text;
}

export function verifyBarcode(
  barcode: BarcodeDecodeResult | null,
  printed: string | null,
): BarcodeVerification {
  const barcodeValue = barcode?.value ?? null;

  if (!barcodeValue && !printed) {
    return { barcode: null, printedNumber: null, match: null, status: "Not detected" };
  }
  if (!barcodeValue) {
    return { barcode: null, printedNumber: printed, match: null, status: "Barcode not read" };
  }
  if (!printed) {
    return { barcode: barcodeValue, printedNumber: null, match: null, status: "Printed number not read" };
  }

  const match = trackingNumbersMatch(barcodeValue, printed);
  return {
    barcode: barcodeValue,
    printedNumber: printed,
    match,
    status: match ? "Match" : "Mismatch",
  };
}
