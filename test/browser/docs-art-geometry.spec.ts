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

/**
 * Pictures that predate the check and are being redrawn (#504). Each entry
 * is a picture's title or file; remove it when its redraw lands. New
 * pictures can't be added here.
 */
const KNOWN_DEFECTS: ReadonlySet<string> = new Set([
  "/figures/illustrations/accessibility.svg",
  "/figures/illustrations/excel-in-javascript.svg",
  "/figures/illustrations/excel-in-nodejs.svg",
  "/figures/illustrations/excel-in-react.svg",
  "/figures/illustrations/excel-in-svelte.svg",
  "/figures/illustrations/excel-in-vue.svg",
  "/figures/illustrations/formatting.svg",
  "/figures/illustrations/lifecycle.svg",
  "A formula that reads cells not loaded yet",
  "Each grid generation gets its own onReady",
  "Errors are values that flow to dependents",
  "How CSV export keeps text from running as a formula",
  "How a cycle calculates with iteration on",
  "How a dashboard filters together",
  "How a large XLSX file imports",
  "How a view picks and orders the displayed rows",
  "How an XLSX file is imported, where hostile files stop, and what export reports",
  "How matching rules combine",
  "How operations and snapshots reach the document",
  "How the 10,000-row import loads",
  "How the version archive records a document",
  "How versions are kept",
  "How worker rendering paints, and when it falls back",
  "Keeping app rows in your store",
  "Loading the cells that visible formulas read",
  "One command model: the ribbon and your toolbar call the same grid actions",
  "Painting only the rows in view, past the browser's height cap",
  "Recovering a missed version, and draining offline edits on reconnect",
  "Sorting the cells versus sorting only the view",
  "The chart reads cells, not the pivot",
  "The data model: three related tables and the pivot over them",
  "The four steps of a first grid",
  "The screen-reader mirror of the visible window",
  "The seam between Sheetwrite and your host",
  "Two engines, one API",
  "What a refresh does",
  "What a transaction recalculates",
  "What durable pending commits do",
  "What happens on an edit",
  "What loads when",
  "What stays loaded when you scroll a million rows",
  "What the browser database keeps",
  "Which formulas one edit recalculates, and what the page times",
  "Which items a slicer filters",
  "Which parts Sheetwrite keeps on save",
  "the Analysis picture",
  "the Atomic multi-version batches picture",
  "the Atomic sequencing picture",
  "the Bounded storage picture",
  "the Collaboration protocol picture",
  "the Concepts picture",
  "the Construction-bound truth picture",
  "the Controlled queries picture",
  "the Convergence under ordering picture",
  "the Data model picture",
  "the Data tools picture",
  "the Data workflows picture",
  "the Database & document lifecycle picture",
  "the Durable outbox picture",
  "the Explicit lifecycle picture",
  "the Explicit recovery picture",
  "the Formulas and KPIs picture",
  "the Gaps and conflicts stay explicit picture",
  "the Getting started picture",
  "the Honest Worker fallback picture",
  "the Host acknowledgement picture",
  "the Host-owned paging picture",
  "the Host-owned rows picture",
  "the Idempotent retries picture",
  "the Import and export picture",
  "the Large undo picture",
  "the Loss without double-apply picture",
  "the Offline is a first-class state picture",
  "the React workbench picture",
  "the Reload recovery picture",
  "the Reset reconciliation picture",
  "the Saved queries picture",
  "the Sort in place picture",
  "the Spreadsheet interoperability picture",
  "the Svelte workbench picture",
  "the Tutorials picture",
  "the Vanilla workbench picture",
  "the Version history picture",
  "the Vue workbench picture",
  "the Vue-native authority picture",
]);

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
        for (const defect of defects) {
          if (!KNOWN_DEFECTS.has(defect.picture))
            found.push(`${path} ${defect.picture}: ${defect.problem}`);
        }
        await page.close();
      }
      await context.close();
      expect(found).toEqual([]);
    });
  }
}
