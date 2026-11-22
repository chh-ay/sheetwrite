import { beforeAll, expect, it } from "bun:test";

import {
  initSheetwrite,
  type SheetSnapshot,
  type SheetVisibility,
  SheetwriteStore,
} from "@sheetwrite/core";
import { analyzeFormula } from "@sheetwrite/core/functions";
import { openFormulaEdit } from "@sheetwrite/core/testing";

import { openSyntax } from "../src/signals/syntax.js";

beforeAll(async () => {
  await initSheetwrite();
});

function sheet(
  id: string,
  name: string,
  order: number,
  visibility: SheetVisibility,
): SheetSnapshot {
  return {
    id,
    name,
    order,
    visibility,
    rowCount: 3,
    columns: [{ key: "a", header: "A", width: 100, type: "text" }],
    cells: [],
  };
}

/** The sheet names the syntax signal completes from `typed` in the Budget sheet. */
async function sheet_names(typed: string): Promise<string[]> {
  const store = SheetwriteStore.fromSnapshot({
    schemaVersion: 1,
    workbook: { activeSheet: "budget" },
    sheets: [
      sheet("budget", "Budget", 0, "visible"),
      sheet("ledger", "Ledger", 1, "visible"),
      sheet("payroll", "Payroll", 2, "hidden"),
      sheet("vault", "Vault", 3, "veryHidden"),
    ],
  });
  const edit = await openFormulaEdit(store, { sheet: "budget", row: 0, col: 0 });
  const analysis = analyzeFormula(typed, typed.length, edit.functions());
  return openSyntax(edit)
    .proposals(typed, analysis)
    .flatMap((proposal) => (proposal.reason === "sheetName" ? [proposal.formula] : []));
}

it("completes the names of visible sheets only, as the sheet tabs show them", async () => {
  expect(await sheet_names("=Led")).toEqual(["=Ledger!"]);
  // Hidden and very hidden sheets stay out of every list the UI shows; the formula bar too.
  expect(await sheet_names("=Pay")).toEqual([]);
  expect(await sheet_names("=Vau")).toEqual([]);
});
