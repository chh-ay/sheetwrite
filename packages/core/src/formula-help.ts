// Formula help in a formula editor: the function list as you type, the
// argument guide, live errors with their fixes and coloured references. This
// module is a chunk of its own: formula-assist.ts loads it on the first
// formula edit, so a grid that never edits a formula never downloads it or
// the function table. Every feature reads one `analyzeFormula` result.

import {
  analyzeFormula,
  argumentOf,
  type FormulaAnalysis,
  type FormulaCall,
  type FormulaCompletion,
  type FormulaCompletionItem,
  type FormulaDiagnostic,
  type FormulaNames,
  type FormulaReference,
  type FormulaTableNames,
} from "./formula-analysis.js";
import { RANGE_FILL_ALPHA, referenceColor } from "./formula-colors.js";
import { boxIn, layerParent, type MirrorMark, TextMirror } from "./formula-mirror.js";
import { formulaEntry, formulaTokens } from "./formula-syntax.js";
import { storeFunctions } from "./functions/registry.js";
import { argumentLabel, signature } from "./functions/signature.js";
import type { FormulaFunctionMetadata } from "./functions/types.js";
import { sheetNameKey } from "./name-key.js";
import { storeEngine } from "./store/engine-registry.js";
import type { FormulaPreview, FormulaPreviewValue } from "./store/formula-preview-result.js";
import { checkStylePart } from "./style-parts.js";
import type { CellAddress, HighlightRange, SheetId } from "./types/coordinates.js";
import type { Theme } from "./types/render.js";
import type { Store } from "./types/store.js";

/** The text fields formula help works in: the cell editor and the formula bar. */
export type FormulaEditorElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * What formula help needs from the grid. Deliberately small, so the built-in
 * editors stay thin defaults over public grid methods.
 */
export interface AssistDeps {
  /**
   * Paint (or, with `null`, clear) the ranges referenced by the formula being
   * edited. Backed by `Grid.highlightCells`; per-range color is honored.
   */
  highlightCells: (ranges: HighlightRange[] | null) => void;
  /** Sheet id the formula's unqualified references resolve against (the active sheet). */
  sheet: () => SheetId;
  /** The data address of the cell being edited, which the result preview evaluates in. */
  cell: () => Readonly<CellAddress> | null;
  /** The store whose sheets and functions the formula uses. */
  store: Store;
}

/** The ARIA a text field gets while it controls the function list. */
const FIELD_ATTRIBUTES = [
  "role",
  "aria-autocomplete",
  "aria-expanded",
  "aria-controls",
  "aria-activedescendant",
  "aria-describedby",
  "aria-invalid",
] as const;

let helpSerial = 0;

/** The pause after the last keystroke before the result preview calculates. */
const PREVIEW_DELAY_MS = 120;
/** Characters of a text result the preview shows before it shortens it. */
const PREVIEW_TEXT_CHARS = 80;
/** Significant digits of a number in the preview, as the grid shows them. */
const PREVIEW_DIGITS = 15;

function previewValueText(value: FormulaPreviewValue): string {
  if (value === null) return "0";
  if (typeof value === "number") return String(Number(value.toPrecision(PREVIEW_DIGITS)));
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return value.error;

  const shown =
    value.length > PREVIEW_TEXT_CHARS ? `${value.slice(0, PREVIEW_TEXT_CHARS)}…` : value;
  return `"${shown}"`;
}

/** The preview line for a result; empty when there is nothing to show. */
function previewLine(preview: FormulaPreview): string {
  switch (preview.status) {
    case "value":
      return `= ${previewValueText(preview.value)}`;
    case "array":
      return `= ${previewValueText(preview.first)} … (${preview.rows} × ${preview.cols} array)`;
    case "unavailable":
      switch (preview.reason) {
        case "unsafe-function":
          return "No preview: this formula calls a function that runs only in the cell.";
        case "cost-limit":
          return "No preview: this formula is too large to calculate while you type.";
        case "loading":
          return "No preview yet: the cells it reads are still loading.";
        case "syntax":
          return "";
      }
  }
}
/**
 * Errors to show now. An error that only says the formula is not finished
 * waits while the caret is at the end of the text, where the user is still
 * typing it.
 */
function shownDiagnostics(
  diagnostics: readonly FormulaDiagnostic[],
  cursor: number,
  length: number,
): FormulaDiagnostic[] {
  return diagnostics.filter((diagnostic) => !diagnostic.incomplete || cursor !== length);
}

function sameMatches(
  left: readonly FormulaCompletionItem[],
  right: readonly FormulaCompletionItem[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item.kind === right[index]?.kind && item.name === right[index].name)
  );
}

/** A change that fixes a live error, offered under it in the guide. */
interface FormulaFix {
  /** The button's text, such as `Did you mean SUM?`. */
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

/** Most edits between a typed name and a known name that a fix suggests. */
const MAX_FIX_EDITS = 2;

/**
 * Edits that turn `left` into `right`: a character added, removed or
 * changed, or two neighbours swapped. Stops counting past `limit`.
 */
function editDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let before: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    let smallest = row;
    for (let col = 1; col <= right.length; col++) {
      const same = left[row - 1] === right[col - 1];
      let cost = Math.min(
        (previous[col] ?? 0) + 1,
        (current[col - 1] ?? 0) + 1,
        (previous[col - 1] ?? 0) + (same ? 0 : 1),
      );
      if (row > 1 && col > 1 && left[row - 1] === right[col - 2] && left[row - 2] === right[col - 1]) {
        cost = Math.min(cost, (before[col - 2] ?? 0) + 1);
      }
      current.push(cost);
      smallest = Math.min(smallest, cost);
    }
    if (smallest > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[right.length] ?? limit + 1;
}

/** The name in `candidates` nearest to `typed`, ignoring case, within {@link MAX_FIX_EDITS}; null when none. */
function nearestName(typed: string, candidates: Iterable<string>): string | null {
  const key = typed.toUpperCase();
  let nearest: string | null = null;
  let edits = MAX_FIX_EDITS + 1;
  for (const candidate of candidates) {
    const distance = editDistance(key, candidate.toUpperCase(), edits - 1);
    if (distance < edits && distance > 0) {
      nearest = candidate;
      edits = distance;
    }
  }
  // A one-letter name is too short to guess from.
  return key.length > 1 ? nearest : null;
}

/**
 * Bare names that no defined name or table has but one comes within two
 * edits of, each a diagnostic with the fix that names the near one. A name
 * that ends the text is still being typed, so it waits like a missing `)`.
 * A formula with `LET` or `LAMBDA` names its own values, so it has none.
 */
function misspelledNames(
  text: string,
  analysis: FormulaAnalysis,
  names: FormulaNames,
): Map<FormulaDiagnostic, FormulaFix> {
  const fixes = new Map<FormulaDiagnostic, FormulaFix>();
  const known = [...names.names, ...names.tables.map((table) => table.name)];
  if (known.length === 0) return fixes;
  const keys = new Set(known.map((name) => name.toUpperCase()));
  for (const token of analysis.tokens) {
    if (token.kind !== "function") continue;
    const called = text.slice(token.from, token.to).toUpperCase();
    if (called === "LET" || called === "LAMBDA") return fixes;
  }
  for (const token of analysis.tokens) {
    const name = text.slice(token.from, token.to);
    if (token.kind !== "name" || keys.has(name.toUpperCase()) || text.charAt(token.to) === "[") {
      continue;
    }
    const near = nearestName(name, known);
    if (near === null) continue;
    const diagnostic: FormulaDiagnostic = {
      from: token.from,
      to: token.to,
      message: `${name} is not a defined name. The cell shows #NAME?.`,
      incomplete: token.to === text.length,
    };
    fixes.set(diagnostic, { label: `Did you mean ${near}?`, ...token, insert: near });
  }
  return fixes;
}

/**
 * The fix of a syntax error or an unknown function: the missing `)` at the
 * end, as Enter adds them; a `)` that closes nothing removed; a function name
 * within two edits of a known one. Null when the error has no one clear fix.
 */
function syntaxFix(
  text: string,
  diagnostic: FormulaDiagnostic,
  functions: readonly FormulaFunctionMetadata[],
): FormulaFix | null {
  const { from, to } = diagnostic;
  if (diagnostic.incomplete) {
    const entry = formulaEntry(text);
    if (typeof entry !== "string" || entry === text) return null;
    const end = text.trimEnd().length;
    const insert = entry.slice(end);
    const label = insert.length === 1 ? "Add the missing )" : `Add the ${insert.length} missing )`;
    return { label, from: end, to: text.length, insert };
  }
  if (text.slice(from, to) === ")") {
    let open = 0;
    for (const token of formulaTokens(text.slice(0, from))) {
      if (token.kind === "lparen") open += 1;
      else if (token.kind === "rparen") open -= 1;
    }
    return open === 0 ? { label: "Remove the extra )", from, to, insert: "" } : null;
  }
  if (text.charAt(to) !== "(") return null;
  const near = nearestName(
    text.slice(from, to),
    functions.map((fn) => fn.name),
  );
  return near === null ? null : { label: `Did you mean ${near}?`, from, to, insert: near };
}

/**
 * The defined names a formula on `sheet` sees, the workbook's tables, and
 * the table that holds `cell`, for the completion list.
 */
function formulaNames(store: Store, sheet: SheetId, cell: Readonly<CellAddress> | null): FormulaNames {
  const workbook = store.getWorkbook();
  const names = new Set<string>();
  for (const defined of workbook.namedRanges ?? []) {
    if (defined.scope === undefined || defined.scope === sheet) names.add(defined.name);
  }
  const tables: FormulaTableNames[] = [];
  let cellTable: string | undefined;
  for (const entry of workbook.sheets) {
    for (const table of entry.tables ?? []) {
      tables.push({ name: table.name, columns: table.columns.map((column) => column.name) });
      const { range } = table;
      if (
        cell !== null &&
        range.sheet === cell.sheet &&
        cell.row >= range.start.row &&
        cell.row <= range.end.row &&
        cell.col >= range.start.col &&
        cell.col <= range.end.col
      ) {
        cellTable = table.name;
      }
    }
  }
  return { names: [...names], tables, ...(cellTable === undefined ? {} : { cellTable }) };
}

/** `NAME(a, b, ...)` with the argument at `active` in bold. */
function signatureLine(fn: FormulaFunctionMetadata, active: number | null): HTMLElement {
  const line = document.createElement("div");
  line.className = "sheetwrite-formula-signature";
  line.append(`${fn.name}(`);

  const current = active === null ? undefined : argumentOf(fn, active);
  fn.arguments.forEach((argument, index) => {
    if (index > 0) line.append(", ");
    const label = argumentLabel(argument);
    if (argument !== current) {
      line.append(label);
      return;
    }

    const strong = document.createElement("strong");
    strong.textContent = label;
    line.append(strong);
  });

  line.append(")");
  return line;
}

function textLine(className: string, text: string): HTMLElement {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  return line;
}

/** Formula help bound to one editor field at a time. */
export class FormulaHelp {
  private readonly deps: AssistDeps;
  private readonly id: string;
  private field: FormulaEditorElement | null = null;
  private functions: readonly FormulaFunctionMetadata[] = [];
  /** The defined names and tables the list offers, read when the field is attached. */
  private names: FormulaNames = { names: [], tables: [] };

  private layer: HTMLDivElement | null = null;
  private guide: HTMLDivElement | null = null;
  private list: HTMLDivElement | null = null;
  private preview: HTMLDivElement | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private mirror: TextMirror | null = null;
  /** The text the guide shows now, so an unchanged guide is not announced again. */
  private guideText = "";

  private completion: FormulaCompletion | null = null;
  private activeIndex = 0;
  /** The text at which Escape closed the list; the list stays closed until the text changes. */
  private dismissedText: string | null = null;
  /** The call at the caret and the errors shown, which the guide reads. */
  private call: FormulaCall | null = null;
  private diagnostics: readonly FormulaDiagnostic[] = [];
  /** The fix of the first error shown, which the guide offers and Tab applies. */
  private fix: FormulaFix | null = null;

  constructor(deps: AssistDeps) {
    helpSerial += 1;
    this.deps = deps;
    this.id = `sheetwrite-formula-help-${helpSerial}`;
  }

  get isOpen(): boolean {
    return this.completion !== null;
  }

  /** Bind to `field`, read the store's function list, and show help for its text. */
  attach(field: FormulaEditorElement, theme: Theme | null): void {
    this.detach();
    this.field = field;
    this.names = formulaNames(this.deps.store, this.deps.sheet(), this.deps.cell());
    this.mountLayer(field, theme);
    field.setAttribute("aria-autocomplete", "list");
    if (field instanceof HTMLInputElement) {
      field.setAttribute("role", "combobox");
      field.setAttribute("aria-expanded", "false");
    }
    field.addEventListener("scroll", this.onScroll);
    document.addEventListener("selectionchange", this.onSelectionChange);
    this.update();

    // Host functions can change between edits, so every edit reads the list.
    storeFunctions(this.deps.store).then(
      (functions) => {
        if (this.field !== field) return;
        this.functions = functions;
        this.update();
      },
      (error: unknown) => {
        // Help without names still shows references and syntax errors.
        console.warn("Sheetwrite: formula help could not read the function list", error);
      },
    );
  }

  /** Remove the help, the reference colours and the field's ARIA. */
  detach(): void {
    const field = this.field;
    if (field === null) return;

    this.cancelPreview();
    field.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("selectionchange", this.onSelectionChange);
    for (const name of FIELD_ATTRIBUTES) field.removeAttribute(name);
    this.mirror?.remove();
    this.layer?.remove();
    this.deps.highlightCells(null);

    this.field = null;
    this.mirror = null;
    this.layer = null;
    this.guide = null;
    this.list = null;
    this.preview = null;
    this.guideText = "";
    this.completion = null;
    this.dismissedText = null;
  }

  /** Show help for the field's current text and caret. */
  update(): void {
    const field = this.field;
    if (field === null) return;

    const text = field.value;
    if (!text.startsWith("=")) {
      this.clear();
      return;
    }

    const cursor = field.selectionStart ?? text.length;
    const analysis = analyzeFormula(text, cursor, this.functions, this.names);
    const nameFixes = misspelledNames(text, analysis, this.names);
    const diagnostics = shownDiagnostics(
      [...analysis.diagnostics, ...nameFixes.keys()].sort((left, right) => left.from - right.from),
      cursor,
      text.length,
    );
    if (this.dismissedText !== null && this.dismissedText !== text) this.dismissedText = null;

    this.paintReferences(analysis.references);
    this.paintText(field, text, analysis.references, diagnostics);
    this.showCompletion(this.dismissedText === null ? analysis.completion : null);
    this.call = analysis.call;
    this.diagnostics = diagnostics;
    const first = diagnostics[0];
    this.fix =
      first === undefined ? null : (nameFixes.get(first) ?? syntaxFix(text, first, this.functions));
    this.showGuide();
    this.schedulePreview(text, analysis.diagnostics.length === 0);
    field.setAttribute("aria-invalid", diagnostics.length > 0 ? "true" : "false");
    this.reposition();
  }

  /**
   * Keys that drive the open function list, and Tab, which applies the fix
   * the guide offers while the list is closed. Returns true only when help
   * used the key, so the editor's own Enter, Tab and Escape still work.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.completion === null) {
      const fix = this.fix;
      if (event.key !== "Tab" || event.shiftKey || fix === null) return false;
      event.preventDefault();
      this.applyFix(fix);
      return true;
    }

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        this.move(event.key === "ArrowDown" ? 1 : -1);
        return true;
      case "Enter":
      case "Tab":
        event.preventDefault();
        this.accept();
        return true;
      case "Escape":
        event.preventDefault();
        this.dismissedText = this.field?.value ?? null;
        this.update();
        return true;
      default:
        return false;
    }
  }

  /** Follow the field after it moves (scroll, resize). */
  reposition(): void {
    const field = this.field;
    const layer = this.layer;
    if (field === null || layer === null) return;

    const box = boxIn(field, layerParent(field));
    layer.style.left = `${box.left}px`;
    layer.style.top = `${box.top + box.height}px`;
    layer.style.minWidth = `${box.width}px`;
    this.mirror?.sync();
  }

  private readonly onScroll = (): void => {
    this.mirror?.sync();
  };

  private readonly onSelectionChange = (): void => {
    if (this.field !== null && document.activeElement === this.field) this.update();
  };

  /** The layer under the field that holds the guide and the function list. */
  private mountLayer(field: FormulaEditorElement, theme: Theme | null): void {
    const layer = document.createElement("div");
    layer.className = "sheetwrite-formula-help";
    if (theme !== null) {
      layer.style.setProperty("--sheetwrite-assist-bg", theme.bg);
      layer.style.setProperty("--sheetwrite-assist-fg", theme.fg);
      layer.style.setProperty("--sheetwrite-assist-border", theme.selectionBorder);
      layer.style.setProperty("--sheetwrite-assist-selected", theme.selection);
    }

    // The guide is a live region from the start, so its first text is announced.
    const guide = document.createElement("div");
    guide.className = "sheetwrite-formula-guide";
    guide.id = `${this.id}-guide`;
    guide.setAttribute("role", "status");
    // The preview is not a live region: it changes on every keystroke.
    const preview = document.createElement("div");
    preview.className = "sheetwrite-formula-preview";
    preview.id = `${this.id}-preview`;
    layer.append(guide, preview);
    field.setAttribute("aria-describedby", `${guide.id} ${preview.id}`);

    layerParent(field).appendChild(layer);
    checkStylePart(layer, "formula-help", "Formula help");
    this.layer = layer;
    this.guide = guide;
    this.preview = preview;
  }

  /**
   * Calculates the result preview once typing pauses. A formula with a
   * problem has no preview; its error is in the guide instead.
   */
  private schedulePreview(text: string, complete: boolean): void {
    this.cancelPreview();
    if (!complete) {
      this.showPreview("");
      return;
    }

    this.previewTimer = setTimeout(() => {
      this.previewTimer = undefined;
      const engine = storeEngine(this.deps.store);
      const cell = this.deps.cell();
      if (this.field?.value !== text || engine === null || cell === null) return;

      this.showPreview(previewLine(engine.previewFormula(cell, text)));
    }, PREVIEW_DELAY_MS);
  }

  private cancelPreview(): void {
    if (this.previewTimer === undefined) return;

    clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
  }

  private showPreview(line: string): void {
    if (this.preview !== null && this.preview.textContent !== line) this.preview.textContent = line;
  }

  private clear(): void {
    this.deps.highlightCells(null);
    this.mirror?.remove();
    this.mirror = null;
    this.cancelPreview();
    this.showPreview("");
    this.showCompletion(null);
    this.call = null;
    this.diagnostics = [];
    this.showGuide();
    this.field?.removeAttribute("aria-invalid");
  }

  /** Fill each referenced range on the grid with its reference's colour. */
  private paintReferences(references: readonly FormulaReference[]): void {
    const ranges: HighlightRange[] = [];
    for (const reference of references) {
      const sheet = reference.sheet === null ? this.deps.sheet() : this.sheetNamed(reference.sheet);
      if (sheet === null) continue;

      const color = `${referenceColor(reference)}${RANGE_FILL_ALPHA}`;
      ranges.push({ sheet, start: reference.start, end: reference.end, color });
    }

    this.deps.highlightCells(ranges.length > 0 ? ranges : null);
  }

  private sheetNamed(name: string): SheetId | null {
    const key = sheetNameKey(name);
    const sheet = this.deps.store
      .getWorkbook()
      .sheets.find((entry) => sheetNameKey(entry.name) === key);
    return sheet?.id ?? null;
  }

  private paintText(
    field: FormulaEditorElement,
    text: string,
    references: readonly FormulaReference[],
    diagnostics: readonly FormulaDiagnostic[],
  ): void {
    const marks: MirrorMark[] = [
      ...references.map((reference) => ({ ...reference, color: referenceColor(reference) })),
      ...diagnostics.map((diagnostic) => ({ ...diagnostic, error: true })),
    ];
    this.mirror ??= new TextMirror(field);
    this.mirror.render(text, marks);
  }

  private showCompletion(completion: FormulaCompletion | null): void {
    const previous = this.completion;
    this.completion = completion;
    if (completion === null) {
      this.list?.remove();
      this.list = null;
      this.field?.removeAttribute("aria-controls");
      this.field?.removeAttribute("aria-activedescendant");
      if (this.field instanceof HTMLInputElement) this.field.setAttribute("aria-expanded", "false");
      return;
    }

    const unchanged = previous !== null && sameMatches(previous.matches, completion.matches);
    if (unchanged && this.list !== null) return;

    this.activeIndex = 0;
    this.renderList(completion.matches);
  }

  private renderList(matches: readonly FormulaCompletionItem[]): void {
    const field = this.field;
    if (field === null || this.layer === null) return;

    const list = this.list ?? document.createElement("div");
    list.className = "sheetwrite-assist";
    list.id = `${this.id}-list`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Formula AutoComplete");
    list.replaceChildren(
      ...matches.map((item, index) => {
        const option = document.createElement("div");
        option.className = "sheetwrite-assist-item";
        option.id = `${this.id}-option-${index}`;
        option.setAttribute("role", "option");
        option.dataset.kind = item.kind;
        option.title = item.description;
        // Excel writes an argument's value and its meaning on one line: `FALSE - Exact match`.
        option.textContent =
          item.kind === "choice" ? `${item.name} - ${item.description}` : item.name;

        // mousedown, not click, so the pick lands before the field blurs.
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          this.activeIndex = index;
          this.accept();
        });
        return option;
      }),
    );
    if (this.list === null) this.layer.append(list);
    this.list = list;

    field.setAttribute("aria-controls", list.id);
    if (field instanceof HTMLInputElement) field.setAttribute("aria-expanded", "true");
    this.renderActive();
  }

  private move(delta: number): void {
    const count = this.completion?.matches.length ?? 0;
    if (count === 0) return;

    this.activeIndex = (this.activeIndex + delta + count) % count;
    this.renderActive();
    this.showGuide();
  }

  private renderActive(): void {
    const list = this.list;
    if (list === null) return;

    for (const [index, option] of [...list.children].entries()) {
      option.setAttribute("aria-selected", index === this.activeIndex ? "true" : "false");
    }

    const active = list.children[this.activeIndex];
    if (active instanceof HTMLElement) {
      this.field?.setAttribute("aria-activedescendant", active.id);
      if (typeof active.scrollIntoView === "function") active.scrollIntoView({ block: "nearest" });
    }
  }

  /** Replace the text at the caret with the active item; a function opens its call. */
  private accept(): void {
    const field = this.field;
    const completion = this.completion;
    const item = completion?.matches[this.activeIndex];
    if (field === null || completion === null || item === undefined) return;

    const text = field.value;
    // A function before an existing `(` keeps it; the caret goes after it either way.
    const opened = item.kind === "function" && text.charAt(completion.to) === "(";
    const insert = opened ? item.name : item.insert;
    const caret = completion.from + insert.length + (opened ? 1 : 0);
    field.value = `${text.slice(0, completion.from)}${insert}${text.slice(completion.to)}`;
    field.setSelectionRange(caret, caret);
    field.focus();

    // The editor and the formula bar react to input: drafts, point mode, help.
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Make the change `fix` names; the caret goes after the changed text. */
  private applyFix(fix: FormulaFix): void {
    const field = this.field;
    if (field === null) return;

    const text = field.value;
    const caret = fix.from + fix.insert.length;
    field.value = `${text.slice(0, fix.from)}${fix.insert}${text.slice(fix.to)}`;
    field.setSelectionRange(caret, caret);
    field.focus();
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * The guide shows the active function in the open list, else the call at
   * the caret with its current argument in bold, then the first error and
   * the button that fixes it.
   */
  private showGuide(): void {
    const guide = this.guide;
    if (guide === null) return;

    const call = this.call;
    const listed = this.completion?.matches[this.activeIndex]?.function;
    const fn = listed ?? call?.function;
    const active = listed === undefined ? (call?.argumentIndex ?? null) : null;
    const error = this.diagnostics[0]?.message;
    const fix = this.fix;

    const lines: HTMLElement[] = [];
    if (fn !== undefined) {
      lines.push(signatureLine(fn, active));
      lines.push(textLine("sheetwrite-formula-description", fn.description));
    }
    if (error !== undefined) lines.push(textLine("sheetwrite-formula-error", error));
    if (fix !== null) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sheetwrite-formula-fix";
      button.textContent = fix.label;
      button.title = "Tab";
      // mousedown, not click, so the fix lands before the field blurs.
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.applyFix(fix);
      });
      lines.push(button);
    }

    const key = `${fn === undefined ? "" : signature(fn)}|${active ?? ""}|${error ?? ""}|${fix === null ? "" : `${fix.label}@${fix.from}`}`;
    if (key === this.guideText) return;

    this.guideText = key;
    guide.replaceChildren(...lines);
  }
}
