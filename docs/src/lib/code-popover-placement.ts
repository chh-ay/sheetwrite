/**
 * Where a code hover panel opens: right below the hovered symbol when the
 * panel fits there, else right above it, else on the side with more room,
 * cut to that room (the panel then scrolls). The panel keeps a fixed gap
 * from the symbol and stays inside the viewport.
 * Pure geometry on viewport boxes, so it is testable without layout; the
 * runtime positions the panel from the same boxes.
 */

/** A box in viewport coordinates. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The side of the symbol a panel opens on. */
export type PanelSide = "below" | "above";

export interface PlacementInput {
  /** The hovered symbol. */
  readonly trigger: Box;
  /** The panel's size before any height limit. */
  readonly panel: { readonly width: number; readonly height: number };
  /** The area a panel may cover: the viewport below the sticky header, less padding. */
  readonly viewport: Box;
  /** Space between the panel and the symbol. */
  readonly gap: number;
}

/** The height a panel may take on each side of the symbol, past the gap. */
function room({ trigger, viewport, gap }: PlacementInput): Record<PanelSide, number> {
  return {
    below: viewport.bottom - (trigger.bottom + gap),
    above: trigger.top - gap - viewport.top,
  };
}

/** Below when the panel fits there, else above when it fits there, else the roomier side. */
export function choosePanelSide(input: PlacementInput): PanelSide {
  const { below, above } = room(input);
  if (input.panel.height <= below) return "below";
  if (input.panel.height <= above) return "above";
  return below >= above ? "below" : "above";
}

/** Where to put a panel: its viewport position and the height it may take. */
export interface PanelFrame {
  readonly left: number;
  readonly top: number;
  readonly maxHeight: number;
}

/**
 * The panel's position and height limit on `side`: `gap` from the symbol,
 * starting at the symbol's left edge but kept inside the viewport, and no
 * taller than the room on that side.
 */
export function panelFrame(side: PanelSide, input: PlacementInput): PanelFrame {
  const { trigger, panel, viewport, gap } = input;
  const left = Math.max(viewport.left, Math.min(trigger.left, viewport.right - panel.width));
  const maxHeight = Math.max(0, Math.min(panel.height, room(input)[side]));
  const top = side === "below" ? trigger.bottom + gap : trigger.top - gap - maxHeight;
  return { left, top, maxHeight };
}
