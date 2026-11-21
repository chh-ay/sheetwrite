// Pictures for the docs: one blueprint picture per docs section card (2:1,
// the docs card shape), also shown beside each section page's title, and the
// concept diagrams that sit beside a page's text.
import type { JSX } from "solid-js";

import { cardLayout, DOCS_CARD } from "./blueprint-cards.js";
import {
  DashboardSlicerFigure,
  EngineBuildsFigure,
  FirstGridFigure,
  LoadOrderFigure,
  RecalculationFigure,
  RelationshipFigure,
  RowBridgeFigure,
  VersionArchiveFigure,
  XlsxFlowFigure,
} from "./blueprint-figures.js";
import { BlueprintCard } from "./blueprint.js";
import { CollaborationRecoveryDiagram, PagingDiagram } from "./diagrams.js";

/** What a section card's picture accepts: an extra class for the box it sits in. */
interface ArtProps {
  readonly class?: string;
}

/** Each section card's picture: what the section's pages lead the reader through. */
const DOCS_CARD_LAYOUTS = {
  // Install, create, calculate.
  "getting-started": cardLayout(DOCS_CARD, [
    [{ title: "npm i" }],
    [{ title: "createGrid" }],
    [{ title: "=SUM", tone: "accent" }],
  ]),
  // One grid, mounted from each framework.
  frameworks: cardLayout(DOCS_CARD, [
    [{ title: "React" }, { title: "Vue" }, { title: "Svelte" }],
    [{ title: "One grid", tone: "accent" }],
  ]),
  // From a first grid to a full spreadsheet app.
  tutorials: cardLayout(DOCS_CARD, [
    [{ title: "Grid" }],
    [{ title: "Ribbon" }],
    [{ title: "App", tone: "accent" }],
  ]),
  // Your app owns the store; the engine calculates and the canvas paints.
  concepts: cardLayout(DOCS_CARD, [
    [{ title: "Your app" }],
    [{ title: "Store", tone: "accent" }],
    [{ title: "Engine" }, { title: "Canvas" }],
  ]),
  // The grid and what it adds to cells.
  features: cardLayout(DOCS_CARD, [
    [{ title: "Grid", tone: "accent" }],
    [{ title: "Formats" }, { title: "Filters" }, { title: "Charts" }],
  ]),
  // Files in and out of a workbook.
  "import-export": cardLayout(DOCS_CARD, [
    [{ title: "XLSX" }, { title: "CSV" }],
    [{ title: "Workbook", tone: "accent" }],
  ]),
  // A package's entries, by kind.
  "api-reference": cardLayout(DOCS_CARD, [
    [{ title: "Package" }],
    [
      { title: "", code: ["createGrid()"] },
      { title: "", code: ["Grid"], tone: "accent" },
      { title: "", code: ["CellValue"] },
    ],
  ]),
  // Excel syntax, and the engine that runs it.
  formulas: cardLayout(DOCS_CARD, [
    [{ title: "", code: ["=XLOOKUP(…)"] }],
    [{ title: "Default engine" }, { title: "Full engine", tone: "accent" }],
  ]),
  // Each benchmark, measured on one release and the next.
  performance: cardLayout(DOCS_CARD, [
    [{ title: "Benchmark" }],
    [{ title: "0.6.1" }, { title: "0.7.0", tone: "accent" }],
  ]),
} as const;

/** Docs section cards by section id. */
export const DOCS_CARD_ART: Readonly<Record<string, (props: ArtProps) => JSX.Element>> =
  Object.fromEntries(
    Object.entries(DOCS_CARD_LAYOUTS).map(([id, layout]) => [
      id,
      (props: ArtProps) => <BlueprintCard class={props.class} layout={layout} />,
    ]),
  );

/** Docs diagrams by the name a placement uses. */
export const DOCS_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "first-grid": FirstGridFigure,
  engines: EngineBuildsFigure,
  "load-order": LoadOrderFigure,
  recalculation: RecalculationFigure,
  "row-bridge": RowBridgeFigure,
  relationships: RelationshipFigure,
  "dashboard-slicers": DashboardSlicerFigure,
  "version-archive": VersionArchiveFigure,
  paging: PagingDiagram,
  xlsx: XlsxFlowFigure,
  "collaboration-recovery": CollaborationRecoveryDiagram,
};
