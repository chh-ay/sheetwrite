import type { CSSProperties } from "react";

export const secs = (seconds: number) => `${seconds.toFixed(2)}s`;
export const delay = (seconds: number): CSSProperties => ({ animationDelay: secs(seconds) });

/**
 * Version numbers roll like an odometer inside a clip window: the old value
 * slides up and out as the new one slides up into place. `changes[k]` is when
 * `values[k]` gives way to `values[k + 1]`.
 */
export function VersionRoll({
  className,
  clipId,
  values,
  changes,
  x,
  y,
  clip,
  center = false,
}: Readonly<{
  className: string;
  clipId: string;
  values: readonly number[];
  changes: readonly number[];
  x: number;
  y: number;
  clip: { x: number; y: number; width: number; height: number };
  center?: boolean;
}>) {
  return (
    <g className="sr-roll-window" clipPath={`url(#${clipId})`}>
      <clipPath id={clipId}>
        <rect {...clip} />
      </clipPath>
      {values.map((value, step) => {
        const out = changes[step];
        return (
          <text
            className={`${className} sr-roll`}
            data-center={center ? "" : undefined}
            data-final={out === undefined || undefined}
            data-first={step === 0 || undefined}
            data-num=""
            key={value}
            style={
              {
                "--in": step > 0 ? secs(changes[step - 1] ?? 0) : undefined,
                "--out": out === undefined ? undefined : secs(out),
              } as CSSProperties
            }
            x={x}
            y={y}
          >
            v{value}
          </text>
        );
      })}
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
export function Packet({
  label,
  x,
  y,
  tone,
  style,
}: Readonly<{
  label: string;
  x: number;
  y: number;
  tone: "pending" | "committed";
  style: CSSProperties;
}>) {
  const width = label.length * PACKET_CHAR_WIDTH + PACKET_PADDING;
  return (
    <g className="sr-packet" data-tone={tone} style={style}>
      <rect height={20} rx={10} width={width} x={x - width / 2} y={y - 10} />
      <text x={x} y={y + 4} data-center="">
        {label}
      </text>
    </g>
  );
}
