// Keys that take the focus out of the grid. Tab moves between cells inside
// the grid, as in Excel, so the way out is Excel's own: F6 moves to the next
// part of the window, and Shift+F6 to the previous one. Escape then Tab
// leaves too. A shell cycles its own parts on F6 (spreadsheet-shell.ts); a
// bare grid moves to the page's next or previous focusable element.

/** What the grid's accessible description says about leaving it. */
export const GRID_EXIT_HINT =
  "Tab and Shift+Tab move between cells. To leave the grid, press F6, or Escape then Tab.";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "summary",
  "[contenteditable]:not([contenteditable=false])",
  "[tabindex]",
].join(",");

/** Whether the user can Tab to `element`: not disabled, hidden, inert or out of the tab order. */
function tabbable(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || element.closest("[inert],[hidden]") !== null) return false;
  return element.getClientRects().length > 0;
}

/**
 * Focus `region` when the user can Tab to it, or else the first element in it
 * the user can Tab to. Returns whether the focus moved.
 */
export function focusInto(region: HTMLElement): boolean {
  // A roving tab stop (a toolbar, the sheet tabs) holds tabindex 0 on its current item.
  const target =
    region.matches(FOCUSABLE) && tabbable(region)
      ? region
      : [...region.querySelectorAll<HTMLElement>(FOCUSABLE)].find(tabbable);
  if (target === undefined) return false;
  target.focus();
  return document.activeElement === target;
}

/**
 * Move the focus to the page's next (or previous) element the user can Tab
 * to that lies outside `region`, as Tab would from the region's edge. Wraps
 * around the page. Runs on a key press only, so it reads the DOM then.
 * Returns whether the focus moved.
 */
export function focusOutside(region: HTMLElement, forward: boolean): boolean {
  const all = [...region.ownerDocument.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !region.contains(element) && tabbable(element),
  );
  if (all.length === 0) return false;
  const after = (element: HTMLElement): boolean =>
    (region.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  // `all` is in document order: the elements before the region, then those after it.
  const next = all.findIndex(after);
  const index = forward ? Math.max(next, 0) : (next <= 0 ? all.length : next) - 1;
  const target = all[index];
  if (target === undefined) return false;
  target.focus();
  return document.activeElement === target;
}
