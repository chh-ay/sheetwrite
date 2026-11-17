/**
 * Search opens from its button, from ⌘K or Ctrl K anywhere, and from "/"
 * outside text fields. lib/shell.ts imports this module only on pages with
 * search (docs pages and the 404 page); importing it installs the opener.
 *
 * The dialog is in the page's markup, so it opens and its field takes focus in
 * the same task as the click or key press, before the search island hydrates:
 * what the reader types goes straight into the field, and the island reads the
 * field when it hydrates.
 */

/** Apple platforms name the Command key; others use Ctrl. */
function isApplePlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** Opens the search dialog of the island that holds `opener`, with its field focused. */
function openSearch(opener: Element): void {
  const dialog = opener.closest("[data-island]")?.querySelector("dialog");
  if (dialog == null) return;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("input")?.focus();
}

/** Installs the opener for the page's first search `button` and every other one. */
function installSearch(button: HTMLElement): void {
  const keyCap = button.querySelector("kbd");
  if (keyCap !== null && !isApplePlatform()) keyCap.textContent = "Ctrl K";
  // On the window, in the capture phase: the islands client holds a click on
  // the island's markup until the island hydrates.
  window.addEventListener(
    "click",
    (event) => {
      const opener =
        event.target instanceof Element ? event.target.closest("[data-search-open]") : null;
      if (opener !== null) openSearch(opener);
    },
    true,
  );
  window.addEventListener("keydown", (event) => {
    const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
    const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!commandK && !slash) return;
    const target = event.target;
    // "/" keeps typing semantics inside fields; Ctrl+K may not.
    if (slash && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    event.preventDefault();
    openSearch(button);
  });
}

const firstButton = document.querySelector<HTMLElement>("[data-search-open]");
if (firstButton !== null) installSearch(firstButton);
