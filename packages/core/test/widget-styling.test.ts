import { afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { readFileSync } from "node:fs";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridConfig, Theme } from "../src/types.js";
import { elementAdded, makeColumnarData, makeWorkbook } from "./fixtures.js";

// A full, deliberately un-themey palette. Passing every Theme field avoids
// Partial-merge ambiguity, and the distinctive hex values make the seeded
// custom properties (and their var() resolution) unmistakable regardless of
// stylesheet load order — opts.theme wins last over DEFAULT_THEME and CSS.
const THEME: Theme = {
  font: "20px monospace",
  bg: "#010203",
  fg: "#040506",
  gridLine: "#070809",
  headerBg: "#0a0b0c",
  headerFg: "#0d0e0f",
  selection: "#10111299",
  selectionBorder: "#141516",
  rowHeight: 28,
  headerHeight: 32,
  rowHeaderWidth: 48,
  searchMatch: "#171819",
  searchActiveMatch: "#1a1b1c",
  highlight: "#1d1e1f",
};

const originalRaf = globalThis.requestAnimationFrame;
let restoreStubs: () => void;

// Grids/hosts and stylesheets created per test, torn down in afterEach so no
// listeners, DOM, or CSS leak across tests (full-suite isolation).
const mounted: Array<{ host: HTMLElement; grid: GridImpl }> = [];
const injectedStyles: HTMLStyleElement[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restoreStubs = installCanvasTestStubs();

  // Make scheduled renders run synchronously so a resize's repaint is observable
  // without racing a real animation-frame timer.
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  for (const { host, grid } of mounted.splice(0)) {
    grid.destroy();
    host.remove();
  }
  for (const style of injectedStyles.splice(0)) style.remove();
  restoreStubs();
  globalThis.requestAnimationFrame = originalRaf;
});

function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

// `config: {}` is truthy with no flag disabled, so the grid mounts the default
// toolbar; the context menu and find bar are on by default. A caller-supplied
// store keeps this WASM-light. The toolbar loads lazily: awaiting its module
// runs the grid's mount callback first.
async function makeGrid(
  config: GridConfig = {},
): Promise<{ host: HTMLDivElement; grid: GridImpl }> {
  const workbook = makeWorkbook();
  const store = new SheetwriteStore(workbook, makeColumnarData(50));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook, config, theme: THEME }, store);
  mounted.push({ host, grid });
  await import("../src/ribbon/command-toolbar.js");
  return { host, grid };
}

function injectStyle(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  injectedStyles.push(style);
  return style;
}

/** styles.css with the parts it imports inlined, as a bundler serves it. */
function allStyles(): string {
  const index = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  return index.replace(/@import "\.\/(styles\/[a-z-]+\.css)";/g, (_, part: string) =>
    readFileSync(new URL(`../${part}`, import.meta.url), "utf8"),
  );
}

function mustFind<T extends Element = HTMLElement>(host: HTMLElement, selector: string): T {
  const node = host.querySelector(selector);
  if (!node) throw new Error(`expected ${selector} to be mounted`);
  return node as unknown as T;
}

describe("built-in widget styling", () => {
  // Contract: every widget token the stylesheets read either is seeded or
  // falls back to a value derived from seeded tokens, so no widget paints a
  // light-theme colour under a dark theme. The menu shadow and the disabled
  // row opacity are the same in every theme and fall back to plain values.
  it("derives every unseeded widget custom property from seeded ones", async () => {
    const { host } = await makeGrid();
    const seeded = (name: string) => host.style.getPropertyValue(name) !== "";
    const constants: Readonly<Record<string, true>> = {
      "--sheetwrite-menu-shadow": true,
      "--sheetwrite-menu-disabled-opacity": true,
    };
    const reads: { name: string; fallback: string }[] = [];
    for (const css of [
      allStyles(),
      readFileSync(new URL("../shell.css", import.meta.url), "utf8"),
    ]) {
      for (const match of css.matchAll(/var\((--sheetwrite-(?:widget|toolbar|menu)-[a-z-]+)/g)) {
        // The fallback runs from the first comma to the parenthesis that closes this var().
        let depth = 1;
        let end = (match.index ?? 0) + match[0].length;
        while (depth > 0 && end < css.length) {
          const char = css[end];
          if (char === "(") depth += 1;
          if (char === ")") depth -= 1;
          end += 1;
        }
        const rest = css.slice((match.index ?? 0) + match[0].length, end - 1);
        reads.push({ name: match[1] ?? "", fallback: rest.replace(/^\s*,\s*/, "") });
      }
    }
    const problems = reads.filter(({ name, fallback }) => {
      if (seeded(name)) return false;
      const used = [...fallback.matchAll(/var\((--[a-z-]+)/g)].map((match) => match[1] ?? "");
      if (constants[name]) return used.length > 0;
      return used.length === 0 || !used.every(seeded);
    });

    expect(reads.length).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  // ── Computed-style parity + host override (the core restyling proof) ───────
  // Contract: with the real stylesheet loaded the seeded tokens flow through
  // var() to the exact themed colors, AND a host rule setting the token on the
  // widget element wins over the ancestor-inherited value WITHOUT !important —
  // which is the whole point of seeding on the root, not the widget.
  it("resolves seeded vars to themed colors and lets a host rule override without !important", async () => {
    injectStyle(allStyles());

    const { host } = await makeGrid();

    // Ctrl+F on the host loads the find bar's chunk and shows the bar.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    const findEl = await elementAdded(host, ".sheetwrite-find", HTMLDivElement);
    const toolbarEl = mustFind<HTMLElement>(host, ".sheetwrite-toolbar");

    // Capability probe: does this happy-dom resolve var() in getComputedStyle?
    // If a future version regresses, we degrade to the seeding/structure proof
    // above rather than emit a false failure on an engine limitation.
    const probe = document.createElement("div");
    probe.className = "__probe";
    probe.style.setProperty("--x", "#020202");
    document.body.appendChild(probe);
    injectStyle(".__probe { background: var(--x); }");
    const varSupported = getComputedStyle(probe).background === "#020202";
    probe.remove();

    if (varSupported) {
      // Default parity: seeded tokens resolve through var() to the themed values.
      expect(getComputedStyle(findEl).background).toBe(THEME.bg);
      expect(getComputedStyle(toolbarEl).background).toBe(THEME.headerBg);

      // Host override wins without !important: a rule matching the widget
      // directly beats the value inherited from the ancestor host root.
      injectStyle(".sheetwrite-find { --sheetwrite-widget-bg: #abcabc; }");
      const overridden = getComputedStyle(findEl).background;
      expect(overridden).toBe("#abcabc");
      expect(overridden).not.toBe(THEME.bg);
    } else {
      // Fallback: the seeding + structure contract still holds.
      expect(host.style.getPropertyValue("--sheetwrite-widget-bg")).toBe(THEME.bg);
      expect(getComputedStyle(findEl).display).toBe("flex");
    }
  });
});

describe("stylesheet parts", () => {
  // Contract: in development builds a widget whose stylesheet part is missing
  // warns once, naming the part to import, and a loaded part keeps it quiet.
  it("warns once in development when a widget's part is missing", async () => {
    const nodeEnv = process.env.NODE_ENV;
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.NODE_ENV = "development";
    try {
      injectStyle(readFileSync(new URL("../styles/grid.css", import.meta.url), "utf8"));
      for (let grids = 0; grids < 2; grids += 1) {
        const { host } = await makeGrid({ toolbar: false, tabs: false });
        host.dispatchEvent(
          new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
        );
        await elementAdded(host, ".sheetwrite-find", HTMLDivElement);
      }

      const warnings = warn.mock.calls
        .map(([message]) => String(message))
        .filter((message) => message.startsWith("Sheetwrite:"));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('"@sheetwrite/core/styles/find.css"');
    } finally {
      process.env.NODE_ENV = nodeEnv;
      warn.mockRestore();
    }
  });
});
