// Where the docs show pictures: the diagram or screenshot beside each section
// that explains a mechanism or shows a feature, each section card's
// illustration, the section pages' header art and the tab landing pages'
// marks. Read by lib/rehype-docs-pictures.ts (page bodies) and DocsShell (page
// headers). Pages not listed get no art: API symbol and formula function pages
// carry none.
import type { ShotSize } from "../lib/content-components.js";
import type { SectionMarkName } from "./section-marks.js";

/**
 * A screenshot from the capture script (figures/capture.ts), framed with its
 * caption, as `<Frame caption><Screenshot name alt size /></Frame>` draws it in
 * an MDX page; Markdown pages can't hold the component, so they place it here.
 */
export interface ShotPicture {
  readonly name: string;
  readonly alt: string;
  readonly caption: string;
  /** The capture's size; `app` by default. */
  readonly size?: ShotSize;
}

/** A picture in a page body: after a heading (by its id) or after the lead paragraph. */
export type PicturePlacement =
  | { readonly after: string; readonly picture: string }
  | { readonly after: string; readonly shot: ShotPicture };

/** The lead paragraph: the article's first paragraph. */
export const AFTER_LEAD = "lead";
/** The top of the body: a section overview, whose body holds only its cards. */
export const AT_START = "start";

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
  "/docs/features/grid/": [
    {
      after: AT_START,
      shot: {
        name: "grid-overview",
        alt: "The spreadsheet shell on an Orders sheet: the Home ribbon, the formula bar, the grid with column letters and row numbers and a selected range, the sheet tabs and the status bar.",
        caption:
          "The grid inside the spreadsheet shell, with the ribbon, formula bar, sheet tabs and status bar.",
      },
    },
  ],
  "/docs/features/grid/context-menu/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "context-menu",
        size: "panel",
        alt: "The right-click menu open over a cell of the Orders sheet, with Cut, Copy and Paste, insert and delete commands, sort and filter commands, and Insert Note.",
        caption: "Right-clicking a cell opens the bundled menu at the pointer.",
      },
    },
  ],
  "/docs/features/grid/custom-editors/": [
    { after: "editor-contract", picture: "editor-lifecycle" },
  ],
  "/docs/features/grid/editing-and-clipboard/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "editing",
        size: "panel",
        alt: "A copied range of the Orders sheet framed by a dashed border, and a cell below it open in the inline editor with the text being typed.",
        caption: "A copied range keeps its dashed frame while another cell is edited inline.",
      },
    },
  ],
  "/docs/features/grid/grid-methods/": [{ after: AFTER_LEAD, picture: "grid-handle" }],
  "/docs/features/grid/options-and-presentation/": [
    {
      after: "spreadsheet-and-data-grid-presentation",
      shot: {
        name: "data-grid",
        size: "panel",
        alt: "The Orders data in the data-grid presentation: column headers show the field names Month, Region, Product, Units and Revenue instead of column letters.",
        caption: "The data-grid presentation names each column by its field.",
      },
    },
  ],
  "/docs/features/grid/resize-merge-and-fill/": [
    {
      after: "drag-to-fill",
      shot: {
        name: "fill",
        size: "panel",
        alt: "The fill handle of a selected range being dragged down the Orders sheet, with the outline of the cells it will fill.",
        caption: "Dragging the fill handle outlines the cells the fill will write.",
      },
    },
  ],
  "/docs/features/grid/search/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "search",
        size: "panel",
        alt: "The Find bar over the Orders sheet with EMEA typed in it and a match count, and the matching Region cells highlighted, the active match outlined.",
        caption: "Ctrl+F opens Find; every match is highlighted and the active one is outlined.",
      },
    },
  ],
  "/docs/features/grid/selection-and-keyboard/": [
    {
      after: "selection-model",
      shot: {
        name: "selection",
        size: "panel",
        alt: "Two selected ranges on the Orders sheet, made with Ctrl, each tinted, and the active cell outlined in the second.",
        caption: "A selection can hold several ranges; the active cell sits in the last one.",
      },
    },
  ],
  "/docs/features/grid/status-bar/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "status-bar",
        size: "panel",
        alt: "A selected column of revenue values on the Orders sheet and the status bar below it showing their Average, Count and Sum.",
        caption: "The status bar shows the Average, Count and Sum of the selected numbers.",
      },
    },
  ],
  "/docs/features/grid/toolbar-and-ribbon/": [
    {
      after: "ribbon",
      shot: {
        name: "ribbon",
        size: "wide",
        alt: "The full ribbon's Home tab above the Orders sheet: clipboard, font, alignment, number, styles, cells and editing groups.",
        caption: "The full ribbon, Home tab.",
      },
    },
  ],
  "/docs/features/grid/touch/": [{ after: "touch-gestures", picture: "touch-gestures" }],
  "/docs/features/formulas/authoring-and-references/": [
    { after: "point-mode-and-reference-rewriting", picture: "reference-rewrite" },
  ],
  "/docs/features/formulas/custom-functions/": [
    { after: "registration", picture: "custom-functions" },
  ],
  "/docs/features/formulas/formula-help/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "formula-help",
        size: "panel",
        alt: "A SUMIFS formula being typed in the formula bar: the argument guide shows the signature with the current argument in bold, and the referenced ranges are coloured to match the formula text.",
        caption: "Formula help in the formula bar: the argument guide and coloured references.",
      },
    },
  ],
  "/docs/features/formulas/lookup-criteria-and-financial/": [
    { after: "criteria-semantics-and-shapes", picture: "criteria-rows" },
  ],
  "/docs/features/formulas/offset-and-indirect/": [
    { after: "dynamic-references", picture: "dynamic-references" },
  ],
  "/docs/features/formulas/operators/": [{ after: "intersection", picture: "reference-operators" }],
  "/docs/features/formulas/volatile-functions/": [
    { after: "recalculation-and-clock", picture: "volatile-clock" },
  ],
  "/docs/frameworks/react/": [{ after: "listen-to-changes", picture: "react-adapter" }],
  "/docs/frameworks/vue/": [{ after: "listen-to-changes", picture: "vue-adapter" }],
  "/docs/frameworks/svelte/": [{ after: "listen-to-changes", picture: "svelte-adapter" }],
  "/docs/frameworks/vanilla/": [{ after: "listen-to-changes", picture: "vanilla-lifecycle" }],
  "/docs/tutorials/excel-in-javascript/": [{ after: AFTER_LEAD, picture: "tutorial-javascript" }],
  "/docs/tutorials/excel-in-react/": [{ after: AFTER_LEAD, picture: "tutorial-react" }],
  "/docs/tutorials/excel-in-vue/": [{ after: AFTER_LEAD, picture: "tutorial-vue" }],
  "/docs/tutorials/excel-in-svelte/": [{ after: AFTER_LEAD, picture: "tutorial-svelte" }],
  "/docs/tutorials/excel-in-nodejs/": [{ after: AFTER_LEAD, picture: "tutorial-nodejs" }],
  "/docs/tutorials/spreadsheet-app-with-ribbon/": [
    { after: "shell-ownership", picture: "tutorial-shell" },
  ],
  "/docs/start/upgrade-to-0-6-0/": [
    { after: "update-packages-together", picture: "upgrade-0-6-0" },
  ],
  "/docs/start/upgrade-to-0-7-0/": [
    { after: "update-packages-together", picture: "upgrade-0-7-0" },
  ],
  "/docs/import-export/libreoffice-compatibility/": [
    { after: "what-the-comparison-proves", picture: "libreoffice-round-trip" },
  ],
  "/docs/import-export/xlsx-export/": [{ after: "table-interchange", picture: "xlsx-exports" }],
  "/docs/reference/api-contract/": [{ after: AFTER_LEAD, picture: "api-gate" }],
  "/docs/reference/compatibility-limits/": [{ after: AT_START, picture: "limits" }],
  "/docs/reference/document-operations/": [{ after: "snapshots-and-rebase", picture: "rebase" }],
  "/docs/reference/events/": [{ after: "event-direction", picture: "event-direction" }],
  "/docs/releases/0.5.0/": [{ after: AFTER_LEAD, picture: "release-0.5.0" }],
  "/docs/releases/0.5.1/": [{ after: AFTER_LEAD, picture: "release-0.5.1" }],
  "/docs/releases/0.5.2/": [{ after: AFTER_LEAD, picture: "release-0.5.2" }],
  "/docs/releases/0.5.3/": [{ after: AFTER_LEAD, picture: "release-0.5.3" }],
  "/docs/releases/0.5.4/": [{ after: AFTER_LEAD, picture: "release-0.5.4" }],
  "/docs/releases/0.6.0/": [{ after: AFTER_LEAD, picture: "release-0.6.0" }],
  "/docs/releases/0.6.1/": [{ after: AFTER_LEAD, picture: "release-0.6.1" }],
  "/docs/features/formatting/": [
    {
      after: AT_START,
      shot: {
        name: "report",
        alt: "A Report sheet formatted as a regional revenue report: a large merged title, a header row with a green fill and a bottom border, revenue and target in dollars, attainment as percentages, centred statuses, wrapped comments, a bold total row with a top border, and a column chart of revenue by region below.",
        caption:
          "One sheet with a merged title, fills, borders, number formats, wrapped text and a chart.",
      },
    },
  ],
  "/docs/features/formatting/fonts-and-alignment/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "fonts",
        size: "panel",
        alt: "The Home ribbon's Font and Alignment groups above the Report sheet, with a wrapped, top-aligned comment cell selected, so Wrap Text and Top Align show as on.",
        caption: "The Font and Alignment groups show the selected cell's settings.",
      },
    },
  ],
  "/docs/features/formatting/number-formats/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "number-formats",
        size: "panel",
        alt: "An attainment cell formatted as 0.0% selected on the Report sheet, with the ribbon's Number menu open, listing its number formats.",
        caption: "The same numbers in dollars and percentages, and the ribbon's Number menu.",
      },
    },
  ],
  "/docs/features/formatting/styles/": [{ after: "resolution-order", picture: "theme-layers" }],
  "/docs/features/analysis/": [
    {
      after: AT_START,
      shot: {
        name: "pivot-chart",
        alt: "A Pivot sheet with a pivot table of revenue and units by region and, beside it, a bar chart of the pivot's revenue by region.",
        caption: "A pivot table of the orders and a PivotChart that plots it.",
      },
    },
  ],
  "/docs/features/analysis/charts/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "chart",
        size: "panel",
        alt: "A column chart of revenue by region floating over the Report sheet, below the cells it reads.",
        caption: "A chart floats over the cells and redraws when the cells it reads change.",
      },
    },
  ],
  "/docs/features/analysis/pivot-tables/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "pivot",
        size: "panel",
        alt: "A pivot table of revenue and units by region with a cell of it selected.",
        caption: "A pivot table of the Orders table: revenue and units by region.",
      },
    },
  ],
  "/docs/features/data/": [
    {
      after: AT_START,
      shot: {
        name: "filter",
        size: "panel",
        alt: "The Orders sheet with filter buttons in its header row and the Region filter menu open, listing the regions with checkboxes.",
        caption: "Filters, sorts and other data tools work on the cells.",
      },
    },
  ],
  "/docs/features/data/validation-protection-and-notes/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "validation",
        size: "panel",
        alt: "A status cell on the Report sheet with its list open, offering On track, At risk and Behind, and a note marker in the corner of a target cell.",
        caption: "A list rule offers its values; a note marks its cell.",
      },
    },
  ],
  "/docs/features/formulas/": [
    {
      after: AT_START,
      shot: {
        name: "formula-bar",
        size: "panel",
        alt: "A revenue cell selected on the Report sheet, and the formula bar showing its formula, =SUMIFS(Orders[Revenue],Orders[Region],A3).",
        caption: "A formula keeps its source; the cell shows its result.",
      },
    },
  ],
  "/docs/features/formulas/analysis-formulas/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "groupby",
        size: "panel",
        alt: "A GROUPBY formula in A1 of the Formulas sheet spilling a list of regions and their revenue, with a total row.",
        caption: "=GROUPBY(Orders[Region],Orders[Revenue],SUM) spills one row per region.",
      },
    },
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

/** Whether a page shows any art, so its head links the art stylesheet; screenshots aren't art. */
export function pageHasArt(href: string): boolean {
  return (
    (DOCS_PICTURE_PLACEMENTS[href] ?? []).some((placement) => "picture" in placement) ||
    href in SECTION_HEADER_ART ||
    href in SECTION_MARKS ||
    href === "/docs/start/choose-an-engine/"
  );
}
