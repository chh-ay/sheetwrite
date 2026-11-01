import { colToA1 } from "@sheetwrite/core";

/**
 * Shared-formula expansion for the XLSX reader.
 *
 * A shared formula stores its text once, on its master cell; every other cell
 * of the group uses that text as if it were copied there. The engine owns the
 * copy rule (`translateFormula`, which paste and fill use), but the reader must
 * work before `initSheetwrite()`: Node conversions and `fromXlsxTable` read
 * workbooks without an engine. So this module repeats the engine's rule, and
 * `test/shared-formula-parity.test.ts` checks it against the engine over the
 * conformance corpus.
 *
 * The rule, as in `packages/wasm/src/formula_rewrite.rs`: tokens are lexed as
 * the engine lexes them, and only references change. A relative row or column
 * moves by the distance from the master; absolute parts stay. Whole columns
 * (`A:A`, `A1:A1048576`) keep their rows and whole rows keep their columns. A
 * reference that leaves the sheet, with its sheet name and spill suffix,
 * becomes `#REF!`. A name past the last column, such as `XYZ1`, is a name. The
 * text of an unchanged reference stays as written; a changed one is written
 * as the engine writes it. Text that does not lex stays unchanged.
 */

const SHEET_ROWS = 1_048_576;
const SHEET_COLS = 16_384;
const ERROR_LITERALS = [
  "#DIV/0!",
  "#NULL!",
  "#SPILL!",
  "#CALC!",
  "#VALUE!",
  "#REF!",
  "#NAME?",
  "#NUM!",
  "#N/A",
];
/** Rust's `u8::is_ascii_whitespace`, which does not include vertical tab. */
const ASCII_WHITESPACE = " \t\n\f\r";
const IDENT_START = /[$_\\\p{Alphabetic}]/u;
const IDENT_PART = /[$_.\\\p{Alphabetic}\p{N}]/u;
const WHITE_SPACE = /\p{White_Space}/u;

type TokenKind = "ident" | "number" | "colon" | "bang" | "hash" | "lparen" | "structured" | "other";

interface Token {
  readonly kind: TokenKind;
  /** The name of an identifier, without the quotes of a quoted sheet name. */
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface Corner {
  readonly row: number;
  readonly col: number;
  readonly rowAbs: boolean;
  readonly colAbs: boolean;
}

type AreaEnd =
  | { readonly kind: "cell"; readonly corner: Corner }
  | { readonly kind: "column"; readonly col: number; readonly absolute: boolean }
  | { readonly kind: "row"; readonly row: number; readonly absolute: boolean };

type Area =
  | { readonly kind: "cell"; readonly corner: Corner; readonly spill: boolean }
  | { readonly kind: "range"; readonly start: Corner; readonly end: Corner };

interface Reference {
  readonly area: Area;
  /** Where the reference starts, sheet name included. */
  readonly start: number;
  /** Where its coordinates start, after any sheet name. */
  readonly coordinatesStart: number;
  readonly end: number;
}

/** Expand a shared formula from its master cell to a cell `rowDelta` rows and `colDelta` columns away. */
export function translateSharedFormula(
  formula: string,
  rowDelta: number,
  colDelta: number,
): string {
  const tokens = lex(formula);
  if (!tokens) return formula;

  let output = "";
  let copied = 0;
  for (const reference of references(tokens)) {
    const moved = translateArea(reference.area, rowDelta, colDelta);
    if (moved && sameArea(moved, reference.area)) continue;

    const replacedFrom = moved ? reference.coordinatesStart : reference.start;
    output += formula.slice(copied, replacedFrom) + (moved ? writeArea(moved) : "#REF!");
    copied = reference.end;
  }
  return output + formula.slice(copied);
}

function lex(source: string): Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;
  const push = (kind: TokenKind, start: number, text = ""): void => {
    tokens.push({ kind, text, start, end: index });
  };

  while (index < source.length) {
    const start = index;
    const char = source[index]!;
    const error = char === "#" ? startsWithError(source, index) : undefined;
    if (ASCII_WHITESPACE.includes(char)) {
      // Whitespace is at most the intersection operator, which separates two
      // references exactly as the lack of a `:` does here.
      index += 1;
    } else if (char === '"') {
      const end = quotedEnd(source, index, '"');
      if (end === undefined) return undefined;
      index = end;
      push("other", start);
    } else if (isDigit(char) || (char === "." && isDigit(source[index + 1]))) {
      index = numberEnd(source, index);
      const value = Number(source.slice(start, index));
      if (!Number.isFinite(value)) return undefined;
      push("number", start, String(value));
    } else if (char === "'") {
      const end = quotedEnd(source, index, "'");
      if (end === undefined) return undefined;
      index = end;
      push("ident", start, source.slice(start + 1, end - 1).replaceAll("''", "'"));
    } else if (error) {
      index += error.length;
      push("other", start);
    } else if (char === "[") {
      const end = structuredEnd(source, index);
      if (end === undefined) return undefined;
      index = end;
      push("structured", start);
    } else if (IDENT_START.test(codePointAt(source, index))) {
      while (index < source.length && IDENT_PART.test(codePointAt(source, index))) {
        index += codePointAt(source, index).length;
      }
      push("ident", start, source.slice(start, index));
    } else if (char === "<" || char === ">" || char === "=") {
      const next = source[index + 1];
      index +=
        (char === "<" && (next === "=" || next === ">")) || (char === ">" && next === "=") ? 2 : 1;
      push("other", start);
    } else if ("+-*/^&%,;{})".includes(char)) {
      index += 1;
      push("other", start);
    } else if (char === "(" || char === ":" || char === "!" || char === "#") {
      index += 1;
      push(
        char === "(" ? "lparen" : char === ":" ? "colon" : char === "!" ? "bang" : "hash",
        start,
      );
    } else if (char.charCodeAt(0) > 0x7f && WHITE_SPACE.test(codePointAt(source, index))) {
      index += codePointAt(source, index).length;
    } else {
      return undefined;
    }
  }
  return tokens;
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9";
}

function codePointAt(source: string, index: number): string {
  return String.fromCodePoint(source.codePointAt(index)!);
}

function startsWithError(source: string, index: number): string | undefined {
  return ERROR_LITERALS.find(
    (literal) => source.slice(index, index + literal.length).toUpperCase() === literal,
  );
}

/** The end of the quoted text at `index`, where a doubled quote stands for one quote. */
function quotedEnd(source: string, index: number, quote: string): number | undefined {
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] !== quote) {
      cursor += 1;
    } else if (source[cursor + 1] === quote) {
      cursor += 2;
    } else {
      return cursor + 1;
    }
  }
  return undefined;
}

/** Digits with one optional decimal point, then an exponent only when it has digits. */
function numberEnd(source: string, index: number): number {
  let cursor = index;
  let sawDecimal = false;
  while (cursor < source.length) {
    if (source[cursor] === "." && !sawDecimal) sawDecimal = true;
    else if (!isDigit(source[cursor])) break;
    cursor += 1;
  }
  if (source[cursor] === "e" || source[cursor] === "E") {
    const signed = source[cursor + 1] === "+" || source[cursor + 1] === "-";
    let digits = cursor + 1 + (signed ? 1 : 0);
    if (isDigit(source[digits])) {
      while (isDigit(source[digits])) digits += 1;
      cursor = digits;
    }
  }
  return cursor;
}

/** The end of the `[...]` at `index`, nested brackets included. */
function structuredEnd(source: string, index: number): number | undefined {
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    if (source[cursor] === "[") depth += 1;
    else if (source[cursor] === "]") depth -= 1;
    if (depth === 0) return cursor + 1;
  }
  return undefined;
}

/**
 * The references in source order. A name before `(` is a function, before
 * `[` a table, and before `!` (or as `First:Last!`) the sheet of the
 * reference after it.
 */
function references(tokens: readonly Token[]): Reference[] {
  const found: Reference[] = [];
  let index = 0;
  while (index < tokens.length) {
    const kind = tokens[index]!.kind;
    const next = tokens[index + 1]?.kind;
    let coordinates: number;
    if (kind === "ident" && (next === "structured" || next === "lparen")) {
      index += 2;
      continue;
    } else if (kind === "ident" && next === "bang") {
      coordinates = index + 2;
    } else if (
      kind === "ident" &&
      next === "colon" &&
      tokens[index + 2]?.kind === "ident" &&
      tokens[index + 3]?.kind === "bang"
    ) {
      coordinates = index + 4;
    } else if (kind === "ident" || (kind === "number" && next === "colon")) {
      coordinates = index;
    } else {
      index += 1;
      continue;
    }

    const reference = referenceAt(tokens, coordinates);
    if (!reference) {
      index = Math.max(coordinates, index + 1);
      continue;
    }
    found.push({
      area: reference.area,
      start: tokens[index]!.start,
      coordinatesStart: tokens[coordinates]!.start,
      end: tokens[reference.next - 1]!.end,
    });
    index = reference.next;
  }
  return found;
}

/** The cell, spill or range reference at token `index`, and the index of the token after it. */
function referenceAt(
  tokens: readonly Token[],
  index: number,
): { readonly area: Area; readonly next: number } | undefined {
  const start = areaEnd(tokens[index]);
  if (!start) return undefined;

  if (tokens[index + 1]?.kind === "colon") {
    // `Sheet1!A1:Sheet1!B2` names its sheet again before the end.
    let endIndex = index + 2;
    if (tokens[endIndex]?.kind === "ident" && tokens[endIndex + 1]?.kind === "bang") endIndex += 2;
    const end = areaEnd(tokens[endIndex]);
    const range = end && areaBetween(start, end);
    return range && { area: range, next: endIndex + 1 };
  }
  if (start.kind !== "cell") return undefined;
  const spill = tokens[index + 1]?.kind === "hash";
  return { area: { kind: "cell", corner: start.corner, spill }, next: index + (spill ? 2 : 1) };
}

/** One end of an area: a cell (`B2`), a whole column (`$B`) or a whole row (`2`, `$2`). */
function areaEnd(token: Token | undefined): AreaEnd | undefined {
  if (token?.kind === "number") {
    const row = Number(token.text);
    return Number.isInteger(row) && row >= 1 && row <= SHEET_ROWS
      ? { kind: "row", row: row - 1, absolute: false }
      : undefined;
  }
  if (token?.kind !== "ident") return undefined;

  const cell = /^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/.exec(token.text);
  if (cell) {
    const col = columnIndex(cell[2]!);
    const row = Number(cell[4]);
    return col !== undefined && row >= 1 && row <= SHEET_ROWS
      ? {
          kind: "cell",
          corner: { row: row - 1, col, rowAbs: cell[3] === "$", colAbs: cell[1] === "$" },
        }
      : undefined;
  }
  const absolute = token.text.startsWith("$");
  const bare = absolute ? token.text.slice(1) : token.text;
  if (/^[A-Za-z]+$/.test(bare)) {
    const col = columnIndex(bare);
    return col === undefined ? undefined : { kind: "column", col, absolute };
  }
  if (/^[0-9]+$/.test(bare)) {
    const row = Number(bare);
    return row >= 1 && row <= SHEET_ROWS ? { kind: "row", row: row - 1, absolute } : undefined;
  }
  return undefined;
}

/** The 0-based column of a column label, or `undefined` past `XFD`. */
function columnIndex(label: string): number | undefined {
  let col = 0;
  for (const letter of label.toUpperCase()) {
    col = col * 26 + letter.charCodeAt(0) - 64;
    if (col > SHEET_COLS) return undefined;
  }
  return col - 1;
}

/** The range between two ends of one kind; `A:1` and `A1:B` have none. */
function areaBetween(start: AreaEnd, end: AreaEnd): Area | undefined {
  if (start.kind === "cell" && end.kind === "cell")
    return normalizedRange(start.corner, end.corner);
  if (start.kind === "column" && end.kind === "column") {
    return normalizedRange(
      { row: 0, col: start.col, rowAbs: true, colAbs: start.absolute },
      { row: SHEET_ROWS - 1, col: end.col, rowAbs: true, colAbs: end.absolute },
    );
  }
  if (start.kind === "row" && end.kind === "row") {
    return normalizedRange(
      { row: start.row, col: 0, rowAbs: start.absolute, colAbs: true },
      { row: end.row, col: SHEET_COLS - 1, rowAbs: end.absolute, colAbs: true },
    );
  }
  return undefined;
}

/**
 * Order the corners top-left to bottom-right, each coordinate keeping its own
 * `$`. The rows of a whole column and the columns of a whole row never move,
 * so they count as absolute.
 */
function normalizedRange(first: Corner, second: Corner): Area {
  const [top, bottom] = first.row <= second.row ? [first, second] : [second, first];
  const [left, right] = first.col <= second.col ? [first, second] : [second, first];
  const allRows = top.row === 0 && bottom.row === SHEET_ROWS - 1;
  const allCols = left.col === 0 && right.col === SHEET_COLS - 1;
  return {
    kind: "range",
    start: {
      row: top.row,
      col: left.col,
      rowAbs: allRows || top.rowAbs,
      colAbs: allCols || left.colAbs,
    },
    end: {
      row: bottom.row,
      col: right.col,
      rowAbs: allRows || bottom.rowAbs,
      colAbs: allCols || right.colAbs,
    },
  };
}

/** The area moved by the copy distance, or `undefined` once any part leaves the sheet. */
function translateArea(area: Area, rowDelta: number, colDelta: number): Area | undefined {
  const move = (corner: Corner): Corner | undefined => {
    const row = corner.rowAbs ? corner.row : corner.row + rowDelta;
    const col = corner.colAbs ? corner.col : corner.col + colDelta;
    return row >= 0 && row < SHEET_ROWS && col >= 0 && col < SHEET_COLS
      ? { ...corner, row, col }
      : undefined;
  };

  if (area.kind === "cell") {
    const corner = move(area.corner);
    return corner && { ...area, corner };
  }
  const start = move(area.start);
  const end = move(area.end);
  return start && end && { kind: "range", start, end };
}

function sameArea(left: Area, right: Area): boolean {
  const sameCorner = (a: Corner, b: Corner): boolean => a.row === b.row && a.col === b.col;
  if (left.kind === "cell" || right.kind === "cell") {
    return left.kind === "cell" && right.kind === "cell" && sameCorner(left.corner, right.corner);
  }
  return sameCorner(left.start, right.start) && sameCorner(left.end, right.end);
}

function writeCorner(corner: Corner): string {
  return `${corner.colAbs ? "$" : ""}${colToA1(corner.col)}${corner.rowAbs ? "$" : ""}${corner.row + 1}`;
}

/** Write an area as the engine does: whole rows as `2:3`, whole columns as `B:C`. */
function writeArea(area: Area): string {
  if (area.kind === "cell") return `${writeCorner(area.corner)}${area.spill ? "#" : ""}`;

  const { start, end } = area;
  const marker = (absolute: boolean): string => (absolute ? "$" : "");
  if (start.col === 0 && end.col === SHEET_COLS - 1) {
    return `${marker(start.rowAbs)}${start.row + 1}:${marker(end.rowAbs)}${end.row + 1}`;
  }
  if (start.row === 0 && end.row === SHEET_ROWS - 1) {
    return `${marker(start.colAbs)}${colToA1(start.col)}:${marker(end.colAbs)}${colToA1(end.col)}`;
  }
  return `${writeCorner(start)}:${writeCorner(end)}`;
}
