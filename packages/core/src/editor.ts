import {
  type EditorFieldMetrics,
  insertEditorLineBreak,
  readEditorFieldMetrics,
  sizeEditorTextarea,
} from "./editor-textarea.js";
import { FormulaAssist } from "./formula-assist.js";
import type { AssistDeps } from "./formula-help.js";
import type { CellFormat } from "./types/cell.js";
import type { Theme } from "./types/render.js";

export type { AssistDeps };

export type EditNavigate = "down" | "right" | "left" | "none";

export interface EditRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BeginEditOptions {
  row: number;
  col: number;
  type: CellFormat;
  initial: string;
  /** select all text (F2/double-click) vs place caret at end (typed char) */
  selectAll: boolean;
  rect: EditRect;
  /** Accessible name derived from the semantic or positional column header. */
  label: string;
  theme: Theme;
  onCommit: (value: string, navigate: EditNavigate) => void;
  onCancel: () => void;
  /** Runs a host command bound to this key combination; true when one ran. */
  onShortcut?: (event: KeyboardEvent) => boolean;
}

/** What the textarea's last sizing depended on; equal inputs give the same height. */
interface EditorSizing {
  readonly width: string;
  readonly minimumHeight: number;
  readonly value: string;
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
  private tearingDown = false;
  private refStart = -1;
  private refEnd = -1;
  private readonly assist: FormulaAssist | null;
  // Read once per open and again only when the editor's line height changes,
  // so sizing reads only the textarea's own box, never its computed style.
  private metrics: EditorFieldMetrics | null = null;
  private metricsLineHeight = "";
  private sizing: EditorSizing | null = null;

  constructor(host: HTMLElement, assist?: AssistDeps) {
    this.host = host;
    this.assist = assist ? new FormulaAssist(assist) : null;
  }

  get isEditing(): boolean {
    return this.textarea !== null;
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

    this.host.appendChild(ta);
    this.textarea = ta;
    this.opts = opts;
    this.position(opts.rect);

    ta.addEventListener("compositionstart", this.onCompositionStart);
    ta.addEventListener("compositionend", this.onCompositionEnd);
    ta.addEventListener("keydown", this.onKeyDown);
    ta.addEventListener("blur", this.onBlur);
    ta.addEventListener("input", this.onInput);

    ta.focus();
    if (opts.selectAll) {
      ta.select();
    } else {
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    }
    this.assist?.attach(ta, opts.theme);
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
      sizing.value !== ta.value
    ) {
      ta.style.width = width;
      const lineHeight = `${Math.max(1, rect.h - 4)}px`;
      if (lineHeight !== this.metricsLineHeight) {
        ta.style.lineHeight = lineHeight;
        this.metrics = readEditorFieldMetrics(ta);
        this.metricsLineHeight = lineHeight;
      }
      this.size(rect.h);
    }
    this.assist?.reposition();
  }

  get value(): string {
    return this.textarea?.value ?? "";
  }

  /**
   * Insert (or, while dragging, replace) an A1 reference at the caret — the
   * "point mode" a spreadsheet enters after you type `=`.
   */
  setReference(ref: string): void {
    const ta = this.textarea;
    if (!ta) return;
    const start = this.refStart >= 0 ? this.refStart : (ta.selectionStart ?? ta.value.length);
    const end = this.refStart >= 0 ? this.refEnd : (ta.selectionEnd ?? start);
    ta.value = ta.value.slice(0, start) + ref + ta.value.slice(end);
    this.refStart = start;
    this.refEnd = start + ref.length;
    ta.setSelectionRange(this.refEnd, this.refEnd);
    ta.focus();
    this.resize();
    this.assist?.update();
  }

  /** Finish a reference pick; the next pick inserts fresh at the caret. */
  endReference(): void {
    this.refStart = -1;
    this.refEnd = -1;
  }

  private readonly onInput = (): void => {
    this.refStart = -1;
    this.resize();
    this.assist?.update();
  };

  private resize(): void {
    if (this.textarea && this.opts) this.size(this.opts.rect.h);
  }

  private size(minimumHeight: number): void {
    const ta = this.textarea;
    if (!ta) return;
    sizeEditorTextarea(ta, minimumHeight, this.metrics);
    this.sizing = { width: ta.style.width, minimumHeight, value: ta.value };
  }

  commit(navigate: EditNavigate): void {
    const opts = this.opts;
    const ta = this.textarea;
    if (!opts || !ta) return;
    const value = ta.value;
    this.teardown();
    opts.onCommit(value, navigate);
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

  private readonly onCompositionStart = (): void => {
    this.composing = true;
  };

  private readonly onCompositionEnd = (): void => {
    this.composing = false;
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // While the IME is composing, every keystroke belongs to the composition.
    if (this.composing || e.isComposing) {
      e.stopPropagation();
      return;
    }
    if (this.textarea && insertEditorLineBreak(e, this.textarea)) {
      e.stopPropagation();
      return;
    }
    if (this.assist?.handleKeyDown(e)) {
      e.stopPropagation();
      return;
    }
    if (this.opts?.onShortcut?.(e)) {
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.commit("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      this.commit(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
    }
    // Keep arrows/typing inside the textarea, never bubbling to grid nav.
    e.stopPropagation();
  };

  private readonly onBlur = (): void => {
    if (this.textarea && !this.tearingDown) this.commit("none");
  };

  private teardown(): void {
    const ta = this.textarea;
    if (!ta) return;
    this.tearingDown = true;
    this.assist?.detach();
    ta.removeEventListener("compositionstart", this.onCompositionStart);
    ta.removeEventListener("compositionend", this.onCompositionEnd);
    ta.removeEventListener("keydown", this.onKeyDown);
    ta.removeEventListener("blur", this.onBlur);
    ta.removeEventListener("input", this.onInput);
    ta.remove();
    this.textarea = null;
    this.opts = null;
    this.composing = false;
    this.refStart = -1;
    this.refEnd = -1;
    this.metrics = null;
    this.metricsLineHeight = "";
    this.sizing = null;
    this.tearingDown = false;
  }
}
