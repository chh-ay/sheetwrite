// The shared frame and shapes of the showcase illustrations (art.css): the
// hub cards' decorative pictures and the labelled in-page diagrams.
import { createUniqueId, type JSX, Show } from "solid-js";

/** A site hue an illustration can lead with; art.css maps each to a token. */
export type ArtHue =
  | "green"
  | "blue"
  | "violet"
  | "amber"
  | "teal"
  | "pink"
  | "red"
  | "react"
  | "vue"
  | "svelte";

/** The second hue: any palette hue except the framework colours. */
export type ArtAlt = Exclude<ArtHue, "react" | "vue" | "svelte">;

/** Card canvas width; capability cards are 8:5 and framework cards 2:1. */
export const CARD_WIDTH = 320;
export const CARD_HEIGHT = 200;
export const FRAMEWORK_CARD_HEIGHT = 160;
/** The background cell grid's step, in canvas units. */
const GRID_STEP = 20;

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * A hub card's decorative illustration. The picture keeps its proportions and
 * sits centred in its box; the cell grid behind it runs past the canvas, so a
 * box of any shape is filled.
 */
export function CardArt(
  props: Readonly<{ hue: ArtHue; alt?: ArtAlt; height?: number; children: JSX.Element }>,
) {
  const grid = `sw-art-grid-${createUniqueId()}`;
  const height = () => props.height ?? CARD_HEIGHT;
  return (
    <svg
      aria-hidden="true"
      class="sw-art"
      data-alt={props.alt}
      data-hue={props.hue}
      focusable="false"
      viewBox={`0 0 ${CARD_WIDTH} ${height()}`}
    >
      <pattern height={GRID_STEP} id={grid} patternUnits="userSpaceOnUse" width={GRID_STEP}>
        <path class="grid" d={`M${GRID_STEP} 0V${GRID_STEP}H0`} />
      </pattern>
      <rect
        fill={`url(#${grid})`}
        height={height() * 5}
        width={CARD_WIDTH * 5}
        x={-CARD_WIDTH * 2}
        y={-height() * 2}
      />
      {props.children}
    </svg>
  );
}

/** A meaningful diagram: an image with a title and a description for assistive technology. */
export function DiagramArt(
  props: Readonly<{
    hue: ArtHue;
    alt?: ArtAlt;
    width: number;
    height: number;
    title: string;
    description: string;
    children: JSX.Element;
  }>,
) {
  const id = createUniqueId();
  return (
    <svg
      aria-labelledby={`${id}-title ${id}-desc`}
      class="sw-art sw-art--diagram"
      data-alt={props.alt}
      data-hue={props.hue}
      role="img"
      viewBox={`0 0 ${props.width} ${props.height}`}
    >
      <title id={`${id}-title`}>{props.title}</title>
      <desc id={`${id}-desc`}>{props.description}</desc>
      {props.children}
    </svg>
  );
}

/** An arrowhead ending at (x, y), pointing along `angle` degrees (0 is right, 90 is down). */
export function head(x: number, y: number, angle: number): string {
  const radians = (angle * Math.PI) / 180;
  const point = (spread: number) =>
    `${round(x - 6 * Math.cos(radians + spread))} ${round(y - 6 * Math.sin(radians + spread))}`;
  return `M${point(0.5)}L${x} ${y}L${point(-0.5)}`;
}

/** A raised rounded panel: the offset shade, then the surface. */
export function Panel(
  props: Readonly<{ x: number; y: number; w: number; h: number; class?: string; r?: number }>,
) {
  return (
    <>
      <rect
        class="shade"
        height={props.h}
        rx={props.r ?? 6}
        width={props.w}
        x={props.x + 2}
        y={props.y + 3}
      />
      <rect
        class={props.class ?? "panel"}
        height={props.h}
        rx={props.r ?? 6}
        width={props.w}
        x={props.x}
        y={props.y}
      />
    </>
  );
}

/**
 * A small sheet: an outlined block of `cols` × `rows` cells, with an optional
 * header row. `fill` draws under the cell lines (selections, spills, tints).
 */
export function Sheet(
  props: Readonly<{
    x: number;
    y: number;
    cols: number;
    rows: number;
    cw: number;
    ch: number;
    head?: number;
    headClass?: string;
    fill?: JSX.Element;
  }>,
) {
  const head = () => props.head ?? 0;
  const width = () => props.cols * props.cw;
  const height = () => head() + props.rows * props.ch;
  const lines = () => {
    let d = "";
    for (let col = 1; col < props.cols; col++) {
      d += `M${props.x + col * props.cw} ${props.y}v${height()}`;
    }
    for (let row = head() > 0 ? 0 : 1; row < props.rows; row++) {
      d += `M${props.x} ${props.y + head() + row * props.ch}h${width()}`;
    }
    return d;
  };
  return (
    <g>
      <rect class="panel" height={height()} rx={4} width={width()} x={props.x} y={props.y} />
      <Show when={head() > 0}>
        <rect
          class={props.headClass ?? "soft"}
          height={head() - 0.75}
          rx={3}
          width={width() - 1.5}
          x={props.x + 0.75}
          y={props.y + 0.75}
        />
      </Show>
      {props.fill}
      <path class="rule" d={lines()} />
    </g>
  );
}

/** A placeholder line of text: a rounded bar. */
export function Bar(props: Readonly<{ x: number; y: number; w: number; class?: string }>) {
  return (
    <rect class={props.class ?? "bar"} height={4} rx={2} width={props.w} x={props.x} y={props.y} />
  );
}

/** A page with a folded corner: a file. */
export function docPath(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y + 6}a6 6 0 0 1 6-6h${w - 24}l18 18v${h - 24}a6 6 0 0 1-6 6h${-(w - 12)}a6 6 0 0 1-6-6z`;
}

/** The fold line of `docPath`'s corner. */
export function foldPath(x: number, y: number, w: number): string {
  return `M${x + w - 18} ${y}v12a6 6 0 0 0 6 6h12`;
}
