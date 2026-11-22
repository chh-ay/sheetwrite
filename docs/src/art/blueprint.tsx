// The blueprint figure kit: boxes on a dotted canvas joined by connectors
// whose ends come from the boxes' geometry, never from typed coordinates.
// A figure is data: its boxes (nodes) and the connectors between them
// (edges), in a wide and a narrow layout; art.css draws the blueprint style.
//
// A drawing is laid out in its own units, then fitted into its frame: its
// viewBox is the bounding box of its boxes, connectors and labels plus
// SPACING.frame on every side, so it sits centred with equal padding at any
// width. A box's text is centred in the box, SPACING.inset from its border.
//
// Connector kinds: `main` is the path a reader follows first, `back` what
// flows back up (events, results, warnings), `fail` a failure exit, and
// `side` a secondary link. Labels sit on a halo in the canvas colour, so they
// stay readable over the dots and the lines.
import { createUniqueId, For, type JSX, Show } from "solid-js";

import {
  anchor,
  arrowHead,
  type BoxSide,
  opposite,
  type Point,
  type Rect,
  route,
  routePoints,
} from "./layout.js";

/** One box: an optional mono eyebrow, a title, code lines and caption lines. */
export interface BlueprintNode {
  readonly id: string;
  readonly rect: Rect;
  readonly eyebrow?: string;
  readonly title: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  /** `accent` marks the box the figure is about; `danger` a failure; `muted` a side result; `lane` a sequence lifeline. */
  readonly tone?: "accent" | "danger" | "muted" | "lane";
  /** A small sheet drawn under the code: which cells a formula reads. */
  readonly sheet?: BlueprintSheet;
}

/** A small sheet: columns from A, rows from 1, some cell values and tinted ranges. */
export interface BlueprintSheet {
  readonly cols: number;
  readonly rows: number;
  /** Column and row from 0, and the cell's text. */
  readonly cells: readonly (readonly [col: number, row: number, text: string])[];
  /** Inclusive blocks of cells, from and to as column and row from 0. */
  readonly ranges: readonly {
    readonly from: readonly [col: number, row: number];
    readonly to: readonly [col: number, row: number];
    readonly tone: "accent" | "muted" | "danger";
  }[];
}

/** A small sheet's cell, its column letters' row and its row numbers' gutter. */
const CELL = { w: 46, h: 20, head: 16, gutter: 18 } as const;
const LETTERS = "ABCDEFGHIJ";
/** The room above and below a small sheet in its box. */
const SHEET_SPACE = 8;

/** The height a small sheet takes in its box, with the room above and below it. */
const sheet_height = (sheet: BlueprintSheet) => CELL.head + sheet.rows * CELL.h + 2 * SHEET_SPACE;

/** One connector, from a point on one box's side to a point on another's. */
export interface BlueprintEdge {
  readonly from: string;
  readonly fromSide: BoxSide;
  readonly to: string;
  /** The side it enters; the opposite of `fromSide` by default. */
  readonly toSide?: BoxSide;
  /** Where along the side it leaves, 0 to 1; the middle by default. */
  readonly t?: number;
  /** Where along the side it enters; `t` by default. */
  readonly toT?: number;
  readonly kind: "main" | "back" | "fail" | "side";
  /**
   * Named beside the connector's midpoint, by rule: above a connector that
   * leaves sideways, to the right of one that leaves up or down. Of two
   * parallel connectors between the same boxes, each label sits on its outer
   * side: above the upper one and below the lower one, left of the left one
   * and right of the right one.
   */
  readonly label?: string;
}

export interface BlueprintLayout {
  readonly nodes: readonly BlueprintNode[];
  readonly edges: readonly BlueprintEdge[];
  /**
   * A card picture's frame shape, width over height, which art.css gives the
   * card's art box too. A diagram's frame takes the drawing's own shape.
   */
  readonly aspect?: number;
}

/** A figure's accessible name and description, shared by both layouts. */
export interface BlueprintText {
  readonly title: string;
  readonly description: string;
}

/**
 * The figures' spacing scale, in drawing units (CSS pixels at full size).
 * The kit and every layout space boxes, lines and labels with these, never
 * with their own numbers. Card pictures are small, so they have their own.
 */
export const SPACING = {
  /** From a box's text to its border, on every side. */
  inset: 16,
  /** Between two boxes a connector joins side by side: the arrow's length. */
  link: 64,
  /** Between two rows a connector joins: the line and a label beside it. */
  row: 56,
  /** Between boxes side by side or stacked that no connector joins. */
  tile: 24,
  /** From a connector to its label. */
  label: 8,
  /** From the drawing's outermost box, connector or label to the edge of its frame. */
  frame: 32,
  /** Card pictures: the same rules, scaled to a card's top, which is often a small thumbnail. */
  card: { insetX: 12, insetY: 8, link: 32, tile: 12, frame: 28 },
} as const;

/**
 * The body face (Instrument Sans) at weight 600: the advance of each
 * printable ASCII character, from " " to "~", in ems, as Chromium sets it.
 * Any other character counts as OTHER_EM, as wide as the widest of them (→).
 */
const BODY_EMS = [
  0.263, 0.265, 0.421, 0.727, 0.638, 0.786, 0.768, 0.228, 0.335, 0.336, 0.41, 0.519, 0.239, 0.452,
  0.239, 0.312, 0.688, 0.385, 0.567, 0.587, 0.618, 0.581, 0.625, 0.568, 0.61, 0.626, 0.275, 0.275,
  0.496, 0.527, 0.497, 0.58, 0.867, 0.733, 0.643, 0.745, 0.755, 0.63, 0.594, 0.764, 0.725, 0.254,
  0.417, 0.712, 0.589, 0.898, 0.725, 0.798, 0.667, 0.805, 0.663, 0.638, 0.667, 0.702, 0.733, 1.076,
  0.701, 0.7, 0.625, 0.439, 0.445, 0.439, 0.545, 0.505, 0.354, 0.543, 0.621, 0.55, 0.621, 0.577,
  0.376, 0.621, 0.612, 0.255, 0.26, 0.558, 0.26, 0.941, 0.612, 0.598, 0.621, 0.621, 0.391, 0.502,
  0.413, 0.59, 0.542, 0.72, 0.584, 0.542, 0.501, 0.439, 0.234, 0.379, 0.545,
] as const;
const FIRST_PRINTABLE = 32;
const OTHER_EM = 0.98;
/** The mono face sets every character this wide. */
const MONO_EM = 0.6;
/** Room for rounding and hinting, so a box sized from these widths always holds its text. */
const WIDTH_SLACK = 1.03;

/** How a kind of text sets: its size, and what art.css does to it. Sizes and faces are in art.css. */
interface Face {
  readonly size: number;
  readonly isMono?: boolean;
  readonly isUppercase?: boolean;
  /** Letter spacing, in ems. */
  readonly tracking?: number;
  /** The regular weight sets up to 4% wider than the 600 weight the table measures. */
  readonly spread?: number;
}

/**
 * Each kind of box text: how it sets; the step from one line to the next;
 * and the height of the line's box, which is the font's ascent plus descent
 * (browsers centre that box on `y` with dominant-baseline: central).
 */
const TEXT = {
  eyebrow: { face: { size: 10.5, isUppercase: true, tracking: 0.08 }, step: 16, box: 13 },
  title: { face: { size: 13 }, step: 18, box: 16 },
  code: { face: { size: 11, isMono: true }, step: 16, box: 14 },
  line: { face: { size: 12, spread: 1.04 }, step: 16, box: 15 },
} as const satisfies Record<string, { face: Face; step: number; box: number }>;
type TextKind = keyof typeof TEXT;

/** A connector's label: how it sets, its box height and its halo. */
const LABEL = { face: { size: 11.5 }, box: 14, halo: 2.5 } as const;

/** A box holds a title and at most this many lines of code and caption, each this short. */
const MAX_LINES = 2;
const MAX_LINE_LENGTH = 36;
const MAX_CODE_LENGTH = 30;

/** How wide `text` sets in `face`, from the measured advances, rounded up. */
function set_width(text: string, face: Face): number {
  const ems = [...(face.isUppercase ? text.toUpperCase() : text)].reduce((sum, char) => {
    const advance = face.isMono
      ? MONO_EM
      : (BODY_EMS[(char.codePointAt(0) ?? 0) - FIRST_PRINTABLE] ?? OTHER_EM) * (face.spread ?? 1);
    return sum + advance + (face.tracking ?? 0);
  }, 0);
  return ems * face.size * WIDTH_SLACK;
}

/** The width a connector's label takes, with its halo: layouts leave room for it. */
export function labelWidth(text: string): number {
  return set_width(text, LABEL.face) + 2 * LABEL.halo;
}

/**
 * The gap two boxes side by side need for the labelled connectors between
 * them: each label with SPACING.label to either side, and never less than
 * SPACING.link.
 */
export function linkGap(labels: readonly string[]): number {
  return Math.max(SPACING.link, ...labels.map((text) => labelWidth(text) + 2 * SPACING.label));
}

/** One line of a box's text, or its small sheet, in reading order. */
type Row =
  | { readonly kind: TextKind; readonly text: string }
  | { readonly kind: "sheet"; readonly sheet: BlueprintSheet };

type TextFields = Pick<BlueprintNode, "eyebrow" | "title" | "lines" | "code" | "sheet">;

/** A box's rows: eyebrow, title, code, then the sheet the code reads, then the caption. */
function rows_of(node: TextFields): Row[] {
  return [
    ...(node.eyebrow ? [{ kind: "eyebrow" as const, text: node.eyebrow }] : []),
    ...(node.title === "" ? [] : [{ kind: "title" as const, text: node.title }]),
    ...(node.code ?? []).map((text) => ({ kind: "code" as const, text })),
    ...(node.sheet === undefined ? [] : [{ kind: "sheet" as const, sheet: node.sheet }]),
    ...(node.lines ?? []).map((text) => ({ kind: "line" as const, text })),
  ];
}

const row_step = (row: Row) =>
  row.kind === "sheet" ? sheet_height(row.sheet) : TEXT[row.kind].step;
const row_box = (row: Row) => (row.kind === "sheet" ? sheet_height(row.sheet) : TEXT[row.kind].box);

/** The height of a box's text, from the top of its first line's box to the bottom of its last. */
function block_height(rows: readonly Row[]): number {
  const first = rows[0];
  const last = rows.at(-1);
  if (first === undefined || last === undefined) return 0;
  const steps = rows.reduce((sum, row) => sum + row_step(row), 0);
  return steps - (row_step(first) - row_box(first)) / 2 - (row_step(last) - row_box(last)) / 2;
}

/** The height a box needs: its text and the inset above and below. */
export function nodeHeight(node: TextFields, isCard = false): number {
  return block_height(rows_of(node)) + 2 * (isCard ? SPACING.card.insetY : SPACING.inset);
}

/** The width of a box's widest line, or its sheet: a box adds its inset on each side. */
export function nodeTextWidth(node: TextFields): number {
  const widths = rows_of(node).map((row) =>
    row.kind === "sheet"
      ? CELL.gutter + row.sheet.cols * CELL.w
      : set_width(row.text, TEXT[row.kind].face),
  );
  return Math.max(0, ...widths);
}

/** The width a box needs: its widest line, or its sheet, and the inset on each side. */
export function nodeWidth(node: TextFields): number {
  return nodeTextWidth(node) + 2 * SPACING.inset;
}

/** Fails the build when a box holds more text than it can show plainly. */
function check_text(node: BlueprintNode): void {
  const lines = node.lines ?? [];
  const code = node.code ?? [];
  const name = node.title || code[0] || node.id;
  if (lines.length + code.length > MAX_LINES) {
    throw new Error(
      `The box "${name}" has ${lines.length + code.length} lines under its title; keep it to ${MAX_LINES}`,
    );
  }
  for (const line of lines) {
    if ([...line].length > MAX_LINE_LENGTH)
      throw new Error(`The box "${name}" has a line over ${MAX_LINE_LENGTH} characters: "${line}"`);
  }
  for (const line of code) {
    if ([...line].length > MAX_CODE_LENGTH)
      throw new Error(`The box "${name}" has code over ${MAX_CODE_LENGTH} characters: "${line}"`);
    if (/^\s|[(,]$/.test(line))
      throw new Error(`The box "${name}" breaks code mid-call: "${line}"; keep a call on one line`);
  }
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * A small sheet centred on `centre`, its top at `y` and at most `width`
 * wide: letters, row numbers, grid lines, ranges, then values.
 */
function Sheet(
  props: Readonly<{ sheet: BlueprintSheet; centre: number; y: number; width: number }>,
) {
  // Narrow boxes with many columns shrink the cells so the sheet stays inside the box.
  const cw = Math.min(CELL.w, (props.width - CELL.gutter) / props.sheet.cols);
  const x = props.centre - (CELL.gutter + props.sheet.cols * cw) / 2;
  const left = x + CELL.gutter;
  const top = props.y + CELL.head;
  const right = left + props.sheet.cols * cw;
  const bottom = top + props.sheet.rows * CELL.h;
  const lines = [
    ...Array.from(
      { length: props.sheet.rows + 1 },
      (_, row) => `M${round(left)} ${round(top + row * CELL.h)}H${round(right)}`,
    ),
    ...Array.from(
      { length: props.sheet.cols + 1 },
      (_, col) => `M${round(left + col * cw)} ${round(top)}V${round(bottom)}`,
    ),
  ].join("");
  return (
    <g class="bp-sheet">
      <For each={[...LETTERS.slice(0, props.sheet.cols)]}>
        {(letter, col) => (
          <text
            class="bp-sheet__head"
            dominant-baseline="central"
            text-anchor="middle"
            x={round(left + col() * cw + cw / 2)}
            y={round(props.y + CELL.head / 2)}
          >
            {letter}
          </text>
        )}
      </For>
      <For each={Array.from({ length: props.sheet.rows }, (_, row) => row + 1)}>
        {(number) => (
          <text
            class="bp-sheet__head"
            dominant-baseline="central"
            text-anchor="middle"
            x={round(x + CELL.gutter / 2)}
            y={round(top + (number - 0.5) * CELL.h)}
          >
            {number}
          </text>
        )}
      </For>
      <For each={props.sheet.ranges}>
        {(range) => (
          // A path, not a rect: ranges overlap on purpose (an intersection), and they aren't boxes.
          <path
            class="bp-sheet__range"
            d={`M${round(left + range.from[0] * cw)} ${round(top + range.from[1] * CELL.h)}h${round((range.to[0] - range.from[0] + 1) * cw)}v${(range.to[1] - range.from[1] + 1) * CELL.h}h${round(-(range.to[0] - range.from[0] + 1) * cw)}z`}
            data-tone={range.tone}
          />
        )}
      </For>
      <path class="bp-sheet__grid" d={lines} />
      <For each={props.sheet.cells}>
        {([col, row, text]) => (
          <text
            class="bp-sheet__cell"
            dominant-baseline="central"
            text-anchor="middle"
            x={round(left + col * cw + cw / 2)}
            y={round(top + (row + 0.5) * CELL.h)}
          >
            {text}
          </text>
        )}
      </For>
    </g>
  );
}

/** A box, its text centred in it: each line's box is centred on its `y`, and the block on the box. */
function Node(props: Readonly<{ node: BlueprintNode }>) {
  check_text(props.node);
  const { x, y, w, h } = props.node.rect;
  const rows = rows_of(props.node);
  const centre = x + w / 2;
  const first = rows[0];
  let top =
    y +
    (h - block_height(rows)) / 2 -
    (first === undefined ? 0 : (row_step(first) - row_box(first)) / 2);
  const placed = rows.map((row) => {
    const middle = top + row_step(row) / 2;
    top += row_step(row);
    return { row, middle };
  });
  return (
    <g class="bp-node" data-tone={props.node.tone ?? "plain"}>
      <rect
        class="bp-node__box"
        height={round(h)}
        rx={6}
        width={round(w)}
        x={round(x)}
        y={round(y)}
      />
      <For each={placed}>
        {({ row, middle }) =>
          row.kind === "sheet" ? (
            <Sheet
              centre={centre}
              sheet={row.sheet}
              width={w - 2 * SPACING.inset}
              y={middle - sheet_height(row.sheet) / 2 + SHEET_SPACE}
            />
          ) : (
            <text
              class={`bp-node__${row.kind}`}
              dominant-baseline="central"
              text-anchor="middle"
              x={round(centre)}
              y={round(middle)}
            >
              {row.text}
            </text>
          )
        }
      </For>
    </g>
  );
}

/** Connector ends this close across their direction are meant to line up. */
const SNAP = 12;
/** A snapped end stays this far inside its box's side, clear of the rounded corner. */
const SNAP_INSET = 6;

/**
 * A connector between two nearly aligned boxes runs straight: when its ends
 * sit on parallel sides and are offset by less than SNAP across its
 * direction, one end moves onto the other's line, if that line meets its side.
 */
function straighten(
  from_rect: Rect,
  start: Point,
  to_rect: Rect,
  end: Point,
  from_side: BoxSide,
  to_side: BoxSide,
): { start: Point; end: Point } {
  const horizontal = (side: BoxSide) => side === "left" || side === "right";
  if (horizontal(from_side) !== horizontal(to_side)) return { start, end };
  const across = horizontal(from_side) ? "y" : "x";
  const offset = Math.abs(end[across] - start[across]);
  if (offset < 0.5 || offset >= SNAP) return { start, end };
  const fits = (rect: Rect, value: number) =>
    across === "y"
      ? value >= rect.y + SNAP_INSET && value <= rect.y + rect.h - SNAP_INSET
      : value >= rect.x + SNAP_INSET && value <= rect.x + rect.w - SNAP_INSET;
  if (fits(to_rect, start[across])) return { start, end: { ...end, [across]: start[across] } };
  if (fits(from_rect, end[across])) return { start: { ...start, [across]: end[across] }, end };
  return { start, end };
}

/** A connector's ends, the side it enters by, and its label's place and box. */
interface EdgeGeometry {
  readonly start: Point;
  readonly end: Point;
  readonly toSide: BoxSide;
  /** The route's ends and corners, as `routePoints` gives them. */
  readonly points: readonly Point[];
  readonly label?: {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly anchor: "start" | "middle" | "end";
    readonly box: Rect;
  };
}

/** A connector's ends on its boxes and the side it enters by. */
function edge_ends(edge: BlueprintEdge, nodes: ReadonlyMap<string, BlueprintNode>) {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  if (from === undefined || to === undefined) {
    throw new Error(`A connector joins ${edge.from} and ${edge.to}, which aren't both boxes`);
  }
  const to_side = edge.toSide ?? opposite(edge.fromSide);
  const { start, end } = straighten(
    from.rect,
    anchor(from.rect, edge.fromSide, edge.t ?? 0.5),
    to.rect,
    anchor(to.rect, to_side, edge.toT ?? edge.t ?? 0.5),
    edge.fromSide,
    to_side,
  );
  return { start, end, toSide: to_side };
}

/** A straight piece of a connector's route: its ends, its middle, and whether it runs up or down. */
interface Leg {
  readonly from: Point;
  readonly to: Point;
  readonly middle: Point;
  readonly isUpright: boolean;
}

/** The longest straight leg of a connector's route: its label names it there. */
function longest_leg(points: readonly Point[]): Leg {
  const legs = points.slice(1).map((b, index) => {
    const a = points[index] ?? b;
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  const longest = legs.reduce((best, next) => (next.length > best.length + 0.5 ? next : best));
  return {
    from: longest.a,
    to: longest.b,
    middle: { x: (longest.a.x + longest.b.x) / 2, y: (longest.a.y + longest.b.y) / 2 },
    isUpright: Math.abs(longest.b.y - longest.a.y) > Math.abs(longest.b.x - longest.a.x),
  };
}

/** A label's place beside `leg`: above a level leg, right of an upright one; flipped, below or left. */
function place_label(text: string, leg: Leg, is_flipped: boolean) {
  const { middle } = leg;
  const anchor_at = leg.isUpright ? (is_flipped ? "end" : "start") : "middle";
  const x = leg.isUpright ? middle.x + (is_flipped ? -1 : 1) * SPACING.label : middle.x;
  // Labels are centred on `y` (dominant-baseline: central), like box text.
  const y = leg.isUpright
    ? middle.y
    : middle.y + (is_flipped ? 1 : -1) * (SPACING.label + LABEL.box / 2);
  const width = labelWidth(text);
  const left =
    anchor_at === "start"
      ? x - LABEL.halo
      : anchor_at === "end"
        ? x + LABEL.halo - width
        : x - width / 2;
  const box = {
    x: left,
    y: y - LABEL.box / 2 - LABEL.halo,
    w: width,
    h: LABEL.box + 2 * LABEL.halo,
  };
  return { text, x, y, anchor: anchor_at, box } as const;
}

/** Whether a straight leg passes through a box. */
function crosses(leg: Leg, box: Rect): boolean {
  const low = { x: Math.min(leg.from.x, leg.to.x), y: Math.min(leg.from.y, leg.to.y) };
  const high = { x: Math.max(leg.from.x, leg.to.x), y: Math.max(leg.from.y, leg.to.y) };
  return low.x <= box.x + box.w && high.x >= box.x && low.y <= box.y + box.h && high.y >= box.y;
}

/**
 * Each connector's ends and its label, placed by the rule on BlueprintEdge's
 * `label`. A label that would cross the other connector of a parallel pair
 * between the same two boxes moves to its own connector's outer side.
 */
function edge_geometries(
  edges: readonly BlueprintEdge[],
  nodes: ReadonlyMap<string, BlueprintNode>,
): { edge: BlueprintEdge; geometry: EdgeGeometry }[] {
  const placed = edges.map((edge) => {
    const { start, end, toSide: to_side } = edge_ends(edge, nodes);
    const points = routePoints(start, edge.fromSide, end, to_side);
    return { edge, start, end, toSide: to_side, points, leg: longest_leg(points) };
  });
  return placed.map(({ edge, start, end, toSide: to_side, points, leg }, index) => {
    if (edge.label === undefined)
      return { edge, geometry: { start, end, toSide: to_side, points } };
    const label = place_label(edge.label, leg, false);
    const is_crossing_pair = placed.some(
      (other, other_index) =>
        other_index !== index &&
        ((other.edge.from === edge.from && other.edge.to === edge.to) ||
          (other.edge.from === edge.to && other.edge.to === edge.from)) &&
        other.leg.isUpright === leg.isUpright &&
        crosses(other.leg, label.box),
    );
    return {
      edge,
      geometry: {
        start,
        end,
        toSide: to_side,
        points,
        label: is_crossing_pair ? place_label(edge.label, leg, true) : label,
      },
    };
  });
}

function Edge(props: Readonly<{ edge: BlueprintEdge; geometry: EdgeGeometry }>) {
  const { start, end, toSide: to_side, label } = props.geometry;
  return (
    <>
      <path
        class="bp-edge"
        d={`${route(start, props.edge.fromSide, end, to_side)}${arrowHead(end, to_side)}`}
        data-kind={props.edge.kind}
      />
      <Show when={label}>
        {(placed) => (
          <text
            class="bp-edge__label"
            data-kind={props.edge.kind}
            dominant-baseline="central"
            text-anchor={placed().anchor}
            x={round(placed().x)}
            y={round(placed().y)}
          >
            {placed().text}
          </text>
        )}
      </Show>
    </>
  );
}

/**
 * The frame a layout draws in: the bounding box of its boxes, connectors and
 * labels, `pad` wider on every side, and for a card widened or heightened
 * about its centre to the card's shape.
 */
function frame_of(layout: BlueprintLayout, geometry: readonly EdgeGeometry[], pad: number): Rect {
  const rects: Rect[] = [
    ...layout.nodes.map((node) => node.rect),
    ...geometry.flatMap(({ points, label }) => [
      ...points.map((point) => ({ x: point.x, y: point.y, w: 0, h: 0 })),
      ...(label === undefined ? [] : [label.box]),
    ]),
  ];
  const left = Math.min(...rects.map((rect) => rect.x)) - pad;
  const top = Math.min(...rects.map((rect) => rect.y)) - pad;
  let w = Math.max(...rects.map((rect) => rect.x + rect.w)) + pad - left;
  let h = Math.max(...rects.map((rect) => rect.y + rect.h)) + pad - top;
  let x = left;
  let y = top;
  if (layout.aspect !== undefined) {
    if (w / h < layout.aspect) {
      x -= (h * layout.aspect - w) / 2;
      w = h * layout.aspect;
    } else {
      y -= (w / layout.aspect - h) / 2;
      h = w / layout.aspect;
    }
  }
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

/**
 * A layout's boxes, moved so its frame starts at the origin, each
 * connector's geometry, and the frame. Nothing is drawn at negative
 * coordinates: Chromium reports SVG text above the origin as taller than its
 * own box, which reads as clipped content.
 */
function place_layout(layout: BlueprintLayout, pad: number) {
  const by_id = (nodes: readonly BlueprintNode[]) => new Map(nodes.map((node) => [node.id, node]));
  const first = frame_of(
    layout,
    edge_geometries(layout.edges, by_id(layout.nodes)).map(({ geometry }) => geometry),
    pad,
  );
  const nodes = layout.nodes.map((node) => ({
    ...node,
    rect: { ...node.rect, x: node.rect.x - first.x, y: node.rect.y - first.y },
  }));
  const edges = edge_geometries(layout.edges, by_id(nodes));
  return {
    nodes,
    edges,
    frame: frame_of(
      { ...layout, nodes },
      edges.map(({ geometry }) => geometry),
      pad,
    ),
  };
}

function Drawing(props: Readonly<{ layout: BlueprintLayout; text: BlueprintText; id: string }>) {
  const { nodes, edges, frame } = place_layout(props.layout, SPACING.frame);
  return (
    <svg
      aria-labelledby={`${props.id}-title ${props.id}-desc`}
      class="sw-art sw-art--diagram sw-blueprint"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      // Never drawn larger than its own units: a wide frame centres it instead.
      style={{ "max-width": `${frame.w}px` }}
      viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
    >
      <title id={`${props.id}-title`}>{props.text.title}</title>
      <desc id={`${props.id}-desc`}>{props.text.description}</desc>
      <For each={nodes}>{(node) => <Node node={node} />}</For>
      {/* Connectors after the boxes, so a label's halo sits over any box edge it meets. */}
      <For each={edges}>{({ edge, geometry }) => <Edge edge={edge} geometry={geometry} />}</For>
    </svg>
  );
}

/**
 * The widest a drawing may be, its frame included, at full size: about the
 * reading column, and a phone's. A wide drawing wider than that would shrink
 * its gaps to fit, so the figure shows its narrow layout, stacked and taller,
 * at every width.
 */
const WIDEST = { wide: 736, narrow: 360 } as const;

/** The width a layout fills: the widest drawing less its frame's padding. */
export const ROOM = {
  wide: WIDEST.wide - 2 * SPACING.frame,
  narrow: WIDEST.narrow - 2 * SPACING.frame,
} as const;

/**
 * A blueprint figure: the wide layout, and the narrow one art.css shows on
 * small screens, each on its dotted canvas, and a note under the canvas.
 */
export function BlueprintDiagram(
  props: Readonly<{
    text: BlueprintText;
    wide: BlueprintLayout;
    narrow: BlueprintLayout;
    /** One sentence under the drawing, in page text, so it wraps at any width. */
    note?: string;
  }>,
): JSX.Element {
  const id = createUniqueId();
  // Half a unit of slack absorbs rounding in layouts that fill the room exactly.
  const fits = place_layout(props.wide, SPACING.frame).frame.w <= WIDEST.wide + 0.5;
  const wide = fits ? props.wide : props.narrow;
  return (
    <div class="sw-art-diagram">
      <div class="sw-art-diagram__canvas sw-art-diagram__wide">
        <Drawing id={`${id}-wide`} layout={wide} text={props.text} />
      </div>
      <div class="sw-art-diagram__canvas sw-art-diagram__narrow">
        <Drawing id={`${id}-narrow`} layout={props.narrow} text={props.text} />
      </div>
      <Show when={props.note}>{(note) => <p class="sw-art-note">{note()}</p>}</Show>
    </div>
  );
}

/** The step of the dotted canvas a card picture draws itself, as the figure canvas's dots. */
const DOT_STEP = 16;

/**
 * A card's blueprint picture: boxes and connectors on the dotted canvas,
 * drawn in the picture, since a card has no figure frame. It is decorative:
 * the card's title and text say what it shows. The dots run past the frame,
 * so a card box of any shape is filled.
 */
export function BlueprintCard(
  props: Readonly<{ layout: BlueprintLayout; class?: string }>,
): JSX.Element {
  const dots = `bp-dots-${createUniqueId()}`;
  const { nodes, edges, frame } = place_layout(props.layout, SPACING.card.frame);
  return (
    <svg
      aria-hidden="true"
      class={`sw-art sw-blueprint sw-blueprint--card${props.class === undefined ? "" : ` ${props.class}`}`}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
    >
      <pattern height={DOT_STEP} id={dots} patternUnits="userSpaceOnUse" width={DOT_STEP}>
        <circle class="bp-dot" cx={1} cy={1} r={1} />
      </pattern>
      <rect
        fill={`url(#${dots})`}
        height={round(frame.h * 5)}
        width={round(frame.w * 5)}
        x={round(frame.x - frame.w * 2)}
        y={round(frame.y - frame.h * 2)}
      />
      <For each={nodes}>{(node) => <Node node={node} />}</For>
      <For each={edges}>{({ edge, geometry }) => <Edge edge={edge} geometry={geometry} />}</For>
    </svg>
  );
}
