import type { SheetSnapshot } from "@sheetwrite/core";
import { MAX_HYPERLINK_DISPLAY_LENGTH, MAX_VALIDATION_RULES } from "@sheetwrite/core/codec";

import { OpcPackage, relationshipTypeMatches } from "./opc.js";
import { isRetainedRelationship } from "./preservation.js";
import { parseAutoFilter, rowMetaShownByFilter } from "./reader-autofilter.js";
import { parseColumns } from "./reader-columns.js";
import { parseComments } from "./reader-comments.js";
import { parseHyperlinks } from "./reader-hyperlinks.js";
import { ingestWorksheetRows } from "./reader-rows.js";
import { parseValidation, parseConditionalFormats, xmlHasDescendant } from "./reader-rules.js";
import { parseTables, parseSortState } from "./reader-tables.js";
import type { ParsedSheet, WorkbookSheetReference, ReaderResourceUsage } from "./reader-types.js";
import { readerFailure, parseRange } from "./reader-values.js";
import { assertResource, emitWarning, type XlsxCodecContext } from "./resources.js";
import { ParsedStyles } from "./styles.js";
import { xmlAttribute, xmlBoolean, xmlChild, xmlChildren, xmlLocalName } from "./xml.js";

type RowGroups = NonNullable<SheetSnapshot["rowGroups"]>;

/**
 * The row outline groups: for each level, each run of consecutive outlined
 * rows at that level or deeper. A group is collapsed when its last row or the
 * row after it is marked collapsed, or when every row of the group is hidden.
 * Each level is one walk over the outlined rows in order.
 */
function outline_row_groups(
  levels: ReadonlyMap<number, number>,
  collapsed_rows: ReadonlySet<number>,
  hidden_rows: ReadonlySet<number>,
): RowGroups {
  const rows = Uint32Array.from(levels.keys()).sort();
  const row_levels = Uint8Array.from(rows, (row) => levels.get(row) ?? 0);
  const max_level = row_levels.reduce((maximum, level) => Math.max(maximum, level), 0);
  const groups: RowGroups = [];

  for (let level = 1; level <= max_level; level++) {
    let start = -1;
    let end = -1;
    let all_hidden = true;
    const close = (): void => {
      const collapsed = collapsed_rows.has(end + 1) || collapsed_rows.has(end) || all_hidden;
      groups.push({ start, end, collapsed });
    };

    rows.forEach((row, index) => {
      if ((row_levels[index] ?? 0) < level) return;

      if (start >= 0 && row === end + 1) {
        end = row;
        all_hidden &&= hidden_rows.has(row);
        return;
      }

      if (start >= 0) close();
      start = row;
      end = row;
      all_hidden = hidden_rows.has(row);
    });

    if (start >= 0) close();
  }

  return groups;
}

/** Assemble non-row worksheet metadata after the row stream is released. */
export async function parseSheet(
  packageFile: OpcPackage,
  reference: WorkbookSheetReference,
  styles: ParsedStyles,
  sharedStrings: readonly string[],
  context: XlsxCodecContext,
  usage: ReaderResourceUsage,
  date1904: boolean,
): Promise<ParsedSheet> {
  const {
    root,
    cells,
    cellStyles: cell_styles,
    columnCells: column_cells,
    sharedFormulas: shared_formulas,
    rowMeta: row_meta,
    outlineLevels: outline_levels,
    collapsedRows: collapsed_rows,
    maxRow: row_maximum,
    maxCol: col_maximum,
  } = await ingestWorksheetRows(
    packageFile,
    reference,
    styles,
    sharedStrings,
    context,
    usage,
    date1904,
  );
  let max_row = row_maximum;
  let max_col = col_maximum;

  const dimension = xmlAttribute(
    xmlChild(root, "dimension") ?? { attributes: {}, children: [], name: "", text: "" },
    "ref",
  );
  if (dimension) {
    const range = parseRange(dimension);
    assertResource(context, "maxRowsPerSheet", range.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", range.c1 + 1);
    max_row = Math.max(max_row, range.r1);
    max_col = Math.max(max_col, range.c1);
  }

  const columns = parseColumns(root, styles, context, reference.relationship.target);
  for (const index of columns.keys()) max_col = Math.max(max_col, index);
  const merge_collection = xmlChild(root, "mergeCells");
  const merge_elements = merge_collection ? xmlChildren(merge_collection, "mergeCell") : [];
  usage.merges += merge_elements.length;
  assertResource(context, "maxMerges", usage.merges);
  const merges = merge_elements.map((merge) => {
    const value = xmlAttribute(merge, "ref");
    if (!value) return readerFailure(`merge in ${reference.name} has no range`);
    const parsed = parseRange(value);
    max_row = Math.max(max_row, parsed.r1);
    max_col = Math.max(max_col, parsed.c1);
    return parsed;
  });
  assertResource(context, "maxRowsPerSheet", max_row + 1);
  assertResource(context, "maxColumnsPerSheet", max_col + 1);

  const auto_filter = parseAutoFilter(root, context, reference.name);
  const shown_row_meta =
    auto_filter && auto_filter.columns.length > 0
      ? rowMetaShownByFilter(row_meta, auto_filter.range)
      : row_meta;
  const hidden_outline_rows = new Set(
    shown_row_meta.filter(([, metadata]) => metadata.hidden).map(([row]) => row),
  );
  const row_groups = outline_row_groups(outline_levels, collapsed_rows, hidden_outline_rows);

  const view = xmlChildren(xmlChild(root, "sheetViews") ?? root, "sheetView").at(-1);
  const pane = view ? xmlChild(view, "pane") : undefined;
  const pane_state = pane ? xmlAttribute(pane, "state") : undefined;
  const frozen = pane && (pane_state === "frozen" || pane_state === "frozenSplit");
  const frozen_rows = frozen ? Number(xmlAttribute(pane, "ySplit") ?? 0) : 0;
  const frozen_cols = frozen ? Number(xmlAttribute(pane, "xSplit") ?? 0) : 0;
  // Excel's Tab Color, as an ARGB `rgb`; theme and indexed colors are not read.
  const sheet_properties = xmlChild(root, "sheetPr");
  const tab_color_element = sheet_properties ? xmlChild(sheet_properties, "tabColor") : undefined;
  const tab_color_argb = tab_color_element ? xmlAttribute(tab_color_element, "rgb") : undefined;
  const tab_color =
    tab_color_argb && /^[\dA-Fa-f]{8}$/u.test(tab_color_argb)
      ? `#${tab_color_argb.slice(2).toUpperCase()}`
      : undefined;
  if (view && xmlBoolean(xmlAttribute(view, "rightToLeft"))) {
    emitWarning(context, {
      code: "unsupported-feature",
      message: "Right-to-left worksheet view presentation was dropped",
      sheet: reference.name,
    });
  }
  if (
    view &&
    [xmlAttribute(view, "zoomScale"), xmlAttribute(view, "zoomScaleNormal")].some(
      (value) => value !== undefined && value !== "100",
    )
  ) {
    emitWarning(context, {
      code: "unsupported-feature",
      message: "Worksheet zoom presentation was dropped",
      sheet: reference.name,
    });
  }
  if (pane && pane_state === "split") {
    emitWarning(context, {
      code: "unsupported-feature",
      message: "Split-pane worksheet view presentation was dropped",
      sheet: reference.name,
    });
  }

  const validation_collection = xmlChild(root, "dataValidations");
  const validations = validation_collection
    ? xmlChildren(validation_collection, "dataValidation").flatMap((validation) =>
        parseValidation(validation, context, reference.name, date1904),
      )
    : [];
  if (validations.length > MAX_VALIDATION_RULES) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Excel data validation rule limit ${MAX_VALIDATION_RULES} was exceeded; later rules were dropped`,
      sheet: reference.name,
    });
    validations.length = MAX_VALIDATION_RULES;
  }
  const conditional_formats = parseConditionalFormats(root, styles, reference.name, context);
  const sort_state = parseSortState(root, styles, context, reference.name);

  const relationships = packageFile.relationships(reference.relationship.target);
  const hyperlink_collection = xmlChild(root, "hyperlinks");
  const hyperlinks = parseHyperlinks(hyperlink_collection, relationships, reference.name, context);
  let missing_displays: Map<string, number[]> | undefined;
  for (const [index, hyperlink] of hyperlinks.entries()) {
    if (hyperlink.display !== undefined) continue;
    missing_displays ??= new Map();
    const key = `${hyperlink.range.start.row}:${hyperlink.range.start.col}`;
    const indices = missing_displays.get(key) ?? [];
    indices.push(index);
    missing_displays.set(key, indices);
  }
  if (missing_displays) {
    for (const cell of cells) {
      const indices = missing_displays.get(`${cell.rowOffset}:${cell.colOffset}`);
      if (!indices || cell.value.kind !== "literal" || cell.value.value === null) continue;
      const display = String(cell.value.value);
      if (display.length > MAX_HYPERLINK_DISPLAY_LENGTH) continue;
      for (const index of indices) {
        const hyperlink = hyperlinks[index];
        if (hyperlink) hyperlinks[index] = { ...hyperlink, display };
      }
    }
  }
  for (const hyperlink of hyperlinks) {
    max_row = Math.max(max_row, hyperlink.range.end.row);
    max_col = Math.max(max_col, hyperlink.range.end.col);
  }
  for (const rule of conditional_formats) {
    max_row = Math.max(max_row, rule.range.end.row);
    max_col = Math.max(max_col, rule.range.end.col);
  }
  assertResource(context, "maxRowsPerSheet", max_row + 1);
  assertResource(context, "maxColumnsPerSheet", max_col + 1);

  const extension_list = xmlChild(root, "extLst");
  const has_conditional_format_extensions =
    extension_list !== undefined && xmlHasDescendant(extension_list, "conditionalFormattings");
  if (has_conditional_format_extensions) {
    emitWarning(context, {
      code: "format-loss",
      message: "Extended conditional formatting is unsupported and was dropped",
      sheet: reference.name,
    });
  }

  const comments = parseComments(
    packageFile,
    reference.relationship.target,
    relationships,
    context,
  );
  const tables = parseTables(packageFile, root, relationships, reference.name, context, styles);
  for (const relationship of relationships) {
    if (
      ["comments", "vmlDrawing", "hyperlink", "table"].some((kind) =>
        relationshipTypeMatches(relationship.type, kind),
      ) ||
      isRetainedRelationship("sheet", relationship.type)
    ) {
      continue;
    }
    if (relationship.external) continue;
    const kind = relationship.type.slice(relationship.type.lastIndexOf("/") + 1);
    emitWarning(context, {
      code: relationshipTypeMatches(relationship.type, "externalLink")
        ? "external-relationship"
        : "unsupported-feature",
      message: `Unsupported worksheet relationship ${kind} was dropped`,
      sheet: reference.name,
      part: relationship.target,
    });
  }

  return {
    name: reference.name,
    state: reference.state,
    part: reference.relationship.target,
    cells,
    cellStyles: cell_styles,
    columnCells: column_cells,
    sharedFormulas: shared_formulas,
    rowCount: Math.max(0, max_row + 1),
    columnCount: Math.max(1, max_col + 1),
    columns,
    rowMeta: shown_row_meta,
    merges,
    rowGroups: row_groups,
    ...(Number.isInteger(frozen_rows) && frozen_rows > 0 ? { frozenRows: frozen_rows } : {}),
    ...(Number.isInteger(frozen_cols) && frozen_cols > 0 ? { frozenCols: frozen_cols } : {}),
    ...(tab_color ? { tabColor: tab_color } : {}),
    validations,
    conditionalFormats: conditional_formats,
    ...(sort_state ? { sortState: sort_state } : {}),
    ...(auto_filter ? { autoFilter: auto_filter } : {}),
    notes: comments.comments,
    hyperlinks,
    hasUnsupportedValidation: Boolean(validation_collection && validations.length === 0),
    tables,
    hasConditionalFormatting: root.children.some(
      (child) => xmlLocalName(child.name) === "conditionalFormatting",
    ),
    hasRowOutlines: outline_levels.size > 0,
    hasProtection: Boolean(xmlChild(root, "sheetProtection")),
    hasValidationCollection: Boolean(validation_collection),
    hasComments: comments.present,
    hasHyperlinks: hyperlink_collection !== undefined,
    hasConditionalFormatExtensions: has_conditional_format_extensions,
  };
}
