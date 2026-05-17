/** Tunables for burst photo capture (no live verification while camera is on). */
export const SCAN_CONFIG = {
  /** Number of still photos per capture. */
  burstPhotoCount: 3,
  /** Ms between each photo in a burst. */
  burstPhotoIntervalMs: 120,
  /** Min frames that must agree on barcode + printed (of burstPhotoCount). */
  burstMinAgreeingFrames: 2,
} as const;
