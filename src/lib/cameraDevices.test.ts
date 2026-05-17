import { describe, expect, it } from "vitest";
import {
  isRearCamera,
  nextCameraInList,
  pickDefaultRearCamera,
  type VideoCameraDevice,
} from "./cameraDevices";

const cameras: VideoCameraDevice[] = [
  { deviceId: "a", label: "Back Camera", group: "back" },
  { deviceId: "b", label: "Front Camera", group: "front" },
  { deviceId: "c", label: "Back Ultra Wide Camera", group: "back" },
];

describe("cameraDevices", () => {
  it("detects rear cameras", () => {
    expect(isRearCamera(cameras[0]!)).toBe(true);
    expect(isRearCamera(cameras[1]!)).toBe(false);
  });

  it("picks default rear camera", () => {
    expect(pickDefaultRearCamera(cameras)?.deviceId).toBe("a");
  });

  it("cycles cameras", () => {
    expect(nextCameraInList(cameras, "a")?.deviceId).toBe("b");
    expect(nextCameraInList(cameras, "c")?.deviceId).toBe("a");
  });
});
