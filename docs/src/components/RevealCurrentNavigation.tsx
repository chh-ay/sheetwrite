import { useEffect } from "react";

/**
 * Scrolls the sidebar and the tab row so the current page and tab sit in
 * view, centred when they were outside it. Self-contained, because it also
 * runs as an inline script before first paint.
 */
function revealCurrentNavigation(): void {
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

const REVEAL_SCRIPT = `(${revealCurrentNavigation.toString()})()`;

/**
 * Keeps the current page's sidebar row and the current tab in view: an inline
 * script places them before first paint, and an effect does the same after a
 * client-side navigation. Render it after the sidebar and the top bar.
 */
export function RevealCurrentNavigation({ activeHref }: Readonly<{ activeHref?: string }>) {
  useEffect(() => {
    void activeHref;
    revealCurrentNavigation();
  }, [activeHref]);
  // The server's copy runs while the page parses; React never runs it again.
  return <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} suppressHydrationWarning />;
}
