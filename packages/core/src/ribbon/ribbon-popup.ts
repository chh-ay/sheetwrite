// The ribbon's floating surfaces: menus, palettes, forms and collapsed
// groups. They form a stack, because a collapsed group's popup can open a
// list of its own, as in Excel. Every surface shares the same dismissal,
// placement and focus-return rules.

const VIEWPORT_MARGIN = 8;

/** Elements arrow keys move between inside an open popup. */
const NAVIGABLE =
  '[role="menuitem"]:not([aria-disabled="true"]), [role="option"], button:not(:disabled), input, textarea';

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
  readonly onClose: (() => void) | undefined;
}

let popupSerial = 0;

export class RibbonPopup {
  /** Open popups, outermost first. */
  private readonly stack: OpenPopup[] = [];
  private readonly listeners = new AbortController();

  constructor(private readonly host: HTMLElement) {
    const signal = this.listeners.signal;
    document.addEventListener("pointerdown", this.onOutsidePointer, { capture: true, signal });
    // A scroll or resize would leave popups floating away from their triggers.
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

    this.stack.push({ surface, trigger, onClose: options.onClose });
    this.host.appendChild(surface);
    this.place(trigger, surface);

    if (options.focus) surface.querySelector<HTMLElement>(NAVIGABLE)?.focus();
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
  private place(trigger: HTMLElement, surface: HTMLElement): void {
    surface.style.position = "fixed";
    surface.style.left = "0px";
    surface.style.top = "0px";
    const origin = surface.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const maxLeft = window.innerWidth - origin.width - VIEWPORT_MARGIN;
    const below = anchor.bottom;
    const above = anchor.top - origin.height;
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

  private readonly onScroll = (event: Event): void => {
    // Scrolling inside a popup (a long font list) must not close it.
    const target = event.target;
    if (target instanceof Node && this.stack.some((popup) => popup.surface.contains(target))) {
      return;
    }
    this.closeAll(false);
  };

  private readonly onKeydown = (event: KeyboardEvent): void => {
    // Popups are mounted in the grid host too; see Ribbon.onKeydown.
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
    // Nested surfaces both hear the key; only the innermost one acts on it.
    const surface = event.currentTarget;
    if (!(surface instanceof HTMLElement) || this.stack.at(-1)?.surface !== surface) return;

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
    items[next]?.focus();
  };
}
