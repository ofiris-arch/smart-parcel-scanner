import { decodeBarcodeFromFrame } from "./decodeFrame";
import { logScan } from "./scanLogger";
import { SCAN_CONFIG } from "./scanConfig";
import {
  scanFrame,
  type ScanFrameOptions,
  type VerifiedScan,
} from "./verifyScan";

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

/** Run full barcode + OCR on each still; pick majority verified result. */
export async function analyzeBurstFrames(
  frames: HTMLCanvasElement[],
  options: ScanFrameOptions,
): Promise<BurstAnalyzeResult> {
  if (frames.length === 0) {
    return { ok: false, framesAnalyzed: 0, reason: "no_frames" };
  }

  const verified: VerifiedScan[] = [];
  const statuses: string[] = [];

  for (let i = 0; i < frames.length; i++) {
    const outcome = await scanFrame(frames[i]!, {
      ...options,
      aggressiveBarcode: true,
      barcodeStableFrames: 99,
    });
    statuses.push(outcome.status);
    if (outcome.status === "verified") {
      verified.push(outcome.scan);
    }
  }

  logScan("scan_attempt", "Burst frames analyzed", {
    detail: {
      frameCount: frames.length,
      statuses,
      verifiedCount: verified.length,
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

  return {
    ok: false,
    framesAnalyzed: frames.length,
    reason: "no_consensus",
  };
}

/** Fast barcode-only check to decide when to burst-capture. */
export async function previewBarcode(
  frame: HTMLCanvasElement,
): Promise<string | null> {
  const hit = await decodeBarcodeFromFrame(frame, { aggressive: true });
  return hit?.value ?? null;
}
