import { describe, expect, it } from "bun:test";
import { sampleLandingTimeline } from "../src/components/LandingSpreadsheet.js";

describe("landing visual timeline", () => {
  it("returns the complete static frame for reduced motion", () => {
    expect(sampleLandingTimeline(0, true)).toEqual({
      phase: "resolve",
      selection: 1,
      dependencies: 1,
      request: 1,
      resolved: 1,
    });
  });
});
