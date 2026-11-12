// Where the docs show pictures: the diagram beside each section that explains a
// mechanism, each section card's illustration, the section pages' header art
// and the tab landing pages' marks. Read by lib/rehype-docs-pictures.ts (page
// bodies) and DocsShell (page headers). Pages not listed get no art: API
// symbol and formula function pages carry none.
import type { SectionMarkName } from "./section-marks.js";

/** A picture in a page body: after a heading (by its id) or after the lead paragraph. */
export interface PicturePlacement {
  readonly after: string;
  readonly picture: string;
}

/** The lead paragraph: the article's first paragraph. */
export const AFTER_LEAD = "lead";

/** Body pictures by docs address. */
export const DOCS_PICTURE_PLACEMENTS: Readonly<Record<string, readonly PicturePlacement[]>> = {
  "/docs/start/first-grid/": [{ after: AFTER_LEAD, picture: "first-grid" }],
  "/docs/start/installation/": [{ after: "runtime-initialization", picture: "load-order" }],
  "/docs/concepts/calculation-engine/": [
    { after: "what-happens-on-an-edit", picture: "recalculation" },
    { after: "spills", picture: "spills" },
    { after: "paged-data-and-loading", picture: "loading" },
    { after: "errors-are-values", picture: "error-flow" },
    { after: "volatile-functions", picture: "volatile" },
  ],
  "/docs/concepts/documents-and-operations/": [
    { after: "document-protocol-and-storage-transactions", picture: "document-ops" },
  ],
  "/docs/concepts/error-handling/": [{ after: "recovery-by-boundary", picture: "recovery" }],
  "/docs/concepts/runtime-ownership/": [
    { after: "virtualization--scaled-scroll", picture: "virtual-scroll" },
  ],
  "/docs/frameworks/lifecycle/": [
    { after: "readiness-is-generation-scoped", picture: "generations" },
    { after: "controlled-values-do-not-reset-the-document", picture: "live-or-reset" },
  ],
  "/docs/import-export/": [{ after: AFTER_LEAD, picture: "xlsx" }],
  "/docs/import-export/csv-and-tsv/": [
    { after: "output-and-injection-safety", picture: "csv-injection" },
  ],
  "/docs/import-export/large-files-and-streaming/": [
    { after: "streaming-functions", picture: "streaming-import" },
  ],
  "/docs/import-export/kept-parts-and-round-trips/": [
    { after: "parts-sheetwrite-does-not-model", picture: "kept-parts" },
  ],
  "/docs/import-export/xlsx-import/": [
    { after: "choose-an-import-contract", picture: "import-contracts" },
  ],
  "/docs/features/worker-rendering/": [{ after: "how-it-works", picture: "worker-rendering" }],
  "/docs/features/accessibility/": [{ after: "the-sr-only-mirror", picture: "aria-mirror" }],
  "/docs/features/collaboration/": [
    { after: "durable-pending-commits", picture: "pending-commits" },
    { after: "remote-operations-and-version-gaps", picture: "collaboration-recovery" },
  ],
  "/docs/features/data/host-owned-rows/": [{ after: AFTER_LEAD, picture: "row-bridge" }],
  "/docs/features/data/datasources/": [
    { after: "storage", picture: "paging" },
    { after: "cells-that-visible-formulas-read", picture: "formula-reads" },
  ],
  "/docs/features/data/persistence/": [
    { after: "opt-in-version-archives", picture: "version-archive" },
  ],
  "/docs/features/data/data-operations/": [{ after: "display-views", picture: "view-pipeline" }],
  "/docs/features/analysis/data-model/": [{ after: AFTER_LEAD, picture: "relationships" }],
  "/docs/features/analysis/dashboards/": [{ after: "slicers", picture: "dashboard-slicers" }],
  "/docs/features/formulas/iterative-calculation/": [
    { after: "how-a-cycle-calculates", picture: "iteration" },
  ],
  "/docs/features/formulas/dynamic-arrays-and-spills/": [
    { after: "spill-references", picture: "spills" },
  ],
  "/docs/features/formatting/conditional-formats/": [
    { after: "order-and-precedence", picture: "rule-precedence" },
  ],
};

/** Section cards (`illustration="…"`) drawn by the art; others keep their image. */
export const CARD_ART_NAMES: ReadonlySet<string> = new Set([
  "getting-started",
  "frameworks",
  "tutorials",
  "concepts",
  "features",
  "import-export",
  "api-reference",
  "formulas",
  "performance",
]);

/** Existing `<Diagram name>` figures whose drawing the art replaces, by diagram name. */
export const REPLACED_DIAGRAMS: Readonly<Record<string, string>> = { engines: "engines" };

/** Section pages: the section card's illustration beside the page title. */
export const SECTION_HEADER_ART: Readonly<Record<string, string>> = {
  "/docs/start/": "getting-started",
  "/docs/frameworks/": "frameworks",
  "/docs/tutorials/": "tutorials",
  "/docs/concepts/": "concepts",
  "/docs/features/": "features",
  "/docs/import-export/": "import-export",
  "/docs/performance/": "performance",
};

/** The tabs' landing pages: a section mark above the eyebrow. */
export const SECTION_MARKS: Readonly<Record<string, SectionMarkName>> = {
  "/docs/": "guides",
  "/docs/api/": "api",
  "/docs/reference/formula-functions/": "formulas",
  "/docs/releases/": "changelog",
};

/** Whether a page shows any art, so its head links the art stylesheet. */
export function pageHasArt(href: string): boolean {
  return (
    href in DOCS_PICTURE_PLACEMENTS ||
    href in SECTION_HEADER_ART ||
    href in SECTION_MARKS ||
    href === "/docs/start/choose-an-engine/"
  );
}
