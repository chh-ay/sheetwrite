import { afterEach, beforeAll, beforeEach, expect, it, spyOn } from "bun:test";

import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { CellValue, DocumentOp, Grid, Sheet, Workbook } from "../src/types.js";

const ROW_COUNT = 1_000;
const OFFSCREEN_ROW = ROW_COUNT - 1;
const HOST_WIDTH = 800;
const HOST_HEIGHT = 400;
const OVERSCAN_ROWS = 20;
let restoreCanvas: () => void;
let originalFrame: typeof requestAnimationFrame;
let originalCancelFrame: typeof cancelAnimationFrame;
const mounted: Array<{ grid: Grid; host: HTMLElement }> = [];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
  originalFrame = globalThis.requestAnimationFrame;
  originalCancelFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    nextFrame += 1;
    frames.set(nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
});
afterEach(() => {
  for (const { grid, host } of mounted) {
    grid.destroy();
    host.remove();
  }
  mounted.length = 0;
  frames.clear();
  globalThis.requestAnimationFrame = originalFrame;
  globalThis.cancelAnimationFrame = originalCancelFrame;
  restoreCanvas();
});

function flushFrames(): void {
  while (frames.size > 0) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(performance.now());
  }
}

function mount(
  firstValue: CellValue = { kind: "literal", value: "visible" },
  metadata: Partial<Sheet> = {},
  { primed = true }: { primed?: boolean } = {},
) {
  const columns: Sheet["columns"] = [
    { key: "a", header: "A", type: "text", width: 100 },
    { key: "b", header: "B", type: "number", width: 100 },
  ];
  const workbook: Workbook = {
    activeSheet: "s1",
    sheets: [
      { id: "s1", name: "One", rowCount: ROW_COUNT, columns, ...metadata },
      { id: "s2", name: "Two", rowCount: ROW_COUNT, columns },
    ],
  };
  const values: Array<string | CellValue> = new Array<string | CellValue>(ROW_COUNT).fill("match");
  values[0] = firstValue;
  if (firstValue.kind === "formula" && firstValue.src.startsWith("=SEQUENCE")) {
    values[1] = { kind: "literal", value: null };
    values[2] = { kind: "literal", value: null };
  }
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: HOST_WIDTH });
  Object.defineProperty(host, "clientHeight", { value: HOST_HEIGHT });
  document.body.appendChild(host);
  const grid = createGrid(host, {
    workbook,
    data: {
      rowCount: ROW_COUNT,
      columns: { a: values, b: Float64Array.from({ length: ROW_COUNT }, (_, row) => row) },
    },
    config: { toolbar: false, find: false, contextMenu: false },
  });
  mounted.push({ grid, host });
  flushFrames();
  if (!primed) return { grid, host };
  // The first change on a sheet always repaints while the grid learns whether
  // the sheet holds formulas. Spend it on a value-preserving write so each test
  // exercises the steady-state decision.
  commit(grid, [
    {
      op: "set",
      addr: { sheet: "s1", row: OFFSCREEN_ROW, col: 1 },
      value: { kind: "literal", value: OFFSCREEN_ROW },
    },
  ]);
  return { grid, host };
}

function commit(grid: Grid, patches: DocumentOp[]): void {
  expect(grid.applyRemoteOperations(patches).status).toBe("applied");
  flushFrames();
}

function cell(host: HTMLElement, row = 0, col = 0): HTMLElement {
  const result = host.querySelector<HTMLElement>(
    `.sheetwrite-aria [role="gridcell"][id$="-${row}-${col}"]`,
  );
  if (!result) throw new Error(`Missing aria cell ${row}:${col}`);
  return result;
}

it("keeps the painted window and aria cells untouched for unrelated literal edits, but reads visible edits", () => {
  const { grid, host } = mount();
  const reads = spyOn(grid.store, "getVisibleWindow");
  const mirror = host.querySelector(".sheetwrite-aria");
  if (!mirror) throw new Error("Missing aria mirror");
  const observer = new MutationObserver(() => {});
  observer.observe(mirror, { childList: true, attributes: true, subtree: true });
  try {
    for (const sheet of ["s1", "s2"]) {
      commit(grid, [
        {
          op: "set",
          addr: { sheet, row: OFFSCREEN_ROW, col: 1 },
          value: { kind: "literal", value: 42 },
        },
      ]);
      expect(reads).not.toHaveBeenCalled();
      expect(observer.takeRecords()).toHaveLength(0);
      expect(cell(host).textContent).toBe("visible");
    }
    commit(grid, [
      {
        op: "set",
        addr: { sheet: "s1", row: 0, col: 0 },
        value: { kind: "literal", value: "updated" },
      },
    ]);
    expect(reads).toHaveBeenCalled();
    expect(cell(host).textContent).toBe("updated");
  } finally {
    observer.disconnect();
    reads.mockRestore();
  }
});

it.each([
  {
    label: "same-sheet formula",
    value: { kind: "formula", src: "=B1000" } as CellValue,
    sheet: "s1",
  },
  {
    label: "cross-sheet formula",
    value: { kind: "formula", src: "='Two'!B1000" } as CellValue,
    sheet: "s2",
  },
  {
    label: "cross-sheet ref",
    value: { kind: "ref", target: { sheet: "s2", row: OFFSCREEN_ROW, col: 1 } } as CellValue,
    sheet: "s2",
  },
  {
    label: "spill formula",
    value: { kind: "formula", src: "=SEQUENCE(3,1,B1000)" } as CellValue,
    sheet: "s1",
  },
])(
  "updates visible values and aria text after an off-window input changes: $label",
  ({ value, sheet }) => {
    const { grid, host } = mount(value);
    commit(grid, [
      {
        op: "set",
        addr: { sheet, row: OFFSCREEN_ROW, col: 1 },
        value: { kind: "literal", value: 42 },
      },
    ]);
    expect(cell(host).textContent).toBe("42");
    if (value.kind === "formula" && value.src.startsWith("=SEQUENCE"))
      expect(cell(host, 1).textContent).toBe("43");
  },
);

it("tracks formula sources introduced by packed edits before later off-screen inputs change", () => {
  const { grid, host } = mount();
  commit(grid, [
    {
      op: "setBlock",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      block: { rowCount: 1, colCount: 1, values: [null], formulas: [[0, "=B1000"]] },
    },
  ]);
  commit(grid, [
    {
      op: "set",
      addr: { sheet: "s1", row: OFFSCREEN_ROW, col: 1 },
      value: { kind: "literal", value: 77 },
    },
  ]);
  expect(cell(host).textContent).toBe("77");
});

it("maps painted view rows to backing rows for sorted edits", () => {
  const { grid, host } = mount();
  grid.sortBy(1, false);
  flushFrames();
  commit(grid, [
    {
      op: "set",
      addr: { sheet: "s1", row: OFFSCREEN_ROW, col: 0 },
      value: { kind: "literal", value: "sorted visible" },
    },
  ]);
  expect(cell(host).textContent).toBe("sorted visible");
});

it("refreshes search matches after value edits without re-reading unrelated paint data", () => {
  const { grid } = mount();
  expect(grid.search("new match").matches).toHaveLength(0);
  flushFrames();
  const reads = spyOn(grid.store, "getVisibleWindow");
  try {
    commit(grid, [
      {
        op: "set",
        addr: { sheet: "s1", row: OFFSCREEN_ROW, col: 0 },
        value: { kind: "literal", value: "new match" },
      },
    ]);
    expect(reads).not.toHaveBeenCalled();
    expect(grid.findNext().matches).toHaveLength(1);
  } finally {
    reads.mockRestore();
  }
});

it("refreshes search matches for numbers whose engine text differs from JavaScript", () => {
  const { grid } = mount();
  expect(grid.search("000").matches).toHaveLength(0);
  commit(grid, [
    {
      op: "set",
      addr: { sheet: "s1", row: OFFSCREEN_ROW, col: 1 },
      value: { kind: "literal", value: 1e21 },
    },
  ]);
  expect(grid.findNext().matches).toEqual([{ sheet: "s1", row: OFFSCREEN_ROW, col: 1 }]);
});

it("refreshes a formula match when its off-screen literal input changes", () => {
  const { grid } = mount({ kind: "formula", src: '=IF(B1000=999,"before","after")' });
  expect(grid.search("after").matches).toHaveLength(0);
  commit(grid, [
    {
      op: "set",
      addr: { sheet: "s1", row: OFFSCREEN_ROW, col: 1 },
      value: { kind: "literal", value: 42 },
    },
  ]);
  expect(grid.findNext().matches).toEqual([{ sheet: "s1", row: 0, col: 0 }]);
});

it("repaints note additions, descriptions and row geometry without using value epochs as geometry", () => {
  const { grid, host } = mount();
  commit(grid, [{ op: "setNote", addr: { sheet: "s1", row: 1, col: 0 }, text: "Review" }]);
  expect(cell(host, 1).getAttribute("aria-description")).toBe("Note: Review");
  const indicators = () =>
    [...host.querySelectorAll<HTMLElement>(".sheetwrite-overlay div")].filter(
      (node) => node.style.clipPath.startsWith("polygon") && node.style.display !== "none",
    );
  expect(indicators()).toHaveLength(1);
  const top = indicators()[0]?.style.top;
  commit(grid, [{ op: "setRowMeta", sheet: "s1", row: 0, meta: { height: 80 } }]);
  expect(indicators()).toHaveLength(1);
  expect(indicators()[0]?.style.top).not.toBe(top);
  commit(grid, [{ op: "setNote", addr: { sheet: "s1", row: 1, col: 0 }, text: null }]);
  expect(cell(host, 1).getAttribute("aria-description")).toBeNull();
  expect(indicators()).toHaveLength(0);
});

function expectWindowReadAfter(grid: Grid, patch: DocumentOp): void {
  const reads = spyOn(grid.store, "getVisibleWindow");
  try {
    commit(grid, [patch]);
    expect(reads).toHaveBeenCalled();
  } finally {
    reads.mockRestore();
  }
}

const OFFSCREEN_EDIT: DocumentOp = {
  op: "set",
  addr: { sheet: "s1", row: OFFSCREEN_ROW, col: 1 },
  value: { kind: "literal", value: 42 },
};

it.each([
  {
    label: "a formula conditional format",
    metadata: {
      conditionalFormats: [
        {
          range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
          when: { kind: "formula", source: "=$B$1000>10" },
          style: { backgroundColor: "#00ff00" },
        },
      ],
    },
  },
  {
    label: "validation rules",
    metadata: {
      validationRules: [
        {
          id: "positive",
          range: { sheet: "s1", start: { row: 0, col: 1 }, end: { row: OFFSCREEN_ROW, col: 1 } },
          condition: { kind: "number", min: 0 },
          policy: "warn",
        },
      ],
    },
  },
  { label: "merges", metadata: { merges: [{ r0: 0, c0: 0, r1: 1, c1: 0 }] } },
] satisfies Array<{ label: string; metadata: Partial<Sheet> }>)(
  "re-reads the painted window for off-window edits on a sheet with $label",
  ({ metadata }) => {
    const { grid } = mount(undefined, metadata);
    expectWindowReadAfter(grid, OFFSCREEN_EDIT);
  },
);

it("re-reads frozen cells after the body has scrolled past them", () => {
  const { grid, host } = mount();
  let firstPaintedBodyRow = 0;
  grid.on("scroll", (event) => {
    firstPaintedBodyRow = event.firstRow;
  });
  grid.setFrozen(1, 1);
  flushFrames();
  const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
  if (!scroller) throw new Error("Missing scroller");
  scroller.scrollTop = ROW_COUNT * DEFAULT_THEME.rowHeight;
  scroller.dispatchEvent(new Event("scroll"));
  flushFrames();
  expect(firstPaintedBodyRow).toBeGreaterThan(OVERSCAN_ROWS);
  expectWindowReadAfter(grid, {
    op: "set",
    addr: { sheet: "s1", row: 0, col: 0 },
    value: { kind: "literal", value: "pinned" },
  });
});

it("re-reads the painted window for edits in overscan-only rows", () => {
  const { grid } = mount();
  let lastPaintedRow = -1;
  grid.on("scroll", (event) => {
    lastPaintedRow = event.lastRow;
  });
  grid.setOverscan(OVERSCAN_ROWS);
  flushFrames();
  expect(lastPaintedRow).toBeGreaterThan(Math.ceil(HOST_HEIGHT / DEFAULT_THEME.rowHeight));
  expectWindowReadAfter(grid, {
    op: "set",
    addr: { sheet: "s1", row: lastPaintedRow, col: 1 },
    value: { kind: "literal", value: 42 },
  });
});

it("refreshes search matches when the first change after mount removes a spill", () => {
  const { grid } = mount({ kind: "formula", src: "=SEQUENCE(3)" }, {}, { primed: false });
  expect(grid.search("3", { columns: [0], wholeCell: true }).matches).toEqual([
    { sheet: "s1", row: 2, col: 0 },
  ]);
  commit(grid, [
    { op: "set", addr: { sheet: "s1", row: 0, col: 0 }, value: { kind: "literal", value: "x" } },
  ]);
  expect(grid.findNext().matches).toHaveLength(0);
});
