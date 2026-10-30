// Excel's Home-tab vocabulary: the number formats, font sizes and font families
// the ribbon offers, plus the decimal and font-size stepping rules behind its
// Increase/Decrease buttons. Pure data and functions, shared by the grid's
// actions and the ribbon so the two can never disagree.

import { formatNumber } from "./number-format.js";

/** One entry of the ribbon's number-format list. */
export interface NumberFormatPreset {
  readonly label: string;
  readonly code: string;
}

/**
 * Number formats the formatter renders faithfully, in Excel's Home > Number
 * order. Fraction (`# ?/?`) and Text (`@`) are omitted: the formatter does not
 * support them, and a preset that paints the wrong digits is worse than none.
 */
export const NUMBER_FORMAT_PRESETS: readonly NumberFormatPreset[] = [
  { label: "General", code: "General" },
  { label: "Number", code: "0.00" },
  { label: "Currency", code: "$#,##0.00" },
  { label: "Accounting", code: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)' },
  { label: "Short Date", code: "m/d/yyyy" },
  { label: "Long Date", code: "dddd, mmmm d, yyyy" },
  { label: "Time", code: "h:mm:ss AM/PM" },
  { label: "Percentage", code: "0.00%" },
  { label: "Scientific", code: "0.00E+00" },
];

/** Codes behind the ribbon's $, % and comma-style buttons. */
export const ACCOUNTING_FORMAT = NUMBER_FORMAT_PRESETS[3]!.code;
export const PERCENT_FORMAT = "0%";
export const COMMA_FORMAT = "#,##0.00";

/** Label shown for a format code: a preset name, "General", or "Custom". */
export function numberFormatLabel(code: string | undefined): string {
  if (code === undefined || /^general$/i.test(code)) return "General";
  return NUMBER_FORMAT_PRESETS.find((preset) => preset.code === code)?.label ?? "Custom";
}

/** Excel's standard font sizes, in points. */
export const FONT_SIZES_PT: readonly number[] = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72,
];

const PX_PER_PT = 96 / 72;

export function pointsToPixels(points: number): number {
  return points * PX_PER_PT;
}

/** Points rounded to Excel's half-point display precision. */
export function pixelsToPoints(pixels: number): number {
  return Math.round((pixels / PX_PER_PT) * 2) / 2;
}

const FONT_SIZE_PX = /(\d+(?:\.\d+)?)px(?:\s*\/\s*\S+)?\s*/;

/**
 * Size and first family of a canvas font shorthand such as
 * `"13px Calibri, sans-serif"`: what an unstyled cell paints with, and so
 * what the ribbon shows for it. Missing parts are undefined.
 */
export function fontShorthandParts(font: string): { px?: number; family?: string } {
  const size = FONT_SIZE_PX.exec(font);
  if (size === null) return {};
  const px = Number(size[1]);
  const family = font
    .slice(size.index + size[0].length)
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  return family ? { px, family } : { px };
}

/**
 * The next standard size above (1) or below (-1) `currentPx`, in pixels. Past
 * either end of the list, Excel keeps stepping by 10 points up and stops at 1
 * point down.
 */
export function stepFontSizePx(currentPx: number, direction: 1 | -1): number {
  const current = pixelsToPoints(currentPx);
  const next =
    direction === 1
      ? (FONT_SIZES_PT.find((size) => size > current) ?? Math.ceil((current + 1) / 10) * 10)
      : ([...FONT_SIZES_PT].reverse().find((size) => size < current) ??
        Math.max(1, Math.floor(current) - 1));
  return pointsToPixels(next);
}

/**
 * Families offered by the font list. Each is common on at least one major
 * platform; a missing one falls back to the theme font when painted.
 */
export const FONT_FAMILIES: readonly string[] = [
  "Arial",
  "Calibri",
  "Cambria",
  "Consolas",
  "Courier New",
  "Georgia",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

/** Split a format code into its `;` sections, keeping quoted text intact. */
function formatSections(code: string): string[] {
  const sections: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    if (char === '"') quoted = !quoted;
    else if (char === "\\" && !quoted) index += 1;
    else if (char === ";" && !quoted) {
      sections.push(code.slice(start, index));
      start = index + 1;
    }
  }
  sections.push(code.slice(start));
  return sections;
}

const DIGIT_PLACEHOLDERS = "0#?";

/**
 * Add or remove one decimal place in a section's first digit-placeholder run,
 * skipping quoted text, escapes, `_`/`*` padding and `[...]` modifiers.
 * Returns null when the section has no digits to adjust (a date, time or text
 * section).
 */
function stepSectionDecimals(section: string, direction: 1 | -1): string | null {
  let index = 0;
  while (index < section.length) {
    const char = section[index]!;
    if (char === '"') {
      const close = section.indexOf('"', index + 1);
      index = close < 0 ? section.length : close + 1;
      continue;
    }
    if (char === "\\" || char === "_" || char === "*") {
      index += 2;
      continue;
    }
    if (char === "[") {
      const close = section.indexOf("]", index);
      index = close < 0 ? section.length : close + 1;
      continue;
    }
    if (!DIGIT_PLACEHOLDERS.includes(char)) {
      index += 1;
      continue;
    }

    let end = index;
    while (end < section.length && `${DIGIT_PLACEHOLDERS},`.includes(section[end]!)) end += 1;
    const integerEnd = end;
    let decimals = 0;
    if (section[end] === ".") {
      end += 1;
      while (end < section.length && DIGIT_PLACEHOLDERS.includes(section[end]!)) {
        end += 1;
        decimals += 1;
      }
    }
    // A run of only `?` pads alignment (Accounting's zero section `"-"??`); it
    // shows no digits, so Excel leaves it alone and so do we.
    if (!/[0#]/.test(section.slice(index, end))) {
      index = end;
      continue;
    }
    const next = Math.max(0, decimals + direction);
    const integer = section.slice(index, integerEnd);
    const run = next === 0 ? integer : `${integer}.${"0".repeat(next)}`;
    return section.slice(0, index) + run + section.slice(end);
  }
  return null;
}

/**
 * The format code that shows one more (1) or one fewer (-1) decimal place.
 * A General cell starts from the decimals its `sample` value currently shows,
 * as Excel does. Returns undefined when nothing changes: date and time
 * formats have no decimals to step, and zero decimals cannot shrink.
 */
export function stepNumberFormatDecimals(
  code: string | undefined,
  direction: 1 | -1,
  sample: number | undefined,
  locale?: string,
): string | undefined {
  if (code === undefined || /^general$/i.test(code)) {
    const shown = sample === undefined ? "" : formatNumber(sample, undefined, locale);
    const decimals = /[.,](\d+)$/.exec(shown)?.[1]?.length ?? 0;
    const next = Math.max(0, decimals + direction);
    if (next === decimals) return undefined;
    return next === 0 ? "0" : `0.${"0".repeat(next)}`;
  }

  const sections = formatSections(code);
  const stepped = sections.map((section) => stepSectionDecimals(section, direction));
  if (stepped.every((section) => section === null)) return undefined;
  const next = stepped.map((section, index) => section ?? sections[index]!).join(";");
  return next === code ? undefined : next;
}
