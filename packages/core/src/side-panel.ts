// Chrome of the docked side panel: a header with the title and a close button
// over a scrolling body. The grid owns the host element and decides when a
// panel opens; this module only builds what goes inside it. The panel is not
// modal: the sheet stays usable while it is open.

import type { GridPanel } from "./types/grid.js";

/** Controls that take keyboard focus when the panel opens. */
const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

let panelSerial = 0;

/**
 * Build the panel inside `host` and render its body. Unless the panel asks
 * not to (`focus: false`), focus moves to the first control in the body, or to
 * the close button when the body has none. Escape inside the panel and the
 * close button call `close`, which closes it through the grid. Returns a
 * disposer that runs the body's cleanup and removes the DOM.
 */
export function mountSidePanel(
  host: HTMLElement,
  content: GridPanel,
  close: () => void,
): () => void {
  panelSerial += 1;
  const titleId = `sheetwrite-panel-${panelSerial}-title`;

  const panel = document.createElement("section");
  panel.className = "sheetwrite-panel";
  panel.setAttribute("role", "complementary");
  panel.setAttribute("aria-labelledby", titleId);

  const header = document.createElement("div");
  header.className = "sheetwrite-panel-header";
  const title = document.createElement("h2");
  title.className = "sheetwrite-panel-title";
  title.id = titleId;
  title.textContent = content.title;
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "sheetwrite-panel-close";
  closeButton.title = "Close";
  closeButton.setAttribute("aria-label", `Close ${content.title}`);
  closeButton.addEventListener("click", () => close());
  header.append(title, closeButton);

  const body = document.createElement("div");
  body.className = "sheetwrite-panel-body";
  panel.append(header, body);

  // The panel sits inside the grid host, whose handler treats plain keys as
  // cell navigation and typing. Keep them here; Ctrl/Cmd shortcuts (undo)
  // still reach the grid, as they do from the ribbon.
  const onKeydown = (event: KeyboardEvent): void => {
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    close();
  };
  panel.addEventListener("keydown", onKeydown);

  host.appendChild(panel);
  const cleanup = content.render(body);
  if (content.focus !== false) (body.querySelector<HTMLElement>(FOCUSABLE) ?? closeButton).focus();

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    cleanup();
    panel.removeEventListener("keydown", onKeydown);
    panel.remove();
  };
}
