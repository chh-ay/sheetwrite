import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";

import { initializeCodeEnhancements } from "../src/lib/code-popovers.js";
import {
  installRecordingResizeObserver,
  RecordingResizeObserver,
} from "./resize-observer-recorder.js";

const PANEL_ID = "popover-create-grid";
const OTHER_PANEL_ID = "popover-grid";
/** Longer than the close delay, so a scheduled close has run. */
const AFTER_CLOSE_DELAY_MS = 150;

/** Mutation observers report in a microtask after the DOM change. */
async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

/**
 * One rendered docs page: a code block whose triggers name panels in the
 * page's inert popover store, as the build emits them.
 */
function mountPage(): {
  page: HTMLElement;
  trigger: HTMLElement;
  mentions: HTMLElement[];
} {
  const page = document.createElement("article");
  page.innerHTML = `
    <pre><code><span tabindex="0" data-sw-code-popover-trigger="${PANEL_ID}" aria-describedby="${PANEL_ID}">createGrid</span>(<span tabindex="0" data-sw-code-popover-trigger="${OTHER_PANEL_ID}">grid</span>, <span tabindex="0" data-sw-code-popover-trigger="${PANEL_ID}">createGrid</span>)</code></pre>
    <template class="sw-code-popover-store">
      <span id="${PANEL_ID}" role="tooltip" data-sw-code-popover-panel="">
        <a href="/docs/api/core/create-grid/">createGrid reference</a>
      </span>
      <span id="${OTHER_PANEL_ID}" role="tooltip" data-sw-code-popover-panel="">Grid</span>
    </template>`;
  document.body.append(page);

  const mentions = [...page.querySelectorAll<HTMLElement>("[data-sw-code-popover-trigger]")];
  const trigger = mentions[0];
  if (trigger === undefined) throw new Error("The page has no popover trigger");
  return { page, trigger, mentions };
}

function livePanel(id = PANEL_ID): HTMLElement | null {
  return document.getElementById(id);
}

function panelLink(): HTMLAnchorElement {
  const link = livePanel()?.querySelector<HTMLAnchorElement>("a");
  if (link === null || link === undefined) throw new Error("No open panel holds a link");
  return link;
}

function pointer(type: "pointerover" | "pointerout", target: Element, relatedTarget?: Element) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, relatedTarget }));
}

let uninstall: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
});

afterEach(() => {
  uninstall();
  uninstall = () => {};
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("code popovers", () => {
  it("keeps panels out of the document until a trigger opens one", () => {
    mountPage();
    uninstall = initializeCodeEnhancements();

    expect(livePanel()).toBeNull();
  });

  it("opens the panel on focus, as the trigger's accessible description", () => {
    const { trigger } = mountPage();
    uninstall = initializeCodeEnhancements();

    trigger.focus();

    const panel = livePanel();
    expect(panel?.parentElement === document.body).toBe(true);
    expect(trigger.getAttribute("aria-describedby")).toBe(PANEL_ID);
    expect(trigger.getAttribute("data-popover-open")).toBe("true");
  });

  it("serves triggers that mount after it is installed", async () => {
    uninstall = initializeCodeEnhancements();
    const { trigger } = mountPage();
    await flushMutations();

    pointer("pointerover", trigger);

    expect(livePanel()?.isConnected).toBe(true);
  });

  it("closes a hovered panel after the pointer leaves the trigger", () => {
    const { trigger, page } = mountPage();
    uninstall = initializeCodeEnhancements();
    pointer("pointerover", trigger);

    pointer("pointerout", trigger, page);
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);

    expect(livePanel()).toBeNull();
    expect(trigger.hasAttribute("data-popover-open")).toBe(false);
  });

  it("stays open while the pointer travels from the trigger into the panel", () => {
    const { trigger } = mountPage();
    uninstall = initializeCodeEnhancements();
    pointer("pointerover", trigger);
    const panel = livePanel();
    if (panel === null) throw new Error("The panel did not open");

    pointer("pointerout", trigger, panel);
    pointer("pointerover", panel, trigger);
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);

    expect(panel.isConnected).toBe(true);
  });

  it("marks the other mentions of the open symbol in the same code block", () => {
    const { mentions } = mountPage();
    const [first, other, sameSymbol] = mentions;
    if (first === undefined || other === undefined || sameSymbol === undefined) {
      throw new Error("The page has three mentions");
    }
    uninstall = initializeCodeEnhancements();

    pointer("pointerover", first);
    expect(sameSymbol.hasAttribute("data-popover-related")).toBe(true);
    expect(other.hasAttribute("data-popover-related")).toBe(false);

    pointer("pointerover", other);
    expect(sameSymbol.hasAttribute("data-popover-related")).toBe(false);
    expect(livePanel()).toBeNull();
    expect(livePanel(OTHER_PANEL_ID)?.isConnected).toBe(true);
  });

  it("removes an open panel with its page, so a return visit has one panel", async () => {
    const first = mountPage();
    uninstall = initializeCodeEnhancements();
    first.trigger.focus();

    first.page.remove();
    await flushMutations();
    expect(livePanel()).toBeNull();

    const second = mountPage();
    await flushMutations();
    second.trigger.focus();
    expect(document.querySelectorAll(`[id="${PANEL_ID}"]`)).toHaveLength(1);
  });

  it("takes a panel out of the document when Escape closes it", () => {
    const { trigger } = mountPage();
    uninstall = initializeCodeEnhancements();
    trigger.focus();

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(livePanel()).toBeNull();
  });

  it("stays open while keyboard focus is on a link inside the panel", () => {
    const { trigger } = mountPage();
    uninstall = initializeCodeEnhancements();
    trigger.focus();

    panelLink().focus();
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);

    expect(livePanel()?.isConnected).toBe(true);
  });

  it("closes on Escape from inside the panel and gives focus back to the trigger", () => {
    const { trigger } = mountPage();
    uninstall = initializeCodeEnhancements();
    trigger.focus();
    const link = panelLink();
    link.focus();

    link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(livePanel()).toBeNull();
    expect(document.activeElement === trigger).toBe(true);
  });

  it("stops observing code blocks that a route removes", async () => {
    const restoreResizeObserver = installRecordingResizeObserver();
    try {
      uninstall = initializeCodeEnhancements();
      const page = document.createElement("article");
      page.innerHTML = '<div class="expressive-code"><pre><code>grid.undo();</code></pre></div>';
      document.body.append(page);
      await flushMutations();
      expect(RecordingResizeObserver.observed.size).toBe(1);

      page.remove();
      await flushMutations();

      expect(RecordingResizeObserver.observed.size).toBe(0);
    } finally {
      uninstall();
      uninstall = () => {};
      restoreResizeObserver();
    }
  });
});
