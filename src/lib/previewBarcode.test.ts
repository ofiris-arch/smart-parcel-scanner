import { describe, expect, it, beforeEach } from "vitest";
import { BarcodeStabilityTracker } from "./previewBarcode";
import { SCAN_CONFIG } from "./scanConfig";

describe("BarcodeStabilityTracker", () => {
  let tracker: BarcodeStabilityTracker;

  beforeEach(() => {
    tracker = new BarcodeStabilityTracker();
  });

  it("requires consecutive stable frames", () => {
    for (let i = 0; i < SCAN_CONFIG.barcodeStableFrames - 1; i++) {
      expect(tracker.note("PH8002878491").stable).toBe(false);
    }
    expect(tracker.note("PH8002878491").stable).toBe(true);
  });

  it("resets when barcode disappears", () => {
    tracker.note("ABC");
    tracker.note("ABC");
    tracker.note(null);
    expect(tracker.note("ABC").streak).toBe(1);
  });

  it("resets streak on value change", () => {
    tracker.note("A");
    tracker.note("A");
    const changed = tracker.note("B");
    expect(changed.streak).toBe(1);
    expect(changed.stable).toBe(false);
  });
});
