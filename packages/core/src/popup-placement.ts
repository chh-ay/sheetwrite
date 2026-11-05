/** Least distance between a popup and the viewport edge. */
export const POPUP_VIEWPORT_MARGIN = 8;

/** Where an anchored popup goes: on which side of its anchor, and how far from it. */
export interface PopupPlacement {
  /** Side tried first; the popup flips to the other side when it does not fit. */
  readonly side: "below" | "above";
  /** Distance between the anchor and the popup. */
  readonly gap: number;
}

/**
 * Viewport position of a popup of `size` anchored to `anchor`. The popup is
 * left-aligned with its anchor, sits on `placement.side` when it fits there,
 * and stays `POPUP_VIEWPORT_MARGIN` inside the viewport.
 */
export function popupPosition(
  anchor: Pick<DOMRectReadOnly, "left" | "top" | "bottom">,
  size: Pick<DOMRectReadOnly, "width" | "height">,
  placement: PopupPlacement,
): { left: number; top: number } {
  const maxLeft = window.innerWidth - size.width - POPUP_VIEWPORT_MARGIN;
  const left = Math.max(POPUP_VIEWPORT_MARGIN, Math.min(anchor.left, maxLeft));
  const below = anchor.bottom + placement.gap;
  const above = anchor.top - size.height - placement.gap;
  const fitsBelow = below + size.height <= window.innerHeight - POPUP_VIEWPORT_MARGIN;
  const fitsAbove = above >= POPUP_VIEWPORT_MARGIN;
  const preferBelow =
    placement.side === "below" ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
  return { left, top: Math.max(POPUP_VIEWPORT_MARGIN, preferBelow ? below : above) };
}
