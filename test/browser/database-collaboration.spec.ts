import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  COLLABORATION_WORKBOOK_COLUMNS,
  COLLABORATION_WORKBOOK_ROWS,
  makeCollaborationSnapshot,
} from "../../docs/src/showcases/collaboration-protocol.js";
import { makeDatabaseSeedSnapshot } from "../../docs/src/showcases/showcase-database.js";
import { siteUrl } from "./playwright.config.js";

// Browser contracts for the two capability proof routes:
//   /showcases/database/       — IndexedDB persistence lifecycle
//   /showcases/collaboration/  — two-client sequencing protocol
// Every test runs in a fresh context, so each page starts from empty
// IndexedDB and the demos must seed, converge, and clean up on their own.

const DATABASE_URL = siteUrl("/showcases/database/");
const COLLABORATION_URL = siteUrl("/showcases/collaboration/");
const READY_TIMEOUT = 30_000;
const CHAOS_TIMEOUT = 40_000;
const CONFLICT_RECOVERY_TIMEOUT = 2_000;

/** Seed revenue: every ledger row's seats × rate, straight from the seed snapshot. */
function seedRevenueTotal(): number {
  const sheet = makeDatabaseSeedSnapshot().sheets.find((candidate) => candidate.id === "ledger");
  if (!sheet) throw new Error("The database seed has no ledger sheet");
  const seats: number[] = [];
  const rates: number[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.value.kind !== "literal" || typeof cell.value.value !== "number") continue;
      const row = block.startRow + cell.rowOffset;
      if (cell.colOffset === 1) seats[row] = cell.value.value;
      if (cell.colOffset === 2) rates[row] = cell.value.value;
    }
  }
  return seats.reduce((total, count, row) => total + count * (rates[row] ?? 0), 0);
}

/** Seed forecast column by row, straight from the collaboration snapshot. */
function seedForecastAmounts(): readonly number[] {
  const sheet = makeCollaborationSnapshot().sheets.find((candidate) => candidate.id === "plan");
  if (!sheet) throw new Error("The collaboration seed has no plan sheet");
  const amounts: number[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.colOffset !== 2 || cell.value.kind !== "literal") continue;
      if (typeof cell.value.value === "number") {
        amounts[block.startRow + cell.rowOffset] = cell.value.value;
      }
    }
  }
  return amounts;
}

/** Seed conflict on the collaboration plan: account names by row. */
function seedPlanAccounts(): readonly string[] {
  const sheet = makeCollaborationSnapshot().sheets.find((candidate) => candidate.id === "plan");
  if (!sheet) throw new Error("The collaboration seed has no plan sheet");
  const accounts: string[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.colOffset !== 0 || cell.value.kind !== "literal") continue;
      if (typeof cell.value.value === "string") {
        accounts[block.startRow + cell.rowOffset] = cell.value.value;
      }
    }
  }
  return accounts;
}

/** Both pages show money totals as whole US dollars, e.g. "$92,814". */
const usd = (value: number): string => `$${value.toLocaleString("en-US")}`;
const DATABASE_SEED_TOTAL = usd(seedRevenueTotal());
const COLLABORATION_SEED_VALUE = seedForecastAmounts().reduce((total, amount) => total + amount, 0);
const COLLABORATION_SEED_TOTAL = usd(COLLABORATION_SEED_VALUE);
/** Both analysts own half the forecast; these are the sample-edit rows. */
const ANA_ACCOUNT = seedPlanAccounts()[0] ?? "the first row";
const CHAOS_CELLS = COLLABORATION_WORKBOOK_ROWS * COLLABORATION_WORKBOOK_COLUMNS;
const FORECAST_ADJUSTMENT = 500;

interface BootErrors {
  console: string[];
  page: string[];
}

function collectErrors(page: Page): BootErrors {
  const errors: BootErrors = { console: [], page: [] };
  page.on("console", (message) => {
    if (message.type() === "error") errors.console.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.page.push(error.message);
  });
  return errors;
}

async function databaseReady(page: Page): Promise<void> {
  await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-status", "ready", {
    timeout: READY_TIMEOUT,
  });
}

async function collaborationReady(page: Page): Promise<void> {
  await expect(page.getByTestId("clb-status")).toHaveAttribute("data-status", "ready", {
    timeout: READY_TIMEOUT,
  });
}

function client(page: Page, slug: "a" | "b"): Locator {
  return page.locator(`[data-client="${slug}"]`);
}

function faultClient(page: Page, slug: "a" | "b"): Locator {
  return page.locator(`[data-fault-client="${slug}"]`);
}

async function openAdvancedFaults(page: Page): Promise<void> {
  const advanced = page.locator(".sw-clb__advanced");
  await advanced.locator("summary").click();
  await expect(advanced).toHaveAttribute("open", "");
}

test.describe("database proof", () => {
  test("boots from IndexedDB, commits, compacts, and reports live counters", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    await expect(page.getByTestId("dbx-version")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).toHaveText(DATABASE_SEED_TOTAL);
    await expect(page.getByTestId("dbx-tail")).toHaveText("0");

    await expect(page.getByTestId("dbx-grid")).toBeInViewport();
    const autosaveControl = page.getByRole("checkbox", { name: "Autosave" });
    await expect(autosaveControl).toBeChecked();

    const commit = page.getByRole("button", { name: "Commit sample edit" });
    await commit.click();
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).not.toHaveText(DATABASE_SEED_TOTAL);

    // Nine more commits exceed the showcase tail bound and force compaction.
    for (let index = 0; index < 9; index++) {
      await commit.click();
      await expect(page.getByTestId("dbx-version")).toHaveText(String(index + 2));
    }
    const snapshotVersion = Number(await page.getByTestId("dbx-snapshot-version").textContent());
    const tail = Number(await page.getByTestId("dbx-tail").textContent());
    expect(snapshotVersion).toBeGreaterThan(0);
    // The tail holds exactly the versions after the compacted snapshot.
    expect(snapshotVersion + tail).toBe(10);
    expect(Number(await page.getByTestId("dbx-reads").textContent())).toBeGreaterThan(0);
    expect(Number(await page.getByTestId("dbx-writes").textContent())).toBeGreaterThan(0);
    await expect(page.getByTestId("dbx-bytes")).not.toHaveText("0 B");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("keeps durable pending work across a real page reload", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    await page.getByRole("checkbox", { name: "Autosave" }).uncheck();
    const commit = page.getByRole("button", { name: "Commit sample edit" });
    await commit.click();
    await commit.click();
    await expect(page.getByTestId("dbx-pending")).toHaveText("2");
    await expect(page.getByTestId("dbx-version")).toHaveText("0");
    // Durable puts are asynchronous; reload only once the queue is fully
    // persisted (activity leaves "persisting" for the offline "pending" state).
    await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-activity", "pending");

    await page.reload();
    await databaseReady(page);
    // Autosave defaults on after reload: the restored queue drains in order.
    await expect(page.getByTestId("dbx-pending")).toHaveText("0", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-total")).not.toHaveText(DATABASE_SEED_TOTAL);
    // One mount restored the queue: a second StrictMode boot would restore it twice.
    await expect(page.getByTestId("dbx-log").locator("li", { hasText: "Restored" })).toHaveCount(1);
    const drainedTotal = await page.getByTestId("dbx-total").textContent();

    // The in-page session restart reads the same data back from IndexedDB.
    await page.getByRole("button", { name: "Close and reopen session" }).click();
    await databaseReady(page);
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-total")).toHaveText(drainedTotal ?? "");

    // The page's own crash test does the same: three held edits, then a real reload.
    await page.getByTestId("dbx-crash").click();
    const report = page.getByTestId("dbx-crash-report");
    await expect(report).toHaveAttribute("data-state", "passed", { timeout: READY_TIMEOUT });
    await expect(report).toContainText("restored 3");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-version")).toHaveText("5");
    await expect(page.getByTestId("dbx-log").locator("li", { hasText: "Restored" })).toHaveCount(1);

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("restores a cleared 100,000-cell range as one step", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    await page.getByTestId("dbx-large-undo").click();
    const report = page.getByTestId("dbx-undo-report");
    await expect(report).toHaveAttribute("data-state", "passed", { timeout: READY_TIMEOUT });
    await expect(report).toContainText("one server version");
    await expect(report).toContainText("1 history step");
    // The clear and its single restore both reached the durable store.
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).toHaveText(DATABASE_SEED_TOTAL);
    await expect(
      page.getByTestId("dbx-log").locator("li", { hasText: "restoreBlock committed as v2" }),
    ).toHaveCount(1);

    // The same page proves the oversize path: a dropped entry, an older undo kept.
    await page.getByTestId("dbx-diagnostics").locator("summary").click();
    await page.getByTestId("dbx-tight-limit").click();
    const limitReport = page.getByTestId("dbx-limit-report");
    await expect(limitReport).toHaveAttribute("data-state", "passed");
    await expect(limitReport).toContainText("resource-limit");
    await expect(limitReport).toContainText("older edit still undid");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("resumes a stalled send from the durable queue on its own", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    const diagnostics = page.getByTestId("dbx-diagnostics");
    await diagnostics.locator("summary").click();
    await page.getByRole("button", { name: "Lose next acknowledgement" }).click();
    await page.getByRole("button", { name: "Commit sample edit" }).click();

    // The acknowledgement never arrives. Autosave must resend the durable record
    // with its original mutation id and drain the queue without another edit.
    await expect(page.getByTestId("dbx-pending")).toHaveText("0", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    await expect(
      page.getByTestId("dbx-log").locator("li", { hasText: "Duplicate acknowledgement" }),
    ).toHaveCount(1);

    // The next local edit after an external commit still conflicts and recovers
    // in place: the missed version is applied, the local work is resubmitted.
    await page.getByRole("button", { name: "External writer commit" }).click();
    await page.getByRole("button", { name: "Commit sample edit" }).click();
    await expect(page.getByTestId("dbx-version")).toHaveText("3", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(
      page.getByTestId("dbx-log").locator("li", { hasText: "Recovered at v" }),
    ).toHaveCount(1);

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("answers duplicate retries idempotently and recovers from conflicts", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(DATABASE_URL);
    await databaseReady(page);

    const diagnostics = page.getByTestId("dbx-diagnostics");
    await diagnostics.locator("summary").click();
    await expect(diagnostics).toHaveAttribute("open", "");

    // Lost acknowledgement: the server stores v1, the client keeps the commit
    // pending, and the retry with the same mutation id must not apply it twice.
    await page.getByRole("button", { name: "Lose next acknowledgement" }).click();
    await page.getByRole("button", { name: "Commit sample edit" }).click();
    await expect(page.getByTestId("dbx-pending")).toHaveText("1");
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    const committedTotal = await page.getByTestId("dbx-total").textContent();

    await page.getByRole("button", { name: "Retry pending commit" }).click();
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    await expect(page.getByTestId("dbx-total")).toHaveText(committedTotal ?? "");

    // Conflict: an external writer advances the head; the first local commit
    // must autosave, rebase over the missed tail, and resubmit without a remount.
    await page.getByRole("button", { name: "External writer commit" }).click();
    // Control availability tracks the asynchronous external write, not just its click.
    await expect(page.getByRole("button", { name: "Commit sample edit" })).toBeEnabled();
    const recoveryStarted = performance.now();
    await page.getByRole("button", { name: "Commit sample edit" }).click();
    await expect(page.getByTestId("dbx-version")).toHaveText("3", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    // Seed $92,814 + row 0 seat ($29) + row 1 seat ($49), with row 4's
    // 65 seats repriced from $49 to $1.70 by the external v2 writer.
    await expect(page.getByTestId("dbx-total")).toHaveText("$89,817.5");
    // Recovery advances the live Grid instead of rebuilding the document.
    await expect(
      page.getByTestId("dbx-log").locator("li", { hasText: "Recovered at v" }),
    ).toHaveCount(1);
    const recoveryMs = performance.now() - recoveryStarted;
    await test.info().attach("conflict-recovery-timing", {
      body: JSON.stringify({ recoveryMs }),
      contentType: "application/json",
    });
    // A full rebuild of the usage sheet previously took 4.3 seconds at idle.
    expect(recoveryMs).toBeLessThan(CONFLICT_RECOVERY_TIMEOUT);

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });
});

test.describe("collaboration proof", () => {
  test("converges two clients with ordered commits and presence", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);

    await expect(page.getByTestId("clb-a-total")).toHaveText(COLLABORATION_SEED_TOTAL);
    await expect(page.getByTestId("clb-b-total")).toHaveText(COLLABORATION_SEED_TOTAL);

    const anaGrid = page.getByTestId("clb-a-grid");
    const bramGrid = page.getByTestId("clb-b-grid");
    await expect(anaGrid).toBeVisible();
    await expect(bramGrid).toBeVisible();

    await client(page, "a")
      .getByRole("button", { name: `Add $500 to ${ANA_ACCOUNT}` })
      .click();
    const raisedTotal = usd(COLLABORATION_SEED_VALUE + FORECAST_ADJUSTMENT);
    await expect(page.getByTestId("clb-a-total")).toHaveText(raisedTotal);
    await expect(page.getByTestId("clb-b-total")).toHaveText(raisedTotal);
    await expect(page.getByTestId("clb-a-version")).toHaveText("v1");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v1");
    await expect(page.getByTestId("clb-server-version")).toHaveText("v1");

    // Presence: the sample edit selected Ana's cell; Bram sees her.
    await expect(page.getByTestId("clb-b-roster")).toContainText("Ana");
    await expect(page.getByTestId("clb-a-roster")).toContainText("Bram");
    await expect(
      page.locator('[data-testid="clb-b-grid"] [data-sheetwrite-presence="actor-ana"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("converges after a storm of edits, disconnects, and reordered broadcasts", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);

    await page.getByTestId("clb-chaos").click();
    const chaos = page.locator(".sw-clb__chaos");
    await expect(chaos).toHaveAttribute("data-phase", "converged", { timeout: CHAOS_TIMEOUT });
    await expect(page.getByTestId("clb-chaos-report")).toContainText(
      `All ${CHAOS_CELLS} cells match`,
    );
    // Both clients end on the server head with nothing queued.
    const serverVersion = await page.getByTestId("clb-server-version").textContent();
    await expect(page.getByTestId("clb-a-version")).toHaveText(serverVersion ?? "");
    await expect(page.getByTestId("clb-b-version")).toHaveText(serverVersion ?? "");
    await expect(page.getByTestId("clb-a-total")).toHaveText(
      (await page.getByTestId("clb-b-total").textContent()) ?? "",
    );

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("applies a multi-version restore as one atomic batch on the peer", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);
    const seedRevenue = seedForecastAmounts().reduce((total, amount) => total + amount, 0);

    await page.getByTestId("clb-restore").click();
    const report = page.getByTestId("clb-batch-report");
    await expect(report).toHaveAttribute("data-state", "passed", { timeout: READY_TIMEOUT });
    await expect(report).toContainText("one atomic batch");
    await expect(report).toContainText("1 transaction");
    await expect(report).toContainText("525,000");
    // Both clients converge, and the untouched forecast keeps its total.
    const serverVersion = await page.getByTestId("clb-server-version").textContent();
    await expect(page.getByTestId("clb-a-version")).toHaveText(serverVersion ?? "");
    await expect(page.getByTestId("clb-b-version")).toHaveText(serverVersion ?? "");
    await expect(page.getByTestId("clb-a-total")).toHaveText(usd(seedRevenue));
    await expect(page.getByTestId("clb-b-total")).toHaveText(usd(seedRevenue));

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });

  test("buffers version gaps and recovers from a base-version conflict", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);
    await openAdvancedFaults(page);

    const anaEdit = client(page, "a").getByRole("button", { name: `Add $500 to ${ANA_ACCOUNT}` });
    // Gap: Bram's link holds v1 back, v2 arrives first and buffers.
    await faultClient(page, "b").getByRole("button", { name: "Hold next broadcast" }).click();
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v1");
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v0");

    await faultClient(page, "b")
      .getByRole("button", { name: /Release held/ })
      .click();
    await expect(page.getByTestId("clb-b-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-a-total")).toHaveText(
      (await page.getByTestId("clb-b-total").textContent()) ?? "",
    );

    // Conflict: Ana misses a server-authored commit and commits on a stale base.
    await faultClient(page, "a").getByRole("button", { name: "Hold next broadcast" }).click();
    await page.getByRole("button", { name: "Server-authored commit" }).click();
    await expect(page.getByTestId("clb-b-version")).toHaveText("v3");
    await expect(page.getByTestId("clb-a-version")).toHaveText("v2");
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v4");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v4");
    // Ana's rebased edit lands on top of the server-authored commit at both clients.
    const finalTotal = await page.getByTestId("clb-b-total").textContent();
    await expect(page.getByTestId("clb-a-total")).toHaveText(finalTotal ?? "");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });
});
