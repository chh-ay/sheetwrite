/** Shared placement rule of popups: where an anchored popup sits in the viewport. */

/** Least distance between a popup and the viewport edge. */
export const POPUP_VIEWPORT_MARGIN = 8;

/** Where an anchored popup goes: on which side of its anchor, and how far from it. */
export interface PopupPlacement {
  /** Side tried first; the popup flips to the other side when it does not fit. */
  readonly side: "below" | "above";
  readonly gap: number;
}

/**
 * Viewport position of a popup of `size` anchored to `anchor`. The popup is
 * left-aligned with its anchor, sits on `placement.side` when it fits there,
 * and stays `POPUP_VIEWPORT_MARGIN` inside the viewport's visible area, which
 * leaves out the page's scrollbars.
 */
export function popupPosition(
  anchor: Pick<DOMRectReadOnly, "left" | "top" | "bottom">,
  size: Pick<DOMRectReadOnly, "width" | "height">,
  placement: PopupPlacement,
): { left: number; top: number } {
  const { clientWidth: client_width, clientHeight: client_height } = document.documentElement;
  const max_left = client_width - size.width - POPUP_VIEWPORT_MARGIN;
  const left = Math.max(POPUP_VIEWPORT_MARGIN, Math.min(anchor.left, max_left));
  const below = anchor.bottom + placement.gap;
  const above = anchor.top - size.height - placement.gap;
  const fits_below = below + size.height <= client_height - POPUP_VIEWPORT_MARGIN;
  const fits_above = above >= POPUP_VIEWPORT_MARGIN;
  const prefer_below =
    placement.side === "below" ? fits_below || !fits_above : !fits_above && fits_below;
  return { left, top: Math.max(POPUP_VIEWPORT_MARGIN, prefer_below ? below : above) };
}
