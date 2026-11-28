import { expect, it } from "bun:test";

import {
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  toXlsxWorkbook,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import { book, sheet, valuesOf } from "./workbook-fixtures.js";

it("installs every backend through initSheetwrite, and a repeated install is a no-op", async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
  await initSheetwrite({ addons: [xlsxAddon()] });

  const snapshot = book([
    sheet("s", "Table", [["registered"]], {
      columns: [{ key: "value", header: "Value", width: 80, type: "text" }],
    }),
  ]);
  const store = SheetwriteStore.fromSnapshot(snapshot);
  const table_bytes = await toXlsxTable(store.getWorkbook(), store);
  expect(await fromXlsxTable(table_bytes)).toEqual({
    rowCount: 1,
    columns: { Value: ["registered"] },
  });
  expect(valuesOf(await fromXlsxWorkbook(await toXlsxWorkbook(snapshot)))).toEqual([
    { kind: "literal", value: "registered" },
  ]);
  store.dispose();
});

it("rejects the call whose codec chunk fails to load, and loads it again on the next call", async () => {
  // A module load is process-wide, so the probe runs in a fresh process. A Bun
  // plugin fails the codec's first load, as a dropped network request would.
  const source = (path: string) => JSON.stringify(new URL(path, import.meta.url).pathname);
  const script = `
    import { fromXlsxWorkbook, initSheetwrite, toXlsxWorkbook } from "@sheetwrite/core";
    let loads = 0;
    Bun.plugin({
      name: "flaky-codec",
      setup(build) {
        build.onLoad({ filter: /\\/xlsx\\/src\\/codec\\.ts$/ }, async ({ path }) => {
          loads += 1;
          if (loads === 1) throw new TypeError("codec chunk unavailable");
          return { contents: await Bun.file(path).text(), loader: "ts" };
        });
      },
    });
    const { xlsxAddon } = await import(${source("../src/index.ts")});
    const { book, sheet, valuesOf } = await import(${source("./workbook-fixtures.ts")});
    await initSheetwrite({ addons: [xlsxAddon()] });
    const snapshot = book([sheet("s", "Sheet1", [["retried"]])]);
    const first = await toXlsxWorkbook(snapshot).then(
      () => "loaded",
      (error) => error.message,
    );
    const values = valuesOf(await fromXlsxWorkbook(await toXlsxWorkbook(snapshot)));
    process.stdout.write(JSON.stringify({ first, values }));
  `;
  const child = Bun.spawn(["bun", "-e", script], {
    cwd: new URL("../", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  expect(exit_code, stderr).toBe(0);
  expect(JSON.parse(stdout)).toEqual({
    first: "codec chunk unavailable",
    values: [{ kind: "literal", value: "retried" }],
  });
});
