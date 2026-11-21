import type { Grid } from "../../packages/core/src/types.js";
import { expect, nextFrames, test } from "./fixtures.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

// The shell's status line and its sheet tabs share one row. As in Excel, the
// status drops its least important parts as the row narrows (Sum and Average
// first, then Count; the cell mode stays), and only then does the tab strip
// narrow and scroll. Neither runs under the other or out of the row.

test("the status gives way to the sheet tabs at every width from 1440 px to 320 px", async ({
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
      const row = element(".sheetwrite-shell-bottom-row")?.getBoundingClientRect();
      const tabs = element(".sheetwrite-shell-tabs");
      const tabsBox = tabs?.getBoundingClientRect();
      const statusElement = element(".sheetwrite-shell-status");
      const status = statusElement?.getBoundingClientRect();
      const mode = element(".sheetwrite-shell-mode")?.getBoundingClientRect();
      const parts = element(".sheetwrite-shell-status-parts");
      if (!row || !tabs || !tabsBox || !statusElement || !status || !mode) return null;
      // Drawn totals; the screen-reader copy of the line does not count.
      const totalsShown = [...statusElement.querySelectorAll("span")].some(
        (span) =>
          span.childElementCount === 0 &&
          span.offsetWidth > 0 &&
          span.closest(".sheetwrite-shell-status-text") === null &&
          /Average:|Count:|Sum:/.test(span.textContent ?? ""),
      );
      return {
        overlap: tabsBox.right - status.left,
        outOfRow: status.right - row.right,
        modeCut: mode.right > status.right + 0.5,
        partCut: parts !== null && parts.scrollWidth > parts.clientWidth,
        tabsScrollWhileStatusHasParts: tabs.scrollWidth > tabs.clientWidth + 1 && totalsShown,
      };
    });
    if (layout === null) {
      problems.push(`${width} px: no tabs or status`);
      continue;
    }
    if (layout.overlap > 0.5) problems.push(`${width} px: the status overlaps the tabs`);
    if (layout.outOfRow > 0.5) problems.push(`${width} px: the status runs out of the row`);
    if (layout.modeCut) problems.push(`${width} px: the cell mode is cut`);
    if (layout.partCut) problems.push(`${width} px: a status part is cut`);
    if (layout.tabsScrollWhileStatusHasParts)
      problems.push(`${width} px: the tabs scroll while the status still shows its totals`);
  }
  expect(problems).toEqual([]);
});
