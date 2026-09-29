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

  it("falls back to tiling for formulas and non-linear runs", () => {
    const withFormula = detectFillSeries([
      { value: 1, isFormula: false },
      { value: 2, isFormula: true },
    ]);
    const nonLinear = detectFillSeries(cells([1, 2, 4]));

    expect(withFormula.stepAt(3)).toEqual({ kind: "tile", sourceIndex: 1 });
    expect(nonLinear.stepAt(3)).toEqual({ kind: "tile", sourceIndex: 0 });
  });

  it("tolerates normal floating point drift", () => {
    const plan = detectFillSeries(cells([0.1, 0.2, 0.30000000000000004]));

    expect(plan.stepAt(3)).toEqual({ kind: "value", value: 0.4 });
  });
});
