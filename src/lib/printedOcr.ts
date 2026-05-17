import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  cropFrameRegion,
  enhanceContrast,
  GUIDE_BARCODE_AND_PRINTED,
  upscaleCanvas,
} from "./frameCrop";
import type { OcrWord } from "./types";
import {
  extractTrackingToken,
  normalizeTracking,
  pickTokenMatchingBarcode,
  trackingNumbersMatch,
} from "./tracking";
import type { BarcodeDecodeResult } from "./barcode";
import { findPrintedNumberBelowBarcode } from "./barcode";
import { detectTextNative } from "./shapeText";

const MAX_OCR_WIDTH = 420;

let printedWorkerPromise: Promise<Worker> | null = null;

export interface PrintedOcrResult {
  printed: string | null;
  ocrConfidence: number;
  engine: "native" | "tesseract" | "barcode_anchor" | "none";
  tessPasses: number;
  rawLine?: string;
}

export async function preparePrintedOcr(): Promise<void> {
  await getPrintedWorker();
}

async function getPrintedWorker(): Promise<Worker> {
  if (!printedWorkerPromise) {
    printedWorkerPromise = (async () => {
      const worker = await createWorker("eng", 1, { logger: () => {} });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      });
      return worker;
    })();
  }
  return printedWorkerPromise;
}

function limitOcrWidth(canvas: HTMLCanvasElement): HTMLCanvasElement {
  if (canvas.width <= MAX_OCR_WIDTH) return canvas;
  const scale = MAX_OCR_WIDTH / canvas.width;
  const out = document.createElement("canvas");
  out.width = MAX_OCR_WIDTH;
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function prepareStrip(canvas: HTMLCanvasElement): HTMLCanvasElement {
  return limitOcrWidth(enhanceContrast(upscaleCanvas(canvas, 2)));
}

async function recognizePrintedCanvas(
  canvas: HTMLCanvasElement,
): Promise<OcrWord[]> {
  const worker = await getPrintedWorker();
  const { data } = await worker.recognize(canvas);
  const words: OcrWord[] = [];

  const lines = (data as {
    lines?: { text: string; bbox: OcrWord["bbox"]; confidence: number }[];
  }).lines;
  if (lines?.length) {
    for (const line of lines) {
      if (!line.text?.trim()) continue;
      words.push({
        text: line.text,
        bbox: line.bbox,
        confidence: line.confidence,
      });
    }
  } else if (data.text?.trim()) {
    words.push({
      text: data.text,
      bbox: { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height },
      confidence: data.confidence,
    });
  }

  return words;
}

function rawConfidence(words: OcrWord[]): number {
  if (words.length === 0) return 0;
  return Math.round(
    words.reduce((s, w) => s + w.confidence, 0) / words.length,
  );
}

/** Tesseract often reports 10–30% on clear text; use match quality for display. */
function displayConfidence(
  barcode: BarcodeDecodeResult | null,
  printed: string | null,
  rawConf: number,
): number {
  if (!printed) return rawConf;
  if (barcode && normalizeTracking(printed) === normalizeTracking(barcode.value)) {
    return 100;
  }
  if (barcode && trackingNumbersMatch(barcode.value, printed)) {
    return Math.max(rawConf, 92);
  }
  return rawConf;
}

function wordsToPrinted(
  words: OcrWord[],
  barcode: BarcodeDecodeResult | null,
  labelHeight: number,
): { printed: string | null; ocrConfidence: number; rawLine: string } {
  const rawLine = words.map((w) => w.text).join(" ").trim();
  const rawConf = rawConfidence(words);

  if (barcode) {
    const want = normalizeTracking(barcode.value);
    const compact = rawLine.replace(/\s/g, "").toUpperCase();
    if (want.length >= 8 && compact.includes(want)) {
      return {
        printed: want,
        ocrConfidence: 100,
        rawLine,
      };
    }
  }

  let printed: string | null = null;
  if (barcode) {
    printed = pickTokenMatchingBarcode(rawLine, barcode.value);
  }
  if (!printed) {
    printed = findPrintedNumberBelowBarcode(words, barcode, labelHeight);
  }
  if (!printed) {
    printed = extractTrackingToken(rawLine);
  }

  if (printed && barcode && !trackingNumbersMatch(barcode.value, printed)) {
    printed = null;
  }

  return {
    printed,
    ocrConfidence: displayConfidence(barcode, printed, rawConf),
    rawLine,
  };
}

async function recognizePrintedStrip(
  canvas: HTMLCanvasElement,
  barcode: BarcodeDecodeResult | null,
  labelHeight: number,
  tryNative: boolean,
): Promise<{
  result: { printed: string | null; ocrConfidence: number; rawLine: string };
  engine: PrintedOcrResult["engine"];
  tessPasses: number;
}> {
  if (tryNative) {
    const nativeWords = await detectTextNative(canvas);
    const native = wordsToPrinted(nativeWords, barcode, labelHeight);
    if (native.printed) {
      return { result: native, engine: "native", tessPasses: 0 };
    }
  }

  const tessWords = await recognizePrintedCanvas(canvas);
  const tess = wordsToPrinted(tessWords, barcode, labelHeight);
  if (tess.printed) {
    return { result: tess, engine: "tesseract", tessPasses: 1 };
  }

  return {
    result: tess,
    engine: tessWords.length > 0 ? "tesseract" : "none",
    tessPasses: 1,
  };
}

/**
 * One prepared strip, native → one Tesseract pass (not a hardware issue — WASM CPU).
 */
export async function readPrintedBelowBarcode(
  strip: HTMLCanvasElement,
  barcode: BarcodeDecodeResult,
): Promise<PrintedOcrResult> {
  const primary = prepareStrip(strip);
  const hit = await recognizePrintedStrip(primary, barcode, strip.height, true);

  if (hit.result.printed) {
    return {
      ...hit.result,
      engine: hit.engine,
      tessPasses: hit.tessPasses,
      rawLine: hit.result.rawLine,
    };
  }

  return {
    printed: null,
    ocrConfidence: hit.result.ocrConfidence,
    engine: hit.engine,
    tessPasses: hit.tessPasses,
    rawLine: hit.result.rawLine,
  };
}

export async function readPrintedInGuide(
  frame: HTMLCanvasElement,
): Promise<PrintedOcrResult> {
  const guideBand = cropFrameRegion(frame, GUIDE_BARCODE_AND_PRINTED);
  const primary = prepareStrip(guideBand);
  const hit = await recognizePrintedStrip(primary, null, guideBand.height, true);

  return {
    ...hit.result,
    engine: hit.engine,
    tessPasses: hit.tessPasses,
    rawLine: hit.result.rawLine,
  };
}
