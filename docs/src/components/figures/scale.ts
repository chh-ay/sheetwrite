/**
 * The value axis the figure kit draws on: linear or logarithmic over a domain,
 * mapped to a 0–100 % position, so every lane and row of one figure agrees.
 */
export type FigureScaleKind = "linear" | "log";

export interface FigureScale {
  readonly kind: FigureScaleKind;
  /** The values at the left and right ends of the lane. */
  readonly domain: readonly [low: number, high: number];
}

/** A value's position along the lane, 0 to 100, clamped to the domain. */
export function scalePosition(scale: FigureScale, value: number): number {
  const [low, high] = scale.domain;
  const map = scale.kind === "log" ? Math.log10 : (input: number) => input;
  const position = ((map(value) - map(low)) / (map(high) - map(low))) * 100;
  return Math.min(100, Math.max(0, position));
}

/** Marks a series is drawn with: shape and tone together, so colour never carries meaning alone. */
export type FigureShape = "circle" | "diamond" | "square";
export type FigureTone = "accent" | "violet" | "muted" | "danger";

/** An SVG mark of `shape`, centred on its position; sized in pixels, placed in percent. */
export function markPath(shape: FigureShape, radius: number): string {
  if (shape === "diamond")
    return `M0 ${-radius - 1}L${radius + 1} 0L0 ${radius + 1}L${-radius - 1} 0Z`;
  if (shape === "square") return `M${-radius} ${-radius}H${radius}V${radius}H${-radius}Z`;
  return `M${-radius} 0a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 ${-2 * radius} 0`;
}
