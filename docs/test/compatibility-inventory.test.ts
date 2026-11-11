import { expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  assertCompatibilityInventory,
  collectCompatibilityIssues,
  collectMissingCompatibilityFiles,
} from "../src/showcases/compatibility-validation.ts";
import {
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_INVENTORY,
  type CompatibilityRecord,
} from "../src/showcases/compatibility.ts";

it("accepts the published inventory, whose evidence and fixture files exist", () => {
  const repositoryRoot = join(import.meta.dir, "..", "..");
  expect(() =>
    assertCompatibilityInventory(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES),
  ).not.toThrow();
  expect(
    collectMissingCompatibilityFiles(COMPATIBILITY_INVENTORY, COMPATIBILITY_FIXTURES, (path) =>
      existsSync(join(repositoryRoot, path)),
    ),
  ).toEqual([]);
});

const [record] = COMPATIBILITY_INVENTORY;
const binary = COMPATIBILITY_FIXTURES.find(({ sha256 }) => sha256 !== undefined);
const unsupported = COMPATIBILITY_INVENTORY.find(({ status }) => status === "unsupported");
if (!record || !binary || !unsupported) throw new Error("The inventory is empty");

const replaced = (original: CompatibilityRecord, change: Partial<CompatibilityRecord>) =>
  COMPATIBILITY_INVENTORY.map((entry) => (entry === original ? { ...entry, ...change } : entry));

it.each([
  [
    "a record without evidence",
    () => collectCompatibilityIssues(replaced(record, { evidence: [] }), COMPATIBILITY_FIXTURES),
    `compatibility record has no executable evidence: ${record.id}`,
  ],
  [
    "an unknown fixture",
    () =>
      collectCompatibilityIssues(
        replaced(record, { fixtureIds: ["missing-fixture"] }),
        COMPATIBILITY_FIXTURES,
      ),
    `unknown compatibility fixture: ${record.id}=missing-fixture`,
  ],
  [
    "evidence outside the repository",
    () =>
      collectCompatibilityIssues(
        replaced(record, { evidence: ["../outside.test.ts"] }),
        COMPATIBILITY_FIXTURES,
      ),
    `invalid compatibility evidence path: ${record.id}=../outside.test.ts`,
  ],
  [
    "an invalid digest",
    () =>
      collectCompatibilityIssues(
        COMPATIBILITY_INVENTORY,
        COMPATIBILITY_FIXTURES.map((entry) =>
          entry === binary ? { ...entry, sha256: "not-a-digest" } : entry,
        ),
      ),
    `compatibility fixture has invalid sha256: ${binary.id}`,
  ],
  [
    "an unsupported record relabeled as supported",
    () =>
      collectCompatibilityIssues(
        replaced(unsupported, { status: "supported" }),
        COMPATIBILITY_FIXTURES,
      ),
    `inconsistent compatibility status/result mode: ${unsupported.id}=supported/unsupported`,
  ],
] as const)("rejects %s", (_case, collect, issue) => {
  expect(collect()).toContain(issue);
});
