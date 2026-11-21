import type { Grid } from "../../packages/core/src/types.js";
import { expect, nextFrames, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

// The shell's status line and its sheet tabs share one row. When the row is
// too narrow, the tab strip narrows and scrolls first, down to half the row
// (or its own width, if less). Only then does the status drop parts: the
// selection size first, then Count, then Average, and Sum last. The cell mode
// always stays, and neither runs under the other or out of the row.

test("the tabs give way to half the row, then the status drops parts, Sum last", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto("/showcases/spreadsheet/");
  await expect(page.getByRole("button", { name: "Narrow" })).toBeEnabled();
  // Nine sheets, as in the docs' captures, so the tabs need room too.
  await page.evaluate(() => {
    const grid = window.__sheetwriteSpreadsheetGrid;
    for (const name of ["Dashboard", "Orders", "Report", "Pivot", "Formulas", "History"]) {
      grid?.addSheet({
        id: name.toLowerCase(),
        name,
        rowCount: 5,
        columns: [{ key: "a", header: "A", width: 80, type: "general" }],
      });
    }
    grid?.setActiveSheet("sales");
  });
  const nameBox = page.getByRole("textbox", { name: "Cell reference" });
  await nameBox.fill("A1:G50");
  await nameBox.press("Enter");
  await expect(page.locator(".sheetwrite-shell-status")).toContainText("Sum:");

  const problems: string[] = [];
  for (let width = 1_440; width >= 320; width -= 10) {
    await page.setViewportSize({ width, height: 900 });
    await nextFrames(page);
    await nextFrames(page);
    const layout = await page.evaluate(() => {
      const element = (selector: string) => document.querySelector<HTMLElement>(selector);
      const rowElement = element(".sheetwrite-shell-bottom-row");
      const tabs = element(".sheetwrite-shell-tabs");
      const statusElement = element(".sheetwrite-shell-status");
      const mode = element(".sheetwrite-shell-mode")?.getBoundingClientRect();
      if (!rowElement || !tabs || !statusElement || !mode) return null;
      const row = rowElement.getBoundingClientRect();
      const rowStyle = getComputedStyle(rowElement);
      const rowContent =
        rowElement.clientWidth -
        Number.parseFloat(rowStyle.paddingLeft) -
        Number.parseFloat(rowStyle.paddingRight);
      const tabsBox = tabs.getBoundingClientRect();
      const status = statusElement.getBoundingClientRect();
      const parts = element(".sheetwrite-shell-status-parts");
      // The drawn text; the screen-reader copy of the line does not count.
      const drawn = [...statusElement.querySelectorAll("span")]
        .filter(
          (span) =>
            span.childElementCount === 0 &&
            span.offsetWidth > 0 &&
            span.closest(".sheetwrite-shell-status-text") === null,
        )
        .map((span) => span.textContent ?? "")
        .join(" ");
      return {
        overlap: tabsBox.right - status.left,
        outOfRow: status.right - row.right,
        modeCut: mode.right > status.right + 0.5,
        partCut: parts !== null && parts.scrollWidth > parts.clientWidth,
        tabsWidth: tabs.clientWidth,
        tabsFloor: Math.min(tabs.scrollWidth, rowContent / 2),
        sum: drawn.includes("Sum:"),
        average: drawn.includes("Average:"),
        count: drawn.includes("Count:"),
      };
    });
    if (layout === null) {
      problems.push(`${width} px: no tabs or status`);
      continue;
    }
    const at = `${width} px:`;
    if (layout.overlap > 0.5) problems.push(`${at} the status overlaps the tabs`);
    if (layout.outOfRow > 0.5) problems.push(`${at} the status runs out of the row`);
    if (layout.modeCut) problems.push(`${at} the cell mode is cut`);
    if (layout.partCut) problems.push(`${at} a status part is cut`);
    if (layout.sum && layout.tabsWidth < layout.tabsFloor - 1)
      problems.push(`${at} the tabs are below half the row while Sum shows`);
    if (layout.count && !layout.average) problems.push(`${at} Average dropped before Count`);
    if (layout.average && !layout.sum) problems.push(`${at} Sum dropped before Average`);
  }
  expect(problems).toEqual([]);
});
