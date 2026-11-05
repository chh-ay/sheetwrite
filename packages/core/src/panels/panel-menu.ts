// A menu button for panel rows: the keyboard path for what drag and drop
// does. The menu opens below its button inside the panel, so the panel's
// scrolling and clipping apply to it.

/** One menu entry; a disabled entry stays visible so the menu keeps its shape. */
export interface PanelMenuItem {
  readonly label: string;
  readonly disabled?: boolean;
  readonly run: () => void;
}

let menuSerial = 0;

/**
 * A button that opens a `role="menu"` list of `items()`, read on each open.
 * Arrow keys, Home and End move between entries; Enter or Space runs one;
 * Escape and Tab close the menu and return focus to the button. `focusKey`
 * lets a re-rendered panel put focus back on the new button. `signal` is the
 * panel's: when it aborts, an open menu stops listening on the document.
 */
export function menuButton(
  label: string,
  focusKey: string,
  items: () => readonly PanelMenuItem[],
  signal: AbortSignal,
): HTMLElement {
  menuSerial += 1;
  const menuId = `sheetwrite-panel-menu-${menuSerial}`;

  const wrapper = document.createElement("div");
  wrapper.className = "sheetwrite-panel-menu-anchor";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheetwrite-panel-menu-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.dataset.focusKey = focusKey;
  wrapper.appendChild(button);

  let menu: HTMLElement | null = null;

  const close = (returnFocus: boolean): void => {
    if (menu === null) return;
    menu.remove();
    menu = null;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-controls");
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    if (returnFocus) button.focus();
  };

  const onOutsidePointer = (event: PointerEvent): void => {
    if (event.target instanceof Node && wrapper.contains(event.target)) return;
    close(false);
  };

  const entries = (): HTMLElement[] =>
    menu === null
      ? []
      : [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')];

  const onMenuKeydown = (event: KeyboardEvent): void => {
    const list = entries();
    const current = list.findIndex((entry) => entry === document.activeElement);
    const moves: Record<string, number> = {
      ArrowDown: (current + 1) % list.length,
      ArrowUp: (current - 1 + list.length) % list.length,
      Home: 0,
      End: list.length - 1,
    };
    const next = moves[event.key];
    if (next !== undefined && list.length > 0) {
      event.preventDefault();
      list[next]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      // Handled here, so the panel's own Escape (close the panel) does not run.
      event.preventDefault();
      close(true);
    }
  };

  const open = (keyboard: boolean): void => {
    menu = document.createElement("div");
    menu.className = "sheetwrite-panel-menu";
    menu.id = menuId;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);
    for (const item of items()) {
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "sheetwrite-panel-menu-item";
      entry.setAttribute("role", "menuitem");
      entry.tabIndex = -1;
      entry.textContent = item.label;
      if (item.disabled === true) entry.setAttribute("aria-disabled", "true");
      else {
        entry.addEventListener("click", () => {
          close(true);
          item.run();
        });
      }
      menu.appendChild(entry);
    }
    menu.addEventListener("keydown", onMenuKeydown);
    wrapper.appendChild(menu);
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", menuId);
    document.addEventListener("pointerdown", onOutsidePointer, { capture: true, signal });
    // A pointer user keeps focus on the button; a keyboard user lands on the first entry.
    if (keyboard) entries()[0]?.focus();
  };

  button.addEventListener("click", (event) => {
    if (menu !== null) close(false);
    else open(event.detail === 0);
  });
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" || menu !== null) return;
    event.preventDefault();
    open(true);
  });

  return wrapper;
}
