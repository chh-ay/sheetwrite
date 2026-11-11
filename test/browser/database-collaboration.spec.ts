import type { Locator, Page } from "@playwright/test";

import {
  COLLABORATION_WORKBOOK_COLUMNS,
  COLLABORATION_WORKBOOK_ROWS,
  makeCollaborationSnapshot,
} from "../../docs/src/showcases/collaboration-seed.js";
import { makeDatabaseSeedSnapshot } from "../../docs/src/showcases/database-seed.js";
import type { WorkbookSnapshot } from "../../packages/core/src/types.js";
import { expect, test } from "./fixtures.js";

// The two capability proof routes: /showcases/database/ (IndexedDB
// persistence lifecycle) and /showcases/collaboration/ (two-client
// sequencing). Every test starts from an empty IndexedDB in a fresh context.

const READY_TIMEOUT = 30_000;
/** Covers the showcase's 6 s storm and 30 s drain window, plus remount time. */
const CHAOS_TIMEOUT = 50_000;
/** A full rebuild of the usage sheet once took 4.3 s at idle; recovery stays well under. */
const CONFLICT_RECOVERY_MS = 2_000;
/** The database showcase's IndexedDB names (docs/src/showcases/DatabaseShowcase.tsx). */
const DOCUMENT_DATABASE = "sheetwrite-showcase-subscription-revenue";
const QUEUE_DATABASE = "sheetwrite-showcase-subscription-revenue-queue";
/** Newer than any queue schema version, so the showcase cannot open the queue. */
const FUTURE_QUEUE_VERSION = 1_000;
const FORECAST_ADJUSTMENT = 500;

/** One seed column by row, read from a showcase seed snapshot. */
function seedColumn(snapshot: WorkbookSnapshot, sheetId: string, col: number): unknown[] {
  const sheet = snapshot.sheets.find((candidate) => candidate.id === sheetId);
  if (!sheet) throw new Error(`The seed has no ${sheetId} sheet`);
  const values: unknown[] = [];
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      if (cell.colOffset === col && cell.value.kind === "literal") {
        values[block.startRow + cell.rowOffset] = cell.value.value;
      }
    }
  }
  return values;
}

/** Both pages show money totals as whole US dollars, e.g. "$92,814". */
const usd = (value: number): string => `$${value.toLocaleString("en-US")}`;
const ledger = makeDatabaseSeedSnapshot();
const seats = seedColumn(ledger, "ledger", 1).map(Number);
const rates = seedColumn(ledger, "ledger", 2).map(Number);
const DATABASE_SEED_TOTAL = usd(
  seats.reduce((total, count, row) => total + count * (rates[row] ?? 0), 0),
);
const plan = makeCollaborationSnapshot();
const COLLABORATION_SEED_VALUE = seedColumn(plan, "plan", 2)
  .filter((amount): amount is number => typeof amount === "number")
  .reduce((total, amount) => total + amount, 0);
const COLLABORATION_SEED_TOTAL = usd(COLLABORATION_SEED_VALUE);
const ANA_ACCOUNT = String(seedColumn(plan, "plan", 0)[0] ?? "the first row");

type DeletionOutcome = "deleted" | "blocked" | "failed";

/** Deletes one IndexedDB database; an open connection that ignores the request blocks it. */
function deleteDatabase(page: Page, name: string): Promise<DeletionOutcome> {
  return page.evaluate(async (databaseName) => {
    const { promise, resolve } = Promise.withResolvers<DeletionOutcome>();
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve("deleted");
    request.onerror = () => resolve("failed");
    request.onblocked = () => resolve("blocked");
    return promise;
  }, name);
}

async function openDatabase(page: Page): Promise<void> {
  await page.goto("/showcases/database/");
  await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-status", "ready", {
    timeout: READY_TIMEOUT,
  });
}

async function openCollaboration(page: Page): Promise<void> {
  await page.goto("/showcases/collaboration/");
  await expect(page.getByTestId("clb-status")).toHaveAttribute("data-status", "ready", {
    timeout: READY_TIMEOUT,
  });
}

async function expectBothClients(page: Page, version: string, total?: string): Promise<void> {
  await expect(page.getByTestId("clb-a-version")).toHaveText(version);
  await expect(page.getByTestId("clb-b-version")).toHaveText(version);
  const expectedTotal = total ?? (await page.getByTestId("clb-b-total").textContent()) ?? "";
  await expect(page.getByTestId("clb-a-total")).toHaveText(expectedTotal);
  await expect(page.getByTestId("clb-b-total")).toHaveText(expectedTotal);
}

function logEntry(page: Page, text: string): Locator {
  return page.getByTestId("dbx-log").locator("li", { hasText: text });
}

test.describe("database proof", () => {
  test("boots from IndexedDB, commits, compacts, and reports live counters", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openDatabase(page);
    await expect(page.getByTestId("dbx-version")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).toHaveText(DATABASE_SEED_TOTAL);
    await expect(page.getByTestId("dbx-tail")).toHaveText("0");
    await expect(page.getByTestId("dbx-grid")).toBeInViewport();
    await expect(page.getByRole("checkbox", { name: "Autosave" })).toBeChecked();

    const commit = page.getByRole("button", { name: "Commit sample edit" });
    await commit.click();
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).not.toHaveText(DATABASE_SEED_TOTAL);

    // Nine more commits exceed the showcase tail bound and force compaction.
    for (let version = 2; version <= 10; version++) {
      await commit.click();
      await expect(page.getByTestId("dbx-version")).toHaveText(String(version));
    }
    const snapshotVersion = Number(await page.getByTestId("dbx-snapshot-version").textContent());
    expect(snapshotVersion).toBeGreaterThan(0);
    // The tail holds exactly the versions after the compacted snapshot.
    expect(snapshotVersion + Number(await page.getByTestId("dbx-tail").textContent())).toBe(10);
    expect(Number(await page.getByTestId("dbx-reads").textContent())).toBeGreaterThan(0);
    expect(Number(await page.getByTestId("dbx-writes").textContent())).toBeGreaterThan(0);
    await expect(page.getByTestId("dbx-bytes")).not.toHaveText("0 B");
  });

  test("keeps durable pending work across a real page reload", async ({ page }) => {
    await openDatabase(page);
    await page.getByRole("checkbox", { name: "Autosave" }).uncheck();
    const commit = page.getByRole("button", { name: "Commit sample edit" });
    await commit.click();
    await commit.click();
    await expect(page.getByTestId("dbx-pending")).toHaveText("2");
    await expect(page.getByTestId("dbx-version")).toHaveText("0");
    // Durable puts are asynchronous; reload only once the queue is persisted.
    await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-activity", "pending");

    await page.reload();
    await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-status", "ready", {
      timeout: READY_TIMEOUT,
    });
    // Autosave defaults on after reload: the restored queue drains in order.
    await expect(page.getByTestId("dbx-pending")).toHaveText("0", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-total")).not.toHaveText(DATABASE_SEED_TOTAL);
    // One mount restored the queue: a second StrictMode boot would restore it twice.
    await expect(logEntry(page, "Restored")).toHaveCount(1);
    const drainedTotal = (await page.getByTestId("dbx-total").textContent()) ?? "";

    // The in-page session restart reads the same data back from IndexedDB.
    await page.getByRole("button", { name: "Close and reopen session" }).click();
    await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-status", "ready", {
      timeout: READY_TIMEOUT,
    });
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-total")).toHaveText(drainedTotal);

    // The page's own crash test does the same: three held edits, then a real reload.
    await page.getByTestId("dbx-crash").click();
    const report = page.getByTestId("dbx-crash-report");
    await expect(report).toHaveAttribute("data-state", "passed", { timeout: READY_TIMEOUT });
    await expect(report).toContainText("restored 3");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-version")).toHaveText("5");
    await expect(logEntry(page, "Restored")).toHaveCount(1);
  });

  test("restores a cleared 100,000-cell range as one step", async ({ page }) => {
    await openDatabase(page);
    await page.getByTestId("dbx-large-undo").click();
    const report = page.getByTestId("dbx-undo-report");
    await expect(report).toHaveAttribute("data-state", "passed", { timeout: READY_TIMEOUT });
    await expect(report).toContainText("one server version");
    await expect(report).toContainText("1 history step");
    // The clear and its single restore both reached the durable store.
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    await expect(page.getByTestId("dbx-total")).toHaveText(DATABASE_SEED_TOTAL);
    await expect(logEntry(page, "restoreBlock committed as v2")).toHaveCount(1);

    // The oversize path: a dropped entry, an older undo kept.
    await page.getByTestId("dbx-diagnostics").locator("summary").click();
    await page.getByTestId("dbx-tight-limit").click();
    const limitReport = page.getByTestId("dbx-limit-report");
    await expect(limitReport).toHaveAttribute("data-state", "passed");
    await expect(limitReport).toContainText("resource-limit");
    await expect(limitReport).toContainText("older edit still undid");
  });

  test("answers a lost acknowledgement idempotently and recovers from a conflict", async ({
    page,
  }) => {
    await openDatabase(page);
    await page.getByTestId("dbx-diagnostics").locator("summary").click();
    const commit = page.getByRole("button", { name: "Commit sample edit" });

    // The server stores v1 but the acknowledgement never arrives. Autosave must
    // resend the durable record with its mutation id, and the retry must not
    // apply it twice.
    await page.getByRole("button", { name: "Lose next acknowledgement" }).click();
    await commit.click();
    await expect(page.getByTestId("dbx-pending")).toHaveText("0", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-version")).toHaveText("1");
    await expect(logEntry(page, "Duplicate acknowledgement")).toHaveCount(1);

    // An external writer advances the head; the next local commit rebases over
    // the missed tail and resubmits in place, without a remount.
    await page.getByRole("button", { name: "External writer commit" }).click();
    await expect(commit).toBeEnabled();
    const recoveryStarted = performance.now();
    await commit.click();
    await expect(page.getByTestId("dbx-version")).toHaveText("3", { timeout: READY_TIMEOUT });
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    // Seed $92,814 + row 0 seat ($29) + row 1 seat ($49), with row 4's
    // 65 seats repriced from $49 to $1.70 by the external v2 writer.
    await expect(page.getByTestId("dbx-total")).toHaveText("$89,817.5");
    await expect(logEntry(page, "Recovered at v")).toHaveCount(1);
    const recoveryMs = performance.now() - recoveryStarted;
    await test.info().attach("conflict-recovery-timing", {
      body: JSON.stringify({ recoveryMs }),
      contentType: "application/json",
    });
    expect(recoveryMs).toBeLessThan(CONFLICT_RECOVERY_MS);
  });

  test.describe(() => {
    // The failed boot reports its version error to the console on purpose.
    test.use({ allowErrors: true });

    test("a failed boot closes the document database it opened", async ({ page }) => {
      // Hold the queue database at a newer version than the showcase opens, so
      // the session fails after the document database is already open.
      await page.goto("/docs/");
      await page.evaluate(
        async ({ name, version }) => {
          const { promise, resolve, reject } = Promise.withResolvers<void>();
          const request = indexedDB.open(name, version);
          request.onsuccess = () => {
            request.result.close();
            resolve();
          };
          request.onerror = () => reject(request.error);
          await promise;
        },
        { name: QUEUE_DATABASE, version: FUTURE_QUEUE_VERSION },
      );
      await page.goto("/showcases/database/");
      await expect(page.getByTestId("dbx-status")).toHaveAttribute("data-status", "error", {
        timeout: READY_TIMEOUT,
      });
      expect(await deleteDatabase(page, DOCUMENT_DATABASE)).toBe("deleted");
    });

    test("leaving the page while a session reopens leaves no session open", async ({ page }) => {
      await openDatabase(page);
      await page.getByRole("button", { name: "Close and reopen session" }).click();
      await page
        .getByRole("navigation", { name: "Site", exact: true })
        .getByRole("link", { name: "Docs", exact: true })
        .click();
      await expect(page).toHaveURL(/\/docs\/$/);
      // A boot that finished after unmount would keep its connection open and
      // block the deletion for good.
      await expect
        .poll(() => deleteDatabase(page, DOCUMENT_DATABASE), { timeout: READY_TIMEOUT })
        .toBe("deleted");
    });
  });
});

test.describe("collaboration proof", () => {
  test("converges two clients with ordered commits and presence", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openCollaboration(page);
    await expectBothClients(page, "v0", COLLABORATION_SEED_TOTAL);

    await page
      .locator('[data-client="a"]')
      .getByRole("button", { name: `Add $500 to ${ANA_ACCOUNT}` })
      .click();
    await expectBothClients(page, "v1", usd(COLLABORATION_SEED_VALUE + FORECAST_ADJUSTMENT));
    await expect(page.getByTestId("clb-server-version")).toHaveText("v1");

    // Presence: the sample edit selected Ana's cell; Bram sees her.
    await expect(page.getByTestId("clb-b-roster")).toContainText("Ana");
    await expect(page.getByTestId("clb-a-roster")).toContainText("Bram");
    await expect(
      page.locator('[data-testid="clb-b-grid"] [data-sheetwrite-presence="actor-ana"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("converges after a storm of edits, disconnects, and reordered broadcasts", async ({
    page,
  }) => {
    test.setTimeout(CHAOS_TIMEOUT + READY_TIMEOUT);
    await openCollaboration(page);
    await page.getByTestId("clb-chaos").click();
    await expect(page.locator(".sw-clb__chaos")).toHaveAttribute("data-phase", "converged", {
      timeout: CHAOS_TIMEOUT,
    });
    await expect(page.getByTestId("clb-chaos-report")).toContainText(
      `All ${COLLABORATION_WORKBOOK_ROWS * COLLABORATION_WORKBOOK_COLUMNS} cells match`,
    );
    // Both clients end on the server head with nothing queued.
    await expectBothClients(page, (await page.getByTestId("clb-server-version").textContent()) ?? "");
  });

  test("applies a multi-version restore as one atomic batch on the peer", async ({ page }) => {
    await openCollaboration(page);
    await page.getByTestId("clb-restore").click();
    const report = page.getByTestId("clb-batch-report");
    await expect(report).toHaveAttribute("data-state", "passed", { timeout: READY_TIMEOUT });
    await expect(report).toContainText("one atomic batch");
    await expect(report).toContainText("1 transaction");
    await expect(report).toContainText("525,000");
    // Both clients converge, and the untouched forecast keeps its total.
    await expectBothClients(
      page,
      (await page.getByTestId("clb-server-version").textContent()) ?? "",
      COLLABORATION_SEED_TOTAL,
    );
  });

  test("buffers version gaps and recovers from a base-version conflict", async ({ page }) => {
    await openCollaboration(page);
    const advanced = page.locator(".sw-clb__advanced");
    await advanced.locator("summary").click();
    await expect(advanced).toHaveAttribute("open", "");
    const holdNext = (slug: "a" | "b") =>
      page
        .locator(`[data-fault-client="${slug}"]`)
        .getByRole("button", { name: "Hold next broadcast" })
        .click();
    const anaEdit = page
      .locator('[data-client="a"]')
      .getByRole("button", { name: `Add $500 to ${ANA_ACCOUNT}` });

    // Gap: Bram's link holds v1 back, v2 arrives first and buffers.
    await holdNext("b");
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v1");
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v0");
    await page
      .locator('[data-fault-client="b"]')
      .getByRole("button", { name: /Release held/ })
      .click();
    await expectBothClients(page, "v2");

    // Conflict: Ana misses a server-authored commit and commits on a stale base.
    await holdNext("a");
    await page.getByRole("button", { name: "Server-authored commit" }).click();
    await expect(page.getByTestId("clb-b-version")).toHaveText("v3");
    await expect(page.getByTestId("clb-a-version")).toHaveText("v2");
    await anaEdit.click();
    // Ana's rebased edit lands on top of the server-authored commit at both clients.
    await expectBothClients(page, "v4");
  });
});
