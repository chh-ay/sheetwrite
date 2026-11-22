import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import { dateToSerial, parseDateInput, serialToDate } from "../src/date-serial.js";
import { formatGeneral } from "../src/general-format.js";
import {
  formatNumber,
  numberFormatColor,
  resetNumberFormatResourcesForTest,
} from "../src/number-format.js";

describe("formatNumber", () => {
  // Excel's General shows up to 11 characters in a standard-width cell, the
  // minus sign not counted, with no thousands separators.
  it.each([
    [2026, "2026"],
    [2480.155, "2480.155"],
    [3.14159265, "3.14159265"],
    [1 / 3, "0.333333333"],
    [0.1 + 0.2, "0.3"],
    [0.0001234, "0.0001234"],
    [0.000123456789, "0.000123457"],
    [0.00001, "1E-05"],
    [12345678901, "12345678901"],
    [123456789012, "1.23457E+11"],
    [1.23456789e19, "1.23457E+19"],
    [1e100, "1E+100"],
    [1.5e-300, "1.5E-300"],
    [-1234.5, "-1234.5"],
    [-0, "0"],
  ] as const)("shows %s with no format as Excel's General: %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
    expect(formatNumber(value, "General")).toBe(expected);
    // The Text format shows a number as General does.
    expect(formatNumber(value, "@")).toBe(expected);
  });

  it("narrows General to a narrower cell as Excel does, and gives up where Excel shows ####", () => {
    expect(formatGeneral(1234.5678, 6)).toBe("1234.6");
    expect(formatGeneral(1234.5678, 4)).toBe("1235");
    expect(formatGeneral(-1234.5678, 4)).toBe("-1235");
    expect(formatGeneral(123456789, 6)).toBe("1E+08");
    expect(formatGeneral(0.001, 3)).toBeNull();
    expect(formatGeneral(123456789, 4)).toBeNull();
  });

  it("preserves Excel's 1900 serial boundary", () => {
    expect(dateToSerial(new Date(Date.UTC(1900, 0, 1)))).toBe(1);
    expect(dateToSerial(new Date(Date.UTC(1900, 1, 28)))).toBe(59);
    expect(dateToSerial(new Date(Date.UTC(1900, 2, 1)))).toBe(61);
    expect(serialToDate(60).toISOString()).toBe("1900-02-28T00:00:00.000Z");
  });

  it("names weekdays before 1 March 1900 as Excel and WEEKDAY count them", () => {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (let serial = 1; serial <= 70; serial++) {
      const weekday = weekdays[(serial - 1) % 7]!;
      expect(formatNumber(serial, "dddd"), String(serial)).toBe(weekday);
      expect(formatNumber(serial, "ddd"), String(serial)).toBe(weekday.slice(0, 3));
    }
  });

  it("reads dates back as serials, 29 February 1900 as Excel's serial 60, and rejects invalid ones", () => {
    const leap_day = dateToSerial(new Date(Date.UTC(2024, 1, 29)));
    const cases: [string, number | null][] = [
      ["1900-02-29", 60],
      ["1900-02-29 18:00", 60.75],
      ["02/29/1900", 60],
      ["29/02/1900", 60],
      ["1900-02-28", 59],
      ["1900-03-01", 61],
      [" 2024-02-29 ", leap_day],
      ["2024-02-29 12:30", leap_day + 12.5 / 24],
      ["2024-02-29T23:59:58", leap_day + (23 * 3600 + 59 * 60 + 58) / 86_400],
      ["31/01/2024", leap_day - 29],
      ["01/31/2024", leap_day - 29],
      ["04/05/2024", leap_day + 36],
    ];
    for (const invalid of ["1900-02-30", "1899-02-29", "1901-02-29", "1900-02-29 24:00"]) {
      cases.push([invalid, null]);
    }
    for (const invalid of ["2023-02-29", "2024-13-01", "2024-01-32", "2024-01-01 24:00"]) {
      cases.push([invalid, null]);
    }
    for (const invalid of ["2024-01-01 12:60", "13/14/2024", "99-01-01", "not a date"]) {
      cases.push([invalid, null]);
    }
    for (const [input, serial] of cases) expect(parseDateInput(input), input).toBe(serial);
  });

  // `[h]`, `[m]` and `[s]` show elapsed time, past one day or one hour.
  // https://support.microsoft.com/en-us/excel/review-guidelines-for-customizing-a-number-format
  it("shows elapsed hours, minutes and seconds", () => {
    expect(formatNumber(25 / 24, "[h]:mm:ss")).toBe("25:00:00");
    expect(formatNumber((36 * 3600 + 15 * 60 + 30) / 86_400, "[h]:mm:ss")).toBe("36:15:30");
    expect(formatNumber(0.25, "[h]:mm")).toBe("6:00");
    expect(formatNumber(1.5, "[mm]:ss")).toBe("2160:00");
    expect(formatNumber(5 / 1440, "[mm]:ss")).toBe("05:00");
    expect(formatNumber(90 / 86_400, "[ss]")).toBe("90");
    expect(formatNumber(25 / 24, "[Red][h]:mm")).toBe("25:00");
  });

  // A section's color names Excel's eight colors or `[Color1]` to `[Color56]`
  // of its default palette, and a condition chooses the section.
  // https://support.microsoft.com/en-us/excel/review-guidelines-for-customizing-a-number-format
  it("gives the color of the section a number takes", () => {
    const code = "#,##0;[Red]-#,##0";
    expect(formatNumber(-1200, code)).toBe("-1,200");
    expect(numberFormatColor(-1200, code)).toBe("#ff0000");
    expect(numberFormatColor(1200, code)).toBeUndefined();
    expect(numberFormatColor(7, "[BLUE]0")).toBe("#0000ff");
    expect(numberFormatColor(7, "[Green]0")).toBe("#00ff00");
    expect(numberFormatColor(7, "[Color10]0")).toBe("#008000");
    expect(numberFormatColor(7, "[Color56]0")).toBe("#333333");
    expect(numberFormatColor(7, "[Color57]0")).toBeUndefined();
    expect(numberFormatColor(45_000, "[Magenta]yyyy-mm-dd")).toBe("#ff00ff");
    expect(numberFormatColor(7, "0")).toBeUndefined();
    expect(numberFormatColor(7, undefined)).toBeUndefined();
  });

  it("chooses a section by its condition", () => {
    const code = "[Red][<=100]0;[Blue][>100]0";
    expect([formatNumber(50, code), numberFormatColor(50, code)]).toEqual(["50", "#ff0000"]);
    expect([formatNumber(150, code), numberFormatColor(150, code)]).toEqual(["150", "#0000ff"]);
    expect(formatNumber(1, '[=1]0" day";0" days"')).toBe("1 day");
    expect(formatNumber(3, '[=1]0" day";0" days"')).toBe("3 days");
    // A section that only negative numbers meet drops the sign, as Excel's
    // negative section does; the third section takes the rest with its sign.
    const bands = "[Red][<-25]0;[Blue][>25]0;[Green]0";
    expect([formatNumber(-26, bands), numberFormatColor(-26, bands)]).toEqual(["26", "#ff0000"]);
    expect([formatNumber(26, bands), numberFormatColor(26, bands)]).toEqual(["26", "#0000ff"]);
    expect([formatNumber(-1, bands), numberFormatColor(-1, bands)]).toEqual(["-1", "#00ff00"]);
    expect(formatNumber(0, bands)).toBe("0");
  });

  it("returns exact text for fixed values on repeated calls", () => {
    resetNumberFormatResourcesForTest();
    const july4 = dateToSerial(new Date(Date.UTC(2024, 6, 4, 15, 6, 7)));
    const cases: ReadonlyArray<[number | string, string | undefined, string | undefined, string]> =
      [
        [-246, "$#,##0", undefined, "-$246"],
        [-1234.5, "$#,##0.00", undefined, "-$1,234.50"],
        [-246, '"€"#,##0', undefined, "-€246"],
        [-246, "[$€-2] #,##0", undefined, "-€ 246"],
        [-246, "$#,##0;($#,##0)", undefined, "($246)"],
        [1.005, "#,##0.00", undefined, "1.01"],
        [-0, "#,##0.00", undefined, "-0.00"],
        [-1.005, "#,##0.00", undefined, "-1.01"],
        [-0.004, "#,##0.00", undefined, "-0.00"],
        [999.995, "#,##0.00", undefined, "1,000.00"],
        [45_351.75, "yyyy-mm-dd hh:mm:ss", undefined, "2024-02-29 18:00:00"],
        [1, "yyyy-mm-dd", undefined, "1900-01-01"],
        [59, "yyyy-mm-dd", undefined, "1900-02-28"],
        [60, "yyyy-mm-dd", undefined, "1900-02-29"],
        [61, "yyyy-mm-dd", undefined, "1900-03-01"],
        [60, "d mmm yyyy", undefined, "29 Feb 1900"],
        [60, "dd/mm/yy", undefined, "29/02/00"],
        [60.75, "yyyy-mm-dd hh:mm", undefined, "1900-02-29 18:00"],
        [45_351, "d mmmm yyyy", undefined, "29 February 2024"],
        [0.0012, "0.0E+000", undefined, "1.2E-003"],
        [2.5, '0.00;[Red](0.00);"none";"value: "@', undefined, "2.50"],
        [-2.5, '0.00;[Red](0.00);"none";"value: "@', undefined, "(2.50)"],
        [0, '0.00;[Red](0.00);"none";"value: "@', undefined, "none"],
        ["draft", '0.00;[Red](0.00);"none";"value: "@', undefined, "value: draft"],
        [12.5, '"USD "0.00\\!', undefined, "USD 12.50!"],
        [-12.5, '0.0;"loss "0.0', undefined, "loss 12.5"],
        [july4, "mmm d, yyyy h:mm:ss AM/PM", undefined, "Jul 4, 2024 3:06:07 PM"],
        [july4, "mmmm dd", undefined, "July 04"],
        [1234.5, "¤#,##0.00", "en-US", "$1,234.50"],
        [1, "¤0.00", "en-US", "$1.00"],
        [1234.5, "¤#,##0.00", "de-DE", "$1.234,50"],
        [1234.5, "#,##0.00", "de-DE", "1.234,50"],
        [1234.5, "#,##0.00", "en-US", "1,234.50"],
        [-0.4, "$#,##0", "en-US", "-$0"],
        [-0.05, "0.0%", "en-US", "-5.0%"],
        [-246, '0" USD"', "en-US", "-246 USD"],
        [-0, "$0.00", "en-US", "$-0.00"],
        [0, "$0.00", "en-US", "$0.00"],
        [-1, "yyyy-mm-dd", "en-US", "1899-12-30"],
        [1234.5, "#,##0.0", "en-US", "1,234.5"],
        [-1234.5, "#,##0.00", "en-US", "-1,234.50"],
        [-5, "0", "en-US", "-5"],
        [-0, undefined, undefined, "0"],
        [Number.NaN, "#,##0", undefined, ""],
        [Number.NEGATIVE_INFINITY, undefined, undefined, ""],
        [45_351, "mmm d, yyyy", undefined, "Feb 29, 2024"],
        [-2.5, "#,##0.00;(#,##0.00)", undefined, "(2.50)"],
        [0.5, "0%", undefined, "50%"],
        [60, "mmmm", undefined, "February"],
        [60, "ddd d", undefined, "Wed 29"],
        [59.5, "dddd hh:mm", undefined, "Tuesday 12:00"],
        [1, "yyyy-mm-dd dddd", undefined, "1900-01-01 Sunday"],
        [59, "yyyy-mm-dd ddd", undefined, "1900-02-28 Tue"],
        [61, "yyyy-mm-dd dddd", undefined, "1900-03-01 Thursday"],
        [45_351, "dddd", undefined, "Thursday"],
        [12_345, "0.00E+00", undefined, "1.23E+04"],
        [1234.5, undefined, "de-DE", "1234,5"],
        [123456789012, undefined, "de-DE", "1,23457E+11"],
        [-0, "0.00", undefined, "-0.00"],
        [0, "0.00", undefined, "0.00"],
        [0, undefined, undefined, "0"],
        [Number.NaN, undefined, undefined, ""],
        [Number.POSITIVE_INFINITY, "#,##0.00", undefined, ""],
        [1e21, "#,##0.00", undefined, "1,000,000,000,000,000,000,000.00"],
        [1e-7, "0.00000000", undefined, "0.00000010"],
        [45_351, "yyyy-mm-dd", undefined, "2024-02-29"],
        [0.123, "0.0%", undefined, "12.3%"],
        [12_345.6789, "0.00E+00", undefined, "1.23E+04"],
      ];

    for (const [value, code, locale, expected] of cases) {
      expect(formatNumber(value, code, locale), `cold ${value} ${code}`).toBe(expected);
      // The second call serves the entry the first call stored.
      expect(formatNumber(value, code, locale), `warm ${value} ${code}`).toBe(expected);
    }
  });
});

describe("formatNumber shared cases", () => {
  // The Rust TEXT() reads the same table (number_format_case_tests.rs).
  const fixture = JSON.parse(
    readFileSync(
      new URL("../../../test/fixtures/number-format-cases.json", import.meta.url),
      "utf8",
    ),
  ) as { cases: [number, string, string, string][] };

  it("shows fractions and the Text format as Excel does", () => {
    const differ = fixture.cases
      .map(([value, code, expected]) => ({
        value,
        code,
        expected,
        actual: formatNumber(value, code),
      }))
      .filter(({ expected, actual }) => actual !== expected);
    expect(fixture.cases.length).toBeGreaterThan(300);
    expect(differ).toEqual([]);
  });
});
