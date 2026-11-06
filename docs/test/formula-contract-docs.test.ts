import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
  formulaFamilyNavigation,
  loadFormulaContractInventory,
  loadFormulaReferenceEntries,
  syntaxLiterals,
  renderFormulaFunctionPages,
} from "../../scripts/formula-docs.ts";

const REPO_ROOT = join(import.meta.dir, "..", "..");

type FormulaInventory = {
  functions: Array<{
    canonical: string;
    aliases: string[];
    contractStatus: "required-supported" | "supported";
  }>;
  unsupportedCategories: Array<{ id: string }>;
};

describe("generated formula documentation contract", () => {
  it("fails generation when the required-supported target set is incomplete", async () => {
    const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
    const incomplete = structuredClone(inventory);
    const index = incomplete.functions.findIndex(
      ({ contractStatus }) => contractStatus === "required-supported",
    );
    incomplete.functions.splice(index, 1);

    const summaries = await loadFormulaReferenceEntries(REPO_ROOT);
    expect(() => renderFormulaFunctionPages(incomplete, summaries)).toThrow(
      "requires 100 required-supported functions; found 99",
    );
  });

  it("publishes every function on exactly one family page, with the profiles its rows link", async () => {
    const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
    const pages = renderFormulaFunctionPages(
      inventory,
      await loadFormulaReferenceEntries(REPO_ROOT),
    );
    const families = pages.filter((page) => page.route !== "reference/formula-functions.md");
    for (const formula of inventory.functions) {
      const holders = families.filter((page) =>
        page.table?.html.includes(`<span class="sw-code-function">${formula.canonical}</span>`),
      );
      expect(holders.map((page) => page.route)).toHaveLength(1);
    }
    for (const page of families) {
      // The page holds the profiles; its separate table links to them.
      expect(page.content).toContain(`\n<FormulaReference family="${page.table?.family}">\n`);
      const ids = new Set([...page.content.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
      for (const [, target] of `${page.content}${page.table?.html}`.matchAll(/ href="#([^"]+)"/g)) {
        expect(ids.has(target)).toBeTrue();
      }
    }
    expect(formulaFamilyNavigation(pages).map((entry) => entry.href)).toEqual(
      families.map((page) => `/docs/${page.route.replace(/\.md$/, "/")}`),
    );
  });

  it("describes every function in one line, with its Excel syntax", async () => {
    const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
    const entries = await loadFormulaReferenceEntries(REPO_ROOT);
    const missing = { ...entries };
    delete missing[inventory.functions[0]?.canonical ?? ""];

    expect(() => renderFormulaFunctionPages(inventory, missing)).toThrow("has no entry for");
    expect(() =>
      renderFormulaFunctionPages(inventory, {
        ...entries,
        NOTAFUNCTION: { summary: "x", syntax: "NOTAFUNCTION()" },
      }),
    ).toThrow("describes unknown functions: NOTAFUNCTION");
  });

  it("points every legacy function at a modern function that exists", async () => {
    const entries = await loadFormulaReferenceEntries(REPO_ROOT);
    for (const [name, { summary }] of Object.entries(entries)) {
      const replacements = /older form of (.+)\.$/.exec(summary)?.[1];
      if (replacements === undefined) continue;
      for (const replacement of replacements.split(/ and /)) {
        expect(`${name} -> ${replacement}`).toBe(
          `${name} -> ${entries[replacement] === undefined ? "missing" : replacement}`,
        );
      }
    }
  });

  it("accepts argument names and rejects example values in a syntax line", () => {
    expect(syntaxLiterals("range, criteria, [sum_range]")).toEqual([]);
    expect(syntaxLiterals("known_y's, [known_x's], [const]")).toEqual([]);
    expect(syntaxLiterals("probability, alpha, beta, [A], [B]")).toEqual([]);
    expect(syntaxLiterals("rows, cols, lambda(row, col)")).toEqual([]);
    expect(syntaxLiterals("number1, [number2], …")).toEqual([]);
    expect(syntaxLiterals("25, A1:A3, 0")).toEqual(["25", "A1:A3", "0"]);
    expect(syntaxLiterals('B2:B25, ">5"')).toEqual(["B2:B25", '">5"']);
    expect(syntaxLiterals("Where do you want to look?")).toEqual(["Where do you want to look?"]);
    expect(syntaxLiterals("array1, lambda_or_array<#>")).toEqual(["lambda_or_array<#>"]);
  });
});
