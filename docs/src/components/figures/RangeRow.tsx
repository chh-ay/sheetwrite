import type { CSSProperties } from "react";

import {
  type FigureScale,
  type FigureShape,
  type FigureTone,
  markPath,
  scalePosition,
} from "./scale.js";

/** A value drawn as one mark. */
export interface RangeMark {
  readonly label: string;
  readonly value: number;
  readonly valueText: string;
  readonly shape: FigureShape;
  readonly tone: FigureTone;
}

export interface RangeRowProps {
  /** Unique on the page; names the row's value panel. */
  readonly id: string;
  readonly label: string;
  readonly scale: FigureScale;
  /** The row's own series: its range as a thin bar, its value as a solid mark. */
  readonly primary: RangeMark & { readonly range: readonly [low: number, high: number] };
  /** Other series, each as its own mark. */
  readonly others: readonly RangeMark[];
  /** A chip at the row's end: its words, and how full its bar is, 0 to 1. */
  readonly chip?: { readonly text: string; readonly fill: number; readonly tone: FigureTone };
  /** Every exact value, shown on hover, keyboard focus or a tap on the name. */
  readonly details: ReadonlyArray<readonly [term: string, value: string]>;
  /** Positions of the gridlines, as values on the scale. */
  readonly gridlines?: readonly number[];
}

const MARK_RADIUS = 5;
const LANE_HEIGHT = 18;
const RANGE_HEIGHT = 4;

/**
 * One row of a visual table: the label with the primary value in tabular
 * figures, a lane with the primary's range bar and value mark beside every
 * other series' mark, and a chip. The name is a button that shows every exact
 * value in a panel, so nothing is told by position alone.
 */
export function RangeRow({
  id,
  label,
  scale,
  primary,
  others,
  chip,
  details,
  gridlines = [],
}: RangeRowProps) {
  const middle = LANE_HEIGHT / 2;
  const [low, high] = primary.range;
  const description = [
    `${primary.label}: ${primary.valueText}`,
    ...others.map((mark) => `${mark.label}: ${mark.valueText}`),
  ].join("; ");
  const tipId = `${id}-values`;
  return (
    <li className="fig-range-row">
      {/* The name opens the value panel: on hover and focus, and on a tap where there is no hover. */}
      <button
        aria-controls={tipId}
        aria-describedby={tipId}
        aria-expanded="false"
        className="fig-range-row__name"
        type="button"
      >
        <span>{label}</span>
        <b>{primary.valueText}</b>
      </button>
      <svg className="fig-lane" height={LANE_HEIGHT} role="img" width="100%">
        <title>{label}</title>
        <desc>{description}</desc>
        {gridlines.map((value) => (
          <line
            className="fig-lane__grid"
            key={value}
            x1={`${scalePosition(scale, value)}%`}
            x2={`${scalePosition(scale, value)}%`}
            y1="0"
            y2={LANE_HEIGHT}
          />
        ))}
        <g data-tone={primary.tone}>
          <rect
            className="fig-lane__range"
            height={RANGE_HEIGHT}
            rx={RANGE_HEIGHT / 2}
            width={`${Math.max(0.5, scalePosition(scale, high) - scalePosition(scale, low))}%`}
            x={`${scalePosition(scale, low)}%`}
            y={middle - RANGE_HEIGHT / 2}
          />
        </g>
        {others.map((mark) => (
          <g data-tone={mark.tone} key={mark.label}>
            <svg
              className="fig-mark"
              overflow="visible"
              x={`${scalePosition(scale, mark.value)}%`}
              y={middle}
            >
              <path d={markPath(mark.shape, MARK_RADIUS)} />
            </svg>
          </g>
        ))}
        <g data-tone={primary.tone}>
          <svg
            className="fig-mark"
            overflow="visible"
            x={`${scalePosition(scale, primary.value)}%`}
            y={middle}
          >
            <path d={markPath(primary.shape, MARK_RADIUS)} />
          </svg>
        </g>
      </svg>
      {chip === undefined ? (
        <span className="fig-chip" />
      ) : (
        <span
          className="fig-chip"
          data-tone={chip.tone}
          style={
            {
              "--fig-chip-fill": `${(Math.min(1, Math.max(0, chip.fill)) * 100).toFixed(1)}%`,
            } as CSSProperties
          }
        >
          {chip.text}
        </span>
      )}
      <dl className="fig-tip" id={tipId} role="tooltip">
        {details.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
