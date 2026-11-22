// Chrome of the docked side panel: a header with the title and a close button
// over a scrolling body. The grid owns the host element and decides when a
// panel opens; this module only builds what goes inside it. The panel is not
// modal: the sheet stays usable while it is open.

import { checkIconStyles, checkStylePart } from "./style-parts.js";
import type { GridPanel } from "./types/grid.js";

/** Controls that take keyboard focus when the panel opens. */
const FOCUSABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

let panel_serial = 0;

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
  panel_serial += 1;
  const title_id = `sheetwrite-panel-${panel_serial}-title`;

  const panel = document.createElement("section");
  panel.className = "sheetwrite-panel";
  panel.setAttribute("role", "complementary");
  panel.setAttribute("aria-labelledby", title_id);

  const header = document.createElement("div");
  header.className = "sheetwrite-panel-header";
  const title = document.createElement("h2");
  title.className = "sheetwrite-panel-title";
  title.id = title_id;
  title.textContent = content.title;
  const close_button = document.createElement("button");
  close_button.type = "button";
  close_button.className = "sheetwrite-panel-close";
  close_button.title = "Close";
  close_button.setAttribute("aria-label", `Close ${content.title}`);
  close_button.addEventListener("click", () => close());
  header.append(title, close_button);

  const body = document.createElement("div");
  body.className = "sheetwrite-panel-body";
  panel.append(header, body);

  // The panel sits inside the grid host, whose handler treats plain keys as
  // cell navigation and typing. Keep them here; Ctrl/Cmd shortcuts (undo)
  // still reach the grid, as they do from the ribbon.
  const on_keydown = (event: KeyboardEvent): void => {
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    close();
  };
  panel.addEventListener("keydown", on_keydown);

  host.appendChild(panel);
  const cleanup = content.render(body);
  checkStylePart(panel, "panels", `The ${content.title} panel`);
  checkIconStyles(panel, `The ${content.title} panel`);
  if (content.focus !== false) (body.querySelector<HTMLElement>(FOCUSABLE) ?? close_button).focus();

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    cleanup();
    panel.removeEventListener("keydown", on_keydown);
    panel.remove();
  };
}
