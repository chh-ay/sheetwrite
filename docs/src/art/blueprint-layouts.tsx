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
  return { id, ...step, rect: { x, y, w, h: h ?? nodeHeight(step) } };
}

function flowWide(
  steps: readonly FigureStep[],
  outcome: FigureOutcome | undefined,
): BlueprintLayout {
  const w = (WIDE - 2 * MARGIN - (steps.length - 1) * ROW_GAP) / steps.length;
  const h = Math.max(...steps.map(nodeHeight));
  const nodes = steps.map((step, index) =>
    box(`s${index}`, step, MARGIN + index * (w + ROW_GAP), MARGIN, w, h),
  );
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
    edges: nodes.map((node) => ({
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
    edges: nodes.map((node) => ({
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
