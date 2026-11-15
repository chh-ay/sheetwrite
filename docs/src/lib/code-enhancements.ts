/**
 * Page-wide behaviour of rendered code blocks, installed once by the root
 * route and kept across client-side navigations.
 *
 * - A code block wider than its column becomes a focusable region, so a
 *   keyboard can scroll it.
 * - A code block is one Tab stop: arrow keys move focus between its symbols
 *   and the block remembers the last one (see `roving-code-focus.ts`).
 * - Code hover popovers load on demand: their runtime and Floating UI stay out
 *   of the first load. They load at the first idle moment after the page is
 *   hydrated, or as soon as the pointer or keyboard focus reaches a code
 *   block, whichever comes first. A trigger hovered or focused before they
 *   are ready opens once they are.
 */

import type * as CodePopovers from "./code-popovers.js";
import { CODE_SYMBOL_CLASSES } from "./roving-code-focus.js";

const CODE_BLOCK_SELECTOR = ".expressive-code pre";
const CODE_FRAME_SELECTOR = ".expressive-code";
const TRIGGER_SELECTOR = "[data-sw-code-popover-trigger]";
const CODE_SYMBOL_SELECTOR = CODE_SYMBOL_CLASSES.map((name) => `.${name}`).join(", ");
/** The latest the popover runtime loads when the browser never goes idle. */
const IDLE_LOAD_TIMEOUT_MS = 2000;

let uninstallEnhancements: (() => void) | null = null;

/** Makes `symbol` its block's one Tab stop. */
function moveTabStop(symbols: readonly HTMLElement[], symbol: HTMLElement): void {
  for (const other of symbols) other.tabIndex = other === symbol ? 0 : -1;
}

function codeSymbolsOf(block: Element): HTMLElement[] {
  return [...block.querySelectorAll<HTMLElement>(CODE_SYMBOL_SELECTOR)];
}

/** The symbol an arrow key moves to: next/previous, first/last, or none. */
function arrowTarget(key: string, symbols: readonly HTMLElement[], index: number) {
  if (key === "ArrowRight" || key === "ArrowDown") return symbols[index + 1];
  if (key === "ArrowLeft" || key === "ArrowUp") return symbols[index - 1];
  if (key === "Home") return symbols[0];
  if (key === "End") return symbols.at(-1);
  return undefined;
}

function handleSymbolKeyDown(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLElement) || !event.target.matches(CODE_SYMBOL_SELECTOR)) return;
  const block = event.target.closest("pre");
  if (block === null) return;
  const symbols = codeSymbolsOf(block);
  const next = arrowTarget(event.key, symbols, symbols.indexOf(event.target));
  if (next === undefined) return;
  event.preventDefault();
  moveTabStop(symbols, next);
  next.focus();
}

/** A symbol focused by pointer becomes the block's Tab stop, so Tab resumes there. */
function handleSymbolFocus(event: FocusEvent): void {
  if (!(event.target instanceof HTMLElement) || !event.target.matches(CODE_SYMBOL_SELECTOR)) return;
  const block = event.target.closest("pre");
  if (block !== null && event.target.tabIndex !== 0)
    moveTabStop(codeSymbolsOf(block), event.target);
}

function installRovingCodeFocus(): () => void {
  document.addEventListener("keydown", handleSymbolKeyDown);
  document.addEventListener("focusin", handleSymbolFocus);
  return () => {
    document.removeEventListener("keydown", handleSymbolKeyDown);
    document.removeEventListener("focusin", handleSymbolFocus);
  };
}

/** A code block that scrolls sideways is a focusable region, so keyboards can scroll it. */
function synchronizeCodeBlockFocus(pre: HTMLPreElement): void {
  if (pre.scrollWidth > pre.clientWidth) {
    pre.tabIndex = 0;
    pre.setAttribute("role", "region");
  } else {
    pre.removeAttribute("tabindex");
    pre.removeAttribute("role");
  }
}

function observeCodeBlocks(root: ParentNode, observer: ResizeObserver): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>(CODE_BLOCK_SELECTOR)) {
    observer.observe(pre);
    synchronizeCodeBlockFocus(pre);
  }
}

function unobserveCodeBlocks(root: Element, observer: ResizeObserver): void {
  if (root.matches(CODE_BLOCK_SELECTOR)) observer.unobserve(root);
  for (const pre of root.querySelectorAll(CODE_BLOCK_SELECTOR)) observer.unobserve(pre);
}

function installCodeBlockFocus(): () => void {
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLPreElement) synchronizeCodeBlockFocus(entry.target);
    }
  });
  observeCodeBlocks(document, resizeObserver);

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) observeCodeBlocks(node, resizeObserver);
      }
      // A route change removes code blocks; stop watching their size so the
      // observer does not keep them alive.
      for (const node of record.removedNodes) {
        if (node instanceof Element) unobserveCodeBlocks(node, resizeObserver);
      }
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    mutationObserver.disconnect();
    resizeObserver.disconnect();
  };
}

/** Runs `task` when the browser is idle; returns the cancel. */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: IDLE_LOAD_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, IDLE_LOAD_TIMEOUT_MS);
  return () => window.clearTimeout(handle);
}

/**
 * Runs `task` at the first idle moment after the page marks itself hydrated
 * (`html[data-hydrated]`), so the popover runtime never competes with the
 * page's own content for the network or the main thread. Returns the cancel.
 */
function whenHydratedAndIdle(task: () => void): () => void {
  let cancelIdle: () => void = () => {};
  const root = document.documentElement;
  const watcher = new MutationObserver(() => {
    if (root.dataset.hydrated === undefined) return;
    watcher.disconnect();
    cancelIdle = whenIdle(task);
  });
  if (root.dataset.hydrated === undefined) {
    watcher.observe(root, { attributes: true, attributeFilter: ["data-hydrated"] });
  } else {
    cancelIdle = whenIdle(task);
  }
  return () => {
    watcher.disconnect();
    cancelIdle();
  };
}

/**
 * Loads the popover runtime on the first approach to a code block or once
 * the hydrated page is idle, then leaves every later event to its own
 * listeners.
 */
function installPopoversOnDemand(): () => void {
  let isStopped = false;
  let uninstallPopovers: (() => void) | undefined;
  let runtime: Promise<typeof CodePopovers> | undefined;
  let cancelIdleLoad: () => void = () => {};

  const stopWaiting = (): void => {
    cancelIdleLoad();
    document.removeEventListener("pointerover", handleApproach);
    document.removeEventListener("focusin", handleApproach);
  };

  const load = (): Promise<typeof CodePopovers> => {
    runtime ??= import("./code-popovers.js").then((popovers) => {
      stopWaiting();
      if (!isStopped) uninstallPopovers = popovers.installCodePopovers();
      return popovers;
    });
    return runtime;
  };

  // The runtime's own listeners miss an interaction that arrived while it loaded.
  const replay = (trigger: HTMLElement): void => {
    void load().then((popovers) => {
      const isStillWanted = trigger.matches(":hover") || trigger === document.activeElement;
      if (!isStopped && isStillWanted) popovers.openCodePopover(trigger);
    });
  };

  function handleApproach(event: Event): void {
    if (!(event.target instanceof Element) || event.target.closest(CODE_FRAME_SELECTOR) === null) {
      return;
    }
    const trigger = event.target.closest<HTMLElement>(TRIGGER_SELECTOR);
    if (trigger === null) void load();
    else replay(trigger);
  }

  document.addEventListener("pointerover", handleApproach);
  document.addEventListener("focusin", handleApproach);
  cancelIdleLoad = whenHydratedAndIdle(() => void load());

  return () => {
    isStopped = true;
    stopWaiting();
    uninstallPopovers?.();
  };
}

/**
 * Installs the page-wide code behaviour. Returns the uninstaller; a second
 * call while installed is a no-op that returns a no-op.
 */
export function initializeCodeEnhancements(): () => void {
  if (uninstallEnhancements !== null) return () => {};
  const uninstallCodeBlockFocus = installCodeBlockFocus();
  const uninstallRoving = installRovingCodeFocus();
  const uninstallPopovers = installPopoversOnDemand();
  uninstallEnhancements = () => {
    uninstallPopovers();
    uninstallRoving();
    uninstallCodeBlockFocus();
    uninstallEnhancements = null;
  };
  return uninstallEnhancements;
}
