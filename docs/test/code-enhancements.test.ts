import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { initializeCodeEnhancements } from "../src/lib/code-enhancements.js";
import {
  installRecordingResizeObserver,
  RecordingResizeObserver,
} from "./resize-observer-recorder.js";

const PANEL_ID = "popover-undo";

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
      <span id="${PANEL_ID}" role="tooltip" data-sw-code-popover-panel="">Undoes the last change.</span>
    </template>`;
  document.body.append(page);
  const trigger = page.querySelector<HTMLElement>("[data-sw-code-popover-trigger]");
  if (trigger === null) throw new Error("The code block has no trigger");
  return { page, trigger };
}

let uninstall: () => void = () => {};

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  uninstall();
  uninstall = () => {};
  document.body.replaceChildren();
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

  it("stops observing code blocks that a route removes", async () => {
    const restoreResizeObserver = installRecordingResizeObserver();
    try {
      uninstall = initializeCodeEnhancements();
      const { page } = mountCodeBlock();
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
