// In-page diagrams for the showcases: labelled pictures for ideas that a
// picture explains better than text, drawn with the blueprint kit
// (art/blueprint.tsx) in a wide and a narrow layout.
import type { JSX } from "solid-js";

import { along, NARROW, node, WIDE, XlsxFlowFigure } from "./blueprint-figures.js";
import { FlowFigure, MergeFigure, PairsFigure, SequenceFigure } from "./blueprint-layouts.js";
import { BlueprintDiagram, type BlueprintLayout } from "./blueprint.js";

/** Live recalculation showcase: which formulas each edit recalculates. */
export function RecalculationDiagram(): JSX.Element {
  return (
    <PairsFigure
      note="The page times each edit in two parts: the engine's recalculation, then the grid's paint."
      pairs={[
        {
          from: { eyebrow: "Edit", title: "Price change" },
          to: {
            title: "100,000 revenue formulas",
            lines: ["That read it, and their total"],
            tone: "accent",
          },
        },
        {
          from: { eyebrow: "Edit", title: "First SKU looked up" },
          to: {
            title: "1,000 XLOOKUP formulas",
            lines: ["Each searching 100,000 SKUs,", "and their total"],
            tone: "accent",
          },
        },
      ]}
      text={{
        title: "Which formulas one edit recalculates, and what the page times",
        description:
          "Editing the Price change cell recalculates the 100,000 revenue formulas that read it and their total. Moving the first SKU looked up recalculates 1,000 XLOOKUP formulas, each searching 100,000 SKUs, and their total. The page times each edit in two parts: the engine's recalculation, then the grid's paint.",
      }}
    />
  );
}

const DATA_MODEL_TEXT = {
  title: "The data model: three related tables and the pivot over them",
  description:
    "Orders has Order, Product, Region, Units and Amount. Many orders relate to one product through Orders[Product] and Products[Product ID], and to one region through Orders[Region] and Regions[Code]. The model pivot Revenue by group takes its rows from Category, Region or Manager, and its values from Orders: Revenue as SUM of Amount, Orders as COUNTA of Order, and Average order, a measure.",
};

function dataModelLayout(width: number, narrow: boolean): BlueprintLayout {
  const gap = narrow ? 20 : 72;
  const w = (width - 16 - 2 * gap) / 3;
  const x = (index: number) => 8 + index * (w + gap);
  const tables = [
    node({
      id: "products",
      x: x(0),
      y: 8,
      w,
      eyebrow: "One",
      title: "Products",
      lines: narrow ? ["Product ID"] : ["Product ID,", "Product, Category"],
    }),
    node({
      id: "orders",
      x: x(1),
      y: 8,
      w,
      eyebrow: "Many",
      title: "Orders",
      lines: narrow ? ["Product,", "Region"] : ["Order, Product, Region,", "Units, Amount"],
      tone: "accent",
    }),
    node({
      id: "regions",
      x: x(2),
      y: 8,
      w,
      eyebrow: "One",
      title: "Regions",
      lines: narrow ? ["Code"] : ["Code,", "Region, Manager"],
    }),
  ];
  const top = Math.max(...tables.map((table) => table.rect.h));
  const sized = tables.map((table) => ({ ...table, rect: { ...table.rect, h: top } }));
  const pivot = node({
    id: "pivot",
    x: 8,
    y: 8 + top + 64,
    w: width - 16,
    eyebrow: "Model pivot",
    title: "Revenue by group",
    lines: narrow
      ? ["Rows: Category, Region or Manager", "Values: Revenue, Orders,", "Average order"]
      : ["Rows: Category, Region or Manager", "Values: Revenue, Orders, Average order"],
  });
  return {
    width,
    height: pivot.rect.y + pivot.rect.h + 8,
    nodes: [...sized, pivot],
    edges: [
      {
        from: "orders",
        fromSide: "left",
        to: "products",
        kind: "side",
        ...(narrow ? {} : { label: "Product", labelSide: "above" as const }),
      },
      {
        from: "orders",
        fromSide: "right",
        to: "regions",
        kind: "side",
        ...(narrow ? {} : { label: "Region → Code", labelSide: "above" as const }),
      },
      ...sized.map((table) => ({
        from: table.id,
        fromSide: "bottom" as const,
        to: "pivot",
        toT: along(pivot, table.rect.x + table.rect.w / 2),
        kind: "main" as const,
      })),
    ],
  };
}

/** Data model showcase: Orders, the two tables it relates to, and the pivot over all three. */
export function DataModelDiagram(): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={dataModelLayout(NARROW, true)}
      note="Average order is a measure: =SUM(Orders[Amount])/COUNT(Orders[Amount])."
      text={DATA_MODEL_TEXT}
      wide={dataModelLayout(WIDE, false)}
    />
  );
}

/** Spreadsheet showcase: the ribbon and your toolbar call the same grid actions. */
export function CommandModelDiagram(): JSX.Element {
  return (
    <MergeFigure
      note="The Targets sheet is a saved query that Data › Refresh All reloads."
      sources={[
        { title: "Ribbon command", lines: ["Home › Editing", "› AutoSum"] },
        { title: "Your toolbar", lines: ["Your own", "buttons"] },
      ]}
      steps={[
        { title: "grid.actions", lines: ["The same methods"], tone: "accent" },
        { title: "Grid", lines: ["Applies the command"] },
      ]}
      text={{
        title: "One command model: the ribbon and your toolbar call the same grid actions",
        description:
          "A ribbon command and a button in your own toolbar both call grid.actions, which applies the command to the grid. Data › Refresh All reloads the saved query behind the Targets sheet.",
      }}
    />
  );
}

function seamLayout(
  interfaces: readonly (readonly [name: string, methods: readonly string[]])[],
): BlueprintLayout {
  let y = 8;
  const nodes = interfaces.map(([name, methods], index) => {
    const placed = node({
      id: `seam-${index}`,
      x: 8,
      y,
      w: 264,
      ...(index === 0 ? { eyebrow: "Your host implements" } : {}),
      title: name,
      code: methods,
      tone: "accent",
    });
    y += placed.rect.h + 16;
    return placed;
  });
  return { width: 280, height: y - 8, nodes, edges: [] };
}

/** Showcase proof pages: the interfaces your host implements and Sheetwrite calls. */
export function BoundarySeam(
  props: Readonly<{ interfaces: readonly (readonly [name: string, methods: readonly string[]])[] }>,
): JSX.Element {
  const layout = () => seamLayout(props.interfaces);
  return (
    <BlueprintDiagram
      narrow={layout()}
      note="Sheetwrite calls these methods; your host implements them."
      text={{
        title: "The seam between Sheetwrite and your host",
        description: `Sheetwrite calls, and your host implements: ${props.interfaces
          .map(([name, methods]) => `${name} (${methods.join(", ")})`)
          .join("; ")}.`,
      }}
      wide={layout()}
    />
  );
}

const COLLABORATION_TEXT = {
  title: "Recovering a missed version, and draining offline edits on reconnect",
  description:
    "Client A sends an edit based on version 5; the server assigns version 6, acknowledges it to A and sends it to B. Version 7 never reaches B. When version 8 arrives, B sees the gap, requests versions 7 to 8, and the server replays them so B applies them in order. Later A goes offline with two edits queued; on reconnect it sends them and the server acknowledges them as versions 9 and 10.",
};

/** Collaboration: how a client recovers a missed version, and how offline edits drain on reconnect. */
export function CollaborationRecoveryDiagram() {
  return (
    <SequenceFigure
      lanes={[
        { id: "a", name: "Client A" },
        { id: "server", name: "Server" },
        { id: "b", name: "Client B" },
      ]}
      steps={[
        { message: "edit on v5", from: "a", to: "server" },
        { message: "ack v6", from: "server", to: "a", kind: "back" },
        { message: "v6", from: "server", to: "b", kind: "back" },
        { message: "v7", from: "server", to: "b", lost: true },
        { message: "v8", from: "server", to: "b", kind: "back" },
        { note: "Gap: v7 missing", lane: "b", tone: "danger" },
        { message: "ask v7–v8", from: "b", to: "server" },
        { message: "replay v7, v8", from: "server", to: "b", kind: "back" },
        { note: "Applied in order", lane: "b", tone: "accent" },
        { note: "Offline: 2 queued", lane: "a", tone: "muted" },
        { message: "send 2 edits", from: "a", to: "server" },
        { message: "ack v9, v10", from: "server", to: "a", kind: "back" },
      ]}
      text={COLLABORATION_TEXT}
    />
  );
}

const PAGING_TEXT = {
  title: "What stays loaded when you scroll a million rows",
  description:
    "The sheet has 1,000,000 rows and 1,000 columns. Rows load in pages of 4,096. The pages in view and those near them stay in memory, up to a 32 MiB budget for unedited pages; pages further away are evicted and fetched again from your page provider when you come back.",
};

/** Performance: the address space, the pages kept near the viewport, and the host's page provider. */
export function PagingDiagram() {
  return (
    <FlowFigure
      outcome={{
        from: 2,
        kind: "back",
        step: {
          title: "Your page provider",
          lines: ["Fetches a page again", "when you come back"],
        },
      }}
      steps={[
        { title: "1,000,000 rows", lines: ["In pages of", "4,096 rows"] },
        {
          title: "Pages in view",
          lines: ["And the pages near", "them stay in memory"],
          tone: "accent",
        },
        {
          title: "Over 32 MiB",
          lines: ["The farthest unedited", "pages are evicted"],
          tone: "muted",
        },
      ]}
      text={PAGING_TEXT}
    />
  );
}

/** A proposed in-page diagram: the showcase it belongs on and where. */
export interface ShowcaseDiagram {
  readonly showcase: string;
  readonly placement: string;
  readonly Diagram: () => JSX.Element;
}

/** The proposed diagrams, in the order the review shows them. */
export const DIAGRAMS: readonly ShowcaseDiagram[] = [
  {
    showcase: "Spreadsheet interoperability",
    placement: "above the Security lab",
    Diagram: XlsxFlowFigure,
  },
  {
    showcase: "Live recalculation",
    placement: "beside the timing panel",
    Diagram: RecalculationDiagram,
  },
  { showcase: "Data model", placement: "above the model pivot", Diagram: DataModelDiagram },
  {
    showcase: "Collaboration protocol",
    placement: "after the protocol log",
    Diagram: CollaborationRecoveryDiagram,
  },
  {
    showcase: "Performance & scale",
    placement: "beside the cache counters",
    Diagram: PagingDiagram,
  },
];
