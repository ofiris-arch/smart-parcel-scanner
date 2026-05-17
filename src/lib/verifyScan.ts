import { verificationAccuracy } from "./accuracy";
import { decodeBarcodeFromFrame } from "./decodeFrame";
import { logScan } from "./scanLogger";
import {
  verifyBarcode,
  type BarcodeDecodeResult,
  prepareBarcodeEngine,
} from "./barcode";
import { buildScanFields } from "./buildFields";
import {
  readPrintedBelowBarcode,
  readPrintedInGuide,
} from "./printedOcr";
import type { ScanResult } from "./types";

export interface VerifiedScan {
  barcode: string;
  printedNumber: string;
  matched: boolean;
  accuracyPercent: number;
  ocrConfidence: number;
  barcodeDetectionMs: number;
  printedDetectionMs: number;
  processingMs: number;
}

export interface ScanFrameOptions {
  aggressiveBarcode?: boolean;
  /** Default true */
  detectBarcode?: boolean;
  /** Default true */
  detectPrintedNumber?: boolean;
  /** Run OCR only after barcode seen this many frames in a row (default 2). */
  barcodeStableFrames?: number;
}

const MIN_BARCODE_STABLE_FOR_OCR = 2;

export type ScanFrameStatus =
  | { status: "idle" }
  | { status: "no_barcode" }
  | { status: "barcode_locked"; barcode: string; barcodeDetectionMs: number }
  | { status: "no_printed" }
  | { status: "barcode_only"; barcode: string; barcodeDetectionMs: number }
  | { status: "printed_only"; printed: string; printedDetectionMs: number }
  | { status: "mismatch"; barcode: string; printedNumber: string }
  | { status: "verified"; scan: VerifiedScan };

function cropBelowBarcode(
  frame: HTMLCanvasElement,
  barcode: BarcodeDecodeResult,
): HTMLCanvasElement {
  const y0 = Math.min(frame.height - 1, Math.round(barcode.bottomY + 2));
  const h = Math.max(
    56,
    Math.min(Math.round(frame.height * 0.18), frame.height - y0),
  );
  const x0 = Math.max(0, Math.round(barcode.leftX - 60));
  const w = Math.min(
    frame.width - x0,
    Math.max(100, Math.round(barcode.rightX - barcode.leftX + 120)),
  );
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(frame, x0, y0, w, h, 0, 0, w, h);
  return out;
}

async function readPrintedNumber(
  frame: HTMLCanvasElement,
  barcode: BarcodeDecodeResult,
) {
  const strip = cropBelowBarcode(frame, barcode);
  return readPrintedBelowBarcode(strip, barcode);
}

function verifiedFromBarcodeOnly(
  barcode: BarcodeDecodeResult,
  barcodeDetectionMs: number,
  start: number,
): ScanFrameStatus {
  const scan: VerifiedScan = {
    barcode: barcode.value,
    printedNumber: "—",
    matched: true,
    accuracyPercent: 100,
    ocrConfidence: 0,
    barcodeDetectionMs,
    printedDetectionMs: 0,
    processingMs: Math.round(performance.now() - start),
  };
  logScan("verification", "Barcode only (printed number detection off)", {
    barcode: scan.barcode,
    conclusion: "Barcode only — number detection disabled",
  });
  return { status: "verified", scan };
}

/**
 * One scan tick — returns status so UI can keep stable-match across OCR flakes.
 */
export async function scanFrame(
  frame: HTMLCanvasElement,
  options?: ScanFrameOptions,
): Promise<ScanFrameStatus> {
  const detectBarcode = options?.detectBarcode !== false;
  const detectPrinted = options?.detectPrintedNumber !== false;

  if (!detectBarcode && !detectPrinted) {
    return { status: "idle" };
  }

  const start = performance.now();

  if (!detectBarcode && detectPrinted) {
    const printedStart = performance.now();
    const ocr = await readPrintedInGuide(frame);
    const printedDetectionMs = Math.round(performance.now() - printedStart);

    if (!ocr.printed) {
      logScan(
        "printed_ocr",
        "Could not read printed number in guide",
        {
          ocrConfidence: ocr.ocrConfidence,
          printedDetectionMs,
          detail: { engine: ocr.engine, tessPasses: ocr.tessPasses },
        },
        { throttleKey: "no-printed", throttleMs: 3000 },
      );
      return { status: "no_printed" };
    }

    logScan("printed_ocr", "Printed number read (barcode detection off)", {
      printedNumber: ocr.printed,
      ocrConfidence: ocr.ocrConfidence,
      printedDetectionMs,
      detail: { engine: ocr.engine, tessPasses: ocr.tessPasses },
    });

    return {
      status: "printed_only",
      printed: ocr.printed,
      printedDetectionMs,
    };
  }

  await prepareBarcodeEngine();

  const barcodeStart = performance.now();
  const barcode = await decodeBarcodeFromFrame(frame, {
    aggressive: options?.aggressiveBarcode ?? false,
  });
  const barcodeDetectionMs = Math.round(performance.now() - barcodeStart);

  if (!barcode) {
    logScan(
      "scan_attempt",
      "No barcode detected in frame",
      { detail: { guideRoi: true } },
      { throttleKey: "no-barcode", throttleMs: 5000 },
    );
    return { status: "no_barcode" };
  }

  logScan("barcode_decoded", "Barcode decoded", {
    barcode: barcode.value,
    barcodeDetectionMs,
  });

  if (!detectPrinted) {
    return verifiedFromBarcodeOnly(barcode, barcodeDetectionMs, start);
  }

  const stableFrames = options?.barcodeStableFrames ?? 0;
  if (stableFrames < MIN_BARCODE_STABLE_FOR_OCR) {
    return { status: "barcode_locked", barcode: barcode.value, barcodeDetectionMs };
  }

  const printedStart = performance.now();
  const ocr = await readPrintedNumber(frame, barcode);
  const printedDetectionMs = Math.round(performance.now() - printedStart);

  if (!ocr.printed) {
    logScan(
      "printed_ocr",
      "Could not read printed number below barcode",
      {
        barcode: barcode.value,
        ocrConfidence: ocr.ocrConfidence,
        printedDetectionMs,
        detail: {
          engine: ocr.engine,
          tessPasses: ocr.tessPasses,
          rawLine: ocr.rawLine,
        },
      },
      { throttleKey: "no-printed", throttleMs: 3000 },
    );
    return { status: "barcode_only", barcode: barcode.value, barcodeDetectionMs };
  }

  logScan("printed_ocr", "Printed number read", {
    barcode: barcode.value,
    printedNumber: ocr.printed,
    ocrConfidence: ocr.ocrConfidence,
    printedDetectionMs,
    detail: { engine: ocr.engine, tessPasses: ocr.tessPasses },
  });

  const verification = verifyBarcode(barcode, ocr.printed);
  const accuracyPercent = verificationAccuracy(barcode.value, ocr.printed);

  if (!verification.match) {
    logScan("verification", "Barcode does not match printed number", {
      barcode: barcode.value,
      printedNumber: ocr.printed,
      matched: false,
      accuracyPercent,
      conclusion: verification.status,
    });
    return {
      status: "mismatch",
      barcode: barcode.value,
      printedNumber: ocr.printed,
    };
  }

  logScan("verification", "Barcode matches printed number", {
    barcode: barcode.value,
    printedNumber: ocr.printed,
    matched: true,
    accuracyPercent,
    conclusion: verification.status,
  });

  return {
    status: "verified",
    scan: {
      barcode: barcode.value,
      printedNumber: ocr.printed,
      matched: true,
      accuracyPercent,
      ocrConfidence: ocr.ocrConfidence,
      barcodeDetectionMs,
      printedDetectionMs,
      processingMs: Math.round(performance.now() - start),
    },
  };
}

/** @deprecated Use scanFrame — kept for sample flow. */
export async function scanAndVerify(
  frame: HTMLCanvasElement,
  options?: ScanFrameOptions,
): Promise<VerifiedScan | null> {
  const r = await scanFrame(frame, {
    aggressiveBarcode: true,
    detectBarcode: options?.detectBarcode !== false,
    detectPrintedNumber: options?.detectPrintedNumber !== false,
  });
  if (r.status === "verified") return r.scan;
  if (r.status === "printed_only") {
    return {
      barcode: r.printed,
      printedNumber: r.printed,
      matched: true,
      accuracyPercent: 100,
      ocrConfidence: 0,
      barcodeDetectionMs: 0,
      printedDetectionMs: r.printedDetectionMs,
      processingMs: r.printedDetectionMs,
    };
  }
  return null;
}

export function verifiedScanToResult(scan: VerifiedScan): ScanResult {
  const verification = verifyBarcode(
    {
      value: scan.barcode,
      bottomY: 0,
      leftX: 0,
      rightX: 0,
    },
    scan.printedNumber,
  );

  const fields = buildScanFields(verification, []);

  if (scan.barcodeDetectionMs > 0) {
    fields.push({
      key: "Barcode detection time",
      value: `${scan.barcodeDetectionMs} ms`,
    });
  } else {
    fields.push({
      key: "Barcode detection time",
      value: "Off",
      highlight: "muted",
    });
  }

  if (scan.printedDetectionMs > 0) {
    fields.push({
      key: "Printed number detection time",
      value: `${scan.printedDetectionMs} ms`,
    });
  } else {
    fields.push({
      key: "Printed number detection time",
      value: "Off",
      highlight: "muted",
    });
  }
  fields.push({
    key: "Total detection time",
    value: `${scan.processingMs} ms`,
  });
  fields.push({
    key: "Accuracy",
    value: `${scan.accuracyPercent}%`,
    highlight: scan.accuracyPercent >= 100 ? "success" : "muted",
  });
  fields.push({
    key: "Read confidence",
    value: `${scan.ocrConfidence}%`,
    highlight: scan.ocrConfidence >= 90 ? "success" : undefined,
  });

  return {
    barcode: scan.barcode,
    printedNumber: scan.printedNumber,
    matched: scan.matched,
    accuracyPercent: scan.accuracyPercent,
    ocrConfidence: scan.ocrConfidence,
    barcodeDetectionMs: scan.barcodeDetectionMs,
    printedDetectionMs: scan.printedDetectionMs,
    processingMs: scan.processingMs,
    fields,
  };
}
