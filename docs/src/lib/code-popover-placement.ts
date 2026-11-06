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
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/** The panel's box on `side`, as Floating UI would place it before shifting. */
export function panelBox(side: PanelSide, input: PlacementInput): Box {
  const { trigger, line, lineEnd, panel, viewport, gap } = input;
  if (side === "beside") {
    const left = lineEnd + gap;
    const top = clamp(line.top, viewport.top, viewport.bottom - panel.height);
    return { left, top, right: left + panel.width, bottom: top + panel.height };
  }
  const left = clamp(trigger.left, viewport.left, viewport.right - panel.width);
  const top = side === "below" ? line.bottom + gap : line.top - gap - panel.height;
  return { left, top, right: left + panel.width, bottom: top + panel.height };
}

function fitsViewport(box: Box, viewport: Box): boolean {
  return (
    box.left >= viewport.left &&
    box.top >= viewport.top &&
    box.right <= viewport.right &&
    box.bottom <= viewport.bottom
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
 * The first side, in preference order, whose panel fits the viewport and
 * covers no mention; else the fitting side that covers the fewest; else below.
 */
export function choosePanelSide(input: PlacementInput): PanelSide {
  let best: { side: PanelSide; covered: number } | undefined;
  for (const side of sidesInOrder(input)) {
    const box = panelBox(side, input);
    if (!fitsViewport(box, input.viewport)) continue;
    const covered = input.mentions.filter((mention) => overlaps(box, mention)).length;
    if (covered === 0) return side;
    if (best === undefined || covered < best.covered) best = { side, covered };
  }
  return best?.side ?? "below";
}
