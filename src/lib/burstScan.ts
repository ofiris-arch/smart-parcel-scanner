import { decodeBarcodeFromFrame } from "./decodeFrame";
import { logScan } from "./scanLogger";
import { readPrintedForBarcode } from "./printedOcr";
import { SCAN_CONFIG } from "./scanConfig";
import { trackingNumbersMatch } from "./tracking";
import type { BarcodeDecodeResult } from "./barcode";
import {
  scanFrame,
  type ScanFrameOptions,
  type VerifiedScan,
} from "./verifyScan";
import { verificationAccuracy } from "./accuracy";

export function captureFrameFromVideo(
  video: HTMLVideoElement,
): HTMLCanvasElement | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return canvas;
}

/** Grab N stills from the live camera feed. */
export async function captureBurstFromVideo(
  video: HTMLVideoElement,
  count = SCAN_CONFIG.burstPhotoCount,
  intervalMs = SCAN_CONFIG.burstPhotoIntervalMs,
): Promise<HTMLCanvasElement[]> {
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < count; i++) {
    const frame = captureFrameFromVideo(video);
    if (frame) frames.push(frame);
    if (i < count - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return frames;
}

export interface BurstAnalyzeResult {
  ok: boolean;
  scan?: VerifiedScan;
  votes?: number;
  framesAnalyzed: number;
  reason?: string;
  debug?: {
    barcode?: string;
    printed?: string | null;
    statuses: string[];
  };
}

export function pickBurstConsensus(
  scans: VerifiedScan[],
): { scan: VerifiedScan; count: number } | null {
  const groups = new Map<string, { scan: VerifiedScan; count: number }>();
  for (const scan of scans) {
    const key = `${scan.barcode}|${scan.printedNumber}`;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { scan, count: 1 });
  }

  let best: { scan: VerifiedScan; count: number } | null = null;
  for (const g of groups.values()) {
    if (
      !best ||
      g.count > best.count ||
      (g.count === best.count && g.scan.ocrConfidence > best.scan.ocrConfidence)
    ) {
      best = g;
    }
  }
  return best;
}

function buildVerifiedScan(
  barcode: string,
  printed: string,
  barcodeDetectionMs: number,
  printedDetectionMs: number,
  ocrConfidence: number,
): VerifiedScan {
  return {
    barcode,
    printedNumber: printed,
    matched: true,
    accuracyPercent: verificationAccuracy(barcode, printed),
    ocrConfidence,
    barcodeDetectionMs,
    printedDetectionMs,
    processingMs: barcodeDetectionMs + printedDetectionMs,
  };
}

function syntheticBarcode(
  frame: HTMLCanvasElement,
  value: string,
  template?: BarcodeDecodeResult,
): BarcodeDecodeResult {
  if (template) return { ...template, value };
  return {
    value,
    bottomY: frame.height * 0.48,
    leftX: frame.width * 0.08,
    rightX: frame.width * 0.92,
  };
}

/** Second pass: known barcode → OCR guide/above/below on each frame. */
async function verifyBurstWithBarcode(
  frames: HTMLCanvasElement[],
  barcodeValue: string,
  template: BarcodeDecodeResult | undefined,
  detectPrinted: boolean,
): Promise<VerifiedScan | null> {
  if (!detectPrinted) {
    return buildVerifiedScan(barcodeValue, "—", 0, 0, 0);
  }

  for (const frame of frames) {
    const anchor = syntheticBarcode(frame, barcodeValue, template);
    const start = performance.now();
    const ocr = await readPrintedForBarcode(frame, anchor);
    const printedDetectionMs = Math.round(performance.now() - start);

    if (ocr.printed && trackingNumbersMatch(barcodeValue, ocr.printed)) {
      return buildVerifiedScan(
        barcodeValue,
        ocr.printed,
        0,
        printedDetectionMs,
        ocr.ocrConfidence,
      );
    }
  }
  return null;
}

/** Run full barcode + OCR on each still; pick majority verified result. */
export async function analyzeBurstFrames(
  frames: HTMLCanvasElement[],
  options: ScanFrameOptions,
): Promise<BurstAnalyzeResult> {
  if (frames.length === 0) {
    return { ok: false, framesAnalyzed: 0, reason: "no_frames" };
  }

  const detectPrinted = options.detectPrintedNumber !== false;
  const verified: VerifiedScan[] = [];
  const statuses: string[] = [];
  const decoded: { frame: HTMLCanvasElement; barcode: BarcodeDecodeResult }[] =
    [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const outcome = await scanFrame(frame, {
      ...options,
      aggressiveBarcode: true,
      barcodeStableFrames: 99,
    });
    statuses.push(outcome.status);

    if (outcome.status === "verified") {
      verified.push(outcome.scan);
    } else if (outcome.status === "barcode_only") {
      decoded.push({
        frame,
        barcode: {
          value: outcome.barcode,
          bottomY: frame.height * 0.48,
          leftX: frame.width * 0.08,
          rightX: frame.width * 0.92,
        },
      });
    } else if (
      outcome.status === "mismatch" ||
      outcome.status === "barcode_locked"
    ) {
      const b = await decodeBarcodeFromFrame(frame, { aggressive: true });
      if (b) decoded.push({ frame, barcode: b });
    }
  }

  for (const frame of frames) {
    if (decoded.some((d) => d.frame === frame)) continue;
    const b = await decodeBarcodeFromFrame(frame, { aggressive: true });
    if (b) decoded.push({ frame, barcode: b });
  }

  logScan("scan_attempt", "Burst frames analyzed", {
    detail: {
      frameCount: frames.length,
      statuses,
      verifiedCount: verified.length,
      decodedBarcodes: decoded.map((d) => d.barcode.value),
    },
  });

  const minVotes = Math.min(
    SCAN_CONFIG.burstMinAgreeingFrames,
    frames.length,
  );
  const best = pickBurstConsensus(verified);

  if (best && best.count >= minVotes) {
    return {
      ok: true,
      scan: best.scan,
      votes: best.count,
      framesAnalyzed: frames.length,
    };
  }

  if (verified.length > 0) {
    const top = [...verified].sort(
      (a, b) => b.ocrConfidence - a.ocrConfidence,
    )[0]!;
    return {
      ok: true,
      scan: top,
      votes: 1,
      framesAnalyzed: frames.length,
    };
  }

  const counts = new Map<string, number>();
  for (const { barcode } of decoded) {
    counts.set(barcode.value, (counts.get(barcode.value) ?? 0) + 1);
  }
  let majorityBarcode = "";
  let majorityCount = 0;
  for (const [value, count] of counts) {
    if (count > majorityCount) {
      majorityCount = count;
      majorityBarcode = value;
    }
  }

  const template = decoded.find((d) => d.barcode.value === majorityBarcode)
    ?.barcode;

  if (majorityBarcode) {
    const rescue = await verifyBurstWithBarcode(
      frames,
      majorityBarcode,
      template,
      detectPrinted,
    );
    if (rescue) {
      return {
        ok: true,
        scan: rescue,
        votes: 1,
        framesAnalyzed: frames.length,
      };
    }
  }

  let lastPrinted: string | null = null;
  if (majorityBarcode && template) {
    const ocr = await readPrintedForBarcode(frames[0]!, template);
    lastPrinted = ocr.printed;
  }

  return {
    ok: false,
    framesAnalyzed: frames.length,
    reason: "no_consensus",
    debug: {
      barcode: majorityBarcode || undefined,
      printed: lastPrinted,
      statuses,
    },
  };
}
