import type { Page } from "@playwright/test";

import { expect, nextFrames, test } from "./fixtures.js";

// The + and ⋯ icons of the sheet-tab bar sit on the tab labels' optical
// centre: the middle of the x-height, which reads as the line's centre.

/**
 * How far each icon's centre is below its neighbouring label's optical centre,
 * in CSS px. The baseline comes from a zero-size inline-block placed after the
 * label's text, and the x-height from an "x" measured in the label's font.
 */
function offsets(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const bar =
      document.querySelector<HTMLElement>(".sheetwrite-shell-bottom-row") ??
      document.querySelector<HTMLElement>(".sheetwrite-tabbar");
    if (bar === null) throw new Error("No sheet-tab bar");
    const add = bar.querySelector<HTMLElement>(".sheetwrite-tab-add");
    const more = bar.querySelector<HTMLElement>(".sheetwrite-tab-options-button");
    const active = bar.querySelector<HTMLElement>(".sheetwrite-tab-active");
    if (add === null || more === null || active === null) throw new Error("No + or ⋯");
    const left = add.getBoundingClientRect().left;
    const tabs = [...bar.querySelectorAll<HTMLElement>(".sheetwrite-tab")];
    const beside = tabs.filter((tab) => tab.getBoundingClientRect().right <= left + 1).at(-1);
    if (beside === undefined) throw new Error("No tab beside +");

    const optical_centre = (tab: HTMLElement): number => {
      const walker = document.createTreeWalker(tab, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text !== null && text.textContent?.trim() === "") text = walker.nextNode();
      if (!(text instanceof Text) || text.parentElement === null) throw new Error("No label");
      const marker = document.createElement("span");
      marker.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      text.after(marker);
      const baseline = marker.getBoundingClientRect().bottom;
      marker.remove();
      const context = document.createElement("canvas").getContext("2d");
      if (context === null) throw new Error("No canvas");
      context.font = getComputedStyle(text.parentElement).font;
      // The middle of an "x" drawn on the baseline: the x-height band.
      const x = context.measureText("x");
      return baseline - (x.actualBoundingBoxAscent - x.actualBoundingBoxDescent) / 2;
    };
    const icon_centre = (button: HTMLElement): number => {
      const box = button.querySelector("svg")?.getBoundingClientRect();
      if (box === undefined) throw new Error("No icon");
      return box.top + box.height / 2;
    };
    return {
      add: icon_centre(add) - optical_centre(beside),
      more: icon_centre(more) - optical_centre(active),
    };
  });
}

const WIDTHS = [1_440, 834, 390, 320];

// Firefox and WebKit run the @portability tests too, so this runs in all three engines.
for (const device_scale_factor of [1, 2]) {
  test.describe(`at DPR ${device_scale_factor}`, () => {
    test.use({ deviceScaleFactor: device_scale_factor });

    for (const [path, ready] of [
      ["/showcases/spreadsheet/", "Narrow"],
      ["/react/", null],
    ] as const) {
      test(`the + and ⋯ icons sit on the tab labels' optical centre on ${path} @portability`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1_440, height: 900 });
        await page.goto(path);
        if (ready !== null) await expect(page.getByRole("button", { name: ready })).toBeEnabled();
        await expect(page.locator(".sheetwrite-tab-add").first()).toBeVisible({ timeout: 20_000 });
        const misaligned: string[] = [];
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await nextFrames(page);
          for (const [icon, offset] of Object.entries(await offsets(page))) {
            // To a hundredth of a pixel: layout positions are not exact binary fractions.
            const off = Math.round(offset * 100) / 100;
            if (Math.abs(off) > 0.5) misaligned.push(`${width} px: ${icon} is ${off} px off`);
          }
        }
        expect(misaligned).toEqual([]);
      });
    }
  });
}
