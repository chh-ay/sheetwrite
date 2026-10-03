import { describe, expect, it } from "bun:test";
import {
  collectFenceHovers,
  isHighQualityHover,
  referenceRouteForHover,
} from "../docs/src/lib/sheetwrite-code-hovers.js";
import {
  SheetwriteTypeEngine,
  type SheetwriteTypeHover,
} from "../docs/src/lib/sheetwrite-type-engine.js";

describe("Sheetwrite type engine", () => {
  it("owns TypeScript quick info with workspace module resolution", () => {
    const engine = new SheetwriteTypeEngine({
      cwd: new URL("../docs/", import.meta.url).pathname,
    });
    const hovers = engine.analyze(
      `import type { ChangeEvent } from "@sheetwrite/core";
export function persist(event: ChangeEvent): void {
  void event.transaction;
}`,
      "ts",
    );

    expect(hovers.find((hover) => hover.target === "ChangeEvent")?.text).toContain("ChangeEvent");
    expect(hovers.find((hover) => hover.target === "persist")?.text).toContain(
      "event: ChangeEvent",
    );
    expect(hovers.find((hover) => hover.target === "transaction")?.text).toContain(
      "ChangeEvent.transaction: Transaction",
    );
  });

  it("repairs framework bindings only through explicit source relationships", () => {
    const engine = new SheetwriteTypeEngine({
      cwd: new URL("../docs/", import.meta.url).pathname,
    });
    const source = `<script lang="ts">
const handleGridChange = (event: ChangeEvent): void => {};
let { columns }: Props = $props();
</script>
<Sheetwrite @grid-change="handleGridChange" />`;
    const eventStart = source.indexOf("grid-change");
    const handlerStart = source.indexOf("handleGridChange");
    const propsStart = source.indexOf("$props");
    const repaired = engine.resolveFrameworkTypes(
      [
        {
          type: "hover",
          text: ["onGridChange:", "any"].join(" "),
          start: eventStart,
          length: "grid-change".length,
          target: "grid-change",
          line: 4,
          character: 13,
        },
        {
          type: "hover",
          text: "const handleGridChange: (event: ChangeEvent) => void",
          start: handlerStart,
          length: "handleGridChange".length,
          target: "handleGridChange",
          line: 1,
          character: 6,
        },
        {
          type: "hover",
          text: ["function $props():", "any"].join(" "),
          start: propsStart,
          length: "$props".length,
          target: "$props",
          line: 2,
          character: 25,
        },
        {
          type: "hover",
          text: "type Mixed = Container<__VLS_Internal, ChangeEvent>",
          start: 0,
          length: 5,
          target: "mixed",
          line: 0,
          character: 0,
        },
      ],
      source,
    );

    expect(repaired.find((hover) => hover.target === "grid-change")?.text).toBe(
      "onGridChange: (event: ChangeEvent) => void",
    );
    expect(repaired.find((hover) => hover.target === "$props")?.text).toBe(
      "function $props(): Props",
    );
    expect(repaired.find((hover) => hover.target === "mixed")?.text).toBe(
      "type Mixed = Container<__VLS_Internal, ChangeEvent>",
    );
  });
});

describe("Sheetwrite hover preludes", () => {
  const engine = new SheetwriteTypeEngine({
    cwd: new URL("../docs/", import.meta.url).pathname,
  });

  it("maps single-line script positions around an injected prelude", () => {
    const source = '<script lang="ts">grid.destroy();</script>';
    const hovers = collectFenceHovers(source, "svelte", engine, "core");
    const destroy = hovers.find((hover) => hover.target === "destroy");
    expect(destroy).toMatchObject({ line: 0, character: source.indexOf("destroy") });
    for (const hover of hovers) {
      expect(hover.line).toBe(0);
      expect(source.slice(hover.character, hover.character + hover.target.length)).toBe(
        hover.target,
      );
    }
  });

  it("resolves prelude-backed host state in partial ts snippets", () => {
    const hovers = collectFenceHovers(
      "grid.destroy();\nworkbook.sheets.length;\n",
      "ts",
      engine,
      "core",
    );
    expect(hovers.every((hover) => hover.line >= 0)).toBe(true);
    const grid = hovers.find((hover) => hover.target === "grid");
    expect(grid?.line).toBe(0);
    expect(grid?.character).toBe(0);
    expect(grid?.text).toContain("Grid");
    const workbook = hovers.find((hover) => hover.target === "workbook");
    expect(workbook?.line).toBe(1);
    expect(workbook?.text).toContain("Workbook");
    for (const hover of hovers) {
      expect(isHighQualityHover(hover, "ts")).toBe(true);
    }
  });
});

describe("Sheetwrite hover quality", () => {
  const hover = (text: string, origin: SheetwriteTypeHover["origin"]): SheetwriteTypeHover => ({
    type: "hover",
    text,
    start: 0,
    length: 5,
    target: "value",
    line: 0,
    character: 0,
    origin,
  });

  it("rejects unresolved application hovers but keeps lib signatures", () => {
    expect(isHighQualityHover(hover("const value: any", "snippet"))).toBe(false);
    expect(isHighQualityHover(hover("type Value = /*unresolved*/ any", "workspace"))).toBe(false);
    expect(isHighQualityHover(hover("Console.log(...data: any[]): void", "lib"))).toBe(true);
    expect(isHighQualityHover(hover("const grid: Grid", "workspace"))).toBe(true);
  });
});
describe("Sheetwrite hover preludes end to end", () => {
  it("resolves template-only svelte snippets through the synthetic script", () => {
    const engine = new SheetwriteTypeEngine({
      cwd: new URL("../docs/", import.meta.url).pathname,
    });
    const source = "<button onclick={() => grid.destroy()}>Reset</button>";
    const hovers = collectFenceHovers(source, "svelte", engine, "core");
    const grid = hovers.find((hover) => hover.target === "grid");
    expect(grid?.line).toBe(0);
    expect(grid?.character).toBe(source.indexOf("grid"));
    expect(grid?.text).toContain("Grid");
  });
});

describe("Generated fence reference links", () => {
  it("links inferred local values when their type resolves to one public API symbol", () => {
    const inferredRoutes = new Map([
      ["DataSourceRequest", "/docs/api/core/data-source-request/"],
      ["SheetwriteError", "/docs/api/core/sheetwrite-error/"],
      ["Theme", "/docs/api/core/theme/"],
    ]);
    expect(
      referenceRouteForHover(
        "request",
        'let request: Omit<DataSourceRequest, "signal">',
        inferredRoutes,
      ),
    ).toBe("/docs/api/core/data-source-request/");
    expect(referenceRouteForHover("error", "let error: SheetwriteError", inferredRoutes)).toBe(
      "/docs/api/core/sheetwrite-error/",
    );
    expect(
      referenceRouteForHover("value", "let value: Theme | SheetwriteError", inferredRoutes),
    ).toBeUndefined();
  });
});
