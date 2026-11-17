// Card pictures in the blueprint style: a few boxes in columns, left to right,
// joined by connectors, laid out from their text so no card types
// coordinates. BlueprintCard (blueprint.tsx) draws them.
import {
  type BlueprintEdge,
  type BlueprintLayout,
  type BlueprintNode,
  nodeHeight,
} from "./blueprint.js";

/** One box of a card: a title, and a caption or code line under it. */
export interface CardBox {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  readonly tone?: BlueprintNode["tone"];
}

/** A card canvas: the docs section cards and headers, the hub cards and the proof cards. */
export interface CardCanvas {
  readonly width: number;
  readonly height: number;
}

export const DOCS_CARD: CardCanvas = { width: 280, height: 140 };
export const HUB_CARD: CardCanvas = { width: 320, height: 200 };
export const WIDE_CARD: CardCanvas = { width: 320, height: 160 };

const MARGIN = 8;
/** The narrowest gap between columns that still holds an arrow and its head. */
const MIN_GAP = 18;
/** The least room between boxes in one column. */
const MIN_SPACE = 6;
/** A box's text starts this far in from its left edge and keeps this much room on the right. */
const PADDING = 14 + 10;
/** Arrows that fan into one box land at least this far apart, clear of the geometry check's 8. */
const FAN_ARROW_SPACING = 12;

/**
 * About how wide a box must be: the title is 13 px, captions 12 px, code 11 px
 * mono. A capital in the title is wider than the average letter, so a title
 * such as "=SUM" or "KPI" keeps its room on the right.
 */
function boxWidth(box: CardBox): number {
  const title = [...box.title].reduce(
    (width, char) => width + (/\p{Lu}/u.test(char) ? 8.8 : 7.2),
    0,
  );
  return (
    Math.max(
      title,
      ...(box.lines ?? []).map((line) => line.length * 6.2),
      ...(box.code ?? []).map((line) => line.length * 6.7),
    ) + PADDING
  );
}

/**
 * Columns of boxes, left to right, centred on the canvas. Each column joins
 * the next: one box to many fans out, many to one fans in, and equal counts
 * join in pairs. A layout that doesn't fit its canvas fails the build.
 */
export function cardLayout(
  canvas: CardCanvas,
  columns: readonly (readonly CardBox[])[],
  kinds: readonly BlueprintEdge["kind"][] = [],
): BlueprintLayout {
  const widths = columns.map((column) => Math.max(...column.map(boxWidth)));
  const used = widths.reduce((sum, width) => sum + width, 0);
  const gap = columns.length > 1 ? (canvas.width - 2 * MARGIN - used) / (columns.length - 1) : 0;
  const describe = columns
    .map((column) => column.map((box) => box.title || box.code?.[0]).join(", "))
    .join(" → ");
  if (gap < MIN_GAP) throw new Error(`The card picture ${describe} is too wide for its canvas`);
  const nodes: BlueprintNode[][] = [];
  let x = columns.length > 1 ? MARGIN : (canvas.width - used) / 2;
  columns.forEach((column, columnIndex) => {
    const w = widths[columnIndex] ?? 0;
    // A single box that a fan joins is tall enough for its arrows to land apart.
    const fan = Math.max(
      columns[columnIndex - 1]?.length ?? 0,
      columns[columnIndex + 1]?.length ?? 0,
    );
    const fanHeight = column.length === 1 && fan > 1 ? FAN_ARROW_SPACING * (fan + 1) : 0;
    const heights = column.map((box) => Math.max(nodeHeight(box), fanHeight));
    const space =
      (canvas.height - 2 * MARGIN - heights.reduce((sum, h) => sum + h, 0)) / (column.length + 1);
    if (space < MIN_SPACE)
      throw new Error(`The card picture ${describe} is too tall for its canvas`);
    let y = MARGIN + space;
    nodes.push(
      column.map((box, row) => {
        const h = heights[row] ?? 0;
        const node = { id: `c${columnIndex}r${row}`, ...box, rect: { x, y, w, h } };
        y += h + space;
        return node;
      }),
    );
    x += w + gap;
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
  return { width: canvas.width, height: canvas.height, nodes: nodes.flat(), edges };
}
