import {
  type FigureScale,
  type FigureShape,
  type FigureTone,
  markPath,
  scalePosition,
} from "./scale.js";

/** One series' value on a lane; `value: null` is a pending result and draws no mark. */
export interface LaneSeries {
  readonly key: string;
  readonly label: string;
  readonly value: number | null;
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
const LANE_HEIGHT = 18;

/**
 * A lane: each series' value as a mark of its own shape and tone on one scale,
 * with an optional stem from an origin. Static SVG, sized by its container.
 */
export function Lane({ label, scale, series, origin, gridlines = [] }: LaneProps) {
  const description = series.map((entry) => `${entry.label}: ${entry.valueText}`).join("; ");
  const middle = LANE_HEIGHT / 2;
  const originAt = origin === undefined ? undefined : scalePosition(scale, origin);
  return (
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
      {originAt === undefined ? null : (
        <line
          className="fig-lane__origin"
          x1={`${originAt}%`}
          x2={`${originAt}%`}
          y1="0"
          y2={LANE_HEIGHT}
        />
      )}
      {series.map((entry) => {
        if (entry.value === null) return null;
        const at = scalePosition(scale, entry.value);
        return (
          <g data-tone={entry.tone} key={entry.key}>
            {originAt === undefined ? null : (
              <line
                className="fig-lane__stem"
                x1={`${Math.min(originAt, at)}%`}
                x2={`${Math.max(originAt, at)}%`}
                y1={middle}
                y2={middle}
              />
            )}
            <svg className="fig-mark" overflow="visible" x={`${at}%`} y={middle}>
              <path d={markPath(entry.shape, MARK_RADIUS)} />
            </svg>
          </g>
        );
      })}
    </svg>
  );
}
