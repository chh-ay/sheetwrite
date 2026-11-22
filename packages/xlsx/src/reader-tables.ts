import type {
  CellStyle,
  WorkbookTableTotalsFunction,
  WorkbookTableUnsupportedFeature,
  WorkbookTableXmlElement,
} from "@sheetwrite/core";
import {
  DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  validateWorkbookTableName,
  validWorkbookTableXmlElement,
} from "@sheetwrite/core";
import { formulaContainsExternalReference } from "@sheetwrite/core/external-links";

import { MAIN_NAMESPACES } from "./format.js";
import { OpcPackage, type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import type { ParsedSheet } from "./reader-types.js";
import { readerFailure, parseUnsigned, parseRange } from "./reader-values.js";
import { assertResource, emitWarning, type XlsxCodecContext } from "./resources.js";
import { ParsedStyles } from "./styles.js";
import {
  assertXmlRoot,
  decodeXstring,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlLocalName,
} from "./xml.js";

/**
 * The worksheet `sortState`. Excel writes it after a sort whose cells it
 * already moved, so it is kept for export and not applied as a view sort.
 */
export function parseSortState(
  root: XmlElement,
  styles: ParsedStyles,
  context: XlsxCodecContext,
  sheetName: string,
): WorkbookTableXmlElement | undefined {
  const element = xmlChild(root, "sortState");
  if (!element) return undefined;

  const rule = table_rule_metadata(element, styles, { remaining: MAX_TABLE_RULE_NODES });
  if (rule && validWorkbookTableXmlElement(rule, "sortState")) return rule;

  emitWarning(context, {
    code: "unsupported-feature",
    message: "Invalid or oversized worksheet sortState was dropped",
    sheet: sheetName,
  });
  return undefined;
}

const MAX_TABLE_RULE_DEPTH = 8;
const MAX_TABLE_RULE_NODES = 16_384;
const TABLE_TOTALS_FUNCTIONS: readonly WorkbookTableTotalsFunction[] = [
  "none",
  "sum",
  "min",
  "max",
  "average",
  "count",
  "countNums",
  "stdDev",
  "var",
  "custom",
];

/**
 * Copy one table rule tree, resolving `dxfId` into its differential style.
 * Returns null for a rule that cannot be kept (too deep, too large, or a
 * missing style), so the caller drops only that rule instead of the workbook.
 */
function table_rule_metadata(
  element: XmlElement,
  styles: ParsedStyles,
  budget: { remaining: number },
  depth = 0,
): WorkbookTableXmlElement | null {
  if (depth > MAX_TABLE_RULE_DEPTH || --budget.remaining < 0) return null;
  const attributes: Record<string, string> = {};
  let differential_style: CellStyle | undefined;
  for (const [name, value] of Object.entries(element.attributes)) {
    // Prefixed attributes (xmlns, xr:uid revision ids, other mc:Ignorable
    // namespaces) carry no rule meaning and are not part of the persisted subset.
    if (name === "xmlns" || name.includes(":")) continue;
    if (name !== "dxfId") {
      attributes[name] = value;
      continue;
    }
    const index = Number(value);
    if (!Number.isSafeInteger(index) || index < 0) return null;
    differential_style = styles.differentialAt(index);
    if (!differential_style) return null;
  }
  const children: WorkbookTableXmlElement[] = [];
  for (const child of element.children) {
    const copied = table_rule_metadata(child, styles, budget, depth + 1);
    if (!copied) return null;
    children.push(copied);
  }
  return {
    name: xmlLocalName(element.name),
    attributes,
    text: element.text,
    children,
    ...(differential_style ? { differentialStyle: differential_style } : {}),
  };
}

export function parseTables(
  packageFile: OpcPackage,
  worksheetRoot: XmlElement,
  relationships: readonly OpcRelationship[],
  sheetName: string,
  context: XlsxCodecContext,
  styles: ParsedStyles,
): ParsedSheet["tables"] {
  const collection = xmlChild(worksheetRoot, "tableParts");
  if (!collection) return [];
  const parts = xmlChildren(collection, "tablePart");
  if (parts.length > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables) {
    return readerFailure(
      `worksheet ${sheetName} exceeds the workbook table limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables}`,
    );
  }
  const tables: ParsedSheet["tables"] = [];
  for (const part_element of parts) {
    const relationship_id = xmlAttribute(part_element, "id");
    if (!relationship_id) return readerFailure(`tablePart in ${sheetName} has no relationship`);
    const relationship = relationships.find((candidate) => candidate.id === relationship_id);
    if (
      !relationship ||
      relationship.external ||
      !relationshipTypeMatches(relationship.type, "table")
    ) {
      return readerFailure(`tablePart relationship ${relationship_id} in ${sheetName} is invalid`);
    }
    const root = packageFile.readXml(relationship.target);
    assertXmlRoot(root, "table", MAIN_NAMESPACES, relationship.target);
    const native_id = parseUnsigned(xmlAttribute(root, "id"), "table id");
    if (native_id < 1) return readerFailure(`table id in ${relationship.target} is invalid`);
    const raw_name = xmlAttribute(root, "displayName") ?? xmlAttribute(root, "name");
    if (!raw_name) return readerFailure(`table name in ${relationship.target} is missing`);
    const name_result = validateWorkbookTableName(decodeXstring(raw_name));
    if (!name_result.ok) {
      return readerFailure(
        `table name ${JSON.stringify(raw_name)} is invalid (${name_result.code})`,
      );
    }
    const ref = xmlAttribute(root, "ref");
    if (!ref) return readerFailure(`table range in ${relationship.target} is missing`);
    const parsed = parseRange(ref);
    assertResource(context, "maxRowsPerSheet", parsed.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", parsed.c1 + 1);
    const header_count = xmlAttribute(root, "headerRowCount");
    const totals_count = xmlAttribute(root, "totalsRowCount");
    const header_row =
      header_count === undefined || parseUnsigned(header_count, "header row count") === 1;
    const totals_row =
      totals_count !== undefined && parseUnsigned(totals_count, "totals row count") === 1;
    if (
      (header_count !== undefined && !["0", "1"].includes(header_count)) ||
      (totals_count !== undefined && !["0", "1"].includes(totals_count))
    ) {
      return readerFailure(
        `table row metadata in ${relationship.target} exceeds the supported subset`,
      );
    }
    const column_collection = xmlChild(root, "tableColumns");
    if (!column_collection)
      return readerFailure(`table columns in ${relationship.target} are missing`);
    const declared_count = parseUnsigned(
      xmlAttribute(column_collection, "count"),
      "table column count",
    );
    if (declared_count > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable) {
      return readerFailure(
        `table ${name_result.name} exceeds the column limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable}`,
      );
    }
    const column_elements = xmlChildren(column_collection, "tableColumn");
    if (column_elements.length !== declared_count || parsed.c1 - parsed.c0 + 1 !== declared_count) {
      return readerFailure(`table ${name_result.name} column count does not match its range`);
    }
    const unsupported = new Set<WorkbookTableUnsupportedFeature>();
    // One budget per table, matching the aggregate limit core validation applies.
    const copy_budget = { remaining: MAX_TABLE_RULE_NODES };
    const validation_budget = { nodes: 0, characters: 0 };
    const read_rule = (
      element: XmlElement | undefined,
      feature: WorkbookTableUnsupportedFeature,
    ): WorkbookTableXmlElement | undefined => {
      if (!element) return undefined;
      const name = xmlLocalName(element.name);
      const rule = table_rule_metadata(element, styles, copy_budget);
      if (
        !rule ||
        (name.endsWith("Formula") && formulaContainsExternalReference(decodeXstring(rule.text))) ||
        !validWorkbookTableXmlElement(rule, name, validation_budget)
      ) {
        unsupported.add(feature);
        emitWarning(context, {
          code: "unsupported-feature",
          message: `Invalid, oversized, external-data or unsupported ${name} rule on table ${name_result.name} was dropped`,
          sheet: sheetName,
          part: relationship.target,
        });
        return undefined;
      }
      return rule;
    };
    const columns = column_elements.map((column, index) => {
      const id = parseUnsigned(xmlAttribute(column, "id"), "table column id");
      const name = xmlAttribute(column, "name");
      if (id < 1 || !name) return readerFailure(`table column ${index + 1} is invalid`);
      const totals_row_label = xmlAttribute(column, "totalsRowLabel");
      const calculated_column_formula = read_rule(
        xmlChild(column, "calculatedColumnFormula"),
        "calculated-columns",
      );
      const totals_row_formula = read_rule(
        xmlChild(column, "totalsRowFormula"),
        "totals-functions",
      );
      const raw_totals_function = xmlAttribute(column, "totalsRowFunction");
      const totals_row_function = TABLE_TOTALS_FUNCTIONS.find(
        (candidate) => candidate === raw_totals_function,
      );
      if (raw_totals_function !== undefined && totals_row_function === undefined) {
        return readerFailure(`table column ${index + 1} has an invalid totals-row function`);
      }
      return {
        id: `xlsx-table-${native_id}-column-${id}`,
        name: decodeXstring(name),
        ...(totals_row_label !== undefined
          ? { totalsRowLabel: decodeXstring(totals_row_label) }
          : {}),
        ...(calculated_column_formula
          ? { calculatedColumnFormula: calculated_column_formula }
          : {}),
        ...(totals_row_formula ? { totalsRowFormula: totals_row_formula } : {}),
        ...(totals_row_function !== undefined &&
        !(xmlChild(column, "totalsRowFormula") && !totals_row_formula)
          ? { totalsRowFunction: totals_row_function }
          : {}),
      };
    });
    const mark_unsupported = (feature: WorkbookTableUnsupportedFeature, detail: string): void => {
      if (unsupported.has(feature)) return;
      unsupported.add(feature);
      emitWarning(context, {
        code: "unsupported-feature",
        message: `${detail} was preserved as unsupported metadata on table ${name_result.name} and was not activated`,
        sheet: sheetName,
        part: relationship.target,
      });
    };
    const auto_filter = read_rule(xmlChild(root, "autoFilter"), "auto-filter");
    const sort_state = read_rule(xmlChild(root, "sortState"), "sort-state");
    if (column_elements.some((column) => xmlChild(column, "calculatedColumnFormulaArray"))) {
      mark_unsupported("calculated-columns", "Non-standard Excel table calculated-column arrays");
    }
    if (xmlAttribute(root, "connectionId") !== undefined) {
      mark_unsupported("external-data", "Excel table external-data binding");
    }
    if (xmlChild(root, "extLst")) mark_unsupported("extensions", "Excel table extensions");
    const table_relationships = packageFile.relationships(relationship.target);
    if (
      table_relationships.some((candidate) => relationshipTypeMatches(candidate.type, "queryTable"))
    ) {
      mark_unsupported("query-table", "Excel query-table binding");
    }
    const style_element = xmlChild(root, "tableStyleInfo");
    const style_name = style_element ? xmlAttribute(style_element, "name") : undefined;
    tables.push({
      id: `xlsx-table-${native_id}`,
      name: name_result.name,
      range: {
        start: { row: parsed.r0, col: parsed.c0 },
        end: { row: parsed.r1, col: parsed.c1 },
      },
      columns,
      headerRow: header_row,
      totalsRow: totals_row,
      ...(auto_filter ? { autoFilter: auto_filter } : {}),
      ...(sort_state ? { sortState: sort_state } : {}),
      ...(style_element
        ? {
            style: {
              ...(style_name ? { name: decodeXstring(style_name) } : {}),
              showFirstColumn: xmlBoolean(xmlAttribute(style_element, "showFirstColumn")),
              showLastColumn: xmlBoolean(xmlAttribute(style_element, "showLastColumn")),
              showRowStripes: xmlBoolean(xmlAttribute(style_element, "showRowStripes")),
              showColumnStripes: xmlBoolean(xmlAttribute(style_element, "showColumnStripes")),
            },
          }
        : {}),
      ...(unsupported.size > 0 ? { unsupportedFeatures: [...unsupported] } : {}),
    });
  }
  return tables;
}
