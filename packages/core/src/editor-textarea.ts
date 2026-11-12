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

/** Keep explicit lines visible, with scrolling after eight lines. No soft wrapping. */
export function sizeEditorTextarea(field: HTMLTextAreaElement, minimumHeight: number): void {
  const style = getComputedStyle(field);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight)) return;
  const inset =
    Number.parseFloat(style.paddingTop) +
    Number.parseFloat(style.paddingBottom) +
    Number.parseFloat(style.borderTopWidth) +
    Number.parseFloat(style.borderBottomWidth);
  const lines = Math.min(MAX_VISIBLE_EDITOR_LINES, field.value.split("\n").length);
  const height = Math.max(minimumHeight, lines * lineHeight + inset);
  field.style.height = `${height}px`;
  // Classic scrollbars consume a line's space; overlay scrollbars do not.
  const borders =
    Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
  const scrollbarHeight = field.offsetHeight - field.clientHeight - borders;
  if (scrollbarHeight > 0) field.style.height = `${height + scrollbarHeight}px`;
}
