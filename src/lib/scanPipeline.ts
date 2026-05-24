import type { BarcodeDecodeResult } from "./barcode";
import {
  captureFrameFromVideo,
  type BurstAnalyzeResult,
} from "./burstScan";
import { orderFramesBySharpness } from "./frameSharpness";
import { logScan } from "./scanLogger";
import { readPrintedFast } from "./printedOcr";
import { SCAN_CONFIG } from "./scanConfig";
import type { LockedScanContext } from "./scanContext";
import { trackingNumbersMatch } from "./tracking";
import {
  type ScanFrameOptions,
  type VerifiedScan,
} from "./verifyScan";
import { verificationAccuracy } from "./accuracy";

export interface PipelineOptions extends ScanFrameOptions {
  onStatus?: (message: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildVerifiedScan(
  barcode: string,
  printed: string,
  printedDetectionMs: number,
  ocrConfidence: number,
): VerifiedScan {
  return {
    barcode,
    printedNumber: printed,
    matched: true,
    accuracyPercent: verificationAccuracy(barcode, printed),
    ocrConfidence,
    barcodeDetectionMs: 0,
    printedDetectionMs,
    processingMs: printedDetectionMs,
  };
}

async function ocrFrame(
  frame: HTMLCanvasElement,
  anchor: BarcodeDecodeResult,
): Promise<{ scan: VerifiedScan | null; ocr: Awaited<ReturnType<typeof readPrintedFast>> }> {
  const start = performance.now();
  const ocr = await readPrintedFast(frame, anchor);
  const printedDetectionMs = Math.round(performance.now() - start);

  if (ocr.printed && trackingNumbersMatch(anchor.value, ocr.printed)) {
    return {
      scan: buildVerifiedScan(
        anchor.value,
        ocr.printed,
        printedDetectionMs,
        ocr.ocrConfidence,
      ),
      ocr,
    };
  }
  return { scan: null, ocr };
}

/**
 * Capture burst while OCR runs on photo 1; retry sharpest frames if needed.
 * Requires barcode locked from preview — skips redundant barcode decode.
 */
export async function runPipelinedScan(
  video: HTMLVideoElement,
  lock: LockedScanContext,
  options: PipelineOptions = {},
): Promise<BurstAnalyzeResult> {
  const detectPrinted = options.detectPrintedNumber !== false;
  const barcodeValue = lock.barcode.value;
  const frames: HTMLCanvasElement[] = [];
  let firstOcr: ReturnType<typeof ocrFrame> | null = null;

  options.onStatus?.("Capturing photo 1 — analyzing…");
  const first = captureFrameFromVideo(video);
  if (first) {
    frames.push(first);
    if (detectPrinted) {
      firstOcr = ocrFrame(first, lock.barcode);
    }
  }

  for (let i = 1; i < SCAN_CONFIG.burstPhotoCount; i++) {
    options.onStatus?.(
      `Capturing photo ${i + 1} of ${SCAN_CONFIG.burstPhotoCount}…`,
    );
    await sleep(SCAN_CONFIG.burstPhotoIntervalMs);
    const frame = captureFrameFromVideo(video);
    if (frame) frames.push(frame);
  }

  if (frames.length === 0) {
    return { ok: false, framesAnalyzed: 0, reason: "no_frames" };
  }

  if (!detectPrinted) {
    const scan = buildVerifiedScan(barcodeValue, "—", 0, 0);
    return {
      ok: true,
      scan,
      votes: 1,
      framesAnalyzed: frames.length,
    };
  }

  options.onStatus?.("Matching printed number…");

  let firstAttempt: Awaited<ReturnType<typeof ocrFrame>> | null = null;
  if (firstOcr) {
    firstAttempt = await firstOcr;
    if (firstAttempt.scan) {
      logScan("verification", "Verified on photo 1 (pipelined OCR)", {
        barcode: firstAttempt.scan.barcode,
        printedNumber: firstAttempt.scan.printedNumber,
        matched: true,
        printedDetectionMs: firstAttempt.scan.printedDetectionMs,
        detail: {
          pipelined: true,
          frame: 1,
          engine: firstAttempt.ocr.engine,
        },
      });
      return {
        ok: true,
        scan: firstAttempt.scan,
        votes: 1,
        framesAnalyzed: frames.length,
      };
    }
  }

  let lastPrinted = firstAttempt?.ocr.printed ?? null;
  let lastEngine = firstAttempt?.ocr.engine ?? "none";
  let lastTessPasses = firstAttempt?.ocr.tessPasses ?? 0;

  const rest = frames.filter((f) => f !== first);
  for (const frame of orderFramesBySharpness(rest)) {
    const attempt = await ocrFrame(frame, lock.barcode);
    lastPrinted = attempt.ocr.printed;
    lastEngine = attempt.ocr.engine;
    lastTessPasses = attempt.ocr.tessPasses;

    if (attempt.scan) {
      logScan("verification", "Verified on burst retry frame", {
        barcode: attempt.scan.barcode,
        printedNumber: attempt.scan.printedNumber,
        matched: true,
        printedDetectionMs: attempt.scan.printedDetectionMs,
        detail: { pipelined: true, retry: true, engine: attempt.ocr.engine },
      });
      return {
        ok: true,
        scan: attempt.scan,
        votes: 1,
        framesAnalyzed: frames.length,
      };
    }
  }

  logScan("verification", "Pipelined OCR could not verify", {
    barcode: barcodeValue,
    printedNumber: lastPrinted ?? undefined,
    matched: false,
    detail: {
      tessPasses: lastTessPasses,
      engine: lastEngine,
      frames: frames.length,
    },
  });

  return {
    ok: false,
    framesAnalyzed: frames.length,
    reason: "ocr_no_match",
    debug: {
      barcode: barcodeValue,
      printed: lastPrinted,
      statuses: ["locked_barcode", "ocr_failed"],
    },
  };
}
