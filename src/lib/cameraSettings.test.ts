import { describe, expect, it } from "vitest";
import {
  buildVideoConstraints,
  DEFAULT_CAMERA_SETTINGS,
  formatVideoInfo,
  RESOLUTION_PRESETS,
} from "./cameraSettings";

describe("cameraSettings", () => {
  it("requests high resolution for max preset", () => {
    const c = buildVideoConstraints(
      { ...DEFAULT_CAMERA_SETTINGS, resolution: "max" },
      { facingMode: "environment" },
    );
    expect(c.width).toEqual(
      expect.objectContaining({ ideal: RESOLUTION_PRESETS.max.width }),
    );
    expect(c.height).toEqual(
      expect.objectContaining({ ideal: RESOLUTION_PRESETS.max.height }),
    );
  });

  it("omits size for auto preset", () => {
    const c = buildVideoConstraints(
      { ...DEFAULT_CAMERA_SETTINGS, resolution: "auto" },
      { facingMode: "environment" },
    );
    expect(c.width).toBeUndefined();
    expect(c.height).toBeUndefined();
  });

  it("formats active video info", () => {
    expect(
      formatVideoInfo({ width: 1920, height: 1080, frameRate: 30 }),
    ).toBe("1920×1080 @ 30 fps");
  });
});
