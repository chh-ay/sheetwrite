import { expect, test } from "./fixtures.js";

// Browser builds of the package backends and the plain vanilla example.

for (const [route, outcome] of [
  ["/test/xlsx/", {}],
  // The harness checks itself before it reports ready; assert the durable
  // outcomes, not incidental counters like presence node counts.
  [
    "/test/collaboration/",
    { literal: 21, formula: 42, sheetName: "Shared", restoredMutation: "durable-browser-m1" },
  ],
] as const) {
  test(`${route} harness reports ready in a browser build @portability`, async ({ page }) => {
    await page.goto(route);
    const result = page.locator("#result");
    await expect
      .poll(() => result.getAttribute("data-status"), { timeout: 15_000 })
      .not.toBe("running");
    const report = (await result.textContent()) ?? "";
    expect(await result.getAttribute("data-status"), report).toBe("ready");
    if (Object.keys(outcome).length > 0) expect(JSON.parse(report)).toMatchObject(outcome);
  });
}

test("vanilla example commits an edit through the formula bar and undoes it @portability", async ({
  page,
}) => {
  await page.goto("/vanilla/");
  await page.waitForSelector(".sheetwrite canvas", { state: "attached" });
  const selectB2 = async () => {
    await page.fill("#namebox", "B2");
    await page.press("#namebox", "Enter");
  };

  await selectB2();
  const original = await page.locator("#formula").inputValue();
  expect(original).not.toBe("browser-smoke");
  await page.fill("#formula", "browser-smoke");
  await page.press("#formula", "Enter");
  // Re-selecting the same cell echoes the committed value back into the bar.
  await selectB2();
  await expect(page.locator("#formula")).toHaveValue("browser-smoke");

  // Ctrl+Z on the grid undoes the commit and restores the original value.
  await page.locator(".sheetwrite").first().click();
  await page.keyboard.press("Control+z");
  await selectB2();
  await expect(page.locator("#formula")).toHaveValue(original);
});

test("validation dropdown and checkbox editors are keyboard and ARIA operable", async ({
  page,
}) => {
  await page.goto("/vue/");
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
