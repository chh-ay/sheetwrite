/**
 * Page-wide behaviour of rendered code blocks, installed once per page by the
 * islands client (islands/client.tsx).
 *
 * - A code block wider than its column becomes a focusable region, so a
 *   keyboard can scroll it.
 * - A code block is one Tab stop: arrow keys move focus between its symbols
 *   and the block remembers the last one (see `roving-code-focus.ts`).
 * - Code hover popovers load on demand: their runtime and Floating UI stay out
 *   of the first load. They load at the first idle moment after the page is
 *   hydrated, or as soon as the pointer or keyboard focus reaches a code
 *   block, whichever comes first. A trigger hovered or focused before they
 *   are ready opens once they are. On a touch screen, the first tap on a
 *   linked name opens its panel, which links to the API page; a tap on a name
 *   whose panel is open follows the link.
 */

import type * as CodePopovers from "./code-popovers.js";
import { CODE_SYMBOL_CLASSES } from "./roving-code-focus.js";

const CODE_BLOCK_SELECTOR = ".expressive-code pre";
const CODE_FRAME_SELECTOR = ".expressive-code";
const TRIGGER_SELECTOR = "[data-sw-code-popover-trigger]";
/** Set by `code-popovers.ts` on the trigger whose panel is open. */
const OPEN_ATTRIBUTE = "data-popover-open";
const CODE_SYMBOL_SELECTOR = CODE_SYMBOL_CLASSES.map((name) => `.${name}`).join(", ");
/** The latest the popover runtime loads when the browser never goes idle. */
const IDLE_LOAD_TIMEOUT_MS = 2000;

let uninstall_enhancements: (() => void) | null = null;

/** Makes `symbol` its block's one Tab stop. */
function move_tab_stop(symbols: readonly HTMLElement[], symbol: HTMLElement): void {
  for (const other of symbols) other.tabIndex = other === symbol ? 0 : -1;
}

function code_symbols_of(block: Element): HTMLElement[] {
  return [...block.querySelectorAll<HTMLElement>(CODE_SYMBOL_SELECTOR)];
}

/** The symbol an arrow key moves to: next/previous, first/last, or none. */
function arrow_target(key: string, symbols: readonly HTMLElement[], index: number) {
  if (key === "ArrowRight" || key === "ArrowDown") return symbols[index + 1];
  if (key === "ArrowLeft" || key === "ArrowUp") return symbols[index - 1];
  if (key === "Home") return symbols[0];
  if (key === "End") return symbols.at(-1);
  return undefined;
}

function handle_symbol_key_down(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLElement) || !event.target.matches(CODE_SYMBOL_SELECTOR)) return;
  const block = event.target.closest("pre");
  if (block === null) return;
  const symbols = code_symbols_of(block);
  const next = arrow_target(event.key, symbols, symbols.indexOf(event.target));
  if (next === undefined) return;
  event.preventDefault();
  move_tab_stop(symbols, next);
  next.focus();
}

/** A symbol focused by pointer becomes the block's Tab stop, so Tab resumes there. */
function handle_symbol_focus(event: FocusEvent): void {
  if (!(event.target instanceof HTMLElement) || !event.target.matches(CODE_SYMBOL_SELECTOR)) return;
  const block = event.target.closest("pre");
  if (block !== null && event.target.tabIndex !== 0)
    move_tab_stop(code_symbols_of(block), event.target);
}

function install_roving_code_focus(): () => void {
  document.addEventListener("keydown", handle_symbol_key_down);
  document.addEventListener("focusin", handle_symbol_focus);
  return () => {
    document.removeEventListener("keydown", handle_symbol_key_down);
    document.removeEventListener("focusin", handle_symbol_focus);
  };
}

/** A code block that scrolls sideways is a focusable region, so keyboards can scroll it. */
function synchronize_code_block_focus(pre: HTMLPreElement): void {
  if (pre.scrollWidth > pre.clientWidth) {
    pre.tabIndex = 0;
    pre.setAttribute("role", "region");
  } else {
    pre.removeAttribute("tabindex");
    pre.removeAttribute("role");
  }
}

function observe_code_blocks(root: ParentNode, observer: ResizeObserver): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>(CODE_BLOCK_SELECTOR)) {
    observer.observe(pre);
    synchronize_code_block_focus(pre);
  }
}

function unobserve_code_blocks(root: Element, observer: ResizeObserver): void {
  if (root.matches(CODE_BLOCK_SELECTOR)) observer.unobserve(root);
  for (const pre of root.querySelectorAll(CODE_BLOCK_SELECTOR)) observer.unobserve(pre);
}

function install_code_block_focus(): () => void {
  const resize_observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLPreElement) synchronize_code_block_focus(entry.target);
    }
  });
  observe_code_blocks(document, resize_observer);

  const mutation_observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) observe_code_blocks(node, resize_observer);
      }
      // A route change removes code blocks; stop watching their size so the
      // observer does not keep them alive.
      for (const node of record.removedNodes) {
        if (node instanceof Element) unobserve_code_blocks(node, resize_observer);
      }
    }
  });
  mutation_observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    mutation_observer.disconnect();
    resize_observer.disconnect();
  };
}

/** Runs `task` when the browser is idle; returns the cancel. */
function when_idle(task: () => void): () => void {
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
function when_hydrated_and_idle(task: () => void): () => void {
  let cancel_idle: () => void = () => {};
  const root = document.documentElement;
  const watcher = new MutationObserver(() => {
    if (root.dataset.hydrated === undefined) return;
    watcher.disconnect();
    cancel_idle = when_idle(task);
  });
  if (root.dataset.hydrated === undefined) {
    watcher.observe(root, { attributes: true, attributeFilter: ["data-hydrated"] });
  } else {
    cancel_idle = when_idle(task);
  }
  return () => {
    watcher.disconnect();
    cancel_idle();
  };
}

/**
 * Loads the popover runtime on the first approach to a code block or once
 * the hydrated page is idle, then leaves every later event to its own
 * listeners.
 */
function install_popovers_on_demand(): () => void {
  let is_stopped = false;
  let uninstall_popovers: (() => void) | undefined;
  let runtime: Promise<typeof CodePopovers> | undefined;
  let cancel_idle_load: () => void = () => {};

  const stop_waiting = (): void => {
    cancel_idle_load();
    document.removeEventListener("pointerover", handle_approach);
    document.removeEventListener("focusin", handle_approach);
  };

  const load = (): Promise<typeof CodePopovers> => {
    runtime ??= import("./code-popovers.js").then((popovers) => {
      stop_waiting();
      if (!is_stopped) uninstall_popovers = popovers.installCodePopovers();
      return popovers;
    });
    return runtime;
  };

  // The runtime's own listeners miss an interaction that arrived while it loaded.
  const replay = (trigger: HTMLElement): void => {
    void load().then((popovers) => {
      const is_still_wanted = trigger.matches(":hover") || trigger === document.activeElement;
      if (!is_stopped && is_still_wanted) popovers.openCodePopover(trigger);
    });
  };

  function handle_approach(event: Event): void {
    // A touch opens its panel on the tap (handle_tap), not on the way in.
    if ((event as PointerEvent).pointerType === "touch") return;
    if (!(event.target instanceof Element) || event.target.closest(CODE_FRAME_SELECTOR) === null) {
      return;
    }
    const trigger = event.target.closest<HTMLElement>(TRIGGER_SELECTOR);
    if (trigger === null) void load();
    else replay(trigger);
  }

  /**
   * Touch has no hover: the first tap on a name opens its panel instead of
   * its link. Cancelling the touch's end cancels its click and the focus the
   * click would give the name. A touch that scrolled can't be cancelled.
   */
  function handle_tap(event: TouchEvent): void {
    const trigger = (event.target as Element).closest<HTMLElement>(TRIGGER_SELECTOR);
    if (trigger === null || trigger.hasAttribute(OPEN_ATTRIBUTE) || !event.cancelable) return;
    event.preventDefault();
    void load().then((popovers) => {
      if (!is_stopped) popovers.openCodePopover(trigger);
    });
  }

  document.addEventListener("pointerover", handle_approach);
  document.addEventListener("focusin", handle_approach);
  document.addEventListener("touchend", handle_tap);
  cancel_idle_load = when_hydrated_and_idle(() => void load());

  return () => {
    is_stopped = true;
    stop_waiting();
    document.removeEventListener("touchend", handle_tap);
    uninstall_popovers?.();
  };
}

/**
 * Installs the page-wide code behaviour. Returns the uninstaller; a second
 * call while installed is a no-op that returns a no-op.
 */
export function initializeCodeEnhancements(): () => void {
  if (uninstall_enhancements !== null) return () => {};
  const uninstall_code_block_focus = install_code_block_focus();
  const uninstall_roving = install_roving_code_focus();
  const uninstall_popovers = install_popovers_on_demand();
  uninstall_enhancements = () => {
    uninstall_popovers();
    uninstall_roving();
    uninstall_code_block_focus();
    uninstall_enhancements = null;
  };
  return uninstall_enhancements;
}
