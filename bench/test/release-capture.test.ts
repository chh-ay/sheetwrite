import { expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { RELEASE_ARTIFACTS, RELEASE_SMOKE_COMMANDS } from "../src/release-capture.js";

/** The Performance section publishes the evidence over several pages. */
function evidencePages(): string {
  const directory = new URL("../../docs/src/content/docs/performance/", import.meta.url);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => readFileSync(new URL(name, directory), "utf8"))
    .join("\n");
}

it("captures every artifact the evidence pages publish", () => {
  const pages = evidencePages();
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
