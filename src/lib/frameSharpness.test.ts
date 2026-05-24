import { describe, expect, it } from "vitest";
import { orderFramesBySharpness } from "./frameSharpness";

describe("frameSharpness", () => {
  it("preserves all frames when ordering", () => {
    expect(orderFramesBySharpness([])).toEqual([]);
  });
});
