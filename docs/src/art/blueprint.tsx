// The blueprint figure kit: boxes on a dotted canvas joined by connectors
// whose ends come from the boxes' geometry, never from typed coordinates.
// A figure is data: its boxes (nodes) and the connectors between them
// (edges), in a wide and a narrow layout; art.css draws the blueprint style.
//
// Connector kinds: `main` is the path a reader follows first, `back` what
// flows back up (events, results, warnings), `fail` a failure exit, and
// `side` a secondary link. Labels sit on a halo in the canvas colour, so they
// stay readable over the dots and the lines.
import { createUniqueId, For, type JSX, Show } from "solid-js";

import { anchor, arrowHead, type BoxSide, opposite, type Rect, route } from "./layout.js";

/** One box: an optional mono eyebrow, a title, caption lines and code lines. */
export interface BlueprintNode {
  readonly id: string;
  readonly rect: Rect;
  readonly eyebrow?: string;
  readonly title: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  /** `accent` marks the box the figure is about; `danger` a failure; `muted` a side result; `lane` a sequence lifeline. */
  readonly tone?: "accent" | "danger" | "muted" | "lane";
}

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
  readonly label?: string;
  /** Where the label sits beside the connector's midpoint. */
  readonly labelSide?: "left" | "right" | "above" | "below";
}

export interface BlueprintLayout {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly BlueprintNode[];
  readonly edges: readonly BlueprintEdge[];
}

/** A figure's accessible name and description, shared by both layouts. */
export interface BlueprintText {
  readonly title: string;
  readonly description: string;
}

/** Line height of a box's caption and code lines, and the eyebrow's. */
const LINE = 16;
/** How far a label sits from the connector it names. */
const LABEL_GAP = 8;

/** The height a node needs for its text: the drawings size boxes with this. */
export function nodeHeight(
  node: Pick<BlueprintNode, "eyebrow" | "title" | "lines" | "code">,
): number {
  // A box without a title (a code-only box) doesn't keep a title line.
  const title = node.title === "" ? 0 : LINE + 2;
  return (
    12 +
    title +
    (node.eyebrow ? LINE : 0) +
    ((node.lines?.length ?? 0) + (node.code?.length ?? 0)) * LINE
  );
}

function Node(props: Readonly<{ node: BlueprintNode }>) {
  const lines = () => {
    let y = props.node.rect.y + 22;
    const placed: { kind: string; text: string; y: number }[] = [];
    if (props.node.eyebrow) {
      placed.push({ kind: "eyebrow", text: props.node.eyebrow, y: y - 2 });
      y += LINE;
    }
    if (props.node.title !== "") {
      placed.push({ kind: "title", text: props.node.title, y });
      y += LINE + 2;
    }
    for (const text of props.node.lines ?? []) {
      placed.push({ kind: "line", text, y });
      y += LINE;
    }
    for (const text of props.node.code ?? []) {
      placed.push({ kind: "code", text, y });
      y += LINE;
    }
    return placed;
  };
  const { x, y, w, h } = props.node.rect;
  return (
    <g class="bp-node" data-tone={props.node.tone ?? "plain"}>
      <rect class="bp-node__box" height={h} rx={6} width={w} x={x} y={y} />
      <rect class="bp-node__edge" height={h - 12} rx={1.5} width={3} x={x} y={y + 6} />
      <For each={lines()}>
        {(line) => (
          <text class={`bp-node__${line.kind}`} x={x + 14} y={line.y}>
            {line.text}
          </text>
        )}
      </For>
    </g>
  );
}

function Edge(props: Readonly<{ edge: BlueprintEdge; nodes: ReadonlyMap<string, BlueprintNode> }>) {
  const from = props.nodes.get(props.edge.from);
  const to = props.nodes.get(props.edge.to);
  if (from === undefined || to === undefined) {
    throw new Error(
      `A connector joins ${props.edge.from} and ${props.edge.to}, which aren't both boxes`,
    );
  }
  const toSide = props.edge.toSide ?? opposite(props.edge.fromSide);
  const start = anchor(from.rect, props.edge.fromSide, props.edge.t ?? 0.5);
  const end = anchor(to.rect, toSide, props.edge.toT ?? props.edge.t ?? 0.5);
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const side = props.edge.labelSide ?? "right";
  const textAnchor: "start" | "middle" | "end" =
    side === "left" ? "end" : side === "right" ? "start" : "middle";
  const label = {
    x: side === "left" ? middle.x - LABEL_GAP : side === "right" ? middle.x + LABEL_GAP : middle.x,
    y:
      side === "above"
        ? middle.y - LABEL_GAP
        : side === "below"
          ? middle.y + LABEL_GAP + 9
          : middle.y + 4,
    anchor: textAnchor,
  };
  return (
    <>
      <path
        class="bp-edge"
        d={`${route(start, props.edge.fromSide, end, toSide)}${arrowHead(end, toSide)}`}
        data-kind={props.edge.kind}
      />
      <Show when={props.edge.label}>
        {(text) => (
          <text
            class="bp-edge__label"
            data-kind={props.edge.kind}
            text-anchor={label.anchor}
            x={label.x}
            y={label.y}
          >
            {text()}
          </text>
        )}
      </Show>
    </>
  );
}

function Drawing(props: Readonly<{ layout: BlueprintLayout; text: BlueprintText; id: string }>) {
  const nodes = new Map(props.layout.nodes.map((node) => [node.id, node]));
  return (
    <svg
      aria-labelledby={`${props.id}-title ${props.id}-desc`}
      class="sw-art sw-art--diagram sw-blueprint"
      role="img"
      viewBox={`0 0 ${props.layout.width} ${props.layout.height}`}
    >
      <title id={`${props.id}-title`}>{props.text.title}</title>
      <desc id={`${props.id}-desc`}>{props.text.description}</desc>
      <For each={props.layout.nodes}>{(node) => <Node node={node} />}</For>
      {/* Connectors after the boxes, so a label's halo sits over any box edge it meets. */}
      <For each={props.layout.edges}>{(edge) => <Edge edge={edge} nodes={nodes} />}</For>
    </svg>
  );
}

/** A blueprint figure: the wide layout, and the narrow one art.css shows on small screens. */
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
  return (
    <div class="sw-art-diagram">
      <div class="sw-art-diagram__wide">
        <Drawing id={`${id}-wide`} layout={props.wide} text={props.text} />
      </div>
      <div class="sw-art-diagram__narrow">
        <Drawing id={`${id}-narrow`} layout={props.narrow} text={props.text} />
      </div>
      <Show when={props.note}>{(note) => <p class="sw-art-note">{note()}</p>}</Show>
    </div>
  );
}
