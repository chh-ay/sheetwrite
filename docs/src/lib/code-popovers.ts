import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";

interface OpenPopover {
  trigger: HTMLElement;
  panel: HTMLElement;
  /**
   * Marks the panel's place in the page content. An open panel moves to
   * `document.body` so no code block clips it; closing puts it back here, so
   * the panel leaves with its page and a later visit adds no second copy.
   */
  home: Comment;
  stopPositioning: () => void;
}

/** Pointer travel time from a trigger to its panel before the panel closes. */
const CLOSE_DELAY_MS = 90;

const initializedTriggers = new WeakSet<HTMLElement>();
// Identical popovers share one panel across many triggers.
const initializedPanels = new WeakSet<HTMLElement>();
let activePopover: OpenPopover | null = null;
let closeTimer: number | undefined;
let codeMutationObserver: MutationObserver | null = null;
// Escape returns focus to the trigger; that focus must not open the panel again.
let triggerRefocusing: HTMLElement | null = null;

function cancelScheduledClose(): void {
  if (closeTimer === undefined) return;
  window.clearTimeout(closeTimer);
  closeTimer = undefined;
}

function closePopover(): void {
  cancelScheduledClose();
  if (!activePopover) return;

  const { trigger, panel, home, stopPositioning } = activePopover;
  activePopover = null;
  stopPositioning();
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  trigger.removeAttribute("data-popover-open");
  if (home.isConnected) home.replaceWith(panel);
  else panel.remove();
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

function scheduleClose(trigger: HTMLElement, panel: HTMLElement): void {
  cancelScheduledClose();
  closeTimer = window.setTimeout(() => {
    // The panel holds links: keep it open while the reader points at it or
    // keyboard focus is inside it.
    const focusInPanel = panel.contains(document.activeElement);
    if (trigger.matches(":hover, :focus") || panel.matches(":hover") || focusInPanel) return;
    closePopover();
  }, CLOSE_DELAY_MS);
}

async function positionPopover(trigger: HTMLElement, panel: HTMLElement): Promise<void> {
  const { x, y, placement } = await computePosition(trigger, panel, {
    strategy: "fixed",
    placement: "bottom-start",
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ["top-start", "bottom-end", "top-end"] }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            // 544px = the 34rem design cap; inline style wins over the CSS max-width.
            maxWidth: `${Math.min(544, availableWidth)}px`,
            maxHeight: `${Math.min(480, availableHeight)}px`,
          });
        },
      }),
    ],
  });
  panel.dataset.placement = placement;
  Object.assign(panel.style, { position: "fixed", left: `${x}px`, top: `${y}px` });
}

function openPopover(trigger: HTMLElement, panel: HTMLElement): void {
  cancelScheduledClose();
  if (activePopover?.trigger === trigger) return;

  closePopover();
  const home = document.createComment("code popover");
  panel.before(home);
  document.body.append(panel);
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  trigger.setAttribute("data-popover-open", "true");
  activePopover = {
    trigger,
    panel,
    home,
    stopPositioning: autoUpdate(trigger, panel, () => void positionPopover(trigger, panel)),
  };
}

export function initializeCodePopovers(root: ParentNode = document): void {
  const triggers = root.querySelectorAll<HTMLElement>("[data-sw-code-popover-trigger]");
  for (const trigger of triggers) {
    if (initializedTriggers.has(trigger)) continue;
    const panelId = trigger.dataset.swCodePopoverTrigger;
    const panel = panelId ? document.getElementById(panelId) : null;
    if (!(panel instanceof HTMLElement)) continue;
    initializedTriggers.add(trigger);
    trigger.addEventListener("pointerenter", () => openPopover(trigger, panel));
    trigger.addEventListener("pointerleave", () => scheduleClose(trigger, panel));
    trigger.addEventListener("focus", () => {
      if (triggerRefocusing !== trigger) openPopover(trigger, panel);
    });
    trigger.addEventListener("blur", () => scheduleClose(trigger, panel));
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || activePopover?.trigger !== trigger) return;
      event.preventDefault();
      closePopover();
    });
    trigger.addEventListener("click", () => {
      if (!window.matchMedia("(hover: none)").matches) return;
      if (activePopover?.trigger !== trigger) openPopover(trigger, panel);
    });
    if (initializedPanels.has(panel)) continue;

    initializedPanels.add(panel);
    panel.addEventListener("pointerenter", cancelScheduledClose);
    panel.addEventListener("pointerleave", () => {
      if (activePopover?.panel === panel) scheduleClose(activePopover.trigger, panel);
    });
    panel.addEventListener("focusout", () => {
      if (activePopover?.panel === panel) scheduleClose(activePopover.trigger, panel);
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || activePopover?.panel !== panel) return;
      event.preventDefault();
      dismissPopover(activePopover.trigger);
    });
  }
}

function synchronizeCodeBlockFocus(pre: HTMLPreElement): void {
  if (pre.scrollWidth > pre.clientWidth) {
    pre.tabIndex = 0;
    pre.setAttribute("role", "region");
  } else {
    pre.removeAttribute("tabindex");
    pre.removeAttribute("role");
  }
}

const CODE_BLOCK_SELECTOR = ".expressive-code pre";

function observeCodeBlocks(root: ParentNode, observer: ResizeObserver): void {
  for (const pre of root.querySelectorAll<HTMLPreElement>(CODE_BLOCK_SELECTOR)) {
    observer.observe(pre);
    synchronizeCodeBlockFocus(pre);
  }
}

export function initializeCodeEnhancements(): () => void {
  initializeCodePopovers();
  if (codeMutationObserver) return () => {};

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target instanceof HTMLPreElement) synchronizeCodeBlockFocus(entry.target);
    }
  });
  observeCodeBlocks(document, resizeObserver);

  codeMutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        initializeCodePopovers(node);
        observeCodeBlocks(node, resizeObserver);
      }
      // A route change removes code blocks; stop watching their size so the
      // observer does not keep them alive.
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(CODE_BLOCK_SELECTOR)) resizeObserver.unobserve(node);
        for (const pre of node.querySelectorAll(CODE_BLOCK_SELECTOR)) resizeObserver.unobserve(pre);
      }
    }
    // The open panel lives in `document.body`, outside the removed page, so
    // close it when its trigger leaves the page.
    if (activePopover && !activePopover.trigger.isConnected) closePopover();
  });
  codeMutationObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    closePopover();
    codeMutationObserver?.disconnect();
    codeMutationObserver = null;
    resizeObserver.disconnect();
  };
}
