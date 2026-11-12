import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";

import { initializeCodeEnhancements } from "../src/lib/code-enhancements.js";
import { installCodePopovers } from "../src/lib/code-popovers.js";
import {
  installRecordingResizeObserver,
  RecordingResizeObserver,
} from "./resize-observer-recorder.js";

const PANEL_ID = "popover-undo";
/** Longer than the popover close delay, so a scheduled close has run. */
const AFTER_CLOSE_DELAY_MS = 150;

/** Mutation observers report in a microtask after the DOM change. */
async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

/** Resolves when the panel with `id` enters the document. */
function panelOpened(id: string): Promise<HTMLElement> {
  const { promise, resolve } = Promise.withResolvers<HTMLElement>();
  const observer = new MutationObserver(() => {
    const panel = document.getElementById(id);
    if (panel === null) return;
    observer.disconnect();
    resolve(panel);
  });
  observer.observe(document.body, { childList: true });
  return promise;
}

/** One code block with a hover trigger and its panel in the page's store. */
function mountCodeBlock(): { page: HTMLElement; trigger: HTMLElement } {
  const page = document.createElement("article");
  page.innerHTML = `
    <div class="expressive-code"><pre><code><span tabindex="0" data-sw-code-popover-trigger="${PANEL_ID}" aria-describedby="${PANEL_ID}">undo</span>();</code></pre></div>
    <template class="sw-code-popover-store">
      <span id="${PANEL_ID}" role="tooltip" data-sw-code-popover-panel=""><a href="/docs/api/core/grid/">Undoes the last change.</a></span>
    </template>`;
  document.body.append(page);
  const trigger = page.querySelector<HTMLElement>("[data-sw-code-popover-trigger]");
  if (trigger === null) throw new Error("The code block has no trigger");
  return { page, trigger };
}

/** True when the panel is in the document and shown. */
function isOpen(): boolean {
  return document.getElementById(PANEL_ID)?.hasAttribute("data-open") ?? false;
}

function pointer(type: "pointerover" | "pointerout", target: Element, relatedTarget?: Element) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, relatedTarget }));
}

function pressKey(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

let uninstall: () => void = () => {};

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  uninstall();
  uninstall = () => {};
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("code enhancements", () => {
  it("opens the panel of a trigger focused before the popover runtime loaded", async () => {
    const { trigger } = mountCodeBlock();
    uninstall = initializeCodeEnhancements();
    const opened = panelOpened(PANEL_ID);

    trigger.focus();

    const panel = await opened;
    expect(panel.parentElement === document.body).toBe(true);
    expect(trigger.getAttribute("data-popover-open")).toBe("true");
  });

  it("stops observing a code block that a route removes, and removes its open panel", async () => {
    const restoreResizeObserver = installRecordingResizeObserver();
    try {
      uninstall = initializeCodeEnhancements();
      const { page, trigger } = mountCodeBlock();
      await flushMutations();
      expect(RecordingResizeObserver.observed.size).toBe(1);
      trigger.focus();

      page.remove();
      await flushMutations();

      expect(RecordingResizeObserver.observed.size).toBe(0);
      expect(document.getElementById(PANEL_ID)).toBeNull();
    } finally {
      uninstall();
      uninstall = () => {};
      restoreResizeObserver();
    }
  });

  it("closes a hovered panel after the pointer leaves the trigger, not on the way into the panel", () => {
    vi.useFakeTimers();
    const { trigger, page } = mountCodeBlock();
    uninstall = installCodePopovers();
    pointer("pointerover", trigger);
    const panel = document.getElementById(PANEL_ID);
    if (panel === null) throw new Error("The panel did not open");

    pointer("pointerout", trigger, panel);
    pointer("pointerover", panel, trigger);
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);
    expect(isOpen()).toBe(true);

    pointer("pointerout", panel, page);
    pointer("pointerover", trigger, page);
    pointer("pointerout", trigger, page);
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);
    expect(isOpen()).toBe(false);
    expect(trigger.hasAttribute("data-popover-open")).toBe(false);
  });

  it("moves the block's one Tab stop with the arrow keys", () => {
    const page = document.createElement("article");
    page.innerHTML = `
      <div class="expressive-code"><pre><code><span class="sw-code-popover__trigger" tabindex="0">grid</span>.<span class="sw-code-popover__trigger" tabindex="-1">undo</span>(<a class="sw-code-ref" href="/docs/api/core/grid/" tabindex="-1">Grid</a>)</code></pre></div>`;
    document.body.append(page);
    const [first, second, third] = page.querySelectorAll<HTMLElement>(
      ".sw-code-popover__trigger, .sw-code-ref",
    );
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("The block has three symbols");
    }
    uninstall = initializeCodeEnhancements();
    first.focus();

    pressKey(first, "ArrowRight");
    expect(document.activeElement === second).toBe(true);
    expect([first.tabIndex, second.tabIndex, third.tabIndex]).toEqual([-1, 0, -1]);

    pressKey(second, "End");
    expect(document.activeElement === third).toBe(true);
    expect([first.tabIndex, second.tabIndex, third.tabIndex]).toEqual([-1, -1, 0]);
  });
});
