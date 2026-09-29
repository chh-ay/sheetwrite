import { describe, expect, it } from "bun:test";
import artifact from "../results/interaction-results.json" with { type: "json" };
import { validateInteractionArtifact } from "../src/interaction-gate.js";

function clone(): typeof artifact {
  return structuredClone(artifact);
}

describe("interaction performance artifact", () => {
  it("rejects weakened speed, memory, sparse, and cold-route gates", () => {
    for (const [mutate, message] of [
      [
        (value: typeof artifact) => (value.directionalPrefetch.medianResidencyRatio = 0.94),
        "prefetch",
      ],
      [
        (value: typeof artifact) => (value.viewIndex.medianLookupImprovementRatio = 0.19),
        "view-index",
      ],
      [(value: typeof artifact) => (value.sparseDirty.dirty100Bytes = 1024 * 1024 + 1), "sparse"],
      [
        (value: typeof artifact) => (value.coldRoute.after.sheetwriteLongTaskMsSamples[0] = 51),
        "cold-route",
      ],
    ] as const) {
      const candidate = clone();
      mutate(candidate);
      expect(() => validateInteractionArtifact(candidate)).toThrow(message);
    }
  });
});
