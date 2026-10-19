/**
 * Wide showcase sheets are wider than their panels, and a column cut by the
 * panel edge reads as broken unless the edge says "there is more". Every Grid
 * scrolls through a native `.sheetwrite-scroller`, so one page-level observer
 * can mark each viewport while columns stay hidden on the right; CSS draws a
 * fade on that edge (`data-more-right`).
 */

const SCROLLER_SELECTOR = ".sheetwrite-scroller";
/** Sub-pixel layout can leave a fraction of a pixel of overflow at the end. */
const EDGE_TOLERANCE_PX = 2;

function updateEdges(scroller: HTMLElement): void {
  const viewport = scroller.parentElement;
  if (viewport === null) return;
  const hidden = scroller.scrollWidth - scroller.clientWidth;
  viewport.toggleAttribute("data-more-right", hidden - scroller.scrollLeft > EDGE_TOLERANCE_PX);
  // The fade stops at the vertical scrollbar instead of covering it.
  viewport.style.setProperty(
    "--grid-scrollbar-width",
    `${scroller.offsetWidth - scroller.clientWidth}px`,
  );
}

function watchScroller(scroller: HTMLElement, resize: ResizeObserver): () => void {
  const onScroll = () => updateEdges(scroller);
  scroller.addEventListener("scroll", onScroll, { passive: true });
  resize.observe(scroller);
  // The sizer grows when columns load or resize, without a scroller resize.
  const sizer = scroller.firstElementChild;
  if (sizer !== null) resize.observe(sizer);
  updateEdges(scroller);
  return () => scroller.removeEventListener("scroll", onScroll);
}

/** Page-level wiring; returns the uninstall function. */
export function installGridScrollHints(root: HTMLElement = document.body): () => void {
  const watched = new Map<HTMLElement, () => void>();
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      const scroller = target.matches(SCROLLER_SELECTOR)
        ? target
        : target.closest<HTMLElement>(SCROLLER_SELECTOR);
      if (scroller !== null) updateEdges(scroller);
    }
  });

  const sync = () => {
    for (const scroller of root.querySelectorAll<HTMLElement>(SCROLLER_SELECTOR)) {
      if (!watched.has(scroller)) watched.set(scroller, watchScroller(scroller, resize));
    }
    // Destroyed Grids leave the document; drop their listeners with them.
    for (const [scroller, stop] of watched) {
      if (!scroller.isConnected) {
        stop();
        resize.unobserve(scroller);
        watched.delete(scroller);
      }
    }
  };

  const mutations = new MutationObserver(sync);
  mutations.observe(root, { childList: true, subtree: true });
  sync();
  return () => {
    mutations.disconnect();
    resize.disconnect();
    for (const stop of watched.values()) stop();
    watched.clear();
  };
}
