/** Tunables for live scan / burst capture. */
export const SCAN_CONFIG = {
  /** Ms between lightweight barcode preview checks. */
  previewScanIntervalMs: 450,
  /** Same barcode seen this many previews before auto burst. */
  barcodeTriggersBurstAfter: 1,
  /** Number of still photos per burst. */
  burstPhotoCount: 3,
  /** Ms between each photo in a burst. */
  burstPhotoIntervalMs: 100,
  /** Min frames that must agree on barcode + printed (of burstPhotoCount). */
  burstMinAgreeingFrames: 2,
} as const;
