import { cellA1, shiftA1Refs } from "./a1.js";
import { parseCellEntry } from "./cell-input.js";
import { isCellFontFamily, isCellVerticalAlign, sanitizeCellStyle } from "./cell-style-fields.js";
import {
  type ClipboardCell,
  type ClipboardSnapshot,
  neutralizeInjection,
  parseTsv,
  rowsToTsv,
} from "./clipboard.js";
import {
  DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS,
  DelimitedTextResourceError,
} from "./delimited-text.js";
import {
  cloneCellHyperlink,
  createHyperlinkId,
  MAX_HYPERLINKS_PER_SHEET,
  sanitizeCellHyperlink,
} from "./hyperlink.js";
import {
  conditionalFormatPastePatches,
  copyConditionalFormats,
  copyNotes,
  notePastePatches,
  type PasteArea,
} from "./paste-rules.js";
import type { PasteSourceCells, TargetCell } from "./paste-special.js";
import { type Scope, ScopeSlot } from "./scope.js";
import type { CellRef, SelectionModel, SelRect } from "./selection.js";
import { referenceSheetName } from "./sheet-copy.js";
import type { CellHyperlink, CellScalar, CellStyle, CellValue } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type {
  CommitReason,
  DataValidationRule,
  DocumentOp,
  PackedCellBlock,
  Sheet,
} from "./types/document.js";
import type { ClipboardOutcome, PasteSpecialOptions } from "./types/grid.js";
import type { Store } from "./types/store.js";
import type { ApplyTransactionResult, ChangeEvent } from "./types/transaction.js";
import { utf8ByteLength } from "./utf8.js";
import {
  failingValidationRule,
  ValidationBudgetError,
  type ValidationReads,
} from "./validation-rule.js";
import { copiedValidation, validationPastePatches } from "./validation-transfer.js";

/** Paste Special's code, which loads on first use. */
type PasteSpecialModule = typeof import("./paste-special.js");

export interface ClipboardControllerDeps {
  /** The grid's scope; its close stops every clipboard action that is still running. */
  lifetime: Scope;
  store: Store;
  selection: () => SelectionModel;
  /**
   * The active cell on a row the view hides (`Grid.goToCell`), which Copy and
   * Cut take alone, as Excel does; null without one.
   */
  hiddenActive?: () => CellAddress | null;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  colIndices: () => number[];
  readOnly: () => boolean;
  mergeAnchorAt: (row: number, col: number) => SelRect | null;
  toDataRow: (viewRow: number) => number;
  /** The view row of a sheet row; `null` when a filter or the user hides it. */
  toViewRow: (dataRow: number) => number | null;
  /**
   * The data rows view rows `first` to `last` span with the rows hidden by
   * hand between them; null under a sort or a filter between them.
   */
  rowSpan: (first: number, last: number) => { first: number; last: number } | null;
  commit: (patches: DocumentOp[], reason: CommitReason) => ApplyTransactionResult;
  /** Undo the last local change, as Ctrl+Z does. */
  undo: () => void;
  /**
   * The newest entry of the undo history, compared by identity: the edit the
   * next {@link undo} reverts. `null` when there is none.
   */
  lastUndo: () => object | null;
  /** Called when a cut starts waiting for a paste (its cells, in data rows) and when it ends. */
  onCutChange: (range: Range | null) => void;
  /** Load Paste Special's code. */
  loadPasteSpecial: () => Promise<PasteSpecialModule>;
  /** Ask with the Paste Special dialog; `ownCopy` is false for another application's cells. */
  askPasteSpecial: (ownCopy: boolean) => Promise<PasteSpecialOptions | null>;
  /** A sheet's name, for Paste Link's references to another sheet. */
  sheetName: (sheet: SheetId) => string | undefined;
  /** Whether a paste keeps the target's validation rules (`GridConfig.paste.keepValidation`), read per paste. */
  keepValidation?: () => boolean;
  /**
   * Called after a paste that kept the target's rules, with the cells whose
   * values a `reject` rule refused (not pasted) and those a `warn` rule
   * refused (pasted), in data coordinates.
   */
  onValidationRefused?: (refused: readonly CellAddress[], warned: readonly CellAddress[]) => void;
  /** Formula results and list sources for the rules a kept paste checks. */
  validationReads?: () => ValidationReads | undefined;
  /**
   * Called when a cut, then its paste, moves `count` rows that a filter or
   * the user hides, which the selection did not show (`cut`, `paste`), and
   * when a pasted block writes into `count` hidden rows of its target, as
   * Excel's paste does (`write`). `rows` are the active sheet's data rows the
   * step covers: the cut's, after the paste also the rows it landed on, and
   * the rows a pasted block wrote.
   */
  onHiddenRowsMoved?: (
    count: number,
    step: "cut" | "paste" | "write",
    rows: readonly { readonly start: number; readonly end: number }[],
  ) => void;
  /**
   * Called with why a paste was refused, so the user reads that nothing was
   * pasted, and why: the grid refused its commit, or the clipboard holds more
   * than a paste may have. `reason` is a sentence that starts in lower case.
   */
  onPasteRefused?: (reason: string) => void;
}

/** What a single paste target cell should become, or `null` to skip it. */
interface CellWrite {
  value: CellValue;
  style?: CellStyle;
  /**
   * The source marks the cell as text, as Excel's Text format does, so it
   * pastes as text and not as a typed entry.
   */
  text?: true;
}

/**
 * The rows a pasted block takes: consecutive sheet rows (`sheet`), the
 * view's rows (`view`), or the rows neither a filter nor Hide Rows hides
 * (`shown`).
 */
type PasteRows = "sheet" | "view" | "shown";

/** A paste's commit, or `null` when there was nothing to commit. */
type PasteCommit = ApplyTransactionResult | null;

/** The top-left cell a paste lands on, and the size of the selection it may repeat to fill. */
interface PasteTarget extends CellRef {
  rows: number;
  cols: number;
}

interface CapturedClipboard extends ClipboardSnapshot {
  /**
   * The data rows a cut moves: every row from the first selected one to the
   * last, rows a filter or the user hides included, as in Excel. `null` when
   * a sorted view puts the selected rows out of data order.
   */
  source: Range | null;
}

/** A copied snapshot and the in-memory token that proves a paste came from it. */
interface TrustedClipboard {
  token: string;
  snapshot: ClipboardSnapshot;
}

/** A cut that waits for a paste: the cells it moves and the token of its clipboard payload. */
interface PendingCut {
  range: Range;
  token: string;
  /** How many of its rows the selection did not show. */
  hidden: number;
}

/**
 * What a paste read from the clipboard: the cut that waits, this grid's own
 * copy, another grid's copy, a table from another application, or text; or
 * how the read ended without one.
 */
type ClipboardPayload =
  | { kind: "cut"; cut: PendingCut }
  | { kind: "internal" | "foreign"; snapshot: ClipboardSnapshot }
  | { kind: "html"; grid: CellWrite[][] }
  | { kind: "text"; text: string }
  | { kind: "outcome"; outcome: ClipboardOutcome };

const EMPTY: ClipboardPayload = { kind: "outcome", outcome: "empty" };

/** Private-format MIME type used for rich Sheetwrite clipboard payloads. */
export const SHEETWRITE_CLIPBOARD_MIME = "application/x-sheetwrite+json";
const SHEETWRITE_WEB_CLIPBOARD_FORMAT = `web ${SHEETWRITE_CLIPBOARD_MIME}`;

/**
 * Pasted HTML and another grid's payload are held to the limits pasted text
 * is: the text's bytes before it is parsed, and its rows, columns and cells
 * while they are read.
 */
const PASTE_LIMITS = DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS;

/** Refuse pasted `text` larger than pasted text may be, before it is parsed. */
function checkPasteBytes(text: string): void {
  const bytes = utf8ByteLength(text, PASTE_LIMITS.maxInputBytes);
  if (bytes > PASTE_LIMITS.maxInputBytes) {
    throw new DelimitedTextResourceError(
      "maxInputBytes",
      PASTE_LIMITS.maxInputBytes,
      bytes,
      "parse",
    );
  }
}

/**
 * The cells read once row `rows` (counting from 1) adds its `columns` cells
 * to the `cells` before it. Refuses a row past the limits pasted text has.
 */
function countPasteRow(rows: number, columns: number, cells: number): number {
  if (rows > PASTE_LIMITS.maxRows) {
    throw new DelimitedTextResourceError("maxRows", PASTE_LIMITS.maxRows, rows, "parse");
  }
  if (columns > PASTE_LIMITS.maxColumns) {
    throw new DelimitedTextResourceError("maxColumns", PASTE_LIMITS.maxColumns, columns, "parse");
  }
  const total = cells + columns;
  if (total > PASTE_LIMITS.maxCells) {
    throw new DelimitedTextResourceError("maxCells", PASTE_LIMITS.maxCells, total, "parse");
  }
  return total;
}

/** `parse()`, or the limit it reached. */
function limited<T>(parse: () => T): T | DelimitedTextResourceError {
  try {
    return parse();
  } catch (error) {
    if (error instanceof DelimitedTextResourceError) return error;
    throw error;
  }
}

/**
 * Why a paste larger than a paste may be was refused, as the user reads it.
 * Text is measured only up to its limit, so its size is "more than" the limit.
 */
function tooLargeReason(error: DelimitedTextResourceError): string {
  const count = (value: number): string => value.toLocaleString("en-US");
  const megabytes = `${(error.limit / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
  switch (error.resource) {
    case "maxRows":
      return `this paste has ${count(error.actual)} rows, and a paste can have at most ${count(error.limit)}.`;
    case "maxColumns":
      return `this paste has ${count(error.actual)} columns, and a paste can have at most ${count(error.limit)}.`;
    case "maxCells":
      return `this paste has ${count(error.actual)} cells, and a paste can have at most ${count(error.limit)}.`;
    case "maxFieldBytes":
      return `a cell of this paste has more than ${megabytes} of text, the most a cell can have.`;
    default:
      return `this paste has more than ${megabytes} of text, the most a paste can have.`;
  }
}

/** Why the grid refused a paste's commit, as the user reads it. */
function commitRefusalReason(
  result: Exclude<ApplyTransactionResult, { status: "applied" }>,
): string {
  switch (result.status) {
    case "rejected": {
      const message = result.issues[0]?.message ?? "the change was refused";
      return message.endsWith(".") ? message : `${message}.`;
    }
    case "conflict":
      return "the sheet changed meanwhile. Paste again.";
    case "noop":
      switch (result.reason) {
        case "read-only":
          return "the sheet is read-only.";
        case "incomplete-data":
          return "the sheet is still loading. Paste again when it has loaded.";
        default:
          return "the paste does not fit on the sheet.";
      }
  }
}

/**
 * The token at the start of a payload `clipboardJson` wrote, which writes it
 * second, after the version.
 */
const PAYLOAD_TOKEN = /^\{"version":3,"token":"([^"\\]{16,256})"/u;
/** How much of a payload holds its token. */
const PAYLOAD_TOKEN_PREFIX = 300;

/**
 * The attribute on the HTML table of a copy or cut that holds its token.
 * Firefox and Safari keep only plain text and HTML on the clipboard, so a
 * grid finds its own copy or cut by this marker there.
 */
const CLIPBOARD_TOKEN_ATTRIBUTE = "data-sheetwrite-clipboard";
const CLIPBOARD_TOKEN_PATTERN = new RegExp(
  `\\b${CLIPBOARD_TOKEN_ATTRIBUTE}="([0-9a-f]{16,256})"`,
  "u",
);
/**
 * How much of the HTML holds the token: the table comes first, after the
 * wrapper a browser may add, so a large paste is not scanned.
 */
const CLIPBOARD_TOKEN_PREFIX = 1_024;

/** The token an HTML copy from a grid carries, or `null` for HTML from elsewhere. */
function clipboardToken(html: string): string | null {
  return CLIPBOARD_TOKEN_PATTERN.exec(html.slice(0, CLIPBOARD_TOKEN_PREFIX))?.[1] ?? null;
}

/** Whether two clipboard texts hold the same cells; browsers may change line endings. */
function sameClipboardText(left: string, right: string): boolean {
  const lines = (text: string) => text.replaceAll("\r\n", "\n").replace(/\n$/u, "");
  return lines(left) === lines(right);
}

/** The text of the first clipboard item that holds `type`, or `null` when none does. */
async function readClipboardType(
  items: readonly ClipboardItem[],
  type: string,
): Promise<string | null> {
  const item = items.find((candidate) => candidate.types.includes(type));
  return item ? (await item.getType(type)).text() : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** One style object per number format a paste gives, so a block's cells share it. */
const formatStyles = new Map<string, CellStyle>();

function formatStyle(numberFormat: string): CellStyle {
  let style = formatStyles.get(numberFormat);
  if (style === undefined) {
    style = { numberFormat };
    formatStyles.set(numberFormat, style);
  }
  return style;
}

/**
 * Text from elsewhere read as typed input for the target column: a formula
 * lands as inert text, and in a `general` column a number gets the format
 * Excel's General gives it (`12%` in `0%`).
 */
function parseExternalInput(source: string, type: Sheet["columns"][number]["type"]): CellWrite {
  const parsed = parseCellEntry(source, type);
  const { value, numberFormat } = parsed;
  if (value.kind === "formula") return { value: { kind: "literal", value: `'${value.src}` } };
  // A paste reads many cells; the parsed entry is the write when it has no format.
  return numberFormat === undefined ? parsed : { value, style: formatStyle(numberFormat) };
}

/**
 * The write of one cell pasted from another workbook or application. Its
 * formula, reference or text is re-read as typed input for the target column,
 * so an external formula lands as inert text; other values keep their kind.
 */
function externalCellWrite(cell: CellWrite, type: Sheet["columns"][number]["type"]): CellWrite {
  // Excel pastes a cell in its Text format as the text it holds.
  if (cell.text) return cell;
  const value = cell.value;
  let source: string;
  if (value.kind === "formula") source = value.src;
  else if (value.kind === "ref") {
    source = `=${value.target.sheet}!${cellA1(value.target.row, value.target.col)}`;
  } else if (typeof value.value === "string") {
    source = value.value;
  } else {
    return { value, style: cell.style };
  }

  const parsed = parseExternalInput(source, type);
  const style =
    parsed.style && cell.style?.numberFormat === undefined
      ? { ...cell.style, ...parsed.style }
      : cell.style;
  return { value: parsed.value, style };
}

function clipboardHtml(snapshot: ClipboardSnapshot, token: string): string {
  let html = `<table ${CLIPBOARD_TOKEN_ATTRIBUTE}="${token}"><tbody>`;
  for (const row of snapshot.cells) {
    html += "<tr>";
    for (const cell of row) {
      const style = cell.style;
      const css: string[] = [];
      if (style.bold) css.push("font-weight:bold");
      if (style.italic) css.push("font-style:italic");
      const decoration = [
        ...(style.underline ? ["underline"] : []),
        ...(style.strikethrough ? ["line-through"] : []),
      ];
      if (decoration.length > 0) css.push(`text-decoration:${decoration.join(" ")}`);

      const color = style.color ? safeCssColor(style.color) : undefined;
      const backgroundColor = style.backgroundColor
        ? safeCssColor(style.backgroundColor)
        : undefined;
      if (color) css.push(`color:${color}`);
      if (backgroundColor) css.push(`background-color:${backgroundColor}`);
      if (style.align) css.push(`text-align:${style.align}`);
      if (style.verticalAlign) css.push(`vertical-align:${style.verticalAlign}`);
      // The family is validated to need no escaping beyond its quotes.
      if (style.fontFamily) css.push(`font-family:"${style.fontFamily}"`);

      const styleAttr = css.length > 0 ? ` style="${escapeHtml(css.join(";"))}"` : "";
      const text =
        cell.resolved === null
          ? ""
          : typeof cell.resolved === "boolean"
            ? cell.resolved
              ? "TRUE"
              : "FALSE"
            : String(cell.resolved);
      html += `<td${styleAttr}>${escapeHtml(neutralizeInjection(text))}</td>`;
    }

    html += "</tr>";
  }

  return `${html}</tbody></table>`;
}

function clipboardJson(snapshot: ClipboardSnapshot, token: string): string {
  return JSON.stringify({
    version: 3,
    token,
    anchor: snapshot.anchor,
    cells: snapshot.cells,
    hyperlinks: snapshot.hyperlinks,
    tsv: snapshot.tsv,
    cut: snapshot.cut,
  });
}

/**
 * Another grid's payload, or null when it is not one.
 * @throws {@link DelimitedTextResourceError} when it is larger than pasted text may be.
 */
function parseClipboardJson(text: string): TrustedClipboard | null {
  checkPasteBytes(text);
  try {
    const value = JSON.parse(text) as {
      version?: unknown;
      token?: unknown;
      anchor?: { row?: unknown; col?: unknown };
      cells?: unknown;
      hyperlinks?: unknown;
      tsv?: unknown;
      cut?: unknown;
    };

    if (
      value.version !== 3 ||
      typeof value.token !== "string" ||
      value.token.length < 16 ||
      value.token.length > 256 ||
      !value.anchor ||
      !Number.isSafeInteger(value.anchor.row) ||
      !Number.isSafeInteger(value.anchor.col) ||
      !Array.isArray(value.cells) ||
      !Array.isArray(value.hyperlinks) ||
      value.hyperlinks.length > MAX_HYPERLINKS_PER_SHEET ||
      typeof value.tsv !== "string" ||
      typeof value.cut !== "boolean"
    ) {
      return null;
    }

    const cells: ClipboardCell[][] = [];
    let cellCount = 0;
    for (const inputRow of value.cells) {
      if (!Array.isArray(inputRow)) return null;
      cellCount = countPasteRow(cells.length + 1, inputRow.length, cellCount);
      const row: ClipboardCell[] = [];
      for (const inputCell of inputRow) {
        if (!inputCell || typeof inputCell !== "object") return null;
        const cell = inputCell as {
          value?: unknown;
          resolved?: unknown;
          style?: unknown;
        };

        const resolved = cell.resolved;
        if (
          !(
            resolved === null ||
            typeof resolved === "string" ||
            (typeof resolved === "number" && Number.isFinite(resolved)) ||
            typeof resolved === "boolean"
          )
        ) {
          return null;
        }

        const cellValue = parseClipboardValue(cell.value);
        if (!cellValue) return null;
        row.push({
          value: cellValue,
          resolved,
          style: sanitizeCellStyle(cell.style) ?? {},
        });
      }

      cells.push(row);
    }

    const hyperlinks: CellHyperlink[] = [];
    for (const input of value.hyperlinks) {
      const hyperlink = sanitizeCellHyperlink(input);
      if (!hyperlink) return null;
      hyperlinks.push(hyperlink);
    }

    return {
      token: value.token,
      snapshot: {
        anchor: { row: value.anchor.row as number, col: value.anchor.col as number },
        cells,
        hyperlinks,
        tsv: value.tsv,
        cut: value.cut,
      },
    };
  } catch (error) {
    if (error instanceof DelimitedTextResourceError) throw error;
    return null;
  }
}

function parseClipboardValue(value: unknown): CellValue | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    kind?: unknown;
    value?: unknown;
    src?: unknown;
    target?: { sheet?: unknown; row?: unknown; col?: unknown };
  };

  if (candidate.kind === "literal") {
    const literal = candidate.value;
    return literal === null ||
      typeof literal === "string" ||
      (typeof literal === "number" && Number.isFinite(literal)) ||
      typeof literal === "boolean"
      ? { kind: "literal", value: literal }
      : null;
  }

  if (candidate.kind === "formula") {
    return typeof candidate.src === "string" && candidate.src.startsWith("=")
      ? { kind: "formula", src: candidate.src }
      : null;
  }

  if (candidate.kind === "ref") {
    const target = candidate.target;
    return target &&
      typeof target.sheet === "string" &&
      target.sheet.length > 0 &&
      Number.isSafeInteger(target.row) &&
      Number.isSafeInteger(target.col)
      ? {
          kind: "ref",
          target: { sheet: target.sheet, row: target.row as number, col: target.col as number },
        }
      : null;
  }

  return null;
}

function createClipboardToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let token = "";
  for (const byte of bytes) token += byte.toString(16).padStart(2, "0");
  return token;
}

function externalFormulaSource(source: string | null): string | null {
  if (!source?.startsWith("=")) return null;
  for (const char of source) {
    if (char.charCodeAt(0) <= 0x1f) return null;
  }
  return source;
}

function spreadsheetFormula(cell: Element): string | null {
  const direct =
    cell.getAttribute("data-sheetwrite-formula") ??
    cell.getAttribute("data-formula") ??
    cell.getAttribute("x:fmla");
  const safeDirect = externalFormulaSource(direct);
  if (safeDirect) return safeDirect;
  const sheets = cell.getAttribute("data-sheets-formula");
  if (!sheets) return null;
  try {
    const parsed = JSON.parse(sheets) as unknown;
    const source =
      typeof parsed === "string"
        ? parsed
        : parsed && typeof parsed === "object"
          ? Object.values(parsed as Record<string, unknown>).find(
              (value): value is string => typeof value === "string" && value.startsWith("="),
            )
          : null;
    return externalFormulaSource(source ?? null);
  } catch {
    return null;
  }
}

function safeCssColor(value: string): string | undefined {
  const color = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(color);
  if (!rgb) return undefined;
  const channels = rgb.slice(1, 4).map((channel) => Math.min(255, Number(channel)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** The first family of a CSS `font-family` list, when it is a safe cell font family. */
function htmlFontFamily(value: string): string | undefined {
  const first = value
    .split(",")[0]
    ?.trim()
    .replace(/^(["'])(.*)\1$/u, "$2");
  return first !== undefined && isCellFontFamily(first) ? first : undefined;
}

function styleFromHtml(cell: HTMLElement): CellStyle | undefined {
  const decoration = cell.style.textDecoration.toLowerCase();
  const align = cell.style.textAlign;
  const fontFamily = htmlFontFamily(cell.style.fontFamily);
  const style: CellStyle = {
    ...(cell.style.fontWeight === "bold" || Number(cell.style.fontWeight) >= 600
      ? { bold: true }
      : {}),
    ...(cell.style.fontStyle === "italic" ? { italic: true } : {}),
    ...(decoration.includes("underline") ? { underline: true } : {}),
    ...(decoration.includes("line-through") ? { strikethrough: true } : {}),
    ...(safeCssColor(cell.style.color) ? { color: safeCssColor(cell.style.color) } : {}),
    ...(safeCssColor(cell.style.backgroundColor)
      ? { backgroundColor: safeCssColor(cell.style.backgroundColor) }
      : {}),
    ...(align === "left" || align === "center" || align === "right" ? { align } : {}),
    ...(isCellVerticalAlign(cell.style.verticalAlign)
      ? { verticalAlign: cell.style.verticalAlign }
      : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(cell.style.whiteSpace.includes("pre-wrap") ? { wrap: true } : {}),
  };
  return Object.keys(style).length > 0 ? style : undefined;
}

/**
 * Excel's Text format, `@`, as Excel writes it in the HTML it copies:
 * `mso-number-format:"\@"` in a class of the page's style sheet or in the
 * cell's own style.
 */
const MSO_TEXT_FORMAT = /mso-number-format\s*:\s*(["']?)\\?@\1\s*(?:;|$)/i;

/** The classes the pasted page's style sheets give Excel's Text format. */
function textFormatClasses(document: Document): Set<string> | null {
  let classes: Set<string> | null = null;
  for (const sheet of document.querySelectorAll("style")) {
    for (const rule of (sheet.textContent ?? "").matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (!MSO_TEXT_FORMAT.test(rule[2] ?? "")) continue;
      for (const name of (rule[1] ?? "").matchAll(/\.([\w-]+)/g)) {
        (classes ??= new Set()).add(name[1] ?? "");
      }
    }
  }
  return classes;
}

/**
 * Whether Excel's HTML marks `cell` as text: its Text format, by class or
 * style, or `x:str`, which Excel writes on a cell whose value is a string.
 */
function excelTextCell(cell: Element, classes: Set<string> | null): boolean {
  if (cell.hasAttribute("x:str")) return true;
  if (MSO_TEXT_FORMAT.test(cell.getAttribute("style") ?? "")) return true;
  if (classes !== null) {
    for (const name of cell.classList) if (classes.has(name)) return true;
  }
  return false;
}

/**
 * The table in pasted HTML, or null when it holds none.
 * @throws {@link DelimitedTextResourceError} when it is larger than pasted text may be.
 */
function parseClipboardHtml(html: string, valuesOnly: boolean): CellWrite[][] | null {
  if (typeof DOMParser === "undefined") return null;
  checkPasteBytes(html);
  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table");
  if (!table) return null;
  const textClasses = textFormatClasses(document);
  const grid: CellWrite[][] = [];
  let cellCount = 0;
  for (const row of table.querySelectorAll(
    ":scope > thead > tr, :scope > tbody > tr, :scope > tr",
  )) {
    const cells = row.querySelectorAll(":scope > th, :scope > td");
    if (cells.length === 0) continue;
    cellCount = countPasteRow(grid.length + 1, cells.length, cellCount);
    const values: CellWrite[] = [];
    for (const cell of cells) {
      const formula = valuesOnly ? null : spreadsheetFormula(cell);
      const style = valuesOnly || !(cell instanceof HTMLElement) ? undefined : styleFromHtml(cell);
      const value: CellValue = formula
        ? { kind: "formula", src: formula }
        : { kind: "literal", value: cell.textContent ?? "" };
      // As Excel's paste does, a text cell keeps its text, and its Text format
      // unless only values are pasted.
      values.push(
        !formula && excelTextCell(cell, textClasses)
          ? { value, style: valuesOnly ? style : { ...style, numberFormat: "@" }, text: true }
          : { value, style },
      );
    }
    grid.push(values);
  }
  return grid.length > 0 ? grid : null;
}

/** Re-anchor a copied value's relative A1 refs by (dRow, dCol); literals pass through. */
function shiftValue(value: CellValue, dRow: number, dCol: number): CellValue {
  if (value.kind === "formula") {
    return { kind: "formula", src: shiftA1Refs(value.src, dRow, dCol) };
  }
  return value;
}

/** Whether `patch` moves or removes cells of `sheet`, so a cut there no longer names its cells. */
function movesCellsOf(patch: DocumentOp, sheet: SheetId): boolean {
  switch (patch.op) {
    case "addRows":
    case "removeRows":
    case "moveRows":
    case "addColumns":
    case "removeColumns":
    case "moveColumns":
    case "removeSheet":
      return patch.sheet === sheet;
    case "moveCells":
      return patch.range.sheet === sheet || patch.to.sheet === sheet;
    default:
      return false;
  }
}

/**
 * One sparse `setRange` that writes `cells` (sheet rows and columns) over
 * their bounding range and leaves the range's other cells as they are, as one
 * `set` per cell would, in one operation; nothing for no cells.
 */
function sparseCellsPatch(
  sheet: SheetId,
  cells: readonly { readonly row: number; readonly col: number; readonly write: CellWrite }[],
): DocumentOp[] {
  if (cells.length === 0) return [];
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const { row, col } of cells) {
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
    left = Math.min(left, col);
    right = Math.max(right, col);
  }
  const range = { sheet, start: { row: top, col: left }, end: { row: bottom, col: right } };
  const snapshot = cells.map(({ row, col, write }) => ({
    rowOffset: row - top,
    colOffset: col - left,
    value: write.value,
    ...(write.style === undefined ? {} : { style: write.style }),
  }));
  return [{ op: "setRange", range, cells: snapshot }];
}

/**
 * Translates between the current selection and clipboard payloads. Formula/ref
 * fidelity is restored only when a versioned private envelope carries the
 * controller's current in-memory token. Every other clipboard source is inert.
 *
 * As in Excel, a cut changes nothing: it marks its cells, and the next paste
 * moves them with one `moveCells` operation. Esc, an edit, another copy or cut,
 * or a change that moves the cells' sheet ends the cut.
 */
export class ClipboardController {
  private readonly deps: ClipboardControllerDeps;

  /** Last rich copy/cut and its unguessable in-memory provenance token. */
  private trusted: TrustedClipboard | null = null;

  /** The cut that waits for a paste. */
  private pendingCut: PendingCut | null = null;

  /**
   * The token of the last cut that was pasted or ended. As in Excel, its
   * clipboard payload no longer pastes.
   */
  private endedCutToken: string | null = null;

  /** True while the paste of a cut commits its move. */
  private movingCut = false;

  /** The paste that runs now, so a write into hidden rows can offer it again. */
  private runningPaste: (() => PasteCommit) | null = null;

  /**
   * The last change, when it is a paste that wrote into hidden rows: Paste
   * into visible rows only pastes it again on the shown rows. Any other
   * change ends the offer.
   */
  private hiddenRowsPaste: {
    readonly sheet: SheetId;
    readonly paste: () => PasteCommit;
    /** The paste's undo entry, so only that paste is ever undone. */
    readonly undoEntry: object | null;
  } | null = null;

  /**
   * True while Paste into visible rows only undoes the last paste and pastes
   * it again: the block then takes the shown rows.
   */
  private pastingShownRows = false;

  /**
   * The running copy or cut, and the running paste. A newer action of the
   * same kind closes the older one: the older one then resolves `"empty"`
   * without changing the grid, so a late write cannot replace the newer
   * provenance token and a late read cannot paste over the newer paste.
   */
  private readonly writes: ScopeSlot;
  private readonly reads: ScopeSlot;

  constructor(deps: ClipboardControllerDeps) {
    this.deps = deps;
    this.writes = new ScopeSlot(deps.lifetime);
    this.reads = new ScopeSlot(deps.lifetime);
  }

  /** A new document must not accept a pending paste or retain the old rich copy. */
  cancel(): void {
    this.writes.close();
    this.reads.close();
    this.trusted = null;
    this.endCut();
  }

  /** End the cut that waits for a paste, as Esc does in Excel. Returns whether there was one. */
  cancelCut(): boolean {
    if (!this.pendingCut) return false;
    this.endCut();
    return true;
  }

  /**
   * Follow a committed change: the move of the pending cut ends it, and so
   * does any other local edit, or a change that moves or removes cells of
   * its sheet.
   */
  storeChanged(event: ChangeEvent): void {
    if (!this.pastingShownRows) this.hiddenRowsPaste = null;
    const cut = this.pendingCut;
    if (!cut) return;
    const patches = event.transaction.patches;
    if (this.movingCut) {
      if (patches.some((patch) => patch.op === "moveCells")) this.endCut();
      return;
    }
    if (event.source === "local" || patches.some((patch) => movesCellsOf(patch, cut.range.sheet))) {
      this.endCut();
    }
  }

  private endCut(): void {
    const cut = this.pendingCut;
    if (!cut) return;
    this.pendingCut = null;
    this.endedCutToken = cut.token;
    this.deps.onCutChange(null);
  }

  async copy(): Promise<ClipboardOutcome> {
    const snapshot = this.capture(false);
    if (!snapshot) return "empty";
    this.endCut();
    const write = this.writes.next();
    try {
      const token = createClipboardToken();
      const outcome = await this.writeCaptured(snapshot, token);
      if (write.closed) return "empty";
      if (outcome === "done") this.trusted = { snapshot, token };
      return outcome;
    } finally {
      write.close();
    }
  }

  async cut(): Promise<ClipboardOutcome> {
    const snapshot = this.capture(true);
    if (!snapshot?.source) return "empty";
    const source = snapshot.source;
    const write = this.writes.next();
    try {
      const token = createClipboardToken();
      const outcome = await this.writeCaptured(snapshot, token);
      if (write.closed) return "empty";
      if (outcome !== "done") return outcome;
      this.trusted = { snapshot, token };
      this.endCut();
      // A read-only grid copies: nothing can move.
      if (this.deps.readOnly()) return "done";
      // The rows the move takes that the view does not show.
      let hidden = 0;
      for (let row = source.start.row; row <= source.end.row; row++) {
        if (this.deps.toViewRow(row) === null) hidden++;
      }
      this.pendingCut = { range: source, token, hidden };
      this.deps.onCutChange(source);
      if (hidden > 0) {
        const rows = { start: source.start.row, end: source.end.row };
        this.deps.onHiddenRowsMoved?.(hidden, "cut", [rows]);
      }
      return "done";
    } finally {
      write.close();
    }
  }

  private async writeCaptured(
    snapshot: ClipboardSnapshot,
    token: string,
  ): Promise<ClipboardOutcome> {
    if (typeof navigator === "undefined" || !navigator.clipboard) return "unsupported";
    const clipboard = navigator.clipboard;
    if (typeof clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
      const plain = new Blob([snapshot.tsv], { type: "text/plain" });
      const html = new Blob([clipboardHtml(snapshot, token)], { type: "text/html" });
      try {
        await clipboard.write([
          new ClipboardItem({
            "text/plain": plain,
            "text/html": html,
            [SHEETWRITE_WEB_CLIPBOARD_FORMAT]: new Blob([clipboardJson(snapshot, token)], {
              type: SHEETWRITE_CLIPBOARD_MIME,
            }),
          }),
        ]);
        return "done";
      } catch {
        try {
          await clipboard.write([new ClipboardItem({ "text/plain": plain, "text/html": html })]);
          return "done";
        } catch {
          // Retain the universally available text-only fallback.
        }
      }
    }

    if (typeof clipboard.writeText !== "function") return "unsupported";
    try {
      await clipboard.writeText(snapshot.tsv);
      return "done";
    } catch {
      return "blocked";
    }
  }

  /**
   * Paste at the focus cell. Only the current controller's token restores rich
   * formulas/refs; custom, HTML, and plain external inputs are inert.
   */
  paste(): Promise<ClipboardOutcome> {
    return this.refusingTooLarge(this.pasteFrom(false));
  }

  /**
   * Like {@link paste} but writes only resolved literals — never formulas or
   * styles. For external text this is identical to {@link paste}.
   */
  pasteValues(): Promise<ClipboardOutcome> {
    return this.refusingTooLarge(this.pasteFrom(true));
  }

  /**
   * Excel's Paste Special. Its code loads while the clipboard is read. With
   * `ask`, the dialog opens at once, as Excel's does, and the clipboard is read
   * after OK, within the click that browsers ask of a clipboard read. As in
   * Excel, it is not available while a cut waits for its paste.
   */
  pasteSpecial(options: PasteSpecialOptions = {}): Promise<ClipboardOutcome> {
    return this.refusingTooLarge(this.pasteSpecialFrom(options));
  }

  /**
   * `paste`'s outcome. A clipboard that holds more than a paste may have is
   * refused while it is read, before anything is written: the grid says how
   * large it is, and the paste ends `rejected`.
   */
  private async refusingTooLarge(paste: Promise<ClipboardOutcome>): Promise<ClipboardOutcome> {
    try {
      return await paste;
    } catch (error) {
      if (!(error instanceof DelimitedTextResourceError)) throw error;
      this.deps.onPasteRefused?.(tooLargeReason(error));
      return "rejected";
    }
  }

  private async pasteSpecialFrom(options: PasteSpecialOptions): Promise<ClipboardOutcome> {
    if (this.deps.readOnly() || this.pendingCut || !this.pasteTarget()) return "empty";
    if (typeof navigator === "undefined" || !navigator.clipboard) return "unsupported";
    let chosen: PasteSpecialOptions | null = options;
    if (options.ask) {
      // The last copy from this grid is the likely payload; another's has no notes or rules.
      chosen = await this.deps.askPasteSpecial(this.trusted !== null);
      if (chosen === null) return "empty";
    }
    const read = this.reads.next();
    try {
      const [payload, special] = await Promise.all([
        this.readPayload(read, navigator.clipboard, false),
        this.deps.loadPasteSpecial(),
      ]);
      if (payload.kind === "outcome") return payload.outcome;
      const target = this.pasteTarget();
      if (payload.kind === "cut" || !target || this.deps.readOnly()) return "empty";
      return this.runPaste(() => this.applyPasteSpecial(special, payload, target, chosen));
    } finally {
      read.close();
    }
  }

  private async pasteFrom(valuesOnly: boolean): Promise<ClipboardOutcome> {
    if (this.deps.readOnly()) return "empty";
    const target = this.pasteTarget();
    if (!target) return "empty";
    if (typeof navigator === "undefined" || !navigator.clipboard) return "unsupported";
    const read = this.reads.next();
    try {
      return await this.readAndPaste(read, navigator.clipboard, target, valuesOnly);
    } finally {
      read.close();
    }
  }

  /**
   * Where a paste lands: the top-left cell of the selected rectangle that
   * holds the active cell, and that rectangle's size, which a smaller copy
   * repeats to fill as in Excel.
   */
  private pasteTarget(): PasteTarget | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) return null;
    let target: PasteTarget = { ...focus, rows: 1, cols: 1 };
    this.deps.selection().forEachRect((rect) => {
      if (
        rect.r0 <= focus.row &&
        focus.row <= rect.r1 &&
        rect.c0 <= focus.col &&
        focus.col <= rect.c1
      ) {
        target = {
          row: rect.r0,
          col: rect.c0,
          rows: rect.r1 - rect.r0 + 1,
          cols: rect.c1 - rect.c0 + 1,
        };
      }
    });
    return target;
  }

  /** Paste what the clipboard holds. */
  private async readAndPaste(
    read: Scope,
    clipboard: Clipboard,
    focus: PasteTarget,
    valuesOnly: boolean,
  ): Promise<ClipboardOutcome> {
    const payload = await this.readPayload(read, clipboard, valuesOnly);
    switch (payload.kind) {
      case "outcome":
        return payload.outcome;
      case "cut":
        return this.pasteCut(payload.cut, focus, valuesOnly);
      case "internal":
        return this.runPaste(() => this.pasteInternal(payload.snapshot, focus, valuesOnly));
      case "foreign":
        return this.runPaste(() => this.pasteExternalSnapshot(payload.snapshot, focus, valuesOnly));
      case "html":
        return this.runPaste(() => this.pasteExternalHtml(payload.grid, focus));
      case "text":
        return this.runPaste(() => this.pasteExternal(payload.text, focus));
    }
  }

  /**
   * Run `paste`, which a write into hidden rows can then offer again on the
   * shown rows, and tell how it ended.
   */
  private runPaste(paste: () => PasteCommit): ClipboardOutcome {
    this.runningPaste = paste;
    try {
      return this.pasteOutcome(paste());
    } finally {
      this.runningPaste = null;
    }
  }

  /**
   * How a paste's commit ended: `done` when it applied, `empty` when there
   * was nothing to write. A commit the grid refused (a host's protection or
   * admission, a document limit, a read-only or loading sheet) changed
   * nothing: the grid says so, and the paste ends `rejected`.
   */
  private pasteOutcome(result: PasteCommit): ClipboardOutcome {
    if (result === null) return "empty";
    if (result.status === "applied") return "done";
    if (result.status === "noop" && result.reason === "empty") return "empty";
    this.deps.onPasteRefused?.(commitRefusalReason(result));
    return "rejected";
  }

  /**
   * Whether the last change is a paste on the active sheet that wrote into
   * rows a filter or Hide Rows hides, which {@link pasteShownRows} can paste
   * again on the shown rows only.
   */
  get canPasteShownRows(): boolean {
    return this.hiddenRowsPaste?.sheet === this.deps.activeSheet() && !this.deps.readOnly();
  }

  /**
   * Paste into visible rows only: undo the last paste, which wrote into
   * hidden rows as Excel's paste does, and paste the same cells again on the
   * rows the filter and Hide Rows show, skipping the hidden ones. The result
   * is one undo step; a refused paste is said, as any paste's is. Returns
   * false when the last change is not such a paste.
   */
  pasteShownRows(): boolean {
    const last = this.hiddenRowsPaste;
    if (!last || !this.canPasteShownRows) return false;
    this.hiddenRowsPaste = null;
    // Undo only that paste: never an edit the offer did not see.
    if (last.undoEntry === null || this.deps.lastUndo() !== last.undoEntry) return false;
    this.pastingShownRows = true;
    try {
      this.deps.undo();
      this.pasteOutcome(last.paste());
    } finally {
      this.pastingShownRows = false;
    }
    return true;
  }

  /**
   * Read what the clipboard holds. Every read awaits; a read whose scope
   * closed meanwhile gives nothing. This grid's own copy or cut is found by
   * its token: in the custom format where the browser keeps one (Chromium),
   * else in the HTML. A payload other than the waiting cut ends the cut, so a
   * copy in another application since the cut is a plain paste, as in Excel.
   */
  private async readPayload(
    read: Scope,
    clipboard: Clipboard,
    valuesOnly: boolean,
  ): Promise<ClipboardPayload> {
    let richReadFailed = false;
    // A rich format past the pasted-text limits gives way to the next one,
    // as Excel's large HTML gives way to its text; with none left, the paste
    // is refused as too large a text is.
    let tooLarge: DelimitedTextResourceError | undefined;

    if (typeof clipboard.read === "function") {
      try {
        const items = await clipboard.read();
        if (read.closed) return EMPTY;
        for (const item of items) {
          const customType = item.types.includes(SHEETWRITE_WEB_CLIPBOARD_FORMAT)
            ? SHEETWRITE_WEB_CLIPBOARD_FORMAT
            : item.types.includes(SHEETWRITE_CLIPBOARD_MIME)
              ? SHEETWRITE_CLIPBOARD_MIME
              : null;
          if (!customType) continue;
          const json = await (await item.getType(customType)).text();
          if (read.closed) return EMPTY;
          // This grid's own copy is known by its token, whatever its size: its
          // cells are in memory, so the rest of the payload is not read.
          const leading = PAYLOAD_TOKEN.exec(json.slice(0, PAYLOAD_TOKEN_PREFIX))?.[1];
          const own =
            leading !== undefined &&
            (leading === this.pendingCut?.token ||
              leading === this.endedCutToken ||
              leading === this.trusted?.token);
          const envelope = own ? null : limited(() => parseClipboardJson(json));
          if (envelope instanceof DelimitedTextResourceError) {
            tooLarge ??= envelope;
            continue;
          }
          const token = own ? leading : envelope?.token;
          if (token === undefined) continue;
          const mine = this.ownPayload(token, null);
          if (mine) return mine;
          this.endCut();
          if (envelope) return { kind: "foreign", snapshot: envelope.snapshot };
        }

        const html = await readClipboardType(items, "text/html");
        const text = await readClipboardType(items, "text/plain");
        if (read.closed) return EMPTY;
        // This grid's own copy, by the token on its HTML: its cells are in
        // memory, so the HTML is not parsed.
        const token = html === null ? null : clipboardToken(html);
        const mine = token === null ? null : this.ownPayload(token, text);
        if (mine) return mine;

        // The clipboard no longer holds the cut: this is a plain paste.
        this.endCut();
        if (html !== null) {
          const grid = limited(() => parseClipboardHtml(html, valuesOnly));
          if (grid instanceof DelimitedTextResourceError) tooLarge ??= grid;
          else if (grid) return { kind: "html", grid };
        }
        if (text !== null && text.length > 0) return { kind: "text", text };
        if (tooLarge) throw tooLarge;
        if (text !== null) return EMPTY;
      } catch (error) {
        if (error instanceof DelimitedTextResourceError) throw error;
        richReadFailed = true;
      }
    }

    if (typeof clipboard.readText !== "function") {
      return { kind: "outcome", outcome: richReadFailed ? "blocked" : "unsupported" };
    }

    try {
      const text = await clipboard.readText();
      if (read.closed || text.length === 0) return EMPTY;
      this.endCut();
      return { kind: "text", text };
    } catch {
      return { kind: "outcome", outcome: "blocked" };
    }
  }

  /**
   * The payload of this grid's own copy or cut with `token`, or `null` when
   * the token is another's. A cut that was pasted or ended does not paste
   * again, as in Excel. `text` is the clipboard's plain text, when it has
   * one: text that differs from the copy's was changed in another
   * application, so the paste is a plain one.
   */
  private ownPayload(token: string, text: string | null): ClipboardPayload | null {
    if (this.endedCutToken === token) return EMPTY;
    const trusted = this.trusted;
    if (trusted?.token !== token) return null;
    if (text !== null && !sameClipboardText(text, trusted.snapshot.tsv)) return null;
    if (this.pendingCut?.token === token) return { kind: "cut", cut: this.pendingCut };
    this.endCut();
    return { kind: "internal", snapshot: trusted.snapshot };
  }

  /**
   * Move the pending cut so that its top-left cell lands on the paste target's,
   * as Excel's Cut and Paste does: on the sheet rows from the target's down,
   * rows a filter hides included. Paste Values is not available after a cut,
   * and a target that a sorted view splits takes no move; the cut stays.
   */
  private pasteCut(cut: PendingCut, target: PasteTarget, valuesOnly: boolean): ClipboardOutcome {
    const rows = cut.range.end.row - cut.range.start.row + 1;
    const cols = cut.range.end.col - cut.range.start.col + 1;
    const firstRow = this.deps.toDataRow(target.row);
    const sheet = this.deps.sheet();
    const sorted = (sheet.sortKeys?.length ?? 0) > 0;
    const fits =
      !valuesOnly &&
      firstRow + rows <= sheet.rowCount &&
      target.col + cols <= sheet.columns.length &&
      (!sorted ||
        Array.from({ length: rows }, (_, row) => row).every(
          (row) => this.deps.toDataRow(target.row + row) === firstRow + row,
        ));
    if (!fits) return "empty";

    this.movingCut = true;
    let result: ApplyTransactionResult;
    try {
      result = this.deps.commit(
        [
          {
            op: "moveCells",
            range: cut.range,
            to: { sheet: this.deps.activeSheet(), row: firstRow, col: target.col },
          },
        ],
        "paste",
      );
    } finally {
      this.movingCut = false;
    }
    const outcome = this.pasteOutcome(result);
    if (outcome !== "done") return outcome;
    if (cut.hidden > 0) {
      const landed = { start: firstRow, end: firstRow + rows - 1 };
      const cutRows = { start: cut.range.start.row, end: cut.range.end.row };
      this.deps.onHiddenRowsMoved?.(
        cut.hidden,
        "paste",
        cut.range.sheet === this.deps.activeSheet() ? [cutRows, landed] : [landed],
      );
    }
    return "done";
  }

  private pasteInternal(
    snapshot: ClipboardSnapshot,
    focus: PasteTarget,
    valuesOnly: boolean,
  ): PasteCommit {
    // Copy shifts every relative formula ref by the block's rigid displacement.
    const targetAnchorRow = this.deps.toDataRow(focus.row);
    const deltaRow = targetAnchorRow - snapshot.anchor.row;
    const deltaCol = focus.col - snapshot.anchor.col;
    const width = snapshot.cells[0]?.length ?? 0;
    // The pasted cells take the copied notes, conditional formats and validation
    // rules too, as in Excel; `paste.keepValidation` keeps the target's rules.
    const area = valuesOnly ? null : this.pasteArea(focus, snapshot.cells.length, width);
    const extras: DocumentOp[] = valuesOnly
      ? []
      : [
          ...this.hyperlinkPatches(snapshot, deltaRow, deltaCol, false),
          ...this.rulePatches(snapshot, area, {
            notes: true,
            conditionalFormats: "replace",
            validation: this.deps.keepValidation?.() !== true,
          }),
        ];

    return this.commitBlock(
      focus,
      snapshot.cells.length,
      (r) => snapshot.cells[r]?.length ?? 0,
      (r, c, _targetCol, repeat): CellWrite | null => {
        const cell = snapshot.cells[r]?.[c];
        if (cell === undefined) return null;
        if (valuesOnly) return { value: { kind: "literal", value: cell.resolved } };
        // Each repeated copy of a copied block shifts by its own offset, as in Excel.
        return {
          value: shiftValue(cell.value, deltaRow + repeat.row, deltaCol + repeat.col),
          style: cell.style,
        };
      },
      extras,
    );
  }

  /**
   * The copied hyperlinks at the paste: their source ranges move to it (turned
   * when the paste transposes), while internal targets stay as they are.
   */
  private hyperlinkPatches(
    snapshot: ClipboardSnapshot,
    deltaRow: number,
    deltaCol: number,
    transpose: boolean,
  ): DocumentOp[] {
    const sheet = this.deps.activeSheet();
    const { anchor } = snapshot;
    const moved = (cell: CellRef): CellRef =>
      transpose
        ? {
            row: anchor.row + deltaRow + (cell.col - anchor.col),
            col: anchor.col + deltaCol + (cell.row - anchor.row),
          }
        : { row: cell.row + deltaRow, col: cell.col + deltaCol };
    return snapshot.hyperlinks.map((source) => ({
      op: "setHyperlink" as const,
      sheet,
      hyperlink: {
        ...cloneCellHyperlink(source),
        id: createHyperlinkId(),
        range: { sheet, start: moved(source.range.start), end: moved(source.range.end) },
      },
    }));
  }

  /** The copied notes, conditional formats and validation rules at `area`; none without an area. */
  private rulePatches(
    snapshot: ClipboardSnapshot,
    area: PasteArea | null,
    parts: {
      readonly notes: boolean;
      readonly conditionalFormats: "replace" | "merge" | null;
      readonly validation: boolean;
    },
  ): DocumentOp[] {
    if (area === null) return [];
    const sheet = this.deps.sheet();
    const block = { rows: snapshot.cells.length, cols: snapshot.cells[0]?.length ?? 0 };
    return [
      ...(parts.notes ? notePastePatches(sheet, snapshot.notes ?? [], block, area) : []),
      ...(parts.conditionalFormats
        ? conditionalFormatPastePatches(
            sheet,
            snapshot.conditionalFormats ?? [],
            block,
            area,
            parts.conditionalFormats === "merge",
          )
        : []),
      ...(parts.validation
        ? validationPastePatches(sheet, snapshot.validation ?? [], block, area, {
            transpose: area.transpose,
          })
        : []),
    ];
  }

  /**
   * The cells, in data rows and columns, that a paste of a `rows` × `cols`
   * block (after a transpose) fills at `target`: the selection when it is a
   * whole multiple of the block, which then repeats, as cells do. Null when a
   * repeated block's shown rows are apart, a sorted view or hidden columns
   * split them, or they pass the sheet's end: notes and rules then stay as
   * they are. A block pasted once fills consecutive sheet rows, hidden ones
   * included, or only the shown rows, as its cells do ({@link blockRows}).
   */
  private pasteArea(
    target: PasteTarget,
    rows: number,
    cols: number,
    transpose = false,
  ): PasteArea | null {
    if (rows === 0 || cols === 0) return null;
    const repeat = target.rows % rows === 0 && target.cols % cols === 0;
    const filledRows = repeat ? target.rows : rows;
    const filledCols = repeat ? target.cols : cols;
    const sheet = this.deps.activeSheet();
    const first = this.deps.toDataRow(target.row);
    const blockRows = filledRows === rows && filledCols === cols ? this.blockRows() : "view";
    if (blockRows === "sheet") {
      if (first + filledRows > this.deps.sheet().rowCount) return null;
    } else {
      const dataRows =
        blockRows === "shown"
          ? this.shownRowsFrom(target.row, filledRows).data
          : Array.from({ length: filledRows }, (_, row) => this.deps.toDataRow(target.row + row));
      if (target.row + filledRows > this.deps.store.viewRowCount(sheet)) return null;
      if (dataRows.length < filledRows || dataRows.some((row, index) => row !== first + index)) {
        return null;
      }
    }
    const visible = this.deps.colIndices();
    const at = visible.indexOf(target.col);
    for (let col = 0; col < filledCols; col++) {
      if (visible[at + col] !== target.col + col) return null;
    }
    return { sheet, row: first, col: target.col, rows: filledRows, cols: filledCols, transpose };
  }

  /** A target cell as it is before a paste: its content, value and format. */
  private targetCell(viewRow: number, col: number): TargetCell {
    const addr = { sheet: this.deps.activeSheet(), row: this.deps.toDataRow(viewRow), col };
    const resolved = this.deps.store.getCell(addr);
    const formula = this.deps.store.getFormula(addr);
    const ref = formula === null ? this.deps.store.getRefTarget(addr) : null;
    return {
      value:
        formula !== null
          ? { kind: "formula", src: formula }
          : ref !== null
            ? { kind: "ref", target: ref }
            : { kind: "literal", value: resolved.resolved },
      resolved: resolved.resolved,
      style: resolved.style,
    };
  }

  /**
   * The copied cells as Paste Special reads them. Cells from elsewhere than
   * this grid's copy are read as typed input for the column they land in, as
   * Paste reads them.
   */
  private pasteSourceCells(
    payload: Exclude<ClipboardPayload, { kind: "cut" | "outcome" }>,
  ): PasteSourceCells {
    const columns = this.deps.sheet().columns;
    const external = (write: CellWrite, targetCol: number): ClipboardCell => {
      const { value, style } = externalCellWrite(write, columns[targetCol]?.type ?? "text");
      return { value, resolved: value.kind === "literal" ? value.value : null, style: style ?? {} };
    };
    const rows: readonly (readonly unknown[])[] =
      payload.kind === "text"
        ? parseTsv(payload.text)
        : payload.kind === "html"
          ? payload.grid
          : payload.snapshot.cells;
    const height = rows.length;
    const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
    switch (payload.kind) {
      case "internal":
        return { height, width, cellAt: (row, col) => payload.snapshot.cells[row]?.[col] };
      case "foreign":
        return {
          height,
          width,
          cellAt: (row, col, targetCol) => {
            const cell = payload.snapshot.cells[row]?.[col];
            return cell && external(cell, targetCol);
          },
        };
      case "html":
        return {
          height,
          width,
          cellAt: (row, col, targetCol) => {
            const cell = payload.grid[row]?.[col];
            return cell && external(cell, targetCol);
          },
        };
      case "text":
        return {
          height,
          width,
          cellAt: (row, col, targetCol) => {
            const text = (rows[row]?.[col] as string | undefined) ?? "";
            return external({ value: { kind: "literal", value: text } }, targetCol);
          },
        };
    }
  }

  /** Write a Paste Special of `payload` at `target`, as one undo step. */
  private applyPasteSpecial(
    special: PasteSpecialModule,
    payload: Exclude<ClipboardPayload, { kind: "cut" | "outcome" }>,
    target: PasteTarget,
    options: PasteSpecialOptions,
  ): PasteCommit {
    const snapshot = payload.kind === "internal" ? payload.snapshot : null;
    const sheet = this.deps.activeSheet();
    const range = snapshot?.source ?? null;
    const sourceName = range ? this.deps.sheetName(range.sheet) : undefined;
    const delta = snapshot
      ? {
          row: this.deps.toDataRow(target.row) - snapshot.anchor.row,
          col: target.col - snapshot.anchor.col,
        }
      : null;
    const origin = delta && {
      delta,
      link:
        range && sourceName !== undefined
          ? { range, sheet: range.sheet === sheet ? null : referenceSheetName(sourceName) }
          : null,
    };
    const cells = this.pasteSourceCells(payload);
    const plan = special.planPasteSpecial(cells, options, origin);
    const { parts } = plan;
    const transpose = options.transpose === true;
    // A link refers to each copied cell once; it does not repeat over the selection.
    const at = options.link === true ? { ...target, rows: 1, cols: 1 } : target;

    if (parts.columnWidths) {
      const widths = snapshot?.columnWidths ?? [];
      const visible = this.deps.colIndices();
      const first = visible.indexOf(target.col);
      const count =
        widths.length > 0 && target.cols % widths.length === 0 ? target.cols : widths.length;
      const patches: DocumentOp[] = [];
      for (let index = 0; index < count; index++) {
        const col = visible[first + index];
        const width = widths[index % widths.length];
        if (col === undefined || width === undefined) break;
        patches.push({ op: "setColumn", sheet, col, patch: { width } });
      }
      return this.deps.commit(patches, "paste");
    }

    const area = snapshot ? this.pasteArea(at, plan.height, plan.width, transpose) : null;
    const extras =
      snapshot && delta && options.link !== true
        ? [
            ...(parts.hyperlinks
              ? this.hyperlinkPatches(snapshot, delta.row, delta.col, transpose)
              : []),
            ...this.rulePatches(snapshot, area, {
              notes: parts.notes,
              conditionalFormats: parts.conditionalFormats,
              // Validation pastes only rules; All keeps the target's rules with `paste.keepValidation`, as Paste does.
              validation:
                parts.validation &&
                (options.paste === "validation" || this.deps.keepValidation?.() !== true),
            }),
          ]
        : [];
    if (parts.content === null && parts.style === null) {
      return this.deps.commit(extras, "paste");
    }
    return this.commitBlock(
      at,
      plan.height,
      () => plan.width,
      (row, col, targetCol, repeat) => {
        let read: TargetCell | undefined;
        return plan.cellAt(row, col, targetCol, repeat, () => {
          read ??= this.targetCell(at.row + repeat.row + row, targetCol);
          return read;
        });
      },
      extras,
    );
  }

  private pasteExternalSnapshot(
    snapshot: ClipboardSnapshot,
    focus: PasteTarget,
    valuesOnly: boolean,
  ): PasteCommit {
    const sheet = this.deps.sheet();
    return this.commitBlock(
      focus,
      snapshot.cells.length,
      (row) => snapshot.cells[row]!.length,
      (row, col, targetCol): CellWrite => {
        const cell = snapshot.cells[row]![col]!;
        if (valuesOnly) return { value: { kind: "literal", value: cell.resolved } };
        return externalCellWrite(cell, sheet.columns[targetCol]?.type ?? "text");
      },
    );
  }

  private pasteExternalHtml(grid: CellWrite[][], focus: PasteTarget): PasteCommit {
    const sheet = this.deps.sheet();
    return this.commitBlock(
      focus,
      grid.length,
      (row) => grid[row]!.length,
      (row, col, targetCol): CellWrite =>
        externalCellWrite(grid[row]![col]!, sheet.columns[targetCol]?.type ?? "text"),
    );
  }

  private pasteExternal(text: string, focus: PasteTarget): PasteCommit {
    const grid = parseTsv(text);
    if (grid.length === 0) return null;
    const sheet = this.deps.sheet();

    return this.commitBlock(
      focus,
      grid.length,
      (r) => grid[r]!.length,
      (r, c, targetCol): CellWrite =>
        parseExternalInput(grid[r]?.[c] ?? "", sheet.columns[targetCol]?.type ?? "text"),
    );
  }

  /**
   * Paste a `height`×`widthAt(r)` block at `target`. When the selection is a
   * whole multiple of a rectangular block, the block repeats to fill it, as
   * in Excel; `cellAt` then also gets the repeat's offset from the first copy.
   */
  private commitBlock(
    target: PasteTarget,
    height: number,
    widthAt: (r: number) => number,
    cellAt: (r: number, c: number, targetCol: number, repeat: CellRef) => CellWrite | null,
    extraPatches: DocumentOp[] = [],
  ): PasteCommit {
    const width = height > 0 ? widthAt(0) : 0;
    let rectangular = width > 0;
    for (let r = 1; r < height && rectangular; r++) rectangular = widthAt(r) === width;
    const repeats =
      rectangular && target.rows % height === 0 && target.cols % width === 0
        ? { rows: target.rows / height, cols: target.cols / width }
        : { rows: 1, cols: 1 };
    if (repeats.rows === 1 && repeats.cols === 1) {
      return this.writeBlock(
        target,
        height,
        widthAt,
        (r, c, targetCol) => cellAt(r, c, targetCol, { row: 0, col: 0 }),
        extraPatches,
        this.blockRows(),
      );
    }
    // A block repeated over the selection fills its shown cells, as in Excel.
    return this.writeBlock(
      target,
      height * repeats.rows,
      () => width * repeats.cols,
      (r, c, targetCol) =>
        cellAt(r % height, c % width, targetCol, { row: r - (r % height), col: c - (c % width) }),
      extraPatches,
    );
  }

  /**
   * The rows a block pasted once takes: consecutive sheet rows, the rows a
   * filter or Hide Rows hides included, as Excel's paste does (`sheet`); the
   * shown rows only, for Paste into visible rows only (`shown`); or the
   * view's rows under a view sort, whose sheet rows are not in view order
   * (`view`).
   */
  private blockRows(): PasteRows {
    if (this.pastingShownRows) return "shown";
    return (this.deps.sheet().sortKeys?.length ?? 0) === 0 ? "sheet" : "view";
  }

  /**
   * The first `count` rows from view row `viewRow` that neither a filter nor
   * Hide Rows hides, as data rows and view rows.
   */
  private shownRowsFrom(
    viewRow: number,
    count: number,
  ): { readonly data: number[]; readonly view: number[] } {
    const hidden = new Set(this.deps.sheet().hiddenRows ?? []);
    const viewRows = this.deps.store.viewRowCount(this.deps.activeSheet());
    const data: number[] = [];
    const view: number[] = [];
    for (let row = viewRow; row < viewRows && data.length < count; row++) {
      const dataRow = this.deps.toDataRow(row);
      if (hidden.has(dataRow)) continue;
      data.push(dataRow);
      view.push(row);
    }
    return { data, view };
  }

  /**
   * Walk a `height`×`widthAt(r)` block anchored at `focus`, resolving each cell to
   * a `set` patch via `cellAt`. Honors the row mapping (`rows`, see
   * {@link blockRows}), the visible-column order, the row limit, and
   * merge-anchor skipping, then commits one transaction.
   * A paste that keeps the target's validation rules checks its cells and
   * commits them in one check, so each list source is read once.
   */
  private writeBlock(
    focus: CellRef,
    height: number,
    widthAt: (r: number) => number,
    cellAt: (r: number, c: number, targetCol: number) => CellWrite | null,
    extraPatches: DocumentOp[] = [],
    rows: PasteRows = "view",
  ): PasteCommit {
    const reads = this.deps.keepValidation?.() ? this.deps.validationReads?.() : undefined;
    if (reads) {
      return reads.check(() => this.writeCells(focus, height, widthAt, cellAt, extraPatches, rows));
    } else {
      return this.writeCells(focus, height, widthAt, cellAt, extraPatches, rows);
    }
  }

  /** {@link writeBlock}, within its check. */
  private writeCells(
    focus: CellRef,
    height: number,
    widthAt: (r: number) => number,
    cellAt: (r: number, c: number, targetCol: number) => CellWrite | null,
    extraPatches: DocumentOp[] = [],
    rows: PasteRows = "view",
  ): PasteCommit {
    const activeSheet = this.deps.activeSheet();
    const firstDataRow = this.deps.toDataRow(focus.row);
    const shown = rows === "shown" ? this.shownRowsFrom(focus.row, height) : null;
    const rowIn = (list: readonly number[], r: number): number => {
      const row = list[r];
      if (row === undefined) throw new Error(`Paste has no shown row ${r}`);
      return row;
    };
    const dataRowAt = shown
      ? (r: number) => rowIn(shown.data, r)
      : rows === "sheet"
        ? (r: number) => firstDataRow + r
        : (r: number) => this.deps.toDataRow(focus.row + r);
    // The view row of block row `r`; `null` for a sheet row a filter hides.
    const viewRowAt = shown
      ? (r: number): number | null => rowIn(shown.view, r)
      : rows === "sheet"
        ? (r: number) => this.deps.toViewRow(firstDataRow + r)
        : (r: number): number | null => focus.row + r;
    // With `paste.keepValidation`, a value a reject rule refuses is not pasted.
    const check = this.deps.keepValidation?.() ? this.validationCheck() : null;
    const writeAt = check
      ? (r: number, c: number, targetCol: number): CellWrite | null => {
          const write = cellAt(r, c, targetCol);
          const addr = { sheet: activeSheet, row: dataRowAt(r), col: targetCol };
          return write && check.admits(write, addr) ? write : null;
        }
      : cellAt;
    const colIndices = this.deps.colIndices();
    const startPos = colIndices.indexOf(focus.col);
    if (startPos < 0) return null;

    const availableRows = Math.min(
      height,
      shown
        ? shown.data.length
        : rows === "sheet"
          ? this.deps.sheet().rowCount - firstDataRow
          : this.deps.store.viewRowCount(activeSheet) - focus.row,
    );
    const hiddenRows = rows === "sheet" ? this.hiddenRowsIn(firstDataRow, availableRows) : 0;
    // The sheet rows the block writes, for the hidden-rows notice's Show them.
    const writtenRows = [{ start: firstDataRow, end: firstDataRow + availableRows - 1 }];
    const width = availableRows > 0 ? widthAt(0) : 0;
    const targetCols = colIndices.slice(startPos, startPos + width);
    const rectangular =
      availableRows > 0 &&
      width > 0 &&
      targetCols.length === width &&
      targetCols.every((col, index) => col === focus.col + index) &&
      Array.from({ length: availableRows }, (_, row) => row).every(
        (row) => widthAt(row) === width && dataRowAt(row) === firstDataRow + row,
      );
    if (rectangular) {
      const values: CellScalar[] = new Array(availableRows * width);
      const formulas: Array<[number, string]> = [];
      const refs: Array<[number, { sheet: SheetId; row: number; col: number }]> = [];
      const styleTable: CellStyle[] = [];
      const styleLookup = new Map<string, number>();
      // Most cells share a style object (none, or one per pasted format), so
      // the id is found by identity before the style is serialized.
      const styleIdOf = new Map<CellStyle, number>();
      const noStyle: CellStyle = {};
      const styleIds: number[] = new Array(availableRows * width);
      let canPack = true;
      for (let row = 0; row < availableRows && canPack; row++) {
        for (let col = 0; col < width; col++) {
          const viewRow = viewRowAt(row);
          const targetCol = targetCols[col]!;
          if (viewRow !== null && this.deps.mergeAnchorAt(viewRow, targetCol)) {
            canPack = false;
            break;
          }

          const write = writeAt(row, col, targetCol);
          if (!write) {
            canPack = false;
            break;
          }

          const offset = row * width + col;
          if (write.value.kind === "formula") {
            values[offset] = null;
            formulas.push([offset, write.value.src]);
          } else if (write.value.kind === "ref") {
            values[offset] = null;
            refs.push([offset, { ...write.value.target }]);
          } else {
            values[offset] = write.value.value;
          }

          const style = write.style ?? noStyle;
          let styleId = styleIdOf.get(style);
          if (styleId === undefined) {
            const styleKey = JSON.stringify(style);
            styleId = styleLookup.get(styleKey);
            if (styleId === undefined) {
              styleId = styleTable.length;
              styleLookup.set(styleKey, styleId);
              styleTable.push(style);
            }
            styleIdOf.set(style, styleId);
          }

          styleIds[offset] = styleId;
        }
      }

      if (canPack) {
        const block: PackedCellBlock = {
          rowCount: availableRows,
          colCount: width,
          values,
          formulas: formulas.length > 0 ? formulas : undefined,
          refs: refs.length > 0 ? refs : undefined,
          styleTable,
          styleIds,
        };

        const result = this.deps.commit(
          [
            {
              op: "setBlock",
              range: {
                sheet: activeSheet,
                start: { row: firstDataRow, col: targetCols[0]! },
                end: {
                  row: firstDataRow + availableRows - 1,
                  col: targetCols[targetCols.length - 1]!,
                },
              },
              block,
            },
            ...extraPatches,
          ],
          "paste",
        );
        check?.report();
        this.wroteHiddenRows(result, hiddenRows, writtenRows);
        return result;
      }
    }

    // The cells go in one sparse `setRange` over their bounding rows and
    // columns: one operation however many cells, so a paste over a filtered
    // range or a merge stays within the transaction's operation limit.
    const cells: { row: number; col: number; write: CellWrite }[] = [];
    for (let r = 0; r < height; r++) {
      const width = widthAt(r);
      for (let c = 0; c < width; c++) {
        const targetCol = colIndices[startPos + c];
        if (r >= availableRows || targetCol === undefined) continue;

        const viewRow = viewRowAt(r);
        const merge = viewRow === null ? null : this.deps.mergeAnchorAt(viewRow, targetCol);
        if (merge && (merge.r0 !== viewRow || merge.c0 !== targetCol)) continue;

        const write = writeAt(r, c, targetCol);
        if (!write) continue;
        cells.push({ row: dataRowAt(r), col: targetCol, write });
      }
    }

    const result = this.deps.commit(
      [...sparseCellsPatch(activeSheet, cells), ...extraPatches],
      "paste",
    );
    check?.report();
    this.wroteHiddenRows(result, hiddenRows, writtenRows);
    return result;
  }

  /** How many of the `count` sheet rows from `first` a filter or Hide Rows hides. */
  private hiddenRowsIn(first: number, count: number): number {
    const hiddenByUser = new Set(this.deps.sheet().hiddenRows ?? []);
    let hidden = 0;
    for (let row = first; row < first + count; row++) {
      if (hiddenByUser.has(row) || this.deps.toViewRow(row) === null) hidden += 1;
    }
    return hidden;
  }

  /**
   * After a paste wrote into `count` hidden rows: say so, and keep the paste,
   * so Paste into visible rows only can paste it again on the shown rows.
   */
  private wroteHiddenRows(
    result: ApplyTransactionResult,
    count: number,
    rows: readonly { readonly start: number; readonly end: number }[],
  ): void {
    // A refused or empty commit wrote nothing, and left no undo entry to replace.
    if (count === 0 || result.status !== "applied") return;
    const paste = this.runningPaste;
    this.hiddenRowsPaste = paste
      ? { sheet: this.deps.activeSheet(), paste, undoEntry: this.deps.lastUndo() }
      : null;
    this.deps.onHiddenRowsMoved?.(count, "write", rows);
  }

  /**
   * The check of a paste that keeps the target's validation rules: each
   * cell's value against the rules over its cell. It records the cells a
   * `reject` rule refuses and those a `warn` rule refuses, once each, and
   * `report` hands them to the grid's notice. Once the check runs out of its
   * budget it admits every cell, and the store refuses the paste.
   */
  private validationCheck(): {
    admits(write: CellWrite, addr: CellAddress): boolean;
    report(): void;
  } {
    const rules = this.deps.sheet().validationRules ?? [];
    const reads = this.deps.validationReads?.();
    const refused = new Map<string, CellAddress>();
    const warned = new Map<string, CellAddress>();
    return {
      admits: (write, addr) => {
        if (rules.length === 0) return true;
        let value: CellScalar | undefined;
        if (write.value.kind === "literal") value = write.value.value;
        else if (write.value.kind === "formula") {
          const result = reads?.formula(write.value.src, addr);
          value = typeof result === "object" && result !== null ? result.error : result;
        }
        if (value === undefined) return true;
        let rule: DataValidationRule | undefined;
        try {
          rule = failingValidationRule(rules, addr, value, reads);
        } catch (error) {
          if (error instanceof ValidationBudgetError) return true;
          throw error;
        }
        if (!rule) return true;
        const key = `${addr.row}:${addr.col}`;
        if (rule.policy === "reject") {
          refused.set(key, addr);
          return false;
        }
        warned.set(key, addr);
        return true;
      },
      report: () => {
        if (refused.size === 0 && warned.size === 0) return;
        this.deps.onValidationRefused?.([...refused.values()], [...warned.values()]);
      },
    };
  }

  /**
   * Snapshot the focused selection rectangle into a {@link ClipboardSnapshot}:
   * per-cell value (formula src preserved, else literal), resolved scalar, and
   * style, plus the source anchor, the TSV those resolved scalars produce, and
   * the rectangle in data rows when they are one block. Returns `null` when
   * there is no focused rectangle.
   */
  /**
   * The active cell on a row the view hides, copied or cut alone, as Excel's
   * Copy and Cut take the active cell that Go To left on a hidden row. A cut
   * of a spill's child cell is refused, as in a selection.
   */
  private captureHiddenCell(cut: boolean, addr: CellAddress): CapturedClipboard | null {
    const { store } = this.deps;
    const owner = store.getSpillAnchor(addr);
    const child = owner !== null && (owner.row !== addr.row || owner.col !== addr.col);
    if (cut && child) return null;

    const cell = store.getCell(addr);
    const formula = store.getFormula(addr);
    const ref = store.getRefTarget(addr);
    const value: CellValue =
      formula !== null
        ? { kind: "formula", src: formula }
        : child
          ? { kind: "literal", value: null }
          : ref !== null
            ? { kind: "ref", target: ref }
            : { kind: "literal", value: cell.resolved };
    const at = { row: addr.row, col: addr.col };
    const source: Range = { sheet: addr.sheet, start: at, end: at };
    const sheet = this.deps.sheet();
    const hyperlinks = (sheet.hyperlinks ?? [])
      .filter(
        ({ range }) =>
          range.sheet === addr.sheet &&
          range.start.row === addr.row &&
          range.end.row === addr.row &&
          range.start.col === addr.col &&
          range.end.col === addr.col,
      )
      .map(cloneCellHyperlink);
    return {
      anchor: at,
      cells: [[{ value, resolved: cell.resolved, style: cell.style }]],
      hyperlinks,
      tsv: rowsToTsv([[cell.resolved]]),
      cut,
      source,
      notes: copyNotes(sheet, source),
      conditionalFormats: copyConditionalFormats(sheet, source),
      validation: copiedValidation(sheet.validationRules ?? [], source),
      columnWidths: [sheet.columns[addr.col]?.width ?? 0],
    };
  }

  private capture(cut: boolean): CapturedClipboard | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) {
      const hidden = this.deps.hiddenActive?.();
      return hidden ? this.captureHiddenCell(cut, hidden) : null;
    }
    const rects: SelRect[] = [];
    this.deps.selection().forEachRect((r) => rects.push(r));
    const selected = rects.find(
      (r) => r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1,
    );
    if (!selected) return null;

    // Rows past the view's last row hold nothing: under a filter the view has
    // fewer rows than the sheet, and a selection made from sheet rows can
    // reach past it.
    const activeSheet = this.deps.activeSheet();
    const rect = {
      ...selected,
      r1: Math.min(selected.r1, this.deps.store.viewRowCount(activeSheet) - 1),
    };
    if (rect.r1 < rect.r0) return null;

    const selectedColumns = Array.from(
      { length: rect.c1 - rect.c0 + 1 },
      (_, index) => rect.c0 + index,
    );
    // Rows hidden by hand between the selected rows are copied, as in Excel;
    // rows a filter hides are not, and neither are rows past a view sort's order.
    const span = this.deps.rowSpan(rect.r0, rect.r1);
    const handHidden = span && span.last - span.first !== rect.r1 - rect.r0 ? span : null;
    const rowCount = handHidden ? handHidden.last - handHidden.first + 1 : rect.r1 - rect.r0 + 1;
    const bulk = this.deps.store.getClipboardWindow?.(
      activeSheet,
      handHidden
        ? { start: handHidden.first, end: handHidden.last + 1 }
        : { start: rect.r0, end: rect.r1 + 1 },
      selectedColumns,
      handHidden ? { dataRows: true } : undefined,
    );
    /** The view row of the `index`th copied row; null for a row hidden by hand. */
    const viewRowAt = (index: number): number | null =>
      handHidden ? this.deps.toViewRow(handHidden.first + index) : rect.r0 + index;
    const dataRowAt = (index: number): number =>
      bulk?.dataRows[index] ??
      (handHidden ? handHidden.first + index : this.deps.toDataRow(rect.r0 + index));
    // A projected child has no source to move. Reject the whole cut before
    // replacing the clipboard when its owning formula is outside the selection.
    if (cut && bulk?.spillDerived.some((derived) => derived === 1)) {
      const selectedRows = new Set(bulk.dataRows);
      for (const [offset, derived] of bulk.spillDerived.entries()) {
        if (derived !== 1) continue;
        const row = bulk.dataRows[Math.floor(offset / selectedColumns.length)];
        if (row === undefined) throw new Error("Missing spill clipboard row");
        const owner = this.deps.store.getSpillAnchor({
          sheet: activeSheet,
          row,
          col: rect.c0 + (offset % selectedColumns.length),
        });
        if (
          owner !== null &&
          (selectedRows.has(owner.row) === false || owner.col < rect.c0 || owner.col > rect.c1)
        )
          return null;
      }
    }
    const bulkFormulas = bulk
      ? new Map(bulk.formulas.map((entry) => [entry.offset, entry.source] as const))
      : null;
    const bulkRefs = bulk
      ? new Map(bulk.refs.map((entry) => [entry.offset, entry.target] as const))
      : null;
    const cells: ClipboardCell[][] = [];
    const values: CellScalar[][] = [];
    const firstDataRow = dataRowAt(0);
    // A filter leaves gaps between the selected data rows; a view sort puts
    // them out of order.
    let contiguous = true;
    let ascending = true;
    let lastDataRow = firstDataRow;
    let merged = false;
    for (let index = 0; index < rowCount; index++) {
      const dataRow = dataRowAt(index);
      contiguous &&= dataRow === firstDataRow + index;
      ascending &&= index === 0 || dataRow > lastDataRow;
      lastDataRow = dataRow;
      const row = viewRowAt(index);
      for (let col = rect.c0; col <= rect.c1 && !merged && row !== null; col++) {
        merged = this.deps.mergeAnchorAt(row, col) !== null;
      }
    }
    const source: Range | null = ascending
      ? {
          sheet: activeSheet,
          start: { row: firstDataRow, col: rect.c0 },
          end: { row: lastDataRow, col: rect.c1 },
        }
      : null;

    const hyperlinks =
      contiguous && !merged
        ? (this.deps.sheet().hyperlinks ?? [])
            .filter((hyperlink) => {
              const r0 = Math.min(hyperlink.range.start.row, hyperlink.range.end.row);
              const r1 = Math.max(hyperlink.range.start.row, hyperlink.range.end.row);
              const c0 = Math.min(hyperlink.range.start.col, hyperlink.range.end.col);
              const c1 = Math.max(hyperlink.range.start.col, hyperlink.range.end.col);
              return (
                hyperlink.range.sheet === activeSheet &&
                r0 >= firstDataRow &&
                r1 <= firstDataRow + rowCount - 1 &&
                c0 >= rect.c0 &&
                c1 <= rect.c1
              );
            })
            .map(cloneCellHyperlink)
        : [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const r = viewRowAt(rowIndex);
      const cellLine: ClipboardCell[] = [];
      const valueLine: CellScalar[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const merge = r === null ? null : this.deps.mergeAnchorAt(r, c);
        if (merge && (merge.r0 !== r || merge.c0 !== c)) {
          cellLine.push({ value: { kind: "literal", value: null }, resolved: null, style: {} });
          valueLine.push(null);
          continue;
        }

        const colIndex = c - rect.c0;
        const offset = rowIndex * selectedColumns.length + colIndex;
        const addr = { sheet: activeSheet, row: dataRowAt(rowIndex), col: c };
        const bulkResolved = bulk?.values[offset];
        const cell =
          bulk === undefined
            ? this.deps.store.getCell(addr)
            : {
                resolved: bulkResolved === undefined ? null : bulkResolved,
                style: bulk.styles[bulk.styleIds[offset] ?? 0] ?? {},
              };

        const formula =
          bulk === undefined
            ? this.deps.store.getFormula(addr)
            : (bulkFormulas?.get(offset) ?? null);
        const ref =
          bulk === undefined ? this.deps.store.getRefTarget(addr) : (bulkRefs?.get(offset) ?? null);
        const value: CellValue =
          formula !== null
            ? { kind: "formula", src: formula }
            : bulk?.spillDerived?.[offset] === 1
              ? { kind: "literal", value: null }
              : ref !== null
                ? { kind: "ref", target: ref }
                : { kind: "literal", value: cell.resolved };
        cellLine.push({ value, resolved: cell.resolved, style: cell.style });
        valueLine.push(cell.resolved);
      }

      cells.push(cellLine);
      values.push(valueLine);
    }

    const anchor = { row: firstDataRow, col: rect.c0 };
    const sheet = this.deps.sheet();
    return {
      anchor,
      cells,
      hyperlinks,
      tsv: rowsToTsv(values),
      cut,
      source,
      // Paste and Paste Special carry these to the target, as in Excel.
      notes: source ? copyNotes(sheet, source) : [],
      conditionalFormats: source ? copyConditionalFormats(sheet, source) : [],
      validation: source && !merged ? copiedValidation(sheet.validationRules ?? [], source) : [],
      columnWidths: selectedColumns.map((col) => sheet.columns[col]?.width ?? 0),
    };
  }
}
