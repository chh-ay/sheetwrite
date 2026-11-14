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
 * viewport and follows its line once per frame while the page scrolls.
 *
 * Pointer hover and keyboard focus open the same panel, which is the trigger's
 * accessible description (`aria-describedby`).
 */
import {
  type Box,
  choosePanelPlacement,
  type PanelPlacement,
  panelFrame,
  type PlacementInput,
} from "./code-popover-placement.js";

const TRIGGER_SELECTOR = "[data-sw-code-popover-trigger]";
const STORE_SELECTOR = "template.sw-code-popover-store";
/** One code line; a wrapped line is one element over several visual rows. */
const LINE_SELECTOR = ".ec-line";
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
const PANEL_OFFSET_PX = 8;
const VIEWPORT_PADDING_PX = 12;
/** A panel taller than the room beside its line shrinks and scrolls, down to this. */
const PANEL_MIN_HEIGHT_PX = 160;
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
  placement: PanelPlacement;
  size: PanelSize;
  stopFollowing: () => void;
}

/** Prepared panels by the store they were cloned from. */
const panelsByStore = new Map<HTMLTemplateElement, Map<string, HTMLElement>>();
/**
 * Each prepared panel's size before any height limit; the viewport width
 * bounds a panel's width, so a resize starts a new map.
 */
let naturalSizes = new WeakMap<HTMLElement, PanelSize>();
/** Prepared panels, oldest first, with where each came from. */
const preparedOrder: { panel: HTMLElement; store: HTMLTemplateElement; id: string }[] = [];
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

/** Drops the oldest prepared panels beyond the cap, never the open one. */
function evictOldPanels(): void {
  for (let index = 0; preparedOrder.length > MAX_PREPARED_PANELS && index < preparedOrder.length;) {
    const entry = preparedOrder[index];
    if (entry === undefined || entry.panel === activePopover?.panel) {
      index += 1;
      continue;
    }
    preparedOrder.splice(index, 1);
    entry.panel.remove();
    panelsByStore.get(entry.store)?.delete(entry.id);
  }
}

/**
 * The prepared panel for `id`, cloned from the page's store and added to the
 * document, hidden, on first use. Its size is final from then on.
 */
function panelFor(id: string): HTMLElement | null {
  for (const store of document.querySelectorAll<HTMLTemplateElement>(STORE_SELECTOR)) {
    const cached = panelsByStore.get(store)?.get(id);
    if (cached !== undefined) return cached;
    const source = store.content.getElementById(id);
    if (source === null) continue;
    const panel = document.importNode(source, true);
    panel.style.position = "fixed";
    Object.assign(panel.style, { left: "0px", top: "0px" });
    let panels = panelsByStore.get(store);
    if (panels === undefined) {
      panels = new Map();
      panelsByStore.set(store, panels);
    }
    panels.set(id, panel);
    preparedOrder.push({ panel, store, id });
    document.body.append(panel);
    evictOldPanels();
    return panel;
  }
  return null;
}

/** Removes the prepared panels of pages that left the document. */
function pruneDetachedStores(): void {
  for (const [store, panels] of panelsByStore) {
    if (store.isConnected) continue;
    for (const panel of panels.values()) panel.remove();
    panelsByStore.delete(store);
  }
  for (let index = preparedOrder.length - 1; index >= 0; index -= 1) {
    if (!preparedOrder[index]?.store.isConnected) preparedOrder.splice(index, 1);
  }
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

  const { trigger, panel, related, stopFollowing } = activePopover;
  activePopover = null;
  stopFollowing();
  panel.removeAttribute(PANEL_OPEN_ATTRIBUTE);
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

/** The area a panel may cover: the viewport below the sticky site header. */
function panelArea(): Box {
  const headerBottom = document.querySelector(HEADER_SELECTOR)?.getBoundingClientRect().bottom ?? 0;
  return {
    left: VIEWPORT_PADDING_PX,
    top: Math.max(0, headerBottom) + VIEWPORT_PADDING_PX,
    right: window.innerWidth - VIEWPORT_PADDING_PX,
    bottom: window.innerHeight - VIEWPORT_PADDING_PX,
  };
}

/**
 * The code block's tabs and title bar: Expressive Code's file tab and, for a
 * block inside a tab panel (the landing's framework tabs), that tab list.
 */
function blockChrome(trigger: HTMLElement): Element[] {
  const chrome = [...(trigger.closest(".expressive-code")?.querySelectorAll("figcaption") ?? [])];
  const tabId = trigger.closest('[role="tabpanel"]')?.getAttribute("aria-labelledby");
  const tabList = tabId ? document.getElementById(tabId)?.closest('[role="tablist"]') : null;
  if (tabList) chrome.push(tabList);
  return chrome;
}

function lineOf(trigger: HTMLElement): Element {
  return trigger.closest(LINE_SELECTOR) ?? trigger;
}

/** Where the line's text ends, on its widest visual row. */
function lineTextEnd(line: Element): number {
  const range = document.createRange();
  range.selectNodeContents(line);
  let end = 0;
  for (const rect of range.getClientRects()) end = Math.max(end, rect.right);
  return end;
}

/**
 * A panel's size without a height limit. Read once per panel and viewport
 * width; a prepared panel is already laid out, so the read forces no layout.
 */
function naturalSize(panel: HTMLElement): PanelSize {
  const known = naturalSizes.get(panel);
  if (known !== undefined) return known;
  panel.style.removeProperty("max-height");
  const size = { width: panel.offsetWidth, height: panel.offsetHeight };
  naturalSizes.set(panel, size);
  return size;
}

/** Everything placement needs, read from the page in one pass. */
function measure(
  trigger: HTMLElement,
  mentions: readonly HTMLElement[],
  chrome: readonly Element[],
  panel: PanelSize,
): PlacementInput {
  const line = lineOf(trigger);
  return {
    trigger: boxOf(trigger),
    line: boxOf(line),
    lineEnd: lineTextEnd(line),
    panel,
    mentions: mentions.map(boxOf),
    chrome: chrome.map(boxOf),
    viewport: panelArea(),
    gap: PANEL_OFFSET_PX,
    minHeight: PANEL_MIN_HEIGHT_PX,
  };
}

function positionPanel(panel: HTMLElement, placement: PanelPlacement, input: PlacementInput): void {
  const { left, top, maxHeight } = panelFrame(placement, input);
  Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, maxHeight: `${maxHeight}px` });
}

/**
 * Keeps the open panel on its line while the page or a code block scrolls and
 * while the window resizes, at most once per frame, on the side chosen when it
 * opened. Returns the stopper.
 */
function followLine(): () => void {
  let frame: number | undefined;
  const reposition = (): void => {
    frame = undefined;
    if (activePopover === null) return;
    const { trigger, panel, placement, size } = activePopover;
    positionPanel(panel, placement, measure(trigger, [], [], size));
  };
  const schedule = (): void => {
    frame ??= window.requestAnimationFrame(reposition);
  };
  const resize = (): void => {
    naturalSizes = new WeakMap();
    if (activePopover !== null) activePopover.size = naturalSize(activePopover.panel);
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

function boxOf(element: Element): Box {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
}

/** Opens the panel of `trigger`, closing any other open panel. */
export function openCodePopover(trigger: HTMLElement): void {
  cancelScheduledClose();
  if (activePopover?.trigger === trigger) return;
  const panelId = trigger.dataset.swCodePopoverTrigger;
  const panel = panelId === undefined ? null : panelFor(panelId);
  if (panelId === undefined || panel === null) return;

  // Every layout read before the first write. A prepared panel is already
  // laid out, so these reads force no layout of its content.
  const related = relatedTriggers(trigger, panelId);
  const size = naturalSize(panel);
  const input = measure(trigger, related, blockChrome(trigger), size);
  const placement = choosePanelPlacement(input);

  closePopover();
  trigger.setAttribute(OPEN_ATTRIBUTE, "true");
  for (const mention of related) mention.setAttribute(RELATED_ATTRIBUTE, "");
  positionPanel(panel, placement, input);
  panel.setAttribute(PANEL_OPEN_ATTRIBUTE, "");
  activePopover = { trigger, panel, related, placement, size, stopFollowing: followLine() };
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
 * Prepares the panels of code blocks as they scroll into view, one panel at a
 * time while the browser is idle, laying each out in the idle time so the
 * next frame and the first hover have nothing left to do; and drops the
 * panels of pages that leave the document.
 */
function installPanelPreparation(): () => void {
  const pending = new Set<string>();
  let idleHandle: number | undefined;
  const drain = (deadline?: IdleDeadline): void => {
    idleHandle = undefined;
    for (const id of pending) {
      if (deadline !== undefined && deadline.timeRemaining() < PREPARE_SLICE_MS) break;
      pending.delete(id);
      // Reading the size lays the new panel out now, inside the idle time.
      void panelFor(id)?.offsetHeight;
      if (deadline === undefined) break;
    }
    if (pending.size > 0) scheduleDrain();
  };
  const scheduleDrain = (): void => {
    if (idleHandle !== undefined) return;
    idleHandle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(drain)
        : window.setTimeout(drain, 0);
  };
  const intersections = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      intersections.unobserve(entry.target);
      for (const trigger of entry.target.querySelectorAll<HTMLElement>(TRIGGER_SELECTOR)) {
        const panelId = trigger.dataset.swCodePopoverTrigger;
        if (panelId !== undefined) pending.add(panelId);
      }
    }
    if (pending.size > 0) scheduleDrain();
  });
  const observeBlocks = (root: ParentNode): void => {
    for (const block of root.querySelectorAll("pre")) {
      if (block.querySelector(TRIGGER_SELECTOR) !== null) intersections.observe(block);
    }
  };
  observeBlocks(document);
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) observeBlocks(node);
      }
    }
    pruneDetachedStores();
    // The open panel lives in `document.body`, outside the page, so close it
    // when its trigger leaves the page.
    if (activePopover !== null && !activePopover.trigger.isConnected) closePopover();
  });
  mutations.observe(document.body, { childList: true, subtree: true });
  return () => {
    mutations.disconnect();
    intersections.disconnect();
    if (idleHandle !== undefined) {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
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
  const uninstallPreparation = installPanelPreparation();
  uninstallListeners = () => {
    closePopover();
    uninstallPreparation();
    for (const [type, listener] of listeners) {
      document.removeEventListener(type, listener as EventListener);
    }
    for (const panels of panelsByStore.values()) {
      for (const panel of panels.values()) panel.remove();
    }
    panelsByStore.clear();
    preparedOrder.length = 0;
    uninstallListeners = null;
  };
  return uninstallListeners;
}
