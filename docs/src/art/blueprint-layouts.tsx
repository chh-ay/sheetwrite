// The shapes most docs figures take, laid out with the blueprint kit: a flow
// (steps left to right, an optional outcome of one step below), a fan (one
// source over the things it reaches), tiles, pairs, a sequence, an exchange
// and a merge. Each lays itself out wide and narrow from its text, so no
// figure types coordinates; the kit fits each drawing into its frame.
import type { JSX } from "solid-js";

import {
  BlueprintDiagram,
  type BlueprintEdge,
  type BlueprintLayout,
  type BlueprintNode,
  type BlueprintText,
  labelWidth,
  linkGap,
  nodeHeight,
  nodeWidth,
  ROOM,
  SPACING,
} from "./blueprint.js";

/** One box of a flow or fan: a title, caption lines and code lines. */
export interface FigureStep {
  readonly title: string;
  readonly eyebrow?: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  readonly tone?: BlueprintNode["tone"];
  readonly sheet?: BlueprintNode["sheet"];
  /** In a fan, a tile the source doesn't reach: drawn without a connector, to show what is left out. */
  readonly unreached?: boolean;
}

/** A side outcome of one step: a failure exit or a result that flows back. */
export interface FigureOutcome {
  readonly from: number;
  readonly step: FigureStep;
  readonly kind?: "fail" | "back";
}

const WIDE = ROOM.wide;
const NARROW = ROOM.narrow;
const ROW_GAP = SPACING.link;
const ROW_SPACE = SPACING.row;
/** Where connectors fan into one box, the gap also holds the bends. */
const FAN_GAP = SPACING.link + SPACING.tile;
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

function flowWide(
  steps: readonly FigureStep[],
  outcome: FigureOutcome | undefined,
): BlueprintLayout {
  // One row when the steps fit at the width their text needs: equal boxes
  // when the widest fits its share, else each box its need and an equal
  // share of the rest. A longer flow wraps: equal boxes, as many to a row as
  // fit, the rows balanced, each row's last step joined down to the next
  // row's first. A flow with an outcome keeps one row; when that row is too
  // wide, the kit shows the stacked layout instead.
  const needs = steps.map(nodeWidth);
  const widest = Math.max(...needs);
  const gaps = (steps.length - 1) * ROW_GAP;
  const total = needs.reduce((sum, need) => sum + need, 0) + gaps;
  const fit = Math.max(1, Math.floor((WIDE + ROW_GAP) / (widest + ROW_GAP)));
  const rows = outcome !== undefined || total <= WIDE ? 1 : Math.ceil(steps.length / fit);
  const across = Math.ceil(steps.length / rows);
  const share = (WIDE - (across - 1) * ROW_GAP) / across;
  const spare = Math.max(0, WIDE - total) / steps.length;
  const widths =
    rows === 1 && widest > share
      ? needs.map((need) => need + spare)
      : needs.map(() => Math.max(widest, share));
  const h = Math.max(...steps.map((step) => nodeHeight(step)));
  let x = 0;
  const nodes = steps.map((step, index) => {
    if (index % across === 0) x = 0;
    const w = widths[index] ?? widest;
    const placed = box(`s${index}`, step, x, Math.floor(index / across) * (h + ROW_SPACE), w, h);
    x += w + ROW_GAP;
    return placed;
  });
  const edges: BlueprintEdge[] = steps.slice(1).map((_, index) =>
    (index + 1) % across === 0
      ? {
          from: `s${index}`,
          fromSide: "bottom",
          toSide: "top",
          to: `s${index + 1}`,
          kind: "main",
        }
      : { from: `s${index}`, fromSide: "right", to: `s${index + 1}`, kind: "main" },
  );
  // An outcome keeps the flow on one row, so the row spans every step.
  const rowWidth = widths.reduce((sum, w) => sum + w, 0) + gaps;
  if (outcome !== undefined) {
    const source = nodes[outcome.from];
    if (source === undefined) throw new Error(`No step ${outcome.from} for the outcome`);
    const below = box("outcome", outcome.step, 0, h + ROW_SPACE, rowWidth);
    nodes.push(below);
    const centre = source.rect.x + source.rect.w / 2;
    edges.push({
      from: source.id,
      fromSide: "bottom",
      to: "outcome",
      toT: (centre - below.rect.x) / below.rect.w,
      kind: outcome.kind ?? "back",
    });
  }
  return { nodes, edges };
}

/**
 * How wide a stacked layout is: a phone's room, or wider when a box's text
 * needs it, indented boxes with their indent; a wider drawing scales down to
 * fit a phone instead of letting text cross its box.
 */
function stackWidth(full: readonly FigureStep[], indented: readonly FigureStep[] = []): number {
  return Math.max(
    NARROW,
    ...full.map(nodeWidth),
    ...indented.map((step) => nodeWidth(step) + INDENT),
  );
}

function flowNarrow(
  steps: readonly FigureStep[],
  outcome: FigureOutcome | undefined,
): BlueprintLayout {
  const width = stackWidth(steps, outcome === undefined ? [] : [outcome.step]);
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  let y = 0;
  steps.forEach((step, index) => {
    nodes.push(box(`s${index}`, step, 0, y, width));
    y += nodeHeight(step) + ROW_SPACE;
    if (outcome?.from === index) {
      // The outcome sits indented under its step; the main path passes it on the left.
      nodes.push(box("outcome", outcome.step, INDENT, y - ROW_SPACE / 2 - 4, width - INDENT));
      y += nodeHeight(outcome.step) + ROW_SPACE / 2;
    }
  });
  const pathT = 12 / width;
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
      toT: (0.6 * width - INDENT) / (width - INDENT),
      kind: outcome.kind ?? "back",
    });
  }
  return { nodes, edges };
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
  // Tiles share the row equally, a tile's gap apart, each at least as wide as
  // the widest tile's text. When they don't fit in a row, they stack in a
  // column beside the source, centred on it, every arrow branching from one
  // trunk out of the source's middle.
  const need = Math.max(...tiles.map(nodeWidth));
  const gap = SPACING.tile;
  const reached = (index: number) => tiles[index]?.unreached !== true;
  if (tiles.length * (need + gap) - gap > WIDE) {
    let y = 0;
    const column = tiles.map((tile, index) => {
      const placed = box(`t${index}`, tile, nodeWidth(source) + FAN_GAP, y, need);
      y += placed.rect.h + gap;
      return placed;
    });
    const height = y - gap;
    const side = box("source", source, 0, 0, nodeWidth(source));
    const centred = { ...side, rect: { ...side.rect, y: (height - side.rect.h) / 2 } };
    return {
      nodes: [centred, ...column],
      edges: column
        .filter((_, index) => reached(index))
        .map((node) => ({
          from: "source",
          fromSide: "right" as const,
          to: node.id,
          toT: 0.5,
          kind: "main" as const,
        })),
    };
  }
  const w = Math.max(need, (WIDE - (tiles.length - 1) * gap) / tiles.length);
  const top = box("source", source, 0, 0, tiles.length * (w + gap) - gap);
  const h = Math.max(...tiles.map((tile) => nodeHeight(tile)));
  const y = top.rect.y + top.rect.h + ROW_SPACE;
  const nodes = tiles.map((tile, index) => box(`t${index}`, tile, index * (w + gap), y, w, h));
  return {
    nodes: [top, ...nodes],
    edges: nodes
      .filter((_, index) => reached(index))
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
  const width = stackWidth([source], tiles);
  const top = box("source", source, 0, 0, width);
  let y = top.rect.y + top.rect.h + SPACING.tile;
  const nodes = tiles.map((tile, index) => {
    const placed = box(`t${index}`, tile, INDENT, y, width - INDENT);
    y += placed.rect.h + SPACING.tile;
    return placed;
  });
  // Each tile is reached from the source's lower-left, down the gutter and across into its left side.
  const spineT = INDENT / 2 / top.rect.w;
  return {
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

function tilesLayout(tiles: readonly FigureStep[], width: number, wanted: number): BlueprintLayout {
  const gap = SPACING.tile;
  const room = width;
  // Fewer columns when the widest tile's text doesn't fit its share of the row.
  const need = Math.max(...tiles.map(nodeWidth));
  const columns = Math.max(1, Math.min(wanted, Math.floor((room + gap) / (need + gap))));
  const w = Math.max(need, (room - (columns - 1) * gap) / columns);
  const rows: FigureStep[][] = [];
  tiles.forEach((tile, index) => {
    const row = Math.floor(index / columns);
    (rows[row] ??= []).push(tile);
  });
  const nodes: BlueprintNode[] = [];
  let y = 0;
  rows.forEach((row, rowIndex) => {
    const h = Math.max(...row.map((tile) => nodeHeight(tile)));
    row.forEach((tile, column) =>
      nodes.push(box(`t${rowIndex * columns + column}`, tile, column * (w + gap), y, w, h)),
    );
    y += h + gap;
  });
  return { nodes, edges: [] };
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
  const gap = ROW_GAP;
  // Each side takes its share of the row, moved so both sides hold their
  // widest text; when both can't, the row grows and the kit stacks the figure.
  const room = width - gap;
  const leftNeed = Math.max(...pairs.map((pair) => nodeWidth(pair.from)));
  const rightNeed = Math.max(...pairs.map((pair) => nodeWidth(pair.to)));
  const left = Math.max(leftNeed, Math.min(room * share, room - rightNeed));
  const right = Math.max(rightNeed, room - left);
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  let y = 0;
  pairs.forEach((pair, index) => {
    const h = Math.max(nodeHeight(pair.from), nodeHeight(pair.to));
    nodes.push(box(`a${index}`, pair.from, 0, y, left, h));
    nodes.push(box(`b${index}`, pair.to, left + gap, y, right, h));
    edges.push({ from: `a${index}`, fromSide: "right", to: `b${index}`, kind: "main" });
    y += h + SPACING.tile;
  });
  return { nodes, edges };
}

/** On phones each pair stacks: what goes in, and under it, indented, what comes out. */
function pairsNarrow(pairs: readonly FigurePair[]): BlueprintLayout {
  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  const full = stackWidth(
    pairs.map((pair) => pair.from),
    pairs.map((pair) => pair.to),
  );
  let y = 0;
  pairs.forEach((pair, index) => {
    const from = box(`a${index}`, pair.from, 0, y, full);
    const to = box(`b${index}`, pair.to, INDENT, y + from.rect.h + SPACING.tile, full - INDENT);
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
  return { nodes, edges };
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

/** The vertical space one message takes: room for its label above the line, or a lost mark on it. */
const MESSAGE_STEP = 60;
/** A lane's lifeline is a bar this wide: messages start and end on its edges. */
const LIFELINE = 28;
/** From a note's bottom to the next message's line: the label above that line clears the note. */
const AFTER_NOTE = 32;

function sequenceLayout(
  lanes: readonly SequenceLane[],
  steps: readonly SequenceStep[],
  width: number,
  leastNoteWidth: number,
): BlueprintLayout {
  const messages = steps.filter((step) => "message" in step);
  const headWidth = Math.max(...lanes.map((lane) => nodeWidth({ title: lane.name })));
  const noteWidth = Math.max(
    leastNoteWidth,
    headWidth,
    ...steps.map((step) => ("note" in step ? nodeWidth({ title: step.note }) : 0)),
  );
  // Lanes far enough apart for the heads, and for each message's label or lost mark between two lifelines.
  const between = Math.max(
    ...messages.map((step) =>
      step.lost ? nodeWidth({ title: `${step.message} lost` }) : labelWidth(step.message),
    ),
  );
  const span = Math.max(
    (width - noteWidth) / Math.max(1, lanes.length - 1),
    headWidth + SPACING.tile,
    between + LIFELINE + 2 * SPACING.tile,
  );
  const centre = new Map(lanes.map((lane, index) => [lane.id, noteWidth / 2 + index * span]));
  const headHeight = Math.max(...lanes.map((lane) => nodeHeight({ title: lane.name })));
  const heads = lanes.map((lane) => {
    const x = (centre.get(lane.id) ?? 0) - headWidth / 2;
    return box(`head-${lane.id}`, { title: lane.name }, x, 0, headWidth, headHeight);
  });
  const top = headHeight;
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
      y += h + AFTER_NOTE;
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
      const title = `${step.message} lost`;
      const markWidth = Math.min(nodeWidth({ title }), Math.abs(end - start) - 2 * SPACING.tile);
      const markHeight = nodeHeight({ title });
      const mark = box(
        `lost-${index}`,
        { title },
        mid - markWidth / 2,
        level - markHeight / 2,
        markWidth,
        markHeight,
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
    });
  });
  return { nodes, edges };
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
  // Each gap holds its labels above and below the connectors.
  const gap = linkGap(
    links.flatMap((link) => (link.back ? [link.forward, link.back] : [link.forward])),
  );
  const w = Math.max((WIDE - (steps.length - 1) * gap) / steps.length, ...steps.map(nodeWidth));
  // Tall enough that a pair of connectors, at 0.3 and 0.7 of the side, keep their arrowheads apart.
  const h = Math.max(...steps.map((step) => nodeHeight(step)), 72);
  const nodes = steps.map((step, index) => box(`s${index}`, step, index * (w + gap), 0, w, h));
  const edges: BlueprintEdge[] = links.flatMap((link, index) => [
    {
      from: `s${index}`,
      fromSide: "right" as const,
      to: `s${index + 1}`,
      t: link.back ? 0.3 : 0.5,
      kind: "main" as const,
      label: link.forward,
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
          },
        ]
      : []),
  ]);
  return { nodes, edges };
}

function exchangeNarrow(
  steps: readonly FigureStep[],
  links: readonly FigureLink[],
): BlueprintLayout {
  // Each label sits beside its connector, at 0.4 and 0.6 of the box's width, inside the box's span.
  const widestLabel = Math.max(
    0,
    ...links.flatMap((link) => [link.forward, link.back ?? ""]).map(labelWidth),
  );
  const width = Math.max(stackWidth(steps), (SPACING.label + widestLabel) / 0.4);
  const nodes: BlueprintNode[] = [];
  let y = 0;
  steps.forEach((step, index) => {
    const placed = box(`s${index}`, step, 0, y, width);
    nodes.push(placed);
    y += placed.rect.h + ROW_SPACE;
  });
  const edges: BlueprintEdge[] = links.flatMap((link, index) => [
    {
      from: `s${index}`,
      fromSide: "bottom" as const,
      to: `s${index + 1}`,
      t: link.back ? 0.4 : 0.5,
      kind: "main" as const,
      label: link.forward,
    },
    ...(link.back
      ? [
          {
            from: `s${index + 1}`,
            fromSide: "top" as const,
            to: `s${index}`,
            t: 0.6,
            kind: "back" as const,
            label: link.back,
          },
        ]
      : []),
  ]);
  return { nodes, edges };
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
  const gap = FAN_GAP;
  const w = Math.max(
    (WIDE - (columns - 1) * gap) / columns,
    ...[...sources, ...steps].map(nodeWidth),
  );
  const h = Math.max(...sources.map((source) => nodeHeight(source)));
  const left: BlueprintNode[] = sources.map((source, index) =>
    box(`in${index}`, source, 0, index * (h + SPACING.tile), w, h),
  );
  const height = sources.length * h + (sources.length - 1) * SPACING.tile;
  const stepHeight = Math.max(...steps.map((step) => nodeHeight(step)));
  const y = (height - stepHeight) / 2;
  const right = steps.map((step, index) =>
    box(`s${index}`, step, (index + 1) * (w + gap), y, w, stepHeight),
  );
  const first = right[0];
  if (first === undefined) throw new Error("A merge needs at least one step after its sources");
  return {
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
  // Two sources sit side by side when both fit; otherwise they stack, each on its own row.
  const need = Math.max(...sources.map(nodeWidth));
  const across = sources.length === 2 && 2 * need + SPACING.tile <= NARROW ? 2 : 1;
  // Stacked sources are indented, so their connectors can drop down on the left.
  const inset = across === 1 ? INDENT : 0;
  const width = Math.max(stackWidth(steps), inset + across * need + (across - 1) * SPACING.tile);
  const w = (width - inset - (across - 1) * SPACING.tile) / across;
  const h = Math.max(...sources.map((source) => nodeHeight(source)));
  const nodes: BlueprintNode[] = sources.map((source, index) =>
    box(
      `in${index}`,
      source,
      inset + (index % across) * (w + SPACING.tile),
      Math.floor(index / across) * (h + SPACING.tile),
      w,
      h,
    ),
  );
  const rows = Math.ceil(sources.length / across);
  let y = rows * h + (rows - 1) * SPACING.tile + ROW_SPACE;
  const right = steps.map((step, index) => {
    const placed = box(`s${index}`, step, 0, y, width);
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
