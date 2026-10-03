import { expect, type Page, test } from "@playwright/test";
import type { Grid } from "../../packages/core/src/types.js";

declare global {
  interface Window {
    __sheetwriteVueWorkbench?: { grid: Grid };
    __sheetwriteSvelteGrid?: Grid;
  }
}

import { type examplePages, siteUrl } from "./playwright.config.js";

function urlOf(page: (typeof examplePages)[number]): string {
  return siteUrl(`/${page}/`);
}

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

test("workbook XLSX backend preserves formulas in a browser build", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(siteUrl("/test/xlsx/"));
  const result = page.locator("#result");
  await expect
    .poll(() => result.getAttribute("data-status"), { timeout: 15_000 })
    .not.toBe("running");

  expect(
    await result.getAttribute("data-status"),
    (await result.textContent()) ?? "XLSX smoke returned no result text",
  ).toBe("ready");
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("offline queue, two-grid sync, and presence converge in a browser", {
  tag: "@portability",
}, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(siteUrl("/test/collaboration/"));
  const result = page.locator("#result");
  await expect
    .poll(() => result.getAttribute("data-status"), { timeout: 15_000 })
    .not.toBe("running");

  expect(
    await result.getAttribute("data-status"),
    (await result.textContent()) ?? "Collaboration smoke returned no result text",
  ).toBe("ready");
  const payload = JSON.parse((await result.textContent()) ?? "{}") as Record<string, unknown>;
  // The harness self-checks before reporting ready; assert the durable
  // outcomes without pinning incidental counters like presence node counts.
  expect(payload).toMatchObject({
    literal: 21,
    formula: 42,
    sheetName: "Shared",
    restoredMutation: "durable-browser-m1",
  });
  expect(errors.page).toEqual([]);
  expect(errors.console).toEqual([]);
});

test("vanilla example commits an edit through the formula bar and undoes it", {
  tag: "@portability",
}, async ({ page }) => {
  await page.goto(urlOf("vanilla"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached" });

  // Select B2 via the name box, then commit a literal through the formula bar.
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  const original = await page.locator("#formula").inputValue();
  expect(original).not.toBe("browser-smoke");
  await page.fill("#formula", "browser-smoke");
  await page.press("#formula", "Enter");

  // Re-selecting the same cell echoes the committed value back into the bar.
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await expect(page.locator("#formula")).toHaveValue("browser-smoke");

  // Ctrl+Z on the grid undoes the commit and restores the original value.
  await page.locator(".sheetwrite").first().click();
  await page.keyboard.press("Control+z");
  await page.fill("#namebox", "B2");
  await page.press("#namebox", "Enter");
  await expect(page.locator("#formula")).toHaveValue(original);
});

test("dynamic spill entry, obstruction, resize, ownership, and undo are visible", async ({
  page,
}) => {
  await page.goto(urlOf("svelte"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__sheetwriteSvelteGrid))).toBe(true);

  await page.evaluate(() => {
    const grid = window.__sheetwriteSvelteGrid!;
    grid.store.applyTransaction({
      patches: [
        ...[3, 1, 2].map((value, row) => ({
          op: "set" as const,
          addr: { sheet: "dispatch", row, col: 0 },
          value: { kind: "literal" as const, value },
        })),
        ...[true, true, false].map((value, row) => ({
          op: "set" as const,
          addr: { sheet: "dispatch", row, col: 1 },
          value: { kind: "literal" as const, value },
        })),
        {
          op: "clearRange",
          range: {
            sheet: "dispatch",
            start: { row: 0, col: 5 },
            end: { row: 2, col: 5 },
          },
        },
        {
          op: "set",
          addr: { sheet: "dispatch", row: 2, col: 5 },
          value: { kind: "literal", value: "blocker" },
        },
      ],
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "dispatch", row: 0, col: 5 } });
  });
  await page.locator(".sheetwrite-shell-formula").fill("=FILTER(A1:A3,B1:B3)");
  await page.locator(".sheetwrite-shell-formula").press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() =>
        [0, 1].map(
          (row) =>
            window.__sheetwriteSvelteGrid!.store.getCell({
              sheet: "dispatch",
              row,
              col: 5,
            }).resolved,
        ),
      ),
    )
    .toEqual([3, 1]);

  await page.locator(".sheetwrite").click({ position: { x: 200, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteSvelteGrid!.store.getCell({
            sheet: "dispatch",
            row: 0,
            col: 5,
          }).resolved,
      ),
    )
    .toBeNull();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteSvelteGrid!.store.getCell({
            sheet: "dispatch",
            row: 1,
            col: 5,
          }).resolved,
      ),
    )
    .toBe(1);

  await page.evaluate(() => {
    const grid = window.__sheetwriteSvelteGrid!;
    grid.store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "dispatch", row: 2, col: 1 },
          value: { kind: "literal", value: true },
        },
      ],
    });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteSvelteGrid!.store.getCell({
            sheet: "dispatch",
            row: 0,
            col: 5,
          }).resolved,
      ),
    )
    .toBe("#SPILL!");
  await page.evaluate(() => {
    const grid = window.__sheetwriteSvelteGrid!;
    grid.store.applyTransaction({
      patches: [
        {
          op: "clearRange",
          range: {
            sheet: "dispatch",
            start: { row: 2, col: 5 },
            end: { row: 2, col: 5 },
          },
        },
      ],
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "dispatch", row: 1, col: 5 } });
  });
  await expect.poll(() => page.locator(".sheetwrite-shell-formula").inputValue()).toBe("1");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteSvelteGrid!.store.getCell({
            sheet: "dispatch",
            row: 2,
            col: 5,
          }).resolved,
      ),
    )
    .toBe(2);
  expect(
    await page.evaluate(() =>
      window.__sheetwriteSvelteGrid!.store.getSpillAnchor({
        sheet: "dispatch",
        row: 1,
        col: 5,
      }),
    ),
  ).toEqual({ sheet: "dispatch", row: 0, col: 5 });
  await page.evaluate(() =>
    window.__sheetwriteSvelteGrid!.setSelection({
      kind: "cell",
      addr: { sheet: "dispatch", row: 0, col: 5 },
    }),
  );
  await expect
    .poll(() => page.locator(".sheetwrite-shell-formula").inputValue())
    .toBe("=FILTER(A1:A3,B1:B3)");
});

test("validation dropdown and checkbox editors are keyboard and ARIA operable", async ({
  page,
}) => {
  await page.goto(urlOf("vue"));
  await page.waitForSelector(".sheetwrite canvas", { state: "attached", timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__sheetwriteVueWorkbench?.grid)))
    .toBe(true);

  // The rule is host configuration (public API); the editor itself must open
  // through user input: select the cell, then press Enter on the grid host.
  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench?.grid;
    if (!grid) throw new Error("Vue grid is unavailable");
    grid.setValidationRule({
      id: "browser-list",
      range: { sheet: "orders", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      condition: { kind: "list", values: [1, 2, 3] },
      policy: "reject",
      helpText: "Choose an order ID",
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 0, col: 0 } });
  });
  await page.locator(".sw-demo-grid .sheetwrite").press("Enter");

  const list = page.getByRole("listbox", { name: "Choose an order ID" });
  await expect(list).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVueWorkbench?.grid.store.getCell({ sheet: "orders", row: 0, col: 0 })
            .resolved,
      ),
    )
    .toBe(2);

  await page.evaluate(() => {
    const grid = window.__sheetwriteVueWorkbench?.grid;
    if (!grid) throw new Error("Vue grid is unavailable");
    grid.setValidationRule({
      id: "browser-checkbox",
      range: { sheet: "orders", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
      condition: { kind: "checkbox", checkedValue: true, uncheckedValue: false },
      policy: "reject",
    });
    grid.setSelection({ kind: "cell", addr: { sheet: "orders", row: 1, col: 0 } });
  });
  await page.locator(".sw-demo-grid .sheetwrite").press("Enter");

  const checkbox = page.getByRole("checkbox", { name: "Toggle checkbox" });
  await expect(checkbox).toBeVisible();
  await page.keyboard.press(" ");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__sheetwriteVueWorkbench?.grid.store.getCell({ sheet: "orders", row: 1, col: 0 })
            .resolved,
      ),
    )
    .toBe(true);
});
