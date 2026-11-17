import { cellA1, shiftA1Refs } from "./a1.js";
import { parseCellInput } from "./cell-input.js";
import { isCellFontFamily, isCellVerticalAlign, sanitizeCellStyle } from "./cell-style-fields.js";
import {
  type ClipboardCell,
  type ClipboardSnapshot,
  neutralizeInjection,
  parseTsv,
  rowsToTsv,
} from "./clipboard.js";
import {
  cloneCellHyperlink,
  createHyperlinkId,
  MAX_HYPERLINKS_PER_SHEET,
  sanitizeCellHyperlink,
} from "./hyperlink.js";
import { type Scope, ScopeSlot } from "./scope.js";
import type { CellRef, SelectionModel, SelRect } from "./selection.js";
import type { CellHyperlink, CellScalar, CellStyle, CellValue } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { CommitReason, DocumentOp, PackedCellBlock, Sheet } from "./types/document.js";
import type { ClipboardOutcome } from "./types/grid.js";
import type { Store } from "./types/store.js";
import type { ChangeEvent } from "./types/transaction.js";
import { failingValidationRule, type ValidationReads } from "./validation-rule.js";
import { copiedValidation, validationPastePatches } from "./validation-transfer.js";

export interface ClipboardControllerDeps {
  /** The grid's scope; its close stops every clipboard action that is still running. */
  lifetime: Scope;
  store: Store;
  selection: () => SelectionModel;
  activeSheet: () => SheetId;
  sheet: () => Sheet;
  colIndices: () => number[];
  readOnly: () => boolean;
  mergeAnchorAt: (row: number, col: number) => SelRect | null;
  toDataRow: (viewRow: number) => number;
  commit: (patches: DocumentOp[], reason: CommitReason) => void;
  /** Called when a cut starts waiting for a paste (its cells, in data rows) and when it ends. */
  onCutChange: (range: Range | null) => void;
  /** Whether a paste keeps the target's validation rules (`GridConfig.paste.keepValidation`), read per paste. */
  keepValidation: () => boolean;
  /**
   * Called after a paste that kept the target's rules, with the cells whose
   * values a `reject` rule refused (not pasted) and those a `warn` rule
   * refused (pasted), in data coordinates.
   */
  onValidationRefused: (refused: readonly CellAddress[], warned: readonly CellAddress[]) => void;
  /** Formula results and list sources for the rules a kept paste checks. */
  validationReads: () => ValidationReads | undefined;
}

/** What a single paste target cell should become, or `null` to skip it. */
interface CellWrite {
  value: CellValue;
  style?: CellStyle;
}

/** The top-left cell a paste lands on, and the size of the selection it may repeat to fill. */
interface PasteTarget extends CellRef {
  rows: number;
  cols: number;
}

interface CapturedClipboard extends ClipboardSnapshot {
  /** The selected cells as one block of data rows; `null` when a sorted view splits them. */
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
}

/** Private-format MIME type used for rich Sheetwrite clipboard payloads. */
export const SHEETWRITE_CLIPBOARD_MIME = "application/x-sheetwrite+json";
const SHEETWRITE_WEB_CLIPBOARD_FORMAT = `web ${SHEETWRITE_CLIPBOARD_MIME}`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseExternalInput(source: string, type: Sheet["columns"][number]["type"]): CellValue {
  const parsed = parseCellInput(source, type);

  return parsed.kind === "formula" ? { kind: "literal", value: `'${parsed.src}` } : parsed;
}

/**
 * The write of one cell pasted from another workbook or application. Its
 * formula, reference or text is re-read as typed input for the target column,
 * so an external formula lands as inert text; other values keep their kind.
 */
function externalCellWrite(cell: CellWrite, type: Sheet["columns"][number]["type"]): CellWrite {
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

  return { value: parseExternalInput(source, type), style: cell.style };
}

function clipboardHtml(snapshot: ClipboardSnapshot): string {
  let html = "<table><tbody>";
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

function parseClipboardJson(text: string): TrustedClipboard | null {
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
    for (const inputRow of value.cells) {
      if (!Array.isArray(inputRow)) return null;
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
  } catch {
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

function parseClipboardHtml(html: string, valuesOnly: boolean): CellWrite[][] | null {
  if (typeof DOMParser === "undefined") return null;
  const document = new DOMParser().parseFromString(html, "text/html");
  const table = document.querySelector("table");
  if (!table) return null;
  const grid: CellWrite[][] = [];
  for (const row of table.querySelectorAll(
    ":scope > thead > tr, :scope > tbody > tr, :scope > tr",
  )) {
    const values: CellWrite[] = [];
    for (const cell of row.querySelectorAll(":scope > th, :scope > td")) {
      const formula = valuesOnly ? null : spreadsheetFormula(cell);
      values.push({
        value: formula
          ? { kind: "formula", src: formula }
          : { kind: "literal", value: cell.textContent ?? "" },
        style: valuesOnly || !(cell instanceof HTMLElement) ? undefined : styleFromHtml(cell),
      });
    }
    if (values.length > 0) grid.push(values);
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
      this.pendingCut = { range: source, token };
      this.deps.onCutChange(source);
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
      const html = new Blob([clipboardHtml(snapshot)], { type: "text/html" });
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
    return this.pasteFrom(false);
  }

  /**
   * Like {@link paste} but writes only resolved literals — never formulas or
   * styles. For external text this is identical to {@link paste}.
   */
  pasteValues(): Promise<ClipboardOutcome> {
    return this.pasteFrom(true);
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

  /** Every clipboard read awaits; a paste whose scope closed meanwhile writes nothing. */
  private async readAndPaste(
    read: Scope,
    clipboard: Clipboard,
    focus: PasteTarget,
    valuesOnly: boolean,
  ): Promise<ClipboardOutcome> {
    let richReadFailed = false;

    if (typeof clipboard.read === "function") {
      try {
        const items = await clipboard.read();
        if (read.closed) return "empty";
        for (const item of items) {
          const customType = item.types.includes(SHEETWRITE_WEB_CLIPBOARD_FORMAT)
            ? SHEETWRITE_WEB_CLIPBOARD_FORMAT
            : item.types.includes(SHEETWRITE_CLIPBOARD_MIME)
              ? SHEETWRITE_CLIPBOARD_MIME
              : null;
          if (!customType) continue;
          const envelope = parseClipboardJson(await (await item.getType(customType)).text());
          if (read.closed) return "empty";
          if (!envelope) continue;
          if (this.pendingCut?.token === envelope.token) {
            return this.pasteCut(this.pendingCut, focus, valuesOnly);
          }
          // A cut that was pasted or ended does not paste again, as in Excel.
          if (this.endedCutToken === envelope.token) return "empty";
          this.endCut();
          if (this.trusted?.token === envelope.token) {
            this.pasteInternal(this.trusted.snapshot, focus, valuesOnly);
          } else {
            this.pasteExternalSnapshot(envelope.snapshot, focus, valuesOnly);
          }

          return "done";
        }

        // The clipboard no longer holds the cut: this is a plain paste.
        this.endCut();
        for (const item of items) {
          if (!item.types.includes("text/html")) continue;
          const html = await (await item.getType("text/html")).text();
          if (read.closed) return "empty";
          const grid = parseClipboardHtml(html, valuesOnly);
          if (!grid) continue;
          this.pasteExternalHtml(grid, focus);
          return "done";
        }

        for (const item of items) {
          if (!item.types.includes("text/plain")) continue;
          const text = await (await item.getType("text/plain")).text();
          if (read.closed) return "empty";
          if (text.length === 0) return "empty";
          this.pasteExternal(text, focus);
          return "done";
        }
      } catch {
        richReadFailed = true;
      }
    }

    if (typeof clipboard.readText !== "function") {
      return richReadFailed ? "blocked" : "unsupported";
    }

    try {
      const text = await clipboard.readText();
      if (read.closed || text.length === 0) return "empty";
      this.endCut();
      this.pasteExternal(text, focus);
      return "done";
    } catch {
      return "blocked";
    }
  }

  /**
   * Move the pending cut so that its top-left cell lands on the paste target's,
   * as Excel's Cut and Paste does. Paste Values is not available after a cut,
   * and a target that a sorted view splits takes no move; the cut stays.
   */
  private pasteCut(cut: PendingCut, target: PasteTarget, valuesOnly: boolean): ClipboardOutcome {
    const rows = cut.range.end.row - cut.range.start.row + 1;
    const cols = cut.range.end.col - cut.range.start.col + 1;
    const firstRow = this.deps.toDataRow(target.row);
    const fits =
      !valuesOnly &&
      target.row + rows <= this.deps.store.viewRowCount(this.deps.activeSheet()) &&
      target.col + cols <= this.deps.sheet().columns.length &&
      Array.from({ length: rows }, (_, row) => row).every(
        (row) => this.deps.toDataRow(target.row + row) === firstRow + row,
      );
    if (!fits) return "empty";

    this.movingCut = true;
    try {
      this.deps.commit(
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
    return "done";
  }

  private pasteInternal(
    snapshot: ClipboardSnapshot,
    focus: PasteTarget,
    valuesOnly: boolean,
  ): void {
    // Copy shifts every relative formula ref by the block's rigid displacement.
    // Hyperlink source ranges move to the paste destination, while stable
    // internal targets remain unchanged. The copied cells' validation rules
    // replace those of the cells the paste covers, as in Excel.
    const targetAnchorRow = this.deps.toDataRow(focus.row);
    const deltaRow = targetAnchorRow - snapshot.anchor.row;
    const deltaCol = focus.col - snapshot.anchor.col;
    const extraPatches: DocumentOp[] = valuesOnly
      ? []
      : [
          ...(this.deps.keepValidation() ? [] : this.validationPatches(snapshot, focus)),
          ...snapshot.hyperlinks.map((source) => ({
            op: "setHyperlink" as const,
            sheet: this.deps.activeSheet(),
            hyperlink: {
              ...cloneCellHyperlink(source),
              id: createHyperlinkId(),
              range: {
                sheet: this.deps.activeSheet(),
                start: {
                  row: source.range.start.row + deltaRow,
                  col: source.range.start.col + deltaCol,
                },
                end: {
                  row: source.range.end.row + deltaRow,
                  col: source.range.end.col + deltaCol,
                },
              },
            },
          })),
        ];

    this.commitBlock(
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
      extraPatches,
    );
  }

  /**
   * The rule changes of pasting `snapshot` at `focus`: the target's rules
   * leave the pasted cells and the copied rules land on them. None when the
   * pasted rows are not one block of data rows, as under a sorted view.
   */
  private validationPatches(snapshot: ClipboardSnapshot, focus: PasteTarget): DocumentOp[] {
    const sheet = this.deps.sheet();
    const copied = snapshot.validation ?? [];
    if (copied.length === 0 && !sheet.validationRules?.length) return [];
    const height = snapshot.cells.length;
    const width = snapshot.cells[0]?.length ?? 0;
    const rows = focus.rows % height === 0 && focus.cols % width === 0 ? focus.rows : height;
    // A paste cut short by the sheet's last row carries no rules past it.
    if (focus.row + rows > this.deps.store.viewRowCount(this.deps.activeSheet())) return [];
    const firstRow = this.deps.toDataRow(focus.row);
    for (let row = 1; row < rows; row++) {
      if (this.deps.toDataRow(focus.row + row) !== firstRow + row) return [];
    }
    return validationPastePatches(
      sheet,
      copied,
      { rows: height, cols: width },
      { row: firstRow, col: focus.col, rows: focus.rows, cols: focus.cols },
    );
  }

  private pasteExternalSnapshot(
    snapshot: ClipboardSnapshot,
    focus: PasteTarget,
    valuesOnly: boolean,
  ): void {
    const sheet = this.deps.sheet();
    this.commitBlock(
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

  private pasteExternalHtml(grid: CellWrite[][], focus: PasteTarget): void {
    const sheet = this.deps.sheet();
    this.commitBlock(
      focus,
      grid.length,
      (row) => grid[row]!.length,
      (row, col, targetCol): CellWrite =>
        externalCellWrite(grid[row]![col]!, sheet.columns[targetCol]?.type ?? "text"),
    );
  }

  private pasteExternal(text: string, focus: PasteTarget): void {
    const grid = parseTsv(text);
    if (grid.length === 0) return;
    const sheet = this.deps.sheet();

    this.commitBlock(
      focus,
      grid.length,
      (r) => grid[r]!.length,
      (r, c, targetCol): CellWrite => ({
        value: parseExternalInput(grid[r]?.[c] ?? "", sheet.columns[targetCol]?.type ?? "text"),
      }),
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
  ): void {
    const width = height > 0 ? widthAt(0) : 0;
    let rectangular = width > 0;
    for (let r = 1; r < height && rectangular; r++) rectangular = widthAt(r) === width;
    const repeats =
      rectangular && target.rows % height === 0 && target.cols % width === 0
        ? { rows: target.rows / height, cols: target.cols / width }
        : { rows: 1, cols: 1 };
    if (repeats.rows === 1 && repeats.cols === 1) {
      this.writeBlock(
        target,
        height,
        widthAt,
        (r, c, targetCol) => cellAt(r, c, targetCol, { row: 0, col: 0 }),
        extraPatches,
      );
      return;
    }
    this.writeBlock(
      target,
      height * repeats.rows,
      () => width * repeats.cols,
      (r, c, targetCol) =>
        cellAt(r % height, c % width, targetCol, { row: r - (r % height), col: c - (c % width) }),
      extraPatches,
    );
  }

  /**
   * Walk a `height`×`widthAt(r)` block anchored at `focus`, resolving each cell to
   * a `set` patch via `cellAt`. Honors the view-row mapping, the visible-column
   * order, the row limit, and merge-anchor skipping, then commits one transaction.
   */
  private writeBlock(
    focus: CellRef,
    height: number,
    widthAt: (r: number) => number,
    cellAt: (r: number, c: number, targetCol: number) => CellWrite | null,
    extraPatches: DocumentOp[] = [],
  ): void {
    const activeSheet = this.deps.activeSheet();
    // With `paste.keepValidation`, a value a reject rule refuses is not pasted.
    const check = this.deps.keepValidation() ? this.validationCheck() : null;
    const writeAt = check
      ? (r: number, c: number, targetCol: number): CellWrite | null => {
          const write = cellAt(r, c, targetCol);
          const addr = {
            sheet: activeSheet,
            row: this.deps.toDataRow(focus.row + r),
            col: targetCol,
          };
          return write && check.admits(write, addr) ? write : null;
        }
      : cellAt;
    const rowLimit = this.deps.store.viewRowCount(activeSheet);
    const colIndices = this.deps.colIndices();
    const startPos = colIndices.indexOf(focus.col);
    if (startPos < 0) return;

    const availableRows = Math.min(height, rowLimit - focus.row);
    const width = availableRows > 0 ? widthAt(0) : 0;
    const targetCols = colIndices.slice(startPos, startPos + width);
    const firstDataRow = availableRows > 0 ? this.deps.toDataRow(focus.row) : -1;
    const rectangular =
      availableRows > 0 &&
      width > 0 &&
      targetCols.length === width &&
      targetCols.every((col, index) => col === focus.col + index) &&
      Array.from({ length: availableRows }, (_, row) => row).every(
        (row) =>
          widthAt(row) === width && this.deps.toDataRow(focus.row + row) === firstDataRow + row,
      );
    if (rectangular) {
      const values: CellScalar[] = new Array(availableRows * width);
      const formulas: Array<[number, string]> = [];
      const refs: Array<[number, { sheet: SheetId; row: number; col: number }]> = [];
      const styleTable: CellStyle[] = [];
      const styleLookup = new Map<string, number>();
      const styleIds: number[] = new Array(availableRows * width);
      let canPack = true;
      for (let row = 0; row < availableRows && canPack; row++) {
        for (let col = 0; col < width; col++) {
          const targetRow = focus.row + row;
          const targetCol = targetCols[col]!;
          if (this.deps.mergeAnchorAt(targetRow, targetCol)) {
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

          const style = write.style ?? {};
          const styleKey = JSON.stringify(style);
          let styleId = styleLookup.get(styleKey);
          if (styleId === undefined) {
            styleId = styleTable.length;
            styleLookup.set(styleKey, styleId);
            styleTable.push(style);
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

        this.deps.commit(
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
        return;
      }
    }

    const patches: DocumentOp[] = [];
    for (let r = 0; r < height; r++) {
      const width = widthAt(r);
      for (let c = 0; c < width; c++) {
        const targetRow = focus.row + r;
        const targetCol = colIndices[startPos + c];
        if (targetRow >= rowLimit || targetCol === undefined) continue;

        const merge = this.deps.mergeAnchorAt(targetRow, targetCol);
        if (merge && (merge.r0 !== targetRow || merge.c0 !== targetCol)) continue;

        const write = writeAt(r, c, targetCol);
        if (!write) continue;
        patches.push({
          op: "set",
          addr: { sheet: activeSheet, row: this.deps.toDataRow(targetRow), col: targetCol },
          value: write.value,
          style: write.style,
        });
      }
    }

    this.deps.commit([...patches, ...extraPatches], "paste");
    check?.report();
  }

  /**
   * The check of a paste that keeps the target's validation rules: each
   * cell's value against the rules over its cell. It records the cells a
   * `reject` rule refuses and those a `warn` rule refuses, once each, and
   * `report` hands them to the grid's notice.
   */
  private validationCheck(): {
    admits(write: CellWrite, addr: CellAddress): boolean;
    report(): void;
  } {
    const rules = this.deps.sheet().validationRules ?? [];
    const reads = this.deps.validationReads();
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
        const rule = failingValidationRule(rules, addr, value, reads);
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
        this.deps.onValidationRefused([...refused.values()], [...warned.values()]);
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
  private capture(cut: boolean): CapturedClipboard | null {
    const focus = this.deps.selection().focusCell;
    if (!focus) return null;
    const rects: SelRect[] = [];
    this.deps.selection().forEachRect((r) => rects.push(r));
    const rect = rects.find(
      (r) => r.r0 <= focus.row && focus.row <= r.r1 && r.c0 <= focus.col && focus.col <= r.c1,
    );
    if (!rect) return null;

    const activeSheet = this.deps.activeSheet();
    const selectedColumns = Array.from(
      { length: rect.c1 - rect.c0 + 1 },
      (_, index) => rect.c0 + index,
    );
    const bulk = this.deps.store.getClipboardWindow?.(
      activeSheet,
      { start: rect.r0, end: rect.r1 + 1 },
      selectedColumns,
    );
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
    const firstDataRow = this.deps.toDataRow(rect.r0);
    let contiguous = true;
    let merged = false;
    for (let row = rect.r0; row <= rect.r1 && contiguous; row++) {
      contiguous = this.deps.toDataRow(row) === firstDataRow + row - rect.r0;
      for (let col = rect.c0; col <= rect.c1 && !merged; col++) {
        merged = this.deps.mergeAnchorAt(row, col) !== null;
      }
    }
    const source: Range | null = contiguous
      ? {
          sheet: activeSheet,
          start: { row: firstDataRow, col: rect.c0 },
          end: { row: firstDataRow + rect.r1 - rect.r0, col: rect.c1 },
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
                r1 <= firstDataRow + rect.r1 - rect.r0 &&
                c0 >= rect.c0 &&
                c1 <= rect.c1
              );
            })
            .map(cloneCellHyperlink)
        : [];

    for (let r = rect.r0; r <= rect.r1; r++) {
      const cellLine: ClipboardCell[] = [];
      const valueLine: CellScalar[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const merge = this.deps.mergeAnchorAt(r, c);
        if (merge && (merge.r0 !== r || merge.c0 !== c)) {
          cellLine.push({ value: { kind: "literal", value: null }, resolved: null, style: {} });
          valueLine.push(null);
          continue;
        }

        const rowIndex = r - rect.r0;
        const colIndex = c - rect.c0;
        const offset = rowIndex * selectedColumns.length + colIndex;
        const addr = {
          sheet: activeSheet,
          row: bulk?.dataRows[rowIndex] ?? this.deps.toDataRow(r),
          col: c,
        };

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

    const anchor = { row: bulk?.dataRows[0] ?? this.deps.toDataRow(rect.r0), col: rect.c0 };
    const validation =
      source && !merged ? copiedValidation(this.deps.sheet().validationRules ?? [], source) : [];
    return { anchor, cells, hyperlinks, validation, tsv: rowsToTsv(values), cut, source };
  }
}
