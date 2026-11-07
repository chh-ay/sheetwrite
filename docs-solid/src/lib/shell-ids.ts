/** The documentation drawer's id: the top bar renders it, lib/shell.ts opens it. */
export const NAVIGATION_DIALOG_ID = "sw-docs-navigation";

/**
 * Scrolls the sidebar and the tab row so the current page and tab sit in
 * view, centred when they were outside it. Self-contained: DocsShell runs it
 * as an inline script after the sidebar, before first paint.
 */
export function revealCurrentNavigation(): void {
  const reveal = (listSelector: string, itemSelector: string, vertical: boolean): void => {
    const list = document.querySelector(listSelector);
    const item = list?.querySelector(itemSelector);
    if (!list || !item) return;
    const box = list.getBoundingClientRect();
    const row = item.getBoundingClientRect();
    if (vertical) {
      if (row.top < box.top || row.bottom > box.bottom) {
        list.scrollTop += row.top - box.top - (box.height - row.height) / 2;
      }
    } else if (row.left < box.left || row.right > box.right) {
      list.scrollLeft += row.left - box.left - (box.width - row.width) / 2;
    }
  };
  reveal(".sw-sidebar", '[aria-current="page"]', true);
  reveal(".sw-docs-tabs", "[aria-current]", false);
}
