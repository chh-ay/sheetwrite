import type { CellValue, SheetSnapshot, SnapshotCell } from "@sheetwrite/core";
import { cellA1 } from "@sheetwrite/core";
import { formulaContainsExternalReference } from "@sheetwrite/core/external-links";

import { parseCellReference } from "./cell-reference.js";
import { linkedFormula } from "./external-links.js";
import { MAIN_NAMESPACES, META_MARKER, META_STEM } from "./format.js";
import { OpcPackage } from "./opc.js";
import { lastColumnDeclarations } from "./reader-columns.js";
import type { WorkbookSheetReference, ReaderResourceUsage, ColumnCells } from "./reader-types.js";
import { CellStyleIndices } from "./reader-types.js";
import { readerFailure, parseUnsigned, literalFromCell } from "./reader-values.js";
import { assertResource, emitWarning, type XlsxCodecContext } from "./resources.js";
import { type SharedFormulaGroup, type SharedFormulaMember } from "./shared-formula.js";
import { ParsedStyles } from "./styles.js";
import {
  assertXmlRoot,
  decodeXstring,
  parseXml,
  parseXmlChunks,
  type XmlChildStream,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlLocalName,
} from "./xml.js";
import { normalizePartName } from "./zip.js";

const BUFFERED_WORKSHEET_XML_BYTES = 64 * 1024;

/** A shared-formula cell whose master may follow it in the worksheet. */
interface PendingSharedFormula extends SharedFormulaMember {
  /** The group's `si` index. */
  readonly index: string;
}

/** The text and position of a shared formula's master cell. */
interface SharedFormulaMaster {
  formula: string;
  row: number;
  col: number;
  authoritative: boolean;
}

/** Group each sheet's shared-formula cells under their master. */
function sharedFormulaGroups(
  pending: readonly PendingSharedFormula[],
  masters: ReadonlyMap<string, SharedFormulaMaster>,
  sheet: string,
): SharedFormulaGroup[] {
  const groups = new Map<string, SharedFormulaGroup & { members: SharedFormulaMember[] }>();
  for (const member of pending) {
    let group = groups.get(member.index);
    if (!group) {
      const master = masters.get(member.index);
      if (!master) {
        return readerFailure(`shared formula ${member.index} at ${member.address} has no master`);
      }

      group = { sheet, formula: master.formula, row: master.row, col: master.col, members: [] };
      groups.set(member.index, group);
    }
    group.members.push(member);
  }
  return [...groups.values()];
}

export interface WorksheetRows {
  readonly root: XmlElement;
  readonly cells: SnapshotCell[];
  readonly cellStyles: CellStyleIndices;
  readonly columnCells: ReadonlyMap<number, ColumnCells>;
  readonly sharedFormulas: readonly SharedFormulaGroup[];
  readonly rowMeta: NonNullable<SheetSnapshot["rowMeta"]>;
  readonly outlineLevels: ReadonlyMap<number, number>;
  readonly collapsedRows: ReadonlySet<number>;
  readonly maxRow: number;
  readonly maxCol: number;
}

/**
 * Rows are streamed from the inflated worksheet; only cells and the small
 * non-row tree stay resident. `columnSource` is set for the second pass over a
 * worksheet whose `cols` follow its rows, whose row warnings were already sent.
 */
export async function ingestWorksheetRows(
  packageFile: OpcPackage,
  reference: WorkbookSheetReference,
  styles: ParsedStyles,
  sharedStrings: readonly string[],
  context: XlsxCodecContext,
  usage: ReaderResourceUsage,
  date1904: boolean,
  columnSource?: XmlElement,
): Promise<WorksheetRows> {
  const target = reference.relationship.target;
  const cells: SnapshotCell[] = [];
  const cellStyles = new CellStyleIndices();
  const columnCells = new Map<number, ColumnCells>();
  const pendingSharedFormulas: PendingSharedFormula[] = [];
  const sharedMasters = new Map<string, SharedFormulaMaster>();
  let inferredRow = 0;
  let maxRow = -1;
  let maxCol = -1;
  const rowMeta: NonNullable<SheetSnapshot["rowMeta"]> = [];
  const outlineLevels = new Map<number, number>();
  const collapsedRows = new Set<number>();
  let internalMetadata = false;
  const inheritedColumnStyles = new Map<number, string>();
  let columnStylesRead = false;
  let columnsPrecedeRows = false;
  const cellsBeforeSheet = usage.cells;
  const rowContext: XlsxCodecContext =
    columnSource && context.options
      ? { ...context, options: { ...context.options, onWarning: undefined } }
      : context;

  const readColumnStyles = (root: XmlElement): void => {
    if (columnStylesRead) return;
    columnStylesRead = true;
    const columnCollection = xmlChild(root, "cols");
    columnsPrecedeRows = columnCollection !== undefined;
    const spans: number[] = [];
    const columnStyles: string[] = [];
    for (const columnElement of columnCollection ? xmlChildren(columnCollection, "col") : []) {
      const style = xmlAttribute(columnElement, "style");
      if (style === undefined) continue;
      const min = parseUnsigned(xmlAttribute(columnElement, "min"), "column minimum");
      const max = parseUnsigned(xmlAttribute(columnElement, "max"), "column maximum");
      if (min < 1 || max < min) readerFailure("column range is invalid");
      assertResource(context, "maxColumnsPerSheet", max);
      spans.push(min - 1, max - 1);
      columnStyles.push(style);
    }

    lastColumnDeclarations(spans).forEach((declaration, col) => {
      const style = columnStyles[declaration];
      if (style !== undefined) inheritedColumnStyles.set(col, style);
    });
  };
  if (columnSource) readColumnStyles(columnSource);

  const processRow = (rowElement: XmlElement, root: XmlElement): void => {
    if (!columnStylesRead) assertXmlRoot(root, "worksheet", MAIN_NAMESPACES, target);
    readColumnStyles(root);
    const row =
      xmlAttribute(rowElement, "r") === undefined
        ? inferredRow
        : parseUnsigned(xmlAttribute(rowElement, "r"), "row number") - 1;
    if (row < 0) readerFailure(`row number in ${reference.name} is invalid`);
    assertResource(context, "maxRowsPerSheet", row + 1);
    inferredRow = row + 1;
    maxRow = Math.max(maxRow, row);
    const heightPoints = Number(xmlAttribute(rowElement, "ht"));
    const hasFixedHeight =
      xmlBoolean(xmlAttribute(rowElement, "customHeight")) &&
      Number.isFinite(heightPoints) &&
      heightPoints > 0;
    const hidden = xmlBoolean(xmlAttribute(rowElement, "hidden"));
    const outlineLevel = Number(xmlAttribute(rowElement, "outlineLevel") ?? 0);
    if (!Number.isInteger(outlineLevel) || outlineLevel < 0 || outlineLevel > 7) {
      readerFailure(`row outline level in ${reference.name} is invalid`);
    }
    if (outlineLevel > 0) outlineLevels.set(row, outlineLevel);
    if (xmlBoolean(xmlAttribute(rowElement, "collapsed"))) collapsedRows.add(row);
    if (hasFixedHeight || hidden) {
      rowMeta.push([
        row,
        {
          ...(hasFixedHeight ? { height: (heightPoints * 96) / 72 } : {}),
          ...(hidden ? { hidden: true } : {}),
        },
      ]);
    }
    const rowStyle = xmlBoolean(xmlAttribute(rowElement, "customFormat"))
      ? xmlAttribute(rowElement, "s")
      : undefined;
    let inferredCol = 0;
    for (const cellElement of xmlChildren(rowElement, "c")) {
      const addressText = xmlAttribute(cellElement, "r") ?? cellA1(row, inferredCol);
      const address =
        parseCellReference(addressText) ??
        readerFailure(`cell reference ${addressText} is invalid`);
      if (address.row !== row) readerFailure(`cell ${addressText} is outside its row`);
      inferredCol = address.col + 1;
      assertResource(context, "maxColumnsPerSheet", address.col + 1);
      maxCol = Math.max(maxCol, address.col);
      const styleIndex = parseUnsigned(
        xmlAttribute(cellElement, "s") ?? rowStyle ?? inheritedColumnStyles.get(address.col) ?? "0",
        `style index at ${addressText}`,
      );
      const styleRecord = styles.at(styleIndex);
      const formulaElement = xmlChild(cellElement, "f");
      let value: CellValue | null;
      let sharedFormula: string | undefined;
      let ownSharedFormula: string | undefined;
      if (formulaElement) {
        const formulaText = decodeXstring(formulaElement.text);
        const formulaType = xmlAttribute(formulaElement, "t") ?? "normal";
        if (formulaType === "shared") {
          sharedFormula = xmlAttribute(formulaElement, "si");
          if (!sharedFormula) readerFailure(`shared formula at ${addressText} has no index`);
          if (formulaText) {
            ownSharedFormula = formulaText;
            const authoritative = xmlAttribute(formulaElement, "ref") !== undefined;
            const existing = sharedMasters.get(sharedFormula);
            if (authoritative || !existing) {
              sharedMasters.set(sharedFormula, { formula: formulaText, ...address, authoritative });
            }
          }
          value = null;
        } else if (formulaType !== "normal") {
          emitWarning(rowContext, {
            code: "unsupported-feature",
            message: `Excel ${formulaType} formula was neutralized because its range semantics are unsupported`,
            sheet: reference.name,
            cell: addressText,
          });
          value = formulaText ? { kind: "literal", value: `=${formulaText}` } : null;
        } else if (formulaContainsExternalReference(formulaText)) {
          const linked = linkedFormula(formulaText, context.externalBooks);
          if (linked === undefined) {
            emitWarning(rowContext, {
              code: "external-formula",
              message: "External-data formula was neutralized as inert text",
              sheet: reference.name,
              cell: addressText,
            });
            value = { kind: "literal", value: `=${formulaText}` };
          } else {
            value = { kind: "formula", src: `=${linked}` };
          }
        } else {
          value = formulaText ? { kind: "formula", src: `=${formulaText}` } : null;
        }
      } else {
        value = literalFromCell(
          cellElement,
          xmlAttribute(cellElement, "t"),
          sharedStrings,
          styleRecord,
          rowContext,
          reference.name,
          addressText,
          date1904,
        );
      }
      if (value || styleRecord.style || sharedFormula) {
        if (
          cells.length === 0 &&
          reference.name.startsWith(META_STEM) &&
          address.row === 0 &&
          address.col === 0 &&
          value?.kind === "literal" &&
          value.value === META_MARKER
        ) {
          internalMetadata = true;
        }
        if (!internalMetadata) {
          usage.cells += 1;
          assertResource(context, "maxCells", usage.cells);
        }
        const cell: SnapshotCell = {
          rowOffset: address.row,
          colOffset: address.col,
          value: value ?? { kind: "literal", value: null },
        };
        cells.push(cell);
        cellStyles.push(styleIndex);
        let column = columnCells.get(address.col);
        if (!column) {
          column = { styleIndices: new Set(), hasNumericValue: false };
          columnCells.set(address.col, column);
        }
        column.styleIndices.add(styleIndex);
        if (value?.kind === "literal" && typeof value.value === "number") {
          column.hasNumericValue = true;
        }
        if (sharedFormula) {
          pendingSharedFormulas.push({
            cell,
            index: sharedFormula,
            address: addressText,
            ownFormula: ownSharedFormula,
          });
        }
      }
    }
  };

  const part = normalizePartName(target);
  const rowStream: XmlChildStream = {
    parent: "sheetData",
    parentIsRoot: false,
    // The tree path read only `row` children; other children are skipped alike.
    child: (rowElement, rootElement) => {
      if (xmlLocalName(rowElement.name) === "row") processRow(rowElement, rootElement);
    },
  };
  const entry = packageFile.archive.entries.get(part);
  // For a small worksheet, the asynchronous XML driver costs more than the parse. Both parsers
  // apply the same XML limits, and the declared size is checked against the inflated bytes.
  const root =
    entry && entry.uncompressedSize <= BUFFERED_WORKSHEET_XML_BYTES
      ? parseXml(await packageFile.archive.read(part), part, context, rowStream)
      : await parseXmlChunks(packageFile.archive.chunks(part), part, context, rowStream);
  assertXmlRoot(root, "worksheet", MAIN_NAMESPACES, target);
  const lateColumns = xmlChild(root, "cols");
  if (
    columnStylesRead &&
    !columnsPrecedeRows &&
    lateColumns &&
    xmlChildren(lateColumns, "col").some((column) => xmlAttribute(column, "style") !== undefined)
  ) {
    // Column styles apply to every row, including rows already streamed; a
    // second streamed pass is cheaper than retaining the worksheet document.
    usage.cells = cellsBeforeSheet;
    // This frame stays alive until the second pass returns; drop its cells so
    // the worksheet is not resident twice.
    cells.length = 0;
    cellStyles.clear();
    columnCells.clear();
    pendingSharedFormulas.length = 0;
    sharedMasters.clear();
    return ingestWorksheetRows(
      packageFile,
      reference,
      styles,
      sharedStrings,
      context,
      usage,
      date1904,
      root,
    );
  }
  readColumnStyles(root);
  const sharedFormulas = sharedFormulaGroups(pendingSharedFormulas, sharedMasters, reference.name);
  return {
    root,
    cells,
    cellStyles,
    columnCells,
    sharedFormulas,
    rowMeta,
    outlineLevels,
    collapsedRows,
    maxRow,
    maxCol,
  };
}
