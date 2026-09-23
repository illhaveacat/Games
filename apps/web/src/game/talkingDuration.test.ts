import { describe, expect, it } from "vitest";
import { estimateTalkingDurationMs } from "./talkingDuration";

describe("estimateTalkingDurationMs", () => {
  it("clamps very short text up to the minimum duration", () => {
    expect(estimateTalkingDurationMs("Hi")).toBe(1200);
  });

  it("clamps very long text down to the maximum duration", () => {
    const longText = "a".repeat(500);
    expect(estimateTalkingDurationMs(longText)).toBe(6000);
  });

  it("scales roughly linearly with text length in between the bounds", () => {
    const text = "a".repeat(40); // 40 * 45 = 1800ms, within bounds
    expect(estimateTalkingDurationMs(text)).toBe(1800);
  });

  it("trims whitespace before measuring length", () => {
    expect(estimateTalkingDurationMs("   Hi   ")).toBe(estimateTalkingDurationMs("Hi"));
  });
});
