import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";

import { installCodePopovers } from "../src/lib/code-popovers.js";

// Focus, Escape, links inside a panel and route changes are owned by
// test/browser/documentation-controls.spec.ts on a real page.

const PANEL_ID = "popover-create-grid";
const OTHER_PANEL_ID = "popover-grid";
/** Longer than the close delay, so a scheduled close has run. */
const AFTER_CLOSE_DELAY_MS = 150;

/**
 * One rendered docs page: a code block whose triggers name panels in the
 * page's inert popover store, as the build emits them.
 */
function mountPage(): { page: HTMLElement; mentions: HTMLElement[] } {
  const page = document.createElement("article");
  page.innerHTML = `
    <pre><code><span tabindex="0" data-sw-code-popover-trigger="${PANEL_ID}">createGrid</span>(<span tabindex="0" data-sw-code-popover-trigger="${OTHER_PANEL_ID}">grid</span>, <span tabindex="0" data-sw-code-popover-trigger="${PANEL_ID}">createGrid</span>)</code></pre>
    <template class="sw-code-popover-store">
      <span id="${PANEL_ID}" role="tooltip" data-sw-code-popover-panel="">createGrid</span>
      <span id="${OTHER_PANEL_ID}" role="tooltip" data-sw-code-popover-panel="">Grid</span>
    </template>`;
  document.body.append(page);
  return {
    page,
    mentions: [...page.querySelectorAll<HTMLElement>("[data-sw-code-popover-trigger]")],
  };
}

function firstMention(mentions: readonly HTMLElement[]): HTMLElement {
  const [trigger] = mentions;
  if (trigger === undefined) throw new Error("The page has no popover trigger");
  return trigger;
}

/** True when the panel is in the document and shown. */
function isOpen(id = PANEL_ID): boolean {
  return document.getElementById(id)?.hasAttribute("data-open") ?? false;
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
  it("serves triggers that mount after it is installed", async () => {
    uninstall = installCodePopovers();
    const { mentions } = mountPage();
    // Mutation observers report in a microtask after the DOM change.
    await Promise.resolve();

    pointer("pointerover", firstMention(mentions));

    expect(isOpen()).toBe(true);
  });

  it("closes a hovered panel after the pointer leaves the trigger", () => {
    const { mentions, page } = mountPage();
    const trigger = firstMention(mentions);
    uninstall = installCodePopovers();
    pointer("pointerover", trigger);

    pointer("pointerout", trigger, page);
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);

    expect(isOpen()).toBe(false);
    expect(trigger.hasAttribute("data-popover-open")).toBe(false);
  });

  it("stays open while the pointer travels from the trigger into the panel", () => {
    const trigger = firstMention(mountPage().mentions);
    uninstall = installCodePopovers();
    pointer("pointerover", trigger);
    const panel = document.getElementById(PANEL_ID);
    if (panel === null) throw new Error("The panel did not open");

    pointer("pointerout", trigger, panel);
    pointer("pointerover", panel, trigger);
    vi.advanceTimersByTime(AFTER_CLOSE_DELAY_MS);

    expect(isOpen()).toBe(true);
  });

  it("marks the other mentions of the open symbol in the same code block", () => {
    const [first, other, sameSymbol] = mountPage().mentions;
    if (first === undefined || other === undefined || sameSymbol === undefined) {
      throw new Error("The page has three mentions");
    }
    uninstall = installCodePopovers();

    pointer("pointerover", first);
    expect(sameSymbol.hasAttribute("data-popover-related")).toBe(true);
    expect(other.hasAttribute("data-popover-related")).toBe(false);

    pointer("pointerover", other);
    expect(sameSymbol.hasAttribute("data-popover-related")).toBe(false);
    expect(isOpen()).toBe(false);
    expect(isOpen(OTHER_PANEL_ID)).toBe(true);
  });
});
