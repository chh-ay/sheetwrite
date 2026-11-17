// One blueprint picture per showcase hub card, each drawing what its showcase
// does. The pictures are decorative: each card's title and text say the same.
import type { JSX } from "solid-js";

import { type CardBox, cardLayout, HUB_CARD, WIDE_CARD } from "./blueprint-cards.js";
import { BlueprintCard } from "./blueprint.js";

/** A capability card's picture: columns of boxes on the 8:5 hub card canvas. */
const hub = (...columns: (readonly CardBox[])[]) => cardLayout(HUB_CARD, columns);
/** A framework card's picture, on the 2:1 framework card canvas. */
const framework = (...columns: (readonly CardBox[])[]) => cardLayout(WIDE_CARD, columns);

const HUB_LAYOUTS = {
  // The ribbon, formula bar and sheet tabs around one grid.
  spreadsheet: hub(
    [{ title: "Ribbon" }, { title: "Formula bar" }, { title: "Sheet tabs" }],
    [{ title: "Grid", tone: "accent" }],
  ),
  // An edited order moves the pivot and the chart over it.
  analysis: hub([{ title: "Orders" }], [{ title: "Pivot" }], [{ title: "Chart", tone: "accent" }]),
  // Orders related to Products and Regions, and a measure over them.
  "data-model": hub(
    [{ title: "Products" }, { title: "Regions" }],
    [{ title: "Orders" }],
    [{ title: "Measure", code: ["[Revenue]"], tone: "accent" }],
  ),
  // One slicer filters the KPI cards, the chart and the pivot together.
  dashboards: hub(
    [{ title: "Slicer", tone: "accent" }],
    [{ title: "KPI" }, { title: "Chart" }, { title: "Pivot" }],
  ),
  // A CSV feed shaped by saved steps into a table.
  queries: hub(
    [{ title: "CSV feed" }],
    [{ title: "Steps", code: ["filter, sort"] }],
    [{ title: "Table", tone: "accent" }],
  ),
  // A column sorted in place.
  sort: hub(
    [{ title: "", code: ["B, A, C"] }],
    [{ title: "Sort A to Z" }],
    [{ title: "", code: ["A, B, C"], tone: "accent" }],
  ),
  // Functions from several families, run by one engine.
  functions: hub(
    [
      { title: "", code: ["=XLOOKUP"] },
      { title: "", code: ["=GROUPBY"] },
      { title: "", code: ["=LAMBDA"] },
    ],
    [{ title: "Engine", tone: "accent" }],
  ),
  // One edited cell, the formulas that read it, and their total.
  recalculation: hub(
    [{ title: "Edit A2" }],
    [{ title: "3 formulas" }],
    [{ title: "Total", tone: "accent" }],
  ),
  // Two versions compared, then one restored.
  "version-history": hub(
    [{ title: "v1" }, { title: "v2" }],
    [{ title: "Compare" }],
    [{ title: "Restore", tone: "accent" }],
  ),
  // The viewport, the pages kept near it, and the host's source.
  performance: hub(
    [{ title: "Viewport", tone: "accent" }],
    [{ title: "Pages" }],
    [{ title: "Source" }],
  ),
  // A dynamic-array formula and the range it spills into.
  formulas: hub(
    [{ title: "", code: ["=SEQUENCE(3)"] }],
    [{ title: "Spill", lines: ["A1:A3"], tone: "accent" }],
  ),
  // Neighbours that agree, and the rest of the formula that Tab takes.
  "formula-assist": hub(
    [{ title: "", code: ["=C4*D4"] }, { title: "", code: ["=C6*D6"] }],
    [{ title: "Tab", code: ["=C5*D5"], tone: "accent" }],
  ),
  // Two clients synced through one sequencing server.
  collaboration: hub(
    [{ title: "Client A" }, { title: "Client B" }],
    [{ title: "Server", tone: "accent" }],
  ),
  // Commits appended to a log, compacted into a snapshot.
  database: hub(
    [{ title: "Commits" }],
    [{ title: "Log" }],
    [{ title: "Snapshot", tone: "accent" }],
  ),
  // Records in the host's store, shown by the grid.
  "host-rows": hub([{ title: "Your records" }], [{ title: "Grid", tone: "accent" }]),
  // XLSX and CSV files, checked on the way into a workbook.
  interoperability: hub(
    [{ title: "XLSX" }, { title: "CSV" }],
    [{ title: "Checks" }],
    [{ title: "Workbook", tone: "accent" }],
  ),
  // Styles and number formats on a report.
  formatting: hub(
    [{ title: "Styles" }, { title: "Number formats" }],
    [{ title: "Report", tone: "accent" }],
  ),
  // A filter, a validation rule and a protected range on one table.
  "data-tools": hub(
    [{ title: "Filter" }, { title: "Validation" }, { title: "Protection" }],
    [{ title: "Table", tone: "accent" }],
  ),
  // The grid's lifecycle in a host element.
  vanilla: framework(
    [{ title: "", code: ["createGrid()"] }],
    [{ title: "Grid", tone: "accent" }],
    [{ title: "", code: ["destroy()"] }],
  ),
  // React state drives the grid; formula KPI cards read it back.
  react: framework(
    [{ title: "React state" }],
    [{ title: "Grid" }],
    [{ title: "KPI cards", tone: "accent" }],
  ),
  // Vue props drive the grid, with its rules and notes.
  vue: framework(
    [{ title: "Vue props" }],
    [{ title: "Grid" }],
    [{ title: "Rules, notes", tone: "accent" }],
  ),
  // Edits made offline, queued, then sent to the server.
  svelte: framework(
    [{ title: "Offline edits" }],
    [{ title: "Outbox" }],
    [{ title: "Server", tone: "accent" }],
  ),
} as const;

/** Every hub card's picture, by showcase or framework id. */
export const HUB_ART: Readonly<Record<string, () => JSX.Element>> = Object.fromEntries(
  Object.entries(HUB_LAYOUTS).map(([id, layout]) => [id, () => <BlueprintCard layout={layout} />]),
);
