import { describe, expect, it } from "bun:test";

import type { Grid } from "@sheetwrite/core";
import { act, createRef, type ReactElement, Suspense, startTransition } from "react";
import { createRoot } from "react-dom/client";

import {
  makeConformanceWorkbook,
  present,
  runSharedAdapterLifecycleContract,
} from "../../../test/adapter-lifecycle-contract.js";
import { Sheetwrite, SheetwriteGrid } from "../src/index.js";
import { mountReact } from "./mount.js";

runSharedAdapterLifecycleContract("React", mountReact);

function mountRoot() {
  const host = document.body.appendChild(document.createElement("div"));
  return { host, root: createRoot(host), gridRef: createRef<Grid>() };
}

describe("SheetwriteGrid React lifecycle", () => {
  it("renders on the server without layout-effect diagnostics", async () => {
    const source = new URL("../dist/index.js", import.meta.url).pathname;
    const script = `
      import { createElement } from "react";
      import { renderToString } from "react-dom/server";
      import { SheetwriteGrid } from ${JSON.stringify(source)};
      const errors = [];
      console.error = (...args) => errors.push(args.map(String).join(" "));
      const workbook = ${JSON.stringify(makeConformanceWorkbook())};
      const html = renderToString(createElement(SheetwriteGrid, { workbook, onViewportChange() {} }));
      process.stdout.write(JSON.stringify({ errors, html }));
    `;
    const child = Bun.spawn(["node", "--input-type=module", "-e", script], {
      cwd: new URL("../../../", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout) as { errors: string[]; html: string };
    expect(result.errors).toEqual([]);
    expect(result.html).toStartWith("<div");
  });

  it("does not publish callbacks from a concurrent render that is later abandoned", async () => {
    const workbook = makeConformanceWorkbook();
    const { root, gridRef } = mountRoot();
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

    /** Refreshes the committed grid and returns the callbacks it reached. */
    const refreshCalls = (grid: Grid): string[] => {
      calls.length = 0;
      grid.refresh();
      return [...calls];
    };

    await act(async () => root.render(<Harness callback="committed" suspend={false} />));
    const committedGrid = present(gridRef.current, "committed grid");

    await act(async () => {
      startTransition(() => root.render(<Harness callback="abandoned" suspend />));
      await Promise.resolve();
    });
    expect(suspendedRenders).toBeGreaterThan(0);
    expect(gridRef.current).toBe(committedGrid);
    const afterAbandon = refreshCalls(committedGrid);
    expect(afterAbandon).toContain("committed");
    expect(afterAbandon).not.toContain("abandoned");

    await act(async () => root.render(<Harness callback="replacement" suspend={false} />));
    expect(gridRef.current).toBe(committedGrid);
    const replaced = refreshCalls(committedGrid);
    expect(replaced).toContain("replacement");
    expect(replaced).not.toContain("committed");

    suspended.resolve();
    await act(async () => root.unmount());
  });

  it("builds an uncontrolled data-first grid and resets on defaultRows identity", async () => {
    const { root, gridRef } = mountRoot();
    const columns = [
      { key: "name", title: "Name" },
      { key: "price", title: "Price", type: "currency" as const },
    ] as const;
    const firstRows = [{ name: "Notebook", price: 12.5 }];
    const ready: Array<{ generation: number; reason: string }> = [];
    const render = (defaultRows: typeof firstRows) =>
      act(async () => {
        root.render(
          <Sheetwrite
            ref={gridRef}
            columns={columns}
            defaultRows={defaultRows}
            height={200}
            onReady={({ generation, reason }) => ready.push({ generation, reason })}
          />,
        );
      });

    await render(firstRows);
    const first = present(gridRef.current, "first grid");
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

    await render([{ name: "Pen", price: 2.25 }]);
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
