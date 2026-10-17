import { afterEach, beforeAll, beforeEach, describe, expect, it, jest, spyOn } from "bun:test";

import { ContextMenu } from "../src/context-menu.js";
import { createGrid, DEFAULT_THEME, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { Grid, ToolbarItem } from "../src/types.js";
import { makeColumnarData, makeWorkbook } from "./fixtures.js";

let restoreCanvas: () => void;
let grid: Grid | undefined;

beforeAll(async () => {
  await initSheetwrite();
});
beforeEach(() => {
  restoreCanvas = installCanvasTestStubs();
});
afterEach(() => {
  grid?.destroy();
  grid = undefined;
  restoreCanvas();
  document.body.replaceChildren();
});

function mount(toolbar: ToolbarItem[]): HTMLElement {
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 800 }, clientHeight: { value: 400 } });
  document.body.append(host);
  grid = createGrid(host, {
    workbook: makeWorkbook(3),
    data: makeColumnarData(3),
    config: { toolbar, contextMenu: [{ id: "copy", action: "copy" }], find: true },
  });
  return host;
}

function button(host: HTMLElement, title: string): HTMLButtonElement {
  const control = host.querySelector<HTMLButtonElement>(`button[title="${title}"]`);
  if (!control) throw new Error(`Missing button: ${title}`);
  return control;
}

async function flush(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

describe("built-in action feedback", () => {
  it("ignores a second start while a toolbar command is pending and restores the control", async () => {
    let finish: (() => void) | undefined;
    let starts = 0;
    const host = mount([
      {
        title: "Save",
        icon: "Save",
        onClick: () => {
          starts += 1;
          return new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      },
    ]);
    const control = button(host, "Save");
    control.click();
    control.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(starts).toBe(1);
    expect(control.disabled).toBe(true);
    expect(control.getAttribute("aria-busy")).toBe("true");
    finish?.();
    await flush();
    expect(control.disabled).toBe(false);
    expect(control.hasAttribute("aria-busy")).toBe(false);
    control.click();
    expect(starts).toBe(2);
    finish?.();
    await flush();
  });

  it("shows a failed command in an alert and clears the message after its display interval", async () => {
    jest.useFakeTimers();
    try {
      const host = mount([
        {
          title: "Save",
          onClick: () => {
            throw new Error("Server unavailable");
          },
        },
      ]);
      button(host, "Save").click();
      await flush();
      const alert = host.querySelector<HTMLElement>("[role=alert]");
      expect(alert?.hidden).toBe(false);
      expect(alert?.textContent).toContain("Server unavailable");
      jest.advanceTimersByTime(6000);
      expect(alert?.hidden).toBe(true);
      expect(alert?.textContent).toBe("");
      expect(button(host, "Save").disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows blocked clipboard access after a context-menu command closes the menu", async () => {
    const host = mount([]);
    if (!grid) throw new Error("Grid did not mount");
    const copy = spyOn(grid.actions, "copy").mockResolvedValue("blocked");
    const menu = new ContextMenu(
      host,
      { contextMenu: [{ id: "copy", action: "copy" }] },
      DEFAULT_THEME,
      grid.actions,
      grid,
    );
    try {
      const cell = { sheet: "s1", row: 0, col: 0 };
      grid.setSelection({ kind: "cell", addr: cell });
      menu.open({ cell, clientX: 0, clientY: 0 });
      const control = host.querySelector<HTMLElement>('[data-context-menu-item="copy"]');
      if (!control) throw new Error("Copy menu item did not open");
      control.click();
      await flush();
      expect(copy).toHaveBeenCalledTimes(1);
      expect(host.querySelector<HTMLElement>("[role=alert]")?.textContent).toContain(
        "blocked clipboard access",
      );
    } finally {
      menu.destroy();
      copy.mockRestore();
    }
  });

  for (const format of ["csv", "xlsx"] as const) {
    it(`shows ${format} export failures and emits the format without rejecting the action`, async () => {
      const host = mount([{ action: format === "csv" ? "exportCsv" : "exportXlsx" }]);
      if (!grid) throw new Error("Grid did not mount");
      const failure = new Error("Download failed");
      const exporter =
        format === "csv"
          ? spyOn(grid, "exportCsv").mockImplementation(() => {
              throw failure;
            })
          : spyOn(grid, "exportXlsx").mockRejectedValue(failure);
      const failures: unknown[] = [];
      grid.on("export-error", (event) => failures.push(event));
      try {
        if (format === "csv") grid.actions.exportCsv();
        else await expect(grid.actions.exportXlsx()).resolves.toBeUndefined();
        await flush();
        expect(failures).toMatchObject([
          { format, error: { code: "export-failed", message: "Download failed", cause: failure } },
        ]);
        expect(host.querySelector<HTMLElement>("[role=alert]")?.textContent).toContain(
          "Download failed",
        );
      } finally {
        exporter.mockRestore();
      }
    });
  }
});
