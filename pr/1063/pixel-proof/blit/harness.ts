// Pixel proof page for sideways blits: builds the same grid twice, scrolls one
// through a sequence (blitted frames) and paints the other straight at each
// position (a full repaint), and counts differing canvas pixels.
import { createGrid, initSheetwrite, type Grid, type GridOptions } from "../../../checkouts/pd-blitproof/packages/core/src/index.ts";

const ROWS = 60;
const COLS = 80;
const WIDTHS = Array.from({ length: COLS }, (_, col) => 60 + ((col * 37) % 90));
const LONG = "a long text that runs well past its own column edge";

type CaseName = "plain" | "frozen" | "merge" | "overflow" | "selection" | "wrap" | "cf" | "borders";

function options(name: CaseName): GridOptions {
  const columns = WIDTHS.map((width, col) => ({ key: `c${col}`, header: (globalThis as { noHeaderText?: boolean }).noHeaderText ? "" : `Column ${col}`, width, type: (name === "cf" ? "number" : "text") as "number" | "text" }));
  const data: Record<string, (string | number | null)[]> = {};
  for (let col = 0; col < COLS; col++) {
    data[`c${col}`] = Array.from({ length: ROWS }, (_, row) => valueAt(name, row, col));
  }
  const sheet: Record<string, unknown> = { id: "s", name: "S", rowCount: ROWS, columns };
  if (name === "frozen") { sheet.frozenCols = 2; sheet.frozenRows = 1; }
  if (name === "merge") sheet.merges = Array.from({ length: 12 }, (_, i) => ({ r0: 2 + i * 3, c0: 3 + i * 5, r1: 3 + i * 3, c1: 6 + i * 5 }));
  if (name === "cf") sheet.conditionalFormats = [
    { range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: COLS - 1 } }, when: { kind: "greaterThan", value: 60 }, style: { backgroundColor: "#fde68a" } },
    { range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: COLS - 1 } }, when: { kind: "lessThan", value: 10 }, style: { backgroundColor: "#bfdbfe", color: "#1e3a8a" } },
  ];
  if (name === "wrap") sheet.rowHeights = new Map(Array.from({ length: ROWS }, (_, row) => [row, row % 2 ? 60 : 28]));
  return { workbook: { activeSheet: "s", sheets: [sheet as never] }, data: { rowCount: ROWS, columns: data }, renderer: "canvas", config: { toolbar: false, tabs: false, find: false, contextMenu: false } } as GridOptions;
}

function styleCase(grid: Grid, name: CaseName): void {
  const all = { sheet: "s", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: COLS - 1 } };
  if (name === "wrap") grid.applyTransaction({ patches: [{ op: "setRangeStyle", range: all, style: { wrap: true } }] });
  if (name === "overflow") grid.applyTransaction({ patches: [{ op: "setRangeStyle", range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: COLS - 1 } }, style: null }, ...Array.from({ length: 20 }, (_, i) => ({ op: "setRangeStyle" as const, range: { sheet: "s", start: { row: i * 3, col: 0 }, end: { row: i * 3, col: COLS - 1 } }, style: { align: i % 2 ? "right" as const : "left" as const } }))] });
  if (name === "borders") grid.applyTransaction({ patches: Array.from({ length: 30 }, (_, i) => ({ op: "setRangeStyle" as const, range: { sheet: "s", start: { row: i * 2, col: (i * 3) % COLS }, end: { row: i * 2 + 1, col: ((i * 3) % COLS) + 1 } }, style: { border: { all: { color: "#7c3aed", width: 1 + (i % 3) * 2 } } } })) });
}

const frames = (n: number) => new Promise<void>((resolve) => { const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1))); step(n); });

let selfDraws = 0;
const drawImage = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
  if (args[0] === this.canvas) selfDraws += 1;
  return (drawImage as (...a: unknown[]) => void).apply(this, args);
} as typeof drawImage;

function mount(name: CaseName): { grid: Grid; host: HTMLElement } {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:900px;height:500px;";
  document.body.appendChild(host);
  const grid = createGrid(host, options(name));
  styleCase(grid, name);
  if (name === "selection") grid.setSelection({ kind: "range", range: { sheet: "s", start: { row: 3, col: 4 }, end: { row: 12, col: 40 } } });
  return { grid, host };
}

async function pixels(host: HTMLElement): Promise<Uint8ClampedArray[]> {
  return [...host.querySelectorAll("canvas")].map((canvas) => canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? new Uint8ClampedArray());
}

function scrollTo(host: HTMLElement, left: number): void {
  const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
  if (scroller) scroller.scrollLeft = left;
}

/** Scrolls one grid through `steps`; at each, compares it with a fresh grid painted there. */
async function prove(name: CaseName, steps: readonly number[], cut: boolean): Promise<unknown> {
  await initSheetwrite({ source: "/pd/wasm/sheetwrite_wasm_bg.wasm" });
  const blitted = mount(name);
  if (cut) await blitted.grid.actions.cut();
  await frames(3);
  const out = [];
  for (const left of steps) {
    const before = selfDraws;
    scrollTo(blitted.host, left);
    await frames(3);
    const blits = selfDraws - before;
    const fresh = mount(name);
    if (cut) await fresh.grid.actions.cut();
    scrollTo(fresh.host, left);
    await frames(3);
    // The reference frame must be a full repaint: an edit that changes nothing
    // still moves the content revision, which rules out a blit.
    const freshDraws = selfDraws;
    fresh.grid.applyTransaction({ patches: [{ op: "set", addr: { sheet: "s", row: ROWS - 1, col: COLS - 1 }, value: { kind: "literal", value: valueAt(name, ROWS - 1, COLS - 1) } }] });
    await frames(3);
    const referenceBlits = selfDraws - freshDraws;
    const a = await pixels(blitted.host);
    const b = await pixels(fresh.host);
    let differing = 0; let first: number[] | null = null; let nearA: string[] = []; let nearB: string[] = [];
    const canvas = blitted.host.querySelector("canvas");
    for (let c = 0; c < Math.max(a.length, b.length); c++) {
      const pa = a[c] ?? new Uint8ClampedArray(); const pb = b[c] ?? new Uint8ClampedArray();
      if (pa.length !== pb.length) { differing += Math.max(pa.length, pb.length) / 4; continue; }
      for (let i = 0; i < pa.length; i += 4) {
        if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2] || pa[i + 3] !== pb[i + 3]) {
          differing += 1;
          if (!first && canvas) { const p = i / 4; const fx = p % canvas.width, fy = Math.floor(p / canvas.width); const near = (arr: Uint8ClampedArray) => { const rows: string[] = []; for (let y = fy - 2; y <= fy + 2; y++) { const r: string[] = []; for (let x = fx - 3; x <= fx + 3; x++) { const j = (y * canvas.width + x) * 4; r.push(`${arr[j]},${arr[j + 1]},${arr[j + 2]}`); } rows.push(r.join(" ")); } return rows; }; first = [c, fx, fy, ...pa.slice(i, i + 4), ...pb.slice(i, i + 4)]; (first as unknown as { near?: unknown }).near = undefined; nearA = near(pa); nearB = near(pb); }
        }
      }
    }
    const scrollLeft = blitted.host.querySelector<HTMLElement>(".sheetwrite-scroller")?.scrollLeft;
    out.push({ left, scrollLeft, blits, referenceBlits, canvases: a.length, differing, first, nearA, nearB });
    fresh.grid.destroy(); fresh.host.remove();
  }
  blitted.grid.destroy(); blitted.host.remove();
  return out;
}

(window as unknown as { prove: typeof prove }).prove = prove;
(window as unknown as { ready: boolean }).ready = true;

/** Debug: rows `y0..y1` of a fresh grid's canvas at `left`, content columns `cx0..cx1`, as RGB strings. */
async function rowsAt(name: CaseName, left: number, cx0: number, cx1: number, y0: number, y1: number): Promise<string[]> {
  await initSheetwrite({ source: "/pd/wasm/sheetwrite_wasm_bg.wasm" });
  const fresh = mount(name);
  scrollTo(fresh.host, left);
  await frames(3);
  const canvas = fresh.host.querySelector("canvas");
  const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
  const out: string[] = [];
  if (canvas && data) for (let y = y0; y <= y1; y++) {
    const row: string[] = [];
    for (let cx = cx0; cx <= cx1; cx++) { const x = cx - left + 48; const j = (y * canvas.width + x) * 4; row.push(`${data[j]},${data[j + 1]},${data[j + 2]}`); }
    out.push(`${y}: ${row.join(" ")}`);
  }
  fresh.grid.destroy(); fresh.host.remove();
  return out;
}
(window as unknown as { rowsAt: typeof rowsAt }).rowsAt = rowsAt;

/** Debug: canvas x of rule-row pixels that are not the rule colour, for a fresh grid at `left`. */
async function tintedAt(name: CaseName, left: number, y: number): Promise<number[]> {
  await initSheetwrite({ source: "/pd/wasm/sheetwrite_wasm_bg.wasm" });
  const fresh = mount(name);
  scrollTo(fresh.host, left);
  await frames(3);
  const canvas = fresh.host.querySelector("canvas");
  const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
  const xs: number[] = [];
  if (canvas && data) for (let x = 0; x < canvas.width; x++) { const j = (y * canvas.width + x) * 4; if (data[j] !== 238 || data[j + 2] !== 238) xs.push(x); }
  fresh.grid.destroy(); fresh.host.remove();
  return xs;
}
(window as unknown as { tintedAt: typeof tintedAt }).tintedAt = tintedAt;

/** Debug: the canvas calls of a fresh grid's last frame at `left` whose geometry can touch (px, py). */
async function opsAt(name: CaseName, left: number, px: number, py: number): Promise<string[]> {
  await initSheetwrite({ source: "/pd/wasm/sheetwrite_wasm_bg.wasm" });
  const log: string[] = [];
  const proto = CanvasRenderingContext2D.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const names = ["fillRect", "fillText", "moveTo", "lineTo", "stroke", "rect", "clip", "save", "restore", "beginPath", "setTransform", "strokeRect", "clearRect", "drawImage"];
  const saved = Object.fromEntries(names.map((n) => [n, proto[n]]));
  let recording = false;
  for (const n of names) proto[n] = function (this: unknown, ...a: unknown[]) { if (recording) log.push(`${n}(${a.map((v) => (typeof v === "number" ? Math.round(v * 100) / 100 : typeof v === "string" ? JSON.stringify(v) : typeof v)).join(",")})`); return saved[n]?.apply(this, a); };
  const fresh = mount(name);
  await frames(3);
  const from = (globalThis as { fromLeft?: number }).fromLeft;
  if (from !== undefined) { scrollTo(fresh.host, from); await frames(3); }
  recording = true;
  scrollTo(fresh.host, left);
  await frames(3);
  recording = false;
  for (const n of names) proto[n] = saved[n] as (...a: unknown[]) => unknown;
  fresh.grid.destroy(); fresh.host.remove();
  return log.filter((line) => /fillRect|fillText|moveTo|lineTo|stroke|rect|clip|setTransform|strokeRect/.test(line)).filter((line) => {
    const nums = (line.match(/-?[\d.]+/g) ?? []).map(Number);
    if (/^(moveTo|lineTo)/.test(line)) return Math.abs(nums[1] - py) < 2 || Math.abs(nums[0] - px) < 2;
    if (/^(fillRect|rect|strokeRect)/.test(line)) return nums[0] <= px + 1 && px <= nums[0] + nums[2] + 1 && nums[1] <= py + 1 && py <= nums[1] + nums[3] + 1;
    if (/^fillText/.test(line)) return Math.abs(nums[nums.length - 1] - py) < 20 && Math.abs(nums[nums.length - 2] - px) < 80;
    return true;
  });
}
(window as unknown as { opsAt: typeof opsAt }).opsAt = opsAt;

function valueAt(name: CaseName, row: number, col: number): string | number | null {
  if (name === "cf") return (row * 7 + col * 13) % 100;
  if (name === "wrap") return `${LONG} r${row}c${col}`;
  if (name === "overflow") return (row + col) % 3 === 0 ? `${LONG} r${row}c${col}` : null;
  return `r${row}c${col}`;
}
