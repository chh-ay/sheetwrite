// Card pictures in the blueprint style: a few boxes in columns, left to right,
// joined by connectors, laid out from their text so no card types
// coordinates. BlueprintCard (blueprint.tsx) draws them, fitted into the
// card's art box with equal padding.
import {
  type BlueprintEdge,
  type BlueprintLayout,
  type BlueprintNode,
  nodeHeight,
  nodeTextWidth,
  SPACING,
} from "./blueprint.js";

/** One box of a card: a title, and a caption or code line under it. */
export interface CardBox {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  readonly tone?: BlueprintNode["tone"];
}

/** A card's art box shape: the docs section cards and headers, the hub cards and the proof cards. */
export interface CardCanvas {
  readonly width: number;
  readonly height: number;
}

export const DOCS_CARD: CardCanvas = { width: 280, height: 140 };
export const HUB_CARD: CardCanvas = { width: 320, height: 200 };
export const WIDE_CARD: CardCanvas = { width: 320, height: 160 };

/** Arrows that fan into one box land at least this far apart, clear of the geometry check's 8. */
const FAN_ARROW_SPACING = 12;

/**
 * Columns of boxes, left to right, each centred on one middle line. Each
 * column joins the next: one box to many fans out, many to one fans in, and
 * equal counts join in pairs. The boxes of a column share a width.
 */
export function cardLayout(
  canvas: CardCanvas,
  columns: readonly (readonly CardBox[])[],
  kinds: readonly BlueprintEdge["kind"][] = [],
): BlueprintLayout {
  const describe = columns
    .map((column) => column.map((box) => box.title || box.code?.[0]).join(", "))
    .join(" → ");
  const nodes: BlueprintNode[][] = [];
  let x = 0;
  columns.forEach((column, columnIndex) => {
    const w = Math.max(...column.map((box) => nodeTextWidth(box))) + 2 * SPACING.card.insetX;
    // A single box that a fan joins is tall enough for its arrows to land apart.
    const fan = Math.max(
      columns[columnIndex - 1]?.length ?? 0,
      columns[columnIndex + 1]?.length ?? 0,
    );
    const fanHeight = column.length === 1 && fan > 1 ? FAN_ARROW_SPACING * (fan + 1) : 0;
    const heights = column.map((box) => Math.max(nodeHeight(box, true), fanHeight));
    let y = -(heights.reduce((sum, h) => sum + h, 0) + (column.length - 1) * SPACING.card.tile) / 2;
    nodes.push(
      column.map((box, row) => {
        const h = heights[row] ?? 0;
        const node = { id: `c${columnIndex}r${row}`, ...box, rect: { x, y, w, h } };
        y += h + SPACING.card.tile;
        return node;
      }),
    );
    x += w + SPACING.card.link;
  });
  const edges = nodes.slice(1).flatMap((to, index): BlueprintEdge[] => {
    const from = nodes[index] ?? [];
    const kind = kinds[index] ?? "main";
    if (from.length === to.length) {
      return from.map((node, row) => ({
        from: node.id,
        fromSide: "right",
        to: to[row]?.id ?? "",
        kind,
      }));
    }
    // A fan leaves or enters its single box at spread points, so arrowheads never pile up.
    const spread = (position: number, count: number) => (position + 1) / (count + 1);
    if (from.length === 1) {
      return to.map((node, row) => ({
        from: from[0]?.id ?? "",
        fromSide: "right",
        t: spread(row, to.length),
        to: node.id,
        toT: 0.5,
        kind,
      }));
    }
    if (to.length === 1) {
      return from.map((node, row) => ({
        from: node.id,
        fromSide: "right",
        t: 0.5,
        to: to[0]?.id ?? "",
        toT: spread(row, from.length),
        kind,
      }));
    }
    throw new Error(`The card picture ${describe} joins ${from.length} boxes to ${to.length}`);
  });
  return { nodes: nodes.flat(), edges, aspect: canvas.width / canvas.height };
}
