import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { GridImpl, initSheetwrite } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Theme } from "../src/types.js";
import { coreStyles, elementAdded, makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

// Distinctive colors, so a seeded custom property is unmistakable.
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

let restore_stubs: () => void;
const mounted: Array<{ host: HTMLElement; grid: GridImpl }> = [];
const injected_styles: HTMLStyleElement[] = [];

beforeAll(async () => {
  await initSheetwrite();
});

beforeEach(() => {
  restore_stubs = installCanvasTestStubs();
});

afterEach(() => {
  for (const { host, grid } of mounted.splice(0)) {
    grid.destroy();
    host.remove();
  }
  for (const style of injected_styles.splice(0)) style.remove();
  restore_stubs();
});

// The grid mounts the default toolbar, which loads lazily: awaiting its module
// runs the grid's mount callback first.
async function make_grid(): Promise<{ host: HTMLDivElement; grid: GridImpl }> {
  const workbook = makeWorkbook();
  const store = new SheetwriteStore(workbook, makeColumnarData(50));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook, config: {}, theme: THEME }, store);
  mounted.push({ host, grid });
  await import("../src/ribbon/command-toolbar.js");
  return { host, grid };
}

function inject_style(css: string): void {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  injected_styles.push(style);
}

describe("built-in widget styling", () => {
  // No widget paints a light-theme colour under a dark theme. The menu shadow
  // and the disabled row opacity are the same in every theme.
  it("derives every unseeded widget custom property from seeded ones", async () => {
    const { host } = await make_grid();
    const seeded = (name: string) => host.style.getPropertyValue(name) !== "";
    const constants: Readonly<Record<string, true>> = {
      "--sheetwrite-menu-shadow": true,
      "--sheetwrite-menu-disabled-opacity": true,
    };
    const reads: { name: string; fallback: string }[] = [];
    for (const css of [
      coreStyles(),
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

  // A host rule on the widget wins over the value the root seeds, without !important.
  it("resolves seeded vars to themed colors and lets a host rule override without !important", async () => {
    inject_style(coreStyles());
    const { host } = await make_grid();
    // Ctrl+F on the host loads the find bar's chunk and shows the bar.
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }));
    const find_el = await elementAdded(host, ".sheetwrite-find", HTMLDivElement);
    const toolbar_el = host.querySelector(".sheetwrite-toolbar")!;

    expect(getComputedStyle(find_el).background).toBe(THEME.bg);
    expect(getComputedStyle(toolbar_el).background).toBe(THEME.headerBg);
    inject_style(".sheetwrite-find { --sheetwrite-widget-bg: #abcabc; }");
    expect(getComputedStyle(find_el).background).toBe("#abcabc");
  });
});

describe("stylesheet parts", () => {
  // Warning deduplication lasts for the whole module lifetime. Each mode needs
  // a fresh process, independent of widgets mounted by earlier tests.
  it.each([
    ["development", "1"],
    ["production", "0"],
  ])("checks missing styles in %s builds", async (mode, expected_warnings) => {
    const probe = Bun.spawn(
      [
        process.execPath,
        "--preload",
        "./test-setup.ts",
        "./packages/core/test/style-parts-probe.ts",
        expected_warnings,
      ],
      {
        cwd: new URL("../../..", import.meta.url).pathname,
        env: { ...process.env, NODE_ENV: mode },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [exit_code, stdout, stderr] = await Promise.all([
      probe.exited,
      new Response(probe.stdout).text(),
      new Response(probe.stderr).text(),
    ]);
    expect({ exitCode: exit_code, stdout, stderr }).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  });
});
