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

  const rule = tableRuleMetadata(element, styles, { remaining: MAX_TABLE_RULE_NODES });
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
function tableRuleMetadata(
  element: XmlElement,
  styles: ParsedStyles,
  budget: { remaining: number },
  depth = 0,
): WorkbookTableXmlElement | null {
  if (depth > MAX_TABLE_RULE_DEPTH || --budget.remaining < 0) return null;
  const attributes: Record<string, string> = {};
  let differentialStyle: CellStyle | undefined;
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
    differentialStyle = styles.differentialAt(index);
    if (!differentialStyle) return null;
  }
  const children: WorkbookTableXmlElement[] = [];
  for (const child of element.children) {
    const copied = tableRuleMetadata(child, styles, budget, depth + 1);
    if (!copied) return null;
    children.push(copied);
  }
  return {
    name: xmlLocalName(element.name),
    attributes,
    text: element.text,
    children,
    ...(differentialStyle ? { differentialStyle } : {}),
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
  for (const partElement of parts) {
    const relationshipId = xmlAttribute(partElement, "id");
    if (!relationshipId) return readerFailure(`tablePart in ${sheetName} has no relationship`);
    const relationship = relationships.find((candidate) => candidate.id === relationshipId);
    if (
      !relationship ||
      relationship.external ||
      !relationshipTypeMatches(relationship.type, "table")
    ) {
      return readerFailure(`tablePart relationship ${relationshipId} in ${sheetName} is invalid`);
    }
    const root = packageFile.readXml(relationship.target);
    assertXmlRoot(root, "table", MAIN_NAMESPACES, relationship.target);
    const nativeId = parseUnsigned(xmlAttribute(root, "id"), "table id");
    if (nativeId < 1) return readerFailure(`table id in ${relationship.target} is invalid`);
    const rawName = xmlAttribute(root, "displayName") ?? xmlAttribute(root, "name");
    if (!rawName) return readerFailure(`table name in ${relationship.target} is missing`);
    const nameResult = validateWorkbookTableName(decodeXstring(rawName));
    if (!nameResult.ok) {
      return readerFailure(`table name ${JSON.stringify(rawName)} is invalid (${nameResult.code})`);
    }
    const ref = xmlAttribute(root, "ref");
    if (!ref) return readerFailure(`table range in ${relationship.target} is missing`);
    const parsed = parseRange(ref);
    assertResource(context, "maxRowsPerSheet", parsed.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", parsed.c1 + 1);
    const headerCount = xmlAttribute(root, "headerRowCount");
    const totalsCount = xmlAttribute(root, "totalsRowCount");
    const headerRow =
      headerCount === undefined || parseUnsigned(headerCount, "header row count") === 1;
    const totalsRow =
      totalsCount !== undefined && parseUnsigned(totalsCount, "totals row count") === 1;
    if (
      (headerCount !== undefined && !["0", "1"].includes(headerCount)) ||
      (totalsCount !== undefined && !["0", "1"].includes(totalsCount))
    ) {
      return readerFailure(
        `table row metadata in ${relationship.target} exceeds the supported subset`,
      );
    }
    const columnCollection = xmlChild(root, "tableColumns");
    if (!columnCollection)
      return readerFailure(`table columns in ${relationship.target} are missing`);
    const declaredCount = parseUnsigned(
      xmlAttribute(columnCollection, "count"),
      "table column count",
    );
    if (declaredCount > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable) {
      return readerFailure(
        `table ${nameResult.name} exceeds the column limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable}`,
      );
    }
    const columnElements = xmlChildren(columnCollection, "tableColumn");
    if (columnElements.length !== declaredCount || parsed.c1 - parsed.c0 + 1 !== declaredCount) {
      return readerFailure(`table ${nameResult.name} column count does not match its range`);
    }
    const unsupported = new Set<WorkbookTableUnsupportedFeature>();
    // One budget per table, matching the aggregate limit core validation applies.
    const copyBudget = { remaining: MAX_TABLE_RULE_NODES };
    const validationBudget = { nodes: 0, characters: 0 };
    const readRule = (
      element: XmlElement | undefined,
      feature: WorkbookTableUnsupportedFeature,
    ): WorkbookTableXmlElement | undefined => {
      if (!element) return undefined;
      const name = xmlLocalName(element.name);
      const rule = tableRuleMetadata(element, styles, copyBudget);
      if (
        !rule ||
        (name.endsWith("Formula") && formulaContainsExternalReference(decodeXstring(rule.text))) ||
        !validWorkbookTableXmlElement(rule, name, validationBudget)
      ) {
        unsupported.add(feature);
        emitWarning(context, {
          code: "unsupported-feature",
          message: `Invalid, oversized, external-data or unsupported ${name} rule on table ${nameResult.name} was dropped`,
          sheet: sheetName,
          part: relationship.target,
        });
        return undefined;
      }
      return rule;
    };
    const columns = columnElements.map((column, index) => {
      const id = parseUnsigned(xmlAttribute(column, "id"), "table column id");
      const name = xmlAttribute(column, "name");
      if (id < 1 || !name) return readerFailure(`table column ${index + 1} is invalid`);
      const totalsRowLabel = xmlAttribute(column, "totalsRowLabel");
      const calculatedColumnFormula = readRule(
        xmlChild(column, "calculatedColumnFormula"),
        "calculated-columns",
      );
      const totalsRowFormula = readRule(xmlChild(column, "totalsRowFormula"), "totals-functions");
      const rawTotalsFunction = xmlAttribute(column, "totalsRowFunction");
      const totalsRowFunction = TABLE_TOTALS_FUNCTIONS.find(
        (candidate) => candidate === rawTotalsFunction,
      );
      if (rawTotalsFunction !== undefined && totalsRowFunction === undefined) {
        return readerFailure(`table column ${index + 1} has an invalid totals-row function`);
      }
      return {
        id: `xlsx-table-${nativeId}-column-${id}`,
        name: decodeXstring(name),
        ...(totalsRowLabel !== undefined ? { totalsRowLabel: decodeXstring(totalsRowLabel) } : {}),
        ...(calculatedColumnFormula ? { calculatedColumnFormula } : {}),
        ...(totalsRowFormula ? { totalsRowFormula } : {}),
        ...(totalsRowFunction !== undefined &&
        !(xmlChild(column, "totalsRowFormula") && !totalsRowFormula)
          ? { totalsRowFunction }
          : {}),
      };
    });
    const markUnsupported = (feature: WorkbookTableUnsupportedFeature, detail: string): void => {
      if (unsupported.has(feature)) return;
      unsupported.add(feature);
      emitWarning(context, {
        code: "unsupported-feature",
        message: `${detail} was preserved as unsupported metadata on table ${nameResult.name} and was not activated`,
        sheet: sheetName,
        part: relationship.target,
      });
    };
    const autoFilter = readRule(xmlChild(root, "autoFilter"), "auto-filter");
    const sortState = readRule(xmlChild(root, "sortState"), "sort-state");
    if (columnElements.some((column) => xmlChild(column, "calculatedColumnFormulaArray"))) {
      markUnsupported("calculated-columns", "Non-standard Excel table calculated-column arrays");
    }
    if (xmlAttribute(root, "connectionId") !== undefined) {
      markUnsupported("external-data", "Excel table external-data binding");
    }
    if (xmlChild(root, "extLst")) markUnsupported("extensions", "Excel table extensions");
    const tableRelationships = packageFile.relationships(relationship.target);
    if (
      tableRelationships.some((candidate) => relationshipTypeMatches(candidate.type, "queryTable"))
    ) {
      markUnsupported("query-table", "Excel query-table binding");
    }
    const styleElement = xmlChild(root, "tableStyleInfo");
    const styleName = styleElement ? xmlAttribute(styleElement, "name") : undefined;
    tables.push({
      id: `xlsx-table-${nativeId}`,
      name: nameResult.name,
      range: {
        start: { row: parsed.r0, col: parsed.c0 },
        end: { row: parsed.r1, col: parsed.c1 },
      },
      columns,
      headerRow,
      totalsRow,
      ...(autoFilter ? { autoFilter } : {}),
      ...(sortState ? { sortState } : {}),
      ...(styleElement
        ? {
            style: {
              ...(styleName ? { name: decodeXstring(styleName) } : {}),
              showFirstColumn: xmlBoolean(xmlAttribute(styleElement, "showFirstColumn")),
              showLastColumn: xmlBoolean(xmlAttribute(styleElement, "showLastColumn")),
              showRowStripes: xmlBoolean(xmlAttribute(styleElement, "showRowStripes")),
              showColumnStripes: xmlBoolean(xmlAttribute(styleElement, "showColumnStripes")),
            },
          }
        : {}),
      ...(unsupported.size > 0 ? { unsupportedFeatures: [...unsupported] } : {}),
    });
  }
  return tables;
}
