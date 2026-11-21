import type { CellScalar, SheetSnapshot, SnapshotCell, WorkbookSnapshot } from "@sheetwrite/core";
import { cellA1, colToA1 } from "@sheetwrite/core";
import { formulaCallsExternalData } from "@sheetwrite/core/external-links";

import { DYNAMIC_ARRAY_CELL_METADATA } from "./dynamic-array.js";
import { ERROR_VALUES } from "./external-links.js";
import { emitWarning, type XlsxCodecContext } from "./resources.js";
import { StylesRegistry } from "./styles.js";
import type { AbsoluteCell } from "./writer.js";
import { encodeXstring, escapeXml } from "./xml.js";

export function quotedSheet(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

function formulaForReference(snapshot: WorkbookSnapshot, source: SnapshotCell["value"]): string {
  if (source.kind !== "ref") throw new TypeError("Sheetwrite: expected reference cell");
  const target = snapshot.sheets.find((sheet) => sheet.id === source.target.sheet);
  if (!target) return "#REF!";
  return `${quotedSheet(target.name)}!${cellA1(source.target.row, source.target.col)}`;
}

/** One installed spill and the values it shows, as core computes them for an export. */
export interface SpillOutput {
  readonly row: number;
  readonly col: number;
  readonly rows: number;
  readonly cols: number;
  /** Every covered cell's value, row by row: the formula's own value first. */
  readonly values: readonly CellScalar[];
}

/** Columns per row in a `SheetDynamicArrays` key; above any sheet's column count. */
const SPILL_KEY_COLUMNS = 2 ** 24;

/** The key of the cell at `row`, `col` in `SheetDynamicArrays.spills`. */
export function spillKey(row: number, col: number): number {
  return row * SPILL_KEY_COLUMNS + col;
}

/** A worksheet's dynamic arrays while its cells are written. */
export interface SheetDynamicArrays {
  /** The installed spills, by `spillKey` of their formula cell. */
  readonly spills: ReadonlyMap<number, SpillOutput>;
  /** Set once a cell is written as a dynamic array. */
  written: boolean;
}

/** The `t` attribute and `<v>` element of a formula's cached value, as Excel writes them. */
function cachedValue(value: CellScalar | undefined): { type: string; element: string } {
  if (value === undefined || value === null) return { type: "", element: "" };
  if (typeof value === "number") return { type: "", element: `<v>${value}</v>` };
  if (typeof value === "boolean") return { type: ' t="b"', element: `<v>${value ? 1 : 0}</v>` };
  if (Object.hasOwn(ERROR_VALUES, value)) return { type: ' t="e"', element: `<v>${value}</v>` };
  return { type: ' t="str"', element: `<v>${escapeXml(encodeXstring(value))}</v>` };
}

/** Column letters by column index, filled as cells are written. */
const columnLetters: string[] = [];

/** `cellA1` with each column's letters computed once. */
function cellReference(row: number, col: number): string {
  return `${(columnLetters[col] ??= colToA1(col))}${row + 1}`;
}

/**
 * A cell, written as Excel stores it. A formula whose result is an array, or
 * that `arrays` lists as an installed spill, is written as a dynamic array:
 * `cm` names the dynamic-array metadata and `<f>` covers the spill. Only an
 * installed spill has a cached value; Excel calculates the rest on load.
 */
export function cellXml(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  cell: AbsoluteCell,
  styles: StylesRegistry,
  context: XlsxCodecContext,
  arrays: SheetDynamicArrays,
): string {
  const column = sheet.columns[cell.col];
  if (!column) throw new RangeError(`Sheetwrite: XLSX cell column ${cell.col} is out of range`);
  const styleId = styles.cellStyleId(column, cell.source.style);
  const reference = cellReference(cell.row, cell.col);
  const styleAttribute = styleId ? ` s="${styleId}"` : "";
  const value = cell.source.value;
  if (value.kind === "formula" || value.kind === "ref") {
    let formula =
      value.kind === "formula"
        ? value.src.startsWith("=")
          ? value.src.slice(1)
          : value.src
        : formulaForReference(snapshot, value);
    if (formulaCallsExternalData(formula)) {
      emitWarning(context, {
        code: "external-formula",
        message: "External-data formula was neutralized as inert text on export",
        sheet: sheet.name,
        cell: reference,
      });
      return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(`=${formula}`))}</t></is></c>`;
    }
    if (value.kind === "formula") {
      const converted = context.formulas?.get(value.src);
      if (converted === undefined) throw new Error("Cell formula was not converted");
      formula = converted.startsWith("=") ? converted.slice(1) : converted;
      formula = context.externalFormula?.(formula) ?? formula;
    }
    const text = escapeXml(encodeXstring(formula));
    const spill =
      value.kind === "formula" ? arrays.spills.get(spillKey(cell.row, cell.col)) : undefined;
    if (
      spill === undefined &&
      (value.kind !== "formula" || context.arrayFormulas?.has(value.src) !== true)
    ) {
      return `<c r="${reference}"${styleAttribute}><f>${text}</f></c>`;
    }
    arrays.written = true;
    const area =
      spill && (spill.rows > 1 || spill.cols > 1)
        ? `${reference}:${cellA1(spill.row + spill.rows - 1, spill.col + spill.cols - 1)}`
        : reference;
    const cached = cachedValue(spill?.values[0]);
    return `<c r="${reference}"${styleAttribute}${cached.type} cm="${DYNAMIC_ARRAY_CELL_METADATA}"><f t="array" ref="${area}">${text}</f>${cached.element}</c>`;
  }
  if (value.value === null) return `<c r="${reference}"${styleAttribute}/>`;
  if (typeof value.value === "string") {
    return `<c r="${reference}"${styleAttribute} t="inlineStr"><is><t xml:space="preserve">${escapeXml(encodeXstring(value.value))}</t></is></c>`;
  }
  if (typeof value.value === "boolean") {
    return `<c r="${reference}"${styleAttribute} t="b"><v>${value.value ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}"${styleAttribute}><v>${value.value}</v></c>`;
}

function hyperlinkRowStyles(
  sheet: SheetSnapshot,
): (row: number, cells: readonly AbsoluteCell[]) => readonly AbsoluteCell[] {
  const pending = (sheet.hyperlinks ?? [])
    .map((hyperlink, index) => ({
      hyperlink,
      index,
      style: hyperlink.style,
    }))
    .sort((left, right) => left.hyperlink.range.start.row - right.hyperlink.range.start.row);
  let next = 0;
  let active: typeof pending = [];
  return (row, cells) => {
    active = active.filter(({ hyperlink }) => hyperlink.range.end.row >= row);
    let added = false;
    while (next < pending.length) {
      const entry = pending[next];
      if (!entry || entry.hyperlink.range.start.row > row) break;
      next += 1;
      if (entry.hyperlink.range.end.row < row) continue;
      active.push(entry);
      added = true;
    }
    // Preserve the same last-link-wins overlay order as the workbook renderer.
    if (added) active.sort((left, right) => left.index - right.index);
    if (active.length === 0 || cells.length === 0) return cells;
    const overlays = new Map<number, AbsoluteCell>();
    for (const { hyperlink, style } of active) {
      let low = 0;
      let high = cells.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const cell = cells[middle];
        if (cell && cell.col < hyperlink.range.start.col) low = middle + 1;
        else high = middle;
      }
      for (let index = low; index < cells.length; index++) {
        const cell = overlays.get(index) ?? cells[index];
        if (!cell || cell.col > hyperlink.range.end.col) break;
        overlays.set(index, {
          ...cell,
          source: {
            ...cell.source,
            style: {
              color: "#0563C1",
              underline: true,
              ...sheet.columns[cell.col]?.cellStyle,
              ...cell.source.style,
              ...style,
            },
          },
        });
      }
    }
    return overlays.size === 0 ? cells : cells.map((cell, index) => overlays.get(index) ?? cell);
  };
}

export function* hyperlinkStyledRows(
  sheet: SheetSnapshot,
  rows: Iterable<{ row: number; cells: readonly AbsoluteCell[] }>,
): Generator<{ row: number; cells: readonly AbsoluteCell[] }> {
  const applyStyles = hyperlinkRowStyles(sheet);
  for (const { row, cells } of rows) yield { row, cells: applyStyles(row, cells) };
}
