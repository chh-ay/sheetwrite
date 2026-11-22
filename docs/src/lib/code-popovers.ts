/**
 * Code hover popovers: the runtime `code-enhancements.ts` loads on demand.
 *
 * The build renders each distinct panel once per document into an inert
 * `<template class="sw-code-popover-store">` (see `dedupe-code-popovers.ts`),
 * and every trigger names its panel in `data-sw-code-popover-trigger`. One set
 * of document listeners serves all triggers on all pages.
 *
 * Panels are prepared ahead of use: while the browser is idle, the panels of
 * code blocks in view are cloned from the store into `document.body`, hidden
 * but laid out. Opening one then only measures, picks a side, positions it and
 * shows it, so a first hover does no style or layout work on the panel's
 * content. A panel whose page leaves the document leaves with it.
 *
 * Positioning is the placement module's geometry: the panel is fixed to the
 * viewport, anchored to the hovered symbol, and follows it once per frame
 * while the page scrolls.
 *
 * Pointer hover and keyboard focus open the same panel, which is the trigger's
 * accessible description (`aria-describedby`). On a touch screen a tap opens
 * it (`code-enhancements.ts`), and a tap elsewhere closes it.
 */
import {
  type Box,
  choosePanelSide,
  type PanelSide,
  panelFrame,
  type PlacementInput,
} from "./code-popover-placement.js";

const TRIGGER_SELECTOR = "[data-sw-code-popover-trigger]";
const STORE_SELECTOR = "template.sw-code-popover-store";
/** The sticky site header; panels never open underneath it. */
const HEADER_SELECTOR = ".sw-docs-bar, .sw-header";
/** Marks the trigger whose panel is open. */
const OPEN_ATTRIBUTE = "data-popover-open";
/** Marks the other mentions of the open trigger's symbol in the same code block. */
const RELATED_ATTRIBUTE = "data-popover-related";
/** Shows a prepared panel; without it the panel is laid out but invisible. */
const PANEL_OPEN_ATTRIBUTE = "data-open";

/** Pointer travel time from a trigger to its panel before the panel closes. */
const CLOSE_DELAY_MS = 90;
/** Space between the panel and the hovered symbol. */
const PANEL_OFFSET_PX = 8;
const VIEWPORT_PADDING_PX = 12;
/**
 * At most this many panels stay prepared; the oldest leave first. Each one is
 * laid out with the page, so preparing every panel would make every page
 * update slower. A long example block holds about 30 distinct symbols.
 */
const MAX_PREPARED_PANELS = 64;
/** An idle callback prepares another panel only with this much time left. */
const PREPARE_SLICE_MS = 6;

interface PanelSize {
  readonly width: number;
  readonly height: number;
}

interface OpenPopover {
  trigger: HTMLElement;
  panel: HTMLElement;
  related: readonly HTMLElement[];
  side: PanelSide;
  size: PanelSize;
  stopFollowing: () => void;
}

/** Prepared panels by the store they were cloned from. */
const panels_by_store = new Map<HTMLTemplateElement, Map<string, HTMLElement>>();
/**
 * Each prepared panel's size before any height limit; the viewport width
 * bounds a panel's width, so a resize starts a new map.
 */
let natural_sizes = new WeakMap<HTMLElement, PanelSize>();
/** Prepared panels, oldest first, with where each came from. */
const prepared_order: { panel: HTMLElement; store: HTMLTemplateElement; id: string }[] = [];
let active_popover: OpenPopover | null = null;
let close_timer: number | undefined;
// Escape returns focus to the trigger; that focus must not open the panel again.
let trigger_refocusing: HTMLElement | null = null;
let uninstall_listeners: (() => void) | null = null;

function closest_element(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null;
}

/** True when `target` is the open trigger or inside the open panel. */
function is_inside_active_popover(target: EventTarget | null): boolean {
  if (active_popover === null || !(target instanceof Node)) return false;
  return active_popover.trigger.contains(target) || active_popover.panel.contains(target);
}

/** Drops the oldest prepared panels beyond the cap, never the open one. */
function evict_old_panels(): void {
  for (
    let index = 0;
    prepared_order.length > MAX_PREPARED_PANELS && index < prepared_order.length;
  ) {
    const entry = prepared_order[index];
    if (entry === undefined || entry.panel === active_popover?.panel) {
      index += 1;
      continue;
    }
    prepared_order.splice(index, 1);
    entry.panel.remove();
    panels_by_store.get(entry.store)?.delete(entry.id);
  }
}

/**
 * The prepared panel for `id`, cloned from the page's store and added to the
 * document, hidden, on first use. Its size is final from then on.
 */
function panel_for(id: string): HTMLElement | null {
  for (const store of document.querySelectorAll<HTMLTemplateElement>(STORE_SELECTOR)) {
    const cached = panels_by_store.get(store)?.get(id);
    if (cached !== undefined) return cached;
    const source = store.content.getElementById(id);
    if (source === null) continue;
    const panel = document.importNode(source, true);
    panel.style.position = "fixed";
    Object.assign(panel.style, { left: "0px", top: "0px" });
    let panels = panels_by_store.get(store);
    if (panels === undefined) {
      panels = new Map();
      panels_by_store.set(store, panels);
    }
    panels.set(id, panel);
    prepared_order.push({ panel, store, id });
    document.body.append(panel);
    evict_old_panels();
    return panel;
  }
  return null;
}

/** Removes the prepared panels of pages that left the document. */
function prune_detached_stores(): void {
  for (const [store, panels] of panels_by_store) {
    if (store.isConnected) continue;
    for (const panel of panels.values()) panel.remove();
    panels_by_store.delete(store);
  }
  for (let index = prepared_order.length - 1; index >= 0; index -= 1) {
    if (!prepared_order[index]?.store.isConnected) prepared_order.splice(index, 1);
  }
}

/** Other mentions of the same symbol in the trigger's code block. */
function related_triggers(trigger: HTMLElement, panel_id: string): HTMLElement[] {
  const block = trigger.closest("pre");
  if (block === null) return [];
  const selector = `[data-sw-code-popover-trigger="${CSS.escape(panel_id)}"]`;
  return [...block.querySelectorAll<HTMLElement>(selector)].filter(
    (mention) => mention !== trigger,
  );
}

function cancel_scheduled_close(): void {
  if (close_timer === undefined) return;
  window.clearTimeout(close_timer);
  close_timer = undefined;
}

function close_popover(): void {
  cancel_scheduled_close();
  if (active_popover === null) return;

  const { trigger, panel, related, stopFollowing: stop_following } = active_popover;
  active_popover = null;
  stop_following();
  panel.removeAttribute(PANEL_OPEN_ATTRIBUTE);
  trigger.removeAttribute(OPEN_ATTRIBUTE);
  for (const mention of related) mention.removeAttribute(RELATED_ATTRIBUTE);
}

/** Close with Escape and give focus back to the trigger that opened the panel. */
function dismiss_popover(trigger: HTMLElement): void {
  close_popover();
  trigger_refocusing = trigger;
  try {
    trigger.focus();
  } finally {
    trigger_refocusing = null;
  }
}

function schedule_close(): void {
  cancel_scheduled_close();
  close_timer = window.setTimeout(() => {
    close_timer = undefined;
    if (active_popover === null) return;
    // The panel holds links: keep it open while the reader points at it or
    // keyboard focus is on the trigger or inside the panel.
    const { trigger, panel } = active_popover;
    const is_focused =
      trigger.contains(document.activeElement) || panel.contains(document.activeElement);
    if (is_focused || trigger.matches(":hover") || panel.matches(":hover")) return;
    close_popover();
  }, CLOSE_DELAY_MS);
}

/** The area a panel may cover: the viewport below the sticky site header. */
function panel_area(): Box {
  const header_bottom =
    document.querySelector(HEADER_SELECTOR)?.getBoundingClientRect().bottom ?? 0;
  return {
    left: VIEWPORT_PADDING_PX,
    top: Math.max(0, header_bottom) + VIEWPORT_PADDING_PX,
    right: window.innerWidth - VIEWPORT_PADDING_PX,
    bottom: window.innerHeight - VIEWPORT_PADDING_PX,
  };
}

/**
 * A panel's size without a height limit. Read once per panel and viewport
 * width; a prepared panel is already laid out, so the read forces no layout.
 */
function natural_size(panel: HTMLElement): PanelSize {
  const known = natural_sizes.get(panel);
  if (known !== undefined) return known;
  panel.style.removeProperty("max-height");
  const size = { width: panel.offsetWidth, height: panel.offsetHeight };
  natural_sizes.set(panel, size);
  return size;
}

/** Everything placement needs, read from the page in one pass. */
function measure(trigger: HTMLElement, panel: PanelSize): PlacementInput {
  return { trigger: box_of(trigger), panel, viewport: panel_area(), gap: PANEL_OFFSET_PX };
}

function position_panel(panel: HTMLElement, side: PanelSide, input: PlacementInput): void {
  const { left, top, maxHeight: max_height } = panelFrame(side, input);
  Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, maxHeight: `${max_height}px` });
}

/**
 * Keeps the open panel on its symbol while the page or a code block scrolls
 * and while the window resizes, at most once per frame, on the side chosen
 * when it opened. Returns the stopper.
 */
function follow_trigger(): () => void {
  let frame: number | undefined;
  const reposition = (): void => {
    frame = undefined;
    if (active_popover === null) return;
    const { trigger, panel, side, size } = active_popover;
    position_panel(panel, side, measure(trigger, size));
  };
  const schedule = (): void => {
    frame ??= window.requestAnimationFrame(reposition);
  };
  const resize = (): void => {
    natural_sizes = new WeakMap();
    if (active_popover !== null) active_popover.size = natural_size(active_popover.panel);
    schedule();
  };
  const options = { capture: true, passive: true } as const;
  document.addEventListener("scroll", schedule, options);
  window.addEventListener("resize", resize, { passive: true });
  return () => {
    document.removeEventListener("scroll", schedule, options);
    window.removeEventListener("resize", resize);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
  };
}

function box_of(element: Element): Box {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
}

/** Opens the panel of `trigger`, closing any other open panel. */
export function openCodePopover(trigger: HTMLElement): void {
  cancel_scheduled_close();
  if (active_popover?.trigger === trigger) return;
  const panel_id = trigger.dataset.swCodePopoverTrigger;
  const panel = panel_id === undefined ? null : panel_for(panel_id);
  if (panel_id === undefined || panel === null) return;

  // Every layout read before the first write. A prepared panel is already
  // laid out, so these reads force no layout of its content.
  const related = related_triggers(trigger, panel_id);
  const size = natural_size(panel);
  const input = measure(trigger, size);
  const side = choosePanelSide(input);

  close_popover();
  trigger.setAttribute(OPEN_ATTRIBUTE, "true");
  for (const mention of related) mention.setAttribute(RELATED_ATTRIBUTE, "");
  position_panel(panel, side, input);
  panel.setAttribute(PANEL_OPEN_ATTRIBUTE, "");
  active_popover = { trigger, panel, related, side, size, stopFollowing: follow_trigger() };
}

function handle_pointer_over(event: PointerEvent): void {
  if (event.target instanceof Node && active_popover?.panel.contains(event.target)) {
    cancel_scheduled_close();
    return;
  }
  // A touch opens the panel on its tap, so a tap can tell a first touch from a second.
  if (event.pointerType === "touch") return;
  const trigger = closest_element(event.target, TRIGGER_SELECTOR);
  if (trigger !== null) openCodePopover(trigger);
}

function handle_pointer_out(event: PointerEvent): void {
  if (!is_inside_active_popover(event.target) || is_inside_active_popover(event.relatedTarget))
    return;
  schedule_close();
}

function handle_focus_in(event: FocusEvent): void {
  if (is_inside_active_popover(event.target)) {
    cancel_scheduled_close();
    return;
  }
  const trigger = closest_element(event.target, TRIGGER_SELECTOR);
  if (trigger !== null && trigger !== trigger_refocusing) openCodePopover(trigger);
}

function handle_focus_out(event: FocusEvent): void {
  if (is_inside_active_popover(event.target)) schedule_close();
}

function handle_key_down(event: KeyboardEvent): void {
  if (event.key !== "Escape" || active_popover === null) return;
  event.preventDefault();
  if (active_popover.panel.contains(event.target instanceof Node ? event.target : null)) {
    dismiss_popover(active_popover.trigger);
  } else {
    close_popover();
  }
}

/** A tap or click outside the open trigger and its panel closes the panel. */
function handle_click(event: MouseEvent): void {
  if (closest_element(event.target, TRIGGER_SELECTOR) !== null) return;
  if (!is_inside_active_popover(event.target)) close_popover();
}

/**
 * Prepares the panels of code blocks as they scroll into view, one panel at a
 * time while the browser is idle, laying each out in the idle time so the
 * next frame and the first hover have nothing left to do; and drops the
 * panels of pages that leave the document.
 */
function install_panel_preparation(): () => void {
  const pending = new Set<string>();
  let idle_handle: number | undefined;
  const drain = (deadline?: IdleDeadline): void => {
    idle_handle = undefined;
    for (const id of pending) {
      if (deadline !== undefined && deadline.timeRemaining() < PREPARE_SLICE_MS) break;
      pending.delete(id);
      // Reading the size lays the new panel out now, inside the idle time.
      void panel_for(id)?.offsetHeight;
      if (deadline === undefined) break;
    }
    if (pending.size > 0) schedule_drain();
  };
  const schedule_drain = (): void => {
    if (idle_handle !== undefined) return;
    idle_handle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(drain)
        : window.setTimeout(drain, 0);
  };
  const intersections = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      intersections.unobserve(entry.target);
      for (const trigger of entry.target.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR)) {
        const panel_id = trigger.dataset.swCodePopoverTrigger;
        if (panel_id !== undefined) pending.add(panel_id);
      }
    }
    if (pending.size > 0) schedule_drain();
  });
  const observe_blocks = (root: ParentNode): void => {
    for (const block of root.querySelectorAll("pre")) {
      if (block.querySelector(TRIGGER_SELECTOR) !== null) intersections.observe(block);
    }
  };
  observe_blocks(document);
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) observe_blocks(node);
      }
    }
    prune_detached_stores();
    // The open panel lives in `document.body`, outside the page, so close it
    // when its trigger leaves the page.
    if (active_popover !== null && !active_popover.trigger.isConnected) close_popover();
  });
  mutations.observe(document.body, { childList: true, subtree: true });
  return () => {
    mutations.disconnect();
    intersections.disconnect();
    if (idle_handle !== undefined) {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle_handle);
      else window.clearTimeout(idle_handle);
    }
  };
}

/**
 * Installs the document listeners that open, keep and close every code hover
 * panel, and the idle preparation of panels near the viewport. Returns the
 * uninstaller, which also closes an open panel; a second call while installed
 * is a no-op that returns a no-op.
 */
export function installCodePopovers(): () => void {
  if (uninstall_listeners !== null) return () => {};
  const listeners = [
    ["pointerover", handle_pointer_over],
    ["pointerout", handle_pointer_out],
    ["focusin", handle_focus_in],
    ["focusout", handle_focus_out],
    ["keydown", handle_key_down],
    ["click", handle_click],
  ] as const;
  for (const [type, listener] of listeners) {
    document.addEventListener(type, listener as EventListener);
  }
  const uninstall_preparation = install_panel_preparation();
  uninstall_listeners = () => {
    close_popover();
    uninstall_preparation();
    for (const [type, listener] of listeners) {
      document.removeEventListener(type, listener as EventListener);
    }
    for (const panels of panels_by_store.values()) {
      for (const panel of panels.values()) panel.remove();
    }
    panels_by_store.clear();
    prepared_order.length = 0;
    uninstall_listeners = null;
  };
  return uninstall_listeners;
}
