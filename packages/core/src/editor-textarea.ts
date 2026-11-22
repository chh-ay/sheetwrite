const MAX_VISIBLE_EDITOR_LINES = 8;

/**
 * Marks a field that edits the same draft as the cell editor, such as a
 * formula bar. Focus moving from the cell editor into one keeps the edit open.
 */
export const EDIT_SURFACE_ATTRIBUTE = "data-sheetwrite-edit-surface";

/** Explicit lines of an editor's text, which set its height (see {@link sizeEditorTextarea}). */
export function editorLineCount(text: string): number {
  let lines = 1;
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    lines++;
  }
  return lines;
}

/** Shared newline handling for the cell editor and detached formula bar. */
export function insertEditorLineBreak(event: KeyboardEvent, field: HTMLTextAreaElement): boolean {
  if (event.key !== "Enter" || !event.altKey || event.ctrlKey || event.metaKey) return false;
  event.preventDefault();
  if (!field.readOnly) {
    field.setRangeText("\n", field.selectionStart, field.selectionEnd, "end");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
}

/** The vertical box of an editor field. It changes only with the field's styles. */
export interface EditorFieldMetrics {
  readonly lineHeight: number;
  /** Top and bottom padding and borders. */
  readonly inset: number;
  /** Top and bottom borders. */
  readonly borders: number;
}

/** Null when the line height is not a length (`normal`). */
export function readEditorFieldMetrics(field: HTMLTextAreaElement): EditorFieldMetrics | null {
  const style = getComputedStyle(field);
  const line_height = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(line_height)) return null;
  const border_top = Number.parseFloat(style.borderTopWidth);
  const border_bottom = Number.parseFloat(style.borderBottomWidth);
  const inset =
    Number.parseFloat(style.paddingTop) +
    Number.parseFloat(style.paddingBottom) +
    border_top +
    border_bottom;
  return { lineHeight: line_height, inset, borders: border_top + border_bottom };
}

/**
 * The height that shows `lines` explicit lines, up to eight, and never less
 * than `minimumHeight`. Past eight lines the field scrolls.
 */
export function editorTextareaHeight(
  lines: number,
  minimumHeight: number,
  metrics: EditorFieldMetrics,
): number {
  return Math.max(
    minimumHeight,
    Math.min(MAX_VISIBLE_EDITOR_LINES, lines) * metrics.lineHeight + metrics.inset,
  );
}

/**
 * Keep explicit lines visible, with scrolling after eight lines, and room for
 * a classic horizontal scrollbar under the last line. No soft wrapping. Reads
 * the field's computed style and its box: the formula bar sizes this way.
 */
export function sizeEditorTextarea(field: HTMLTextAreaElement, minimumHeight: number): void {
  const metrics = readEditorFieldMetrics(field);
  if (metrics === null) return;
  const height = editorTextareaHeight(editorLineCount(field.value), minimumHeight, metrics);
  field.style.height = `${height}px`;
  // Classic scrollbars consume a line's space; overlay scrollbars do not.
  const scrollbar_height = field.offsetHeight - field.clientHeight - metrics.borders;
  if (scrollbar_height > 0) field.style.height = `${height + scrollbar_height}px`;
}
