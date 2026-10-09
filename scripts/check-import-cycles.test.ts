import { describe, expect, it } from "bun:test";
import { analyzeImportGraph } from "./check-import-cycles.js";

// The live core graph is checked in CI by `bun run check:cycles`; these cases
// prove that the analyzer reports each rule it enforces.
describe("analyzeImportGraph", () => {
  it("reports an import cycle", () => {
    const fixture = new Map([
      ["fixture/a.ts", 'import "./b.js";'],
      ["fixture/b.ts", 'import "./c.js";'],
      ["fixture/c.ts", 'import "./a.js";'],
    ]);
    expect(analyzeImportGraph(fixture)).toContainEqual(expect.objectContaining({ kind: "cycle" }));
  });

  it("reports a store leaf that imports the public facade", () => {
    const fixture = new Map([
      ["packages/core/src/store.ts", "export class SheetwriteStore {}"],
      ["packages/core/src/store/ranges.ts", 'import type { SheetwriteStore } from "../store.js";'],
    ]);
    expect(analyzeImportGraph(fixture)).toContainEqual(
      expect.objectContaining({ kind: "leaf-facade" }),
    );
  });
});
