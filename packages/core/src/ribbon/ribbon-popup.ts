// The ribbon's floating surfaces: menus, palettes, forms and collapsed
// groups. They form a stack, because a collapsed group's popup can open a
// list of its own, as in Excel. Every surface shares the same dismissal,
// placement and focus-return rules.

const VIEWPORT_MARGIN = 8;
/** Space between a popup and its trigger, so the two never read as one surface. */
const TRIGGER_GAP = 4;

/** Elements arrow keys move between inside an open popup. */
const NAVIGABLE =
  '[role="menuitem"]:not([aria-disabled="true"]), [role="option"], button:not(:disabled), input, textarea';

/** Tab stops inside a dialog surface; of a radio group only the checked radio is one. */
const DIALOG_TAB_STOPS =
  'input:not(:disabled):not([type="radio"]), input[type="radio"]:checked:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)';

export interface PopupOptions {
  /** ARIA role of the surface: "menu", "listbox", "dialog" or "group". */
  readonly role: string;
  readonly label: string;
  /** Move focus into the popup; true when it was opened from the keyboard. */
  readonly focus: boolean;
  /** Runs after the popup closes, e.g. to move a borrowed group body back. */
  readonly onClose?: () => void;
}

interface OpenPopup {
  readonly surface: HTMLElement;
  readonly trigger: HTMLElement;
  /** Viewport position of the trigger when the popup was placed. */
  readonly anchor: { readonly left: number; readonly top: number };
  readonly onClose: (() => void) | undefined;
}

/** Whether the trigger left the position its popup was placed against. */
function triggerMoved(popup: OpenPopup): boolean {
  const rect = popup.trigger.getBoundingClientRect();
  return (
    Math.abs(rect.left - popup.anchor.left) >= 0.5 || Math.abs(rect.top - popup.anchor.top) >= 0.5
  );
}

/**
 * Focus an element of a popup without a focus scroll. WebKit scrolls the
 * document to show a focused element even inside a fixed surface, and the
 * document scroll closes every popup. Only the surface scrolls, to show the
 * element when the surface is taller than its maximum height.
 */
function focusInSurface(surface: HTMLElement, element: HTMLElement): void {
  element.focus({ preventScroll: true });

  const shown = surface.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  if (box.top < shown.top) surface.scrollTop -= shown.top - box.top;
  else if (box.bottom > shown.bottom) surface.scrollTop += box.bottom - shown.bottom;
}

let popupSerial = 0;

export class RibbonPopup {
  /** Open popups, outermost first. */
  private readonly stack: OpenPopup[] = [];
  private readonly listeners = new AbortController();

  constructor(private readonly host: HTMLElement) {
    const signal = this.listeners.signal;
    document.addEventListener("pointerdown", this.onOutsidePointer, { capture: true, signal });
    // A resize, or a scroll that moves a trigger, would leave popups floating
    // away from their triggers.
    window.addEventListener("resize", () => this.closeAll(false), { signal });
    document.addEventListener("scroll", this.onScroll, { capture: true, signal });
  }

  isOpen(trigger: HTMLElement): boolean {
    return this.stack.some((popup) => popup.trigger === trigger);
  }

  /**
   * Open `surface` below `trigger`. Popups that contain the trigger stay open
   * as its parents; any others close first.
   */
  open(trigger: HTMLElement, surface: HTMLElement, options: PopupOptions): void {
    let parents = this.stack.length;
    while (parents > 0 && !this.stack[parents - 1]?.surface.contains(trigger)) parents -= 1;
    this.closeAbove(parents, false);

    popupSerial += 1;
    surface.id = `sheetwrite-ribbon-popup-${popupSerial}`;
    surface.classList.add("sheetwrite-ribbon-popup");
    surface.setAttribute("role", options.role);
    surface.setAttribute("aria-label", options.label);
    surface.addEventListener("keydown", this.onKeydown);
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", surface.id);

    // A fixed surface does not move the trigger, so this is also its placed position.
    const anchor = trigger.getBoundingClientRect();
    this.host.appendChild(surface);
    this.stack.push({
      surface,
      trigger,
      anchor: { left: anchor.left, top: anchor.top },
      onClose: options.onClose,
    });
    this.place(anchor, surface);

    const first = options.focus ? surface.querySelector<HTMLElement>(NAVIGABLE) : null;
    if (first !== null) focusInSurface(surface, first);
  }

  /** Close the popup `trigger` opened, and any popups opened from inside it. */
  closeFrom(trigger: HTMLElement, returnFocus: boolean): void {
    const index = this.stack.findIndex((popup) => popup.trigger === trigger);
    if (index !== -1) this.closeAbove(index, returnFocus);
  }

  /** Close every popup, e.g. after a command ran. */
  closeAll(returnFocus: boolean): void {
    this.closeAbove(0, returnFocus);
  }

  destroy(): void {
    this.closeAll(false);
    this.listeners.abort();
  }

  /**
   * Close popups from the top down until `keep` remain. With `returnFocus`,
   * focus goes to the trigger of the last popup closed, which is still on
   * screen because everything above it is gone.
   */
  private closeAbove(keep: number, returnFocus: boolean): void {
    let focusTarget: HTMLElement | null = null;
    while (this.stack.length > keep) {
      const popup = this.stack.pop();
      if (popup === undefined) break;
      popup.surface.removeEventListener("keydown", this.onKeydown);
      popup.surface.remove();
      popup.trigger.setAttribute("aria-expanded", "false");
      popup.trigger.removeAttribute("aria-controls");
      popup.onClose?.();
      focusTarget = popup.trigger;
    }
    if (returnFocus) focusTarget?.focus();
  }

  /**
   * Below the trigger, flipped above or shifted left to stay on screen. The
   * surface is fixed so the grid host's `overflow: hidden` cannot clip it. A
   * transformed ancestor would make "fixed" relative to that ancestor instead
   * of the viewport, so measure where (0, 0) actually lands and subtract it.
   */
  private place(anchor: DOMRect, surface: HTMLElement): void {
    surface.style.position = "fixed";
    surface.style.left = "0px";
    surface.style.top = "0px";
    const origin = surface.getBoundingClientRect();
    const maxLeft = window.innerWidth - origin.width - VIEWPORT_MARGIN;
    const below = anchor.bottom + TRIGGER_GAP;
    const above = anchor.top - origin.height - TRIGGER_GAP;
    const fitsBelow = below + origin.height <= window.innerHeight - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, maxLeft));
    const top = Math.max(VIEWPORT_MARGIN, fitsBelow || above < 0 ? below : above);
    surface.style.left = `${left - origin.left}px`;
    surface.style.top = `${top - origin.top}px`;
  }

  /** A press outside closes every popup it is not inside. */
  private readonly onOutsidePointer = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    let keep = this.stack.length;
    while (keep > 0) {
      const popup = this.stack[keep - 1];
      if (popup === undefined || popup.surface.contains(target) || popup.trigger.contains(target)) {
        break;
      }
      keep -= 1;
    }
    this.closeAbove(keep, false);
  };

  /**
   * Close the popups whose trigger moved. A scroll that leaves every trigger
   * in place keeps them open: a scroll inside a popup (a long font list), or
   * a page scroll event that WebKit delivers after the popup opened, for a
   * scroll that happened before.
   */
  private readonly onScroll = (): void => {
    const moved = this.stack.findIndex(triggerMoved);
    if (moved !== -1) this.closeAbove(moved, false);
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    // Popups are mounted in the grid host too; see Ribbon.onKeydown.
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    // Nested surfaces both hear the key; only the innermost one acts on it.
    const surface = event.currentTarget;
    if (!(surface instanceof HTMLElement) || this.stack.at(-1)?.surface !== surface) return;

    // A form keeps Tab inside itself, wrapping at the ends; menus and lists
    // close on Tab, as Excel's do.
    if (event.key === "Tab" && surface.getAttribute("role") === "dialog") {
      const stops = [...surface.querySelectorAll<HTMLElement>(DIALOG_TAB_STOPS)];
      const edge = event.shiftKey ? stops[0] : stops.at(-1);
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
      }
      return;
    }
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      this.closeAbove(this.stack.length - 1, true);
      return;
    }

    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    const edge = event.key === "Home" || event.key === "End";
    if (step === undefined && !edge) return;
    // Text fields keep their own caret keys.
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    const items = [...surface.querySelectorAll<HTMLElement>(NAVIGABLE)];
    if (items.length === 0) return;
    const current = items.findIndex((element) => element === document.activeElement);
    let next: number;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (current === -1) next = step === 1 ? 0 : items.length - 1;
    else next = (current + (step ?? 0) + items.length) % items.length;
    event.preventDefault();
    const target = items[next];
    if (target !== undefined) focusInSurface(surface, target);
  };
}
