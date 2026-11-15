import type { SheetSnapshot } from "@sheetwrite/core";
import { MAX_HYPERLINK_DISPLAY_LENGTH } from "@sheetwrite/core";

import { OpcPackage, relationshipTypeMatches } from "./opc.js";
import { isRetainedRelationship } from "./preservation.js";
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
function outlineRowGroups(
  levels: ReadonlyMap<number, number>,
  collapsedRows: ReadonlySet<number>,
  hiddenRows: ReadonlySet<number>,
): RowGroups {
  const rows = Uint32Array.from(levels.keys()).sort();
  const rowLevels = Uint8Array.from(rows, (row) => levels.get(row) ?? 0);
  const maxLevel = rowLevels.reduce((maximum, level) => Math.max(maximum, level), 0);
  const groups: RowGroups = [];

  for (let level = 1; level <= maxLevel; level++) {
    let start = -1;
    let end = -1;
    let allHidden = true;
    const close = (): void => {
      const collapsed = collapsedRows.has(end + 1) || collapsedRows.has(end) || allHidden;
      groups.push({ start, end, collapsed });
    };

    rows.forEach((row, index) => {
      if ((rowLevels[index] ?? 0) < level) return;

      if (start >= 0 && row === end + 1) {
        end = row;
        allHidden &&= hiddenRows.has(row);
        return;
      }

      if (start >= 0) close();
      start = row;
      end = row;
      allHidden = hiddenRows.has(row);
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
    cellStyles,
    columnCells,
    sharedFormulas,
    rowMeta,
    outlineLevels,
    collapsedRows,
    maxRow: rowMaximum,
    maxCol: colMaximum,
  } = await ingestWorksheetRows(
    packageFile,
    reference,
    styles,
    sharedStrings,
    context,
    usage,
    date1904,
  );
  let maxRow = rowMaximum;
  let maxCol = colMaximum;

  const dimension = xmlAttribute(
    xmlChild(root, "dimension") ?? { attributes: {}, children: [], name: "", text: "" },
    "ref",
  );
  if (dimension) {
    const range = parseRange(dimension);
    assertResource(context, "maxRowsPerSheet", range.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", range.c1 + 1);
    maxRow = Math.max(maxRow, range.r1);
    maxCol = Math.max(maxCol, range.c1);
  }

  const columns = parseColumns(root, styles, context, reference.relationship.target);
  for (const index of columns.keys()) maxCol = Math.max(maxCol, index);
  const mergeCollection = xmlChild(root, "mergeCells");
  const mergeElements = mergeCollection ? xmlChildren(mergeCollection, "mergeCell") : [];
  usage.merges += mergeElements.length;
  assertResource(context, "maxMerges", usage.merges);
  const merges = mergeElements.map((merge) => {
    const value = xmlAttribute(merge, "ref");
    if (!value) return readerFailure(`merge in ${reference.name} has no range`);
    const parsed = parseRange(value);
    maxRow = Math.max(maxRow, parsed.r1);
    maxCol = Math.max(maxCol, parsed.c1);
    return parsed;
  });
  assertResource(context, "maxRowsPerSheet", maxRow + 1);
  assertResource(context, "maxColumnsPerSheet", maxCol + 1);

  const hiddenOutlineRows = new Set(
    rowMeta.filter(([, metadata]) => metadata.hidden).map(([row]) => row),
  );
  const rowGroups = outlineRowGroups(outlineLevels, collapsedRows, hiddenOutlineRows);

  const view = xmlChildren(xmlChild(root, "sheetViews") ?? root, "sheetView").at(-1);
  const pane = view ? xmlChild(view, "pane") : undefined;
  const paneState = pane ? xmlAttribute(pane, "state") : undefined;
  const frozen = pane && (paneState === "frozen" || paneState === "frozenSplit");
  const frozenRows = frozen ? Number(xmlAttribute(pane, "ySplit") ?? 0) : 0;
  const frozenCols = frozen ? Number(xmlAttribute(pane, "xSplit") ?? 0) : 0;
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
  if (pane && paneState === "split") {
    emitWarning(context, {
      code: "unsupported-feature",
      message: "Split-pane worksheet view presentation was dropped",
      sheet: reference.name,
    });
  }

  const validationCollection = xmlChild(root, "dataValidations");
  const validations = validationCollection
    ? xmlChildren(validationCollection, "dataValidation").flatMap((validation) =>
        parseValidation(validation, context, reference.name, date1904),
      )
    : [];
  const conditionalFormats = parseConditionalFormats(root, styles, reference.name, context);
  const sortState = parseSortState(root, styles, context, reference.name);

  const relationships = packageFile.relationships(reference.relationship.target);
  const hyperlinkCollection = xmlChild(root, "hyperlinks");
  const hyperlinks = parseHyperlinks(hyperlinkCollection, relationships, reference.name, context);
  let missingDisplays: Map<string, number[]> | undefined;
  for (const [index, hyperlink] of hyperlinks.entries()) {
    if (hyperlink.display !== undefined) continue;
    missingDisplays ??= new Map();
    const key = `${hyperlink.range.start.row}:${hyperlink.range.start.col}`;
    const indices = missingDisplays.get(key) ?? [];
    indices.push(index);
    missingDisplays.set(key, indices);
  }
  if (missingDisplays) {
    for (const cell of cells) {
      const indices = missingDisplays.get(`${cell.rowOffset}:${cell.colOffset}`);
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
    maxRow = Math.max(maxRow, hyperlink.range.end.row);
    maxCol = Math.max(maxCol, hyperlink.range.end.col);
  }
  for (const rule of conditionalFormats) {
    maxRow = Math.max(maxRow, rule.range.end.row);
    maxCol = Math.max(maxCol, rule.range.end.col);
  }
  assertResource(context, "maxRowsPerSheet", maxRow + 1);
  assertResource(context, "maxColumnsPerSheet", maxCol + 1);

  const extensionList = xmlChild(root, "extLst");
  const hasConditionalFormatExtensions =
    extensionList !== undefined && xmlHasDescendant(extensionList, "conditionalFormattings");
  if (hasConditionalFormatExtensions) {
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
    cellStyles,
    columnCells,
    sharedFormulas,
    rowCount: Math.max(0, maxRow + 1),
    columnCount: Math.max(1, maxCol + 1),
    columns,
    rowMeta,
    merges,
    rowGroups,
    ...(Number.isInteger(frozenRows) && frozenRows > 0 ? { frozenRows } : {}),
    ...(Number.isInteger(frozenCols) && frozenCols > 0 ? { frozenCols } : {}),
    validations,
    conditionalFormats,
    ...(sortState ? { sortState } : {}),
    notes: comments.comments,
    hyperlinks,
    hasUnsupportedValidation: Boolean(validationCollection && validations.length === 0),
    tables,
    hasConditionalFormatting: root.children.some(
      (child) => xmlLocalName(child.name) === "conditionalFormatting",
    ),
    hasRowOutlines: outlineLevels.size > 0,
    hasProtection: Boolean(xmlChild(root, "sheetProtection")),
    hasAutoFilter: Boolean(xmlChild(root, "autoFilter")),
    hasValidationCollection: Boolean(validationCollection),
    hasComments: comments.present,
    hasHyperlinks: hyperlinkCollection !== undefined,
    hasConditionalFormatExtensions,
  };
}
