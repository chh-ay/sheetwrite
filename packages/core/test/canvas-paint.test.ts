import { beforeAll, expect, it } from "bun:test";

import {
  blitScroll,
  filterButtonHitRect,
  filterButtonRect,
  filterTextRight,
  fontFor,
  getMergeIndexResourceStatsForTest,
  layoutTextLines,
  paintFrame,
  resetMergeIndexResourceStatsForTest,
  sidewaysBlitSafe,
} from "../src/canvas-paint.js";
import { contrastRatio, parseRgbColor, relativeLuminance } from "../src/color-contrast.js";
import { DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { listButtonRect } from "../src/overlay-painter.js";
import { SheetwriteStore } from "../src/store.js";
import type { CellStyle, RenderLayout, Theme, Viewport, VisibleWindowView } from "../src/types.js";

// happy-dom has no 2D canvas context, so paint against a recording stub and
// read back the rectangles, text and stroked lines `paintFrame` emitted.
type Rect = { x: number; y: number; w: number; h: number };
type LineSegment = { x0: number; y0: number; x1: number; y1: number };

interface RecordingCtx {
  fillStyle: string;
  strokeStyle: string;
  fillRects: (Rect & { fillStyle: string })[];
  /** Each text with the clip rectangles in effect when it was drawn (all apply at once). */
  fillTexts: { text: string; x: number; y: number; fillStyle: string; clips: Rect[] }[];
  clipRects: Rect[];
  strokes: { style: string; segments: LineSegment[] }[];
  [op: string]: unknown;
}

function make_recording_ctx(): RecordingCtx {
  const ctx: RecordingCtx = {
    fillStyle: "",
    strokeStyle: "",
    fillRects: [],
    fillTexts: [],
    clipRects: [],
    strokes: [],
  };
  // Capture the live `fillStyle` at call time, since it mutates between draws.
  ctx.fillRect = (x: number, y: number, w: number, h: number) =>
    ctx.fillRects.push({ x, y, w, h, fillStyle: ctx.fillStyle });
  // Track the clip stack across save/restore so each draw knows its clips.
  let active_clips: Rect[] = [];
  const saved_clips: Rect[][] = [];
  ctx.fillText = (text: string, x: number, y: number) =>
    ctx.fillTexts.push({ text, x, y, fillStyle: ctx.fillStyle, clips: [...active_clips] });
  let segments: LineSegment[] = [];
  let at: { x: number; y: number } | undefined;
  ctx.moveTo = (x: number, y: number) => (at = { x, y });
  ctx.lineTo = (x: number, y: number) => {
    if (!at) return;
    segments.push({ x0: at.x, y0: at.y, x1: x, y1: y });
    at = { x, y };
  };
  ctx.beginPath = () => (segments = []);
  ctx.stroke = () => ctx.strokes.push({ style: ctx.strokeStyle, segments: [...segments] });
  // A deterministic run width, 7 px per code unit.
  ctx.measureText = (text: string) => ({ width: text.length * 7 });
  let pending_rect: Rect | undefined;
  ctx.rect = (x: number, y: number, w: number, h: number) => (pending_rect = { x, y, w, h });
  ctx.clip = () => {
    if (!pending_rect) return;
    ctx.clipRects.push(pending_rect);
    active_clips = [...active_clips, pending_rect];
  };
  ctx.save = () => saved_clips.push(active_clips);
  ctx.restore = () => (active_clips = saved_clips.pop() ?? []);
  for (const op of ["setTransform", "setLineDash"]) {
    ctx[op] = () => {};
  }
  return ctx;
}

const NO_RENDERERS = new Map<string, never>();

beforeAll(async () => {
  await initSheetwrite();
});

it("paints virtual columns without borrowing the first real cell's fill or borders", () => {
  const column_width = 100;
  const stored_column_count = 5;
  const painted_column_count = 7;
  const fill = "#ffc000";
  const border = "#123456";
  const columns = text_columns(Array<number>(painted_column_count).fill(column_width));
  const store = new SheetwriteStore({
    activeSheet: "s1",
    sheets: [
      { id: "s1", name: "Sheet", rowCount: 3, columns: columns.slice(0, stored_column_count) },
    ],
  });
  store.applyTransaction({
    patches: [
      {
        op: "setRangeStyle",
        range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        style: { backgroundColor: fill, border: { all: { color: border, width: 1 } } },
      },
    ],
  });
  const view = store.getVisibleWindow("s1", { start: 0, end: 3 }, [...columns.keys()]);
  const width = painted_column_count * column_width;
  const ctx = render(view, make_layout(columns), { ...UNIFORM_VIEWPORT, width });
  expect(ctx.fillRects.filter((rect) => rect.fillStyle === fill)).toEqual([
    { x: 0, y: HEADER_HEIGHT, w: column_width, h: ROW_HEIGHT, fillStyle: fill },
  ]);
  const border_lines = ctx.strokes
    .filter((stroke) => stroke.style === border)
    .flatMap((stroke) => stroke.segments);
  expect(border_lines).toHaveLength(4);
  expect(border_lines.every((line) => line.x0 <= column_width && line.x1 <= column_width)).toBe(
    true,
  );
});

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 20;

function make_theme(overrides: Partial<Theme> = {}): Theme {
  const sizes = { rowHeight: ROW_HEIGHT, headerHeight: HEADER_HEIGHT, rowHeaderWidth: 0 };
  return { ...DEFAULT_THEME, ...sizes, ...overrides };
}

function make_layout(
  columns: RenderLayout["columns"],
  merges?: RenderLayout["merges"],
): RenderLayout {
  return { columns, rowHeight: ROW_HEIGHT, headerHeight: HEADER_HEIGHT, totalRows: 3, merges };
}

/** Text columns A, B, C, ... of the given widths. */
function text_columns(widths: number[]): RenderLayout["columns"] {
  return widths.map((width, col) => {
    const header = String.fromCharCode(65 + col);
    return { key: header, header, width, type: "text" };
  });
}

function make_view(
  style_ids: Uint32Array,
  styles: readonly CellStyle[],
  cols: readonly number[] = [0, 1],
): VisibleWindowView {
  const rows = { start: 0, end: 3 };
  const cell_count = (rows.end - rows.start) * cols.length;
  const values = new Array<string>(cell_count).fill("x");
  return { sheet: "s1", stringPoolEpoch: 0, rows, cols, values, styleIds: style_ids, styles };
}

/** Paint `view` against a fresh recording context and return it for inspection. */
function render(
  view: VisibleWindowView,
  layout: RenderLayout,
  viewport: Viewport,
  theme: Theme = make_theme(),
  damage?: { x: number; y: number; w: number; h: number },
): RecordingCtx {
  const ctx = make_recording_ctx();
  const canvas = ctx as unknown as CanvasRenderingContext2D;
  paintFrame(canvas, view, layout, theme, viewport, 1, NO_RENDERERS, damage);
  return ctx;
}

const UNIFORM_VIEWPORT: Viewport = { scrollTop: 0, scrollLeft: 0, width: 400, height: 300 };

/** Paint one column with a row per style, row `i` holding `values[i]` in `styles[i]`. */
function paint_column(
  styles: readonly CellStyle[],
  values: VisibleWindowView["values"] = styles.map((_, row) => `r${row}`),
  {
    theme = make_theme(),
    ...column
  }: Partial<RenderLayout["columns"][number]> & { theme?: Theme } = {},
): RecordingCtx {
  const view: VisibleWindowView = {
    sheet: "s1",
    stringPoolEpoch: 0,
    rows: { start: 0, end: styles.length },
    cols: [0],
    values,
    styleIds: Uint32Array.from(styles, (_, row) => row),
    styles,
  };
  const layout: RenderLayout = {
    ...make_layout([{ key: "a", header: "A", width: 100, type: "text", ...column }]),
    totalRows: styles.length,
  };
  return render(view, layout, { ...UNIFORM_VIEWPORT, height: 1_000 }, theme);
}

it("puts a cell font family first and keeps the theme families as fallbacks", () => {
  const theme = make_theme({ font: 'normal 450 13px "Inter Variable", sans-serif' });
  expect(fontFor(theme, { fontFamily: "Calibri" })).toBe(
    '450 13px "Calibri", "Inter Variable", sans-serif',
  );
  expect(fontFor(theme, { fontFamily: "Times New Roman", bold: true, fontSize: 16 })).toBe(
    'bold 16px "Times New Roman", "Inter Variable", sans-serif',
  );
});

it.each([
  {
    name: "lets a cell number format override the column, and General opt out of it",
    column: { width: 150, type: "number" as const, numberFormat: "$#,##0" },
    values: [0.5, 0.5, 0.5],
    styles: [{}, { numberFormat: "0.0%" }, { numberFormat: "General" }],
    painted: ["$1", "50.0%", "0.5"],
  },
  {
    // 60 px wide: 48 px for text, 6 characters at the stub's 7 px each.
    name: "narrows a General number to a narrow cell as Excel does, and fills a fixed format with #",
    column: { width: 60, type: "general" as const },
    values: [1234.5678, 123456789012, 1234567],
    styles: [{}, {}, { numberFormat: "#,##0" }],
    painted: ["1234.6", "1E+11", "######"],
  },
])("$name", ({ column, values, styles, painted }) => {
  const ctx = paint_column(styles, values, column);
  const texts = ctx.fillTexts.filter((call) => call.y > HEADER_HEIGHT).map((call) => call.text);
  expect(texts).toEqual([...painted]);
});

it("examines only visible merge intersections with thousands offscreen", () => {
  const merges = Array.from({ length: 10_000 }, (_, index) => ({
    r0: 10_000 + index * 2,
    c0: 0,
    r1: 10_000 + index * 2,
    c1: 1,
  }));
  merges.push({ r0: 0, c0: 0, r1: 1, c1: 1 });
  const layout = make_layout(text_columns([100, 100]), merges);
  const view = make_view(new Uint32Array(6), [{}]);
  resetMergeIndexResourceStatsForTest();
  render(view, layout, UNIFORM_VIEWPORT);
  const stats = getMergeIndexResourceStatsForTest();
  expect(stats.indexConstructions).toBe(1);
  expect(stats.candidatesExamined).toBeLessThanOrEqual(20);
});

it("lets a per-cell style override the column cellStyle", () => {
  const layout = make_layout([
    { key: "a", header: "A", width: 100, type: "text", cellStyle: { backgroundColor: "#ff0000" } },
  ]);
  // Row 0 overrides the column fill with its own; rows 1-2 keep the column's.
  const view = make_view(Uint32Array.from([1, 0, 0]), [{}, { backgroundColor: "#0000ff" }], [0]);
  const ctx = render(view, layout, UNIFORM_VIEWPORT);
  expect(ctx.fillRects.find((r) => r.y === HEADER_HEIGHT)?.fillStyle).toBe("#0000ff");
  expect(ctx.fillRects.filter((r) => r.fillStyle === "#ff0000").length).toBe(2);
});

it("lets text spill through empty cells but stops before occupied neighbours", () => {
  const view = make_view(new Uint32Array(9), [{}], [0, 1, 2]);
  (view.values as string[]).splice(0, 3, "Long label", "", "occupied");
  const ctx = render(view, make_layout(text_columns([20, 24, 30])), UNIFORM_VIEWPORT);
  expect(ctx.clipRects).toContainEqual({ x: 0, y: HEADER_HEIGHT, w: 44, h: ROW_HEIGHT });
});

it("lays out header text before the filter button for every alignment, as Excel does", () => {
  const layout = make_layout(text_columns([100, 100, 100, 100]));
  const style_ids = Uint32Array.from({ length: 12 }, (_, cell) => (cell < 2 ? cell + 1 : 0));
  const view = make_view(style_ids, [{}, { align: "right" }, { align: "center" }], [0, 1, 2, 3]);
  (view.values as string[]).splice(0, 4, "Revenue", "Units", "Region of sale", "");
  const filter_header = { row: 0, start: 0, end: 3 };
  const ctx = render(view, layout, { ...UNIFORM_VIEWPORT, filterHeader: filter_header });

  // Each 100 px cell's 16 px button sits 6 px from the right gridline, at
  // 78 px, and its text box ends 6 px before it, at 72 px.
  const text = (label: string) => ctx.fillTexts.find((call) => call.text === label);
  expect(text("Revenue")?.x).toBe(72);
  expect(text("Units")?.x).toBe(100 + (6 + 72) / 2);
  // Left-aligned text clips at its text box, not under the button or in the empty cell beside.
  const clip = { x: 200, y: HEADER_HEIGHT, w: 72, h: ROW_HEIGHT };
  expect(text("Region of sale")?.clips).toContainEqual(clip);
});

it("scales the filter button, its room and the text padding with the zoom, as Excel does", () => {
  for (const zoom of [0.5, 1, 1.5, 2]) {
    for (const height of [20, 32]) {
      const cell = { x: 0, y: 0, w: 100 * zoom, h: height * zoom };
      const button = filterButtonRect(cell, zoom);
      // A 16 px button, 6 px from the right gridline as the text is from the
      // left one, centred in the row: all at the zoom.
      expect(button).toEqual({
        x: (100 - 6 - 16) * zoom,
        y: ((height - 16) / 2) * zoom,
        w: 16 * zoom,
        h: 16 * zoom,
      });
      // The text box ends that room again before the button.
      expect(filterTextRight(cell, zoom)).toBe((100 - 6 - 16 - 6) * zoom);
      // A pointer opens the dropdown over the button and the inset, at least 24 px wide for touch.
      const hit = filterButtonHitRect(cell, zoom);
      expect([hit.x + hit.w, hit.w]).toEqual([100 * zoom, Math.max(24, 22 * zoom)]);
      // A list cell's arrow grows with the cell too.
      expect(listButtonRect(cell, zoom).w).toBe(Math.min(18 * zoom, cell.h));
    }
  }

  // Cell text keeps 12 px from its gridlines at 200%, not 6.
  const style_ids = new Uint32Array(6);
  style_ids[1] = 1;
  const view = make_view(style_ids, [{ align: "right" }, {}], [0, 1]);
  (view.values as string[]).splice(0, 2, "Units", "Region");
  const ctx = render(view, { ...make_layout(text_columns([100, 100])), zoom: 2 }, UNIFORM_VIEWPORT);
  const text = (label: string) => ctx.fillTexts.find((call) => call.text === label);
  expect([text("Units")?.x, text("Region")?.x]).toEqual([100 - 12, 100 + 12]);
});

// One width unit per character, so expected breaks can be worked out by hand.
const monospace = {
  measureText: (text: string) => ({ width: text.length }),
} as unknown as Parameters<typeof layoutTextLines>[0];

it.each([
  ["breaks after the last whitespace", "aa bb cc", 4, ["aa ", "bb ", "cc"]],
  ["keeps a whitespace that overflows on its line", "aa bb cc", 5, ["aa bb ", "cc"]],
  ["breaks a word with no whitespace mid-word", "abcdef", 4, ["abcd", "ef"]],
  ["gives a too-wide first character its own line", "ab", 0.5, ["a", "b"]],
  ["keeps empty paragraphs", "a\n\nb", 4, ["a", "", "b"]],
  [
    "wraps a long paragraph line by line",
    "word ".repeat(6).trim(),
    12,
    ["word word ", "word word ", "word word"],
  ],
  // The fake measure counts code units, so a cluster is wider than the cell.
  ["keeps an emoji ZWJ sequence whole", "ab 👨‍👩‍👧‍👦 cd", 4, ["ab ", "👨‍👩‍👧‍👦", " cd"]],
  ["keeps a combining mark with its letter", "cafe\u0301s", 4, ["caf", "e\u0301s"]],
  [
    "ends a clustered paragraph whose last line fills the cell",
    "e\u0301".repeat(6),
    4,
    ["e\u0301e\u0301", "e\u0301e\u0301", "e\u0301e\u0301"],
  ],
  [
    "breaks a clustered paragraph after its last whitespace",
    "e\u0301e\u0301 e\u0301e\u0301 e\u0301",
    10,
    ["e\u0301e\u0301 e\u0301e\u0301 ", "e\u0301"],
  ],
])("%s", (_, text, width, expected) => {
  expect(layoutTextLines(monospace, text, width)).toEqual(expected);
});

/** Paint `text` wrapped in a `width` px cell 48 px tall and return the lines drawn inside it. */
function paint_wrapped(text: string, width: number): RecordingCtx["fillTexts"] {
  const layout = make_layout([{ key: "a", header: "A", width, type: "text" }]);
  const view = make_view(Uint32Array.from([1, 0, 0]), [{}, { wrap: true }], [0]);
  (view.values as string[])[0] = text;
  const viewport = {
    ...UNIFORM_VIEWPORT,
    rowTops: Float64Array.from([0, 48, 72]),
    rowHeights: Float64Array.from([48, 24, 24]),
  };
  return render(view, layout, viewport).fillTexts.filter(
    (call) => call.y >= HEADER_HEIGHT && call.y < HEADER_HEIGHT + 48,
  );
}

it("breaks an overlong token at character boundaries", () => {
  const painted = paint_wrapped("abcdef", 26);
  expect(painted.map((call) => call.text).join("")).toBe("abcdef");
  expect(painted.length).toBeGreaterThan(1);
});

it("paints the first lines of a long clustered paragraph inside its cell, whole clusters only", () => {
  const painted = paint_wrapped("e\u0301".repeat(20_000), 40);
  expect(painted.length).toBeGreaterThan(1);
  expect(painted.length).toBeLessThan(5);
  expect(painted.every((call) => /^(?:e\u0301)+$/u.test(call.text))).toBe(true);
  expect(painted.every((call) => call.x >= 0 && call.x < 40)).toBe(true);
});

const blit_viewport = (at: Partial<Viewport>): Viewport => ({
  scrollTop: 0,
  scrollLeft: 0,
  width: 400,
  height: 300,
  contentRevision: 7,
  ...at,
});

function run_blit(prev: Partial<Viewport>, next: Partial<Viewport>, sideways_safe = true) {
  const ctx = make_recording_ctx();
  const draws: unknown[][] = [];
  ctx.drawImage = (...args: unknown[]) => {
    draws.push(args);
  };
  const damage = blitScroll(
    ctx as unknown as CanvasRenderingContext2D,
    {} as HTMLCanvasElement,
    make_theme(),
    blit_viewport(prev),
    blit_viewport(next),
    1,
    1,
    sideways_safe,
  );
  return { damage, draws };
}

// A rounded copy plus an exact-offset repaint leaves sub-pixel-shifted glyph
// slices that accumulate into ghosting on touchpad scrolls.
it.each([
  ["refuses a fractional device-pixel shift", { scrollTop: 100 }, { scrollTop: 100.4 }, undefined],
  [
    "blits an exact device-pixel shift",
    { scrollTop: 100 },
    { scrollTop: 103 },
    { x: 0, y: 297, w: 400, h: 3 },
  ],
  [
    "blits a scroll right, leaving the exposed columns",
    { scrollLeft: 100 },
    { scrollLeft: 130 },
    { x: 370, y: 0, w: 30, h: 300 },
  ],
  [
    "blits a scroll left, leaving the exposed columns",
    { scrollLeft: 130 },
    { scrollLeft: 100 },
    { x: 0, y: 0, w: 30, h: 300 },
  ],
])("%s", (_, prev, next, damage) => {
  const blit = run_blit(prev, next);
  expect(blit.damage).toEqual(damage);
  expect(blit.draws).toHaveLength(damage ? 1 : 0);
});

it("repaints a sideways scroll in full when text can spill or a border shows", () => {
  const layout = make_layout(text_columns([100, 100, 100]));
  const dense = make_view(new Uint32Array(9), [{}], [0, 1, 2]);
  expect(sidewaysBlitSafe(dense, layout)).toBe(true);
  // Text beside an empty cell spills only as far as the painted window
  // reaches, so shifted pixels need not match the next full repaint.
  const values = Array.from(dense.values);
  values[4] = null;
  expect(sidewaysBlitSafe({ ...dense, values }, layout)).toBe(false);
  // Not beside it when the empty cell's column is not the next one.
  expect(sidewaysBlitSafe({ ...dense, cols: [0, 2, 4], values }, layout)).toBe(true);
  const bordered = make_view(
    new Uint32Array(9).fill(1),
    [{}, { border: { all: { color: "#000000" } } }],
    [0, 1, 2],
  );
  expect(sidewaysBlitSafe(bordered, layout)).toBe(false);

  const sideways = run_blit({ scrollLeft: 100 }, { scrollLeft: 130 }, false);
  expect(sideways.damage).toBeUndefined();
  expect(sideways.draws).toHaveLength(0);
  const vertical = run_blit({ scrollTop: 100 }, { scrollTop: 103 }, false);
  expect(vertical.draws).toHaveLength(1);
});

it("paints only the cells and header labels inside a sideways strip", () => {
  const layout = make_layout(text_columns([100, 100, 100, 100]));
  const view = make_view(new Uint32Array(12), [{}], [0, 1, 2, 3]);
  // Column D spans x in [300, 400), the strip a sideways blit left.
  const strip = { x: 300, y: 0, w: 100, h: 300 };
  const ctx = render(view, layout, UNIFORM_VIEWPORT, make_theme(), strip);
  expect(ctx.fillTexts.map((call) => call.text).filter((text) => text !== "x")).toEqual(["D"]);
  expect(ctx.fillTexts.filter((call) => call.text === "x")).toHaveLength(3);
});

it("paints a row label whose band overlaps the damage strip but whose center does not", () => {
  const layout = make_layout([{ key: "a", header: "A", width: 100, type: "text" }]);
  const view = make_view(new Uint32Array(3), [{}], [0]);
  const theme = make_theme({ rowHeaderWidth: 40 });
  // Row 1 band: y in [44, 68), center 56. Strip covers only its lower
  // quarter [62, 80): center-point culling would skip the label and let the
  // strip's background erase the glyph half inside it - sliced digits.
  const ctx = render(view, layout, UNIFORM_VIEWPORT, theme, { x: 0, y: 62, w: 400, h: 18 });
  const label = ctx.fillTexts.find((call) => call.text === "2");
  expect(label?.y).toBe(56);
});

const LIGHT = make_theme({
  fg: "#1f2328",
  bg: "#ffffff",
  headerFg: "#1f2328",
  headerBg: "#f6f8fa",
});
const DARK = make_theme({
  fg: "#e6edf3",
  bg: "#0d1117",
  headerFg: "#e6edf3",
  headerBg: "#161b22",
});
// Black to white, the #706 repro fill, saturated fills and a translucent fill.
const FILLS = [
  "#000000",
  "#1e293b",
  "#475569",
  "#7f7f7f",
  "#94a3b8",
  "#cbd5e1",
  "#e6f2ec",
  "#ffffff",
  "#1d4ed8",
  "#fde047",
  "#dc2626",
  "rgba(0, 0, 0, 0.1)",
];

function luminance_of(css: string): number {
  const color = parseRgbColor(css);
  if (!color) throw new Error(`unparsed colour ${css}`);
  return relativeLuminance(color);
}

for (const [name, theme] of [
  ["light", LIGHT],
  ["dark", DARK],
] as const) {
  it(`contrasts automatic text with each fill in the ${name} theme`, () => {
    const ctx = paint_column(
      FILLS.map((background_color) => ({ backgroundColor: background_color })),
      undefined,
      { theme },
    );
    FILLS.forEach((fill, row) => {
      const text = ctx.fillTexts.find((call) => call.text === `r${row}`);
      if (!text) throw new Error(`row ${row} painted no text`);
      // Judged over the theme background, as the fill is painted.
      const fill_luminance = fill.startsWith("rgba")
        ? luminance_of(name === "light" ? "#e6e6e6" : "#0c0f15")
        : luminance_of(fill);
      const text_luminance = luminance_of(text.fillStyle);
      const dark_text = text_luminance < 0.2;
      // Dark text on light fills, light text on dark fills.
      expect({ fill, darkText: dark_text }).toEqual({ fill, darkText: fill_luminance > 0.18 });
      expect([theme.fg, invert(theme.fg)]).toContain(text.fillStyle);
      expect(contrastRatio(text_luminance, fill_luminance)).toBeGreaterThanOrEqual(
        contrastRatio(
          luminance_of(text.fillStyle === theme.fg ? invert(theme.fg) : theme.fg),
          fill_luminance,
        ),
      );
    });
  });
}

it("keeps the theme foreground without a fill and an explicit text colour on a fill", () => {
  const ctx = paint_column([{}, { backgroundColor: "#e6f2ec", color: "#ff00ff" }], undefined, {
    theme: DARK,
  });
  expect(ctx.fillTexts.find((call) => call.text === "r0")?.fillStyle).toBe(DARK.fg);
  expect(ctx.fillTexts.find((call) => call.text === "r1")?.fillStyle).toBe("#ff00ff");
});

it("applies Column.headerStyle, contrasting a label with its own fill", () => {
  const layout = make_layout([
    {
      key: "a",
      header: "A",
      width: 100,
      type: "text",
      headerStyle: { backgroundColor: "#fde047" },
    },
    {
      key: "b",
      header: "B",
      width: 80,
      type: "text",
      headerStyle: { backgroundColor: "#112233", color: "#ffcc00" },
    },
    { key: "c", header: "C", width: 100, type: "text" },
  ]);
  const view = make_view(new Uint32Array(9), [{}], [0, 1, 2]);
  const ctx = render(view, layout, UNIFORM_VIEWPORT, DARK);
  const label_color = (text: string) => ctx.fillTexts.find((call) => call.text === text)?.fillStyle;
  expect([label_color("A"), label_color("B"), label_color("C")]).toEqual([
    invert(DARK.headerFg),
    "#ffcc00",
    DARK.headerFg,
  ]);
  // Column B's header gets its own background fill at the column's position.
  const bg = ctx.fillRects.find((r) => r.fillStyle === "#112233");
  expect(bg && { x: bg.x, w: bg.w, h: bg.h }).toEqual({ x: 100, w: 80, h: HEADER_HEIGHT });
});

// Excel paints a number in its format section's color, over the cell's font color.
it("paints a number in its section's color, over the font color", () => {
  const styles: CellStyle[] = [
    { numberFormat: "#,##0;[Red]-#,##0" },
    { numberFormat: "#,##0;[Red]-#,##0" },
    { numberFormat: "[Blue]0", color: "#123456" },
    { numberFormat: "0", color: "#123456" },
  ];
  const ctx = paint_column(styles, [-1200, 1200, 7, 8], { type: "number" });
  const color_of = (text: string) => ctx.fillTexts.find((call) => call.text === text)?.fillStyle;
  expect([color_of("-1,200"), color_of("7"), color_of("8")]).toEqual([
    "#ff0000",
    "#0000ff",
    "#123456",
  ]);
  expect(color_of("1,200")).not.toBe("#ff0000");
});

function invert(css: string): string {
  const color = parseRgbColor(css);
  if (!color) throw new Error(`unparsed colour ${css}`);
  const byte = (value: number) => (255 - value).toString(16).padStart(2, "0");
  return `#${byte(color.red)}${byte(color.green)}${byte(color.blue)}`;
}
