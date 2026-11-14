// Docs figures drawn with the blueprint kit (art/blueprint.tsx). Box sizes
// come from their text (nodeHeight); connector ends come from the boxes.
import type { JSX } from "solid-js";

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
    x: 190,
    y: 8,
    w: 320,
    eyebrow: "Your app",
    title: "Host",
    lines: ["Lifecycle, persistence, product UI"],
  });
  const core = node({
    id: "core",
    x: 190,
    y: 152,
    w: 320,
    eyebrow: "@sheetwrite/core",
    title: "TypeScript core",
    lines: ["Grid API, transactions, virtualization"],
    tone: "accent",
  });
  const renderer = node({
    id: "renderer",
    x: 584,
    y: 152,
    w: 128,
    eyebrow: "Canvas",
    title: "Renderer",
    lines: ["Main thread", "or worker"],
  });
  const wasm = node({
    id: "wasm",
    x: 190,
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
  const w = 124;
  const gap = 25;
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
    x: 296,
    y: 0,
    w: 168,
    title: "Store",
    lines: ["One reducer,", "one change event"],
    code: ["DocumentOp[]"],
    tone: "accent",
  });
  const storeAt = { ...store, rect: { ...store.rect, y: (8 + height - store.rect.h) / 2 } };
  const snapshot = node({
    id: "snapshot",
    x: 520,
    y: 0,
    w: 192,
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
