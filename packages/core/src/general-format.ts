// Excel's General number format: how a number with no format shows. Kept
// apart from number-format.ts so the canvas painter and the formatter use one
// set of exports, and bundlers can share both modules between the page and
// the render worker.

/** Excel's explicit "no format" code; a cell can carry it to opt out of its column's format. */
const GENERAL_CODE_RE = /^general$/i;

/** The characters Excel's General format fills in a standard-width cell. */
export const GENERAL_WIDTH = 11;

/**
 * Whether `format` shows a number in Excel's General format: no code,
 * `General`, or the Text format `@`, which shows a number as General does.
 */
export function isGeneralCode(format: string | undefined): boolean {
  return !format || format === "@" || GENERAL_CODE_RE.test(format);
}

/** Each locale's decimal separator; a host uses a few locales, so the map stays small. */
const DECIMAL_SEPARATOR_LIMIT = 32;
const decimal_separators = new Map<string, string>();

function decimal_separator(locale: string): string {
  let separator = decimal_separators.get(locale);
  if (separator === undefined) {
    separator =
      new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === "decimal")
        ?.value ?? ".";
    if (decimal_separators.size >= DECIMAL_SEPARATOR_LIMIT) decimal_separators.clear();
    decimal_separators.set(locale, separator);
  }
  return separator;
}

/** `digits` without the zeros that end its fraction, and without a bare decimal point. */
function trim_fraction(digits: string): string {
  if (!digits.includes(".")) return digits;
  let end = digits.length;
  while (digits.charCodeAt(end - 1) === 48) end--;
  if (digits.charCodeAt(end - 1) === 46) end--;
  return digits.slice(0, end);
}

/**
 * `magnitude` in General's scientific notation in at most `width` characters:
 * up to 5 decimals, trailing zeros dropped, and a two-digit exponent at least
 * (`1.23457E+11`, `1E-05`). Null when even `1E+11` does not fit.
 */
function general_scientific(magnitude: number, width: number): string | null {
  for (let decimals = Math.min(5, Math.max(0, width - 6)); decimals >= 0; decimals--) {
    const exponential = magnitude.toExponential(decimals);
    const e = exponential.indexOf("e");
    const power = Number(exponential.slice(e + 1));
    const text = `${trim_fraction(exponential.slice(0, e))}E${power < 0 ? "-" : "+"}${String(Math.abs(power)).padStart(2, "0")}`;
    if (text.length <= width) return text;
  }
  return null;
}

/**
 * A number as Excel's General format shows it in a cell `width` characters
 * wide, the minus sign not counted: no thousands separators, and rounded to
 * the digits that fit. A number whose whole part does not fit, or that is
 * below 0.0001, shows in scientific notation. A standard-width cell holds
 * 11 characters, so `123456789012` shows as `1.23457E+11` and `1/3` as
 * `0.333333333`. Excel shows no negative zero.
 *
 * @param value - The number to show.
 * @param width - The characters the cell holds; Excel's standard width holds 11.
 * @param locale - BCP 47 locale for the decimal separator; defaults to `en-US`.
 * @returns The text, or null when no form fits, where Excel shows `####`.
 */
export function formatGeneral(
  value: number,
  width = GENERAL_WIDTH,
  locale = "en-US",
): string | null {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  const exponent = Math.floor(Math.log10(magnitude));
  let text: string | null = null;
  if (exponent >= -4 && exponent < width) {
    // The whole part and the decimal point take their places first.
    const fixed = trim_fraction(magnitude.toFixed(Math.max(0, width - Math.max(exponent, 0) - 2)));
    if (fixed.length <= width && fixed !== "0") text = fixed;
  }
  text ??= general_scientific(magnitude, width);
  if (text === null) return null;
  const separator = decimal_separator(locale);
  if (separator !== ".") text = text.replace(".", separator);
  return value < 0 ? `-${text}` : text;
}
