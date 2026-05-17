/** Tunables for live barcode trigger + burst capture. */
export const SCAN_CONFIG = {
  /** Number of still photos per capture. */
  burstPhotoCount: 3,
  /** Ms between each photo in a burst (0.3 s). */
  burstPhotoIntervalMs: 300,
  /** Min frames that must agree on barcode + printed (of burstPhotoCount). */
  burstMinAgreeingFrames: 1,
  /** How often to decode barcode from the live preview (ms). */
  previewScanIntervalMs: 400,
  /** Same barcode on this many preview ticks before auto-capture. */
  barcodeStableFrames: 2,
  /** Ignore new auto-triggers for this long after a capture attempt. */
  captureCooldownMs: 3000,
} as const;
