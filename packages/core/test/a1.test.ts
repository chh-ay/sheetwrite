import { beforeAll, describe, expect, it } from "bun:test";

import { cellA1, colToA1, rangeA1, remapFormulaA1Refs, shiftA1Refs } from "../src/a1.js";
import { initSheetwrite } from "../src/grid.js";

beforeAll(async () => {
  await initSheetwrite();
});

describe("A1 column labels", () => {
  it("converts indices to labels across the 26-wrap boundary", () => {
    expect(colToA1(0)).toBe("A");
    expect(colToA1(25)).toBe("Z");
    expect(colToA1(26)).toBe("AA");
    expect(colToA1(51)).toBe("AZ");
    expect(colToA1(52)).toBe("BA");
    expect(colToA1(701)).toBe("ZZ");
    expect(colToA1(702)).toBe("AAA");
  });

  it("builds cell and range references with normalized corners", () => {
    expect(cellA1(0, 0)).toBe("A1");
    expect(cellA1(9, 2)).toBe("C10");
    expect(rangeA1({ row: 0, col: 0 }, { row: 0, col: 0 })).toBe("A1");
    expect(rangeA1({ row: 2, col: 1 }, { row: 0, col: 0 })).toBe("A1:B3");
  });
});

describe("shiftA1Refs", () => {
  it.each([
    // Absolute row and column parts stay.
    ["=$A$1", 5, 5, "=$A$1"],
    ["=$A1", 2, 3, "=$A3"],
    ["=A$1", 2, 3, "=D$1"],
    // A reference shifted outside the sheet, or past its last row or column, is #REF!.
    ["=A1", -5, 0, "=#REF!"],
    ["=B2", 0, -10, "=#REF!"],
    ["=$A$1+A$1+$A1", -1, -1, "=$A$1+#REF!+#REF!"],
    ["=XFD1", 0, 1, "=#REF!"],
    ["=A1048576", 1, 0, "=#REF!"],
    ["=XFC1048575", 1, 1, "=XFD1048576"],
    // A range with a corner off the sheet becomes one #REF!.
    ["=SUM(A1:B2)", -1, 0, "=SUM(#REF!)"],
    ["=SUM(B2:C3)", -1, 0, "=SUM(B1:C2)"],
    ['=SUM(A1:B2)&"A1:B2"', 0, -1, '=SUM(#REF!)&"A1:B2"'],
    // Array constants, text, spill suffixes and names stay.
    ['=SUM({1,2;3,4})+A1&{"A1","a""B2"}', 2, 1, '=SUM({1,2;3,4})+B3&{"A1","a""B2"}'],
    ["=SUM(A1#)+$B$2#", 1, 1, "=SUM(B2#)+$B$2#"],
    ["=LOG10(A1)+BIN2DEC(B1)+A1_name", 1, 0, "=LOG10(A2)+BIN2DEC(B2)+A1_name"],
    ["=XYZ1+A1", 1, 1, "=XYZ1+B2"],
    // Whole columns and rows move by the copy distance.
    ["=SUM(A:A)", 0, 1, "=SUM(B:B)"],
    ["=SUM(1:1)+SUM($A:A)", 2, 1, "=SUM(3:3)+SUM($A:B)"],
    // Unchanged references keep their spacing and case.
    ["= sum( a1 , $B$2 )", 1, 0, "= sum( A2 , $B$2 )"],
  ] as const)("shifts %s by (%d, %d) to %s", (formula, rows, cols, expected) => {
    expect(shiftA1Refs(formula, rows, cols)).toBe(expected);
  });
});

describe("remapFormulaA1Refs", () => {
  const remove_column_b = { kind: "shift", at: 1, delta: -1 } as const;
  const remove_row2 = { kind: "shift", at: 1, delta: -1 } as const;
  const remove_rows1_to2 = { kind: "shift", at: 0, delta: -2 } as const;
  const remove_column_a = { kind: "shift", at: 0, delta: -1 } as const;
  const move_rows = { kind: "move", from: 0, count: 2, to: 1 } as const;
  const insert_row = { kind: "shift", at: 0, delta: 1 } as const;
  it.each([
    ["=A1+B1+C1", "column", remove_column_b, "=A1+#REF!+B1"],
    // A spill reference moves with its anchor and breaks when the anchor goes.
    ["=SUM(A3#)", "row", remove_row2, "=SUM(A2#)"],
    ["=SUM(A2#)", "row", remove_row2, "=SUM(#REF!)"],
    // A range shrinks when a corner goes, and breaks with no row left.
    ["=SUM(A1:B4)", "row", remove_rows1_to2, "=SUM(A1:B2)"],
    ["=SUM(A4:B1)", "row", remove_rows1_to2, "=SUM(A1:B2)"],
    ["=SUM(A1:B2)+C3", "row", remove_rows1_to2, "=SUM(#REF!)+C1"],
    // A whole column goes with its column; whole rows stay.
    ["=SUM(B:B)+SUM(A:A)", "column", remove_column_a, "=SUM(A:A)+SUM(#REF!)"],
    ["=SUM(2:2)", "column", remove_column_a, "=SUM(2:2)"],
    ["=A1+A2+A4", "row", move_rows, "=A2+A3+A4"],
    // Function names and array text stay.
    ["=LOG10(A1)+BIN2DEC(B1)", "row", insert_row, "=LOG10(A2)+BIN2DEC(B2)"],
    ['=A1&{"A1","B2";"C3","D4"}', "row", insert_row, '=A2&{"A1","B2";"C3","D4"}'],
  ] as const)("remaps %s on a %s edit", (formula, axis, edit, expected) => {
    expect(remapFormulaA1Refs(formula, axis, edit)).toBe(expected);
  });
});
