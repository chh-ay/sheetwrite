import { useTimeline } from "./useTimeline.js";

/**
 * Hero illustration: a scripted 26.5-second loop in three acts.
 *
 * 1. Edit (0–11.2 s): a pointer selects B3, types 120, and presses Enter.
 *    D3, B6, and D6 count to their new values and get an outline. Ctrl Z
 *    takes the edit back; Ctrl Y applies it again.
 * 2. Scale (11.2–19.5 s): the sheet shrinks into one tile of a
 *    1,000,000 × 1,000 address space. A viewport flies across it; the address
 *    and row range update. Each tile flashes when it is fetched, stays lit
 *    while cached, then fades.
 * 3. Memory (19.5–26.5 s): bars grow for the addressable cells and for the
 *    cells the performance example measured in memory after the same flight.
 *
 * The frame is a pure function of time (`frameAt`, plus the tile cache),
 * drawn straight into the SVG through useTimeline, so the loop never
 * re-renders React. Reduced motion shows one still frame: the finished edit.
 */

export const HERO_LOOP_SECONDS = 26.5;
/** The still frame for reduced motion: the edit is committed and recalculated. */
const STILL_SECONDS = 6;
/**
 * Act 1 runs on its own clock until the sheet starts to shrink. Acts 2 and 3
 * run on a clock that starts SHIFT seconds later, so act 1 can grow without
 * moving every later key time.
 */
const SHRINK_START = 10;
const SHIFT = 2.5;

const ACTS = [
  { start: 0, text: "Edit one cell. Recalculate, undo, and redo." },
  { start: 11.2, text: "Fly through 1,000,000 rows × 1,000 columns." },
  { start: 19.5, text: "Memory follows the view, not the sheet." },
] as const;

/* ---- Geometry (viewBox 640 × 400) ---------------------------------------------- */

/** The sheet card fills the picture; the badge overlaps its bottom edge. */
const SHEET = { x: 16, y: 14, w: 608, h: 352 } as const;
const PAD = 16;
const BAR = { y: SHEET.y + 14, h: 28, input: SHEET.x + 108 } as const;
const COL = { A: 56, B: 250, C: 380, D: 480, end: SHEET.x + SHEET.w - PAD } as const;
const HEADER = { y: 70, h: 28 } as const;
const ROW_H = 42;
const rowTop = (row: number) => HEADER.y + HEADER.h + (row - 1) * ROW_H;
const textY = (row: number) => rowTop(row) + 27;
/** Where the pointer clicks: the middle of B3. */
const B3_CENTER = { x: (COL.B + COL.C) / 2, y: rowTop(3) + ROW_H / 2 } as const;

const FIELD = { cols: 30, rows: 17, pitch: 20, tile: 16, x: 20, y: 20 } as const;
const VIEW = { cols: 4, rows: 3 } as const;
/** The viewport frame's height, in viewBox units. */
const VIEW_FRAME_H = VIEW.rows * FIELD.pitch - (FIELD.pitch - FIELD.tile) + 6;
/** How far the address chip moves to sit above the frame instead of below. */
const ADDRESS_FLIP = VIEW_FRAME_H + 29;
const MEMORY_BAR = { x: 78, y: 124, w: 484 } as const;

interface Waypoint {
  t: number;
  x: number;
  y: number;
  jump?: boolean;
}

/** Viewport route in tile coordinates. A `jump` waypoint teleports. */
const ROUTE: readonly Waypoint[] = [
  { t: 10.0, x: 0, y: 0 },
  { t: 11.6, x: 7, y: 3 },
  { t: 12.8, x: 12, y: 10 },
  { t: 13.6, x: 12, y: 10 },
  { t: 13.65, x: 22, y: 2, jump: true },
  { t: 14.3, x: 22, y: 2 },
  { t: 15.8, x: FIELD.cols - VIEW.cols, y: FIELD.rows - VIEW.rows },
];

const LAST_ROW = 1_000_000;
const LAST_COL = 1_000;

/* ---- Timing helpers ---------------------------------------------------------- */

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** 0 → 1 between `from` and `to`, eased. */
const span = (t: number, from: number, to: number) => ease(clamp((t - from) / (to - from)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;
const count = (value: number) => Math.round(value).toLocaleString("en-US");

function columnLetters(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function viewportAt(t: number): { x: number; y: number; flash: number } {
  const first = ROUTE[0] as Waypoint;
  if (t <= first.t) return { x: first.x, y: first.y, flash: 0 };
  for (let i = 1; i < ROUTE.length; i++) {
    const from = ROUTE[i - 1] as Waypoint;
    const to = ROUTE[i] as Waypoint;
    if (t <= to.t) {
      if (to.jump) return { x: to.x, y: to.y, flash: 1 };
      const k = ease((t - from.t) / (to.t - from.t));
      return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k), flash: 0 };
    }
  }
  const last = ROUTE[ROUTE.length - 1] as Waypoint;
  const jump = ROUTE.find((point) => point.jump);
  const sinceJump = jump ? t - jump.t : Number.POSITIVE_INFINITY;
  return { x: last.x, y: last.y, flash: sinceJump < 0.5 ? 1 - sinceJump / 0.5 : 0 };
}

/* ---- Frame ------------------------------------------------------------------- */

interface Frame {
  act: number;
  /** The clock acts 2 and 3 run on; tiles remember visits in this clock. */
  clock: number;
  sheet: { opacity: number; scale: number; tx: number; ty: number };
  cursor: { x: number; y: number; opacity: number };
  ripple: { r: number; opacity: number };
  selection: number;
  editing: boolean;
  /** Text in B3 and the formula bar. */
  typed: string;
  committed: boolean;
  d3: string;
  b6: string;
  d6: string;
  /** Dependent outline draw progress, 0 → 1, for D3, B6, D6. */
  paths: readonly [number, number, number];
  /** Recalculation pulse on D3, B6, D6. */
  pulses: readonly [number, number, number];
  badge: { opacity: number; text: string };
  key: { opacity: number; text: string; lift: number };
  field: number;
  viewport: { x: number; y: number; opacity: number; flash: number };
  address: string;
  rows: string;
  memory: {
    opacity: number;
    allWidth: number;
    allValue: string;
    residentWidth: number;
    residentValue: string;
    callout: number;
  };
}

const BADGES = [
  { from: 5.0, to: 6.5, text: "3 dependents recalculated" },
  { from: 7.6, to: 8.3, text: "Undo: 4 cells restored" },
  { from: 9.3, to: 10.0, text: "Redo: same 4 cells again" },
] as const;

const KEYS = [
  { from: 3.0, to: 3.7, text: "Enter" },
  { from: 6.6, to: 7.4, text: "Ctrl Z" },
  { from: 8.3, to: 9.1, text: "Ctrl Y" },
] as const;

/** Fade in, hold, fade out over [from, to]. */
function window_(t: number, from: number, to: number, fade = 0.25): number {
  if (t < from || t > to) return 0;
  return clamp(Math.min((t - from) / fade, (to - t) / fade));
}

function frameAt(t: number): Frame {
  const act = t < ACTS[1].start ? 0 : t < ACTS[2].start ? 1 : 2;
  /** Clock for acts 2 and 3: the old timeline those key times were written for. */
  const u = t < SHRINK_START ? Math.min(t, SHRINK_START - SHIFT) : t - SHIFT;

  // Act 1: pointer, typing, commit, recalculation, then undo and redo.
  const arrive = span(t, 0.5, 1.7);
  const cursor = {
    x: lerp(SHEET.x + SHEET.w - 24, B3_CENTER.x + 12, arrive),
    y: lerp(SHEET.y + SHEET.h + 10, B3_CENTER.y - 4, arrive),
    opacity: t < 0.4 ? t / 0.4 : t < 2.4 ? 1 : clamp(1 - (t - 2.4) / 0.4),
  };
  const clickAge = t - 1.8;
  const ripple = {
    r: clickAge > 0 && clickAge < 0.6 ? 6 + clickAge * 40 : 0,
    opacity: clickAge > 0 && clickAge < 0.6 ? 1 - clickAge / 0.6 : 0,
  };
  const typedSteps = ["", "1", "12", "120"];
  const typedIndex = t < 2.2 ? 0 : t < 2.5 ? 1 : t < 2.8 ? 2 : 3;
  const reset = u >= 23;
  const editing = t >= 2.0 && t < 3.3;
  const undone = t >= 6.9 && t < 8.6;
  const committed = t >= 3.3 && !undone && !reset;
  const typed = editing ? (typedSteps[typedIndex] ?? "") : committed ? "120" : "96";

  // 1 = the edit applies; undo takes it back, redo applies it again.
  const applied = reset ? 0 : 1 - span(t, 6.9, 7.5) + span(t, 8.6, 9.2);
  const d3k = span(t, 3.4, 4.0) * applied;
  const totalsK = span(t, 4.1, 4.9) * applied;
  const paths = [
    span(t, 3.35, 3.85) * applied,
    span(t, 4.0, 4.5) * applied,
    span(t, 4.1, 4.6) * applied,
  ] as const;
  const pulse = (...starts: number[]) =>
    Math.max(
      ...starts.map((start) => {
        const age = t - start;
        return age > 0 && age < 1.2 ? 1 - age / 1.2 : 0;
      }),
    );

  const badge = BADGES.find((item) => t >= item.from && t <= item.to);
  const key = KEYS.find((item) => t >= item.from && t <= item.to);

  // Transition into the field, and back at the end of the loop.
  const shrink = span(u, 7.5, 8.7);
  const regrow = span(u, 22.6, 23.8);
  const inField = t >= SHRINK_START && u < 23.8;
  const scale = inField ? lerp(1, FIELD.tile / SHEET.w, shrink) * (1 - regrow) + regrow : 1;
  // Translate so the card's corner travels to the first tile while it shrinks.
  const corner = inField ? shrink * (1 - regrow) : 0;
  const sheetOpacity = inField ? clamp(1 - shrink * 1.1) + regrow : 1;
  const memoryIn = u < 17 ? 0 : u < 17.6 ? (u - 17) / 0.6 : u < 22 ? 1 : clamp(1 - (u - 22) / 0.6);
  // The field dims behind the memory card.
  const field = inField ? clamp(shrink * 1.4) * (1 - regrow) * (1 - 0.6 * memoryIn) : 0;

  const view = viewportAt(u);
  const viewOpacity = u < 9.4 ? 0 : u < 9.9 ? (u - 9.4) / 0.5 : u < 22.6 ? 1 : 1 - regrow;
  const travelX = view.x / (FIELD.cols - VIEW.cols);
  const travelY = view.y / (FIELD.rows - VIEW.rows);
  const column = Math.round(travelX * (LAST_COL - 1));
  const row = Math.max(1, Math.round(travelY * (LAST_ROW - 22)) + 1);

  const allK = span(u, 17.3, 18.1);
  const residentK = span(u, 18.2, 18.8);

  return {
    act,
    clock: u,
    sheet: {
      opacity: clamp(sheetOpacity),
      scale,
      // The scale origin is (0, 0); this puts the card's corner on the tile.
      tx: lerp(SHEET.x, FIELD.x, corner) - SHEET.x * scale,
      ty: lerp(SHEET.y, FIELD.y, corner) - SHEET.y * scale,
    },
    cursor,
    ripple,
    selection: t < 1.8 ? 0 : t < 2.0 ? (t - 1.8) / 0.2 : 1,
    editing,
    typed,
    committed,
    d3: money(lerp(4608, 5760, d3k)),
    b6: count(lerp(440, 464, totalsK)),
    d6: money(lerp(19696, 20848, totalsK)),
    paths,
    pulses: [pulse(3.4, 6.9, 8.6), pulse(4.1, 7.0, 8.7), pulse(4.2, 7.0, 8.7)],
    badge: {
      opacity: badge ? window_(t, badge.from, badge.to) : 0,
      text: badge?.text ?? BADGES[0].text,
    },
    key: {
      opacity: key ? window_(t, key.from, key.to, 0.15) : 0,
      text: key?.text ?? KEYS[0].text,
      // The key presses down once, shortly after it appears.
      lift: key ? (t - key.from > 0.2 && t - key.from < 0.35 ? 0 : 1) : 1,
    },
    field,
    // The memory card replaces the moving view.
    viewport: {
      x: view.x,
      y: view.y,
      opacity: clamp(viewOpacity) * (1 - memoryIn),
      flash: view.flash,
    },
    address: `${columnLetters(column)}${row.toLocaleString("en-US")}`,
    rows: `Rows ${row.toLocaleString("en-US")}–${(row + 21).toLocaleString("en-US")}`,
    memory: {
      opacity: memoryIn,
      allWidth: MEMORY_BAR.w * allK,
      allValue: `${count(1_000_000_000 * allK)} cells`,
      residentWidth: residentK > 0 ? Math.max(4, 6 * residentK) : 0,
      residentValue: `${count(2210 * residentK)} cells · 1.3 MiB`,
      callout: span(u, 18.9, 19.4),
    },
  };
}

/* ---- Rendering --------------------------------------------------------------- */

interface Parts {
  root: HTMLElement;
  sheet: SVGGElement;
  cursor: SVGGElement;
  ripple: SVGCircleElement;
  selection: SVGRectElement;
  formula: SVGTextElement;
  caret: SVGRectElement;
  b3: SVGTextElement;
  b3Cell: SVGRectElement;
  d3: SVGTextElement;
  b6: SVGTextElement;
  d6: SVGTextElement;
  paths: SVGPathElement[];
  pulses: SVGRectElement[];
  badge: SVGGElement;
  badgeText: SVGTextElement;
  key: SVGGElement;
  keyCap: SVGGElement;
  keyText: SVGTextElement;
  field: SVGGElement;
  lit: SVGRectElement[];
  viewport: SVGGElement;
  viewportFlash: SVGRectElement;
  address: SVGTextElement;
  addressChip: SVGGElement;
  hud: SVGGElement;
  rows: SVGTextElement;
  resident: SVGTextElement;
  memory: SVGGElement;
  allBar: SVGRectElement;
  allValue: SVGTextElement;
  residentBar: SVGRectElement;
  residentValue: SVGTextElement;
  callout: SVGGElement;
  captions: HTMLElement[];
}

function query<T extends Element>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Hero scene is missing ${selector}`);
  return found;
}

function collect(root: HTMLElement): Parts {
  return {
    root,
    sheet: query(root, "[data-part=sheet]"),
    cursor: query(root, "[data-part=cursor]"),
    ripple: query(root, "[data-part=ripple]"),
    selection: query(root, "[data-part=selection]"),
    formula: query(root, "[data-part=formula]"),
    caret: query(root, "[data-part=caret]"),
    b3: query(root, "[data-part=b3]"),
    b3Cell: query(root, "[data-part=b3-cell]"),
    d3: query(root, "[data-part=d3]"),
    b6: query(root, "[data-part=b6]"),
    d6: query(root, "[data-part=d6]"),
    paths: [...root.querySelectorAll<SVGPathElement>("[data-part=path]")],
    pulses: [...root.querySelectorAll<SVGRectElement>("[data-part=pulse]")],
    badge: query(root, "[data-part=badge]"),
    badgeText: query(root, "[data-part=badge-text]"),
    key: query(root, "[data-part=key]"),
    keyCap: query(root, "[data-part=key-cap]"),
    keyText: query(root, "[data-part=key-text]"),
    field: query(root, "[data-part=field]"),
    lit: [...root.querySelectorAll<SVGRectElement>("[data-part=lit]")],
    viewport: query(root, "[data-part=viewport]"),
    viewportFlash: query(root, "[data-part=viewport-flash]"),
    address: query(root, "[data-part=address]"),
    addressChip: query(root, "[data-part=address-chip]"),
    hud: query(root, "[data-part=hud]"),
    rows: query(root, "[data-part=rows]"),
    resident: query(root, "[data-part=resident]"),
    memory: query(root, "[data-part=memory]"),
    allBar: query(root, "[data-part=all-bar]"),
    allValue: query(root, "[data-part=all-value]"),
    residentBar: query(root, "[data-part=resident-bar]"),
    residentValue: query(root, "[data-part=resident-value]"),
    callout: query(root, "[data-part=callout]"),
    captions: [...root.querySelectorAll<HTMLElement>("[data-act]")],
  };
}

/** Lit-tile state lives across frames: each tile remembers when the view last covered it. */
class TileMemory {
  readonly lastSeen = new Float64Array(FIELD.cols * FIELD.rows).fill(-1e9);
  /** When the tile was last fetched: covered again after it had faded out. */
  readonly fetched = new Float64Array(FIELD.cols * FIELD.rows).fill(-1e9);
  /**
   * What the DOM shows. NaN forces the first write: a replay builds a new
   * TileMemory over the same elements, which still hold the old opacity.
   */
  readonly shown = new Float64Array(FIELD.cols * FIELD.rows).fill(Number.NaN);
  readonly flashing = new Uint8Array(FIELD.cols * FIELD.rows).fill(2);

  reset(): void {
    this.lastSeen.fill(-1e9);
    this.fetched.fill(-1e9);
  }

  cover(t: number, x: number, y: number): void {
    const left = Math.floor(x + 0.25);
    const top = Math.floor(y + 0.25);
    for (let row = top; row < top + VIEW.rows; row++) {
      for (let column = left; column < left + VIEW.cols; column++) {
        if (row < 0 || column < 0 || row >= FIELD.rows || column >= FIELD.cols) continue;
        const index = row * FIELD.cols + column;
        if (t - (this.lastSeen[index] ?? -1e9) > FADE_SECONDS) this.fetched[index] = t;
        this.lastSeen[index] = t;
      }
    }
  }
}

/** A visited tile stays lit briefly: the cache keeps only recent tiles. */
const FADE_SECONDS = 1.3;

/** A fetched tile flashes briefly before it settles. */
const FETCH_FLASH_SECONDS = 0.22;

function apply(parts: Parts, frame: Frame, tiles: TileMemory): void {
  const t = frame.clock;
  const set = (el: Element, name: string, value: string | number) =>
    el.setAttribute(name, String(value));
  const opacity = (el: SVGElement | HTMLElement, value: number) => {
    el.style.opacity = String(value);
  };

  for (const [index, caption] of parts.captions.entries()) {
    caption.dataset.current = String(index === frame.act);
    caption.firstElementChild?.setAttribute("aria-current", index === frame.act ? "step" : "false");
  }

  const { sheet } = frame;
  parts.sheet.style.transform = `translate(${sheet.tx}px, ${sheet.ty}px) scale(${sheet.scale})`;
  opacity(parts.sheet, sheet.opacity);
  parts.sheet.style.visibility = sheet.opacity < 0.01 ? "hidden" : "visible";

  parts.cursor.style.transform = `translate(${frame.cursor.x}px, ${frame.cursor.y}px)`;
  opacity(parts.cursor, frame.cursor.opacity);
  set(parts.ripple, "r", frame.ripple.r);
  opacity(parts.ripple, frame.ripple.opacity);
  opacity(parts.selection, frame.selection);

  parts.formula.textContent = frame.editing ? frame.typed : frame.committed ? "120" : "96";
  parts.b3.textContent = frame.typed;
  parts.root.dataset.editing = String(frame.editing);
  parts.b3Cell.dataset.state = frame.editing ? "editing" : frame.committed ? "committed" : "idle";
  // The caret follows the typed text in the formula bar while editing.
  set(parts.caret, "x", BAR.input + 11 + frame.typed.length * 8.4);
  parts.d3.textContent = frame.d3;
  parts.b6.textContent = frame.b6;
  parts.d6.textContent = frame.d6;
  for (const [index, path] of parts.paths.entries()) {
    path.style.strokeDashoffset = String(1 - (frame.paths[index] ?? 0));
  }
  for (const [index, pulse] of parts.pulses.entries()) {
    opacity(pulse, frame.pulses[index] ?? 0);
  }
  opacity(parts.badge, frame.badge.opacity);
  parts.badgeText.textContent = frame.badge.text;
  opacity(parts.key, frame.key.opacity);
  parts.keyText.textContent = frame.key.text;
  parts.keyCap.style.transform = `translateY(${(1 - frame.key.lift) * 3}px)`;

  opacity(parts.field, frame.field);
  parts.field.style.visibility = frame.field < 0.01 ? "hidden" : "visible";
  const vp = frame.viewport;
  if (vp.opacity > 0 && t < 22.6) tiles.cover(t, vp.x, vp.y);
  let resident = 0;
  for (const [index, rect] of parts.lit.entries()) {
    const age = t - (tiles.lastSeen[index] ?? -1e9);
    const value = age < 0 ? 0 : clamp(1 - age / FADE_SECONDS);
    if (value > 0.04) resident++;
    const previous = tiles.shown[index] ?? Number.NaN;
    if (
      Number.isNaN(previous) ||
      Math.abs(value - previous) > 0.01 ||
      (value === 0 && previous !== 0)
    ) {
      tiles.shown[index] = value;
      rect.style.opacity = String(value);
    }
    const flash = t - (tiles.fetched[index] ?? -1e9) < FETCH_FLASH_SECONDS ? 1 : 0;
    if (flash !== tiles.flashing[index]) {
      tiles.flashing[index] = flash;
      if (flash) rect.dataset.fetched = "";
      else delete rect.dataset.fetched;
    }
  }
  parts.viewport.style.transform = `translate(${vp.x * FIELD.pitch}px, ${vp.y * FIELD.pitch}px)`;
  opacity(parts.viewport, vp.opacity);
  opacity(parts.viewportFlash, vp.flash);
  parts.address.textContent = frame.address;
  // Near the bottom the address goes above the frame, clear of the status bar.
  parts.addressChip.style.transform =
    vp.y > FIELD.rows - VIEW.rows - 2 ? `translateY(${-ADDRESS_FLIP}px)` : "";
  opacity(parts.hud, vp.opacity);
  parts.rows.textContent = frame.rows;
  parts.resident.textContent = `${resident} tiles in memory`;
  const { memory } = frame;
  opacity(parts.memory, memory.opacity);
  parts.memory.style.visibility = memory.opacity < 0.01 ? "hidden" : "visible";
  set(parts.allBar, "width", memory.allWidth);
  parts.allValue.textContent = memory.allValue;
  set(parts.residentBar, "width", memory.residentWidth);
  parts.residentValue.textContent = memory.residentValue;
  opacity(parts.callout, memory.callout);
}

/* ---- Component --------------------------------------------------------------- */

function Cell({
  x,
  y,
  children,
  part,
  align = "end",
  className,
}: Readonly<{
  x: number;
  y: number;
  children: string;
  part?: string;
  align?: "start" | "end";
  className?: string;
}>) {
  return (
    <text className={className ?? "hs-cell"} data-part={part} textAnchor={align} x={x} y={y}>
      {children}
    </text>
  );
}

/** Server-rendered values: the still frame after the edit is recalculated. */
const SHEET_ROWS = [
  ["Region", "Units", "Rate", "Revenue"],
  ["North", "128", "$42", "$5,376"],
  ["West", "120", "$48", "$5,760"],
  ["South", "112", "$44", "$4,928"],
  ["East", "104", "$46", "$4,784"],
  ["Total", "464", "", "$20,848"],
] as const;

/** A closed outline just inside a cell, drawn from its top-left corner. */
function cellOutline(x: number, y: number, w: number, h: number): string {
  const inset = 3;
  return `M ${x + inset} ${y + inset} H ${x + w - inset} V ${y + h - inset} H ${x + inset} Z`;
}

/** The cells that depend on B3, in recalculation order. */
const DEPENDENTS = [
  { part: "d3", x: COL.D, w: COL.end - COL.D, row: 3 },
  { part: "b6", x: COL.B, w: COL.C - COL.B, row: 6 },
  { part: "d6", x: COL.D, w: COL.end - COL.D, row: 6 },
] as const;

function SheetLayer() {
  const ref = { x: SHEET.x + PAD, w: 48 };
  const barText = BAR.y + 19;
  const badge = { w: 236, h: 30, y: SHEET.y + SHEET.h - 15 };
  return (
    <g className="hs-sheet" data-part="sheet">
      <rect className="hs-card" height={SHEET.h} rx={14} width={SHEET.w} x={SHEET.x} y={SHEET.y} />
      {/* Formula bar. */}
      <rect className="hs-ref" height={BAR.h} rx={6} width={ref.w} x={ref.x} y={BAR.y} />
      <text className="hs-ref-text" textAnchor="middle" x={ref.x + ref.w / 2} y={barText}>
        B3
      </text>
      <text className="hs-fx" textAnchor="middle" x={(ref.x + ref.w + BAR.input) / 2} y={barText}>
        fx
      </text>
      <rect
        className="hs-input"
        height={BAR.h}
        rx={6}
        width={COL.end - BAR.input}
        x={BAR.input}
        y={BAR.y}
      />
      <text className="hs-formula" data-part="formula" x={BAR.input + 10} y={barText}>
        120
      </text>
      <rect
        className="hs-caret"
        data-part="caret"
        height={16}
        width={1.5}
        x={BAR.input + 34}
        y={BAR.y + 6}
      />

      <rect
        className="hs-headrow"
        height={HEADER.h}
        rx={4}
        width={COL.end - (SHEET.x + PAD)}
        x={SHEET.x + PAD}
        y={HEADER.y}
      />
      {(["A", "B", "C", "D"] as const).map((letter, index) => {
        const edges = [COL.A, COL.B, COL.C, COL.D, COL.end];
        const mid = ((edges[index] ?? 0) + (edges[index + 1] ?? 0)) / 2;
        return (
          <text
            className="hs-letter"
            data-active={letter === "B" || undefined}
            key={letter}
            textAnchor="middle"
            x={mid}
            y={HEADER.y + 18}
          >
            {letter}
          </text>
        );
      })}
      {SHEET_ROWS.map((row, index) => {
        const number = index + 1;
        return (
          <g
            data-head={number === 1 || undefined}
            data-total={number === SHEET_ROWS.length || undefined}
            key={row[0]}
          >
            {number > 1 ? (
              <line
                className="hs-rule"
                x1={SHEET.x + PAD}
                x2={COL.end}
                y1={rowTop(number)}
                y2={rowTop(number)}
              />
            ) : null}
            <text
              className="hs-rownum"
              data-active={number === 3 || undefined}
              textAnchor="middle"
              x={(SHEET.x + PAD + COL.A) / 2}
              y={textY(number)}
            >
              {number}
            </text>
            <Cell align="start" x={COL.A + 10} y={textY(number)}>
              {row[0]}
            </Cell>
            {number === 3 ? (
              <rect
                className="hs-b3"
                data-part="b3-cell"
                height={ROW_H}
                width={COL.C - COL.B}
                x={COL.B}
                y={rowTop(3)}
              />
            ) : null}
            <Cell
              part={number === 3 ? "b3" : number === 6 ? "b6" : undefined}
              x={COL.C - 14}
              y={textY(number)}
            >
              {row[1]}
            </Cell>
            <Cell x={COL.D - 14} y={textY(number)}>
              {row[2]}
            </Cell>
            <Cell
              part={number === 3 ? "d3" : number === 6 ? "d6" : undefined}
              x={COL.end - 14}
              y={textY(number)}
            >
              {row[3]}
            </Cell>
          </g>
        );
      })}
      {/* Each dependent flashes, then keeps a drawn outline: like tracing dependents. */}
      {DEPENDENTS.map((cell) => (
        <rect
          className="hs-pulse"
          data-part="pulse"
          height={ROW_H}
          key={`pulse-${cell.part}`}
          width={cell.w}
          x={cell.x}
          y={rowTop(cell.row)}
        />
      ))}
      {DEPENDENTS.map((cell) => (
        <path
          className="hs-path"
          d={cellOutline(cell.x, rowTop(cell.row), cell.w, ROW_H)}
          data-part="path"
          key={`path-${cell.part}`}
          pathLength={1}
        />
      ))}
      <rect
        className="hs-selection"
        data-part="selection"
        height={ROW_H}
        rx={3}
        width={COL.C - COL.B}
        x={COL.B}
        y={rowTop(3)}
      />

      <g className="hs-badge" data-part="badge">
        <rect height={badge.h} rx={badge.h / 2} width={badge.w} x={COL.end - badge.w} y={badge.y} />
        <circle cx={COL.end - badge.w + 18} cy={badge.y + badge.h / 2} r={4} />
        <text data-part="badge-text" x={COL.end - badge.w + 30} y={badge.y + 20}>
          3 dependents recalculated
        </text>
      </g>

      {/* The key the user presses: Enter, then undo and redo. */}
      <g className="hs-key" data-part="key">
        <g data-part="key-cap">
          <rect height={30} rx={7} width={84} x={SHEET.x + PAD} y={badge.y} />
          <text data-part="key-text" textAnchor="middle" x={SHEET.x + PAD + 42} y={badge.y + 20}>
            Enter
          </text>
        </g>
      </g>
    </g>
  );
}

const TILES = Array.from({ length: FIELD.cols * FIELD.rows }, (_, index) => ({
  key: index,
  x: FIELD.x + (index % FIELD.cols) * FIELD.pitch,
  y: FIELD.y + Math.floor(index / FIELD.cols) * FIELD.pitch,
}));

function FieldLayer() {
  const frameW = VIEW.cols * FIELD.pitch - (FIELD.pitch - FIELD.tile) + 6;
  const frameH = VIEW.rows * FIELD.pitch - (FIELD.pitch - FIELD.tile) + 6;
  return (
    <g className="hs-field" data-part="field">
      {TILES.map((tile) => (
        <rect
          className="hs-tile"
          height={FIELD.tile}
          key={`b${tile.key}`}
          rx={3}
          width={FIELD.tile}
          x={tile.x}
          y={tile.y}
        />
      ))}
      {TILES.map((tile) => (
        <rect
          className="hs-lit"
          data-part="lit"
          height={FIELD.tile}
          key={`l${tile.key}`}
          rx={3}
          width={FIELD.tile}
          x={tile.x}
          y={tile.y}
        />
      ))}
      <g className="hs-viewport" data-part="viewport">
        <rect
          className="hs-viewport-flash"
          data-part="viewport-flash"
          height={frameH + 16}
          rx={10}
          width={frameW + 16}
          x={FIELD.x - 11}
          y={FIELD.y - 11}
        />
        <rect
          className="hs-viewport-frame"
          height={frameH}
          rx={6}
          width={frameW}
          x={FIELD.x - 3}
          y={FIELD.y - 3}
        />
        <g className="hs-address" data-part="address-chip">
          <rect height={20} rx={5} width={96} x={FIELD.x - 3} y={FIELD.y + frameH + 2} />
          <text data-part="address" textAnchor="middle" x={FIELD.x + 45} y={FIELD.y + frameH + 16}>
            A1
          </text>
        </g>
      </g>
      <g className="hs-hud" data-part="hud">
        <rect height={30} rx={8} width={600} x={20} y={364} />
        <text className="hs-hud-rows" data-part="rows" x={36} y={384}>
          Rows 1–22
        </text>
        <text className="hs-hud-scale" textAnchor="middle" x={320} y={384}>
          of 1,000,000 rows × 1,000 columns
        </text>
        <text className="hs-hud-resident" data-part="resident" textAnchor="end" x={604} y={384}>
          0 tiles in memory
        </text>
      </g>
    </g>
  );
}

function MemoryLayer() {
  const bar = MEMORY_BAR;
  const residentY = bar.y + 64;
  return (
    <g className="hs-memory" data-part="memory">
      <rect className="hs-memory-card" height={236} rx={14} width={540} x={50} y={70} />
      <text className="hs-memory-label" x={bar.x} y={bar.y - 12}>
        Addressable
      </text>
      <text
        className="hs-memory-value"
        data-part="all-value"
        textAnchor="end"
        x={bar.x + bar.w}
        y={bar.y - 12}
      >
        1,000,000,000 cells
      </text>
      <rect className="hs-memory-track" height={14} rx={7} width={bar.w} x={bar.x} y={bar.y} />
      <rect
        className="hs-memory-bar"
        data-kind="all"
        data-part="all-bar"
        height={14}
        rx={7}
        width={bar.w}
        x={bar.x}
        y={bar.y}
      />
      <text className="hs-memory-label" x={bar.x} y={residentY - 12}>
        In memory after the flight
      </text>
      <text
        className="hs-memory-value"
        data-kind="resident"
        data-part="resident-value"
        textAnchor="end"
        x={bar.x + bar.w}
        y={residentY - 12}
      >
        2,210 cells · 1.3 MiB
      </text>
      <rect className="hs-memory-track" height={14} rx={7} width={bar.w} x={bar.x} y={residentY} />
      <rect
        className="hs-memory-bar"
        data-kind="resident"
        data-part="resident-bar"
        height={14}
        rx={7}
        width={6}
        x={bar.x}
        y={residentY}
      />
      {/* A leader from the tiny resident bar to its share of the sheet. */}
      <g className="hs-callout" data-part="callout">
        <path d={`M ${bar.x + 3} ${residentY + 16} V ${residentY + 40} H ${bar.x + 22}`} />
        <rect height={26} rx={13} width={250} x={bar.x + 24} y={residentY + 27} />
        <text x={bar.x + 38} y={residentY + 45}>
          0.0002 % of the sheet is in memory
        </text>
      </g>
      <text className="hs-memory-note" x={bar.x} y={292}>
        Measured in the performance example after flying to ALL1000000.
      </text>
    </g>
  );
}

function Pointer() {
  return (
    <g className="hs-pointer" data-part="cursor">
      <circle className="hs-ripple" cx={0} cy={0} data-part="ripple" r={0} />
      <path d="M 0 0 L 0 18 L 5 13.5 L 8.5 21 L 11.5 19.6 L 8 12.4 L 14 12.4 Z" />
    </g>
  );
}

export function HeroScene() {
  const { ref, replay, seek } = useTimeline<HTMLElement>({
    loopSeconds: HERO_LOOP_SECONDS,
    stillSeconds: STILL_SECONDS,
    create: (root) => {
      const parts = collect(root);
      const tiles = new TileMemory();
      let previous = Number.POSITIVE_INFINITY;
      return (t) => {
        // A new loop (or the still frame) starts from an empty field.
        if (t < previous) tiles.reset();
        previous = t;
        apply(parts, frameAt(t), tiles);
      };
    },
  });

  return (
    <figure
      className="sw-hero-scene"
      data-landing-running="false"
      data-testid="landing-product-story"
      ref={ref}
    >
      <div className="sw-hero-scene__frame">
        <ol aria-label="What the illustration shows" className="sw-hero-scene__captions">
          {ACTS.map((act, index) => (
            <li data-act={index + 1} data-current={index === 0} key={act.text}>
              <button onClick={() => seek(act.start)} type="button">
                {act.text}
              </button>
            </li>
          ))}
        </ol>
        <svg aria-hidden="true" className="hs" viewBox="0 0 640 400">
          <FieldLayer />
          <SheetLayer />
          <MemoryLayer />
          <Pointer />
        </svg>
      </div>
      <figcaption>
        <span>Illustration of how Sheetwrite works. The live examples run the real engine.</span>
        <button className="sw-hero-scene__replay" onClick={replay} type="button">
          Replay animation
        </button>
      </figcaption>
    </figure>
  );
}
