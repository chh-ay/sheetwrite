// Rest-render comparison: the same sheet painted by develop's core and by the PR's core,
// in one page, at no scroll. Reports differing canvas pixels and, where they differ,
// a 2x crop (develop above, PR below) and line coverage figures.
type Core = { createGrid: (host: HTMLElement, options: unknown) => { destroy(): void; applyTransaction(t: unknown): void }; initSheetwrite(o: unknown): Promise<void> };
const w = window as unknown as Record<string, unknown>;
const ROWS = 60;
const COLS = 40;
const WIDTHS = Array.from({ length: COLS }, (_, col) => 60 + ((col * 37) % 90));
const LONG = "a long text that runs well past its own column edge";
const DARK = { bg: "#101828", fg: "#d9e1ec", gridLine: "#26324a", headerBg: "#172235", headerFg: "#7eeabd", selection: "rgba(62, 220, 155, 0.14)", selectionBorder: "#3edc9b" };
type CaseName = "plain" | "frozen" | "merge" | "overflow" | "wrap" | "cf" | "borders";

function valueAt(name: CaseName, row: number, col: number): string | number | null {
  if (name === "cf") return (row * 7 + col * 13) % 100;
  if (name === "wrap") return `${LONG} r${row}c${col}`;
  if (name === "overflow") return (row + col) % 3 === 0 ? `${LONG} r${row}c${col}` : null;
  return `r${row}c${col}`;
}

function options(name: CaseName, dark: boolean): unknown {
  const columns = WIDTHS.map((width, col) => ({ key: `c${col}`, header: `Column ${col}`, width, type: name === "cf" ? "number" : "text" }));
  const data: Record<string, (string | number | null)[]> = {};
  for (let col = 0; col < COLS; col++) data[`c${col}`] = Array.from({ length: ROWS }, (_, row) => valueAt(name, row, col));
  const sheet: Record<string, unknown> = { id: "s", name: "S", rowCount: ROWS, columns };
  if (name === "frozen") { sheet.frozenCols = 2; sheet.frozenRows = 1; }
  if (name === "merge") sheet.merges = Array.from({ length: 6 }, (_, i) => ({ r0: 2 + i * 3, c0: 1 + i * 2, r1: 3 + i * 3, c1: 2 + i * 2 }));
  if (name === "cf") sheet.conditionalFormats = [
    { range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: COLS - 1 } }, when: { kind: "greaterThan", value: 60 }, style: { backgroundColor: "#fde68a" } },
    { range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: COLS - 1 } }, when: { kind: "lessThan", value: 10 }, style: { backgroundColor: "#bfdbfe", color: "#1e3a8a" } },
  ];
  if (name === "wrap") sheet.rowHeights = new Map(Array.from({ length: ROWS }, (_, row) => [row, row % 2 ? 60 : 28]));
  return { workbook: { activeSheet: "s", sheets: [sheet] }, data: { rowCount: ROWS, columns: data }, renderer: "canvas", theme: dark ? DARK : undefined, config: { toolbar: false, tabs: false, find: false, contextMenu: false } };
}

function styleCase(grid: { applyTransaction(t: unknown): void }, name: CaseName): void {
  const all = { sheet: "s", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: COLS - 1 } };
  if (name === "wrap") grid.applyTransaction({ patches: [{ op: "setRangeStyle", range: all, style: { wrap: true } }] });
  if (name === "borders") grid.applyTransaction({ patches: Array.from({ length: 12 }, (_, i) => ({ op: "setRangeStyle", range: { sheet: "s", start: { row: i * 2, col: (i * 3) % 12 }, end: { row: i * 2 + 1, col: ((i * 3) % 12) + 1 } }, style: { border: { all: { color: "#7c3aed", width: 1 + (i % 3) * 2 } } } })) });
}

const frames = (n: number) => new Promise<void>((resolve) => { const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1))); step(n); });

async function capture(core: Core, name: CaseName, dark: boolean): Promise<HTMLCanvasElement[]> {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:900px;height:500px;";
  document.body.appendChild(host);
  const grid = core.createGrid(host, options(name, dark));
  styleCase(grid, name);
  await frames(4);
  const copies = [...host.querySelectorAll("canvas")].filter((canvas) => !canvas.hidden && canvas.width > 0).map((canvas) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext("2d")?.drawImage(canvas, 0, 0);
    return copy;
  });
  grid.destroy();
  host.remove();
  return copies;
}

function luminance(d: Uint8ClampedArray, j: number): number { return 0.2126 * d[j]! + 0.7152 * d[j + 1]! + 0.0722 * d[j + 2]!; }

async function compare(name: CaseName, dark: boolean): Promise<unknown> {
  const dev = w.coreDev as Core;
  const pr = w.corePr as Core;
  await dev.initSheetwrite({ source: "/dev/wasm/sheetwrite_wasm_bg.wasm" });
  await pr.initSheetwrite({ source: "/pd/wasm/sheetwrite_wasm_bg.wasm" });
  const a = await capture(dev, name, dark);
  const b = await capture(pr, name, dark);
  const out: Record<string, unknown>[] = [];
  for (let c = 0; c < Math.max(a.length, b.length); c++) {
    const ca = a[c], cb = b[c];
    if (!ca || !cb || ca.width !== cb.width || ca.height !== cb.height) { out.push({ canvas: c, sizeMismatch: [ca?.width, ca?.height, cb?.width, cb?.height] }); continue; }
    const da = ca.getContext("2d")!.getImageData(0, 0, ca.width, ca.height).data;
    const db = cb.getContext("2d")!.getImageData(0, 0, cb.width, cb.height).data;
    let differing = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, first: number[] | null = null, maxDelta = 0;
    let lumA = 0, lumB = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] === db[i] && da[i + 1] === db[i + 1] && da[i + 2] === db[i + 2] && da[i + 3] === db[i + 3]) continue;
      differing++;
      const p = i / 4, x = p % ca.width, y = (p / ca.width) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      maxDelta = Math.max(maxDelta, Math.abs(da[i]! - db[i]!), Math.abs(da[i + 1]! - db[i + 1]!), Math.abs(da[i + 2]! - db[i + 2]!));
      lumA += luminance(da, i); lumB += luminance(db, i);
      first ??= [x, y, da[i]!, da[i + 1]!, da[i + 2]!, db[i]!, db[i + 1]!, db[i + 2]!];
    }
    let inked = 0;
    for (let i = 0; i < da.length; i += 4) if (da[i] !== da[0] || da[i + 1] !== da[1] || da[i + 2] !== da[2]) inked++;
    const entry: Record<string, unknown> = { canvas: c, width: ca.width, height: ca.height, inked, differing, maxDelta, first };
    if (differing > 0) {
      entry.box = [x0, y0, x1, y1];
      entry.meanLuminanceOfDifferingPixels = [+(lumA / differing).toFixed(1), +(lumB / differing).toFixed(1)];
      // 2x crop around the first difference: develop on top, PR below.
      const cw = 80, ch = 48, cx = Math.max(0, Math.min(ca.width - cw, first![0]! - cw / 2)), cy = Math.max(0, Math.min(ca.height - ch, first![1]! - ch / 2));
      const crop = document.createElement("canvas");
      crop.width = cw * 2; crop.height = ch * 4 + 4;
      const ctx = crop.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ff00ff"; ctx.fillRect(0, 0, crop.width, crop.height);
      ctx.drawImage(ca, cx, cy, cw, ch, 0, 0, cw * 2, ch * 2);
      ctx.drawImage(cb, cx, cy, cw, ch, 0, ch * 2 + 4, cw * 2, ch * 2);
      entry.crop = crop.toDataURL("image/png");
      entry.cropAt = [cx, cy, cw, ch];
    }
    out.push(entry);
  }
  return out;
}
w.compare = compare;
w.ready = true;
