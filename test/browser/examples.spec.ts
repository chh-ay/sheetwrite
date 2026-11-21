import { expect, test } from "./fixtures.js";

// Browser builds of the package backends, in each engine.

for (const [route, outcome] of [
  // The header and the two rows the AutoFilter keeps, after an XLSX round trip.
  ["/test/xlsx/", { shownRows: 3 }],
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
    expect(JSON.parse(report)).toMatchObject(outcome);
  });
}
