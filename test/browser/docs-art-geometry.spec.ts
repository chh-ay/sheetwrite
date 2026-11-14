import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { type ArtDefect, findArtDefects } from "./art-geometry.js";
import { expect, siteUrl, test } from "./fixtures.js";

// Every picture the docs draw, checked for broken geometry at a wide and a
// phone width, in both themes: arrows that miss their boxes, piled-up
// arrowheads, text out of its box, clipped shapes, overlapping boxes, shapes
// drawn over others without hiding them, fills poking out of rounded frames,
// and text under 4.5:1 contrast (art-geometry.ts).

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** The built site, where scripts/serve-docs.ts serves it from. */
const SITE = join(ROOT, process.env.DOCS_OUTPUT_DIR ?? "docs/dist/client");

/** Built pages that draw art: the docs diagrams, card pictures and section marks. */
function pagesWithArt(directory = SITE): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pagesWithArt(path);
    if (entry.name !== "index.html") return [];
    const html = readFileSync(path, "utf8");
    if (!/class="sw-art\b|\/figures\/illustrations\//.test(html)) return [];
    return [`/${relative(SITE, directory)}/`.replace(/^\/\/$/, "/")];
  });
}

const WIDTHS = [
  { name: "wide", width: 1440 },
  { name: "phone", width: 390 },
] as const;

for (const { name, width } of WIDTHS) {
  for (const theme of ["light", "dark"] as const) {
    test(`docs art has sound geometry, ${name}, ${theme}`, async ({ browser }) => {
      test.setTimeout(10 * 60_000);
      const context = await browser.newContext({
        baseURL: siteUrl(),
        viewport: { width, height: 900 },
        colorScheme: theme,
      });
      const found: string[] = [];
      for (const path of pagesWithArt()) {
        const page = await context.newPage();
        await page.goto(path, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const defects: ArtDefect[] = await page.evaluate(findArtDefects);
        for (const defect of defects) found.push(`${path} ${defect.picture}: ${defect.problem}`);
        await page.close();
      }
      await context.close();
      expect(found).toEqual([]);
    });
  }
}
