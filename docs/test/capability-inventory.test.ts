import { expect, it } from "bun:test";

import {
  CAPABILITY_INVENTORY,
  CAPABILITY_OWNERS,
  type Capability,
} from "../src/showcases/capabilities.ts";
import {
  collectCapabilityIssues,
  collectMissingCapabilityFiles,
} from "../src/showcases/capability-validation.ts";

// `bun run docs:generate` runs both validators on the real inventory; these
// cases prove they reject each kind of broken entry instead of passing it.

/** The inventory with one capability's fields replaced. */
function withCapability(id: string, change: Partial<Capability>): Capability[] {
  return CAPABILITY_INVENTORY.map((capability) =>
    capability.id === id ? { ...capability, ...change } : capability,
  );
}

it.each([
  [
    "a required interaction tested outside a browser",
    { testPath: "packages/core/test/grid.test.ts" },
    "needs a browser contract",
  ],
  ["a missing test path", { testPath: "" }, "executable test path is missing"],
  [
    "a secondary owner without a reason",
    { secondary: [{ owner: "svelte", reason: "" }] },
    "must declare its intent",
  ],
  [
    "the primary owner listed again",
    { secondary: [{ owner: "collaboration", reason: "twice" }] },
    "duplicates the primary owner",
  ],
  [
    "a secondary owner declared twice",
    {
      secondary: [
        { owner: "svelte", reason: "a" },
        { owner: "svelte", reason: "b" },
      ],
    },
    "declared twice",
  ],
] as const)("rejects %s", (_case, change, issue) => {
  const capabilityId = "testPath" in change ? "editing.cell-edit" : "collab.presence";
  const issues = collectCapabilityIssues(withCapability(capabilityId, change), CAPABILITY_OWNERS);
  expect(issues.join("\n")).toContain(issue);
});

it("rejects a capability whose owner or owner route file is gone", () => {
  const owners = CAPABILITY_OWNERS.filter((owner) => owner.id !== "database");
  expect(collectCapabilityIssues(CAPABILITY_INVENTORY, owners).join("\n")).toContain(
    '"database" is not a registered showcase',
  );
  expect(
    collectMissingCapabilityFiles(
      CAPABILITY_INVENTORY,
      CAPABILITY_OWNERS,
      (path) => path !== "docs/src/routes/showcases.database.tsx",
    ),
  ).toContain("owner database: route file docs/src/routes/showcases.database.tsx does not exist");
});
