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
/** How far a bracket route runs out past the farther of its two boxes. */
export const BRACKET = 24;

/**
 * The points a route passes through, from `from`, leaving through `side`, to
 * `to`, entering through `toSide`: straight when the points line up; one
 * bend when the two sides are perpendicular; a bracket out and back in when
 * both are the same side; otherwise out, across halfway, and in again.
 */
export function routePoints(
  from: Point,
  side: BoxSide,
  to: Point,
  toSide: BoxSide = opposite(side),
): Point[] {
  const vertical = side === "top" || side === "bottom";
  const enters_vertically = toSide === "top" || toSide === "bottom";
  if (vertical !== enters_vertically) {
    return [from, vertical ? { x: from.x, y: to.y } : { x: to.x, y: from.y }, to];
  }
  if (side === toSide) {
    const out = OUTWARD[side];
    if (vertical) {
      const y = (out.y > 0 ? Math.max(from.y, to.y) : Math.min(from.y, to.y)) + out.y * BRACKET;
      return [from, { x: from.x, y }, { x: to.x, y }, to];
    }
    const x = (out.x > 0 ? Math.max(from.x, to.x) : Math.min(from.x, to.x)) + out.x * BRACKET;
    return [from, { x, y: from.y }, { x, y: to.y }, to];
  }
  if (vertical ? Math.abs(from.x - to.x) < 0.5 : Math.abs(from.y - to.y) < 0.5) return [from, to];
  if (vertical) {
    const mid = (from.y + to.y) / 2;
    return [from, { x: from.x, y: mid }, { x: to.x, y: mid }, to];
  }
  const mid = (from.x + to.x) / 2;
  return [from, { x: mid, y: from.y }, { x: mid, y: to.y }, to];
}

/** The path of `routePoints`, its corners rounded. */
export function route(
  from: Point,
  side: BoxSide,
  to: Point,
  toSide: BoxSide = opposite(side),
): string {
  const points = routePoints(from, side, to, toSide);
  const r = (value: number) => Math.round(value * 100) / 100;
  let d = `M${r(from.x)} ${r(from.y)}`;
  points.slice(1, -1).forEach((corner, index) => {
    const before = points[index] ?? from;
    const after = points[index + 2] ?? to;
    const in_length = Math.hypot(corner.x - before.x, corner.y - before.y);
    const out_length = Math.hypot(after.x - corner.x, after.y - corner.y);
    const radius = Math.min(BEND, in_length / 2, out_length / 2);
    if (radius < 0.01) return;
    const enter = {
      x: corner.x - ((corner.x - before.x) / in_length) * radius,
      y: corner.y - ((corner.y - before.y) / in_length) * radius,
    };
    const leave = {
      x: corner.x + ((after.x - corner.x) / out_length) * radius,
      y: corner.y + ((after.y - corner.y) / out_length) * radius,
    };
    d += `L${r(enter.x)} ${r(enter.y)}Q${r(corner.x)} ${r(corner.y)} ${r(leave.x)} ${r(leave.y)}`;
  });
  return `${d}L${r(to.x)} ${r(to.y)}`;
}
