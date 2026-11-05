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
