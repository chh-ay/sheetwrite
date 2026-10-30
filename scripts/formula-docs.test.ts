import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadFormulaContractInventory, renderExcelCoveragePage } from "./formula-docs.js";

const ROOT = resolve(import.meta.dir, "..");

function catalog(names: readonly string[]): unknown {
  return {
    source: "https://support.microsoft.com/en-us/excel/excel-functions-by-category",
    sourceUpdated: "2026-06-25",
    retrievedOn: "2026-10-30",
    families: [
      {
        title: "Selected Excel functions",
        functions: names.map((name) => ({
          name,
          url: `https://support.microsoft.com/en-us/excel/functions/${name.toLowerCase()}-function`,
        })),
      },
    ],
  };
}

describe("Excel function coverage", () => {
  test("shows engine availability, compatibility aliases, missing functions and concrete differences", async () => {
    const inventory = await loadFormulaContractInventory(ROOT);
    const page = renderExcelCoveragePage(
      inventory,
      catalog(["SUM", "FORECAST", "REGEXTEST", "CELL", "CUBEVALUE"]),
    );
    const rows = page.content.split("\n").filter((line) => line.startsWith("| [`"));

    expect(rows).toHaveLength(5);
    expect(rows.find((row) => row.startsWith("| [`SUM`]"))).toContain("| Supported | Supported |");
    const forecast = rows.find((row) => row.startsWith("| [`FORECAST`]"));
    expect(forecast).toContain("| Supported | Not supported |");
    expect(forecast).toContain("Alias of `FORECAST.LINEAR`");
    expect(forecast).toContain("Lite engine: not registered.");
    const regex = rows.find((row) => row.startsWith("| [`REGEXTEST`]"));
    expect(regex).toContain("| Partly supported | Not supported |");
    expect(regex).toContain("not full PCRE2");
    const cell = rows.find((row) => row.startsWith("| [`CELL`]"));
    expect(cell).toContain("| Partly supported | Partly supported |");
    expect(cell).toContain("Other info types return #VALUE!");
    expect(rows.find((row) => row.startsWith("| [`CUBEVALUE`]"))).toContain(
      "| Not supported | Not supported | Not registered in either engine.",
    );
    expect(page.content).toContain(
      "**2 supported**, **2 partly supported**, and **1 not supported**",
    );
  });

  test("rejects duplicate catalog rows instead of inflating coverage", async () => {
    const inventory = await loadFormulaContractInventory(ROOT);

    expect(() => renderExcelCoveragePage(inventory, catalog(["SUM", "SUM"]))).toThrow(
      "duplicate Excel function: SUM",
    );
  });

  test("publishes every catalog name once and explains every partly supported row", async () => {
    const inventory = await loadFormulaContractInventory(ROOT);
    const source: unknown = JSON.parse(
      await readFile(resolve(ROOT, "scripts/excel-functions.json"), "utf8"),
    );
    const page = renderExcelCoveragePage(inventory, source);
    const rows = page.content.split("\n").filter((line) => line.startsWith("| [`"));

    expect(rows).toHaveLength(520);
    for (const row of rows.filter((line) => line.includes("| Partly supported |"))) {
      const notes = row.split(" | ").at(-1) ?? "";
      expect(notes.replace(/\[Contract\]\([^)]+\)/u, "").trim().length).toBeGreaterThan(20);
    }
  });
});
