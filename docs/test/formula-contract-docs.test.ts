import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
  formulaFamilyNavigation,
  loadFormulaContractInventory,
  loadFormulaSummaries,
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

    const summaries = await loadFormulaSummaries(REPO_ROOT);
    expect(() => renderFormulaFunctionPages(incomplete, summaries)).toThrow(
      "requires 100 required-supported functions; found 99",
    );
  });

  it("publishes every function on exactly one family page, with the profiles its rows link", async () => {
    const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
    const pages = renderFormulaFunctionPages(inventory, await loadFormulaSummaries(REPO_ROOT));
    const families = pages.filter((page) => page.route !== "reference/formula-functions.md");
    for (const formula of inventory.functions) {
      const holders = families.filter((page) =>
        page.content.includes(`<span class="sw-code-function">${formula.canonical}</span>`),
      );
      expect(holders.map((page) => page.route)).toHaveLength(1);
    }
    for (const page of families) {
      const ids = new Set([...page.content.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
      for (const [, target] of page.content.matchAll(/ href="#([^"]+)"/g)) {
        expect(ids.has(target)).toBeTrue();
      }
    }
    expect(formulaFamilyNavigation(pages).map((entry) => entry.href)).toEqual(
      families.map((page) => `/docs/${page.route.replace(/\.md$/, "/")}`),
    );
  });

  it("describes every function in one line", async () => {
    const inventory = (await loadFormulaContractInventory(REPO_ROOT)) as FormulaInventory;
    const summaries = await loadFormulaSummaries(REPO_ROOT);
    const missing = { ...summaries };
    delete missing[inventory.functions[0]?.canonical ?? ""];

    expect(() => renderFormulaFunctionPages(inventory, missing)).toThrow("has no summary for");
    expect(() =>
      renderFormulaFunctionPages(inventory, { ...summaries, NOTAFUNCTION: "x" }),
    ).toThrow("describes unknown functions: NOTAFUNCTION");
  });
});
