/**
 * Where a code hover panel opens: below its code line, above it, or beside the
 * line's end. The choice keeps the open symbol's other mentions in the same
 * block visible, since they are highlighted together with the open one.
 * Pure geometry on viewport boxes, so it is testable without layout.
 */

/** A box in viewport coordinates. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The side of the code line a panel opens on. */
export type PanelSide = "below" | "above" | "beside";

export interface PlacementInput {
  /** The hovered symbol. */
  readonly trigger: Box;
  /** The symbol's whole code line, every visual row of a wrapped line. */
  readonly line: Box;
  /** Where the line's text ends on its widest row. */
  readonly lineEnd: number;
  readonly panel: { readonly width: number; readonly height: number };
  /** The other mentions of the symbol in the same code block. */
  readonly mentions: readonly Box[];
  /** The area a panel may cover: the viewport below the sticky header, less padding. */
  readonly viewport: Box;
  /** Space between the panel and the line. */
  readonly gap: number;
  /**
   * The shortest a panel may become: a panel taller than the room on its side
   * shrinks to that room (and scrolls), down to this height.
   */
  readonly minHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** Where the panel opens: a side of the line, and how far past the gap. */
export interface PanelPlacement {
  readonly side: PanelSide;
  /** Extra distance from the line, to clear highlighted mentions next to it. */
  readonly shift: number;
}

/**
 * The panel's box for `placement`, as Floating UI would place it before
 * shifting: below and above, a panel taller than the room shrinks to it.
 */
export function panelBox(placement: PanelPlacement, input: PlacementInput): Box {
  const { trigger, line, lineEnd, panel, viewport, gap } = input;
  const distance = gap + placement.shift;
  if (placement.side === "beside") {
    const left = lineEnd + distance;
    const top = clamp(line.top, viewport.top, viewport.bottom - panel.height);
    return { left, top, right: left + panel.width, bottom: top + panel.height };
  }
  const left = clamp(trigger.left, viewport.left, viewport.right - panel.width);
  const right = left + panel.width;
  if (placement.side === "below") {
    const top = line.bottom + distance;
    return { left, top, right, bottom: top + Math.min(panel.height, viewport.bottom - top) };
  }
  const bottom = line.top - distance;
  return { left, top: bottom - Math.min(panel.height, bottom - viewport.top), right, bottom };
}

function fitsViewport(box: Box, input: PlacementInput): boolean {
  const { viewport, minHeight } = input;
  return (
    box.left >= viewport.left &&
    box.top >= viewport.top &&
    box.right <= viewport.right &&
    box.bottom <= viewport.bottom &&
    box.bottom - box.top >= Math.min(minHeight, input.panel.height)
  );
}

function overlaps(a: Box, b: Box): boolean {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
}

/** Sides to try, best first: the side with fewer mentions, beside when both have some. */
function sidesInOrder(input: PlacementInput): PanelSide[] {
  const above = input.mentions.filter((mention) => mention.top < input.line.top).length;
  const below = input.mentions.filter((mention) => mention.top >= input.line.bottom).length;
  const vertical: PanelSide[] = below > above ? ["above", "below"] : ["below", "above"];
  return above > 0 && below > 0 ? ["beside", ...vertical] : [...vertical, "beside"];
}

/**
 * The same side, moved just past every mention its panel would cover, so
 * the highlighted mentions stay visible above (or below) the panel. Narrow
 * screens have no room beside the line, so this is how they keep mentions
 * in view.
 */
function pastMentions(side: PanelSide, input: PlacementInput): PanelPlacement | undefined {
  if (side === "beside") return undefined;
  let shift = 0;
  for (let step = 0; step < input.mentions.length; step += 1) {
    const box = panelBox({ side, shift }, input);
    const covered = input.mentions.filter((mention) => overlaps(box, mention));
    if (covered.length === 0) return shift === 0 ? undefined : { side, shift };
    shift =
      side === "below"
        ? Math.max(...covered.map((mention) => mention.bottom)) - input.line.bottom
        : input.line.top - Math.min(...covered.map((mention) => mention.top));
  }
  return undefined;
}

/**
 * The first placement, in preference order, whose panel fits the viewport and
 * covers no mention: the sides at the usual gap, then the vertical sides moved
 * past the mentions; else the fitting side that covers the fewest; else below.
 */
export function choosePanelPlacement(input: PlacementInput): PanelPlacement {
  const sides = sidesInOrder(input);
  const candidates: PanelPlacement[] = [
    ...sides.map((side) => ({ side, shift: 0 })),
    ...sides.flatMap((side) => pastMentions(side, input) ?? []),
  ];
  let best: { placement: PanelPlacement; covered: number } | undefined;
  for (const placement of candidates) {
    const box = panelBox(placement, input);
    if (!fitsViewport(box, input)) continue;
    const covered = input.mentions.filter((mention) => overlaps(box, mention)).length;
    if (covered === 0) return placement;
    if (best === undefined || covered < best.covered) best = { placement, covered };
  }
  return best?.placement ?? { side: "below", shift: 0 };
}
