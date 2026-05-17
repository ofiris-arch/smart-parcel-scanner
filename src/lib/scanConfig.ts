/** Tunables for live scan speed vs stability (lower = faster, less stable). */
export const SCAN_CONFIG = {
  /** Ms between frame scans while camera is active. */
  liveScanIntervalMs: 380,
  /** Consecutive matching frames before capture (1 = instant on first match). */
  stableMatchesRequired: 1,
  /** Barcode frames in a row before OCR runs (1 = OCR on first barcode read). */
  barcodeStableFramesForOcr: 1,
  /** Run aggressive barcode decode every N frames. */
  aggressiveBarcodeEvery: 3,
} as const;
