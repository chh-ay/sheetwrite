// Docs figures drawn with the blueprint kit (art/blueprint.tsx). Box sizes
// come from their text (nodeHeight); connector ends come from the boxes.
import type { JSX } from "solid-js";

import { ExchangeFigure, FanFigure, FlowFigure } from "./blueprint-layouts.js";
import {
  BlueprintDiagram,
  type BlueprintLayout,
  type BlueprintNode,
  nodeHeight,
} from "./blueprint.js";
import { spread } from "./layout.js";

/** Wide drawings span the reading column; narrow ones a phone's width. */
const WIDE = 720;
const NARROW = 360;

/** A node sized to its text at the given position and width. */
function node(
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
const along = (target: BlueprintNode, x: number) => (x - target.rect.x) / target.rect.w;

// ---- Runtime ownership: architecture at a glance ---------------------------------

const ARCHITECTURE_TEXT = {
  title: "Who owns what at run time",
  description:
    "The host owns the lifecycle, persistence, collaboration and product UI. It drives the TypeScript core through createGrid and applyTransaction, and the core sends change and selection events back. The core owns the Grid API, transactions, virtualization and interaction; it asks the Rust/WASM engine for store operations and recalculation, and the engine returns packed resolved windows. The renderer paints one resolved window per pane, on the main thread or in a worker, and never owns cells.",
};

function architectureWide(): BlueprintLayout {
  const host = node({
    id: "host",
    x: 120,
    y: 8,
    w: 320,
    eyebrow: "Your app",
    title: "Host",
    lines: ["Lifecycle, persistence, product UI"],
  });
  const core = node({
    id: "core",
    x: 120,
    y: 152,
    w: 320,
    eyebrow: "@sheetwrite/core",
    title: "TypeScript core",
    lines: ["Grid API, transactions, virtualization"],
    tone: "accent",
  });
  const renderer = node({
    id: "renderer",
    x: 580,
    y: 152,
    w: 132,
    eyebrow: "Canvas",
    title: "Renderer",
    lines: ["Main thread", "or worker"],
  });
  const wasm = node({
    id: "wasm",
    x: 120,
    y: 296,
    w: 320,
    eyebrow: "@sheetwrite/wasm",
    title: "Rust / WASM engine",
    lines: ["Cells, formulas, snapshots"],
  });
  return {
    width: WIDE,
    height: wasm.rect.y + wasm.rect.h + 8,
    nodes: [host, core, renderer, wasm],
    edges: [
      {
        from: "host",
        fromSide: "bottom",
        to: "core",
        t: spread(0, 2, 0.3),
        kind: "main",
        label: "createGrid · applyTransaction",
        labelSide: "left",
      },
      {
        from: "core",
        fromSide: "top",
        to: "host",
        t: spread(1, 2, 0.3),
        kind: "back",
        label: "change · selection",
        labelSide: "right",
      },
      {
        from: "core",
        fromSide: "bottom",
        to: "wasm",
        t: spread(0, 2, 0.3),
        kind: "main",
        label: "store ops · recalculation",
        labelSide: "left",
      },
      {
        from: "wasm",
        fromSide: "top",
        to: "core",
        t: spread(1, 2, 0.3),
        kind: "back",
        label: "packed windows",
        labelSide: "right",
      },
      {
        from: "core",
        fromSide: "right",
        to: "renderer",
        kind: "side",
        label: "a window per pane",
        labelSide: "below",
      },
    ],
  };
}

function architectureNarrow(): BlueprintLayout {
  const host = node({
    id: "host",
    x: 8,
    y: 8,
    w: 344,
    eyebrow: "Your app",
    title: "Host",
    lines: ["Lifecycle, persistence, product UI"],
  });
  const core = node({
    id: "core",
    x: 8,
    y: 152,
    w: 216,
    eyebrow: "@sheetwrite/core",
    title: "TypeScript core",
    lines: ["Grid API, transactions,", "virtualization"],
    tone: "accent",
  });
  const renderer = node({
    id: "renderer",
    x: 252,
    y: 152,
    w: 100,
    h: core.rect.h,
    eyebrow: "Canvas",
    title: "Renderer",
    lines: ["Main thread", "or worker"],
  });
  const wasm = node({
    id: "wasm",
    x: 8,
    y: 152 + core.rect.h + 72,
    w: 344,
    eyebrow: "@sheetwrite/wasm",
    title: "Rust / WASM engine",
    lines: ["Cells, formulas, snapshots"],
  });
  // The tall boxes' connectors leave the core at a quarter and three quarters of its width, straight.
  const down = core.rect.x + core.rect.w * 0.25;
  const up = core.rect.x + core.rect.w * 0.75;
  return {
    width: NARROW,
    height: wasm.rect.y + wasm.rect.h + 8,
    nodes: [host, core, renderer, wasm],
    edges: [
      {
        from: "host",
        fromSide: "bottom",
        to: "core",
        t: along(host, down),
        toT: 0.25,
        kind: "main",
        label: "createGrid",
        labelSide: "right",
      },
      {
        from: "core",
        fromSide: "top",
        to: "host",
        t: 0.75,
        toT: along(host, up),
        kind: "back",
        label: "events",
        labelSide: "right",
      },
      {
        from: "core",
        fromSide: "bottom",
        to: "wasm",
        t: 0.25,
        toT: along(wasm, down),
        kind: "main",
        label: "store ops",
        labelSide: "right",
      },
      {
        from: "wasm",
        fromSide: "top",
        to: "core",
        t: along(wasm, up),
        toT: 0.75,
        kind: "back",
        label: "windows",
        labelSide: "right",
      },
      { from: "core", fromSide: "right", to: "renderer", kind: "side" },
    ],
  };
}

/** Runtime ownership › Architecture at a glance. */
export function ArchitectureFigure(): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={architectureNarrow()}
      text={ARCHITECTURE_TEXT}
      wide={architectureWide()}
    />
  );
}

// ---- Import and export: the XLSX paths ---------------------------------------------

const XLSX_TEXT = {
  title: "How XLSX files come in and go out",
  description:
    "Import: XLSX bytes are unzipped with size and ratio limits, the XML is parsed without DTDs or entities, and the result is a workbook that the grid recalculates and paints. A hostile or oversized file leaves at unzip or parsing with a typed error, xlsx-import-failed or xlsx-resource-limit, and nothing is imported. Export writes the grid's workbook as XLSX, CSV or TSV. Import and export both report anything they don't keep as warnings, by code and cell.",
};

function xlsxWide(): BlueprintLayout {
  const w = 120;
  const gap = 26;
  const x = (index: number) => 8 + index * (w + gap);
  const row = (y: number, h: number) => ({ y, h });
  const top = row(8, 62);
  const middle = row(108, 62);
  const bottom = row(216, 62);
  const nodes: BlueprintNode[] = [
    node({
      id: "bytes",
      x: x(0),
      ...top,
      w,
      eyebrow: "Import",
      title: "XLSX bytes",
      lines: ["File or fetch"],
    }),
    node({ id: "unzip", x: x(1), ...top, w, title: "Unzip", lines: ["Sizes, ratio", "capped"] }),
    node({
      id: "parse",
      x: x(2),
      ...top,
      w,
      title: "Parse XML",
      lines: ["No DTDs or", "entities"],
    }),
    node({
      id: "workbook",
      x: x(3),
      ...top,
      w,
      title: "Workbook",
      lines: ["Sheets, cells,", "styles, names"],
      tone: "accent",
    }),
    node({ id: "grid", x: x(4), ...top, w, title: "Grid", lines: ["Recalculated", "and painted"] }),
    node({
      id: "error",
      x: x(1),
      ...middle,
      w: 2 * w + gap,
      title: "Typed error",
      code: ["xlsx-import-failed", "xlsx-resource-limit"],
      tone: "danger",
    }),
    node({
      id: "warnings",
      x: x(3),
      ...middle,
      w: 2 * w + gap,
      title: "Warnings",
      lines: ["Anything not kept,", "by code and cell"],
      tone: "muted",
    }),
    node({
      id: "source",
      x: x(2),
      ...bottom,
      w,
      eyebrow: "Export",
      title: "Workbook",
      lines: ["From the grid"],
    }),
    node({ id: "write", x: x(3), ...bottom, w, title: "Write", lines: ["XLSX, CSV", "or TSV"] }),
    node({ id: "file", x: x(4), ...bottom, w, title: "File", lines: ["Download", "or bytes"] }),
  ];
  return {
    width: WIDE,
    height: bottom.y + bottom.h + 8,
    nodes,
    edges: [
      { from: "bytes", fromSide: "right", to: "unzip", kind: "main" },
      { from: "unzip", fromSide: "right", to: "parse", kind: "main" },
      { from: "parse", fromSide: "right", to: "workbook", kind: "main" },
      { from: "workbook", fromSide: "right", to: "grid", kind: "main" },
      { from: "unzip", fromSide: "bottom", to: "error", t: 0.5, toT: 0.25, kind: "fail" },
      { from: "parse", fromSide: "bottom", to: "error", t: 0.5, toT: 0.75, kind: "fail" },
      { from: "workbook", fromSide: "bottom", to: "warnings", t: 0.5, toT: 0.25, kind: "back" },
      { from: "write", fromSide: "top", to: "warnings", t: 0.5, toT: 0.25, kind: "back" },
      { from: "source", fromSide: "right", to: "write", kind: "main" },
      { from: "write", fromSide: "right", to: "file", kind: "main" },
    ],
  };
}

function xlsxNarrow(): BlueprintLayout {
  const w = 216;
  const step = (index: number) => 8 + index * 80;
  const box = (
    id: string,
    index: number,
    title: string,
    lines: string[],
    extra: Partial<BlueprintNode> & { readonly h?: number; readonly y?: number } = {},
  ) => node({ id, x: 8, y: step(index), w, h: 56, title, lines, ...extra });
  const nodes: BlueprintNode[] = [
    box("bytes", 0, "XLSX bytes", ["File or fetch"], { eyebrow: "Import", h: 62 }),
    box("unzip", 1, "Unzip", ["Sizes, ratio capped"]),
    box("parse", 2, "Parse XML", ["No DTDs or entities"]),
    box("workbook", 3, "Workbook", ["Sheets, cells, names"], { tone: "accent" }),
    box("grid", 4, "Grid", ["Recalculated, painted"]),
    box("source", 5, "Workbook", ["From the grid"], { eyebrow: "Export", h: 62, y: step(5) + 24 }),
    box("write", 6, "Write", ["XLSX, CSV or TSV"], { y: step(6) + 24 }),
  ];
  const right = { x: 244, w: 108 };
  const unzip = nodes[1];
  const parse = nodes[2];
  const workbook = nodes[3];
  const write = nodes[6];
  if (!unzip || !parse || !workbook || !write) throw new Error("The XLSX steps are missing");
  const error = node({
    id: "error",
    ...right,
    y: unzip.rect.y,
    h: parse.rect.y + parse.rect.h - unzip.rect.y,
    title: "Typed error",
    lines: ["Nothing", "imported"],
    tone: "danger",
  });
  const warnings = node({
    id: "warnings",
    ...right,
    y: workbook.rect.y,
    h: write.rect.y + write.rect.h - workbook.rect.y,
    title: "Warnings",
    lines: ["Anything not", "kept, by code", "and cell"],
    tone: "muted",
  });
  // Side connectors enter the tall boxes level with the step they leave.
  const level = (from: BlueprintNode, to: BlueprintNode) =>
    (from.rect.y + from.rect.h / 2 - to.rect.y) / to.rect.h;
  return {
    width: NARROW,
    height: write.rect.y + write.rect.h + 8,
    nodes: [...nodes, error, warnings],
    edges: [
      { from: "bytes", fromSide: "bottom", to: "unzip", kind: "main" },
      { from: "unzip", fromSide: "bottom", to: "parse", kind: "main" },
      { from: "parse", fromSide: "bottom", to: "workbook", kind: "main" },
      { from: "workbook", fromSide: "bottom", to: "grid", kind: "main" },
      { from: "source", fromSide: "bottom", to: "write", kind: "main" },
      { from: "unzip", fromSide: "right", to: "error", toT: level(unzip, error), kind: "fail" },
      { from: "parse", fromSide: "right", to: "error", toT: level(parse, error), kind: "fail" },
      {
        from: "workbook",
        fromSide: "right",
        to: "warnings",
        toT: level(workbook, warnings),
        kind: "back",
      },
      {
        from: "write",
        fromSide: "right",
        to: "warnings",
        toT: level(write, warnings),
        kind: "back",
      },
    ],
  };
}

/** Import and export: the import path, its failure exit, the export path, and the warnings of both. */
export function XlsxFlowFigure(): JSX.Element {
  return <BlueprintDiagram narrow={xlsxNarrow()} text={XLSX_TEXT} wide={xlsxWide()} />;
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

function documentOpsWide(): BlueprintLayout {
  const sources = SOURCES.map((source, index) =>
    node({ ...source, x: 8, y: 8 + index * 76, w: 232 }),
  );
  const last = sources.at(-1);
  if (last === undefined) throw new Error("No operation sources");
  const height = last.rect.y + last.rect.h;
  const store = node({
    id: "store",
    x: 290,
    y: 0,
    w: 160,
    title: "Store",
    lines: ["One reducer,", "one change event"],
    code: ["DocumentOp[]"],
    tone: "accent",
  });
  const storeAt = { ...store, rect: { ...store.rect, y: (8 + height - store.rect.h) / 2 } };
  const snapshot = node({
    id: "snapshot",
    x: 540,
    y: 0,
    w: 172,
    title: "Load a snapshot",
    lines: ["Validated, recalculated", "once; no event or undo"],
    code: ["WorkbookSnapshot"],
  });
  const snapshotAt = {
    ...snapshot,
    rect: { ...snapshot.rect, y: storeAt.rect.y + (storeAt.rect.h - snapshot.rect.h) / 2 },
  };
  return {
    width: WIDE,
    height: height + 8,
    nodes: [...sources, storeAt, snapshotAt],
    edges: [
      ...sources.map((source, index) => ({
        from: source.id,
        fromSide: "right" as const,
        to: "store",
        toT: spread(index, sources.length),
        kind: "main" as const,
      })),
      {
        from: "snapshot",
        fromSide: "left",
        to: "store",
        kind: "side",
        label: "hydrates",
        labelSide: "above",
      },
    ],
  };
}

function documentOpsNarrow(): BlueprintLayout {
  // Phones show each source's short name; the wide drawing and the description say the rest.
  const short = [
    { id: "grid", title: "Grid edits", lines: ["Undo, sync"] },
    { id: "direct", title: "Direct calls", lines: ["No history"] },
    { id: "remote", title: "Remote ops", lines: ["Not resent"] },
  ];
  const sources = short.map((source, index) =>
    node({ ...source, x: 8 + index * 116, y: 8, w: 112 }),
  );
  const store = node({
    id: "store",
    x: 8,
    y: 112,
    w: 344,
    title: "Store",
    lines: ["One reducer, one change event"],
    code: ["DocumentOp[]"],
    tone: "accent",
  });
  const snapshot = node({
    id: "snapshot",
    x: 8,
    y: store.rect.y + store.rect.h + 48,
    w: 344,
    title: "Load a snapshot",
    lines: ["Validated, recalculated once;", "no event or undo"],
    code: ["WorkbookSnapshot"],
  });
  return {
    width: NARROW,
    height: snapshot.rect.y + snapshot.rect.h + 8,
    nodes: [...sources, store, snapshot],
    edges: [
      ...sources.map((source, index) => ({
        from: source.id,
        fromSide: "bottom" as const,
        to: "store",
        toT: spread(index, sources.length, 0.16),
        kind: "main" as const,
      })),
      {
        from: "snapshot",
        fromSide: "top",
        to: "store",
        kind: "side",
        label: "hydrates",
        labelSide: "right",
      },
    ],
  };
}

/** Documents and operations: three ways operations reach the store, and snapshot hydration. */
export function DocumentOpsFigure(): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={documentOpsNarrow()}
      text={DOCUMENT_OPS_TEXT}
      wide={documentOpsWide()}
    />
  );
}

// ---- Getting started and concepts ---------------------------------------------------

/** First grid: install, create, add a formula, save and open. */
export function FirstGridFigure(): JSX.Element {
  return (
    <FlowFigure
      steps={[
        { title: "1 · Install", code: ["npm install", "@sheetwrite/core"] },
        { title: "2 · Create", code: ["createGrid(host,", "  { workbook })"] },
        {
          title: "3 · Formula",
          code: ["=SUM(B2:B4)"],
          lines: ["A total that updates"],
          tone: "accent",
        },
        { title: "4 · Save, open", code: ["exportSnapshot()", "createGridFromSnapshot"] },
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
          lines: [
            "Every default function, plus",
            "statistics, finance, regex,",
            "LAMBDA, GROUPBY, PIVOTBY",
          ],
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
      note="Worker rendering and XLSX stay explicit: the worker entry is @sheetwrite/core/worker, and XLSX is the xlsxAddon() passed to initSheetwrite."
      steps={[
        {
          title: "Install",
          code: ["@sheetwrite/core"],
          lines: ["Add @sheetwrite/formulas", "for the full engine"],
        },
        {
          title: "initSheetwrite()",
          lines: ["Loads the engine once,", "before the first grid;", "adapters call it on mount"],
          tone: "accent",
        },
        {
          title: "createGrid",
          code: ["createGrid(host,", "  options)"],
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

function relationshipLayout(width: number, narrow: boolean): BlueprintLayout {
  const half = (width - 16 - (narrow ? 24 : 96)) / 2;
  const orders = node({
    id: "orders",
    x: 8,
    y: 8,
    w: half,
    eyebrow: "Many side",
    title: "Orders",
    code: ["Orders[Customer]"],
    lines: ["Keys repeat"],
  });
  const customers = node({
    id: "customers",
    x: width - 8 - half,
    y: 8,
    w: half,
    eyebrow: "One side",
    title: "Customers",
    code: ["Customers[Customer]"],
    lines: ["Each key once"],
  });
  const top = Math.max(orders.rect.h, customers.rect.h);
  const pivot = node({
    id: "pivot",
    x: 8,
    y: 8 + top + 56,
    w: width - 16,
    title: "Pivot over the model",
    lines: ["Orders grouped by Customers › Region"],
    tone: "accent",
  });
  const sized = [orders, customers].map((each) => ({ ...each, rect: { ...each.rect, h: top } }));
  return {
    width,
    height: pivot.rect.y + pivot.rect.h + 8,
    nodes: [...sized, pivot],
    edges: [
      {
        from: "orders",
        fromSide: "right",
        to: "customers",
        kind: "side",
        label: narrow ? "" : "many → one",
        labelSide: "above",
      },
      {
        from: "orders",
        fromSide: "bottom",
        to: "pivot",
        toT: along(pivot, 8 + half / 2),
        kind: "main",
      },
      {
        from: "customers",
        fromSide: "bottom",
        to: "pivot",
        toT: along(pivot, width - 8 - half / 2),
        kind: "main",
      },
    ],
  };
}

/** Data model: a many-to-one relationship and a pivot that reads across it. */
export function RelationshipFigure(): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={relationshipLayout(NARROW, true)}
      note="No match or a blank key reads blank; a duplicate key on the one side shows #VALUE! at the pivot."
      text={RELATIONSHIP_TEXT}
      wide={relationshipLayout(WIDE, false)}
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
        { title: "Pivot", lines: ["Over Orders, which", "reaches Regions"], tone: "accent" },
        { title: "PivotChart", lines: ["Follows its pivot"], tone: "accent" },
        { title: "KPI card", lines: ["Measure on Orders"], tone: "accent" },
        {
          title: "Pivot",
          lines: ["Over Targets:", "not filtered"],
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
          lines: ["Confirmed with revision", "and author; optimistic", "edits aren't recorded"],
        },
        { title: "Log", lines: ["Each transaction", "appended"] },
        {
          title: "Checkpoint",
          lines: ["After 30 active minutes,", "1,000 transactions", "or 2 MiB of log"],
          tone: "accent",
        },
        { title: "Pages", lines: ["16 rows × 4 columns;", "unchanged pages", "are shared"] },
      ]}
      text={{
        title: "How the version archive records a document",
        description:
          "Only committed transactions, confirmed by the document authority with their revision and author, go to record; optimistic grid change events don't. The archive appends each one to its log and makes a checkpoint when one is due: after 30 active minutes, 1,000 transactions or 2 MiB of log. Checkpoints reference fixed 16-row by 4-column cell pages, and unchanged pages are shared between checkpoints. An automatic marker is made after five active minutes with committed edits; saveVersion names one. readVersion and diffVersions read versions back.",
      }}
    />
  );
}
