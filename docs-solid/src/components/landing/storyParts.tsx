import { For, type JSX } from "solid-js";

export const secs = (seconds: number) => `${seconds.toFixed(2)}s`;
export const delay = (seconds: number): JSX.CSSProperties => ({
  "animation-delay": secs(seconds),
});

/** The clip window of a {@link VersionRoll}, in SVG user units. */
export interface RollClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Version numbers roll like an odometer inside a clip window: the old value
 * slides up and out as the new one slides up into place. `changes[k]` is when
 * `values[k]` gives way to `values[k + 1]`.
 */
export function VersionRoll(
  props: Readonly<{
    class: string;
    clipId: string;
    values: readonly number[];
    changes: readonly number[];
    x: number;
    y: number;
    clip: RollClip;
    center?: boolean;
  }>,
) {
  return (
    <g class="sr-roll-window" clip-path={`url(#${props.clipId})`}>
      <clipPath id={props.clipId}>
        <rect
          height={props.clip.height}
          width={props.clip.width}
          x={props.clip.x}
          y={props.clip.y}
        />
      </clipPath>
      <For each={props.values}>
        {(value, step) => {
          const out = props.changes[step()];
          // Only the times that apply are set, as React leaves undefined ones out.
          const style: JSX.CSSProperties = {};
          if (step() > 0) style["--in"] = secs(props.changes[step() - 1] ?? 0);
          if (out !== undefined) style["--out"] = secs(out);
          return (
            <text
              class={`${props.class} sr-roll`}
              data-center={props.center === true ? "" : undefined}
              data-final={out === undefined ? "true" : undefined}
              data-first={step() === 0 ? "true" : undefined}
              data-num=""
              style={style}
              x={props.x}
              y={props.y}
            >
              v{value}
            </text>
          );
        }}
      </For>
    </g>
  );
}

const PACKET_CHAR_WIDTH = 7;
const PACKET_PADDING = 16;

export const px = (value: number) => `${value}px`;

/**
 * A change on the wire, labelled with what it is: amber while it is a pending
 * client edit, green once the server has given it a version.
 */
export function Packet(
  props: Readonly<{
    label: string;
    x: number;
    y: number;
    tone: "pending" | "committed";
    style: JSX.CSSProperties;
  }>,
) {
  // Packets are static: the label never changes after the first render.
  const width = props.label.length * PACKET_CHAR_WIDTH + PACKET_PADDING;
  return (
    <g class="sr-packet" data-tone={props.tone} style={props.style}>
      <rect height={20} rx={10} width={width} x={props.x - width / 2} y={props.y - 10} />
      <text x={props.x} y={props.y + 4} data-center="">
        {props.label}
      </text>
    </g>
  );
}
