import { describe, expect, it } from "bun:test";

import { dateToSerial } from "../src/date-serial.js";
import { detectFillSeries, type FillOptions, type FillSourceCell } from "../src/fill-series.js";

const cells = (...values: (number | string)[]): FillSourceCell[] =>
  values.map((value) => ({ value, isFormula: false }));
const day = (year: number, month: number, date: number) =>
  dateToSerial(new Date(Date.UTC(year, month - 1, date)));
const dates = (...serials: number[]): FillSourceCell[] =>
  serials.map((value) => ({ value, isFormula: false, isDate: true }));
const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe("detectFillSeries", () => {
  it.each<[string, FillSourceCell[], FillOptions, number[], (number | string)[]]>([
    ["an arithmetic run", cells(1, 2), {}, span(0, 3), [1, 2, 3, 4]],
    ["floating point drift", cells(0.1, 0.2, 0.30000000000000004), {}, [3], [0.4]],
    [
      "a formula, as a copy",
      [
        { value: 1, isFormula: false },
        { value: 2, isFormula: true },
      ],
      {},
      [3],
      ["tile 1"],
    ],
    ["one date, by a day", dates(45300), {}, [2], [45302]],
    ["one number, as a copy", cells(5), {}, [2], ["tile 0"]],
    ["one number with Ctrl, by one", cells(5), { swap: true }, [2], [7]],
    ["a run with Ctrl, as a copy", cells(1, 2), { swap: true }, [2], ["tile 0"]],
    ["text that ends in a number", cells("Item 1"), {}, [2], ["Item 3"]],
    ["text with a padded step", cells("Q01", "Q03"), {}, [2], ["Q05"]],
    ["day names", cells("Sat"), {}, [2], ["Mon"]],
    ["month names in capitals", cells("JANUARY"), {}, [1], ["FEBRUARY"]],
    ["other text, as a copy", cells("north"), {}, [1], ["tile 0"]],
    ["Qtr after 4", cells("Qtr3"), {}, span(1, 3), ["Qtr4", "Qtr1", "Qtr2"]],
    ["Q after 4", cells("Q3"), {}, span(1, 3), ["Q4", "Q1", "Q2"]],
    ["Quarter after 4", cells("Quarter 4"), {}, [1], ["Quarter 1"]],
    ["ordinal quarters", cells("3rd Qtr"), {}, span(1, 2), ["4th Qtr", "1st Qtr"]],
    [
      "ordinal periods",
      cells("1st Period"),
      {},
      span(1, 3),
      ["2nd Period", "3rd Period", "4th Period"],
    ],
    ["ordinals past 10", cells("1st"), {}, span(10, 12), ["11th", "12th", "13th"]],
    ["ordinals in capitals", cells("21ST"), {}, [1], ["22ND"]],
    [
      "each text with a number once per repeat",
      cells("text1", "textA"),
      {},
      span(2, 5),
      ["text2", "tile 1", "text3", "tile 1"],
    ],
    [
      "one time, by an hour",
      [{ value: 0.25, isFormula: false, isTime: true }],
      {},
      [1],
      [0.25 + 1 / 24],
    ],
    [
      "dates on one day of the month, by months",
      dates(day(1999, 1, 1), day(1999, 4, 1)),
      {},
      span(2, 4),
      [day(1999, 7, 1), day(1999, 10, 1), day(2000, 1, 1)],
    ],
    [
      "month ends, by months",
      dates(day(2015, 1, 31), day(2015, 2, 28)),
      {},
      span(2, 3),
      [day(2015, 3, 31), day(2015, 4, 30)],
    ],
    // 2026-01-03 is a Saturday; Auto Fill Options › Fill Weekdays.
    [
      "weekdays from a weekend date",
      dates(day(2026, 1, 3)),
      { unit: "weekday" },
      [1, 2, 5, 6, -1],
      [5, 6, 9, 12, 2].map((date) => day(2026, 1, date)),
    ],
  ])("continues %s as Excel does", (_name, source, options, positions, expected) => {
    const plan = detectFillSeries(source, options);
    const steps = positions.map((position) => {
      const step = plan.stepAt(position);
      return step.kind === "value" ? step.value : `tile ${step.sourceIndex}`;
    });
    expect(steps).toEqual(expected);
  });

  it("continues other numbers as a linear trend, as Excel does", () => {
    const step = detectFillSeries(cells(1, 2, 4)).stepAt(3);
    expect(step.kind === "value" ? step.value : null).toBeCloseTo(5.3333333, 6);
  });
});
