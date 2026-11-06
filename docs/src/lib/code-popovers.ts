/**
 * Code hover popovers: the runtime `code-enhancements.ts` loads on demand.
 *
 * The build renders each distinct panel once per document into an inert
 * `<template class="sw-code-popover-store">` (see `dedupe-code-popovers.ts`),
 * and every trigger names its panel in `data-sw-code-popover-trigger`. One set
 * of document listeners serves all triggers on all pages: a panel's DOM is
 * cloned from its store the first time it opens, lives in `document.body`
 * while open, and leaves the document when it closes. Pointer hover and
 * keyboard focus open the same panel, which is the trigger's accessible
 * description (`aria-describedby`) while it is shown.
 */
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  type Placement,
  shift,
  size,
  type VirtualElement,
} from "@floating-ui/dom";

const TRIGGER_SELECTOR = "[data-sw-code-popover-trigger]";
const STORE_SELECTOR = "template.sw-code-popover-store";
/** One code line; a wrapped line is one element over several visual rows. */
const LINE_SELECTOR = ".ec-line";
/** The sticky site header; panels never open underneath it. */
const HEADER_SELECTOR = ".sw-header";
/** Marks the trigger whose panel is open. */
const OPEN_ATTRIBUTE = "data-popover-open";
/** Marks the other mentions of the open trigger's symbol in the same code block. */
const RELATED_ATTRIBUTE = "data-popover-related";

/** Pointer travel time from a trigger to its panel before the panel closes. */
const CLOSE_DELAY_MS = 90;
const PANEL_OFFSET_PX = 8;
const VIEWPORT_PADDING_PX = 12;
/** The 34rem design cap; the inline style wins over the CSS max-width. */
const PANEL_MAX_WIDTH_PX = 544;
const PANEL_MAX_HEIGHT_PX = 480;

interface OpenPopover {
  trigger: HTMLElement;
  panel: HTMLElement;
  related: readonly HTMLElement[];
  stopPositioning: () => void;
  /** Closes the panel when a route change takes its trigger out of the page. */
  detachWatcher: MutationObserver;
}

/** Panels cloned from a store; a store that leaves with its page takes its panels along. */
const panelsByStore = new WeakMap<HTMLTemplateElement, Map<string, HTMLElement>>();
let activePopover: OpenPopover | null = null;
let closeTimer: number | undefined;
// Escape returns focus to the trigger; that focus must not open the panel again.
let triggerRefocusing: HTMLElement | null = null;
let uninstallListeners: (() => void) | null = null;

function closestElement(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

/** True when `target` is the open trigger or inside the open panel. */
function isInsideActivePopover(target: EventTarget | null): boolean {
  if (activePopover === null || !(target instanceof Node)) return false;
  return activePopover.trigger.contains(target) || activePopover.panel.contains(target);
}

/** The live panel for `id`, cloned from the page's store on first use. */
function panelFor(id: string): HTMLElement | null {
  for (const store of document.querySelectorAll<HTMLTemplateElement>(STORE_SELECTOR)) {
    const cached = panelsByStore.get(store)?.get(id);
    if (cached !== undefined) return cached;
    const source = store.content.getElementById(id);
    if (source === null) continue;
    const panel = document.importNode(source, true);
    let panels = panelsByStore.get(store);
    if (panels === undefined) {
      panels = new Map();
      panelsByStore.set(store, panels);
    }
    panels.set(id, panel);
    return panel;
  }
  return null;
}

/** Other mentions of the same symbol in the trigger's code block. */
function relatedTriggers(trigger: HTMLElement, panelId: string): HTMLElement[] {
  const block = trigger.closest("pre");
  if (block === null) return [];
  const selector = `[data-sw-code-popover-trigger="${CSS.escape(panelId)}"]`;
  return [...block.querySelectorAll<HTMLElement>(selector)].filter(
    (mention) => mention !== trigger,
  );
}

function cancelScheduledClose(): void {
  if (closeTimer === undefined) return;
  window.clearTimeout(closeTimer);
  closeTimer = undefined;
}

function closePopover(): void {
  cancelScheduledClose();
  if (activePopover === null) return;

  const { trigger, panel, related, stopPositioning, detachWatcher } = activePopover;
  activePopover = null;
  stopPositioning();
  detachWatcher.disconnect();
  panel.remove();
  trigger.removeAttribute(OPEN_ATTRIBUTE);
  for (const mention of related) mention.removeAttribute(RELATED_ATTRIBUTE);
}

/** Close with Escape and give focus back to the trigger that opened the panel. */
function dismissPopover(trigger: HTMLElement): void {
  closePopover();
  triggerRefocusing = trigger;
  try {
    trigger.focus();
  } finally {
    triggerRefocusing = null;
  }
}

function scheduleClose(): void {
  cancelScheduledClose();
  closeTimer = window.setTimeout(() => {
    closeTimer = undefined;
    if (activePopover === null) return;
    // The panel holds links: keep it open while the reader points at it or
    // keyboard focus is on the trigger or inside the panel.
    const { trigger, panel } = activePopover;
    const isFocused =
      trigger.contains(document.activeElement) || panel.contains(document.activeElement);
    if (isFocused || trigger.matches(":hover") || panel.matches(":hover")) return;
    closePopover();
  }, CLOSE_DELAY_MS);
}

/** The viewport edge the panel keeps clear of, below the sticky site header. */
function viewportPadding(): { top: number; right: number; bottom: number; left: number } {
  const headerBottom = document.querySelector(HEADER_SELECTOR)?.getBoundingClientRect().bottom ?? 0;
  return {
    top: Math.max(0, headerBottom) + VIEWPORT_PADDING_PX,
    right: VIEWPORT_PADDING_PX,
    bottom: VIEWPORT_PADDING_PX,
    left: VIEWPORT_PADDING_PX,
  };
}

/**
 * The anchor box: the trigger's horizontal extent over its whole code line
 * (all visual rows of a wrapped line), so the panel opens clear of the line
 * instead of over the characters right below the trigger.
 */
function lineAnchor(trigger: HTMLElement): VirtualElement {
  const line = trigger.closest(LINE_SELECTOR) ?? trigger;
  return {
    contextElement: trigger,
    getBoundingClientRect() {
      const { left, width } = trigger.getBoundingClientRect();
      const { top, height } = line.getBoundingClientRect();
      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
      };
    },
  };
}

/**
 * Below the line, unless the symbol's other mentions sit only below it: then
 * above, so the highlighted mentions stay visible. With mentions on both
 * sides, the side with fewer of them.
 */
function preferredPlacement(trigger: HTMLElement, related: readonly HTMLElement[]): Placement {
  const line = (trigger.closest(LINE_SELECTOR) ?? trigger).getBoundingClientRect();
  let above = 0;
  let below = 0;
  for (const mention of related) {
    const { top } = mention.getBoundingClientRect();
    if (top >= line.bottom) below += 1;
    else if (top < line.top) above += 1;
  }
  return below > above ? "top-start" : "bottom-start";
}

async function positionPopover(
  anchor: VirtualElement,
  panel: HTMLElement,
  placement: Placement,
): Promise<void> {
  const padding = viewportPadding();
  const opposite: Placement = placement === "top-start" ? "bottom-start" : "top-start";
  const result = await computePosition(anchor, panel, {
    strategy: "fixed",
    placement,
    middleware: [
      offset(PANEL_OFFSET_PX),
      flip({ padding, fallbackPlacements: [opposite, "bottom-end", "top-end"] }),
      shift({ padding }),
      size({
        padding,
        apply({ availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.min(PANEL_MAX_WIDTH_PX, availableWidth)}px`,
            maxHeight: `${Math.min(PANEL_MAX_HEIGHT_PX, availableHeight)}px`,
          });
        },
      }),
    ],
  });
  panel.dataset.placement = result.placement;
  Object.assign(panel.style, { left: `${result.x}px`, top: `${result.y}px` });
}

/** Opens the panel of `trigger`, closing any other open panel. */
export function openCodePopover(trigger: HTMLElement): void {
  cancelScheduledClose();
  if (activePopover?.trigger === trigger) return;
  const panelId = trigger.dataset.swCodePopoverTrigger;
  const panel = panelId === undefined ? null : panelFor(panelId);
  if (panelId === undefined || panel === null) return;

  closePopover();
  // Fixed before it enters the document, so the panel never joins the page flow.
  panel.style.position = "fixed";
  document.body.append(panel);
  trigger.setAttribute(OPEN_ATTRIBUTE, "true");
  const related = relatedTriggers(trigger, panelId);
  for (const mention of related) mention.setAttribute(RELATED_ATTRIBUTE, "");
  const detachWatcher = new MutationObserver(() => {
    if (!trigger.isConnected) closePopover();
  });
  detachWatcher.observe(document.body, { childList: true, subtree: true });
  const anchor = lineAnchor(trigger);
  const placement = preferredPlacement(trigger, related);
  // Positions synchronously in microtasks, so the first painted frame is placed.
  const stopPositioning = autoUpdate(
    anchor,
    panel,
    () => void positionPopover(anchor, panel, placement),
  );
  activePopover = { trigger, panel, related, stopPositioning, detachWatcher };
}

function handlePointerOver(event: PointerEvent): void {
  if (event.target instanceof Node && activePopover?.panel.contains(event.target)) {
    cancelScheduledClose();
    return;
  }
  const trigger = closestElement(event.target, TRIGGER_SELECTOR);
  if (trigger !== null) openCodePopover(trigger);
}

function handlePointerOut(event: PointerEvent): void {
  if (!isInsideActivePopover(event.target) || isInsideActivePopover(event.relatedTarget)) return;
  scheduleClose();
}

function handleFocusIn(event: FocusEvent): void {
  if (isInsideActivePopover(event.target)) {
    cancelScheduledClose();
    return;
  }
  const trigger = closestElement(event.target, TRIGGER_SELECTOR);
  if (trigger !== null && trigger !== triggerRefocusing) openCodePopover(trigger);
}

function handleFocusOut(event: FocusEvent): void {
  if (isInsideActivePopover(event.target)) scheduleClose();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || activePopover === null) return;
  event.preventDefault();
  if (activePopover.panel.contains(event.target instanceof Node ? event.target : null)) {
    dismissPopover(activePopover.trigger);
  } else {
    closePopover();
  }
}

/** Touch screens have no hover: a tap opens a panel, a tap elsewhere closes it. */
function handleClick(event: MouseEvent): void {
  if (!window.matchMedia("(hover: none)").matches) return;
  const trigger = closestElement(event.target, TRIGGER_SELECTOR);
  if (trigger !== null) openCodePopover(trigger);
  else if (!isInsideActivePopover(event.target)) closePopover();
}

/**
 * Installs the document listeners that open, keep and close every code hover
 * panel. Returns the uninstaller, which also closes an open panel; a second
 * call while installed is a no-op that returns a no-op.
 */
export function installCodePopovers(): () => void {
  if (uninstallListeners !== null) return () => {};
  const listeners = [
    ["pointerover", handlePointerOver],
    ["pointerout", handlePointerOut],
    ["focusin", handleFocusIn],
    ["focusout", handleFocusOut],
    ["keydown", handleKeyDown],
    ["click", handleClick],
  ] as const;
  for (const [type, listener] of listeners) {
    document.addEventListener(type, listener as EventListener);
  }
  uninstallListeners = () => {
    closePopover();
    for (const [type, listener] of listeners) {
      document.removeEventListener(type, listener as EventListener);
    }
    uninstallListeners = null;
  };
  return uninstallListeners;
}
