import { FICTIONAL_LEAP_DAY_SERIAL, serialToDate, serialToWeekdayDate } from "./date-serial.js";
import { formatGeneral, GENERAL_WIDTH, isGeneralCode } from "./general-format.js";

interface NumericDescriptor {
  percent: boolean;
  decimals: number;
  grouped: boolean;
  prefix: string;
  suffix: string;
  scientific: boolean;
  exponentDigits: number;
}

type DateTokenKind =
  | "year4"
  | "year2"
  | "month"
  | "monthShort"
  | "monthLong"
  | "minute"
  | "day"
  | "weekdayShort"
  | "weekdayLong"
  | "hour"
  | "second"
  /** `[h]`, `[m]` and `[s]`: elapsed time in hours, minutes or seconds. */
  | "elapsedHours"
  | "elapsedMinutes"
  | "elapsedSeconds"
  | "ampm"
  | "literal";

interface DateToken {
  kind: DateTokenKind;
  pad: boolean;
  text: string;
}

/** A section's condition, such as `[<=100]`: a comparison and the number it compares with. */
interface SectionCondition {
  readonly operator: "<" | "<=" | ">" | ">=" | "=" | "<>";
  readonly operand: number;
}

interface CompiledSection {
  readonly source: string;
  /** The CSS color of the section's `[Red]` or `[Color10]`, or null. */
  readonly color: string | null;
  readonly condition: SectionCondition | null;
  readonly dateTokens: readonly DateToken[] | null;
  readonly numeric: NumericDescriptor | null;
  readonly fraction: FractionDescriptor | null;
  /** Holds `@`, the text placeholder. */
  readonly text: boolean;
  readonly literal: string;
}

/**
 * A fraction section, such as `# ?/?`, `?/?`, `# ??/100` or `#,##0 ??/??`:
 * literal text, an optional whole-number part, the numerator's and the
 * denominator's placeholders, and literal text after them. A fixed
 * denominator (`?/16`) is a number.
 */
interface FractionDescriptor {
  readonly prefix: string;
  /** The whole-number part's placeholders, without its grouping commas. */
  readonly integer: string | null;
  readonly grouped: boolean;
  readonly separator: string;
  readonly numerator: string;
  readonly denominator: string | number;
  readonly suffix: string;
}

interface CompiledFormat {
  readonly sections: readonly CompiledSection[];
  /**
   * The sections numbers choose from: all but a last one that holds `@`,
   * the text section. Empty for the Text format, `@` alone.
   */
  readonly numberSections: readonly CompiledSection[];
  /** Whether a number section has a color, so painting skips the rest when none does. */
  readonly colored: boolean;
  /** Whether a number section has a condition, which replaces the choice by sign. */
  readonly conditional: boolean;
}

export interface NumberFormatResourceStats {
  readonly compiledFormats: number;
  readonly numberFormatters: number;
  readonly dateTimeFormatters: number;
  readonly formatCacheEntries: number;
  readonly numberFormatterCacheEntries: number;
  readonly dateTimeFormatterCacheEntries: number;
  readonly numberTextEntries: number;
}

/*
 * The format caches below are page-wide, not owned by one grid. Their values
 * depend only on the format code and the locale, never on a grid or its data,
 * so grids that show the same formats share one entry. Each cache has a fixed
 * size limit, and `trimNumberFormatCaches` (called by `Grid.trimMemory`) drops
 * them all; the next format call builds what it needs again.
 */
const FORMAT_CACHE_LIMIT = 256;
const NUMBER_FORMATTER_CACHE_LIMIT = 128;
const DATE_TIME_FORMATTER_CACHE_LIMIT = 64;
const formatCache = new Map<string, CompiledFormat>();
const numberFormatterCache = new Map<string, Intl.NumberFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Rendered-text cache for numbers and dates. `Intl` formatting and date token
 * rendering dominate a repaint of formatted columns, and a scrolled frame
 * re-renders the same values repeatedly. The outer map is keyed by the format
 * code, then the locale, then the value, so a lookup never builds a composite
 * key string.
 *
 * Three bounds keep the cache small: at most `NUMBER_TEXT_GROUP_LIMIT`
 * (format, locale) groups, at most `NUMBER_TEXT_PER_GROUP_LIMIT` values in each
 * group, and nothing longer than `NUMBER_TEXT_MAX_TEXT_LENGTH` characters. The
 * worst case is therefore 8 × 512 = 4096 strings of at most 128 characters
 * (about one MiB of text), and the group keys are references to strings the
 * caller already holds.
 */
const NUMBER_TEXT_GROUP_LIMIT = 8;
const NUMBER_TEXT_PER_GROUP_LIMIT = 512;
const NUMBER_TEXT_MAX_TEXT_LENGTH = 128;
const numberTextCache = new Map<string, Map<string, Map<number, string>>>();
let numberTextGroups = 0;

/** Drop the least recently added (format, locale) group. */
function dropOldestNumberTextGroup(): void {
  const oldestCode = numberTextCache.keys().next();
  if (oldestCode.done) return;
  const byLocale = numberTextCache.get(oldestCode.value);
  if (byLocale === undefined) return;
  const oldestLocale = byLocale.keys().next();
  if (oldestLocale.done) {
    numberTextCache.delete(oldestCode.value);
    return;
  }
  byLocale.delete(oldestLocale.value);
  numberTextGroups -= 1;
  if (byLocale.size === 0) numberTextCache.delete(oldestCode.value);
}

function lookupNumberText(code: string, locale: string, value: number): string | undefined {
  const byLocale = numberTextCache.get(code);
  if (byLocale === undefined) return undefined;
  const texts = byLocale.get(locale);
  if (texts === undefined) return undefined;
  const cached = texts.get(value);
  if (cached === undefined) return undefined;
  // Refresh recency so a scrolling window keeps the values it re-reads.
  texts.delete(value);
  texts.set(value, cached);
  return cached;
}

function rememberNumberText(code: string, locale: string, value: number, text: string): string {
  // Long output is rare and would make the retained text unbounded.
  if (text.length > NUMBER_TEXT_MAX_TEXT_LENGTH) return text;
  let byLocale = numberTextCache.get(code);
  if (byLocale === undefined) {
    byLocale = new Map();
    numberTextCache.set(code, byLocale);
  }
  let texts = byLocale.get(locale);
  if (texts === undefined) {
    if (numberTextGroups >= NUMBER_TEXT_GROUP_LIMIT) dropOldestNumberTextGroup();
    texts = new Map();
    byLocale.set(locale, texts);
    numberTextGroups += 1;
  }
  if (texts.delete(value)) texts.set(value, text);
  else {
    texts.set(value, text);
    if (texts.size > NUMBER_TEXT_PER_GROUP_LIMIT) {
      const oldest = texts.keys().next();
      if (!oldest.done) texts.delete(oldest.value);
    }
  }
  return text;
}
let compiledFormats = 0;
let numberFormatters = 0;
let dateTimeFormatters = 0;
let currencySymbol: string | undefined;

function splitRawSections(code: string): string[] {
  const sections: string[] = [];
  let section = "";
  let quoted = false;
  for (let index = 0; index < code.length; index++) {
    const char = code[index]!;
    if (char === '"') quoted = !quoted;
    if (char === "\\" && index + 1 < code.length) {
      section += char + code[++index]!;
      continue;
    }
    if (char === ";" && !quoted) {
      sections.push(section);
      section = "";
    } else {
      section += char;
    }
  }
  sections.push(section);
  return sections.slice(0, 4);
}

function sectionFor(
  value: number,
  format: CompiledFormat,
): { section: CompiledSection; magnitude: number } {
  const sections = format.numberSections;
  const fallback = sections[0]!;
  if (format.conditional) return conditionalSection(value, sections);
  if (value > 0 || sections.length === 1) return { section: fallback, magnitude: value };
  if (value < 0) {
    return sections[1] !== undefined
      ? { section: sections[1], magnitude: Math.abs(value) }
      : { section: fallback, magnitude: value };
  }
  return { section: sections[2] ?? fallback, magnitude: 0 };
}

function meets(value: number, condition: SectionCondition): boolean {
  const operand = condition.operand;
  switch (condition.operator) {
    case "<":
      return value < operand;
    case "<=":
      return value <= operand;
    case ">":
      return value > operand;
    case ">=":
      return value >= operand;
    case "=":
      return value === operand;
    case "<>":
      return value !== operand;
  }
}

/** Whether only negative numbers meet `condition`, as only they take a negative section. */
function onlyNegative(condition: SectionCondition): boolean {
  return condition.operator === "<"
    ? condition.operand <= 0
    : (condition.operator === "<=" || condition.operator === "=") && condition.operand < 0;
}

/**
 * The section a condition chooses: the first section whose condition `value`
 * meets, else the third section when the first two have conditions, else the
 * second. A section that only negative numbers meet shows the magnitude, as
 * Excel's negative section does; the other sections keep the sign.
 */
function conditionalSection(
  value: number,
  sections: readonly CompiledSection[],
): { section: CompiledSection; magnitude: number } {
  const first = sections[0]!;
  const second = sections[1];
  const many = sections.length > 1;
  if (first.condition !== null && meets(value, first.condition)) {
    return { section: first, magnitude: many && onlyNegative(first.condition) ? -value : value };
  }
  if (second?.condition && meets(value, second.condition)) {
    return { section: second, magnitude: onlyNegative(second.condition) ? -value : value };
  }
  if (first.condition !== null && second?.condition) {
    return { section: sections[2] ?? first, magnitude: value };
  }
  return { section: first.condition !== null && second ? second : first, magnitude: value };
}

/** Excel's eight color names. */
const COLOR_NAMES = new Map([
  ["black", "#000000"],
  ["white", "#ffffff"],
  ["red", "#ff0000"],
  ["green", "#00ff00"],
  ["blue", "#0000ff"],
  ["yellow", "#ffff00"],
  ["magenta", "#ff00ff"],
  ["cyan", "#00ffff"],
]);

/** Excel's default palette, `[Color1]` to `[Color56]`. */
const PALETTE = [
  "#000000",
  "#ffffff",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#ff00ff",
  "#00ffff",
  "#800000",
  "#008000",
  "#000080",
  "#808000",
  "#800080",
  "#008080",
  "#c0c0c0",
  "#808080",
  "#9999ff",
  "#993366",
  "#ffffcc",
  "#ccffff",
  "#660066",
  "#ff8080",
  "#0066cc",
  "#ccccff",
  "#000080",
  "#ff00ff",
  "#ffff00",
  "#00ffff",
  "#800080",
  "#800000",
  "#008080",
  "#0000ff",
  "#00ccff",
  "#ccffff",
  "#ccffcc",
  "#ffff99",
  "#99ccff",
  "#ff99cc",
  "#cc99ff",
  "#ffcc99",
  "#3366ff",
  "#33cccc",
  "#99cc00",
  "#ffcc00",
  "#ff9900",
  "#ff6600",
  "#666699",
  "#969696",
  "#003366",
  "#339966",
  "#003300",
  "#333300",
  "#993300",
  "#993366",
  "#333399",
  "#333333",
];

const PALETTE_COLOR = /^color(\d{1,2})$/i;
const CONDITION = /^(<=|>=|<>|<|>|=)\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i;

/** The color and the condition in a section's brackets; colors and conditions take the first of each. */
function sectionBrackets(source: string): Pick<CompiledSection, "color" | "condition"> {
  let color: string | null = null;
  let condition: SectionCondition | null = null;
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (char === "\\") index++;
    else if (char === "[") {
      const close = source.indexOf("]", index + 1);
      if (close < 0) break;
      const content = source.slice(index + 1, close);
      index = close;
      const named = COLOR_NAMES.get(content.toLowerCase());
      const palette = named === undefined ? PALETTE_COLOR.exec(content) : null;
      const test = named === undefined && palette === null ? CONDITION.exec(content) : null;
      if (named !== undefined) color ??= named;
      else if (palette !== null) color ??= PALETTE[Number(palette[1]) - 1] ?? null;
      else if (test !== null) {
        condition ??= {
          operator: test[1] as SectionCondition["operator"],
          operand: Number(test[2]),
        };
      }
    }
  }
  return { color, condition };
}

/**
 * The CSS color, such as `#ff0000`, of the section of `format` that `value`
 * takes, as Excel paints a section's `[Red]` or `[Color10]`; undefined when
 * that section has no color. The format compiles once and stays cached.
 */
export function numberFormatColor(value: number, format: string | undefined): string | undefined {
  if (format === undefined || !Number.isFinite(value)) return undefined;
  const compiled = compileFormat(format);
  if (!compiled.colored) return undefined;
  return sectionFor(value, compiled).section.color ?? undefined;
}

function cacheValue<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): V {
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  return value;
}

/** Test-only deterministic formatter resource counters. */
export function getNumberFormatResourceStatsForTest(): NumberFormatResourceStats {
  let numberTextEntries = 0;
  for (const byLocale of numberTextCache.values()) {
    for (const texts of byLocale.values()) numberTextEntries += texts.size;
  }

  return {
    compiledFormats,
    numberFormatters,
    dateTimeFormatters,
    formatCacheEntries: formatCache.size,
    numberFormatterCacheEntries: numberFormatterCache.size,
    dateTimeFormatterCacheEntries: dateTimeFormatterCache.size,
    numberTextEntries,
  };
}

/**
 * Drop the compiled formats, the `Intl` formatters and the rendered number
 * text. The creation counters stay, so tests can see a rebuild.
 */
export function trimNumberFormatCaches(): void {
  formatCache.clear();
  numberFormatterCache.clear();
  dateTimeFormatterCache.clear();
  numberTextCache.clear();
  numberTextGroups = 0;
}

/** Test-only reset for isolated formatter resource assertions. */
export function resetNumberFormatResourcesForTest(): void {
  trimNumberFormatCaches();
  compiledFormats = 0;
  numberFormatters = 0;
  dateTimeFormatters = 0;
  currencySymbol = undefined;
}

function decodeLiteral(source: string): string {
  let output = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "\\" && index + 1 < source.length) {
      output += source[++index]!;
      continue;
    }
    if ((char === "_" || char === "*") && index + 1 < source.length) {
      index++;
      continue;
    }
    if (char === "[" && !quoted) {
      const close = source.indexOf("]", index + 1);
      const currency = /^\$([^-]*)-[0-9A-F]+$/i.exec(source.slice(index + 1, close));
      if (close >= 0) {
        if (currency?.[1]) output += currency[1];
        index = close;
        continue;
      }
    }
    output += char;
  }
  return output.includes("¤") ? output.replaceAll("¤", getCurrencySymbol()) : output;
}

function placeholderBounds(section: string): [number, number] | null {
  let first = -1;
  let last = -1;
  let quoted = false;
  for (let index = 0; index < section.length; index++) {
    const char = section[index]!;
    if (char === '"') quoted = !quoted;
    else if (char === "[" && !quoted) {
      const close = section.indexOf("]", index + 1);
      if (close >= 0) index = close;
    } else if (char === "\\") index++;
    else if (!quoted && /[0#?]/.test(char)) {
      if (first < 0) first = index;
      last = index;
    }
  }
  return first < 0 ? null : [first, last];
}

function parseNumericFormat(section: string): NumericDescriptor | null {
  const bounds = placeholderBounds(section);
  if (!bounds) return null;
  const [first, last] = bounds;
  const pattern = section.slice(first, last + 1);
  const exponent = /E[+-]?(0+)/i.exec(pattern);
  const mantissa = exponent ? pattern.slice(0, exponent.index) : pattern;
  const dot = mantissa.indexOf(".");
  let decimals = 0;
  if (dot >= 0) {
    for (let index = dot + 1; index < mantissa.length; index++) {
      if (/[0#?]/.test(mantissa[index]!)) decimals++;
      else break;
    }
  }
  const descriptor: NumericDescriptor = {
    percent: section.includes("%"),
    decimals,
    grouped: mantissa.includes(","),
    prefix: decodeLiteral(section.slice(0, first)),
    suffix: decodeLiteral(section.slice(last + 1)),
    scientific: exponent !== null,
    exponentDigits: exponent?.[1]?.length ?? 0,
  };
  return descriptor;
}

function formatter(locale: string, decimals: number, grouped: boolean): Intl.NumberFormat {
  const key = `fixed:${locale}:${decimals}:${grouped ? 1 : 0}`;
  const cached = numberFormatterCache.get(key);
  if (cached) return cached;
  numberFormatters += 1;
  return cacheValue(
    numberFormatterCache,
    key,
    new Intl.NumberFormat(locale, {
      useGrouping: grouped,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
    NUMBER_FORMATTER_CACHE_LIMIT,
  );
}

function getCurrencySymbol(): string {
  if (currencySymbol === undefined) {
    numberFormatters += 1;
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).formatToParts(0);
    currencySymbol = parts.find((part) => part.type === "currency")?.value ?? "$";
  }
  return currencySymbol;
}

/**
 * The elapsed-time token of the bracket `section[open..close]`: `[h]`, `[mm]`
 * and `[ss]` give hours, minutes and seconds; anything else (a color, a
 * condition or a locale) gives `null`.
 */
function elapsedKind(section: string, open: number, close: number): DateTokenKind | null {
  if (close <= open + 1) return null;
  const lower = section[open + 1]!.toLowerCase();
  for (let index = open + 2; index < close; index++) {
    if (section[index]!.toLowerCase() !== lower) return null;
  }
  if (lower === "h") return "elapsedHours";
  if (lower === "m") return "elapsedMinutes";
  return lower === "s" ? "elapsedSeconds" : null;
}

const ELAPSED_KINDS: ReadonlySet<DateTokenKind> = new Set([
  "elapsedHours",
  "elapsedMinutes",
  "elapsedSeconds",
]);

function tokenizeDate(section: string): DateToken[] {
  const tokens: DateToken[] = [];
  for (let index = 0; index < section.length;) {
    if (section[index] === '"') {
      const close = section.indexOf('"', index + 1);
      const end = close < 0 ? section.length : close;
      tokens.push({ kind: "literal", pad: false, text: section.slice(index + 1, end) });
      index = close < 0 ? section.length : close + 1;
      continue;
    }

    if (section[index] === "\\" && index + 1 < section.length) {
      tokens.push({ kind: "literal", pad: false, text: section[index + 1]! });
      index += 2;
      continue;
    }

    if (section[index] === "[") {
      const close = section.indexOf("]", index + 1);
      if (close < 0) {
        tokens.push({ kind: "literal", pad: false, text: "[" });
        index++;
        continue;
      }
      const kind = elapsedKind(section, index, close);
      tokens.push(
        kind === null
          ? { kind: "literal", pad: false, text: decodeLiteral(section.slice(index, close + 1)) }
          : { kind, pad: close - index > 2, text: "" },
      );
      index = close + 1;
      continue;
    }

    const ampm = section.slice(index).match(/^(am\/pm|a\/p)/i)?.[0];
    if (ampm) {
      tokens.push({ kind: "ampm", pad: false, text: "" });
      index += ampm.length;
      continue;
    }

    const lower = section[index]!.toLowerCase();
    if (lower === "y" || lower === "m" || lower === "d" || lower === "h" || lower === "s") {
      let end = index + 1;
      while (end < section.length && section[end]!.toLowerCase() === lower) end++;
      const run = end - index;
      if (lower === "y") tokens.push({ kind: run >= 3 ? "year4" : "year2", pad: false, text: "" });
      else if (lower === "m") {
        tokens.push({
          kind: run >= 4 ? "monthLong" : run === 3 ? "monthShort" : "month",
          pad: run === 2,
          text: "",
        });
      } else if (lower === "d") {
        tokens.push({
          kind: run >= 4 ? "weekdayLong" : run === 3 ? "weekdayShort" : "day",
          pad: run === 2,
          text: "",
        });
      } else if (lower === "h") tokens.push({ kind: "hour", pad: run >= 2, text: "" });
      else tokens.push({ kind: "second", pad: run >= 2, text: "" });
      index = end;
      continue;
    }

    let literal = "";
    while (
      index < section.length &&
      !/[ymdhs"\\[]/i.test(section[index]!) &&
      !/^(am\/pm|a\/p)/i.test(section.slice(index))
    ) {
      literal += section[index++]!;
    }

    tokens.push({ kind: "literal", pad: false, text: decodeLiteral(literal) });
  }

  resolveMonthMinute(tokens);
  return tokens;
}

function compileDateFormat(section: string): DateToken[] | null {
  let visible = "";
  let quoted = false;
  for (let index = 0; index < section.length; index++) {
    const char = section[index]!;
    if (char === "[" && !quoted) {
      const close = section.indexOf("]", index + 1);
      if (close >= 0) {
        // Elapsed time shows as a time; other brackets show nothing.
        if (elapsedKind(section, index, close) !== null) visible += section[index + 1];
        index = close;
        continue;
      }
    }
    if (char === '"') quoted = !quoted;
    else if (char === "\\") index++;
    else if (!quoted) visible += char;
  }
  const tokens = /[ymdhs]/i.test(visible) && !/#/.test(visible) ? tokenizeDate(section) : null;
  return tokens;
}

function resolveMonthMinute(tokens: DateToken[]): void {
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]!.kind !== "month") continue;
    let minute = false;
    for (let previous = index - 1; previous >= 0; previous--) {
      if (tokens[previous]!.kind === "literal") continue;
      const kind = tokens[previous]!.kind;
      minute = kind === "hour" || kind === "elapsedHours";
      break;
    }
    if (!minute) {
      for (let next = index + 1; next < tokens.length; next++) {
        if (tokens[next]!.kind === "literal") continue;
        const kind = tokens[next]!.kind;
        minute = kind === "second" || kind === "elapsedSeconds";
        break;
      }
    }

    if (minute) tokens[index]!.kind = "minute";
  }
}

function compileFormat(code: string): CompiledFormat {
  const cached = formatCache.get(code);
  if (cached) return cached;
  const sections = splitRawSections(code).map((source): CompiledSection => ({
    source,
    ...sectionBrackets(source),
    dateTokens: compileDateFormat(source),
    numeric: parseNumericFormat(source),
    fraction: parseFraction(source),
    text: hasTextPlaceholder(source),
    literal: decodeLiteral(source),
  }));
  // A last section that holds `@` is the text section, which numbers skip.
  const numberSections =
    sections.length < 4 && sections[sections.length - 1]!.text ? sections.slice(0, -1) : sections;
  const compiled = {
    sections,
    numberSections,
    colored: numberSections.some((section) => section.color !== null),
    conditional: numberSections.some((section) => section.condition !== null),
  };
  compiledFormats += 1;
  return cacheValue(formatCache, code, compiled, FORMAT_CACHE_LIMIT);
}

function calendarFormatter(
  locale: string,
  field: "month" | "weekday",
  width: "long" | "short",
): Intl.DateTimeFormat {
  const key = `${locale}:${field}:${width}`;
  const cached = dateTimeFormatterCache.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions = { timeZone: "UTC", [field]: width };
  dateTimeFormatters += 1;
  return cacheValue(
    dateTimeFormatterCache,
    key,
    new Intl.DateTimeFormat(locale, options),
    DATE_TIME_FORMATTER_CACHE_LIMIT,
  );
}

/**
 * Render date tokens for a serial. `serialToDate` gives serial 60 as 28 February
 * 1900, which has the year, month and time Excel shows for its fictional 29
 * February, so only the day of the month changes. Weekday names follow Excel's
 * count through `serialToWeekdayDate`, which differs from the real date's before 1
 * March 1900. Elapsed time (`[h]:mm:ss`) counts whole seconds from serial 0,
 * rounded as Excel shows them, and the minutes and seconds beside it come from
 * the same count.
 */
function renderDate(serial: number, tokens: readonly DateToken[], locale: string): string {
  const date = serialToDate(serial);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = Math.floor(serial) === FICTIONAL_LEAP_DAY_SERIAL ? 29 : date.getUTCDate();
  const hour24 = date.getUTCHours();
  let minute = date.getUTCMinutes();
  let second = date.getUTCSeconds();
  const elapsed = tokens.some((token) => ELAPSED_KINDS.has(token.kind));
  const totalSeconds = elapsed ? Math.round(serial * 86_400) : 0;
  if (elapsed) {
    minute = Math.floor(totalSeconds / 60) % 60;
    second = totalSeconds % 60;
  }
  const usesAmPm = tokens.some((token) => token.kind === "ampm");
  let output = "";
  for (const token of tokens) {
    switch (token.kind) {
      case "literal":
        output += token.text;
        break;

      case "year4":
        output += String(year).padStart(4, "0");
        break;

      case "year2":
        output += String(((year % 100) + 100) % 100).padStart(2, "0");
        break;

      case "month":
        output += token.pad ? String(month).padStart(2, "0") : String(month);
        break;

      case "monthShort":
      case "monthLong":
        output += calendarFormatter(
          locale,
          "month",
          token.kind === "monthLong" ? "long" : "short",
        ).format(date);
        break;

      case "minute":
        output += token.pad ? String(minute).padStart(2, "0") : String(minute);
        break;

      case "day":
        output += token.pad ? String(day).padStart(2, "0") : String(day);
        break;

      case "weekdayShort":
      case "weekdayLong":
        output += calendarFormatter(
          locale,
          "weekday",
          token.kind === "weekdayLong" ? "long" : "short",
        ).format(serialToWeekdayDate(serial));
        break;

      case "hour": {
        const hour = usesAmPm ? hour24 % 12 || 12 : hour24;
        output += token.pad ? String(hour).padStart(2, "0") : String(hour);
        break;
      }

      case "second":
        output += token.pad ? String(second).padStart(2, "0") : String(second);
        break;

      case "elapsedHours":
      case "elapsedMinutes":
      case "elapsedSeconds": {
        const count =
          token.kind === "elapsedHours"
            ? Math.floor(totalSeconds / 3600)
            : token.kind === "elapsedMinutes"
              ? Math.floor(totalSeconds / 60)
              : totalSeconds;
        output += token.pad ? String(count).padStart(2, "0") : String(count);
        break;
      }

      case "ampm":
        output += hour24 < 12 ? "AM" : "PM";
        break;
    }
  }

  return output;
}

function formatScientific(value: number, decimals: number, exponentDigits: number): string {
  const [mantissa, rawExponent = "0"] = value.toExponential(decimals).toUpperCase().split("E");
  const exponent = Number(rawExponent);
  const sign = exponent >= 0 ? "+" : "-";
  return `${mantissa}E${sign}${String(Math.abs(exponent)).padStart(exponentDigits, "0")}`;
}

/** Whether a section holds `@` outside quotes and escapes. */
function hasTextPlaceholder(section: string): boolean {
  let quoted = false;
  for (let index = 0; index < section.length; index++) {
    const char = section[index]!;
    if (char === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (char === "\\") index++;
    else if (char === "@") return true;
  }
  return false;
}

/** The index of the fraction's `/`, outside quotes, escapes and brackets, or -1. */
function fractionSlash(section: string): number {
  let quoted = false;
  for (let index = 0; index < section.length; index++) {
    const char = section[index]!;
    if (char === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (char === "\\") index++;
    else if (char === "[") {
      const close = section.indexOf("]", index + 1);
      if (close >= 0) index = close;
    } else if (char === "/") return index;
  }
  return -1;
}

/**
 * The literal text of a stretch of a fraction code, or `null` when it holds a
 * number placeholder, percent, exponent, `General` or a date letter.
 */
function fractionLiteral(source: string): string | null {
  let visible = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (char === "\\" || char === "_" || char === "*") index++;
    else if (char === "[") {
      const close = source.indexOf("]", index + 1);
      if (close >= 0) index = close;
    } else visible += char;
  }
  return /[0#?%dmyhsg]|e[+-]/i.test(visible) ? null : decodeLiteral(source);
}

/**
 * The fraction layout of a section, or `null` when it is not one: a `/` with
 * digit placeholders right before it and placeholders or digits right after.
 */
function parseFraction(section: string): FractionDescriptor | null {
  const slash = fractionSlash(section);
  if (slash < 0) return null;
  const head = section.slice(0, slash);
  const tail = section.slice(slash + 1);
  const denominatorText = /^[0-9#?]*/.exec(tail)![0];
  const numerator = /[0#?]+$/.exec(head)?.[0];
  if (denominatorText === "" || numerator === undefined) return null;
  const before = head.slice(0, head.length - numerator.length);
  // The whole-number part: the last run of placeholders and grouping commas
  // before the numerator, apart from it by literal text.
  const integer = /([0#?,]*[0#?])([^0#?]*)$/.exec(before);
  const prefix = fractionLiteral(integer ? before.slice(0, integer.index) : before);
  const separator = integer ? fractionLiteral(integer[2]!) : "";
  const suffix = fractionLiteral(tail.slice(denominatorText.length));
  if (prefix === null || separator === null || suffix === null) return null;
  return {
    prefix,
    integer: integer ? integer[1]!.replaceAll(",", "") : null,
    grouped: integer?.[1]!.includes(",") ?? false,
    separator,
    numerator,
    denominator: /^[1-9][0-9]*$/.test(denominatorText) ? Number(denominatorText) : denominatorText,
    suffix,
  };
}
/**
 * A whole number's digits as Excel writes them: at most 15 significant
 * digits, then zeros, so a huge whole part reads as TEXT() writes it.
 */
function integerDigits(value: number): string {
  const key = "integer-digits";
  const cached = numberFormatterCache.get(key);
  if (cached) return cached.format(value);
  numberFormatters += 1;
  return cacheValue(
    numberFormatterCache,
    key,
    new Intl.NumberFormat("en-US", { maximumSignificantDigits: 15, useGrouping: false }),
    NUMBER_FORMATTER_CACHE_LIMIT,
  ).format(value);
}

/** A number rounded to the 15 significant digits Excel keeps. */
function significant(value: number): number {
  return Number(value.toPrecision(15));
}

/**
 * The fraction closest to `value` whose denominator is at most
 * `maxDenominator`, as numerator and denominator. On a tie the smaller
 * denominator wins. The closest fraction is the last convergent of
 * `value`'s continued fraction within the bound, or the semiconvergent after
 * it, so a few steps find it instead of trying every denominator.
 */
function closestFraction(value: number, maxDenominator: number): [number, number] {
  // The two latest convergents, oldest first, starting from 0/1 and 1/0.
  let [p0, q0, p1, q1] = [0, 1, 1, 0];
  let rest = value;
  for (;;) {
    const term = Math.floor(rest);
    const nextQ = term * q1 + q0;
    if (nextQ > maxDenominator) {
      const steps = Math.floor((maxDenominator - q0) / q1);
      const p = steps * p1 + p0;
      const q = steps * q1 + q0;
      const error = Math.abs(value - p / q);
      const latest = Math.abs(value - p1 / q1);
      return error < latest || (error === latest && q < q1) ? [p, q] : [p1, q1];
    }
    [p0, q0, p1, q1] = [p1, q1, term * p1 + p0, nextQ];
    const fraction = rest - term;
    if (fraction === 0 || p1 / q1 === value) return [p1, q1];
    rest = 1 / fraction;
  }
}

/** `0` pads with a zero, `?` with a space, `#` with nothing. */
function placeholderPad(placeholders: string): string {
  return placeholders.replaceAll("#", "").replaceAll("?", " ");
}

/**
 * The value as Excel writes it with a fraction code: an optional whole
 * number, then the closest fraction the denominator allows. A fraction that
 * rounds to zero leaves spaces in its place, and one that rounds to a whole
 * carries into the whole number. The numerator is right-aligned in its
 * placeholders and the denominator left-aligned.
 */
function renderFraction(value: number, fraction: FractionDescriptor, locale: string): string {
  const magnitude = significant(Math.abs(value));
  let whole = 0;
  let part = magnitude;
  if (fraction.integer !== null) {
    whole = Math.trunc(magnitude);
    part = significant(magnitude - whole);
  }
  const fixed = typeof fraction.denominator === "number";
  const [rounded, denominator] =
    typeof fraction.denominator === "number"
      ? [Math.round(significant(part * fraction.denominator)), fraction.denominator]
      : closestFraction(part, 10 ** fraction.denominator.length - 1);
  let numerator = rounded;
  if (fraction.integer !== null && numerator >= denominator) {
    whole += 1;
    numerator = 0;
  }

  let text = value < 0 && (whole > 0 || numerator > 0) ? "-" : "";
  text += fraction.prefix;
  if (fraction.integer !== null) {
    const digits = whole > 0 ? integerDigits(whole) : "";
    let integer =
      placeholderPad(
        fraction.integer.slice(0, Math.max(0, fraction.integer.length - digits.length)),
      ) + digits;
    if (integer.trim() === "" && numerator === 0) integer = "0";
    text +=
      fraction.grouped && /^\d+$/.test(integer)
        ? formatter(locale, 0, true).format(Number(integer))
        : integer;
    text += fraction.separator;
    if (numerator === 0) {
      const width =
        fraction.numerator.length + 1 + (fixed ? 0 : String(fraction.denominator).length);
      return text + " ".repeat(width) + fraction.suffix;
    }
  }
  const numeratorText = integerDigits(numerator);
  text += placeholderPad(
    fraction.numerator.slice(0, Math.max(0, fraction.numerator.length - numeratorText.length)),
  );
  text += `${numeratorText}/`;
  const denominatorText = integerDigits(denominator);
  text += fixed
    ? denominatorText
    : denominatorText + placeholderPad(String(fraction.denominator).slice(denominatorText.length));
  return text + fraction.suffix;
}

/**
 * Deterministic Excel-style number/date formatter. Supports explicit locale
 * separators, percent/scientific notation, UTC date/time tokens, four-section
 * positive/negative/zero/text codes, fractions (`# ?/?`, `# ??/16`), quoted
 * literals, and backslash escapes. `General` formats exactly like an omitted
 * code, and so does the Text format `@` for a number.
 *
 * @param value - The number to format; a string is placed into the code's text section.
 * @param format - Excel number-format code, such as `#,##0.00` or `yyyy-mm-dd`;
 *   when it is omitted, the value is formatted as with `General`.
 * @param locale - BCP 47 locale for the decimal and group separators; defaults to `en-US`.
 * @returns The value as Excel would show it with that code.
 */
export function formatNumber(value: number | string, format?: string, locale = "en-US"): string {
  const code = isGeneralCode(format) ? undefined : format;
  if (typeof value === "string") {
    if (!code) return value;
    const textSection = compileFormat(code).sections[3];
    return textSection === undefined ? value : textSection.literal.replaceAll("@", value);
  }
  if (!Number.isFinite(value)) return "";

  // `-0` and `0` share one Map key under SameValueZero but can render
  // differently (a one-section code keeps the raw negative magnitude), so
  // negative zero never enters the cache.
  const cacheable = !Object.is(value, -0);
  const formatCode = code ?? "";
  if (cacheable) {
    const cached = lookupNumberText(formatCode, locale, value);
    if (cached !== undefined) return cached;
  }
  const text = renderNumberText(value, code, locale);
  return cacheable ? rememberNumberText(formatCode, locale, value, text) : text;
}

/** Uncached format core; `formatNumber` owns the shared text cache. */
function renderNumberText(value: number, code: string | undefined, locale: string): string {
  if (!code) return formatGeneral(value, GENERAL_WIDTH, locale) ?? "";

  const format = compileFormat(code);
  // A text format, such as `"Code "@`, shows a number as General would.
  if (format.numberSections.length === 0) return formatGeneral(value, GENERAL_WIDTH, locale) ?? "";
  const { section, magnitude } = sectionFor(value, format);
  if (section.fraction) return renderFraction(magnitude, section.fraction, locale);
  if (section.dateTokens) return renderDate(magnitude, section.dateTokens, locale);

  const descriptor = section.numeric;
  if (!descriptor) return section.literal.replaceAll("@", "");
  // Only the first-section fallback keeps a negative magnitude. Put its
  // automatic sign before all affixes, not inside the formatted digit run.
  // Preserve the existing handling of raw -0, dates, and explicit sections.
  const automaticMinus = magnitude < 0;
  const numericValue = automaticMinus ? -magnitude : magnitude;
  const scaled = descriptor.percent ? numericValue * 100 : numericValue;
  const body = descriptor.scientific
    ? formatScientific(scaled, descriptor.decimals, descriptor.exponentDigits)
    : formatter(locale, descriptor.decimals, descriptor.grouped).format(scaled);
  return `${automaticMinus ? "-" : ""}${descriptor.prefix}${body}${descriptor.suffix}`;
}
