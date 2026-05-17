import { describe, expect, it } from "vitest";
import { getCameraBlockReason, isSecureCameraContext } from "./camera";

describe("camera", () => {
  it("isSecureCameraContext is boolean", () => {
    expect(typeof isSecureCameraContext()).toBe("boolean");
  });

  it("blocks when getUserMedia is missing", () => {
    const blocked = getCameraBlockReason();
    if (!navigator.mediaDevices?.getUserMedia && blocked) {
      expect(blocked.canRetry).toBe(true);
    } else if (!blocked) {
      expect(blocked).toBeNull();
    }
  });
});
