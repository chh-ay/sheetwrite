// Where the docs show pictures: the diagram or screenshot beside each section
// that explains a mechanism or shows a feature, each section card's
// illustration, the section pages' header art and the tab landing pages'
// marks. Read by lib/rehype-docs-pictures.ts (page bodies) and DocsShell (page
// headers). Pages not listed get no art: API symbol and formula function pages
// carry none.
import type { FramedCrop, ShotSize } from "../lib/content-components.js";

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
  /** Crops for tablets and phones (`<name>-tablet`, `<name>-phone` in the capture script). */
  readonly narrow?: { readonly tablet: FramedCrop; readonly phone: FramedCrop };
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
  "/docs/concepts/error-handling/": [
    {
      after: "recovery-by-boundary",
      shot: {
        name: "paste-refused",
        size: "panel",
        alt: "The Orders sheet with B3 selected, and the grid's message over it: Nothing was pasted: this paste has 16,385 columns, and a paste can have at most 16,384.",
        caption:
          "A paste past a limit is refused before anything is written, and the grid says why.",
        narrow: {
          tablet: {
            name: "paste-refused-tablet",
            alt: "The Orders sheet on a tablet-width grid, and the grid's message: Nothing was pasted: this paste has 16,385 columns, and a paste can have at most 16,384.",
            caption: "A paste past a limit is refused, and the grid says why.",
          },
          phone: {
            name: "paste-refused-phone",
            alt: "The Orders sheet on a phone-width grid, and the grid's message: Nothing was pasted: this paste has 16,385 columns, and a paste can have at most 16,384.",
            caption: "A paste past a limit is refused, and the grid says why.",
          },
        },
      },
    },
  ],
  "/docs/concepts/runtime-ownership/": [
    { after: "virtualization--scaled-scroll", picture: "virtual-scroll" },
  ],
  "/docs/frameworks/lifecycle/": [
    { after: "readiness-is-generation-scoped", picture: "generations" },
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
    { after: AT_START, picture: "grid-section" },
    {
      after: AT_START,
      shot: {
        name: "grid-overview",
        alt: "The spreadsheet shell on an Orders sheet: the Home ribbon, the formula bar, the grid with column letters and row numbers and a selected range, the sheet tabs and the status bar.",
        caption:
          "The grid inside the spreadsheet shell, with the ribbon, formula bar, sheet tabs and status bar.",
        narrow: {
          tablet: {
            name: "grid-overview-tablet",
            alt: "The Home ribbon's Undo, Clipboard, Font and Alignment groups, the formula bar showing 136 for D2, and the Orders columns A to E with D2:E9 selected.",
            caption: "The grid under the ribbon and the formula bar.",
          },
          phone: {
            name: "grid-overview-phone",
            alt: "The Orders columns Product, Units and Revenue, with the units and revenue of rows 2 to 9 selected.",
            caption: "The grid with a selected range.",
          },
        },
      },
    },
  ],
  "/docs/features/grid/context-menu/": [
    { after: "how-the-bundled-menu-works", picture: "context-menu" },
    {
      after: AFTER_LEAD,
      shot: {
        name: "context-menu",
        size: "panel",
        alt: "The right-click menu open over a Region cell of the Orders sheet: Cut and Copy, the Paste Options and Paste Special, Insert, Delete and Clear contents, the Row, Column, Filter and Merge submenus, Format cells, Pick from drop-down list, and New note.",
        caption: "Right-clicking a cell opens the bundled menu at the pointer.",
      },
    },
  ],
  "/docs/features/grid/custom-editors/": [
    { after: "editor-contract", picture: "editor-lifecycle" },
  ],
  "/docs/features/grid/editing-and-clipboard/": [
    { after: "clipboard-interoperability", picture: "paste-formats" },
    { after: "paste-special", picture: "paste-special" },
    {
      after: AFTER_LEAD,
      shot: {
        name: "editing",
        size: "panel",
        alt: "A Region cell of the Orders sheet open in the inline editor, with “ north” typed after EMEA, and the formula bar showing the same text.",
        caption: "A double-click edits a cell in place; the formula bar shows the same text.",
      },
    },
  ],
  "/docs/features/grid/grid-methods/": [
    {
      after: "views-sort-filter-hide-and-group",
      shot: {
        name: "grid-methods",
        size: "panel",
        alt: "The Orders data with its rows shown by Revenue, largest first. The top Revenue cell, $158,720, is selected, and the name box calls it E177: its place in the data.",
        caption:
          "setViewSort shows the rows by Revenue, largest first; the cells keep their order.",
        narrow: {
          tablet: {
            name: "grid-methods-tablet",
            alt: "Columns Month to Revenue with the rows shown by Revenue, largest first, and the top Revenue cell, E177, selected.",
            caption: "setViewSort shows the rows by Revenue, largest first.",
          },
          phone: {
            name: "grid-methods-phone",
            alt: "Product, Units and Revenue with the rows shown by Revenue, largest first: $158,720, $135,040, $128,740.",
            caption: "setViewSort shows the rows by Revenue, largest first.",
          },
        },
      },
    },
  ],
  "/docs/features/grid/options-and-presentation/": [
    { after: "custom-cell-renderers", picture: "cell-renderer-hooks" },
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
    { after: "drag-to-fill", picture: "fill" },
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
    { after: "options-and-result", picture: "search-steps" },
    { after: "options-and-find-all-in-the-find-bar", picture: "find-all" },
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
    { after: "selection-model", picture: "selection-shapes" },
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
    { after: "what-it-shows", picture: "status-totals" },
    {
      after: AFTER_LEAD,
      shot: {
        name: "status-bar",
        size: "panel",
        alt: "A selected column of revenue values on the Orders sheet and the status bar below it showing Ready, their Average and their Sum in dollars.",
        caption:
          "The status bar shows the Average and Sum of the selected numbers in the active cell's format; at this width it leaves out Count.",
      },
    },
  ],
  "/docs/features/grid/toolbar-and-ribbon/": [
    { after: AFTER_LEAD, picture: "ribbon-commands" },
    {
      after: "ribbon",
      shot: {
        name: "ribbon",
        size: "wide",
        alt: "The full ribbon's Home tab above the Orders sheet: the undo, clipboard, font, alignment, number, cells and editing groups.",
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
  "/docs/features/formulas/formula-assist/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "formula-assist",
        size: "panel",
        alt: "An equals sign typed in the formula bar for March's total, with the rest of a SUM over the March column shown dimmed after the caret, and that column faintly filled in the grid.",
        caption:
          "The suggestion shows dimmed after the caret, and the range it names is filled on the grid. Tab takes it.",
      },
    },
  ],
  "/docs/features/formulas/formula-help/": [
    { after: AFTER_LEAD, picture: "formula-help" },
    {
      after: AFTER_LEAD,
      shot: {
        name: "formula-help",
        size: "panel",
        alt: "A SUMIFS formula being typed in the formula bar above the Regions sheet, and the argument guide below it showing the signature with the current argument, rangeAndCriteria, in bold.",
        caption:
          "Formula help in the formula bar: the argument guide follows the argument being typed.",
      },
    },
  ],
  "/docs/features/formulas/lookup-criteria-and-financial/": [
    {
      after: "criteria-semantics-and-shapes",
      shot: {
        name: "formula-bar",
        size: "panel",
        alt: "A revenue cell selected on the Report sheet, and the formula bar showing its formula, =SUMIFS(Orders[Revenue],Orders[Region],A3).",
        caption: "A SUMIFS formula adds the Revenue of the Orders rows whose Region matches A3.",
        narrow: {
          tablet: {
            name: "formula-bar-tablet",
            alt: "C3 selected on the Report sheet, and the formula bar showing =SUMIFS(Orders[Revenue],Orders[Region],A3).",
            caption: "A SUMIFS formula in the formula bar.",
          },
          phone: {
            name: "formula-bar-phone",
            alt: "The formula =SUMIFS(Orders[Revenue],Orders[Region],A3) in the formula bar, over the selected revenue cell, $4,047,955.",
            caption: "A SUMIFS formula in the formula bar.",
          },
        },
      },
    },
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
    {
      after: "sort",
      shot: {
        name: "sort",
        size: "app",
        alt: "The Sort panel beside the Orders sheet: the range A1:E12, My data has headers checked, and a sort level by Month.",
        caption: "The Sort panel sorts the cells of a range in place, as Excel's Sort does.",
        narrow: {
          tablet: {
            name: "sort-tablet",
            alt: "The Sort panel: the range A1:E12, My data has headers checked, a sort level by Month, and Sort view only unchecked.",
            caption: "The Sort panel sorts the cells in place.",
          },
          phone: {
            name: "sort-phone",
            alt: "The Sort panel: the range A1:E12, My data has headers checked, a sort level by Month from A to Z, and Sort view only unchecked.",
            caption: "The Sort panel sorts the cells in place.",
          },
        },
      },
    },
  ],
  "/docs/import-export/libreoffice-compatibility/": [
    { after: "what-the-comparison-proves", picture: "libreoffice-round-trip" },
  ],
  "/docs/import-export/xlsx-export/": [{ after: "table-interchange", picture: "xlsx-exports" }],
  "/docs/reference/api-contract/": [{ after: AFTER_LEAD, picture: "api-gate" }],
  "/docs/reference/document-operations/": [{ after: "snapshots-and-rebase", picture: "rebase" }],
  "/docs/reference/events/": [{ after: "event-direction", picture: "event-direction" }],
  "/docs/performance/benchmark-protocol/": [
    { after: "matched-local-regression-check", picture: "regression-check" },
  ],
  "/docs/performance/memory/": [
    { after: "release-retained-engine-memory", picture: "engine-memory-release" },
  ],
  "/docs/releases/": [{ after: AFTER_LEAD, picture: "releases" }],
  "/docs/releases/0.5.0/": [{ after: AFTER_LEAD, picture: "release-0.5.0" }],
  "/docs/releases/0.5.1/": [{ after: AFTER_LEAD, picture: "release-0.5.1" }],
  "/docs/releases/0.5.2/": [{ after: AFTER_LEAD, picture: "release-0.5.2" }],
  "/docs/releases/0.5.3/": [{ after: AFTER_LEAD, picture: "release-0.5.3" }],
  "/docs/releases/0.5.4/": [{ after: AFTER_LEAD, picture: "release-0.5.4" }],
  "/docs/releases/0.6.0/": [{ after: AFTER_LEAD, picture: "release-0.6.0" }],
  "/docs/releases/0.6.1/": [{ after: AFTER_LEAD, picture: "release-0.6.1" }],
  "/docs/releases/0.7.0/": [{ after: "highlights", picture: "release-0.7.0" }],
  "/docs/features/formatting/": [
    { after: AT_START, picture: "formatting-section" },
    {
      after: AT_START,
      shot: {
        name: "report",
        alt: "A Report sheet formatted as a regional revenue report: a large merged title, a header row with a green fill and a bottom border, revenue and target in dollars, attainment as percentages, centred statuses, wrapped comments, a bold total row with a top border, and a column chart of revenue by region below.",
        caption:
          "One sheet with a merged title, fills, borders, number formats, wrapped text and a chart.",
        narrow: {
          tablet: {
            name: "report-tablet",
            alt: "The Report sheet's merged title over a green header row, regions with managers, revenue and targets in dollars, attainment in percent, and a bold total row.",
            caption: "Fills, borders and number formats on one sheet.",
          },
          phone: {
            name: "report-phone",
            alt: "Regions, managers in italics and revenue in dollars under a merged title and a green header row, down to a bold total of $11,654,550.",
            caption: "A merged title, a header fill and dollar amounts.",
          },
        },
      },
    },
  ],
  "/docs/features/formatting/fonts-and-alignment/": [
    { after: "font-and-alignment-fields", picture: "font-fields" },
    {
      after: AFTER_LEAD,
      shot: {
        name: "fonts",
        size: "panel",
        alt: "The Home ribbon's Font group and its open Alignment menu above the Report sheet, with a wrapped, top-aligned comment cell selected, so Wrap Text and Top Align show as on.",
        caption: "The Font group and the Alignment menu show the selected cell's settings.",
      },
    },
  ],
  "/docs/features/formatting/number-formats/": [
    { after: "format-codes", picture: "number-format-codes" },
    {
      after: AFTER_LEAD,
      shot: {
        name: "number-formats",
        size: "panel",
        alt: "The Report sheet with revenue and targets in dollars and attainment in percentages, and the ribbon's Number Format list open: General, Number, Currency, Accounting, Short Date, Long Date, Time, Percentage, Fraction, Scientific and Text.",
        caption: "Numbers in dollars and percentages, and the ribbon's list of number formats.",
      },
    },
  ],
  "/docs/features/formatting/styles/": [{ after: "resolution-order", picture: "theme-layers" }],
  "/docs/features/analysis/": [
    { after: AT_START, picture: "analysis-section" },
    {
      after: AT_START,
      shot: {
        name: "pivot-chart",
        alt: "A Pivot sheet with a pivot table of revenue and units by region and, beside it, a column chart of the pivot's revenue by region.",
        caption: "A pivot table of the orders and a PivotChart that plots it.",
        narrow: {
          tablet: {
            name: "pivot-chart-tablet",
            alt: "A column chart of revenue by region for Americas, APAC, EMEA and LATAM, from $0 to $5,000,000.",
            caption: "The PivotChart that plots the pivot's revenue by region.",
          },
          phone: {
            name: "pivot-chart-phone",
            alt: "A pivot table of revenue and units for Americas, APAC, EMEA and LATAM, with a total row.",
            caption: "The pivot table of revenue and units by region.",
          },
        },
      },
    },
  ],
  "/docs/features/analysis/charts/": [
    { after: AFTER_LEAD, picture: "chart-ranges" },
    {
      after: "insert-and-edit-in-the-grid",
      shot: {
        name: "chart",
        size: "app",
        alt: "A column chart of revenue by region floating over the Report sheet, below the cells it reads, selected so its frame and resize handles show.",
        caption: "A selected chart shows its frame and resize handles: drag it to move it.",
      },
    },
  ],
  "/docs/features/analysis/pivot-tables/": [
    {
      after: AFTER_LEAD,
      shot: {
        name: "pivot",
        size: "panel",
        alt: "A pivot table of revenue and units by region with a cell of it selected, and the PivotTable Fields list open beside it.",
        caption: "A pivot table of the Orders table: revenue and units by region.",
      },
    },
  ],
  "/docs/features/data/": [
    { after: AT_START, picture: "data-section" },
    {
      after: AT_START,
      shot: {
        name: "filter",
        size: "panel",
        alt: "The Orders sheet with its columns named Month, Region, Product, Units and Revenue, and the Region column filtered to EMEA: only the EMEA orders show.",
        caption: "Filtering the Region column to EMEA hides the other orders.",
        narrow: {
          tablet: {
            name: "filter-tablet",
            alt: "The Orders data with the Region column filtered to EMEA: the month, product, units and revenue of the EMEA orders only.",
            caption: "Filtering the Region column to EMEA hides the other orders.",
          },
          phone: {
            name: "filter-phone",
            alt: "The month, region and product of the EMEA orders, with B1 selected and EMEA in the formula bar.",
            caption: "Only the EMEA orders show.",
          },
        },
      },
    },
  ],
  "/docs/features/data/autofilter/": [{ after: AFTER_LEAD, picture: "autofilter" }],
  "/docs/features/grid/keyboard-shortcuts/": [{ after: AFTER_LEAD, picture: "keyboard-shortcuts" }],
  "/docs/features/data/validation-protection-and-notes/": [
    { after: "validation", picture: "write-checks" },
    { after: "error-alerts-and-input-messages", picture: "validation-alerts" },
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
    { after: AT_START, picture: "formulas-section" },
    {
      after: AT_START,
      shot: {
        name: "formula-bar",
        size: "panel",
        alt: "A revenue cell selected on the Report sheet, and the formula bar showing its formula, =SUMIFS(Orders[Revenue],Orders[Region],A3).",
        caption: "A formula keeps its source; the cell shows its result.",
        narrow: {
          tablet: {
            name: "formula-bar-tablet",
            alt: "C3 selected on the Report sheet, and the formula bar showing =SUMIFS(Orders[Revenue],Orders[Region],A3).",
            caption: "A formula keeps its source; the cell shows its result.",
          },
          phone: {
            name: "formula-bar-phone",
            alt: "The formula =SUMIFS(Orders[Revenue],Orders[Region],A3) in the formula bar, over the selected revenue cell, $4,047,955.",
            caption: "The formula bar shows the selected cell's formula.",
          },
        },
      },
    },
  ],
  "/docs/features/formulas/analysis-formulas/": [
    { after: "summarize-groupby-pivotby-percentof", picture: "groupby-spill" },
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

/** Whether a page shows any art, so its head links the art stylesheet; screenshots aren't art. */
export function pageHasArt(href: string): boolean {
  return (
    (DOCS_PICTURE_PLACEMENTS[href] ?? []).some((placement) => "picture" in placement) ||
    href in SECTION_HEADER_ART ||
    href === "/docs/start/choose-an-engine/"
  );
}
