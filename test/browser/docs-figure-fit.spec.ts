import { builtPagesMatching } from "./built-pages.js";
import { findFigureFitDefects, type FitDefect } from "./figure-fit.js";
import { expect, siteUrl, test } from "./fixtures.js";

// Every blueprint figure and section card illustration the site draws (docs
// home, docs pages, showcases and release notes), checked at a desktop, a
// tablet and a phone width: each drawing centred in its frame with room to
// its edges, each box's text centred with its inset, no boxes crowding or
// overlapping, and no label over a box (figure-fit.ts).

const WIDTHS = [1440, 834, 390] as const;

for (const width of WIDTHS) {
  test(`figures fit their frames with room to spare at ${width} px`, async ({ browser }) => {
    test.setTimeout(10 * 60_000);
    const context = await browser.newContext({
      baseURL: siteUrl(),
      viewport: { width, height: 900 },
    });
    const found: string[] = [];
    for (const path of builtPagesMatching(/sw-blueprint|\/figures\/illustrations\//)) {
      const page = await context.newPage();
      await page.goto(path, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const defects: FitDefect[] = await page.evaluate(findFigureFitDefects);
      for (const defect of defects) found.push(`${path} ${defect.picture}: ${defect.problem}`);
      await page.close();
    }
    await context.close();
    expect(found).toEqual([]);
  });
}
