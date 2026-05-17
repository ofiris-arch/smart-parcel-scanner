/** Tunables for live scan / burst capture. */
export const SCAN_CONFIG = {
  /** Ms between lightweight barcode preview checks. */
  previewScanIntervalMs: 500,
  /** Same barcode seen this many previews before auto burst. */
  barcodeTriggersBurstAfter: 2,
  /** Number of still photos per burst. */
  burstPhotoCount: 3,
  /** Ms between each photo in a burst. */
  burstPhotoIntervalMs: 120,
  /** Min frames that must agree on barcode + printed (of burstPhotoCount). */
  burstMinAgreeingFrames: 2,
  /** Wait after a failed burst before auto-capture can run again. */
  burstCooldownMs: 4000,
  /** Preview frames with no barcode required to allow re-trigger. */
  previewClearFramesRequired: 2,
} as const;
