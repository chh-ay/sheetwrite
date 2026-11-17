import { describe, expect, it } from "bun:test";

import { dateToSerial } from "../src/date-serial.js";
import { detectFillSeries, type FillSourceCell } from "../src/fill-series.js";

function cells(values: readonly number[]): FillSourceCell[] {
  return values.map((value) => ({ value, isFormula: false }));
}

function filled(source: FillSourceCell[], from: number, to: number): unknown[] {
  const plan = detectFillSeries(source);
  const out: unknown[] = [];
  for (let p = from; p <= to; p++) {
    const step = plan.stepAt(p);
    out.push(step.kind === "value" ? step.value : `tile ${step.sourceIndex}`);
  }
  return out;
}

function texts(values: readonly string[]): FillSourceCell[] {
  return values.map((value) => ({ value, isFormula: false }));
}

function dates(values: readonly [number, number, number][]): FillSourceCell[] {
  return values.map(([year, month, day]) => ({
    value: dateToSerial(new Date(Date.UTC(year, month - 1, day))),
    isFormula: false,
    isDate: true,
  }));
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

  it("wraps quarters after 4 and continues ordinals, as Excel's AutoFill table does", () => {
    expect(filled(texts(["Qtr3"]), 1, 3)).toEqual(["Qtr4", "Qtr1", "Qtr2"]);
    expect(filled(texts(["Q3"]), 1, 3)).toEqual(["Q4", "Q1", "Q2"]);
    expect(filled(texts(["Quarter 4"]), 1, 1)).toEqual(["Quarter 1"]);
    expect(filled(texts(["3rd Qtr"]), 1, 2)).toEqual(["4th Qtr", "1st Qtr"]);
    expect(filled(texts(["1st Period"]), 1, 3)).toEqual(["2nd Period", "3rd Period", "4th Period"]);
    expect(filled(texts(["1st"]), 10, 12)).toEqual(["11th", "12th", "13th"]);
    expect(filled(texts(["21ST"]), 1, 1)).toEqual(["22ND"]);
  });

  it("counts each text with a number once per repeat in a mixed source", () => {
    expect(filled(texts(["text1", "textA"]), 2, 5)).toEqual(["text2", "tile 1", "text3", "tile 1"]);
  });

  it("steps one time by an hour and dates on one day of the month by months", () => {
    expect(filled([{ value: 0.25, isFormula: false, isTime: true }], 1, 1)).toEqual([
      0.25 + 1 / 24,
    ]);
    const serial = (year: number, month: number, day: number) =>
      dateToSerial(new Date(Date.UTC(year, month - 1, day)));
    expect(
      filled(
        dates([
          [1999, 1, 1],
          [1999, 4, 1],
        ]),
        2,
        4,
      ),
    ).toEqual([serial(1999, 7, 1), serial(1999, 10, 1), serial(2000, 1, 1)]);
    expect(
      filled(
        dates([
          [2015, 1, 31],
          [2015, 2, 28],
        ]),
        2,
        3,
      ),
    ).toEqual([serial(2015, 3, 31), serial(2015, 4, 30)]);
  });
});
