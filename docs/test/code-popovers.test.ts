import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";

import { initializeCodeEnhancements } from "../src/lib/code-popovers.js";
import {
  installRecordingResizeObserver,
  RecordingResizeObserver,
} from "./resize-observer-recorder.js";

const PANEL_ID = "popover-create-grid";
/** Longer than the close delay, so a scheduled close has run. */
const AFTER_CLOSE_DELAY_MS = 150;

/** Mutation observers report in a microtask after the DOM change. */
async function flushMutations(): Promise<void> {
  await Promise.resolve();
}

/** One rendered docs page: a code trigger and its hover panel with a link. */
function mountPage(): { page: HTMLElement; trigger: HTMLElement } {
  const page = document.createElement("article");
  page.innerHTML = `
    <code><span tabindex="0" data-sw-code-popover-trigger="${PANEL_ID}">createGrid</span></code>
    <div id="${PANEL_ID}" hidden aria-hidden="true">
      <a href="/docs/api/core/create-grid/">createGrid reference</a>
    </div>`;
  document.body.append(page);

  const trigger = page.querySelector<HTMLElement>("[data-sw-code-popover-trigger]");
  if (trigger === null) throw new Error("The page has no popover trigger");
  return { page, trigger };
}

function panelLink(): HTMLAnchorElement {
  const link = document.querySelector<HTMLAnchorElement>(`#${PANEL_ID} a`);
  if (link === null) throw new Error("The popover panel has no link");
  return link;
}

let uninstall: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
});

afterEach(() => {
  uninstall();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("code popovers", () => {
  it("removes an open panel with its page, so a return visit has one panel", async () => {
    const first = mountPage();
    uninstall = initializeCodeEnhancements();
    first.trigger.focus();
    expect(document.getElementById(PANEL_ID)?.parentElement === document.body).toBe(true);

    first.page.remove();
    await flushMutations();
    expect(document.getElementById(PANEL_ID) === null).toBe(true);

    const second = mountPage();
    await flushMutations();
    second.trigger.focus();
    expect(document.querySelectorAll(`[id="${PANEL_ID}"]`)).toHaveLength(1);
  });

  it("returns a closed panel to its place in the page", () => {
    const { page, trigger } = mountPage();
    uninstall = initializeCodeEnhancements();
    trigger.focus();

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.getElementById(PANEL_ID)?.parentElement === page).toBe(true);
  });

  it("stays open while keyboard focus is on a link inside the panel", () => {
    const { trigger } = mountPage();
    uninstall = initializeCodeEnhancements();
    trigger.focus();

    panelLink().focus();
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);

    expect(document.getElementById(PANEL_ID)?.hidden).toBe(false);
  });

  it("closes on Escape from inside the panel and gives focus back to the trigger", () => {
    const { trigger } = mountPage();
    uninstall = initializeCodeEnhancements();
    trigger.focus();
    const link = panelLink();
    link.focus();

    link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(document.getElementById(PANEL_ID)?.hidden).toBe(true);
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
