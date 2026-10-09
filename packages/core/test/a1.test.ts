import { describe, expect, it } from "bun:test";
import { cellA1, colToA1, rangeA1, remapFormulaA1Refs, shiftA1Refs } from "../src/a1.js";

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
  it("preserves absolute row/column parts", () => {
    expect(shiftA1Refs("=$A$1", 5, 5)).toBe("=$A$1");
    expect(shiftA1Refs("=$A1", 2, 3)).toBe("=$A3");
    expect(shiftA1Refs("=A$1", 2, 3)).toBe("=D$1");
  });

  it("clamps below the A1 origin instead of going negative", () => {
    expect(shiftA1Refs("=A1", -5, 0)).toBe("=A1");
    expect(shiftA1Refs("=B2", 0, -10)).toBe("=A2");
  });

  it("preserves array constants and text while shifting adjacent references", () => {
    expect(shiftA1Refs('=SUM({1,2;3,4})+A1&{"A1","a""B2"}', 2, 1)).toBe(
      '=SUM({1,2;3,4})+B3&{"A1","a""B2"}',
    );
  });
});

describe("remapFormulaA1Refs", () => {
  it("turns deleted scalar references into #REF!", () => {
    const removeColumn = (column: number) =>
      column === 1 ? null : column > 1 ? column - 1 : column;
    expect(remapFormulaA1Refs("=A1+B1+C1", "column", removeColumn)).toBe("=A1+#REF!+B1");
  });

  it("preserves array text while remapping adjacent references", () => {
    expect(remapFormulaA1Refs('=A1&{"A1","B2";"C3","D4"}', "row", (row) => row + 1)).toBe(
      '=A2&{"A1","B2";"C3","D4"}',
    );
  });
});
