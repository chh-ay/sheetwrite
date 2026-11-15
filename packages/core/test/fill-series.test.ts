import { describe, expect, it } from "bun:test";

import { detectFillSeries, type FillSourceCell } from "../src/fill-series.js";

function cells(values: readonly number[]): FillSourceCell[] {
  return values.map((value) => ({ value, isFormula: false }));
}

describe("detectFillSeries", () => {
  it("extrapolates arithmetic numeric runs downward", () => {
    const plan = detectFillSeries(cells([1, 2]));

    expect(plan.stepAt(0)).toEqual({ kind: "value", value: 1 });
    expect(plan.stepAt(1)).toEqual({ kind: "value", value: 2 });
    expect(plan.stepAt(2)).toEqual({ kind: "value", value: 3 });
    expect(plan.stepAt(3)).toEqual({ kind: "value", value: 4 });
  });

  it("copies formulas and continues other numbers as a linear trend, as Excel does", () => {
    const withFormula = detectFillSeries([
      { value: 1, isFormula: false },
      { value: 2, isFormula: true },
    ]);
    const nonLinear = detectFillSeries(cells([1, 2, 4]));

    expect(withFormula.stepAt(3)).toEqual({ kind: "tile", sourceIndex: 1 });
    const step = nonLinear.stepAt(3);
    expect(step.kind === "value" ? step.value : null).toBeCloseTo(5.3333333, 6);
  });

  it("counts one date up by a day but copies one number", () => {
    expect(detectFillSeries([{ value: 45300, isFormula: false, isDate: true }]).stepAt(2)).toEqual({
      kind: "value",
      value: 45302,
    });
    expect(detectFillSeries(cells([5])).stepAt(2)).toEqual({ kind: "tile", sourceIndex: 0 });
  });

  it("swaps counting and copying when Ctrl is held", () => {
    expect(detectFillSeries(cells([5]), { swap: true }).stepAt(2)).toEqual({
      kind: "value",
      value: 7,
    });
    expect(detectFillSeries(cells([1, 2]), { swap: true }).stepAt(2)).toEqual({
      kind: "tile",
      sourceIndex: 0,
    });
  });

  it("continues text that ends in a number, and day and month names", () => {
    const text = (values: string[]) => values.map((value) => ({ value, isFormula: false }));
    expect(detectFillSeries(text(["Item 1"])).stepAt(2)).toEqual({
      kind: "value",
      value: "Item 3",
    });
    expect(detectFillSeries(text(["Q01", "Q03"])).stepAt(2)).toEqual({
      kind: "value",
      value: "Q05",
    });
    expect(detectFillSeries(text(["Sat"])).stepAt(2)).toEqual({ kind: "value", value: "Mon" });
    expect(detectFillSeries(text(["JANUARY"])).stepAt(1)).toEqual({
      kind: "value",
      value: "FEBRUARY",
    });
    expect(detectFillSeries(text(["north"])).stepAt(1)).toEqual({ kind: "tile", sourceIndex: 0 });
  });

  it("tolerates normal floating point drift", () => {
    const plan = detectFillSeries(cells([0.1, 0.2, 0.30000000000000004]));

    expect(plan.stepAt(3)).toEqual({ kind: "value", value: 0.4 });
  });
});
