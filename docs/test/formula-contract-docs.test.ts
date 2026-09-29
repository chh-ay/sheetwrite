import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  loadFormulaContractInventory,
  renderFormulaFunctionContract,
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

    expect(() => renderFormulaFunctionContract(incomplete)).toThrow(
      "requires 100 required-supported functions; found 99",
    );
  });
});
