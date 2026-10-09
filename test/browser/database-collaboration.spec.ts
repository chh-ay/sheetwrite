import { expect, type Locator, type Page, test } from "@playwright/test";
import { siteUrl } from "./playwright.config.js";

// Browser contracts for the two capability proof routes:
//   /showcases/database/       — IndexedDB persistence lifecycle
//   /showcases/collaboration/  — two-client sequencing protocol
// Every test runs in a fresh context, so each page starts from empty
// IndexedDB and the demos must seed, converge, and clean up on their own.

const DATABASE_URL = siteUrl("/showcases/database/");
const COLLABORATION_URL = siteUrl("/showcases/collaboration/");

/** Seed ledger total: 12*30 + 4*145 + 90*11 + 6*82 + 300*1.5. */
const DATABASE_SEED_TOTAL = "2,872";
/** Seed sprint total: 8 + 5 + 3 + 5 + 2. */
const COLLABORATION_SEED_TOTAL = "23";
const READY_TIMEOUT = 30_000;

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
    const drainedTotal = await page.getByTestId("dbx-total").textContent();

    // The in-page session restart reads the same data back from IndexedDB.
    await page.getByRole("button", { name: "Close and reopen session" }).click();
    await databaseReady(page);
    await expect(page.getByTestId("dbx-version")).toHaveText("2");
    await expect(page.getByTestId("dbx-total")).toHaveText(drainedTotal ?? "");

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

    // Conflict: an external writer advances the head; the next local commit
    // conflicts and recovers through rebase + remount + resubmit.
    await page.getByRole("button", { name: "External writer commit" }).click();
    await page.getByRole("button", { name: "Commit sample edit" }).click();
    await expect(page.getByTestId("dbx-version")).toHaveText("3");
    await expect(page.getByTestId("dbx-pending")).toHaveText("0");
    // Both writes survive: seed 2,872 + row 0 (+30) + external price +0.2 on 300 units (+60)
    // + the rebased local edit on row 1 (+145).
    await expect(page.getByTestId("dbx-total")).toHaveText("3,107");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });
});

test.describe("collaboration proof", () => {
  test("converges two dominant clients with ordered commits and presence", async ({ page }) => {
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

    await client(page, "a").getByRole("button", { name: "Edit “Import pipeline”" }).click();
    await expect(page.getByTestId("clb-a-total")).toHaveText("24");
    await expect(page.getByTestId("clb-b-total")).toHaveText("24");
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

  test("buffers version gaps and recovers from a base-version conflict", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(COLLABORATION_URL);
    await collaborationReady(page);
    await openAdvancedFaults(page);

    // Gap: Bram's link holds v1 back, v2 arrives first and buffers.
    await faultClient(page, "b").getByRole("button", { name: "Hold next broadcast" }).click();
    const anaEdit = client(page, "a").getByRole("button", { name: "Edit “Import pipeline”" });
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v1");
    await anaEdit.click();
    await expect(page.getByTestId("clb-a-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-b-version")).toHaveText("v0");

    await faultClient(page, "b")
      .getByRole("button", { name: /Release held/ })
      .click();
    await expect(page.getByTestId("clb-b-version")).toHaveText("v2");
    await expect(page.getByTestId("clb-b-total")).toHaveText("25");

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
    expect(Number(finalTotal)).toBeGreaterThan(25);
    await expect(page.getByTestId("clb-a-total")).toHaveText(finalTotal ?? "");

    expect(errors.console).toEqual([]);
    expect(errors.page).toEqual([]);
  });
});
