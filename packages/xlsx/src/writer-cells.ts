import type { CellStyle, SheetSnapshot, SnapshotCell, WorkbookSnapshot } from "@sheetwrite/core";
import { cellA1 } from "@sheetwrite/core";
import { formulaCallsExternalData } from "@sheetwrite/core/external-links";

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

export function cellXml(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  cell: AbsoluteCell,
  styles: StylesRegistry,
  context: XlsxCodecContext,
): string {
  const column = sheet.columns[cell.col];
  if (!column) throw new RangeError(`Sheetwrite: XLSX cell column ${cell.col} is out of range`);
  const mergedStyle: CellStyle = { ...column.cellStyle, ...cell.source.style };
  const styleId = styles.register(
    Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined,
    mergedStyle.numberFormat ?? column.numberFormat,
  );
  const reference = cellA1(cell.row, cell.col);
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
    return `<c r="${reference}"${styleAttribute}><f>${escapeXml(encodeXstring(formula))}</f></c>`;
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
