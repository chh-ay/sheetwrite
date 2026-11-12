const MAX_VISIBLE_EDITOR_LINES = 8;

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
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight)) return null;
  const borderTop = Number.parseFloat(style.borderTopWidth);
  const borderBottom = Number.parseFloat(style.borderBottomWidth);
  const inset =
    Number.parseFloat(style.paddingTop) +
    Number.parseFloat(style.paddingBottom) +
    borderTop +
    borderBottom;
  return { lineHeight, inset, borders: borderTop + borderBottom };
}

/**
 * Keep explicit lines visible, with scrolling after eight lines. No soft wrapping.
 * A caller that keeps the field's styles can pass metrics it read before, so
 * sizing reads only the field's own box after writing the height.
 */
export function sizeEditorTextarea(
  field: HTMLTextAreaElement,
  minimumHeight: number,
  metrics: EditorFieldMetrics | null = readEditorFieldMetrics(field),
): void {
  if (metrics === null) return;
  const lines = Math.min(MAX_VISIBLE_EDITOR_LINES, field.value.split("\n").length);
  const height = Math.max(minimumHeight, lines * metrics.lineHeight + metrics.inset);
  field.style.height = `${height}px`;
  // Classic scrollbars consume a line's space; overlay scrollbars do not.
  const scrollbarHeight = field.offsetHeight - field.clientHeight - metrics.borders;
  if (scrollbarHeight > 0) field.style.height = `${height + scrollbarHeight}px`;
}
