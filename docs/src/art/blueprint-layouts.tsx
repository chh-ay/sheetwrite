// The two shapes most docs figures take, laid out with the blueprint kit:
// a flow (steps left to right, an optional outcome of one step below) and a
// fan (one source over the things it reaches). Each lays itself out wide and
// narrow from its text, so no figure types coordinates.
import type { JSX } from "solid-js";

import {
  BlueprintDiagram,
  type BlueprintEdge,
  type BlueprintLayout,
  type BlueprintNode,
  type BlueprintText,
  nodeHeight,
} from "./blueprint.js";

/** One box of a flow or fan: a title, caption lines and code lines. */
export interface FigureStep {
  readonly title: string;
  readonly eyebrow?: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  readonly tone?: BlueprintNode["tone"];
  /** In a fan, a tile the source doesn't reach: drawn without a connector, to show what is left out. */
  readonly unreached?: boolean;
}

/** A side outcome of one step: a failure exit or a result that flows back. */
export interface FigureOutcome {
  readonly from: number;
  readonly step: FigureStep;
  readonly kind?: "fail" | "back";
}

const WIDE = 720;
const NARROW = 360;
const MARGIN = 8;
/** The gap between boxes in a row, long enough for an arrow and its head. */
const ROW_GAP = 32;
/** The gap between rows, long enough for an arrow and its label. */
const ROW_SPACE = 40;
/** Narrow outcomes are indented by this much, so the main path runs past them on the left. */
const INDENT = 36;

function box(
  id: string,
  step: FigureStep,
  x: number,
  y: number,
  w: number,
  h?: number,
): BlueprintNode {
  const { unreached: _unreached, ...node } = step;
  return { id, ...node, rect: { x, y, w, h: h ?? nodeHeight(step) } };
}

/** About how wide a box must be for its longest line: mono code is wider per character than the body face. */
function textWidth(step: FigureStep): number {
  const body = Math.max(
    step.title.length * 7,
    ...(step.lines ?? []).map((line) => line.length * 6.2),
  );
  const code = Math.max(0, ...(step.code ?? []).map((line) => line.length * 6.7));
  return Math.max(body, code) + 30;
}

function flowWide(
  steps: readonly FigureStep[],
  outcome: FigureOutcome | undefined,
): BlueprintLayout {
  // Each box gets the width its longest line needs, and the rest of the row is shared evenly.
  const room = WIDE - 2 * MARGIN - (steps.length - 1) * ROW_GAP;
  const needs = steps.map(textWidth);
  const spare = Math.max(0, room - needs.reduce((sum, need) => sum + need, 0)) / steps.length;
  const widths = needs.map((need) => need + spare);
  const scale = Math.min(1, room / widths.reduce((sum, width) => sum + width, 0));
  const h = Math.max(...steps.map(nodeHeight));
  let x = MARGIN;
  const nodes = steps.map((step, index) => {
    const w = (widths[index] ?? 0) * scale;
    const placed = box(`s${index}`, step, x, MARGIN, w, h);
    x += w + ROW_GAP;
    return placed;
  });
  const edges: BlueprintEdge[] = steps.slice(1).map((_, index) => ({
    from: `s${index}`,
    fromSide: "right",
    to: `s${index + 1}`,
    kind: "main",
  }));
  let height = MARGIN + h + MARGIN;
  if (outcome !== undefined) {
    const source = nodes[outcome.from];
    if (source === undefined) throw new Error(`No step ${outcome.from} for the outcome`);
    const below = box("outcome", outcome.step, MARGIN, MARGIN + h + ROW_SPACE, WIDE - 2 * MARGIN);
    nodes.push(below);
    const centre = source.rect.x + source.rect.w / 2;
    edges.push({
      from: source.id,
      fromSide: "bottom",
      to: "outcome",
      toT: (centre - below.rect.x) / below.rect.w,
      kind: outcome.kind ?? "back",
    });
    height = below.rect.y + below.rect.h + MARGIN;
  }
  return { width: WIDE, height, nodes, edges };
}

function flowNarrow(
  steps: readonly FigureStep[],
  outcome: FigureOutcome | undefined,
): BlueprintLayout {
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  let y = MARGIN;
  steps.forEach((step, index) => {
    nodes.push(box(`s${index}`, step, MARGIN, y, NARROW - 2 * MARGIN));
    y += nodeHeight(step) + ROW_SPACE;
    if (outcome?.from === index) {
      // The outcome sits indented under its step; the main path passes it on the left.
      nodes.push(
        box(
          "outcome",
          outcome.step,
          MARGIN + INDENT,
          y - ROW_SPACE / 2 - 4,
          NARROW - 2 * MARGIN - INDENT,
        ),
      );
      y += nodeHeight(outcome.step) + ROW_SPACE / 2;
    }
  });
  const pathT = 12 / (NARROW - 2 * MARGIN);
  steps.slice(1).forEach((_, index) => {
    edges.push({
      from: `s${index}`,
      fromSide: "bottom",
      to: `s${index + 1}`,
      t: outcome === undefined ? 0.5 : pathT,
      kind: "main",
    });
  });
  if (outcome !== undefined) {
    edges.push({
      from: `s${outcome.from}`,
      fromSide: "bottom",
      to: "outcome",
      t: 0.6,
      toT: (0.6 * (NARROW - 2 * MARGIN) - INDENT) / (NARROW - 2 * MARGIN - INDENT),
      kind: outcome.kind ?? "back",
    });
  }
  return { width: NARROW, height: y - ROW_SPACE + MARGIN, nodes, edges };
}

/** A flow: steps joined left to right, and an optional outcome of one step below them. */
export function FlowFigure(
  props: Readonly<{
    text: BlueprintText;
    steps: readonly FigureStep[];
    outcome?: FigureOutcome;
    note?: string;
  }>,
): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={flowNarrow(props.steps, props.outcome)}
      note={props.note}
      text={props.text}
      wide={flowWide(props.steps, props.outcome)}
    />
  );
}

function fanWide(source: FigureStep, tiles: readonly FigureStep[]): BlueprintLayout {
  const top = box("source", source, MARGIN, MARGIN, WIDE - 2 * MARGIN);
  const w = (WIDE - 2 * MARGIN - (tiles.length - 1) * ROW_GAP) / tiles.length;
  const h = Math.max(...tiles.map(nodeHeight));
  const y = top.rect.y + top.rect.h + ROW_SPACE;
  const nodes = tiles.map((tile, index) =>
    box(`t${index}`, tile, MARGIN + index * (w + ROW_GAP), y, w, h),
  );
  return {
    width: WIDE,
    height: y + h + MARGIN,
    nodes: [top, ...nodes],
    edges: nodes
      .filter((_, index) => tiles[index]?.unreached !== true)
      .map((node) => ({
        from: "source",
        fromSide: "bottom" as const,
        t: (node.rect.x + node.rect.w / 2 - top.rect.x) / top.rect.w,
        to: node.id,
        kind: "main" as const,
      })),
  };
}

function fanNarrow(source: FigureStep, tiles: readonly FigureStep[]): BlueprintLayout {
  const top = box("source", source, MARGIN, MARGIN, NARROW - 2 * MARGIN);
  let y = top.rect.y + top.rect.h + ROW_SPACE / 2;
  const nodes = tiles.map((tile, index) => {
    const placed = box(`t${index}`, tile, MARGIN + INDENT, y, NARROW - 2 * MARGIN - INDENT);
    y += placed.rect.h + ROW_SPACE / 2;
    return placed;
  });
  // Each tile is reached from the source's lower-left, down the gutter and across into its left side.
  const spineT = INDENT / 2 / top.rect.w;
  return {
    width: NARROW,
    height: y - ROW_SPACE / 2 + MARGIN,
    nodes: [top, ...nodes],
    edges: nodes
      .filter((_, index) => tiles[index]?.unreached !== true)
      .map((node) => ({
        from: "source",
        fromSide: "bottom" as const,
        t: spineT,
        to: node.id,
        toSide: "left" as const,
        kind: "main" as const,
      })),
  };
}

/** A fan: one source across the top and the things it reaches below it. */
export function FanFigure(
  props: Readonly<{
    text: BlueprintText;
    source: FigureStep;
    tiles: readonly FigureStep[];
    note?: string;
  }>,
): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={fanNarrow(props.source, props.tiles)}
      note={props.note}
      text={props.text}
      wide={fanWide(props.source, props.tiles)}
    />
  );
}

function tilesLayout(
  tiles: readonly FigureStep[],
  width: number,
  columns: number,
): BlueprintLayout {
  const w = (width - 2 * MARGIN - ((columns - 1) * ROW_GAP) / 2) / columns;
  const rows: FigureStep[][] = [];
  tiles.forEach((tile, index) => {
    const row = Math.floor(index / columns);
    (rows[row] ??= []).push(tile);
  });
  const nodes: BlueprintNode[] = [];
  let y = MARGIN;
  rows.forEach((row, rowIndex) => {
    const h = Math.max(...row.map(nodeHeight));
    row.forEach((tile, column) =>
      nodes.push(
        box(`t${rowIndex * columns + column}`, tile, MARGIN + column * (w + ROW_GAP / 2), y, w, h),
      ),
    );
    y += h + ROW_GAP / 2;
  });
  return { width, height: y - ROW_GAP / 2 + MARGIN, nodes, edges: [] };
}

/** Tiles: groups side by side, `columns` across wide and `narrowColumns` on phones, with no connectors. */
export function TileFigure(
  props: Readonly<{
    text: BlueprintText;
    tiles: readonly FigureStep[];
    columns: number;
    narrowColumns?: number;
    note?: string;
  }>,
): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={tilesLayout(props.tiles, NARROW, props.narrowColumns ?? 1)}
      note={props.note}
      text={props.text}
      wide={tilesLayout(props.tiles, WIDE, props.columns)}
    />
  );
}

/** One row of a pairs figure: what goes in, and what comes out. */
export interface FigurePair {
  readonly from: FigureStep;
  readonly to: FigureStep;
}

function pairsWide(pairs: readonly FigurePair[], width: number, share: number): BlueprintLayout {
  const gap = ROW_GAP + 16;
  const left = (width - 2 * MARGIN - gap) * share;
  const right = width - 2 * MARGIN - gap - left;
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  let y = MARGIN;
  pairs.forEach((pair, index) => {
    const h = Math.max(nodeHeight(pair.from), nodeHeight(pair.to));
    nodes.push(box(`a${index}`, pair.from, MARGIN, y, left, h));
    nodes.push(box(`b${index}`, pair.to, MARGIN + left + gap, y, right, h));
    edges.push({ from: `a${index}`, fromSide: "right", to: `b${index}`, kind: "main" });
    y += h + ROW_GAP / 2;
  });
  return { width, height: y - ROW_GAP / 2 + MARGIN, nodes, edges };
}

/** On phones each pair stacks: what goes in, and under it, indented, what comes out. */
function pairsNarrow(pairs: readonly FigurePair[]): BlueprintLayout {
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  const full = NARROW - 2 * MARGIN;
  let y = MARGIN;
  pairs.forEach((pair, index) => {
    const from = box(`a${index}`, pair.from, MARGIN, y, full);
    const to = box(
      `b${index}`,
      pair.to,
      MARGIN + INDENT,
      y + from.rect.h + ROW_GAP / 2,
      full - INDENT,
    );
    nodes.push(from, to);
    edges.push({
      from: from.id,
      fromSide: "bottom",
      t: INDENT / 2 / full,
      to: to.id,
      toSide: "left",
      toT: 0.5,
      kind: "main",
    });
    y = to.rect.y + to.rect.h + ROW_GAP;
  });
  return { width: NARROW, height: y - ROW_GAP + MARGIN, nodes, edges };
}

/** Pairs: what goes in on the left and what comes out on the right, one row each. */
export function PairsFigure(
  props: Readonly<{ text: BlueprintText; pairs: readonly FigurePair[]; note?: string }>,
): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={pairsNarrow(props.pairs)}
      note={props.note}
      text={props.text}
      wide={pairsWide(props.pairs, WIDE, 0.55)}
    />
  );
}

/** One participant of a sequence: a lane with a name at its head. */
export interface SequenceLane {
  readonly id: string;
  readonly name: string;
}

/** One step of a sequence, top to bottom: a message between two lanes, or a note on one lane. */
export type SequenceStep =
  | {
      readonly message: string;
      readonly from: string;
      readonly to: string;
      readonly kind?: BlueprintEdge["kind"];
      /** A message that never arrives ends in a "lost" mark halfway. */
      readonly lost?: boolean;
    }
  | { readonly note: string; readonly lane: string; readonly tone?: BlueprintNode["tone"] };

/** The vertical space one message takes, room for its label above the line. */
const MESSAGE_STEP = 36;
/** A lane's lifeline is a bar this wide: messages start and end on its edges. */
const LIFELINE = 28;

function sequenceLayout(
  lanes: readonly SequenceLane[],
  steps: readonly SequenceStep[],
  width: number,
  noteWidth: number,
): BlueprintLayout {
  const span = (width - 2 * MARGIN - noteWidth) / Math.max(1, lanes.length - 1);
  const centre = new Map(
    lanes.map((lane, index) => [lane.id, MARGIN + noteWidth / 2 + index * span]),
  );
  // Heads stay apart however wide the notes are; notes sit only on the outer lanes.
  const headWidth = Math.min(noteWidth, span - 12);
  const heads = lanes.map((lane) => {
    const x = (centre.get(lane.id) ?? 0) - headWidth / 2;
    return box(`head-${lane.id}`, { title: lane.name }, x, MARGIN, headWidth, 32);
  });
  const top = MARGIN + 32;
  // Each lane is a column of segments: lifeline bars, broken where a note sits.
  const segments = new Map<string, BlueprintNode[]>(lanes.map((lane) => [lane.id, []]));
  const open = new Map<string, number>(lanes.map((lane) => [lane.id, top]));
  const nodes: BlueprintNode[] = [...heads];
  const edges: BlueprintEdge[] = [];
  const closeLane = (lane: string, y: number) => {
    const start = open.get(lane) ?? top;
    if (y - start < 4) return;
    const x = (centre.get(lane) ?? 0) - LIFELINE / 2;
    const bar = box(
      `bar-${lane}-${segments.get(lane)?.length ?? 0}`,
      { title: "" },
      x,
      start,
      LIFELINE,
      y - start,
    );
    segments.get(lane)?.push(bar);
    nodes.push({ ...bar, tone: "lane" });
  };
  let y = top + MESSAGE_STEP;
  const pending: { step: Extract<SequenceStep, { message: string }>; y: number }[] = [];
  steps.forEach((step, index) => {
    if ("note" in step) {
      const h = nodeHeight({ title: step.note });
      closeLane(step.lane, y - 8);
      const x = (centre.get(step.lane) ?? 0) - noteWidth / 2;
      const note = box(
        `note-${index}`,
        { title: step.note, ...(step.tone ? { tone: step.tone } : {}) },
        x,
        y - 8,
        noteWidth,
        h,
      );
      nodes.push(note);
      segments.get(step.lane)?.push(note);
      open.set(step.lane, y - 8 + h);
      y += h + 12;
    } else {
      pending.push({ step, y });
      y += MESSAGE_STEP;
    }
  });
  const bottom = y - MESSAGE_STEP + 16;
  for (const lane of lanes) closeLane(lane.id, bottom);
  const at = (lane: string, level: number) =>
    segments.get(lane)?.find((node) => level >= node.rect.y && level <= node.rect.y + node.rect.h);
  pending.forEach(({ step, y: level }, index) => {
    const from = at(step.from, level);
    const to = at(step.to, level);
    if (from === undefined || to === undefined)
      throw new Error(`No lane under the "${step.message}" message`);
    const rightward = to.rect.x > from.rect.x;
    const fromSide = rightward ? "right" : "left";
    if (step.lost) {
      // The mark sits in the middle of the gap between the two lifelines and names the message.
      const start = rightward ? from.rect.x + from.rect.w : from.rect.x;
      const end = rightward ? to.rect.x : to.rect.x + to.rect.w;
      const mid = (start + end) / 2;
      const markWidth = Math.min(84, Math.abs(end - start) - 24);
      const mark = box(
        `lost-${index}`,
        { title: `${step.message} lost` },
        mid - markWidth / 2,
        level - 12,
        markWidth,
        24,
      );
      nodes.push({ ...mark, tone: "danger" });
      edges.push({
        from: from.id,
        fromSide,
        t: (level - from.rect.y) / from.rect.h,
        to: mark.id,
        toT: 0.5,
        kind: "fail",
      });
      return;
    }
    edges.push({
      from: from.id,
      fromSide,
      t: (level - from.rect.y) / from.rect.h,
      to: to.id,
      toT: (level - to.rect.y) / to.rect.h,
      kind: step.kind ?? "main",
      label: step.message,
      labelSide: "above",
    });
  });
  return { width, height: bottom + MARGIN, nodes, edges };
}

/** A sequence: lanes side by side, messages between them top to bottom, and notes on a lane. */
export function SequenceFigure(
  props: Readonly<{
    text: BlueprintText;
    lanes: readonly SequenceLane[];
    steps: readonly SequenceStep[];
    note?: string;
  }>,
): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={sequenceLayout(props.lanes, props.steps, NARROW, 124)}
      note={props.note}
      text={props.text}
      wide={sequenceLayout(props.lanes, props.steps, WIDE, 168)}
    />
  );
}

/** Between two neighbouring boxes of an exchange: what goes forward, and what comes back. */
export interface FigureLink {
  readonly forward: string;
  readonly back?: string;
}

function exchangeWide(steps: readonly FigureStep[], links: readonly FigureLink[]): BlueprintLayout {
  // The gaps hold the labels, so they share the width with the boxes.
  const gap = 120;
  const w = (WIDE - 2 * MARGIN - (steps.length - 1) * gap) / steps.length;
  const h = Math.max(...steps.map(nodeHeight), 72);
  const nodes = steps.map((step, index) =>
    box(`s${index}`, step, MARGIN + index * (w + gap), MARGIN, w, h),
  );
  const edges: BlueprintEdge[] = links.flatMap((link, index) => [
    {
      from: `s${index}`,
      fromSide: "right" as const,
      to: `s${index + 1}`,
      t: link.back ? 0.3 : 0.5,
      kind: "main" as const,
      label: link.forward,
      labelSide: "above" as const,
    },
    ...(link.back
      ? [
          {
            from: `s${index + 1}`,
            fromSide: "left" as const,
            to: `s${index}`,
            t: 0.7,
            kind: "back" as const,
            label: link.back,
            labelSide: "below" as const,
          },
        ]
      : []),
  ]);
  return { width: WIDE, height: MARGIN + h + MARGIN, nodes, edges };
}

function exchangeNarrow(
  steps: readonly FigureStep[],
  links: readonly FigureLink[],
): BlueprintLayout {
  const nodes: BlueprintNode[] = [];
  let y = MARGIN;
  steps.forEach((step, index) => {
    const placed = box(`s${index}`, step, MARGIN, y, NARROW - 2 * MARGIN);
    nodes.push(placed);
    y += placed.rect.h + 64;
  });
  const edges: BlueprintEdge[] = links.flatMap((link, index) => [
    {
      from: `s${index}`,
      fromSide: "bottom" as const,
      to: `s${index + 1}`,
      t: 0.25,
      kind: "main" as const,
      label: link.forward,
      labelSide: "right" as const,
    },
    ...(link.back
      ? [
          {
            from: `s${index + 1}`,
            fromSide: "top" as const,
            to: `s${index}`,
            t: 0.7,
            kind: "back" as const,
            label: link.back,
            labelSide: "right" as const,
          },
        ]
      : []),
  ]);
  return { width: NARROW, height: y - 64 + MARGIN, nodes, edges };
}

/** An exchange: boxes in a row, with what each passes to the next and what comes back. */
export function ExchangeFigure(
  props: Readonly<{
    text: BlueprintText;
    steps: readonly FigureStep[];
    links: readonly FigureLink[];
    note?: string;
  }>,
): JSX.Element {
  if (props.links.length !== props.steps.length - 1) {
    throw new Error("An exchange needs one link between each pair of neighbouring boxes");
  }
  return (
    <BlueprintDiagram
      narrow={exchangeNarrow(props.steps, props.links)}
      note={props.note}
      text={props.text}
      wide={exchangeWide(props.steps, props.links)}
    />
  );
}

/** The fraction along `target`'s side that lines up with the middle of `source`, on the given axis. */
function facing(target: BlueprintNode, source: BlueprintNode, axis: "x" | "y"): number {
  const middle =
    axis === "x" ? source.rect.x + source.rect.w / 2 : source.rect.y + source.rect.h / 2;
  const start = axis === "x" ? target.rect.x : target.rect.y;
  const length = axis === "x" ? target.rect.w : target.rect.h;
  return Math.min(0.85, Math.max(0.15, (middle - start) / length));
}

function mergeWide(sources: readonly FigureStep[], steps: readonly FigureStep[]): BlueprintLayout {
  const columns = steps.length + 1;
  const gap = ROW_GAP + 24;
  const w = (WIDE - 2 * MARGIN - (columns - 1) * gap) / columns;
  const h = Math.max(...sources.map(nodeHeight));
  const left: BlueprintNode[] = sources.map((source, index) =>
    box(`in${index}`, source, MARGIN, MARGIN + index * (h + ROW_GAP / 2), w, h),
  );
  const height = sources.length * h + (sources.length - 1) * (ROW_GAP / 2);
  const stepHeight = Math.max(...steps.map(nodeHeight));
  const y = MARGIN + (height - stepHeight) / 2;
  const right = steps.map((step, index) =>
    box(`s${index}`, step, MARGIN + (index + 1) * (w + gap), y, w, stepHeight),
  );
  const first = right[0];
  if (first === undefined) throw new Error("A merge needs at least one step after its sources");
  return {
    width: WIDE,
    height: MARGIN + Math.max(height, stepHeight) + MARGIN,
    nodes: [...left, ...right],
    edges: [
      ...left.map((source) => ({
        from: source.id,
        fromSide: "right" as const,
        to: first.id,
        toSide: "left" as const,
        toT: facing(first, source, "y"),
        kind: "main" as const,
      })),
      ...right.slice(1).map((step, index) => ({
        from: `s${index}`,
        fromSide: "right" as const,
        to: step.id,
        kind: "main" as const,
      })),
    ],
  };
}

function mergeNarrow(
  sources: readonly FigureStep[],
  steps: readonly FigureStep[],
): BlueprintLayout {
  // Two sources sit side by side; more stack, each on its own row.
  const across = sources.length === 2 ? 2 : 1;
  // Stacked sources are indented, so their connectors can drop down on the left.
  const inset = across === 1 ? INDENT : 0;
  const w = (NARROW - 2 * MARGIN - inset - (across - 1) * (ROW_GAP / 2)) / across;
  const h = Math.max(...sources.map((source) => nodeHeight(source)));
  const nodes: BlueprintNode[] = sources.map((source, index) =>
    box(
      `in${index}`,
      source,
      MARGIN + inset + (index % across) * (w + ROW_GAP / 2),
      MARGIN + Math.floor(index / across) * (h + ROW_GAP / 2),
      w,
      h,
    ),
  );
  const rows = Math.ceil(sources.length / across);
  let y = MARGIN + rows * h + (rows - 1) * (ROW_GAP / 2) + ROW_SPACE;
  const right = steps.map((step, index) => {
    const placed = box(`s${index}`, step, MARGIN, y, NARROW - 2 * MARGIN);
    y += placed.rect.h + ROW_SPACE;
    return placed;
  });
  const first = right[0];
  if (first === undefined) throw new Error("A merge needs at least one step after its sources");
  // Stacked sources drop down on their left, the upper ones farther out, so no two cross.
  const sourceEdges: BlueprintEdge[] =
    across === 2
      ? nodes.map((source) => ({
          from: source.id,
          fromSide: "bottom",
          to: first.id,
          toSide: "top",
          toT: facing(first, source, "x"),
          kind: "main",
        }))
      : nodes.map((source, index) => ({
          from: source.id,
          fromSide: "left",
          to: first.id,
          toSide: "top",
          toT: (8 + index * ((INDENT - 16) / Math.max(1, nodes.length - 1))) / first.rect.w,
          kind: "main",
        }));
  return {
    width: NARROW,
    height: y - ROW_SPACE + MARGIN,
    nodes: [...nodes, ...right],
    edges: [
      ...sourceEdges,
      ...right.slice(1).map((step, index) => ({
        from: `s${index}`,
        fromSide: "bottom" as const,
        to: step.id,
        kind: "main" as const,
      })),
    ],
  };
}

/** A merge: several sources that feed one step, then a short flow on from it. */
export function MergeFigure(
  props: Readonly<{
    text: BlueprintText;
    sources: readonly FigureStep[];
    steps: readonly FigureStep[];
    note?: string;
  }>,
): JSX.Element {
  return (
    <BlueprintDiagram
      narrow={mergeNarrow(props.sources, props.steps)}
      note={props.note}
      text={props.text}
      wide={mergeWide(props.sources, props.steps)}
    />
  );
}
