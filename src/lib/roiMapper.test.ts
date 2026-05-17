import { describe, expect, it } from "vitest";
import { mapPointToDisplay, mapRectToDisplay } from "./roiMapper";
import type { LabelRoi } from "./types";

const roi: LabelRoi = {
  confidence: 0.9,
  rect: { x: 80, y: 100, width: 420, height: 300 },
  corners: [
    { x: 100, y: 100 },
    { x: 500, y: 120 },
    { x: 480, y: 400 },
    { x: 80, y: 380 },
  ],
};

describe("roiMapper", () => {
  it("maps center point under cover scaling", () => {
    const p = mapPointToDisplay(
      { x: 960, y: 540 },
      1920,
      1080,
      390,
      700,
    );
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(390);
  });

  it("maps axis-aligned rect to display", () => {
    const box = mapRectToDisplay(roi.rect, 1920, 1080, 400, 800);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
