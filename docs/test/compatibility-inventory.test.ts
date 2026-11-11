import { expect, it } from "bun:test";

import { collectCompatibilityIssues } from "../src/showcases/compatibility-validation.ts";
import {
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_INVENTORY,
  type CompatibilityFixture,
  type CompatibilityRecord,
} from "../src/showcases/compatibility.ts";

// `bun run docs:generate` runs the validator on the real inventory; these
// cases prove it rejects each kind of broken entry instead of passing it.

const [record] = COMPATIBILITY_INVENTORY;
const [fixture] = COMPATIBILITY_FIXTURES;
const binary = COMPATIBILITY_FIXTURES.find(({ sha256 }) => sha256 !== undefined);
const unsupported = COMPATIBILITY_INVENTORY.find(({ status }) => status === "unsupported");
if (!record || !fixture || !binary || !unsupported) throw new Error("The inventory is empty");

function issues(
  records: readonly CompatibilityRecord[],
  fixtures: readonly CompatibilityFixture[] = COMPATIBILITY_FIXTURES,
): string[] {
  return collectCompatibilityIssues(records, fixtures);
}

const replaced = (original: CompatibilityRecord, change: Partial<CompatibilityRecord>) =>
  COMPATIBILITY_INVENTORY.map((entry) => (entry === original ? { ...entry, ...change } : entry));

it.each([
  [
    "a duplicate record",
    () => issues([...COMPATIBILITY_INVENTORY, record]),
    `duplicate compatibility record id: ${record.id}`,
  ],
  [
    "a duplicate fixture",
    () => issues(COMPATIBILITY_INVENTORY, [...COMPATIBILITY_FIXTURES, fixture]),
    `duplicate compatibility fixture id: ${fixture.id}`,
  ],
  [
    "a record without evidence",
    () => issues(replaced(record, { evidence: [] })),
    `compatibility record has no executable evidence: ${record.id}`,
  ],
  [
    "an unknown fixture",
    () => issues(replaced(record, { fixtureIds: ["missing-fixture"] })),
    `unknown compatibility fixture: ${record.id}=missing-fixture`,
  ],
  [
    "evidence outside the repository",
    () => issues(replaced(record, { evidence: ["../outside.test.ts"] })),
    `invalid compatibility evidence path: ${record.id}=../outside.test.ts`,
  ],
  [
    "an invalid digest",
    () =>
      issues(
        COMPATIBILITY_INVENTORY,
        COMPATIBILITY_FIXTURES.map((entry) =>
          entry === binary ? { ...entry, sha256: "not-a-digest" } : entry,
        ),
      ),
    `compatibility fixture has invalid sha256: ${binary.id}`,
  ],
  [
    "an unsupported record relabeled as supported",
    () => issues(replaced(unsupported, { status: "supported" })),
    `inconsistent compatibility status/result mode: ${unsupported.id}=supported/unsupported`,
  ],
] as const)("rejects %s", (_case, collect, issue) => {
  expect(collect()).toContain(issue);
});
