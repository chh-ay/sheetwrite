// Formula help in a formula editor: the function list as you type, the
// argument guide, live errors and coloured references. This module is a chunk
// of its own: formula-assist.ts loads it on the first formula edit, so a grid
// that never edits a formula never downloads it or the function table. Every
// feature reads one `analyzeFormula` result.

import {
  analyzeFormula,
  argumentOf,
  type FormulaAnalysis,
  type FormulaCall,
  type FormulaCompletion,
  type FormulaDiagnostic,
  type FormulaReference,
} from "./formula-analysis.js";
import { RANGE_FILL_ALPHA, referenceColor } from "./formula-colors.js";
import { FormulaGhost } from "./formula-ghost.js";
import { boxIn, layerParent, type MirrorMark, TextMirror } from "./formula-mirror.js";
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
  /**
   * Show the suggestions of the store's formula suggester as ghost text: the
   * formula bar does; the cell editor keeps Excel's AutoComplete instead.
   */
  suggestions?: boolean;
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
  left: readonly FormulaFunctionMetadata[],
  right: readonly FormulaFunctionMetadata[],
): boolean {
  return left.length === right.length && left.every((fn, index) => fn === right[index]);
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

/** Fill alpha of the ranges a suggestion names: fainter than typed references until it is taken. */
const GHOST_FILL_ALPHA = "22";
/** A suggestion is announced to screen readers once it has held this long, not on every key. */
const ANNOUNCE_DELAY_MS = 400;

/** Formula help bound to one editor field at a time. */
export class FormulaHelp {
  private readonly deps: AssistDeps;
  private readonly id: string;
  private field: FormulaEditorElement | null = null;
  private functions: readonly FormulaFunctionMetadata[] = [];

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
  /** Ghost text from the store's formula suggester, in fields that show suggestions. */
  private ghost: FormulaGhost | null = null;
  /** The analysis of the field's text at its last update, which the ghost's keys read. */
  private analysis: FormulaAnalysis | null = null;
  /** Tells screen readers about a suggestion once it has held for `ANNOUNCE_DELAY_MS`. */
  private ghostStatus: HTMLDivElement | null = null;
  private announceTimer: ReturnType<typeof setTimeout> | undefined;
  private announced = "";

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
    this.mountLayer(field, theme);
    if (this.deps.suggestions === true) {
      this.ghost = new FormulaGhost({
        store: this.deps.store,
        cell: this.deps.cell,
        functions: () => this.functions,
      });
      const status = document.createElement("div");
      status.className = "sheetwrite-formula-ghost-status";
      status.setAttribute("role", "status");
      this.layer?.append(status);
      this.ghostStatus = status;
    }
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
    this.ghost?.close();
    clearTimeout(this.announceTimer);
    this.ghostStatus = null;
    this.announced = "";
    this.ghost = null;
    this.analysis = null;
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
    const analysis = analyzeFormula(text, cursor, this.functions);
    this.analysis = analysis;
    const diagnostics = shownDiagnostics(analysis.diagnostics, cursor, text.length);
    if (this.dismissedText !== null && this.dismissedText !== text) this.dismissedText = null;
    const collapsed = field.selectionStart === field.selectionEnd;
    const ghost = this.ghost?.update(text, collapsed ? cursor : -1, analysis) ?? null;

    this.announce(ghost?.text ?? "");
    const painted =
      ghost === null ? analysis : analyzeFormula(text + ghost.text, text.length, this.functions);
    this.paintReferences(painted.references, text.length);
    this.paintText(field, text, analysis.references, diagnostics, ghost?.text ?? "");
    this.showCompletion(this.dismissedText === null ? analysis.completion : null);
    if (ghost !== null && ghost.listIndex !== null && this.completion !== null) {
      this.activeIndex = ghost.listIndex;
      this.renderActive();
    }
    this.call = analysis.call;
    this.diagnostics = diagnostics;
    this.showGuide();
    this.schedulePreview(text, analysis.diagnostics.length === 0);
    field.setAttribute("aria-invalid", diagnostics.length > 0 ? "true" : "false");
    this.reposition();
  }

  /**
   * Keys that drive the open function list. Returns true only when the list
   * used the key, so the editor's own Enter, Tab and Escape still work while
   * the list is closed.
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.completion === null) return this.ghostKey(event);

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
        if (this.field !== null) this.ghost?.dismiss(this.field.value);
        this.dismissedText = this.field?.value ?? null;
        this.update();
        return true;
      default:
        return false;
    }
  }

  /** The ghost's keys, while the function list is closed and the caret is at the end of the text. */
  private ghostKey(event: KeyboardEvent): boolean {
    const field = this.field;
    const analysis = this.analysis;
    if (this.ghost === null || field === null || analysis === null) return false;

    const text = field.value;
    if (field.selectionStart !== text.length || field.selectionEnd !== text.length) return false;
    const next = this.ghost.keyDown(event, text, analysis);
    if (next === null) return false;

    event.preventDefault();
    if (next === text) {
      this.update();
      return true;
    }
    field.value = next;
    field.setSelectionRange(next.length, next.length);
    // The editor and the formula bar react to input: drafts, sizing, help.
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  /** Announce `ghost` once it has held for a moment; a cleared ghost clears the status at once. */
  private announce(ghost: string): void {
    clearTimeout(this.announceTimer);
    const status = this.ghostStatus;
    if (status === null || ghost === this.announced) return;
    if (ghost === "") {
      this.announced = "";
      status.textContent = "";
      return;
    }
    this.announceTimer = setTimeout(() => {
      this.announced = ghost;
      status.textContent = `Suggestion: ${ghost}. Tab to accept.`;
    }, ANNOUNCE_DELAY_MS);
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
    this.ghost?.hide();
    this.announce("");
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

  /**
   * Fill each referenced range on the grid with its reference's colour; the
   * ranges a suggestion names, from `suggestedFrom` on, more faintly.
   */
  private paintReferences(references: readonly FormulaReference[], suggestedFrom: number): void {
    const ranges: HighlightRange[] = [];
    for (const reference of references) {
      const sheet = reference.sheet === null ? this.deps.sheet() : this.sheetNamed(reference.sheet);
      if (sheet === null) continue;

      const alpha = reference.from >= suggestedFrom ? GHOST_FILL_ALPHA : RANGE_FILL_ALPHA;
      const color = `${referenceColor(reference)}${alpha}`;
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
    ghost: string,
  ): void {
    const marks: MirrorMark[] = [
      ...references.map((reference) => ({ ...reference, color: referenceColor(reference) })),
      ...diagnostics.map((diagnostic) => ({ ...diagnostic, error: true })),
    ];
    this.mirror ??= new TextMirror(field);
    this.mirror.render(text, marks, ghost);
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

  private renderList(matches: readonly FormulaFunctionMetadata[]): void {
    const field = this.field;
    if (field === null || this.layer === null) return;

    const list = this.list ?? document.createElement("div");
    list.className = "sheetwrite-assist";
    list.id = `${this.id}-list`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Functions");
    list.replaceChildren(
      ...matches.map((fn, index) => {
        const option = document.createElement("div");
        option.className = "sheetwrite-assist-item";
        option.id = `${this.id}-option-${index}`;
        option.setAttribute("role", "option");
        option.title = fn.description;
        option.textContent = fn.name;

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

  /** Replace the name at the caret with the active function and open its call. */
  private accept(): void {
    const field = this.field;
    const completion = this.completion;
    const fn = completion?.matches[this.activeIndex];
    if (field === null || completion === null || fn === undefined) return;

    const text = field.value;
    const hasParenthesis = text.charAt(completion.to) === "(";
    const caret = completion.from + fn.name.length + 1;
    field.value = `${text.slice(0, completion.from)}${fn.name}${hasParenthesis ? "" : "("}${text.slice(completion.to)}`;
    field.setSelectionRange(caret, caret);
    field.focus();

    // The editor and the formula bar react to input: drafts, point mode, help.
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * The guide shows the active function in the open list, else the call at
   * the caret with its current argument in bold, then the first error.
   */
  private showGuide(): void {
    const guide = this.guide;
    if (guide === null) return;

    const call = this.call;
    const listed = this.completion?.matches[this.activeIndex];
    const fn = listed ?? call?.function;
    const active = listed === undefined ? (call?.argumentIndex ?? null) : null;
    const error = this.diagnostics[0]?.message;

    const lines: HTMLElement[] = [];
    if (fn !== undefined) {
      lines.push(signatureLine(fn, active));
      lines.push(textLine("sheetwrite-formula-description", fn.description));
    }
    if (error !== undefined) lines.push(textLine("sheetwrite-formula-error", error));

    const key = `${fn === undefined ? "" : signature(fn)}|${active ?? ""}|${error ?? ""}`;
    if (key === this.guideText) return;

    this.guideText = key;
    guide.replaceChildren(...lines);
  }
}
