/** Start a demo's engine this far before its host scrolls into view. */
const PRELOAD_MARGIN = "200px";

/**
 * Runs `start` once `element` comes near the viewport. A showcase's island
 * hydrates with the page; its engine, workbook and grid styles load only here,
 * so a demo below the fold costs nothing until the reader scrolls to it.
 * Returns a function that stops waiting.
 */
export function whenNearViewport(element: Element, start: () => void): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      start();
    },
    { rootMargin: PRELOAD_MARGIN },
  );
  observer.observe(element);
  return () => observer.disconnect();
}
