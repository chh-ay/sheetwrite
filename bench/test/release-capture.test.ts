import { expect, it } from "bun:test";

import { renderEvidenceText } from "../../scripts/docs-performance.js";
import { RELEASE_ARTIFACTS, RELEASE_SMOKE_COMMANDS } from "../src/release-capture.js";

// The Performance pages are generated from this text, so the test renders it
// instead of reading pages that only exist after `docs:generate`.
it("publishes every captured artifact on the evidence pages", async () => {
  const pages = await renderEvidenceText();
  for (const artifact of RELEASE_ARTIFACTS) {
    expect(pages).toContain(`bench/results/${artifact}`);
  }
});

it("captures each artifact exactly once", () => {
  expect(new Set(RELEASE_ARTIFACTS).size).toBe(RELEASE_ARTIFACTS.length);
});

it("rehearses every capture that has a smoke matrix without touching tracked evidence", () => {
  expect(RELEASE_SMOKE_COMMANDS.length).toBeGreaterThan(0);
  for (const command of RELEASE_SMOKE_COMMANDS) {
    for (const argument of command) {
      if (!argument.startsWith("results/")) continue;
      expect(argument.startsWith("results/smoke/")).toBe(true);
    }
  }
});
