import type { Selection } from "@sheetwrite/core";

function selectionLabel(selection: Selection | null, empty_label: string): string {
  if (selection === null) return empty_label;
  if (selection.kind === "cell") return `R${selection.addr.row + 1} C${selection.addr.col + 1}`;
  if (selection.kind === "range") {
    return `R${selection.range.start.row + 1}:R${selection.range.end.row + 1}`;
  }
  return selection.kind;
}

export { selectionLabel };
