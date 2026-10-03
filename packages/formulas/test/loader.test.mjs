import { describe, expect, it } from "bun:test";

// Each child owns a fresh generated module so neither entry can reuse the other entry's init.
describe("full engine package loaders", () => {
  for (const entry of ["node", "browser"]) {
    it(`loads the ${entry} entry and evaluates analysis and default formulas`, async () => {
      const loaderUrl = new URL(`../loader-${entry}.mjs`, import.meta.url).href;
      const binaryUrl = new URL("../pkg/sheetwrite_wasm_bg.wasm", import.meta.url).href;
      const child = Bun.spawn(
        [
          "node",
          "--input-type=module",
          "-e",
          `import { strict as assert } from "node:assert";
           import { readFile } from "node:fs/promises";
           import * as engine from ${JSON.stringify(loaderUrl)};
           assert.equal(engine.isLoaded(), false);
           const source = ${JSON.stringify(entry)} === "browser"
             ? await readFile(new URL(${JSON.stringify(binaryUrl)})) : undefined;
           await Promise.all([engine.load(source), engine.load(source)]);
           assert.equal(engine.isLoaded(), true);
           const store = new engine.CellStore();
           try {
             const sheet = store.addSheet(1, 1);
             for (const [formula, expected] of [
               ["=NORM.DIST(0,0,1,TRUE)", 0.5],
               ["=NORM.DIST(0,0,1,FALSE)", 1 / Math.sqrt(2 * Math.PI)],
               ["=SUM(2,3)", 5],
             ]) {
               store.setFormula(sheet, 0, 0, formula, 0);
               store.recompute(sheet);
               const cell = store.getCell(sheet, 0, 0);
               try { assert.ok(Math.abs(cell.num - expected) < 1e-12, formula); }
               finally { cell.free(); }
             }
           } finally { store.free(); }`,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    });
  }
});
