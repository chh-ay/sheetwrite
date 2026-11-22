// Excel's Paste Special: which parts of the copied cells a paste writes, how
// it combines copied numbers with the target's, and the dialog that chooses
// (Ctrl+Alt+V). The module loads on first use, while the clipboard is read.
// https://support.microsoft.com/en-us/excel/paste-options

import { cellA1, colToA1, shiftA1Refs } from "./a1.js";
import type { ClipboardCell } from "./clipboard.js";
import { type DialogHost, openDialog } from "./dialog.js";
import type { CellRef } from "./selection.js";
import type { CellScalar, CellStyle, CellValue } from "./types/cell.js";
import type { Range } from "./types/coordinates.js";
import type { PasteSpecialKind, PasteSpecialOperation, PasteSpecialOptions } from "./types/grid.js";

/** What one Paste choice writes. */
export interface PasteParts {
  /** The cells' contents: formulas as copied, their values, or none (the target's stay). */
  readonly content: "formulas" | "values" | null;
  /** The cells' formats: all of them, all but borders, only the number format, or none. */
  readonly style: "all" | "noBorders" | "numberFormat" | null;
  readonly notes: boolean;
  readonly validation: boolean;
  /** The copied conditional formats replace the target's, or join them. */
  readonly conditionalFormats: "replace" | "merge" | null;
  readonly hyperlinks: boolean;
  readonly columnWidths: boolean;
}

const ALL: PasteParts = {
  content: "formulas",
  style: "all",
  notes: true,
  validation: true,
  conditionalFormats: "replace",
  hyperlinks: true,
  columnWidths: false,
};
const NOTHING: PasteParts = {
  content: null,
  style: null,
  notes: false,
  validation: false,
  conditionalFormats: null,
  hyperlinks: false,
  columnWidths: false,
};

/** Excel's Paste choices. "All using Source theme" is All: a workbook here has one theme. */
export const PASTE_PARTS: Record<PasteSpecialKind, PasteParts> = {
  all: ALL,
  formulas: { ...NOTHING, content: "formulas" },
  values: { ...NOTHING, content: "values" },
  formats: { ...NOTHING, style: "all", conditionalFormats: "replace" },
  comments: { ...NOTHING, notes: true },
  validation: { ...NOTHING, validation: true },
  allUsingSourceTheme: ALL,
  allExceptBorders: { ...ALL, style: "noBorders" },
  columnWidths: { ...NOTHING, columnWidths: true },
  formulasAndNumberFormats: { ...NOTHING, content: "formulas", style: "numberFormat" },
  valuesAndNumberFormats: { ...NOTHING, content: "values", style: "numberFormat" },
  allMergingConditionalFormats: { ...ALL, conditionalFormats: "merge" },
};

/** A target cell as it is before the paste. */
export interface TargetCell {
  readonly value: CellValue;
  readonly resolved: CellScalar;
  readonly style: CellStyle;
}

/** What a paste writes into one cell, or null to leave the cell as it is. */
export interface PasteWrite {
  readonly value: CellValue;
  readonly style: CellStyle;
}

/** The copied block, row by row; a cell may depend on the target column it lands in. */
export interface PasteSourceCells {
  readonly height: number;
  readonly width: number;
  cellAt(row: number, col: number, targetCol: number): ClipboardCell | undefined;
}

/** The copied cells of this grid, for formulas that shift and for Paste Link. */
export interface PasteOrigin {
  /** Rows and columns from the copied block's top-left to the paste's, in data rows. */
  readonly delta: CellRef;
  /** The copied cells, and their sheet as a reference writes it; null when the sheet is the target's. */
  readonly link: { readonly range: Range; readonly sheet: string | null } | null;
}

export interface PastePlan {
  readonly parts: PasteParts;
  /** The block the paste writes, after a transpose. */
  readonly height: number;
  readonly width: number;
  /** The write for block cell (`row`, `col`) in the copy of the block at `repeat`. */
  cellAt(
    row: number,
    col: number,
    targetCol: number,
    repeat: CellRef,
    target: () => TargetCell,
  ): PasteWrite | null;
}

const SIGNS: Record<Exclude<PasteSpecialOperation, "none">, string> = {
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
};

/** A number for an operation: a blank counts as 0, text that reads as a number as it; null otherwise. */
function operand(value: CellScalar): number | null {
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) ? number : null;
}

/**
 * The target cell combined with a copied cell, as Excel's Operation: two
 * numbers give a number; a formula on either side gives a formula. Text on
 * either side leaves the target as it is (null).
 */
function combine(
  operation: Exclude<PasteSpecialOperation, "none">,
  target: TargetCell,
  copied: CellValue,
  copied_value: CellScalar,
): CellValue | null {
  const left =
    target.value.kind === "formula" ? `(${target.value.src.slice(1)})` : operand(target.resolved);
  const right = copied.kind === "formula" ? `(${copied.src.slice(1)})` : operand(copied_value);
  if (left === null || right === null) return null;
  const sign = SIGNS[operation];
  if (typeof left === "number" && typeof right === "number") {
    // Excel's #DIV/0! comes from the formula; every other result is a number.
    if (operation === "divide" && right === 0) return { kind: "formula", src: `=${left}/0` };
    const result =
      operation === "add"
        ? left + right
        : operation === "subtract"
          ? left - right
          : operation === "multiply"
            ? left * right
            : left / right;
    return { kind: "literal", value: result };
  }
  return { kind: "formula", src: `=${left}${sign}${right}` };
}

function is_blank(cell: ClipboardCell): boolean {
  return cell.value.kind === "literal" && (cell.value.value === null || cell.value.value === "");
}

/** A cell reference to copied cell (`row`, `col`): absolute for a one-cell copy, as Excel's Paste Link. */
function link_formula(link: NonNullable<PasteOrigin["link"]>, row: number, col: number): string {
  const { start, end } = link.range;
  const single = start.row === end.row && start.col === end.col;
  const r = Math.min(start.row, end.row) + row;
  const c = Math.min(start.col, end.col) + col;
  const ref = single ? `$${colToA1(c)}$${r + 1}` : cellA1(r, c);
  return `=${link.sheet === null ? "" : `${link.sheet}!`}${ref}`;
}

/** The style a pasted cell gets: the copied cell's, the target's, or a mix. */
function style_of(parts: PasteParts, copied: CellStyle, target: () => TargetCell): CellStyle {
  switch (parts.style) {
    case "all":
      return copied;
    case "noBorders": {
      const { border: _, ...rest } = copied;
      const border = target().style.border;
      return border === undefined ? rest : { ...rest, border };
    }
    case "numberFormat": {
      const { numberFormat: _, ...rest } = target().style;
      return copied.numberFormat === undefined
        ? rest
        : { ...rest, numberFormat: copied.numberFormat };
    }
    case null:
      return target().style;
  }
}

/**
 * Plan a Paste Special of `source`. `origin` is set for this grid's own copy:
 * formulas shift as Paste does them, and Paste Link can refer to the cells;
 * other sources paste their values.
 */
export function planPasteSpecial(
  source: PasteSourceCells,
  options: PasteSpecialOptions,
  origin: PasteOrigin | null,
): PastePlan {
  const parts = PASTE_PARTS[options.paste ?? "all"];
  const operation = options.operation ?? "none";
  const transpose = options.transpose === true;
  const link = options.link === true ? (origin?.link ?? null) : null;
  return {
    parts: link ? { ...NOTHING, content: "formulas" } : parts,
    height: transpose ? source.width : source.height,
    width: transpose ? source.height : source.width,
    cellAt(row, col, target_col, repeat, target) {
      const [source_row, source_col] = transpose ? [col, row] : [row, col];
      const cell = source.cellAt(source_row, source_col, target_col) ?? {
        value: { kind: "literal", value: null },
        resolved: null,
        style: {},
      };
      if (options.skipBlanks === true && is_blank(cell)) return null;
      if (link) {
        return {
          value: { kind: "formula", src: link_formula(link, source_row, source_col) },
          style: target().style,
        };
      }
      let value: CellValue;
      if (parts.content === null) value = target().value;
      else if (parts.content === "values" || origin === null) {
        value =
          cell.value.kind === "formula" ? { kind: "literal", value: cell.resolved } : cell.value;
      } else if (cell.value.kind === "formula") {
        // Each copy shifts by its own offset; a transposed cell by its own move.
        const d_row = origin.delta.row + repeat.row + row - source_row;
        const d_col = origin.delta.col + repeat.col + col - source_col;
        value = { kind: "formula", src: shiftA1Refs(cell.value.src, d_row, d_col) };
      } else value = cell.value;
      if (operation !== "none" && parts.content !== null) {
        const combined = combine(operation, target(), value, cell.resolved);
        if (combined === null) return null;
        value = combined;
      }
      return { value, style: style_of(parts, cell.style, target) };
    },
  };
}

/** Excel's Paste choices with their access keys, in the dialog's two columns. */
const PASTE_CHOICES: readonly (readonly [PasteSpecialKind, string, string])[] = [
  ["all", "All", "a"],
  ["formulas", "Formulas", "f"],
  ["values", "Values", "v"],
  ["formats", "Formats", "t"],
  ["comments", "Comments and Notes", "c"],
  ["validation", "Validation", "n"],
  ["allUsingSourceTheme", "All using Source theme", "h"],
  ["allExceptBorders", "All except borders", "x"],
  ["columnWidths", "Column widths", "w"],
  ["formulasAndNumberFormats", "Formulas and number formats", "r"],
  ["valuesAndNumberFormats", "Values and number formats", "u"],
  ["allMergingConditionalFormats", "All merging conditional formats", "g"],
];

const OPERATION_CHOICES: readonly (readonly [PasteSpecialOperation, string, string])[] = [
  ["none", "None", "o"],
  ["add", "Add", "d"],
  ["subtract", "Subtract", "s"],
  ["multiply", "Multiply", "m"],
  ["divide", "Divide", "i"],
];

/** Choices that need this grid's own copy: Paste from another application has none of these. */
const OWN_COPY_ONLY: ReadonlySet<PasteSpecialKind> = new Set([
  "comments",
  "validation",
  "columnWidths",
]);

/** A label with its access key underlined, as Excel's dialog shows it. */
function access_label(text: string, key: string): HTMLElement {
  const label = document.createElement("span");
  const at = text.toLowerCase().indexOf(key);
  const underline = document.createElement("u");
  underline.textContent = text.slice(at, at + 1);
  label.append(text.slice(0, at), underline, text.slice(at + 1));
  return label;
}

function choice_group(
  legend_text: string,
  name: string,
  choices: readonly (readonly [string, string, string])[],
  keys: Map<string, HTMLInputElement>,
): { group: HTMLFieldSetElement; radios: HTMLInputElement[] } {
  const group = document.createElement("fieldset");
  group.className = "sheetwrite-paste-special-group";
  const legend = document.createElement("legend");
  legend.textContent = legend_text;
  group.append(legend);
  const radios: HTMLInputElement[] = [];
  for (const [value, text, key] of choices) {
    const label = document.createElement("label");
    label.className = "sheetwrite-dialog-choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = value;
    radio.accessKey = key;
    label.append(radio, access_label(text, key));
    group.append(label);
    radios.push(radio);
    keys.set(key, radio);
  }
  return { group, radios };
}

let dialogs = 0;

/**
 * Excel's Paste Special dialog: Paste, Operation, Skip blanks, Transpose and
 * Paste Link, each with its letter key. `ownCopy` is false for cells copied
 * from another application, whose notes, rules and widths are unknown, so
 * those choices and Paste Link show disabled. Resolves to the choice, or
 * null on Cancel.
 */
export async function pasteSpecialDialog(
  host: DialogHost,
  ownCopy: boolean,
): Promise<PasteSpecialOptions | null> {
  const id = ++dialogs;
  const keys = new Map<string, HTMLInputElement>();
  const form = document.createElement("div");
  form.className = "sheetwrite-paste-special";
  const paste = choice_group("Paste", `sheetwrite-paste-${id}`, PASTE_CHOICES, keys);
  const operation = choice_group(
    "Operation",
    `sheetwrite-paste-operation-${id}`,
    OPERATION_CHOICES,
    keys,
  );
  const checks = document.createElement("div");
  checks.className = "sheetwrite-paste-special-checks";
  const checkbox = (text: string, key: string): HTMLInputElement => {
    const label = document.createElement("label");
    label.className = "sheetwrite-dialog-choice";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.accessKey = key;
    label.append(box, access_label(text, key));
    checks.append(label);
    keys.set(key, box);
    return box;
  };
  const skip_blanks = checkbox("Skip blanks", "b");
  const transpose = checkbox("Transpose", "e");
  form.append(paste.group, operation.group, checks);

  for (const radio of paste.radios) {
    radio.disabled = !ownCopy && OWN_COPY_ONLY.has(radio.value as PasteSpecialKind);
  }
  const first = paste.radios[0];
  const none = operation.radios[0];
  if (first) first.checked = true;
  if (none) none.checked = true;

  const dialog = openDialog(host, {
    title: "Paste Special",
    body: form,
    buttons: [
      { label: "Paste Link", value: "link" },
      { label: "OK", value: "ok", default: true },
      { label: "Cancel", value: "cancel" },
    ],
    cancel: "cancel",
    initialFocus: first,
  });
  dialog.element.classList.add("sheetwrite-paste-special-dialog");
  const buttons = dialog.element.querySelectorAll<HTMLButtonElement>(".sheetwrite-dialog-button");
  const link = buttons[0];
  if (link) link.accessKey = "l";

  const chosen = (radios: HTMLInputElement[]): string =>
    radios.find((radio) => radio.checked)?.value ?? "";
  // As in Excel: an operation works on contents, and Paste Link with All or All except borders.
  const update = (): void => {
    const kind = chosen(paste.radios) as PasteSpecialKind;
    const parts = PASTE_PARTS[kind];
    for (const radio of operation.radios) radio.disabled = parts.content === null;
    if (parts.content === null && none) none.checked = true;
    if (link) {
      link.disabled = !ownCopy || (kind !== "all" && kind !== "allExceptBorders");
    }
  };
  form.addEventListener("change", update);
  update();

  // The letter keys pick a choice, alone or with Alt, as in Excel.
  dialog.element.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey) return;
    // Alt+letter types another character on a Mac; the key's code still names the letter.
    const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
    if (letter === undefined) return;
    const key = letter.toLowerCase();
    const control = key === "l" ? link : keys.get(key);
    if (!control || control.disabled) return;
    event.preventDefault();
    control.focus();
    if (control instanceof HTMLInputElement && control.type === "radio") {
      control.checked = true;
      update();
    } else control.click();
  });

  const answer = await dialog.result;
  if (answer === "cancel") return null;
  const options: PasteSpecialOptions = {
    paste: chosen(paste.radios) as PasteSpecialKind,
    operation: chosen(operation.radios) as PasteSpecialOperation,
    skipBlanks: skip_blanks.checked,
    transpose: transpose.checked,
  };
  return answer === "link" ? { ...options, link: true } : options;
}
