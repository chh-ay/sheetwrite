// Docs figures drawn with the blueprint kit (art/blueprint.tsx). Box sizes
// come from their text (nodeHeight); connector ends come from the boxes.
import type { JSX } from "solid-js";

import { ExchangeFigure, FanFigure, FlowFigure } from "./blueprint-layouts.js";
import {
  BlueprintDiagram,
  type BlueprintEdge,
  type BlueprintLayout,
  type BlueprintNode,
  labelWidth,
  linkGap,
  nodeHeight,
  nodeWidth,
  ROOM,
  SPACING,
} from "./blueprint.js";
import { BRACKET, spread } from "./layout.js";

/** The width a wide drawing fills in the reading column, and a narrow one on a phone. */
export const WIDE = ROOM.wide;
export const NARROW = ROOM.narrow;

/** A node sized to its text at the given position and width. */
export function node(
  spec: Omit<BlueprintNode, "rect"> & {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h?: number;
  },
): BlueprintNode {
  const { x, y, w, h, ...rest } = spec;
  return { ...rest, rect: { x, y, w, h: h ?? nodeHeight(rest) } };
}

/** The fraction along a wide box's side that lines up with `x`. */
export const along = (target: BlueprintNode, x: number) => (x - target.rect.x) / target.rect.w;

// ---- Runtime ownership: architecture at a glance ---------------------------------

const ARCHITECTURE_TEXT = {
  title: "Who owns what at run time",
  description:
    "The host owns the lifecycle, persistence, collaboration and product UI. It drives the TypeScript core through createGrid and applyTransaction, and the core sends change and selection events back. The core owns the Grid API, transactions, virtualization and interaction; it asks the Rust/WASM engine for store operations and recalculation, and the engine returns packed resolved windows. The renderer paints one resolved window per pane, on the main thread or in a worker, and never owns cells.",
};

const HOST = {
  id: "host",
  eyebrow: "Your app",
  title: "Host",
  lines: ["Lifecycle, persistence, product UI"],
} as const;
const CORE = {
  id: "core",
  eyebrow: "@sheetwrite/core",
  title: "TypeScript core",
  lines: ["Grid API, transactions,", "virtualization"],
  tone: "accent",
} as const;
const RENDERER = {
  id: "renderer",
  eyebrow: "Canvas",
  title: "Renderer",
  lines: ["Main thread", "or worker"],
} as const;
const WASM = {
  id: "wasm",
  eyebrow: "@sheetwrite/wasm",
  title: "Rust / WASM engine",
  lines: ["Cells, formulas, snapshots"],
} as const;

/** The two connectors between neighbouring layers run this far either side of the column's centre. */
const PAIR_OFFSET = 12;

/**
 * Host, core and engine in one column, joined both ways. The connectors
 * between two layers run as a pair about the column's centre, each label on
 * its outer side, and the column is wide enough that the labels stay over
 * it. Wide, the renderer sits beside the core, in its row, at its height; on
 * phones it sits under the engine, its connector running down beside it.
 */
function architecture_layout(
  least: number,
  labels: {
    readonly down: readonly [string, string];
    readonly up: readonly [string, string];
    readonly side?: string;
  },
  is_stacked: boolean,
): BlueprintLayout {
  const widest_label = Math.max(...[...labels.down, ...labels.up].map(labelWidth));
  const column = Math.max(
    least,
    nodeWidth(HOST),
    nodeWidth(CORE),
    nodeWidth(WASM),
    2 * (PAIR_OFFSET + SPACING.label + widest_label),
  );
  const row_height = Math.max(nodeHeight(CORE), nodeHeight(RENDERER));
  const host = node({ ...HOST, x: 0, y: 0, w: column });
  const core = node({ ...CORE, x: 0, y: host.rect.h + SPACING.row, w: column, h: row_height });
  const wasm = node({ ...WASM, x: 0, y: core.rect.y + row_height + SPACING.row, w: column });
  const renderer = is_stacked
    ? node({ ...RENDERER, x: 0, y: wasm.rect.y + wasm.rect.h + SPACING.tile, w: column })
    : node({
        ...RENDERER,
        x: column + linkGap(labels.side === undefined ? [] : [labels.side]),
        y: core.rect.y,
        w: nodeWidth(RENDERER),
        h: row_height,
      });
  const down = 0.5 - PAIR_OFFSET / column;
  const up = 0.5 + PAIR_OFFSET / column;
  const pair = (
    upper: BlueprintNode,
    lower: BlueprintNode,
    [down_label, up_label]: readonly [string, string],
  ): BlueprintEdge[] => [
    { from: upper.id, fromSide: "bottom", to: lower.id, t: down, kind: "main", label: down_label },
    { from: lower.id, fromSide: "top", to: upper.id, t: up, kind: "back", label: up_label },
  ];
  return {
    nodes: [host, core, renderer, wasm],
    edges: [
      ...pair(host, core, [labels.down[0], labels.up[0]]),
      ...pair(core, wasm, [labels.down[1], labels.up[1]]),
      {
        from: "core",
        fromSide: "right",
        to: "renderer",
        ...(is_stacked ? { toSide: "right" as const } : {}),
        kind: "side",
        ...(labels.side === undefined ? {} : { label: labels.side }),
      },
    ],
  };
}

function architecture_wide(): BlueprintLayout {
  return architecture_layout(
    320,
    {
      down: ["createGrid · applyTransaction", "store ops · recalculation"],
      up: ["change · selection", "packed windows"],
      side: "a window per pane",
    },
    false,
  );
}

/** On phones the labels are one word each, and the renderer stacks under the engine. */
function architecture_narrow(): BlueprintLayout {
  return architecture_layout(
    NARROW - BRACKET,
    { down: ["createGrid", "store ops"], up: ["events", "windows"] },
    true,
  );
}

/** Runtime ownership › Architecture at a glance. */
export function ArchitectureFigure(): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={architecture_narrow()}
      text={ARCHITECTURE_TEXT}
      wide={architecture_wide()}
    />
  );
}

// ---- Import and export: the XLSX paths ---------------------------------------------

const XLSX_TEXT = {
  title: "How XLSX files come in and go out",
  description:
    "Import: XLSX bytes are unzipped with size and ratio limits, the XML is parsed without DTDs or entities, and the result is a workbook that the grid recalculates and paints. A hostile or oversized file leaves at unzip or parsing with a typed error, xlsx-import-failed or xlsx-resource-limit, and nothing is imported. Export writes the grid's workbook as XLSX, CSV or TSV. Import and export both report anything they don't keep as warnings, by code and cell.",
};

/**
 * A side box sized to its text, centred level with the middle of the steps
 * whose arrows enter it. Its arrows enter its side spread apart, so the
 * box stays its own size however far apart those steps are.
 */
function beside_steps(
  spec: Omit<BlueprintNode, "rect">,
  x: number,
  w: number,
  steps: readonly BlueprintNode[],
): BlueprintNode {
  const centres = steps.map((step) => step.rect.y + step.rect.h / 2);
  const h = nodeHeight(spec);
  return node({ ...spec, x, y: (Math.min(...centres) + Math.max(...centres)) / 2 - h / 2, w, h });
}

/**
 * Import down the left, export down the right, and between them the typed
 * error beside the steps that can fail and the warnings level with the two
 * steps that report them.
 */
function xlsx_wide(): BlueprintLayout {
  const import_steps = [
    { id: "bytes", eyebrow: "Import", title: "XLSX bytes", lines: ["File or fetch"] },
    { id: "unzip", title: "Unzip", lines: ["Sizes, ratio", "capped"] },
    { id: "parse", title: "Parse XML", lines: ["No DTDs or", "entities"] },
    {
      id: "workbook",
      title: "Workbook",
      lines: ["Sheets, cells,", "styles, names"],
      tone: "accent",
    },
    { id: "grid", title: "Grid", lines: ["Recalculated", "and painted"] },
  ] as const;
  const export_steps = [
    { id: "source", eyebrow: "Export", title: "Workbook", lines: ["From the grid"] },
    { id: "write", title: "Write", lines: ["XLSX, CSV", "or TSV"] },
    { id: "file", title: "File", lines: ["Download", "or bytes"] },
  ] as const;
  const error = {
    id: "error",
    title: "Typed error",
    code: ["xlsx-import-failed", "xlsx-resource-limit"],
    tone: "danger",
  } as const;
  const warnings = {
    id: "warnings",
    title: "Warnings",
    lines: ["Anything not kept,", "by code and cell"],
    tone: "muted",
  } as const;
  const h = Math.max(
    ...[...import_steps, ...export_steps, error, warnings].map((step) => nodeHeight(step)),
  );
  const row_y = (row: number) => row * (h + SPACING.row);
  const columns = [
    Math.max(...import_steps.map(nodeWidth)),
    Math.max(nodeWidth(error), nodeWidth(warnings)),
    Math.max(...export_steps.map(nodeWidth)),
  ] as const;
  const column_x = [
    0,
    columns[0] + SPACING.link,
    columns[0] + columns[1] + 2 * SPACING.link,
  ] as const;
  // The export column starts level with Parse XML, so Write sits level with Workbook.
  const export_first_row = 2;
  const nodes: BlueprintNode[] = [
    ...import_steps.map((step, row) => node({ ...step, x: 0, y: row_y(row), w: columns[0], h })),
    node({ ...warnings, x: column_x[1], y: row_y(3), w: columns[1], h }),
    ...export_steps.map((step, row) =>
      node({ ...step, x: column_x[2], y: row_y(export_first_row + row), w: columns[2], h }),
    ),
  ];
  const [, unzip, parse] = nodes;
  if (unzip === undefined || parse === undefined) throw new Error("The XLSX steps are missing");
  nodes.push(beside_steps(error, column_x[1], columns[1], [unzip, parse]));
  return {
    nodes,
    edges: [
      { from: "bytes", fromSide: "bottom", to: "unzip", kind: "main" },
      { from: "unzip", fromSide: "bottom", to: "parse", kind: "main" },
      { from: "parse", fromSide: "bottom", to: "workbook", kind: "main" },
      { from: "workbook", fromSide: "bottom", to: "grid", kind: "main" },
      { from: "unzip", fromSide: "right", to: "error", toT: spread(0, 2), kind: "fail" },
      { from: "parse", fromSide: "right", to: "error", toT: spread(1, 2), kind: "fail" },
      { from: "workbook", fromSide: "right", to: "warnings", kind: "back" },
      { from: "write", fromSide: "left", to: "warnings", kind: "back" },
      { from: "source", fromSide: "bottom", to: "write", kind: "main" },
      { from: "write", fromSide: "bottom", to: "file", kind: "main" },
    ],
  };
}

/** The import and export paths stacked, with the error and the warnings in a column beside them. */
function xlsx_narrow(): BlueprintLayout {
  const steps = [
    { id: "bytes", eyebrow: "Import", title: "XLSX bytes", lines: ["File or fetch"] },
    { id: "unzip", title: "Unzip", lines: ["Sizes, ratio", "capped"] },
    { id: "parse", title: "Parse XML", lines: ["No DTDs or", "entities"] },
    { id: "workbook", title: "Workbook", lines: ["Sheets, cells,", "names"], tone: "accent" },
    { id: "grid", title: "Grid", lines: ["Recalculated,", "painted"] },
    { id: "source", eyebrow: "Export", title: "Workbook", lines: ["From the grid"] },
    { id: "write", title: "Write", lines: ["XLSX, CSV", "or TSV"] },
  ] as const;
  const error_text = { title: "Typed error", lines: ["Nothing", "imported"] } as const;
  const warnings_text = { title: "Warnings", lines: ["Anything", "not kept"] } as const;
  const right = { w: Math.max(nodeWidth(error_text), nodeWidth(warnings_text)) };
  const w = Math.max(...steps.map(nodeWidth));
  // The export path starts a new group, a tile's space further down.
  let y = 0;
  const nodes: BlueprintNode[] = steps.map((step) => {
    if (step.id === "source") y += SPACING.tile;
    const placed = node({ ...step, x: 0, y, w });
    y += placed.rect.h + SPACING.row;
    return placed;
  });
  const right_at = { x: w + SPACING.link, w: right.w };
  const [, unzip, parse, workbook, , , write] = nodes;
  if (!unzip || !parse || !workbook || !write) throw new Error("The XLSX steps are missing");
  const error = beside_steps(
    { id: "error", ...error_text, tone: "danger" },
    right_at.x,
    right_at.w,
    [unzip, parse],
  );
  const warnings = beside_steps(
    { id: "warnings", ...warnings_text, tone: "muted" },
    right_at.x,
    right_at.w,
    [workbook, write],
  );
  return {
    nodes: [...nodes, error, warnings],
    edges: [
      { from: "bytes", fromSide: "bottom", to: "unzip", kind: "main" },
      { from: "unzip", fromSide: "bottom", to: "parse", kind: "main" },
      { from: "parse", fromSide: "bottom", to: "workbook", kind: "main" },
      { from: "workbook", fromSide: "bottom", to: "grid", kind: "main" },
      { from: "source", fromSide: "bottom", to: "write", kind: "main" },
      { from: "unzip", fromSide: "right", to: "error", toT: spread(0, 2), kind: "fail" },
      { from: "parse", fromSide: "right", to: "error", toT: spread(1, 2), kind: "fail" },
      { from: "workbook", fromSide: "right", to: "warnings", toT: spread(0, 2), kind: "back" },
      { from: "write", fromSide: "right", to: "warnings", toT: spread(1, 2), kind: "back" },
    ],
  };
}

/** Import and export: the import path, its failure exit, the export path, and the warnings of both. */
export function XlsxFlowFigure(): JSX.Element {
  return <BlueprintDiagram narrow={xlsx_narrow()} text={XLSX_TEXT} wide={xlsx_wide()} />;
}

// ---- Documents and operations: how changes reach the store -----------------------

const DOCUMENT_OPS_TEXT = {
  title: "How operations and snapshots reach the document",
  description:
    "DocumentOp transactions reach one store reducer and one change-event shape from three places: grid edits, which enter undo history and are sent by SyncCoordinator; direct Store.applyTransaction calls, which bypass the grid's read-only and history policy; and remote operations, which carry source remote and enter neither history nor outgoing sync. A WorkbookSnapshot loads through a separate validated hydration path that recalculates once the whole graph exists and emits no event or undo entry.",
};

const SOURCES = [
  { id: "grid", title: "Grid edits", lines: ["Undo history;", "SyncCoordinator sends them"] },
  { id: "direct", title: "Store.applyTransaction", lines: ["Skips read-only", "and history"] },
  {
    id: "remote",
    title: "Remote operations",
    lines: ['source: "remote";', "no history, not resent"],
  },
] as const;

function document_ops_wide(): BlueprintLayout {
  const w = Math.max(...SOURCES.map(nodeWidth));
  let y = 0;
  const sources = SOURCES.map((source) => {
    const placed = node({ ...source, x: 0, y, w });
    y += placed.rect.h + SPACING.tile;
    return placed;
  });
  const height = y - SPACING.tile;
  const store_text = {
    title: "Store",
    code: ["DocumentOp[]"],
    lines: ["One reducer, one change event"],
  } as const;
  const snapshot_text = {
    title: "Load a snapshot",
    code: ["WorkbookSnapshot"],
    lines: ["Validated; no event or undo"],
  } as const;
  // The store stands as tall as the sources, so each arrow runs straight
  // across; the snapshot sits under the store and hydrates it from below.
  const column = Math.max(nodeWidth(store_text), nodeWidth(snapshot_text));
  const store = node({
    id: "store",
    ...store_text,
    x: w + SPACING.link,
    y: 0,
    w: column,
    h: height,
    tone: "accent",
  });
  const snapshot = node({
    id: "snapshot",
    ...snapshot_text,
    x: store.rect.x,
    y: height + SPACING.row,
    w: column,
  });
  return {
    nodes: [...sources, store, snapshot],
    edges: [
      ...sources.map((source) => ({
        from: source.id,
        fromSide: "right" as const,
        to: "store",
        toT: (source.rect.y + source.rect.h / 2) / height,
        kind: "main" as const,
      })),
      { from: "snapshot", fromSide: "top", to: "store", kind: "side", label: "hydrates" },
    ],
  };
}

/** The gutter left of stacked sources, where their connectors drop to the box below. */
const GUTTER = 40;

function document_ops_narrow(): BlueprintLayout {
  // Phones show each source's short name; the wide drawing and the description say the rest.
  const short = [
    { id: "grid", title: "Grid edits", lines: ["Undo, sync"] },
    { id: "direct", title: "Direct calls", lines: ["No history"] },
    { id: "remote", title: "Remote ops", lines: ["Not resent"] },
  ];
  let y = 0;
  const sources = short.map((source) => {
    const placed = node({ ...source, x: GUTTER, y, w: NARROW - GUTTER });
    y += placed.rect.h + SPACING.tile;
    return placed;
  });
  const store = node({
    id: "store",
    x: 0,
    y: y - SPACING.tile + SPACING.row,
    w: NARROW,
    title: "Store",
    code: ["DocumentOp[]"],
    lines: ["One reducer, one change event"],
    tone: "accent",
  });
  const snapshot = node({
    id: "snapshot",
    x: 0,
    y: store.rect.y + store.rect.h + SPACING.row,
    w: NARROW,
    title: "Load a snapshot",
    code: ["WorkbookSnapshot"],
    lines: ["Validated; no event or undo"],
  });
  // Each source drops down the gutter into the store, the upper ones farther out, so none cross.
  const lane = (index: number) => 8 + (index * (GUTTER - 16)) / Math.max(1, sources.length - 1);
  return {
    nodes: [...sources, store, snapshot],
    edges: [
      ...sources.map((source, index) => ({
        from: source.id,
        fromSide: "left" as const,
        to: "store",
        toSide: "top" as const,
        toT: lane(index) / NARROW,
        kind: "main" as const,
      })),
      {
        from: "snapshot",
        fromSide: "top",
        to: "store",
        kind: "side",
        label: "hydrates",
      },
    ],
  };
}

/** Documents and operations: three ways operations reach the store, and snapshot hydration. */
export function DocumentOpsFigure(): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={document_ops_narrow()}
      text={DOCUMENT_OPS_TEXT}
      wide={document_ops_wide()}
    />
  );
}

// ---- Getting started and concepts ---------------------------------------------------

/** First grid: install, create, add a formula, save and open. */
export function FirstGridFigure(): JSX.Element {
  return (
    <FlowFigure
      steps={[
        { title: "1 · Install", code: ["npm install @sheetwrite/core"] },
        { title: "2 · Create", code: ["createGrid(host, { workbook })"] },
        {
          title: "3 · Formula",
          code: ["=SUM(B2:B4)"],
          lines: ["A total that updates"],
          tone: "accent",
        },
        { title: "4 · Save, open", code: ["exportSnapshot()", "createGridFromSnapshot(…)"] },
      ]}
      text={{
        title: "The four steps of a first grid",
        description:
          "Install the packages, create the grid in a host element with createGrid, add a formula that totals a column, then save the document with exportSnapshot and open it again with createGridFromSnapshot.",
      }}
    />
  );
}

/** Choose an engine: one source, two builds. */
export function EngineBuildsFigure(): JSX.Element {
  return (
    <FanFigure
      note="In the default build, full-only functions return #NAME?."
      source={{
        title: "One engine source, two builds",
        lines: ["Same API, storage and limits"],
      }}
      text={{
        title: "The default and full engine builds",
        description:
          "The default build, @sheetwrite/wasm, has math, lookup, text, logic, dates, dynamic arrays and LET. The full build, @sheetwrite/formulas, has every default function plus statistics and distributions, regression, finance, regex, database, matrix and reshaping functions, the LAMBDA helpers, GROUPBY and PIVOTBY. Both compile from the same source with the same API, storage and limits. In the default build, full-only functions return #NAME?.",
      }}
      tiles={[
        {
          eyebrow: "@sheetwrite/wasm",
          title: "Default",
          lines: ["Math, lookup, text, logic,", "dates, dynamic arrays, LET"],
        },
        {
          eyebrow: "@sheetwrite/formulas",
          title: "Full",
          lines: ["Every default function, plus", "statistics, finance, regex, LAMBDA"],
          tone: "accent",
        },
      ]}
    />
  );
}

/** Installation: what loads when. */
export function LoadOrderFigure(): JSX.Element {
  return (
    <FlowFigure
      note="@sheetwrite/formulas is optional: it adds the full engine. Framework adapters call initSheetwrite() on mount. Worker rendering and XLSX stay explicit: the worker entry is @sheetwrite/core/worker, and XLSX is the xlsxAddon() passed to initSheetwrite."
      steps={[
        {
          title: "Install",
          code: ["@sheetwrite/core", "@sheetwrite/formulas"],
        },
        {
          title: "initSheetwrite()",
          lines: ["Loads the engine once", "before the first grid"],
          tone: "accent",
        },
        {
          title: "createGrid",
          code: ["createGrid(host, options)"],
          lines: ["Mounts the grid"],
        },
      ]}
      text={{
        title: "What loads when",
        description:
          "Install @sheetwrite/core, which uses the default engine, @sheetwrite/wasm; add @sheetwrite/formulas for the full engine. initSheetwrite() loads the engine once, before the first grid or store; framework adapters call it on mount, and an engine passed to it is selected for good. Then createGrid mounts the grid. Worker rendering and XLSX stay explicit: the worker entry comes from @sheetwrite/core/worker, and XLSX needs @sheetwrite/xlsx registered with initSheetwrite({ addons: [xlsxAddon()] }).",
      }}
    />
  );
}

/** Calculation engine: what happens on an edit. */
export function RecalculationFigure(): JSX.Element {
  return (
    <FlowFigure
      note="The transaction returns after the calculation: getCell(…).resolved, the change event and the next paint show the new results."
      steps={[
        { title: "Transaction", code: ["set A2"] },
        { title: "Store", lines: ["Keeps the value,", "marks A2 dirty"] },
        { title: "Dependency index", lines: ["B2 reads A2,", "D5 reads B2"], tone: "accent" },
        { title: "Recalculate", lines: ["B2, then D5;", "C3 keeps its result"] },
      ]}
      text={{
        title: "What happens on an edit",
        description:
          "An edit is a transaction, such as set A2. The engine stores the value and marks A2 dirty. Its dependency index finds every formula that A2 affects, also through other formulas: B2 reads A2, and D5 reads B2. Only those formulas calculate again, in dependency order; a formula no change reaches, such as C3, keeps its result. The transaction returns after the calculation, so getCell(…).resolved has the new result, and the change event and the next paint show it.",
      }}
    />
  );
}

// ---- Data -----------------------------------------------------------------------------

/** Host-owned rows: rows in your store, edits back as deltas by row ID. */
export function RowBridgeFigure(): JSX.Element {
  return (
    <ExchangeFigure
      links={[
        { forward: "rows", back: "apply by ID" },
        { forward: "stable IDs", back: "row deltas" },
      ]}
      steps={[
        { eyebrow: "Your app", title: "Your store", lines: ["The row objects"] },
        { title: "createRowBridge", code: ["getRowId(row)", "createRowId()"], tone: "accent" },
        {
          eyebrow: "Sheetwrite",
          title: "Grid",
          lines: ["Editing, history,", "sorting, filtering"],
        },
      ]}
      text={{
        title: "Keeping app rows in your store",
        description:
          "Your store keeps the row objects. createRowBridge maps each row to a stable ID with getRowId, and createRowId names new rows. Sheetwrite owns editing, history, sorting and filtering in the grid, and reports each edit as a row delta that names the row by its ID, which your app applies to its store.",
      }}
    />
  );
}

// ---- Analysis ---------------------------------------------------------------------

const RELATIONSHIP_TEXT = {
  title: "A relationship and a pivot across it",
  description:
    "A relationship links two tables by one key column each. The from side, Orders[Customer], is the many side: many orders share a key. The to side, Customers[Customer], is the one side: each non-blank key is unique. A pivot over the model groups Orders by Customers › Region. A matching key reads that row's cell; no match or a blank key reads blank; a duplicate one-side key shows #VALUE! at the pivot's anchor.",
};

const ORDERS = {
  id: "orders",
  eyebrow: "Many side",
  title: "Orders",
  code: ["Orders[Customer]"],
  lines: ["Keys repeat"],
} as const;
const CUSTOMERS = {
  id: "customers",
  eyebrow: "One side",
  title: "Customers",
  code: ["Customers[Customer]"],
  lines: ["Each key once"],
} as const;
const PIVOT = {
  id: "pivot",
  title: "Pivot over the model",
  lines: ["Orders grouped by Customers › Region"],
  tone: "accent",
} as const;
const MANY_TO_ONE = "many → one";

/** Orders beside Customers, joined many to one, and the pivot under both. */
function relationship_wide(): BlueprintLayout {
  const gap = linkGap([MANY_TO_ONE]);
  const half = Math.max((WIDE - gap) / 2, nodeWidth(ORDERS), nodeWidth(CUSTOMERS));
  const top = Math.max(nodeHeight(ORDERS), nodeHeight(CUSTOMERS));
  const pivot = node({ ...PIVOT, x: 0, y: top + SPACING.row, w: 2 * half + gap });
  return {
    nodes: [
      node({ ...ORDERS, x: 0, y: 0, w: half, h: top }),
      node({ ...CUSTOMERS, x: half + gap, y: 0, w: half, h: top }),
      pivot,
    ],
    edges: [
      { from: "orders", fromSide: "right", to: "customers", kind: "side", label: MANY_TO_ONE },
      {
        from: "orders",
        fromSide: "bottom",
        to: "pivot",
        toT: along(pivot, half / 2),
        kind: "main",
      },
      {
        from: "customers",
        fromSide: "bottom",
        to: "pivot",
        toT: along(pivot, half + gap + half / 2),
        kind: "main",
      },
    ],
  };
}

/** On phones the three stack; Orders reaches the pivot down its left side. */
function relationship_narrow(): BlueprintLayout {
  const w = NARROW - BRACKET;
  const orders = node({ ...ORDERS, x: BRACKET, y: 0, w });
  const customers = node({ ...CUSTOMERS, x: BRACKET, y: orders.rect.h + SPACING.row, w });
  const pivot = node({
    ...PIVOT,
    x: BRACKET,
    y: customers.rect.y + customers.rect.h + SPACING.row,
    w,
  });
  return {
    nodes: [orders, customers, pivot],
    edges: [
      { from: "orders", fromSide: "bottom", to: "customers", kind: "side", label: MANY_TO_ONE },
      { from: "orders", fromSide: "left", toSide: "left", to: "pivot", kind: "main" },
      { from: "customers", fromSide: "bottom", to: "pivot", kind: "main" },
    ],
  };
}

/** Data model: a many-to-one relationship and a pivot that reads across it. */
export function RelationshipFigure(): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={relationship_narrow()}
      note="No match or a blank key reads blank; a duplicate key on the one side shows #VALUE! at the pivot."
      text={RELATIONSHIP_TEXT}
      wide={relationship_wide()}
    />
  );
}

/** Dashboards: which items a slicer filters. */
export function DashboardSlicerFigure(): JSX.Element {
  return (
    <FanFigure
      note="A slicer filters from the one side to the many side, never back."
      source={{ title: "Slicer on Regions[Region]", lines: ["Orders → Regions is many to one"] }}
      text={{
        title: "Which items a slicer filters",
        description:
          "A slicer on a column of a table filters every pivot whose table is that table or reaches it through many-to-one relationships; the filter goes from the one side to the many side, never back. Here a Region slicer on Regions filters the pivot over Orders, which reaches Regions, the PivotChart over that pivot, and a KPI card whose measure's home table is Orders. A pivot over Targets, which doesn't reach Regions, is not filtered.",
      }}
      tiles={[
        { title: "Pivot", lines: ["Over Orders, which reaches Regions"], tone: "accent" },
        { title: "PivotChart", lines: ["Follows its pivot"], tone: "accent" },
        { title: "KPI card", lines: ["Measure on Orders"], tone: "accent" },
        {
          title: "Pivot",
          lines: ["Over Targets: not filtered"],
          tone: "muted",
          unreached: true,
        },
      ]}
    />
  );
}

/** Persistence: how the version archive records a document. */
export function VersionArchiveFigure(): JSX.Element {
  return (
    <FlowFigure
      note="A marker is made after five active minutes with committed edits, and saveVersion names one; readVersion and diffVersions read versions back."
      steps={[
        {
          title: "Committed",
          lines: ["With revision and author;", "optimistic edits aren't recorded"],
        },
        { title: "Log", lines: ["Each transaction appended"] },
        {
          title: "Checkpoint",
          lines: ["After 30 active minutes,", "1,000 transactions or 2 MiB of log"],
          tone: "accent",
        },
        { title: "Pages", lines: ["16 rows × 4 columns;", "unchanged pages are shared"] },
      ]}
      text={{
        title: "How the version archive records a document",
        description:
          "Only committed transactions, confirmed by the document authority with their revision and author, go to record; optimistic grid change events don't. The archive appends each one to its log and makes a checkpoint when one is due: after 30 active minutes, 1,000 transactions or 2 MiB of log. Checkpoints reference fixed 16-row by 4-column cell pages, and unchanged pages are shared between checkpoints. An automatic marker is made after five active minutes with committed edits; saveVersion names one. readVersion and diffVersions read versions back.",
      }}
    />
  );
}
