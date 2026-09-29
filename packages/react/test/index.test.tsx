import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { Grid, GridEvents, Workbook } from "@sheetwrite/core";
import { initSheetwrite } from "@sheetwrite/core";
import { installCanvasTestStubs } from "@sheetwrite/core/testing";
import { act, createRef, type ReactElement, StrictMode, Suspense, startTransition } from "react";
import { createRoot } from "react-dom/client";
import {
  type AdapterConformanceProps,
  type MountedAdapter,
  runSharedAdapterLifecycleContract,
} from "../../../test/adapter-lifecycle-contract.js";
import { Sheetwrite, SheetwriteGrid } from "../src/index.js";

beforeAll(async () => {
  await initSheetwrite();
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let restoreStubs: () => void;

beforeEach(() => {
  document.body.replaceChildren();
  restoreStubs = installCanvasTestStubs();
});

afterEach(() => {
  restoreStubs();
});

function makeWorkbook(extraSheet = false): Workbook {
  const workbook: Workbook = {
    activeSheet: "sheet",
    sheets: [
      {
        id: "sheet",
        name: "Sheet",
        rowCount: 3,
        columns: [{ key: "value", header: "Value", width: 100, type: "text" }],
      },
    ],
  };
  if (extraSheet) {
    workbook.sheets.push({
      id: "sheet2",
      name: "Summary",
      rowCount: 2,
      columns: [{ key: "note", header: "Note", width: 200, type: "text" }],
    });
  }
  return workbook;
}

async function mountConformanceGrid(props: AdapterConformanceProps): Promise<MountedAdapter> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const gridRef = createRef<Grid>();
  const publishedAtReady: Array<Grid | null | undefined> = [];

  const render = async (nextProps: AdapterConformanceProps): Promise<void> => {
    const { fallbackLabel, ...gridProps } = nextProps;
    await act(async () => {
      root.render(
        <SheetwriteGrid
          {...gridProps}
          ref={gridRef}
          fallback={<span data-lifecycle-fallback>{fallbackLabel}</span>}
          onReady={(event) => {
            publishedAtReady.push(gridRef.current);
            gridProps.onReady?.(event);
          }}
        />,
      );
    });
  };

  await render(props);
  return {
    host,
    publishedAtReady,
    getPublishedGrid: () => gridRef.current,
    render,
    unmount: async () => {
      await act(async () => root.unmount());
    },
  };
}

runSharedAdapterLifecycleContract("React", mountConformanceGrid);

describe("SheetwriteGrid React lifecycle", () => {
  it("renders on the server without layout-effect diagnostics", async () => {
    const source = new URL("../src/index.tsx", import.meta.url).pathname;
    const script = `
      import { createElement } from "react";
      import { renderToString } from "react-dom/server";
      import { SheetwriteGrid } from ${JSON.stringify(source)};
      const errors = [];
      console.error = (...args) => errors.push(args.map(String).join(" "));
      const workbook = {
        activeSheet: "sheet",
        sheets: [{
          id: "sheet",
          name: "Sheet",
          rowCount: 1,
          columns: [{ key: "value", header: "Value", width: 100, type: "text" }],
        }],
      };
      const html = renderToString(createElement(SheetwriteGrid, {
        workbook,
        onViewportChange() {},
      }));
      process.stdout.write(JSON.stringify({ errors, html }));
    `;
    const process = Bun.spawn(["bun", "-e", script], {
      cwd: new URL("../../../", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout) as { errors: string[]; html: string };
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('class="sheetwrite"');
  });

  it("forwards active-sheet through onActiveSheetChange, reading the live callback", async () => {
    const workbook = makeWorkbook(true);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const events: Array<GridEvents["active-sheet"]> = [];

    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          onActiveSheetChange={(event) => events.push(event)}
        />,
      );
    });

    gridRef.current!.setActiveSheet("sheet2");
    expect(events).toEqual([{ sheet: "sheet2" }]);

    // A re-render swaps the live callback without recreating the grid.
    const swapped: Array<GridEvents["active-sheet"]> = [];
    const first = gridRef.current;
    await act(async () => {
      root.render(
        <SheetwriteGrid
          ref={gridRef}
          workbook={workbook}
          onActiveSheetChange={(event) => swapped.push(event)}
        />,
      );
    });

    expect(gridRef.current).toBe(first);
    gridRef.current!.setActiveSheet("sheet");
    expect(events).toEqual([{ sheet: "sheet2" }]);
    expect(swapped).toEqual([{ sheet: "sheet" }]);

    await act(async () => root.unmount());
  });

  it("does not publish callbacks from a concurrent render that is later abandoned", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const calls: string[] = [];
    const suspended = Promise.withResolvers<void>();
    let suspendedRenders = 0;

    function SuspendAfterGrid({ active }: { active: boolean }): ReactElement | null {
      if (!active) return null;
      suspendedRenders += 1;
      throw suspended.promise;
    }

    function Harness({ callback, suspend }: { callback: string; suspend: boolean }): ReactElement {
      return (
        <Suspense fallback={null}>
          <SheetwriteGrid
            ref={gridRef}
            workbook={workbook}
            onViewportChange={() => calls.push(callback)}
          />
          <SuspendAfterGrid active={suspend} />
        </Suspense>
      );
    }

    await act(async () => {
      root.render(<Harness callback="committed" suspend={false} />);
    });
    const committedGrid = gridRef.current!;
    calls.length = 0;

    await act(async () => {
      startTransition(() => {
        root.render(<Harness callback="abandoned" suspend />);
      });
      await Promise.resolve();
    });
    expect(suspendedRenders).toBeGreaterThan(0);
    expect(gridRef.current).toBe(committedGrid);

    calls.length = 0;
    committedGrid.refresh();
    expect(calls).toContain("committed");
    expect(calls).not.toContain("abandoned");

    await act(async () => {
      root.render(<Harness callback="replacement" suspend={false} />);
    });
    expect(gridRef.current).toBe(committedGrid);
    calls.length = 0;
    committedGrid.refresh();
    expect(calls).toContain("replacement");
    expect(calls).not.toContain("committed");

    suspended.resolve();
    await act(async () => root.unmount());
  });

  it("StrictMode replay creates twice, keeps a live grid, and leaks nothing", async () => {
    const workbook = makeWorkbook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const ready: Grid[] = [];

    await act(async () => {
      root.render(
        <StrictMode>
          <SheetwriteGrid
            ref={gridRef}
            workbook={workbook}
            onReady={({ grid }) => ready.push(grid)}
          />
        </StrictMode>,
      );
    });

    // StrictMode replays the mount effect: create → destroy → create.
    expect(ready).toHaveLength(2);
    expect(gridRef.current).toBe(ready[1]!);
    expect(gridRef.current).not.toBe(ready[0]!);

    // The replayed-away first grid is fully torn down: exactly one live grid
    // remains inside the host.
    expect(host.querySelectorAll(".sheetwrite").length).toBe(1);

    await act(async () => root.unmount());
    expect(gridRef.current).toBeNull();
    expect(host.childElementCount).toBe(0);
  });

  it("never leaks GridOptions members to the DOM and triggers no unknown-prop warning", async () => {
    const workbook = makeWorkbook();
    const data = { rowCount: 3, columns: { value: ["a", "b", "c"] } };
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const warnings: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      warnings.push(args);
    };

    try {
      await act(async () => {
        root.render(<SheetwriteGrid workbook={workbook} data={data} overscan={4} />);
      });

      const div = host.firstElementChild as HTMLDivElement;
      expect(div.getAttribute("workbook")).toBeNull();
      expect(div.getAttribute("data")).toBeNull();
      expect(div.getAttribute("overscan")).toBeNull();

      // No React unknown-prop warnings surfaced.
      expect(warnings).toHaveLength(0);

      await act(async () => root.unmount());
    } finally {
      console.error = originalError;
    }
  });

  it("builds an uncontrolled data-first grid and resets on defaultRows identity", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const gridRef = createRef<Grid>();
    const columns = [
      { key: "name", title: "Name" },
      { key: "price", title: "Price", type: "currency" as const },
    ] as const;
    const firstRows = [{ name: "Notebook", price: 12.5 }];
    const ready: Array<{ generation: number; reason: string }> = [];

    await act(async () => {
      root.render(
        <Sheetwrite
          ref={gridRef}
          columns={columns}
          defaultRows={firstRows}
          height={200}
          onReady={({ generation, reason }) => ready.push({ generation, reason })}
        />,
      );
    });
    const first = gridRef.current!;
    first.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "sheet1", row: 0, col: 0 },
          value: { kind: "literal", value: "Edited" },
        },
      ],
    });
    expect(firstRows[0]?.name).toBe("Notebook");

    await act(async () => {
      root.render(
        <Sheetwrite
          ref={gridRef}
          columns={columns}
          defaultRows={[{ name: "Pen", price: 2.25 }]}
          height={200}
          onReady={({ generation, reason }) => ready.push({ generation, reason })}
        />,
      );
    });
    expect(gridRef.current).not.toBe(first);
    expect(gridRef.current?.store.getCell({ sheet: "sheet1", row: 0, col: 0 }).resolved).toBe(
      "Pen",
    );
    expect(ready).toEqual([
      { generation: 1, reason: "initial" },
      { generation: 2, reason: "input-reset" },
    ]);
    await act(async () => root.unmount());
  });
});
