import { describe, expect, it } from "vitest";
import { isAudioPrimed } from "./sound";

describe("sound", () => {
  it("isAudioPrimed returns boolean", () => {
    expect(typeof isAudioPrimed()).toBe("boolean");
  });
});
