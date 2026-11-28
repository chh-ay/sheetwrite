import type { CellValue, SheetSnapshot, SnapshotCell } from "@sheetwrite/core";
import { cellA1 } from "@sheetwrite/core/codec";
import { formulaContainsExternalReference } from "@sheetwrite/core/external-links";

import { parseCellRect, parseCellReference } from "./cell-reference.js";
import { linkedFormula } from "./external-links.js";
import { MAIN_NAMESPACES, META_MARKER, META_STEM } from "./format.js";
import { OpcPackage } from "./opc.js";
import { lastColumnDeclarations } from "./reader-columns.js";
import { SpillAreas } from "./reader-spill-areas.js";
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

interface SharedFormulaMaster {
  formula: string;
  row: number;
  col: number;
  authoritative: boolean;
}

/** Group each sheet's shared-formula cells under their master. */
function shared_formula_groups(
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
  const cell_styles = new CellStyleIndices();
  const column_cells = new Map<number, ColumnCells>();
  const pending_shared_formulas: PendingSharedFormula[] = [];
  const shared_masters = new Map<string, SharedFormulaMaster>();
  let inferred_row = 0;
  let max_row = -1;
  let max_col = -1;
  const row_meta: NonNullable<SheetSnapshot["rowMeta"]> = [];
  const outline_levels = new Map<number, number>();
  const collapsed_rows = new Set<number>();
  let internal_metadata = false;
  const inherited_column_styles = new Map<number, string>();
  // The areas of the dynamic arrays read so far that reach the current row:
  // Sheetwrite computes the values Excel saved in their covered cells.
  let spill_areas: SpillAreas | undefined;
  let column_styles_read = false;
  let columns_precede_rows = false;
  const cells_before_sheet = usage.cells;
  const row_context: XlsxCodecContext =
    columnSource && context.options
      ? { ...context, options: { ...context.options, onWarning: undefined } }
      : context;

  const read_column_styles = (root: XmlElement): void => {
    if (column_styles_read) return;
    column_styles_read = true;
    const column_collection = xmlChild(root, "cols");
    columns_precede_rows = column_collection !== undefined;
    const spans: number[] = [];
    const column_styles: string[] = [];
    for (const column_element of column_collection ? xmlChildren(column_collection, "col") : []) {
      const style = xmlAttribute(column_element, "style");
      if (style === undefined) continue;
      const min = parseUnsigned(xmlAttribute(column_element, "min"), "column minimum");
      const max = parseUnsigned(xmlAttribute(column_element, "max"), "column maximum");
      if (min < 1 || max < min) readerFailure("column range is invalid");
      assertResource(context, "maxColumnsPerSheet", max);
      spans.push(min - 1, max - 1);
      column_styles.push(style);
    }

    lastColumnDeclarations(spans).forEach((declaration, col) => {
      const style = column_styles[declaration];
      if (style !== undefined) inherited_column_styles.set(col, style);
    });
  };
  if (columnSource) read_column_styles(columnSource);

  const process_row = (row_element: XmlElement, root: XmlElement): void => {
    if (!column_styles_read) assertXmlRoot(root, "worksheet", MAIN_NAMESPACES, target);
    read_column_styles(root);
    const row =
      xmlAttribute(row_element, "r") === undefined
        ? inferred_row
        : parseUnsigned(xmlAttribute(row_element, "r"), "row number") - 1;
    if (row < 0) readerFailure(`row number in ${reference.name} is invalid`);
    assertResource(context, "maxRowsPerSheet", row + 1);
    inferred_row = row + 1;
    max_row = Math.max(max_row, row);
    const height_points = Number(xmlAttribute(row_element, "ht"));
    const has_fixed_height =
      xmlBoolean(xmlAttribute(row_element, "customHeight")) &&
      Number.isFinite(height_points) &&
      height_points > 0;
    const hidden = xmlBoolean(xmlAttribute(row_element, "hidden"));
    const outline_level = Number(xmlAttribute(row_element, "outlineLevel") ?? 0);
    if (!Number.isInteger(outline_level) || outline_level < 0 || outline_level > 7) {
      readerFailure(`row outline level in ${reference.name} is invalid`);
    }
    if (outline_level > 0) outline_levels.set(row, outline_level);
    if (xmlBoolean(xmlAttribute(row_element, "collapsed"))) collapsed_rows.add(row);
    if (has_fixed_height || hidden) {
      row_meta.push([
        row,
        {
          ...(has_fixed_height ? { height: (height_points * 96) / 72 } : {}),
          ...(hidden ? { hidden: true } : {}),
        },
      ]);
    }
    const row_style = xmlBoolean(xmlAttribute(row_element, "customFormat"))
      ? xmlAttribute(row_element, "s")
      : undefined;
    spill_areas?.expire(row);
    let inferred_col = 0;
    for (const cell_element of xmlChildren(row_element, "c")) {
      const address_text = xmlAttribute(cell_element, "r") ?? cellA1(row, inferred_col);
      const address =
        parseCellReference(address_text) ??
        readerFailure(`cell reference ${address_text} is invalid`);
      if (address.row !== row) readerFailure(`cell ${address_text} is outside its row`);
      inferred_col = address.col + 1;
      assertResource(context, "maxColumnsPerSheet", address.col + 1);
      max_col = Math.max(max_col, address.col);
      const style_index = parseUnsigned(
        xmlAttribute(cell_element, "s") ??
          row_style ??
          inherited_column_styles.get(address.col) ??
          "0",
        `style index at ${address_text}`,
      );
      const style_record = styles.at(style_index);
      const formula_element = xmlChild(cell_element, "f");
      let value: CellValue | null;
      let shared_formula: string | undefined;
      let own_shared_formula: string | undefined;
      if (formula_element) {
        const formula_text = decodeXstring(formula_element.text);
        const formula_type = xmlAttribute(formula_element, "t") ?? "normal";
        const cell_metadata = xmlAttribute(cell_element, "cm");
        const dynamic_array =
          formula_type === "array" &&
          cell_metadata !== undefined &&
          context.dynamicArrayMetadata?.has(cell_metadata) === true;
        const spill_area = dynamic_array
          ? parseCellRect(xmlAttribute(formula_element, "ref") ?? "")
          : undefined;
        // Excel writes a spill's area from its formula's cell; another area
        // is not this formula's, and its covered cells keep their values.
        if (spill_area && spill_area.r0 === address.row && spill_area.c0 === address.col) {
          spill_areas ??= new SpillAreas(context.limits.maxColumnsPerSheet);
          const admitted = spill_areas.add({
            ...spill_area,
            r1: Math.min(spill_area.r1, context.limits.maxRowsPerSheet - 1),
            c1: Math.min(spill_area.c1, context.limits.maxColumnsPerSheet - 1),
          });
          if (!admitted) {
            emitWarning(row_context, {
              code: "unsupported-feature",
              message:
                "Dynamic array overlaps another spill; the values saved in its cells were kept",
              sheet: reference.name,
              cell: address_text,
            });
          }
        }
        if (formula_type === "shared") {
          shared_formula = xmlAttribute(formula_element, "si");
          if (!shared_formula) readerFailure(`shared formula at ${address_text} has no index`);
          if (formula_text) {
            own_shared_formula = formula_text;
            const authoritative = xmlAttribute(formula_element, "ref") !== undefined;
            const existing = shared_masters.get(shared_formula);
            if (authoritative || !existing) {
              shared_masters.set(shared_formula, {
                formula: formula_text,
                ...address,
                authoritative,
              });
            }
          }
          value = null;
        } else if (formula_type !== "normal" && !dynamic_array) {
          // A legacy array formula (Ctrl+Shift+Enter) has no Sheetwrite equivalent.
          emitWarning(row_context, {
            code: "unsupported-feature",
            message: `Excel ${formula_type} formula was neutralized because its range semantics are unsupported`,
            sheet: reference.name,
            cell: address_text,
          });
          value = formula_text ? { kind: "literal", value: `=${formula_text}` } : null;
        } else if (formulaContainsExternalReference(formula_text)) {
          const linked = linkedFormula(formula_text, context.externalBooks);
          if (linked === undefined) {
            emitWarning(row_context, {
              code: "external-formula",
              message: "External-data formula was neutralized as inert text",
              sheet: reference.name,
              cell: address_text,
            });
            value = { kind: "literal", value: `=${formula_text}` };
          } else {
            value = { kind: "formula", src: `=${linked}` };
          }
        } else {
          value = formula_text ? { kind: "formula", src: `=${formula_text}` } : null;
        }
      } else if (spill_areas?.covers(address.row, address.col)) {
        value = null;
      } else {
        value = literalFromCell(
          cell_element,
          xmlAttribute(cell_element, "t"),
          sharedStrings,
          style_record,
          row_context,
          reference.name,
          address_text,
          date1904,
        );
      }
      if (value || style_record.style || shared_formula) {
        if (
          cells.length === 0 &&
          reference.name.startsWith(META_STEM) &&
          address.row === 0 &&
          address.col === 0 &&
          value?.kind === "literal" &&
          value.value === META_MARKER
        ) {
          internal_metadata = true;
        }
        if (!internal_metadata) {
          usage.cells += 1;
          assertResource(context, "maxCells", usage.cells);
        }
        const cell: SnapshotCell = {
          rowOffset: address.row,
          colOffset: address.col,
          value: value ?? { kind: "literal", value: null },
        };
        cells.push(cell);
        cell_styles.push(style_index);
        let column = column_cells.get(address.col);
        if (!column) {
          column = { styleIndices: new Set() };
          column_cells.set(address.col, column);
        }
        column.styleIndices.add(style_index);
        if (shared_formula) {
          pending_shared_formulas.push({
            cell,
            index: shared_formula,
            address: address_text,
            ownFormula: own_shared_formula,
          });
        }
      }
    }
  };

  const part = normalizePartName(target);
  const row_stream: XmlChildStream = {
    parent: "sheetData",
    parentIsRoot: false,
    // Only `row` children of `sheetData` hold cells; other children are skipped.
    child: (row_element, root_element) => {
      if (xmlLocalName(row_element.name) === "row") process_row(row_element, root_element);
    },
  };
  const entry = packageFile.archive.entries.get(part);
  // For a small worksheet, the asynchronous XML driver costs more than the parse. Both parsers
  // apply the same XML limits, and the declared size is checked against the inflated bytes.
  const root =
    entry && entry.uncompressedSize <= BUFFERED_WORKSHEET_XML_BYTES
      ? parseXml(await packageFile.archive.read(part), part, context, row_stream)
      : await parseXmlChunks(packageFile.archive.chunks(part), part, context, row_stream);
  assertXmlRoot(root, "worksheet", MAIN_NAMESPACES, target);
  const late_columns = xmlChild(root, "cols");
  if (
    column_styles_read &&
    !columns_precede_rows &&
    late_columns &&
    xmlChildren(late_columns, "col").some((column) => xmlAttribute(column, "style") !== undefined)
  ) {
    // Column styles apply to every row, including rows already streamed; a
    // second streamed pass is cheaper than retaining the worksheet document.
    usage.cells = cells_before_sheet;
    // This frame stays alive until the second pass returns; drop its cells so
    // the worksheet is not resident twice.
    cells.length = 0;
    cell_styles.clear();
    column_cells.clear();
    pending_shared_formulas.length = 0;
    shared_masters.clear();
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
  read_column_styles(root);
  const shared_formulas = shared_formula_groups(
    pending_shared_formulas,
    shared_masters,
    reference.name,
  );
  return {
    root,
    cells,
    cellStyles: cell_styles,
    columnCells: column_cells,
    sharedFormulas: shared_formulas,
    rowMeta: row_meta,
    outlineLevels: outline_levels,
    collapsedRows: collapsed_rows,
    maxRow: max_row,
    maxCol: max_col,
  };
}
