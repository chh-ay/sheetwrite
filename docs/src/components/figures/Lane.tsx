/** @jsxImportSource react */
import {
  type FigureScale,
  type FigureShape,
  type FigureTone,
  markPath,
  scalePosition,
} from "./scale.js";

/** One series' value on a lane; `value: null` without a `range` is a pending result and draws no mark. */
export interface LaneSeries {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
  /**
   * A result reported as a range, such as "11.5–18× faster" over several
   * machines: a bar between its ends with a mark on each end. `value` is null then.
   */
  readonly range?: readonly [low: number, high: number];
  /** The value as words, for the description: "16.6× faster", "pending". */
  readonly valueText: string;
  readonly shape: FigureShape;
  readonly tone: FigureTone;
}

export interface LaneProps {
  /** What the lane shows, read as the SVG's title: "Countif · 100,000 cells". */
  readonly label: string;
  readonly scale: FigureScale;
  readonly series: readonly LaneSeries[];
  /**
   * A value the stems grow from, such as 1× on a ratio lane. Without one the
   * lane draws marks only.
   */
  readonly origin?: number;
  /** Positions of the gridlines, as values on the scale. */
  readonly gridlines?: readonly number[];
}

const MARK_RADIUS = 5;
/** The thickness of a range's bar, and the smaller marks on its ends. */
const RANGE_HEIGHT = 4;
const RANGE_MARK_RADIUS = 4;
/** One series sits on the lane's middle line; each further series adds a track this far apart. */
const TRACK_GAP = 10;
const SINGLE_TRACK_HEIGHT = 18;

/**
 * A lane: each series' value as a mark of its own shape and tone on one scale,
 * with an optional stem from an origin. Several series each get their own
 * track, so equal values never hide one another. Static SVG, sized by its
 * container.
 */
export function Lane({ label, scale, series, origin, gridlines = [] }: LaneProps) {
  const description = series.map((entry) => `${entry.label}: ${entry.valueText}`).join("; ");
  const height = SINGLE_TRACK_HEIGHT + TRACK_GAP * (series.length - 1);
  const origin_at = origin === undefined ? undefined : scalePosition(scale, origin);
  return (
    <svg className="fig-lane" height={height} role="img" width="100%">
      <title>{label}</title>
      <desc>{description}</desc>
      {gridlines.map((value) => (
        <line
          className="fig-lane__grid"
          key={value}
          x1={`${scalePosition(scale, value)}%`}
          x2={`${scalePosition(scale, value)}%`}
          y1="0"
          y2={height}
        />
      ))}
      {origin_at === undefined ? null : (
        <line
          className="fig-lane__origin"
          x1={`${origin_at}%`}
          x2={`${origin_at}%`}
          y1="0"
          y2={height}
        />
      )}
      {series.map((entry, index) => {
        const ends = entry.range ?? (entry.value === null ? [] : [entry.value]);
        if (ends.length === 0) return null;
        const positions = ends.map((value) => scalePosition(scale, value));
        const first = Math.min(...positions);
        const last = Math.max(...positions);
        const middle = SINGLE_TRACK_HEIGHT / 2 + TRACK_GAP * index;
        const radius = entry.range === undefined ? MARK_RADIUS : RANGE_MARK_RADIUS;
        return (
          <g data-tone={entry.tone} key={entry.key}>
            {origin_at === undefined ? null : (
              <line
                className="fig-lane__stem"
                x1={`${Math.min(origin_at, first)}%`}
                x2={`${Math.max(origin_at, last)}%`}
                y1={middle}
                y2={middle}
              />
            )}
            {entry.range === undefined ? null : (
              <rect
                className="fig-lane__range"
                height={RANGE_HEIGHT}
                rx={RANGE_HEIGHT / 2}
                width={`${Math.max(0.5, last - first)}%`}
                x={`${first}%`}
                y={middle - RANGE_HEIGHT / 2}
              />
            )}
            {positions.map((at) => (
              <svg className="fig-mark" key={at} overflow="visible" x={`${at}%`} y={middle}>
                <path d={markPath(entry.shape, radius)} />
              </svg>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
