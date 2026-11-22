/**
 * Wide showcase sheets are wider than their panels, and a column cut by the
 * panel edge reads as broken unless the edge says "there is more". Every Grid
 * scrolls through a native `.sheetwrite-scroller`, so one page-level observer
 * can mark each viewport while columns stay hidden on the right; CSS draws a
 * fade on that edge (`data-more-right`).
 *
 * Nothing here reads layout while a Grid scrolls: a read in a scroll handler
 * makes the browser lay out what the Grid's last frame changed a second time,
 * which Firefox pays for in every frame of a sideways scroll. The edge is set
 * when the scroll ends and whenever a size changes.
 */

const SCROLLER_SELECTOR = ".sheetwrite-scroller";
/** Sub-pixel layout can leave a fraction of a pixel of overflow at the end. */
const EDGE_TOLERANCE_PX = 2;

function update_edges(scroller: HTMLElement): void {
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

/** Watches one Grid viewport; the returned function stops every observation it started. */
function watch_scroller(scroller: HTMLElement, resize: ResizeObserver): () => void {
  // The position is read after the scroll ends where the browser says so, else on every scroll.
  const settled = "onscrollend" in window ? "scrollend" : "scroll";
  const on_settled = () => update_edges(scroller);
  scroller.addEventListener(settled, on_settled, { passive: true });
  resize.observe(scroller);
  // The sizer grows when columns load or resize, without a scroller resize.
  const sizer = scroller.firstElementChild;
  if (sizer !== null) resize.observe(sizer);
  update_edges(scroller);
  return () => {
    scroller.removeEventListener(settled, on_settled);
    resize.unobserve(scroller);
    if (sizer !== null) resize.unobserve(sizer);
  };
}

/** Whether `nodes` holds a Grid scroller, or an element with one inside. */
function holds_scroller(nodes: NodeList): boolean {
  for (const node of nodes) {
    if (
      node instanceof Element &&
      (node.matches(SCROLLER_SELECTOR) || node.querySelector(SCROLLER_SELECTOR) !== null)
    ) {
      return true;
    }
  }
  return false;
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
      if (scroller !== null) update_edges(scroller);
    }
  });

  const sync = () => {
    for (const scroller of root.querySelectorAll<HTMLElement>(SCROLLER_SELECTOR)) {
      if (!watched.has(scroller)) watched.set(scroller, watch_scroller(scroller, resize));
    }
    // Destroyed Grids leave the document; drop their listeners and size
    // observations with them.
    for (const [scroller, stop] of watched) {
      if (!scroller.isConnected) {
        stop();
        watched.delete(scroller);
      }
    }
  };

  // A Grid rewrites its screen-reader cells in every frame it scrolls; only
  // added or removed elements that hold a scroller change what is watched.
  const mutations = new MutationObserver((records) => {
    if (
      records.some(
        (record) => holds_scroller(record.addedNodes) || holds_scroller(record.removedNodes),
      )
    ) {
      sync();
    }
  });
  mutations.observe(root, { childList: true, subtree: true });
  sync();
  return () => {
    mutations.disconnect();
    resize.disconnect();
    for (const stop of watched.values()) stop();
    watched.clear();
  };
}
