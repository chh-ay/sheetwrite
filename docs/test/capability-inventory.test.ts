import { describe, expect, it } from "bun:test";
import {
  CAPABILITY_INVENTORY,
  CAPABILITY_OWNERS,
  type Capability,
  type CapabilityOwner,
} from "../src/showcases/capabilities.ts";
import {
  collectCapabilityIssues,
  collectMissingCapabilityFiles,
} from "../src/showcases/capability-validation.ts";

function cloneInventory(): Capability[] {
  return structuredClone(CAPABILITY_INVENTORY) as Capability[];
}

function cloneOwners(): CapabilityOwner[] {
  return structuredClone(CAPABILITY_OWNERS) as CapabilityOwner[];
}

/**
 * The checked-in public contract. Deleting a capability entry from the
 * inventory fails here even though the structural validator can only see what
 * remains.
 */
const REQUIRED_CAPABILITY_IDS = [
  "editing.cell-edit",
  "editing.selection",
  "editing.clipboard",
  "editing.fill",
  "editing.undo-redo",
  "editing.search-replace",
  "workbook.sheet-operations",
  "workbook.host-operations",
  "formulas.entry-recalc",
  "formulas.references-names",
  "data.aggregation",
  "data.sort-filter",
  "data.validation-rules",
  "data.protection",
  "annotations.notes",
  "annotations.metadata",
  "formatting.cell-styles",
  "formatting.merges",
  "formatting.frozen-panes",
  "scale.dense-datasource",
  "scale.paged-million-rows",
  "scale.query-behavior",
  "scale.wide-pages",
  "scale.cache-churn",
  "rendering.renderer-selection",
  "rendering.worker-fallback",
  "rendering.worker-offscreen",
  "perf.wasm-crossings",
  "perf.benchmark-evidence",
  "io.xlsx-import",
  "io.xlsx-export",
  "io.csv-tsv",
  "io.fidelity-loss-warnings",
  "io.hostile-input-limits",
  "io.package-isolation",
  "persistence.snapshot-load",
  "persistence.append-only-commits",
  "persistence.idempotent-retry",
  "persistence.conflict-tail-fallback",
  "persistence.compaction",
  "persistence.reload-recovery",
  "persistence.live-counters",
  "persistence.host-state",
  "offline.durable-pending",
  "offline.connectivity-activity",
  "sync.reconnect-drain",
  "collab.two-client-convergence",
  "collab.sequencing-acks",
  "collab.version-gaps",
  "collab.presence",
  "collab.conflicts",
  "collab.recovery",
  "lifecycle.engine-events",
  "lifecycle.vanilla",
  "lifecycle.react",
  "lifecycle.vue",
  "lifecycle.svelte",
] as const;

describe("capability inventory contract", () => {
  it("covers every required public capability exactly once", () => {
    const ids = CAPABILITY_INVENTORY.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const required of REQUIRED_CAPABILITY_IDS) expect(ids).toContain(required);
    // The other direction: nothing ships outside the checked-in contract.
    const contract: readonly string[] = REQUIRED_CAPABILITY_IDS;
    for (const id of ids) expect(contract).toContain(id);
  });
});

describe("capability inventory fails closed", () => {
  it("rejects a capability whose owner was deleted", () => {
    const owners = cloneOwners().filter((owner) => owner.id !== "database");
    const issues = collectCapabilityIssues(CAPABILITY_INVENTORY, owners);
    expect(issues.some((issue) => issue.includes('"database" is not a registered showcase'))).toBe(
      true,
    );
  });

  it("rejects a missing owner route file", () => {
    const missing = collectMissingCapabilityFiles(
      CAPABILITY_INVENTORY,
      CAPABILITY_OWNERS,
      (path) => path !== "docs/src/routes/showcases.database.tsx",
    );
    expect(missing).toContain(
      "owner database: route file docs/src/routes/showcases.database.tsx does not exist",
    );
  });

  it("rejects a required interaction without a browser contract", () => {
    const inventory = cloneInventory();
    const capability = inventory.find((entry) => entry.id === "editing.cell-edit");
    if (!capability) throw new Error("editing.cell-edit missing from inventory");
    capability.testPath = "packages/core/test/grid.test.ts";
    const issues = collectCapabilityIssues(inventory, CAPABILITY_OWNERS);
    expect(issues.some((issue) => issue.includes("needs a browser contract"))).toBe(true);

    capability.testPath = "";
    const emptied = collectCapabilityIssues(inventory, CAPABILITY_OWNERS);
    expect(emptied.some((issue) => issue.includes("executable test path is missing"))).toBe(true);
  });

  it("rejects accidental duplicate ownership", () => {
    const inventory = cloneInventory();
    const capability = inventory.find((entry) => entry.id === "collab.presence");
    if (!capability) throw new Error("collab.presence missing from inventory");

    capability.secondary = [{ owner: "svelte", reason: "" }];
    const undeclared = collectCapabilityIssues(inventory, CAPABILITY_OWNERS);
    expect(undeclared.some((issue) => issue.includes("must declare its intent"))).toBe(true);

    capability.secondary = [{ owner: "collaboration", reason: "same route twice" }];
    const primaryDuplicate = collectCapabilityIssues(inventory, CAPABILITY_OWNERS);
    expect(primaryDuplicate.some((issue) => issue.includes("duplicates the primary owner"))).toBe(
      true,
    );

    capability.secondary = [
      { owner: "svelte", reason: "declared" },
      { owner: "svelte", reason: "declared again" },
    ];
    const doubled = collectCapabilityIssues(inventory, CAPABILITY_OWNERS);
    expect(doubled.some((issue) => issue.includes("declared twice"))).toBe(true);
  });
});
