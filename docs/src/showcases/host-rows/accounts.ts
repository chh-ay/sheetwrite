import type { HostEntity } from "@docs/showcases/host-rows-store.js";
import type { DocumentOp } from "@sheetwrite/core";

/*
 * The host's account store as the page starts it, and the operations the
 * write-policy controls send. Plain data: the island and the engine module
 * (boot.ts) both read it.
 */

export const LEAD_IMPORT_ROWS = 10_000;
/** Accounts the host store starts with. */
export const ACCOUNT_ROWS = 48;
/** One Grid commit accepts at most 10,000 operations, so cells load in batches. */
export const LEAD_LOAD_BATCH_ROWS = 1_800;

/** The ARR value the host asks the server to store for account-002. */
export const REQUESTED_OPERATIONS: DocumentOp[] = [
  {
    op: "set",
    addr: { sheet: "sheet1", row: 1, col: 1 },
    value: { kind: "literal", value: 79_950 },
  },
];
/** The server rounds the requested ARR to the nearest 1,000 before it stores it. */
export const SERVER_NORMALIZED_OPERATIONS: DocumentOp[] = [
  {
    op: "set",
    addr: { sheet: "sheet1", row: 1, col: 1 },
    value: { kind: "literal", value: 80_000 },
  },
];

// Widths sum to 880 px so every column is visible in the demo beside the side
// panel at desktop widths; a clipped last column reads as a broken layout.
export const ACCOUNT_COLUMNS = [
  { key: "name" as const, title: "Account", width: 280 },
  { key: "amount" as const, title: "ARR · USD", type: "number" as const, width: 130 },
  { key: "region" as const, title: "Region", width: 110 },
  { key: "owner" as const, title: "Owner", width: 170 },
  { key: "stage" as const, title: "Stage", width: 190 },
];
export const OWNERS = ["Ada Chen", "Lin Patel", "Maya Reyes", "Noah Ellis"];
export const REGIONS = ["North", "South", "West", "East"];
const STAGES = ["Renewal", "Qualification", "Proposal", "Contract review"];
const ACCOUNT_NAMES = [
  "Alder Quay",
  "Beacon Ridge",
  "Juniper",
  "Cedar Vale",
  "Marsh Point",
  "Willow Lane",
  "Orchard Bay",
  "Cobalt Grove",
];
const INDUSTRIES = ["Logistics", "Health", "Works", "Energy", "Foods", "Systems"];

export const INITIAL_ACCOUNTS: HostEntity[] = Array.from({ length: ACCOUNT_ROWS }, (_, index) => ({
  id: `account-${String(index + 1).padStart(3, "0")}`,
  name: `${ACCOUNT_NAMES[index % ACCOUNT_NAMES.length]} ${INDUSTRIES[Math.floor(index / ACCOUNT_NAMES.length)]}`,
  amount:
    index === 0
      ? 120_000
      : index === 1
        ? 75_000
        : index === 2
          ? 210_000
          : 24_000 + ((index * 17) % 72) * 3_000,
  region: REGIONS[index % REGIONS.length] ?? "North",
  owner: OWNERS[index % OWNERS.length] ?? "Ada Chen",
  stage: STAGES[index % STAGES.length] ?? "Qualification",
}));
