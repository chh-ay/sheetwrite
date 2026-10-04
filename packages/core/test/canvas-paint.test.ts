import { describe, expect, it } from "bun:test";
import {
  blitVerticalScroll,
  fontFor,
  getMergeIndexResourceStatsForTest,
  paintFrame,
  resetMergeIndexResourceStatsForTest,
} from "../src/canvas-paint.js";
import { dateToSerial } from "../src/date-serial.js";
import type { CellStyle, RenderLayout, Theme, Viewport, VisibleWindowView } from "../src/types.js";

// jsdom/happy-dom has no 2D canvas context, so paint against a recording stub
// (modelled on the one in grid.test.ts, extended to capture the geometry of each
// draw call) and read back the rectangles/text/lines `paintFrame` emitted.
interface FillRectCall {
  x: number;
  y: number;
  w: number;
  h: number;
  fillStyle: string;
}

interface FillTextCall {
  text: string;
  x: number;
  y: number;
  fillStyle: string;
  font: string;
  maxWidth?: number;
  /** Clip rectangles in effect when the text was drawn (all apply at once). */
  clips: ClipRectCall[];
}

interface MoveToCall {
  x: number;
  y: number;
}
interface LineSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface ClipRectCall {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RecordingCtx {
  fillStyle: string;
  strokeStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  lineWidth: number;
  fillRects: FillRectCall[];
  fillTexts: FillTextCall[];
  clipRects: ClipRectCall[];
  segments: LineSegment[];
  [op: string]: unknown;
}

function makeRecordingCtx(): RecordingCtx {
  const ctx: RecordingCtx = {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    lineWidth: 1,
    fillRects: [],
    fillTexts: [],
    clipRects: [],
    segments: [],
  };

  // Capture the live `fillStyle` at call time, since it mutates between draws.
  ctx.fillRect = (x: number, y: number, w: number, h: number) => {
    ctx.fillRects.push({ x, y, w, h, fillStyle: ctx.fillStyle });
  };
  // Track the clip stack across save/restore so each draw knows its clips.
  let activeClips: ClipRectCall[] = [];
  const savedClips: ClipRectCall[][] = [];
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    ctx.fillTexts.push({
      text,
      x,
      y,
      maxWidth,
      fillStyle: ctx.fillStyle,
      font: ctx.font,
      clips: [...activeClips],
    });
  };
  let segmentStart: MoveToCall | undefined;
  ctx.moveTo = (x: number, y: number) => {
    segmentStart = { x, y };
  };
  ctx.lineTo = (x: number, y: number) => {
    if (segmentStart) {
      ctx.segments.push({ x0: segmentStart.x, y0: segmentStart.y, x1: x, y1: y });
      segmentStart = { x, y };
    }
  };
  // paintFrame measures the drawn run to size text decorations; approximate a
  // monospace-ish width so the recording ctx has a deterministic run length.
  ctx.measureText = (text: string) => ({ width: text.length * 7 });

  let pendingRect: ClipRectCall | undefined;
  ctx.rect = (x: number, y: number, w: number, h: number) => {
    pendingRect = { x, y, w, h };
  };
  ctx.clip = () => {
    if (pendingRect) {
      ctx.clipRects.push(pendingRect);
      activeClips = [...activeClips, pendingRect];
    }
  };
  ctx.save = () => {
    savedClips.push(activeClips);
  };
  ctx.restore = () => {
    activeClips = savedClips.pop() ?? [];
  };

  for (const op of ["setTransform", "beginPath", "stroke", "setLineDash"]) {
    ctx[op] = () => {};
  }

  return ctx;
}

// Custom (function) renderers are never exercised here; `paintFrame` takes a
// `ReadonlyMap`, so an empty map (not a lookup record) is the right shape.
const NO_RENDERERS = new Map<string, never>();

const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 20;

function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    font: "12px sans-serif",
    bg: "#ffffff",
    fg: "#000000",
    gridLine: "#dddddd",
    headerBg: "#f0f0f0",
    headerFg: "#333333",
    selection: "#cceeff",
    selectionBorder: "#3388ff",
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    rowHeaderWidth: 0,
    searchMatch: "#ffff00",
    searchActiveMatch: "#ffaa00",
    highlight: "#ccffcc",
    ...overrides,
  };
}

function makeLayout(
  columns: RenderLayout["columns"],
  merges?: RenderLayout["merges"],
): RenderLayout {
  return { columns, rowHeight: ROW_HEIGHT, headerHeight: HEADER_HEIGHT, totalRows: 3, merges };
}

function makeView(
  styleIds: Uint32Array,
  styles: readonly CellStyle[],
  cols: readonly number[] = [0, 1],
): VisibleWindowView {
  const rows = { start: 0, end: 3 };
  const cellCount = (rows.end - rows.start) * cols.length;
  const values = new Array<string>(cellCount).fill("x");
  return { sheet: "s1", rows, cols, values, styleIds, styles };
}

/** Paint `view` against a fresh recording context and return it for inspection. */
function render(
  view: VisibleWindowView,
  layout: RenderLayout,
  viewport: Viewport,
  theme: Theme = makeTheme(),
  damage?: { x: number; y: number; w: number; h: number },
): RecordingCtx {
  const ctx = makeRecordingCtx();
  paintFrame(
    ctx as unknown as CanvasRenderingContext2D,
    view,
    layout,
    theme,
    viewport,
    1,
    NO_RENDERERS,
    damage,
  );
  return ctx;
}

// Shared viewports. `paintFrame` only reads them, so the constants are reusable.
const UNIFORM_VIEWPORT: Viewport = { scrollTop: 0, scrollLeft: 0, width: 400, height: 300 };

// Non-uniform window geometry: row 0 is tall, row 1 short, row 2 medium.
const GEOMETRY_VIEWPORT: Viewport = {
  ...UNIFORM_VIEWPORT,
  rowTops: Float64Array.from([0, 40, 50]),
  rowHeights: Float64Array.from([40, 10, 25]),
};

describe("fontFor", () => {
  it("replaces an existing theme weight with valid bold and italic shorthands", () => {
    const theme = makeTheme({ font: 'normal 450 13px "Inter Variable", sans-serif' });
    expect(fontFor(theme, { bold: true })).toBe('bold 13px "Inter Variable", sans-serif');
    expect(fontFor(theme, { italic: true })).toBe('italic 450 13px "Inter Variable", sans-serif');
    expect(fontFor(theme, { bold: true, italic: true })).toBe(
      'italic bold 13px "Inter Variable", sans-serif',
    );
  });
});

describe("paintFrame variable row heights", () => {
  it("positions a cell using the supplied per-row geometry", () => {
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text" },
      { key: "b", header: "B", width: 80, type: "text" },
    ]);

    // Target cell at view-row 1, column 0 (i = 1 * 2 + 0) gets a unique fill.
    const CELL_FILL = "#abcdef";
    const styleIds = new Uint32Array(6);
    styleIds[2] = 1;
    const view = makeView(styleIds, [{}, { backgroundColor: CELL_FILL }]);

    const ctx = render(view, layout, GEOMETRY_VIEWPORT);

    const rect = ctx.fillRects.find((r) => r.fillStyle === CELL_FILL);
    expect(rect).toBeDefined();
    // y = headerHeight(20) + rowTops[1](40) - scrollTop(0); h = rowHeights[1](10).
    expect(rect?.y).toBe(60);
    expect(rect?.h).toBe(10);
    // The uniform layout would have produced y = 44, h = 24 instead.
    expect(rect?.y).not.toBe(44);
    expect(rect?.h).not.toBe(24);
  });

  it("removes internal gridlines from a merged rectangle", () => {
    const layout = makeLayout(
      [
        { key: "a", header: "A", width: 100, type: "text" },
        { key: "b", header: "B", width: 100, type: "text" },
      ],
      [{ r0: 0, c0: 0, r1: 1, c1: 1 }],
    );
    const view = makeView(new Uint32Array(6), [{}]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);
    const internalRowY = HEADER_HEIGHT + ROW_HEIGHT - 0.5;
    const internalColX = 100 - 0.5;

    expect(
      ctx.segments.some(
        (line) => line.y0 === internalRowY && line.y1 === internalRowY && line.x0 < 200,
      ),
    ).toBe(false);
    expect(
      ctx.segments.some(
        (line) =>
          line.x0 === internalColX &&
          line.x1 === internalColX &&
          line.y0 < HEADER_HEIGHT + ROW_HEIGHT * 2 &&
          line.y1 > HEADER_HEIGHT,
      ),
    ).toBe(false);
  });

  it("examines only visible merge intersections with thousands offscreen", () => {
    const merges = Array.from({ length: 10_000 }, (_, index) => ({
      r0: 10_000 + index * 2,
      c0: 0,
      r1: 10_000 + index * 2,
      c1: 1,
    }));
    merges.push({ r0: 0, c0: 0, r1: 1, c1: 1 });
    const layout = makeLayout(
      [
        { key: "a", header: "A", width: 100, type: "text" },
        { key: "b", header: "B", width: 100, type: "text" },
      ],
      merges,
    );
    const view = makeView(new Uint32Array(6), [{}]);
    resetMergeIndexResourceStatsForTest();

    render(view, layout, UNIFORM_VIEWPORT);

    expect(getMergeIndexResourceStatsForTest()).toMatchObject({
      indexConstructions: 1,
    });
    expect(getMergeIndexResourceStatsForTest().candidatesExamined).toBeLessThanOrEqual(20);
  });

  it("skips cells outside a damage strip", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT, makeTheme(), {
      x: 0,
      y: HEADER_HEIGHT + ROW_HEIGHT * 2,
      w: 400,
      h: ROW_HEIGHT,
    });

    const bodyTexts = ctx.fillTexts.filter((call) => call.text === "x");
    expect(bodyTexts).toHaveLength(1);
    expect(bodyTexts[0]?.y).toBe(HEADER_HEIGHT + ROW_HEIGHT * 2 + ROW_HEIGHT / 2);
  });
});

describe("paintFrame column styles", () => {
  it("lets a per-cell style override the column cellStyle", () => {
    const COL_FILL = "#ff0000";
    const CELL_FILL = "#0000ff";
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text", cellStyle: { backgroundColor: COL_FILL } },
    ]);

    // View-row 0 overrides the column fill with its own background.
    const styleIds = new Uint32Array(3);
    styleIds[0] = 1;
    const view = makeView(styleIds, [{}, { backgroundColor: CELL_FILL }], [0]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    // Row 0 (y = 20) wins with its per-cell blue; rows 1-2 keep the column red.
    const row0 = ctx.fillRects.find((r) => r.y === 20);
    expect(row0?.fillStyle).toBe(CELL_FILL);
    expect(ctx.fillRects.filter((r) => r.fillStyle === COL_FILL).length).toBe(2);
  });

  it("applies Column.headerStyle over the header defaults", () => {
    const HEADER_BG = "#112233";
    const HEADER_FG = "#ffcc00";
    const theme = makeTheme();
    const layout = makeLayout([
      { key: "a", header: "A", width: 100, type: "text" },
      {
        key: "b",
        header: "B",
        width: 80,
        type: "text",
        headerStyle: { backgroundColor: HEADER_BG, color: HEADER_FG },
      },
    ]);

    const view = makeView(new Uint32Array(6), [{}]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT, theme);

    // Column B's header gets its own background fill at the column's position.
    const bg = ctx.fillRects.find((r) => r.fillStyle === HEADER_BG);
    expect(bg).toBeDefined();
    expect(bg?.x).toBe(100);
    expect(bg?.w).toBe(80);
    expect(bg?.h).toBe(theme.headerHeight);

    // Column B's label uses the headerStyle foreground; column A keeps the theme's.
    expect(ctx.fillTexts.find((t) => t.text === "B")?.fillStyle).toBe(HEADER_FG);
    expect(ctx.fillTexts.find((t) => t.text === "A")?.fillStyle).toBe(theme.headerFg);
  });

  it("leaves DOM-owned cell text to the retained overlay", () => {
    const layout = {
      ...makeLayout([{ key: "a", header: "A", width: 100, type: "text", renderer: "dom" }]),
      domRendererColumns: Uint8Array.of(1),
    };
    const view = makeView(new Uint32Array(3), [{}], [0]);
    (view.values as string[])[0] = "DOM only";

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    expect(ctx.fillTexts.some((call) => call.text === "DOM only")).toBe(false);
    expect(ctx.fillTexts.some((call) => call.text === "A")).toBe(true);
  });

  it("lets text spill through empty cells but stops before occupied neighbours", () => {
    const layout = makeLayout([
      { key: "a", header: "A", width: 20, type: "text" },
      { key: "b", header: "B", width: 24, type: "text" },
      { key: "c", header: "C", width: 30, type: "text" },
    ]);
    const view = makeView(new Uint32Array(9), [{}], [0, 1, 2]);
    (view.values as string[]).splice(0, 3, "Long label", "", "occupied");

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    expect(ctx.clipRects).toContainEqual({
      x: 0,
      y: HEADER_HEIGHT,
      w: 44,
      h: ROW_HEIGHT,
    });
  });

  it("renders hashes instead of a misleading truncated number", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 18, type: "number" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);
    (view.values as Array<string | number>)[0] = 12345;

    const ctx = render(view, layout, UNIFORM_VIEWPORT);

    expect(ctx.fillTexts.some((call) => call.text === "#")).toBe(true);
    expect(ctx.fillTexts.some((call) => call.text === "12345")).toBe(false);
  });
});

describe("paintFrame typography and wrapping", () => {
  it("breaks an overlong token at character boundaries", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 26, type: "text" }]);
    const styleIds = Uint32Array.from([1, 0, 0]);
    const view = makeView(styleIds, [{}, { wrap: true }], [0]);
    (view.values as string[])[0] = "abcdef";
    const viewport = {
      ...UNIFORM_VIEWPORT,
      rowTops: Float64Array.from([0, 48, 72]),
      rowHeights: Float64Array.from([48, 24, 24]),
    };

    const ctx = render(view, layout, viewport);
    const painted = ctx.fillTexts.filter(
      (call) => call.y >= HEADER_HEIGHT && call.y < HEADER_HEIGHT + 48,
    );
    expect(painted.map((call) => call.text).join("")).toBe("abcdef");
    expect(painted.length).toBeGreaterThan(1);
    expect(painted.every((call) => call.x >= 0 && call.x < 26)).toBe(true);
  });

  it("draws only the wrapped lines that fit, in the top-anchored positions", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 26, type: "text" }]);
    const styleIds = Uint32Array.from([1, 0, 0]);
    const styles = [{}, { wrap: true }];
    const text = "abcdefghijklmnopqrstuvwxyz0123456789";
    const view = makeView(styleIds, styles, [0]);
    (view.values as string[])[0] = text;
    // Empty neighbours keep the recorded run free of unrelated body text.
    (view.values as string[])[1] = "";
    (view.values as string[])[2] = "";
    const viewport = {
      ...UNIFORM_VIEWPORT,
      rowTops: Float64Array.from([0, 48, 72]),
      rowHeights: Float64Array.from([48, 24, 24]),
    };

    const ctx = render(view, layout, viewport);
    const painted = ctx.fillTexts.filter((call) => call.y >= HEADER_HEIGHT);
    const visibleText = painted.map((call) => call.text).join("");
    expect(painted.length).toBeGreaterThan(1);
    expect(text.startsWith(visibleText)).toBe(true);
    expect(visibleText.length).toBeLessThan(text.length);
    const firstLine = painted[0];
    if (!firstLine) throw new Error("Expected the first wrapped line");
    expect(firstLine.y).toBeGreaterThan(HEADER_HEIGHT);
    expect(firstLine.y).toBeLessThan(HEADER_HEIGHT + ROW_HEIGHT / 2);
    for (const [index, line] of painted.entries()) {
      expect(line.clips.some((clip) => clip.y === HEADER_HEIGHT && clip.h === 48)).toBe(true);
      const previous = painted[index - 1];
      if (previous) expect(line.y).toBeGreaterThan(previous.y);
    }
  });
});

describe("paintFrame text decorations", () => {
  const TEXT_COLOR = "#123456";
  // Left-aligned text row 0, col 0 origin: cy = headerHeight + rowHeight/2.
  const ROW_CY = HEADER_HEIGHT + ROW_HEIGHT / 2;

  function renderDecorated(style: CellStyle): RecordingCtx {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const styleIds = new Uint32Array(3);
    styleIds[0] = 1; // view-row 0 gets the decorated style; rows 1-2 stay default.
    const view = makeView(styleIds, [{}, style], [0]);
    return render(view, layout, UNIFORM_VIEWPORT);
  }

  /** 1px-high fill rects in the text color are the decoration lines. */
  const decorationLines = (ctx: RecordingCtx): FillRectCall[] =>
    ctx.fillRects.filter((r) => r.h === 1 && r.fillStyle === TEXT_COLOR);

  it("draws an underline line below the text run, in the text color", () => {
    const ctx = renderDecorated({ underline: true, color: TEXT_COLOR });

    const lines = decorationLines(ctx);
    expect(lines).toHaveLength(1);
    const underline = lines[0];
    if (!underline) throw new Error("Expected an underline");
    // Below the "middle" baseline origin, still inside the row (20..44).
    expect(underline.y).toBeGreaterThan(ROW_CY);
    expect(underline.y).toBeLessThan(HEADER_HEIGHT + ROW_HEIGHT);
    const text = ctx.fillTexts.find((call) => call.text === "x" && call.y === ROW_CY);
    if (!text) throw new Error("Expected the underlined text run");
    expect(underline.x).toBe(text.x);
    expect(underline.w).toBe(7);
  });

  it("draws a strikethrough line through the middle of the text run", () => {
    const ctx = renderDecorated({ strikethrough: true, color: TEXT_COLOR });

    const lines = decorationLines(ctx);
    expect(lines).toHaveLength(1);
    // Mid x-height ≈ the "middle" baseline origin at cy, rounded to a pixel.
    expect(lines[0]?.y).toBe(Math.round(ROW_CY));
  });
});

describe("paintFrame compiled number formats", () => {
  it("paints fixed-decimal and named-date values consistently across cells", () => {
    const serial = dateToSerial(new Date(Date.UTC(2024, 6, 4)));
    const view: VisibleWindowView = {
      sheet: "s1",
      rows: { start: 0, end: 3 },
      cols: [0, 1],
      values: [1234.5, serial, 1234.5, serial, 1234.5, serial],
      styleIds: new Uint32Array(6),
      styles: [{}],
    };
    const layout = makeLayout([
      {
        key: "amount",
        header: "Amount",
        width: 120,
        type: "number",
        numberFormat: "#,##0.00",
        numberLocale: "en-US",
      },
      {
        key: "date",
        header: "Date",
        width: 120,
        type: "date",
        numberFormat: "mmmm d",
        numberLocale: "en-US",
      },
    ]);

    const ctx = render(view, layout, UNIFORM_VIEWPORT);
    expect(ctx.fillTexts.filter((call) => call.text === "1,234.50")).toHaveLength(3);
    expect(ctx.fillTexts.filter((call) => call.text === "July 4")).toHaveLength(3);
  });
});

describe("scroll blit and damage-band integrity", () => {
  const blitViewport = (scrollTop: number): Viewport => ({
    scrollTop,
    scrollLeft: 0,
    width: 400,
    height: 300,
    contentRevision: 7,
  });

  function runBlit(prevTop: number, nextTop: number, dpr = 1) {
    const ctx = makeRecordingCtx();
    const draws: unknown[][] = [];
    ctx.drawImage = (...args: unknown[]) => {
      draws.push(args);
    };
    const damage = blitVerticalScroll(
      ctx as unknown as CanvasRenderingContext2D,
      {} as HTMLCanvasElement,
      makeTheme(),
      blitViewport(prevTop),
      blitViewport(nextTop),
      dpr,
      dpr,
    );
    return { damage, draws };
  }

  it("refuses fractional device-pixel shifts instead of stranding stale glyphs", () => {
    // A rounded copy plus an exact-offset repaint leaves sub-pixel-shifted
    // glyph slices that accumulate into ghosting on touchpad scrolls.
    const { damage, draws } = runBlit(100, 100.4);
    expect(damage).toBeUndefined();
    expect(draws).toHaveLength(0);
  });

  it("still blits exact device-pixel shifts", () => {
    const { damage, draws } = runBlit(100, 103);
    expect(draws).toHaveLength(1);
    expect(damage).toEqual({ x: 0, y: 297, w: 400, h: 3 });
  });

  it("paints a row label whose band overlaps the damage strip but whose center does not", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);
    const theme = makeTheme({ rowHeaderWidth: 40 });
    // Row 1 band: y in [44, 68), center 56. Strip covers only its lower
    // quarter [62, 80): center-point culling would skip the label and let the
    // strip's background erase the glyph half inside it - sliced digits.
    const ctx = render(view, layout, UNIFORM_VIEWPORT, theme, { x: 0, y: 62, w: 400, h: 18 });
    const label = ctx.fillTexts.find((call) => call.text === "2");
    expect(label).toBeDefined();
    expect(label?.y).toBe(56);
  });

  it("never paints a row number into the column header band", () => {
    const layout = makeLayout([{ key: "a", header: "A", width: 100, type: "text" }]);
    const view = makeView(new Uint32Array(3), [{}], [0]);
    const theme = makeTheme({ rowHeaderWidth: 40 });
    // Row 1 is scrolled 16px under the header: its band is y in [4, 28) and
    // its number is centred at y=16, inside the header band [0, 20).
    const ctx = render(view, layout, { ...UNIFORM_VIEWPORT, scrollTop: 16 }, theme);
    const label = ctx.fillTexts.find((call) => call.text === "1");
    expect(label).toBeDefined();
    const clipTop = Math.max(...label!.clips.map((clip) => clip.y));
    expect(clipTop).toBeGreaterThanOrEqual(HEADER_HEIGHT);
  });
});
