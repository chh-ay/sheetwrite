// The shared parts of the labelled diagrams: boxes, arrows, and the wide and
// narrow layouts every diagram ships (art.css shows one).
import { For, type JSX } from "solid-js";

import { type ArtAlt, type ArtHue, DiagramArt, head } from "./Art.js";

/** Default wide and narrow canvas widths, in diagram units. */
export const WIDE = 820;
export const NARROW = 360;

/** A labelled box: a heading, caption lines, then code lines in mono. */
export function Box(
  props: Readonly<{
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    lines?: readonly string[];
    code?: readonly string[];
    class?: string;
  }>,
) {
  const captions = () => props.lines ?? [];
  // Tall enough for every line it carries, whatever height the layout asked for.
  const height = () => Math.max(props.h, 34 + (captions().length + (props.code?.length ?? 0)) * 16);
  return (
    <>
      <rect
        class="shade"
        height={height()}
        rx={8}
        width={props.w}
        x={props.x + 2}
        y={props.y + 3}
      />
      <rect
        class={props.class ?? "panel"}
        height={height()}
        rx={8}
        width={props.w}
        x={props.x}
        y={props.y}
      />
      <text class="heading" x={props.x + 12} y={props.y + 22}>
        {props.title}
      </text>
      <For each={captions()}>
        {(line, index) => (
          <text class="caption" x={props.x + 12} y={props.y + 41 + index() * 16}>
            {line}
          </text>
        )}
      </For>
      <For each={props.code ?? []}>
        {(line, index) => (
          <text
            class="small"
            x={props.x + 12}
            y={props.y + 41 + (captions().length + index()) * 16}
          >
            {line}
          </text>
        )}
      </For>
    </>
  );
}

/** A straight arrow, with an optional caption above it (or below, with `below`). */
export function Arrow(
  props: Readonly<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    class?: string;
    label?: string;
    below?: boolean;
  }>,
) {
  const angle = () => (Math.atan2(props.y2 - props.y1, props.x2 - props.x1) * 180) / Math.PI;
  return (
    <>
      <path
        class={props.class ?? "ink-line"}
        d={`M${props.x1} ${props.y1}L${props.x2} ${props.y2}${head(props.x2, props.y2, angle())}`}
      />
      {props.label && (
        <text
          class="caption"
          text-anchor="middle"
          x={(props.x1 + props.x2) / 2}
          y={(props.y1 + props.y2) / 2 + (props.below ? 16 : -7)}
        >
          {props.label}
        </text>
      )}
    </>
  );
}

/** One diagram's shared text and colours; the drawing differs per layout. */
export interface DiagramText {
  readonly hue: ArtHue;
  readonly alt: ArtAlt;
  readonly title: string;
  readonly description: string;
}

/** Both layouts of a diagram; art.css shows the narrow one on small screens. */
export function Responsive(
  props: Readonly<{
    text: DiagramText;
    wide: { height: number; width?: number; draw: () => JSX.Element };
    narrow: { height: number; draw: () => JSX.Element };
  }>,
) {
  return (
    <div class="sw-art-diagram">
      <div class="sw-art-diagram__wide">
        <DiagramArt {...props.text} height={props.wide.height} width={props.wide.width ?? WIDE}>
          {props.wide.draw()}
        </DiagramArt>
      </div>
      <div class="sw-art-diagram__narrow">
        <DiagramArt {...props.text} height={props.narrow.height} width={NARROW}>
          {props.narrow.draw()}
        </DiagramArt>
      </div>
    </div>
  );
}
