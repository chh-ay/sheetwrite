import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { RELEASE_ARTIFACTS, RELEASE_SMOKE_COMMANDS } from "../src/release-capture.js";

function evidencePage(): string {
  return readFileSync(
    new URL("../../docs/src/content/docs/guides/performance-resources.md", import.meta.url),
    "utf8",
  );
}

it("captures every artifact the evidence page publishes", () => {
  const page = evidencePage();
  for (const artifact of RELEASE_ARTIFACTS) {
    expect(page).toContain(`bench/results/${artifact}`);
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
