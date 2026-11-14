// Connector geometry for the blueprint figures: points on box edges, routes
// between them and arrowheads, all computed from the boxes, so a connector
// always starts and ends on an edge.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type BoxSide = "top" | "right" | "bottom" | "left";

/** The point at fraction `t` (0 to 1) along one side of a box, left to right or top to bottom. */
export function anchor(rect: Rect, side: BoxSide, t = 0.5): Point {
  switch (side) {
    case "top":
      return { x: rect.x + rect.w * t, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.w * t, y: rect.y + rect.h };
    case "left":
      return { x: rect.x, y: rect.y + rect.h * t };
    case "right":
      return { x: rect.x + rect.w, y: rect.y + rect.h * t };
  }
}

/** The side a connector leaving through `side` enters the next box by. */
export function opposite(side: BoxSide): BoxSide {
  if (side === "top") return "bottom";
  if (side === "bottom") return "top";
  return side === "left" ? "right" : "left";
}

/** The fraction where the `index`th of `count` connectors meets one side: spread out, clear of the corners. */
export function spread(index: number, count: number, margin = 0.25): number {
  return count === 1 ? 0.5 : margin + ((1 - 2 * margin) * index) / (count - 1);
}

/** The direction out of a box through each side. */
const OUTWARD: Readonly<Record<BoxSide, Point>> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/** The arrowhead's length along the connector; the geometry check looks for this length. */
const HEAD_LENGTH = 6;

/** An arrowhead whose tip touches `tip`, entering a box through `side`. */
export function arrowHead(tip: Point, side: BoxSide): string {
  const out = OUTWARD[side];
  // Each stroke is HEAD_LENGTH long, at 30° to the connector.
  const back = HEAD_LENGTH * Math.cos(Math.PI / 6);
  const across = HEAD_LENGTH * Math.sin(Math.PI / 6);
  const base = { x: tip.x + out.x * back, y: tip.y + out.y * back };
  const one = { x: base.x - out.y * across, y: base.y + out.x * across };
  const two = { x: base.x + out.y * across, y: base.y - out.x * across };
  const r = (value: number) => Math.round(value * 100) / 100;
  return `M${r(one.x)} ${r(one.y)}L${tip.x} ${tip.y}L${r(two.x)} ${r(two.y)}`;
}

/** Corner radius of a route's bends. */
const BEND = 6;

/**
 * A route from `from`, leaving through `side`, to `to`, entering through
 * `toSide`: straight when the points line up; one rounded bend when the two
 * sides are perpendicular; otherwise out, across and in again.
 */
export function route(
  from: Point,
  side: BoxSide,
  to: Point,
  toSide: BoxSide = opposite(side),
): string {
  const vertical = side === "top" || side === "bottom";
  const entersVertically = toSide === "top" || toSide === "bottom";
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (vertical !== entersVertically) {
    // One bend: along the leaving axis to the target's line, then across into it.
    const r = Math.min(BEND, Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    return vertical
      ? `M${from.x} ${from.y}V${to.y - dy * r}Q${from.x} ${to.y} ${from.x + dx * r} ${to.y}H${to.x}`
      : `M${from.x} ${from.y}H${to.x - dx * r}Q${to.x} ${from.y} ${to.x} ${from.y + dy * r}V${to.y}`;
  }
  if (vertical ? Math.abs(from.x - to.x) < 0.5 : Math.abs(from.y - to.y) < 0.5) {
    return `M${from.x} ${from.y}L${to.x} ${to.y}`;
  }
  if (vertical) {
    const mid = (from.y + to.y) / 2;
    const r = Math.min(BEND, Math.abs(to.x - from.x) / 2, Math.abs(mid - from.y));
    return `M${from.x} ${from.y}V${mid - dy * r}Q${from.x} ${mid} ${from.x + dx * r} ${mid}H${to.x - dx * r}Q${to.x} ${mid} ${to.x} ${mid + dy * r}V${to.y}`;
  }
  const mid = (from.x + to.x) / 2;
  const r = Math.min(BEND, Math.abs(to.y - from.y) / 2, Math.abs(mid - from.x));
  return `M${from.x} ${from.y}H${mid - dx * r}Q${mid} ${from.y} ${mid} ${from.y + dy * r}V${to.y - dy * r}Q${mid} ${to.y} ${mid + dx * r} ${to.y}H${to.x}`;
}
