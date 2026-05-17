import { describe, expect, it } from "vitest";
import { pickBurstConsensus } from "./burstScan";
import { SCAN_CONFIG } from "./scanConfig";
import type { VerifiedScan } from "./verifyScan";

const scan = (
  barcode: string,
  printed: string,
  ocrConfidence = 90,
): VerifiedScan => ({
  barcode,
  printedNumber: printed,
  matched: true,
  accuracyPercent: 100,
  ocrConfidence,
  barcodeDetectionMs: 10,
  printedDetectionMs: 50,
  processingMs: 60,
});

describe("burstScan", () => {
  it("picks majority match across frames", () => {
    const best = pickBurstConsensus([
      scan("PH8002878491", "PH8002878491", 80),
      scan("PH8002878491", "PH8002878491", 95),
      scan("PH8002878492", "PH8002878492", 99),
    ]);
    expect(best?.count).toBe(2);
    expect(best?.scan.barcode).toBe("PH8002878491");
  });

  it("requires at least 2 burst photos", () => {
    expect(SCAN_CONFIG.burstPhotoCount).toBeGreaterThanOrEqual(2);
  });
});
