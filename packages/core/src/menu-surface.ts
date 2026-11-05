/**
 * Shared rules of menus and popups: which item a navigation key focuses,
 * and where an anchored popup sits in the viewport.
 */

/** Step of each arrow key in a vertical menu or list. */
const VERTICAL_STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
/** Step of each arrow key in a popup laid out in rows and columns. */
export const TWO_AXIS_STEPS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};
/** Step of each arrow key in a horizontal strip of tabs or buttons. */
export const HORIZONTAL_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

export interface MenuKeyOptions {
  /** Step of each arrow key that moves focus; other keys except Home and End are ignored. */
  readonly steps: Readonly<Record<string, number>>;
  /** Wrap from the last item to the first and back, as WAI-ARIA menus do; otherwise stop at the ends. */
  readonly wrap: boolean;
}

const MENU_KEYS: MenuKeyOptions = { steps: VERTICAL_STEPS, wrap: true };

/**
 * Index of the item a navigation key moves focus to among `count` items, or
 * null for a key that does not navigate. Home and End go to the first and
 * last item. With no current item (`current` is -1), a forward step lands on
 * the first item and a backward step on the last.
 */
export function menuKeyTarget(
  key: string,
  current: number,
  count: number,
  options: MenuKeyOptions = MENU_KEYS,
): number | null {
  if (count === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;

  const step = options.steps[key];
  if (step === undefined) return null;
  if (current < 0) return step > 0 ? 0 : count - 1;

  const next = current + step;
  if (options.wrap) return (next + count) % count;

  return Math.max(0, Math.min(count - 1, next));
}

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
