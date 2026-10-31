import { afterEach, beforeAll, describe, expect, it } from "bun:test";

import { actionFeedbackFor } from "../src/action-feedback.js";
import { createGrid, initSheetwrite } from "../src/grid.js";
import { showFormulaExplanation } from "../src/panels/panel-loader.js";
import { menuButton } from "../src/panels/panel-menu.js";
import { createSpreadsheetShell } from "../src/shell.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

/** Enough cells (3 columns) that a summary yields after two reads and an auto-fit runs over frames. */
const ROWS = 50_000;
/** Microtask turns for a loaded chunk's mount callback to run. */
const MOUNT_TURNS = 8;
/** Rounds of frames that pending frames may schedule while the probe flushes them. */
const FRAME_ROUNDS = 4;

interface LiveResources {
  timers: number;
  frames: number;
  listeners: number;
  observers: number;
  objectUrls: number;
}

type ListenerTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Counts the timers, animation frames, observers, object URLs and listeners
 * on shared targets (document, window, the grid host, media queries) that are
 * alive, and the callbacks of any of them that run after `markDestroyed()`.
 * Every global it replaces comes back in `restore()`.
 */
class LifetimeProbe {
  callsAfterDestroy = 0;
  private destroyed = false;
  private readonly timers = new Set<unknown>();
  private readonly frames = new Map<number, FrameRequestCallback>();
  private nextFrame = 1;
  private readonly listeners = new Set<object>();
  private readonly listenerRecords = new WeakMap<EventListener, object>();
  private readonly observers = new Set<object>();
  private readonly objectUrls = new Set<string>();
  private readonly restores: Array<() => void> = [];

  constructor() {
    this.trackTimers();
    this.trackFrames();
    this.trackObservers();
    this.trackObjectUrls();
    this.trackListeners(document);
    this.trackListeners(globalThis);
    const matchMedia = globalThis.matchMedia;
    this.replace(globalThis, "matchMedia", (query: string) => {
      const list = matchMedia(query);
      this.trackListeners(list);
      return list;
    });
  }

  live(): LiveResources {
    return {
      timers: this.timers.size,
      frames: this.frames.size,
      listeners: this.listeners.size,
      observers: this.observers.size,
      objectUrls: this.objectUrls.size,
    };
  }

  markDestroyed(): void {
    this.destroyed = true;
  }

  /** Run every pending frame, and the frames those schedule. */
  flushFrames(): void {
    for (let round = 0; round < FRAME_ROUNDS; round++) {
      const pending = [...this.frames.values()];
      this.frames.clear();
      for (const callback of pending) callback(performance.now());
    }
  }

  trackListeners(target: ListenerTarget): void {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    const wrappers = new Map<EventListenerOrEventListenerObject, Map<string, EventListener>>();
    const keyOf = (type: string, options?: boolean | EventListenerOptions): string =>
      `${type}:${typeof options === "boolean" ? options : Boolean(options?.capture)}`;

    const addListener: EventTarget["addEventListener"] = (type, listener, options) => {
      const signal = typeof options === "object" ? options.signal : undefined;
      if (listener === null || signal?.aborted === true) {
        add(type, listener, options);
        return;
      }
      const key = keyOf(type, options);
      const byKey = wrappers.get(listener) ?? new Map<string, EventListener>();
      if (byKey.has(key)) return;

      const record = {};
      const once = typeof options === "object" && options.once === true;
      const wrapper: EventListener = (event) => {
        if (once) this.listeners.delete(record);
        if (this.destroyed) this.callsAfterDestroy += 1;
        if (typeof listener === "function") listener.call(target, event);
        else listener.handleEvent(event);
      };
      byKey.set(key, wrapper);
      wrappers.set(listener, byKey);
      this.listeners.add(record);
      this.listenerRecords.set(wrapper, record);
      signal?.addEventListener("abort", () => this.listeners.delete(record), { once: true });
      add(type, wrapper, options);
    };
    const removeListener: EventTarget["removeEventListener"] = (type, listener, options) => {
      const key = keyOf(type, options);
      const wrapper = listener === null ? undefined : wrappers.get(listener)?.get(key);
      if (listener === null || wrapper === undefined) {
        remove(type, listener, options);
        return;
      }

      wrappers.get(listener)?.delete(key);
      const record = this.listenerRecords.get(wrapper);
      if (record !== undefined) this.listeners.delete(record);
      remove(type, wrapper, options);
    };
    this.replace(target, "addEventListener", addListener);
    this.replace(target, "removeEventListener", removeListener);
  }

  restore(): void {
    for (const restore of this.restores.splice(0).reverse()) restore();
  }

  private trackTimers(): void {
    const setTimer = globalThis.setTimeout;
    const clearTimer = globalThis.clearTimeout;
    this.replace(globalThis, "setTimeout", (callback: () => void, delayMs?: number) => {
      const timer = setTimer(() => {
        this.timers.delete(timer);
        if (this.destroyed) this.callsAfterDestroy += 1;
        callback();
      }, delayMs);
      this.timers.add(timer);
      return timer;
    });
    this.replace(globalThis, "clearTimeout", (timer: Parameters<typeof clearTimeout>[0]) => {
      this.timers.delete(timer);
      clearTimer(timer);
    });
  }

  private trackFrames(): void {
    this.replace(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = this.nextFrame++;
      this.frames.set(id, (time) => {
        if (this.destroyed) this.callsAfterDestroy += 1;
        callback(time);
      });
      return id;
    });
    this.replace(globalThis, "cancelAnimationFrame", (id: number) => {
      this.frames.delete(id);
    });
  }

  private trackObservers(): void {
    const observers = this.observers;
    class TrackedResizeObserver {
      observe(): void {
        observers.add(this);
      }
      unobserve(): void {}
      disconnect(): void {
        observers.delete(this);
      }
    }
    this.replace(globalThis, "ResizeObserver", TrackedResizeObserver);
  }

  private trackObjectUrls(): void {
    let serial = 0;
    this.replace(URL, "createObjectURL", () => {
      serial += 1;
      const url = `blob:lifetime-probe-${serial}`;
      this.objectUrls.add(url);
      return url;
    });
    this.replace(URL, "revokeObjectURL", (url: string) => {
      this.objectUrls.delete(url);
    });
    // A download click would navigate the test page.
    this.replace(HTMLAnchorElement.prototype, "click", () => {});
  }

  private replace(target: object, key: string, value: unknown): void {
    const own = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
    this.restores.push(() => {
      if (own === undefined) Reflect.deleteProperty(target, key);
      else Object.defineProperty(target, key, own);
    });
  }
}

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  document.body.appendChild(host);
  return host;
}

async function mountTurns(): Promise<void> {
  for (let turn = 0; turn < MOUNT_TURNS; turn++) await Promise.resolve();
}

let restoreCanvas: (() => void) | undefined;
let probe: LifetimeProbe | undefined;

beforeAll(async () => {
  await initSheetwrite();
});

afterEach(() => {
  probe?.restore();
  probe = undefined;
  restoreCanvas?.();
  restoreCanvas = undefined;
  document.body.replaceChildren();
});

// The dynamic imports below wait for the grid's own lazy chunk loads: these
// tests exercise the chunk boundary, so the imports must stay dynamic.
describe("grid destroy", () => {
  it("leaves no timer, frame, listener, observer or object URL that can run", async () => {
    restoreCanvas = installCanvasTestStubs();
    const lifetime = new LifetimeProbe();
    probe = lifetime;
    const host = mountHost();
    lifetime.trackListeners(host);
    const grid = createGrid(host, {
      workbook: makeWorkbook(ROWS),
      data: makeColumnarData(ROWS),
      config: { ribbon: true },
    });
    await import("../src/ribbon/ribbon.js");
    grid.actions.find();
    await import("../src/find-bar.js");
    await mountTurns();

    // Work in flight at destroy: a summary between chunks, an auto-fit
    // between frames, an export before its URL is revoked, a feedback
    // message, an open side panel and an open context menu.
    grid.setSelection({
      kind: "range",
      range: { sheet: "s1", start: { row: 0, col: 0 }, end: { row: ROWS - 1, col: 2 } },
    });
    const summary = grid.summarizeSelection().catch((error: unknown) => error);
    grid.autoFitColumns();
    grid.actions.exportCsv("lifetime.csv");
    actionFeedbackFor(grid)?.show("Saved.");
    grid.openPanel({
      title: "Notes",
      render: () => {
        const panel = new AbortController();
        document.addEventListener("keydown", () => {}, { signal: panel.signal });
        return () => panel.abort();
      },
    });
    host
      .querySelector(".sheetwrite-scroller")
      ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 120, clientY: 60 }));

    const before = lifetime.live();
    expect(before.timers).toBeGreaterThan(0);
    expect(before.frames).toBeGreaterThan(0);
    expect(before.listeners).toBeGreaterThan(0);
    expect(before.observers).toBeGreaterThan(0);
    expect(before.objectUrls).toBeGreaterThan(0);

    grid.destroy();
    lifetime.markDestroyed();

    expect(lifetime.live()).toEqual({
      timers: 0,
      frames: 0,
      listeners: 0,
      observers: 0,
      objectUrls: 0,
    });
    for (const type of ["pointerdown", "keydown", "scroll", "resize", "selectionchange"]) {
      for (const target of [document, window, host]) target.dispatchEvent(new Event(type));
    }
    lifetime.flushFrames();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(lifetime.callsAfterDestroy).toBe(0);
    expect(await summary).toMatchObject({ name: "AbortError" });
  });

  it("drops chrome, find bar and panel chunks that load after destroy", async () => {
    restoreCanvas = installCanvasTestStubs();
    const host = mountHost();
    const grid: Grid = createGrid(host, { workbook: makeWorkbook(3), config: { ribbon: true } });
    grid.actions.find();
    showFormulaExplanation(grid);
    grid.destroy();

    await import("../src/ribbon/ribbon.js");
    await import("../src/find-bar.js");
    await import("../src/panels/panel-controller.js");
    await mountTurns();

    expect(host.childElementCount).toBe(0);
  });

  it("drops shell chrome that loads after the shell is destroyed", async () => {
    restoreCanvas = installCanvasTestStubs();
    const host = mountHost();
    const shell = createSpreadsheetShell(host, {
      grid: { workbook: makeWorkbook(3) },
      ribbon: true,
    });
    const toolbarRow = shell.element.querySelector(".sheetwrite-shell-toolbar-row");
    shell.destroy();

    await import("../src/shell/ribbon-factory.js");
    await mountTurns();

    expect(toolbarRow?.childElementCount).toBe(0);
  });
});

describe("panel menu", () => {
  it("stops listening on the document when its panel's signal aborts", () => {
    const lifetime = new LifetimeProbe();
    probe = lifetime;
    const panel = new AbortController();
    const wrapper = menuButton("Field actions", "field-0-menu", () => [], panel.signal);
    document.body.appendChild(wrapper);
    wrapper.querySelector("button")?.click();
    expect(lifetime.live().listeners).toBe(1);

    panel.abort();

    expect(lifetime.live().listeners).toBe(0);
  });
});
