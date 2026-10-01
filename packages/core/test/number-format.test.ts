import { describe, expect, it } from "bun:test";
import { dateToSerial, parseDateInput, serialToDate } from "../src/date-serial.js";
import {
  formatNumber,
  getNumberFormatResourceStatsForTest,
  resetNumberFormatResourcesForTest,
} from "../src/number-format.js";

describe("formatNumber", () => {
  it("applies percent scaling and suffix", () => {
    expect(formatNumber(0.5, "0%")).toBe("50%");
    expect(formatNumber(0.123, "0.0%")).toBe("12.3%");
  });

  it("resolves the locale currency placeholder", () => {
    resetNumberFormatResourcesForTest();
    expect(formatNumber(1234.5, "¤#,##0.00")).toBe("$1,234.50");
    expect(formatNumber(1, "¤0.00")).toBe("$1.00");
  });

  it("matches Intl rounding for grouped formats without using toFixed semantics", () => {
    const cases: Array<{ value: number; code: string }> = [
      { value: 1.005, code: "#,##0.00" },
      { value: -1.005, code: "#,##0.00" },
      { value: -0, code: "#,##0.00" },
      { value: -0.004, code: "#,##0.00" },
      { value: 999.995, code: "#,##0.00" },
      { value: 1e21, code: "#,##0.00" },
    ];

    for (const { value, code } of cases) {
      expect(formatNumber(value, code)).toBe(
        new Intl.NumberFormat("en-US", {
          useGrouping: true,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value),
      );
    }
  });

  it("falls back to a locale default without a code, and blanks non-finite", () => {
    expect(formatNumber(1000)).toBe((1000).toLocaleString());
    expect(formatNumber(Number.NaN, "0.00")).toBe("");
    expect(formatNumber(Number.POSITIVE_INFINITY, "#,##0.00")).toBe("");
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe("");
  });

  it("bounds diverse caches and recomputes an evicted format correctly", () => {
    resetNumberFormatResourcesForTest();
    expect(formatNumber(12.5, '0.00" format-0"')).toBe("12.50 format-0");
    for (let index = 1; index < 300; index++) {
      expect(formatNumber(12.5, `0.00" format-${index}"`)).toBe(`12.50 format-${index}`);
    }
    for (let index = 0; index < 140; index++) {
      formatNumber(1_000, undefined, `en-US-x-cache-${index}`);
    }
    const serial = dateToSerial(new Date(Date.UTC(2024, 6, 4)));
    for (let index = 0; index < 40; index++) {
      formatNumber(serial, "mmm dddd", `en-US-x-date-${index}`);
    }

    const stats = getNumberFormatResourceStatsForTest();
    expect(stats.formatCacheEntries).toBeLessThanOrEqual(256);
    expect(stats.numberFormatterCacheEntries).toBeLessThanOrEqual(128);
    expect(stats.dateTimeFormatterCacheEntries).toBeLessThanOrEqual(64);
    expect(formatNumber(12.5, '0.00" format-0"')).toBe("12.50 format-0");
  });

  it("formats UTC date codes and preserves Excel's 1900 serial boundary", () => {
    expect(formatNumber(45_351, "yyyy-mm-dd")).toBe("2024-02-29");
    expect(formatNumber(45_351.75, "yyyy-mm-dd hh:mm:ss")).toBe("2024-02-29 18:00:00");
    expect(dateToSerial(new Date(Date.UTC(1900, 0, 1)))).toBe(1);
    expect(dateToSerial(new Date(Date.UTC(1900, 1, 28)))).toBe(59);
    expect(dateToSerial(new Date(Date.UTC(1900, 2, 1)))).toBe(61);
    expect(serialToDate(60).toISOString()).toBe("1900-02-28T00:00:00.000Z");
  });

  it("parses supported UTC calendar forms and rejects ambiguous invalid components", () => {
    const leapDay = dateToSerial(new Date(Date.UTC(2024, 1, 29)));
    expect(parseDateInput(" 2024-02-29 ")).toBe(leapDay);
    expect(parseDateInput("2024-02-29 12:30")).toBe(leapDay + 12.5 / 24);
    expect(parseDateInput("2024-02-29T23:59:58")).toBe(
      leapDay + (23 * 3600 + 59 * 60 + 58) / 86_400,
    );
    expect(parseDateInput("31/01/2024")).toBe(dateToSerial(new Date(Date.UTC(2024, 0, 31))));
    expect(parseDateInput("01/31/2024")).toBe(dateToSerial(new Date(Date.UTC(2024, 0, 31))));
    expect(parseDateInput("04/05/2024")).toBe(dateToSerial(new Date(Date.UTC(2024, 3, 5))));

    for (const invalid of [
      "2023-02-29",
      "2024-13-01",
      "2024-01-32",
      "2024-01-01 24:00",
      "2024-01-01 12:60",
      "13/14/2024",
      "99-01-01",
      "not a date",
    ]) {
      expect(parseDateInput(invalid), invalid).toBeNull();
    }
  });

  it("formats scientific notation with an explicit exponent width", () => {
    expect(formatNumber(12_345, "0.00E+00")).toBe("1.23E+04");
    expect(formatNumber(0.0012, "0.0E+000")).toBe("1.2E-003");
  });

  it("selects positive, negative, zero, and text sections", () => {
    const code = '0.00;[Red](0.00);"none";"value: "@';
    expect(formatNumber(2.5, code)).toBe("2.50");
    expect(formatNumber(-2.5, code)).toBe("(2.50)");
    expect(formatNumber(0, code)).toBe("none");
    expect(formatNumber("draft", code)).toBe("value: draft");
  });

  it("supports quoted and escaped literal affixes", () => {
    expect(formatNumber(12.5, '"USD "0.00\\!')).toBe("USD 12.50!");
    expect(formatNumber(-12.5, '0.0;"loss "0.0')).toBe("loss 12.5");
  });

  it("uses the configured locale rather than the browser default", () => {
    expect(formatNumber(1234.5, "#,##0.00", "de-DE")).toBe("1.234,50");
  });

  it("distinguishes month and minute tokens and renders names and AM/PM", () => {
    const serial = dateToSerial(new Date(Date.UTC(2024, 6, 4, 15, 6, 7)));
    expect(formatNumber(serial, "mmm d, yyyy h:mm:ss AM/PM")).toBe("Jul 4, 2024 3:06:07 PM");
    expect(formatNumber(serial, "mmmm dd")).toBe("July 04");
  });

  it("returns identical text for repeated and special values with a warm cache", () => {
    resetNumberFormatResourcesForTest();
    const cases: ReadonlyArray<[number, string | undefined, string | undefined]> = [
      [1234.5, "¤#,##0.00", "en-US"],
      [1234.5, "¤#,##0.00", "de-DE"],
      [-1234.5, "¤#,##0.00", "en-US"],
      [0, "0.00", undefined],
      [-0, "0.00", undefined],
      [0, undefined, undefined],
      [-0, undefined, undefined],
      [Number.NaN, "#,##0", undefined],
      [Number.POSITIVE_INFINITY, "#,##0", undefined],
      [Number.NEGATIVE_INFINITY, undefined, undefined],
      [1e21, "#,##0.00", undefined],
      [1e-7, "0.00000000", undefined],
      [-1e-7, "0.00000000", undefined],
      [45_351, "yyyy-mm-dd", undefined],
      [45_351, "mmm d, yyyy", undefined],
      [-2.5, "#,##0.00;(#,##0.00)", undefined],
      [0.5, "0%", undefined],
      [12_345.6789, "0.00E+00", undefined],
    ];

    for (const [value, code, locale] of cases) {
      const first = formatNumber(value, code, locale);
      expect(formatNumber(value, code, locale), `repeat ${value}`).toBe(first);
      // A cold cache must produce the same text as the cached repeat.
      resetNumberFormatResourcesForTest();
      expect(formatNumber(value, code, locale), `cold ${value}`).toBe(first);
    }
  });

  it("keeps cache entries separate per value, format code, and locale", () => {
    resetNumberFormatResourcesForTest();
    expect(formatNumber(-0)).toBe("-0");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1234.5, "#,##0.00", "en-US")).toBe("1,234.50");
    expect(formatNumber(1234.5, "#,##0.00", "de-DE")).toBe("1.234,50");
    expect(formatNumber(1234.5, "#,##0.0", "en-US")).toBe("1,234.5");
    expect(formatNumber(-1234.5, "#,##0.00", "en-US")).toBe("-1,234.50");
    expect(formatNumber(1234.5, "#,##0.00", "en-US")).toBe("1,234.50");
    expect(formatNumber(1234.5, "#,##0.00", "de-DE")).toBe("1.234,50");
    expect(formatNumber(1234.5, "#,##0.0", "en-US")).toBe("1,234.5");
  });

  it("matches a cold formatter over randomized values, codes, and locales", () => {
    // Deterministic value stream, so a failing case is reproducible.
    let seed = 0x5eed5eed;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let state = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      state = (state + Math.imul(state ^ (state >>> 7), 61 | state)) ^ state;
      return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296;
    };
    const codes: Array<string | undefined> = [
      undefined,
      "#,##0.00",
      "0",
      "0.0%",
      "0.00E+00",
      "#,##0.00;(#,##0.00)",
      '0.00" units"',
      "yyyy-mm-dd",
      "mmm d, yyyy h:mm:ss AM/PM",
      "¤#,##0.00",
    ];
    const locales = ["en-US", "de-DE", "fr-FR", "en-GB"];
    const specials = [-0, 0, Number.NaN, Number.POSITIVE_INFINITY, 1e21, -1e-7, 45_351.75];

    const cases = specials.map((value, index) => ({
      value,
      code: codes[index % codes.length],
      locale: locales[index % locales.length]!,
    }));
    for (let index = specials.length; index < 160; index++) {
      cases.push({
        value: (random() - 0.5) * 10 ** (random() * 12 - 6),
        code: codes[Math.floor(random() * codes.length)],
        locale: locales[Math.floor(random() * locales.length)]!,
      });
    }

    const cold = cases.map(({ value, code, locale }) => {
      resetNumberFormatResourcesForTest();
      return formatNumber(value, code, locale);
    });
    const warm = cases.map(({ value, code, locale }) => formatNumber(value, code, locale));
    expect(warm).toEqual(cold);
  });
});
