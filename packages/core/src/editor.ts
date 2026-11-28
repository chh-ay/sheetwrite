import { cellPadding } from "./canvas-paint.js";
import {
  EDIT_SURFACE_ATTRIBUTE,
  type EditorFieldMetrics,
  editorLineCount as lineCount,
  editorTextareaHeight,
  insertEditorLineBreak,
  MAX_VISIBLE_EDITOR_LINES,
  readEditorFieldMetrics,
} from "./editor-textarea.js";
import { FormulaAssist } from "./formula-assist.js";
import type { AssistDeps } from "./formula-help.js";
import { toggleReferenceAnchors } from "./formula-references.js";
import { type FormulaDiagnostic, formulaEntry } from "./formula-syntax.js";
import type { CellAlign, CellFormat } from "./types/cell.js";
import type { CellMode } from "./types/grid.js";
import type { Theme } from "./types/render.js";

export type { AssistDeps };

/** Room the caret takes past a line's last glyph, in CSS pixels. */
const CARET_WIDTH = 2;

/**
 * Where the active cell goes after a commit. Enter (`down`, `up`) and Tab
 * (`right`, `left`) move within a selection of several cells; an arrow key
 * (`arrow-*`) leaves it; `stay` is Ctrl+Enter, which also fills the selection.
 */
export type EditNavigate =
  | "down"
  | "up"
  | "right"
  | "left"
  | "arrow-down"
  | "arrow-up"
  | "arrow-right"
  | "arrow-left"
  | "stay"
  | "none";

/** Row step, column step and commit direction of each arrow key. */
const ARROW_STEPS: Readonly<Record<string, readonly [number, number, EditNavigate]>> = {
  ArrowDown: [1, 0, "arrow-down"],
  ArrowUp: [-1, 0, "arrow-up"],
  ArrowRight: [0, 1, "arrow-right"],
  ArrowLeft: [0, -1, "arrow-left"],
};

/** Text before the caret after which an arrow key points at a cell, as in Excel. */
const POINTABLE = /[=(,;+\-*/^&<>:]$/;

/** Excel's AutoComplete for one edit (`autocomplete.ts`), with its list of matching entries. */
export interface EditCompletion {
  /**
   * After each change to the text, list the entries that begin it. When
   * `typed` (a typed character, the key that opened the editor, or an IME
   * composition that ended), also complete the text in place with the added
   * text selected. Returns the entry the text then shows, or null.
   */
  complete(field: HTMLTextAreaElement, typed: boolean): string | null;
  /**
   * A key pressed in the editor; true when the list used it. Enter and Tab
   * in the list put its entry in the field and return false, so the editor
   * commits the entry as usual.
   */
  keyDown(event: KeyboardEvent, field: HTMLTextAreaElement): boolean;
  /** Follow the field after it moves. */
  reposition(field: HTMLTextAreaElement): void;
  /** Remove the list: the edit ended. */
  close(): void;
}

export interface EditRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How the edited cell looks, which the editor keeps while it is open, as
 * Excel's in-cell editor does: the text's alignment, its CSS font and
 * colour, and its underline or strikethrough.
 */
export interface EditorLook {
  readonly align: CellAlign;
  readonly font: string;
  readonly color: string;
  readonly decoration: string;
  /** Space between the text and the cell's left and right gridlines, as the cell paints it at the zoom. */
  readonly pad: number;
}

/**
 * Put on the declarations of `look` that differ from what `.sheetwrite-editor`
 * (grid.css) already gives the editor: the theme's font and colour, left
 * alignment, no decoration and the cell padding at zoom 1.
 */
function write_look(style: CSSStyleDeclaration, look: EditorLook, theme: Theme): void {
  if (look.font !== theme.font) style.font = look.font;
  if (look.color !== theme.fg) style.color = look.color;
  if (look.align !== "left") style.textAlign = look.align;
  if (look.decoration !== "none") style.textDecoration = look.decoration;
  if (look.pad !== cellPadding(1)) style.setProperty("--sheetwrite-cell-pad", `${look.pad}px`);
}

export interface BeginEditOptions {
  row: number;
  col: number;
  type: CellFormat;
  initial: string;
  /** Select the whole text when the editor opens; otherwise the caret goes to the end. */
  selectAll: boolean;
  /**
   * Excel's Enter mode: typing opened the editor, so arrow keys commit and
   * move, or point at cells in a formula. False is Edit mode (F2, double-click),
   * where arrows move the caret. F2 switches between the two.
   */
  entering: boolean;
  rect: EditRect;
  /** Accessible name derived from the semantic or positional column header. */
  label: string;
  theme: Theme;
  /** The cell's look; without it the editor shows the theme's font, left-aligned. */
  look?: EditorLook;
  /**
   * Focus the editor. False opens it as the cell's view of a draft that
   * another edit surface, such as a formula bar, is typing; it takes focus
   * only when the user moves into it.
   */
  focus: boolean;
  onCommit: (value: string, navigate: EditNavigate) => void;
  onCancel: () => void;
  /** Every change the user makes to the text: typing, paste, IME, undo, a picked reference. */
  onText: (value: string) => void;
  /** Runs a host command bound to this key combination; true when one ran. */
  onShortcut?: (event: KeyboardEvent) => boolean;
  /** An arrow key in Enter mode points from the last pointed cell by (`dRow`, `dCol`); Shift extends. */
  onPoint?: (dRow: number, dCol: number, extend: boolean) => void;
  /**
   * Excel's AutoComplete, asked after each change to the text, and given the
   * keys first.
   */
  complete?: EditCompletion;
  /** The editor's cell mode changed: Enter, Edit, or Point after a picked reference. */
  onMode?: (mode: EditorMode) => void;
  /**
   * Excel refuses to store a formula that does not parse: show `message`,
   * which explains the problem, and resolve once the user has closed it.
   * The edit stays open meanwhile.
   */
  onRefuse?: (message: string) => Promise<void>;
}

/** What the textarea's last sizing depended on; equal inputs give the same height. */
interface EditorSizing {
  readonly width: string;
  readonly minimumHeight: number;
  /** Explicit lines of the text when it was sized. */
  readonly lines: number;
}

/** The cell modes of an open text editor. */
export type EditorMode = Exclude<CellMode, "ready">;

/** Whether focus moving to `target` keeps the edit open in another surface. */
function is_edit_surface(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${EDIT_SURFACE_ATTRIBUTE}]`) !== null;
}

/** Whether `event` typed text, not deleted, pasted or composed it. */
function typed_text(event: Event): boolean {
  return event instanceof InputEvent && !event.isComposing && event.inputType === "insertText";
}

/**
 * Owns Layer 3: a single real `<textarea>` mounted over the active cell only
 * while editing, never recycled — so IME composition and focus survive scroll.
 */
export class EditController {
  private readonly host: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private opts: BeginEditOptions | null = null;
  private composing = false;
  private tearing_down = false;
  private ref_start = -1;
  private ref_end = -1;
  private readonly assist: FormulaAssist | null;
  private assist_attached = false;
  // The textarea's line height and insets: read on the first multi-line sizing
  // of an open, and again only after the line height changes. One line needs
  // none of them, so opening the editor reads no style and no layout.
  private metrics: EditorFieldMetrics | null = null;
  private metrics_line_height = "";
  private sizing: EditorSizing | null = null;
  /** Excel's Enter mode; see {@link BeginEditOptions.entering}. */
  private entering = false;
  /**
   * The entry AutoComplete shows, while the text still reads as it; a commit
   * then stores the entry's own letter case, as Excel does.
   */
  private completion: string | null = null;
  /** The mode `onMode` last reported. */
  private reported_mode: EditorMode | null = null;
  /** A refused formula's message is open: commits and blur wait for it. */
  private refusing = false;
  /** Measures the edited line's width without laying the page out; see {@link reveal_line_end}. */
  private measure_context: CanvasRenderingContext2D | null | undefined;

  constructor(host: HTMLElement, assist?: AssistDeps) {
    this.host = host;
    this.assist = assist ? new FormulaAssist(assist) : null;
  }

  get isEditing(): boolean {
    return this.textarea !== null;
  }

  /** Whether the user is typing in this editor, not in another edit surface. */
  get isFocused(): boolean {
    return this.textarea !== null && document.activeElement === this.textarea;
  }

  /**
   * Excel's cell mode: Point while a picked reference stays replaceable,
   * else Enter or Edit.
   */
  get mode(): EditorMode {
    if (this.ref_start >= 0) return "point";
    return this.entering ? "enter" : "edit";
  }

  private report_mode(): void {
    const mode = this.mode;
    if (this.textarea === null || mode === this.reported_mode) return;
    this.reported_mode = mode;
    this.opts?.onMode?.(mode);
  }

  begin(opts: BeginEditOptions): void {
    this.teardown();

    const ta = document.createElement("textarea");
    ta.className = "sheetwrite-editor";
    ta.value = opts.initial;
    ta.inputMode = opts.type === "number" || opts.type === "currency" ? "decimal" : "text";
    ta.spellcheck = false;
    ta.wrap = "off";
    ta.setAttribute("aria-multiline", "true");
    if (opts.type === "date") ta.placeholder = "yyyy-mm-dd";
    ta.setAttribute("aria-label", opts.label);
    // Cosmetics live in styles.css (`.sheetwrite-editor`). The effective theme
    // (which may come from the `theme` option, not host CSS) is bridged as
    // inline CSS VARIABLES: the stylesheet rule resolves them, and host CSS can
    // still override the rule without `!important`.
    ta.style.setProperty("--sheetwrite-selection-border", opts.theme.selectionBorder);
    ta.style.setProperty("--sheetwrite-font", opts.theme.font);
    ta.style.setProperty("--sheetwrite-fg", opts.theme.fg);
    ta.style.setProperty("--sheetwrite-bg", opts.theme.bg);
    // The cell's own formatting is content, not theme: it goes on inline, as
    // the canvas paints it, so the text does not jump when the edit starts or
    // ends. Only what differs from the stylesheet goes on: inline declarations
    // make the style recalculation that focusing the editor forces slower.
    if (opts.look !== undefined) write_look(ta.style, opts.look, opts.theme);

    this.host.appendChild(ta);
    this.textarea = ta;
    this.opts = opts;
    this.entering = opts.entering;
    this.position(opts.rect);

    ta.addEventListener("compositionstart", this.on_composition_start);
    ta.addEventListener("compositionend", this.on_composition_end);
    ta.addEventListener("keydown", this.on_key_down);
    ta.addEventListener("focus", this.on_focus);
    ta.addEventListener("blur", this.on_blur);
    ta.addEventListener("input", this.on_input);

    if (opts.focus) ta.focus();
    if (opts.selectAll) {
      ta.select();
    } else {
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
      this.reveal_line_end(ta, opts);
    }
    // The key that opened the editor is the first typed character.
    if (opts.focus && opts.entering) this.auto_complete(ta);
    if (opts.focus) this.attach_assist();
    this.report_mode();
  }

  /**
   * Scroll the editor so the caret at the end of a last line wider than the
   * editor shows. Chromium scrolls to the caret when the selection is set;
   * Firefox and WebKit do not. Focusing the editor laid it out, so a focused
   * single line reads its own box at no cost. Otherwise the last line is
   * measured on a canvas, so a line that fits reads no layout; only a wider
   * one costs the layout that setting the scroll needs.
   */
  private reveal_line_end(ta: HTMLTextAreaElement, opts: BeginEditOptions): void {
    const line_start = ta.value.lastIndexOf("\n") + 1;
    const line = ta.value.slice(line_start);
    if (line === "") return;
    if (line_start === 0 && this.isFocused) {
      if (ta.scrollWidth > ta.clientWidth) ta.scrollLeft = ta.scrollWidth;
      return;
    }
    this.measure_context ??= document.createElement("canvas").getContext("2d");
    const context = this.measure_context;
    if (context === null) return;
    context.font = opts.look?.font ?? opts.theme.font;
    // The text box: the cell less the editor's padding and border on each side (grid.css).
    const room = opts.rect.w - 2 * (opts.look?.pad ?? cellPadding(1));
    const overflow = context.measureText(line).width + CARET_WIDTH - room;
    if (overflow > 0) ta.scrollLeft = overflow;
  }

  /**
   * Show `value`, typed in another edit surface, with that surface's caret.
   * Changes nothing while the editor itself has focus: its own text wins.
   */
  setText(value: string, selectionStart: number, selectionEnd: number): void {
    const ta = this.textarea;
    if (!ta || this.isFocused) return;
    if (ta.value !== value) {
      ta.value = value;
      this.ref_start = -1;
      this.completion = null;
      // Mirrored text resizes only when it gains or loses a line, so typing
      // in the other surface lays this one out only at a line break.
      if (this.sizing?.lines !== lineCount(value)) this.resize();
    }
    ta.setSelectionRange(selectionStart, selectionEnd);
    this.report_mode();
  }

  /** Follow the cell. A move that keeps the cell's size only writes the position. */
  position(rect: EditRect): void {
    const ta = this.textarea;
    if (!ta) return;
    ta.style.left = `${rect.x}px`;
    ta.style.top = `${rect.y}px`;
    const width = `${rect.w}px`;
    const sizing = this.sizing;
    if (
      sizing === null ||
      sizing.width !== width ||
      sizing.minimumHeight !== rect.h ||
      sizing.lines !== lineCount(ta.value)
    ) {
      ta.style.width = width;
      const line_height = `${Math.max(1, rect.h - 4)}px`;
      if (line_height !== this.metrics_line_height) {
        ta.style.lineHeight = line_height;
        this.metrics = null;
        this.metrics_line_height = line_height;
      }
      this.size(rect.h);
    }
    this.assist?.reposition();
    this.opts?.complete?.reposition(ta);
  }

  get value(): string {
    return this.textarea?.value ?? "";
  }

  /**
   * Insert (or, while dragging, replace) an A1 reference at the caret — the
   * "point mode" a spreadsheet enters after you type `=`. A formula bar that
   * holds the draft keeps focus; it hears the new text through `onText`.
   */
  setReference(ref: string): void {
    const ta = this.textarea;
    if (!ta) return;
    const start = this.ref_start >= 0 ? this.ref_start : (ta.selectionStart ?? ta.value.length);
    const end = this.ref_start >= 0 ? this.ref_end : (ta.selectionEnd ?? start);
    ta.value = ta.value.slice(0, start) + ref + ta.value.slice(end);
    this.ref_start = start;
    this.ref_end = start + ref.length;
    ta.setSelectionRange(this.ref_end, this.ref_end);
    if (!is_edit_surface(document.activeElement)) ta.focus();
    this.resize();
    if (this.assist_attached) this.assist?.update();
    this.opts?.onText(ta.value);
    this.report_mode();
  }

  /** Finish a reference pick; the next pick inserts fresh at the caret. */
  endReference(): void {
    this.ref_start = -1;
    this.ref_end = -1;
    this.report_mode();
  }

  /** Whether the last change was a picked reference, which the next pick or arrow replaces. */
  get isPointing(): boolean {
    return this.ref_start >= 0;
  }

  /** Whether an arrow key would point at a cell: in a formula, after an operator or a picked reference. */
  private can_point(): boolean {
    const ta = this.textarea;
    if (!ta?.value.startsWith("=")) return false;
    if (this.ref_start >= 0) return true;
    if (ta.selectionStart !== ta.selectionEnd) return false;
    return POINTABLE.test(ta.value.slice(0, ta.selectionStart));
  }

  /** F4: cycle the reference at the caret through A1, $A$1, A$1 and $A1. */
  private toggle_anchors(): void {
    const ta = this.textarea;
    if (!ta?.value.startsWith("=")) return;
    const toggled = toggleReferenceAnchors(ta.value, ta.selectionStart);
    if (toggled === null) return;
    ta.value = toggled.text;
    ta.setSelectionRange(toggled.caret, toggled.caret);
    this.ref_start = -1;
    this.resize();
    if (this.assist_attached) this.assist?.update();
    this.opts?.onText(ta.value);
    this.report_mode();
  }

  private readonly on_input = (event: Event): void => {
    const ta = this.textarea;
    if (!ta) return;
    this.ref_start = -1;
    this.completion = null;
    if (!this.composing) {
      if (typed_text(event)) this.auto_complete(ta);
      else this.opts?.complete?.complete(ta, false);
    }
    this.resize();
    if (this.assist_attached) this.assist?.update();
    this.opts?.onText(ta.value);
    this.report_mode();
  };

  /** AutoComplete (`autocomplete.ts`): complete the text, with the added text selected. */
  private auto_complete(ta: HTMLTextAreaElement): void {
    this.completion = this.opts?.complete?.complete(ta, true) ?? null;
  }

  /** The user moved into the cell editor: formula help follows the caret here. */
  private readonly on_focus = (): void => {
    this.attach_assist();
  };

  private attach_assist(): void {
    if (!this.assist || !this.textarea || !this.opts || this.assist_attached) return;
    this.assist.attach(this.textarea, this.opts.theme);
    this.assist_attached = true;
  }

  private detach_assist(): void {
    if (!this.assist_attached) return;
    this.assist?.detach();
    this.assist_attached = false;
  }

  private resize(): void {
    if (this.textarea && this.opts) this.size(this.opts.rect.h);
  }

  /**
   * Fit the explicit lines, up to eight. One line is the cell's height. The
   * editor has no horizontal scrollbar (`overflow: hidden` in grid.css), so
   * no line can hide under one and its box is never read back. Only text past
   * eight lines scrolls vertically: a box that may show a scrollbar makes the
   * layout of every open slower.
   */
  private size(minimum_height: number): void {
    const ta = this.textarea;
    if (!ta) return;
    const lines = lineCount(ta.value);
    if (lines > 1) this.metrics ??= readEditorFieldMetrics(ta);
    const height =
      lines > 1 && this.metrics !== null
        ? editorTextareaHeight(lines, minimum_height, this.metrics)
        : minimum_height;
    ta.style.height = `${height}px`;
    const scrolls = lines > MAX_VISIBLE_EDITOR_LINES;
    const scrolled = (this.sizing?.lines ?? 0) > MAX_VISIBLE_EDITOR_LINES;
    if (scrolls !== scrolled) ta.style.overflowY = scrolls ? "auto" : "";
    this.sizing = { width: ta.style.width, minimumHeight: minimum_height, lines };
  }

  /**
   * Store the text and close the editor. A formula that does not parse is
   * not stored, as in Excel: the editor stays open and false is returned.
   * Missing closing parentheses at the end are added, as Excel adds them.
   */
  commit(navigate: EditNavigate): boolean {
    const opts = this.opts;
    const ta = this.textarea;
    if (!opts || !ta || this.refusing) return false;
    const completion = this.completion;
    let value =
      completion !== null && ta.value.toLowerCase() === completion.toLowerCase()
        ? completion
        : ta.value;
    const formula = value.trim();
    if (formula.length > 1 && formula.startsWith("=")) {
      const entry = formulaEntry(formula);
      if (typeof entry !== "string") {
        this.refuse(entry, value.length - value.trimStart().length);
        return false;
      }
      value = entry;
    }
    this.teardown();
    opts.onCommit(value, navigate);
    return true;
  }

  /**
   * Excel's answer to a formula that does not parse: the message, then the
   * problem selected in the field the user committed from (this editor or a
   * formula bar), so they can fix it. `offset` is the blank space before the
   * formula, which `problem`'s offsets do not count.
   */
  private refuse(problem: FormulaDiagnostic, offset: number): void {
    const ta = this.textarea;
    if (ta === null) return;
    const active = document.activeElement;
    const field =
      is_edit_surface(active) &&
      (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
        ? active
        : ta;
    const show = (): void => {
      if (this.textarea !== ta) return;
      this.refusing = false;
      field.focus();
      field.setSelectionRange(problem.from + offset, problem.to + offset);
    };
    const message = this.opts?.onRefuse?.(problem.message);
    if (message === undefined) {
      show();
      return;
    }
    this.refusing = true;
    void message.then(show, (error: unknown) => {
      show();
      throw error;
    });
  }

  cancel(): void {
    const opts = this.opts;
    if (!opts) return;
    this.teardown();
    opts.onCancel();
  }

  destroy(): void {
    this.teardown();
  }

  private readonly on_composition_start = (): void => {
    this.composing = true;
    this.completion = null;
  };

  private readonly on_composition_end = (): void => {
    this.composing = false;
    // Browsers differ on whether the composed text's input event comes before
    // or after compositionend; complete once both have passed.
    const ta = this.textarea;
    setTimeout(() => {
      if (this.textarea === ta) this.completeNow();
    }, 0);
  };

  /**
   * Complete the typed text now: after an IME composition, or when
   * AutoComplete's code arrives after the key that opened the editor.
   */
  completeNow(): void {
    const ta = this.textarea;
    if (ta === null || this.composing || this.completion !== null) return;
    const before = ta.value;
    this.auto_complete(ta);
    if (ta.value === before) return;
    this.resize();
    this.opts?.onText(ta.value);
  }

  private readonly on_key_down = (e: KeyboardEvent): void => {
    // While the IME is composing, every keystroke belongs to the composition.
    if (this.composing || e.isComposing) {
      e.stopPropagation();
      return;
    }
    // AutoComplete's list takes its keys once Alt+Down moved into it.
    if (this.textarea && this.opts?.complete?.keyDown(e, this.textarea)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (this.textarea && insertEditorLineBreak(e, this.textarea)) {
      e.stopPropagation();
      return;
    }
    if (this.assist_attached && this.assist?.handleKeyDown(e)) {
      e.stopPropagation();
      return;
    }
    if (this.opts?.onShortcut?.(e)) {
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // Excel: Enter moves down, Shift+Enter up, and Ctrl+Enter stays (filling a selection).
      this.commit(e.ctrlKey || e.metaKey ? "stay" : e.shiftKey ? "up" : "down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.commit(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
    } else if (e.key === "F2" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // F2 switches between Enter mode (arrows leave the cell) and Edit mode (arrows move the caret).
      e.preventDefault();
      this.entering = !this.entering;
      this.report_mode();
    } else if (e.key === "F4" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.toggle_anchors();
    } else if (this.entering && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Enter mode: an arrow points at a cell in a formula, or commits and moves.
      const step = ARROW_STEPS[e.key];
      if (step && this.can_point()) {
        e.preventDefault();
        this.opts?.onPoint?.(step[0], step[1], e.shiftKey);
      } else if (step && !e.shiftKey) {
        e.preventDefault();
        this.commit(step[2]);
      }
    }
    // Keep arrows/typing inside the textarea, never bubbling to grid nav.
    e.stopPropagation();
  };

  private readonly on_blur = (event: FocusEvent): void => {
    if (!this.textarea || this.tearing_down || this.refusing) return;
    // Moving into a formula bar keeps the edit open there, as in Excel.
    if (is_edit_surface(event.relatedTarget)) {
      this.detach_assist();
      return;
    }
    this.commit("none");
  };

  private teardown(): void {
    const ta = this.textarea;
    if (!ta) return;
    this.tearing_down = true;
    this.detach_assist();
    this.opts?.complete?.close();
    ta.removeEventListener("compositionstart", this.on_composition_start);
    ta.removeEventListener("compositionend", this.on_composition_end);
    ta.removeEventListener("keydown", this.on_key_down);
    ta.removeEventListener("focus", this.on_focus);
    ta.removeEventListener("blur", this.on_blur);
    ta.removeEventListener("input", this.on_input);
    ta.remove();
    this.textarea = null;
    this.opts = null;
    this.composing = false;
    this.ref_start = -1;
    this.ref_end = -1;
    this.metrics = null;
    this.metrics_line_height = "";
    this.sizing = null;
    this.entering = false;
    this.completion = null;
    this.reported_mode = null;
    this.refusing = false;
    this.tearing_down = false;
  }
}
