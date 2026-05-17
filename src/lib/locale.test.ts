import { describe, expect, it } from "vitest";
import {
  isHebrewPersonalName,
  isLatinPersonalName,
  isMixedScript,
  isPiiFieldLabel,
  splitBilingualSegments,
} from "./locale";
import { buildScanFields } from "./buildFields";
import { verifyBarcode, type BarcodeDecodeResult } from "./barcode";
import { analyzeWords } from "./piiFilter";
import { trackingNumbersMatch } from "./tracking";
import type { OcrWord } from "./types";

describe("locale", () => {
  it("detects Hebrew PII labels", () => {
    expect(isPiiFieldLabel("שם")).toBe(true);
    expect(isPiiFieldLabel("כתובת")).toBe(true);
    expect(isPiiFieldLabel("משקל")).toBe(false);
  });

  it("splits bilingual name segments", () => {
    expect(splitBilingualSegments("Ofir Israeli - אופיר ישראלי")).toHaveLength(2);
  });

  it("detects mixed script", () => {
    expect(isMixedScript("Ofir Israeli - אופיר ישראלי")).toBe(true);
  });

  it("detects personal names", () => {
    expect(isLatinPersonalName("Ofir Israeli")).toBe(true);
    expect(isHebrewPersonalName("אופיר ישראלי")).toBe(true);
  });
});

describe("analyzeWords", () => {
  it("redacts mixed name line", () => {
    const words: OcrWord[] = [
      {
        text: "Name: Ofir Israeli - אופיר ישראלי",
        bbox: { x0: 0, y0: 0, x1: 200, y1: 20 },
        confidence: 90,
      },
    ];
    const { redactBoxes } = analyzeWords(words);
    expect(redactBoxes.length).toBeGreaterThan(0);
  });

  it("keeps routing codes", () => {
    const words: OcrWord[] = [
      { text: "IPH", bbox: { x0: 0, y0: 0, x1: 40, y1: 20 }, confidence: 95 },
      { text: "A27", bbox: { x0: 50, y0: 0, x1: 90, y1: 20 }, confidence: 95 },
    ];
    const { redactBoxes, informativeFields } = analyzeWords(words);
    expect(redactBoxes.length).toBe(0);
    expect(informativeFields.some((f) => f.value === "IPH")).toBe(true);
  });
});

describe("barcode verification", () => {
  it("matches identical tracking numbers", () => {
    expect(trackingNumbersMatch("PH8002878491", "PH8002878491")).toBe(true);
  });

  it("builds verification row", () => {
    const fields = buildScanFields(
      verifyBarcode(
        {
          value: "PH8002878491",
          bottomY: 100,
          leftX: 10,
          rightX: 200,
        } satisfies BarcodeDecodeResult,
        "PH8002878491",
      ),
      [],
    );
    expect(fields.find((f) => f.key === "Barcode verification")?.value).toBe(
      "Match",
    );
  });
});
