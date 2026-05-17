import { describe, expect, it } from "vitest";
import {
  extractTrackingToken,
  pickTokenMatchingBarcode,
  trackingNumbersMatch,
} from "./tracking";

describe("barcode capture", () => {
  it("extracts tracking token from noisy OCR text", () => {
    expect(extractTrackingToken("  PH8002878491 ")).toBe("PH8002878491");
  });

  it("matches normalized tracking numbers", () => {
    expect(trackingNumbersMatch("PH8002878491", "PH8002878491")).toBe(true);
  });

  it("rejects OCR garbage with extra digits", () => {
    expect(trackingNumbersMatch("PH8002878491", "PH8002878491868")).toBe(
      false,
    );
  });

  it("allows one-character OCR typo", () => {
    expect(trackingNumbersMatch("PH8002878491", "PH8002878492")).toBe(true);
  });

  it("picks barcode-matching token from noisy OCR line", () => {
    const noisy = "RR PH8002878491868 PH8002878491 extra";
    expect(pickTokenMatchingBarcode(noisy, "PH8002878491")).toBe("PH8002878491");
  });

  it("returns null when no token matches barcode", () => {
    expect(pickTokenMatchingBarcode("PH800287444", "PH8002878491")).toBeNull();
  });
});
