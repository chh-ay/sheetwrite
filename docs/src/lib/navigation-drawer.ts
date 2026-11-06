/** The docs navigation drawer's id; the header's menu button controls it. */
export const NAVIGATION_DIALOG_ID = "sw-docs-navigation";

/**
 * Keep the sidebar only when it fits beside the reading panel; smaller
 * viewports use the same navigation in a modal drawer.
 */
const RAIL_VIEWPORT_QUERY = "(min-width: 64rem)";

/** Marks the drawer's close button. */
export const CLOSE_NAVIGATION_ATTRIBUTE = "data-close-navigation";

/**
 * Wires the header's menu button to the navigation drawer. Plain DOM, so a
 * static docs page gets the drawer without hydrating its shell. The modal
 * dialog brings the focus trap, Escape, backdrop and focus restore; this only
 * opens it, closes it on the backdrop, the close button or a chosen link, and
 * keeps the button's `aria-expanded` in step. Returns the uninstaller.
 */
export function installNavigationDrawer(): () => void {
  const dialog = document.getElementById(NAVIGATION_DIALOG_ID);
  const toggle = document.querySelector<HTMLButtonElement>(
    `button[aria-controls="${NAVIGATION_DIALOG_ID}"]`,
  );
  const controller = new AbortController();
  if (!(dialog instanceof HTMLDialogElement) || toggle === null) return () => controller.abort();
  const { signal } = controller;

  toggle.addEventListener(
    "click",
    () => {
      dialog.showModal();
      toggle.setAttribute("aria-expanded", "true");
      // The current page can sit far down a long section list.
      requestAnimationFrame(() => {
        dialog
          .querySelector<HTMLElement>('a[aria-current="page"]')
          ?.scrollIntoView({ block: "nearest" });
      });
    },
    { signal },
  );
  dialog.addEventListener(
    "click",
    (event) => {
      // Only the backdrop targets the dialog itself: its children fill it.
      const target = event.target;
      const chosen =
        target instanceof Element &&
        target.closest(`a[href], [${CLOSE_NAVIGATION_ATTRIBUTE}]`) !== null;
      if (target === dialog || chosen) dialog.close();
    },
    { signal },
  );
  dialog.addEventListener("close", () => toggle.setAttribute("aria-expanded", "false"), {
    signal,
  });
  // A drawer left open while the viewport grows would sit on top of the rail.
  window.matchMedia(RAIL_VIEWPORT_QUERY).addEventListener(
    "change",
    (event) => {
      if (event.matches) dialog.close();
    },
    { signal },
  );
  return () => controller.abort();
}
