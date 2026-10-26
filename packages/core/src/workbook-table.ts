import { colToA1, labelToCol } from "./a1.js";
import { SheetwriteError } from "./errors.js";
import { sanitizeHyperlinkStyle } from "./hyperlink.js";
import type { Sheet } from "./types/document.js";
import type {
  WorkbookTable,
  WorkbookTableColumn,
  WorkbookTableStyle,
  WorkbookTableUnsupportedFeature,
  WorkbookTableXmlElement,
} from "./types/table.js";

/** Resource ceilings for canonical workbook-table metadata and identifiers. */
export interface WorkbookTableResourceLimits {
  maxTables: number;
  maxColumnsPerTable: number;
  maxNameLength: number;
  maxIdLength: number;
  maxStyleNameLength: number;
  maxUnsupportedFeaturesPerTable: number;
}

/** Independent metadata ceilings enforced before table arrays cross the WASM boundary. */
export const DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS: Readonly<WorkbookTableResourceLimits> =
  Object.freeze({
    maxTables: 1_024,
    maxColumnsPerTable: 16_384,
    maxNameLength: 255,
    maxIdLength: 128,
    maxStyleNameLength: 255,
    maxUnsupportedFeaturesPerTable: 16,
  });

/** Stable reason code returned when a workbook table name is rejected. */
export type WorkbookTableNameIssueCode =
  | "empty"
  | "too-long"
  | "invalid-characters"
  | "cell-reference"
  | "duplicate";

/** Result of validating and NFC-normalizing a workbook table name. */
export type WorkbookTableNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; code: WorkbookTableNameIssueCode };

const TABLE_NAME = /^[\p{L}_\\][\p{L}\p{N}_.\\]*$/u;
const A1_REFERENCE = /^[A-Za-z]{1,3}[1-9][0-9]*$/;
const R1C1_REFERENCE = /^R[1-9][0-9]*C[1-9][0-9]*$/i;
const UNSUPPORTED_FEATURES: Readonly<Record<WorkbookTableUnsupportedFeature, true>> = Object.freeze(
  {
    "auto-filter": true,
    "sort-state": true,
    "calculated-columns": true,
    "totals-functions": true,
    "query-table": true,
    "external-data": true,
    extensions: true,
  },
);

/** Locale-independent key used for table and table-column collision checks. */
export function workbookTableNameKey(name: string): string {
  return name.normalize("NFC").toUpperCase();
}

/** Validate and NFC-normalize an ECMA-compatible structured-reference name. */
export function validateWorkbookTableName(
  input: string,
  existingNames: readonly string[] = [],
  maxLength = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxNameLength,
): WorkbookTableNameValidationResult {
  const name = input.normalize("NFC");
  if (name.length === 0) return { ok: false, code: "empty" };
  if (name.length > maxLength) return { ok: false, code: "too-long" };
  if (!TABLE_NAME.test(name)) return { ok: false, code: "invalid-characters" };
  if (A1_REFERENCE.test(name) || R1C1_REFERENCE.test(name)) {
    return { ok: false, code: "cell-reference" };
  }
  const key = workbookTableNameKey(name);
  if (existingNames.some((candidate) => workbookTableNameKey(candidate) === key)) {
    return { ok: false, code: "duplicate" };
  }
  return { ok: true, name };
}

function validId(value: string, limits: Readonly<WorkbookTableResourceLimits>): boolean {
  return value.length > 0 && value.length <= limits.maxIdLength;
}

const TABLE_RULE_MAX_DEPTH = 8;
const TABLE_RULE_MAX_NODES = 16_384;
const TABLE_RULE_MAX_TEXT = 1_048_576;
const TABLE_RULE_FIELDS = new Set(["name", "attributes", "text", "children", "differentialStyle"]);
const INVALID_XML_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u;
const TABLE_RULE_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  autoFilter: ["filterColumn", "sortState"],
  filterColumn: ["filters", "customFilters", "top10", "dynamicFilter", "colorFilter", "iconFilter"],
  filters: ["filter", "dateGroupItem"],
  customFilters: ["customFilter"],
  sortState: ["sortCondition"],
  filter: [],
  dateGroupItem: [],
  customFilter: [],
  top10: [],
  dynamicFilter: [],
  colorFilter: [],
  iconFilter: [],
  sortCondition: [],
  calculatedColumnFormula: [],
  totalsRowFormula: [],
};
const TABLE_RULE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  autoFilter: ["ref"],
  filterColumn: ["colId", "hiddenButton", "showButton"],
  filters: ["blank", "calendarType"],
  filter: ["val"],
  dateGroupItem: ["year", "month", "day", "hour", "minute", "second", "dateTimeGrouping"],
  customFilters: ["and"],
  customFilter: ["operator", "val"],
  top10: ["top", "percent", "val", "filterVal"],
  dynamicFilter: ["type", "val", "maxVal", "valIso", "maxValIso"],
  colorFilter: ["cellColor"],
  iconFilter: ["iconSet", "iconId"],
  sortState: ["ref", "columnSort", "caseSensitive", "sortMethod"],
  sortCondition: ["ref", "descending", "sortBy", "iconSet", "iconId", "customList"],
  calculatedColumnFormula: ["array"],
  totalsRowFormula: ["array"],
};
const TOTALS_FUNCTIONS = new Set([
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
]);

/**
 * Validate inert table-rule trees before they enter snapshots or XML output.
 * A whitelist prevents this persistence seam from becoming arbitrary markup.
 */
export function validWorkbookTableXmlElement(
  value: unknown,
  expectedName: string,
  budget = { nodes: 0, characters: 0 },
): boolean {
  const visit = (candidate: unknown, allowed: readonly string[], depth: number): boolean => {
    if (depth > TABLE_RULE_MAX_DEPTH || ++budget.nodes > TABLE_RULE_MAX_NODES) return false;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const element = candidate as Record<string, unknown>;
    if (Object.keys(element).some((key) => !TABLE_RULE_FIELDS.has(key))) return false;
    if (typeof element.name !== "string" || !allowed.includes(element.name)) return false;
    const attributes = element.attributes;
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return false;
    const allowedAttributes = TABLE_RULE_ATTRIBUTES[element.name];
    const allowedChildren = TABLE_RULE_CHILDREN[element.name];
    if (!allowedAttributes || !allowedChildren) return false;
    if (typeof element.text !== "string" || !Array.isArray(element.children)) return false;
    if (INVALID_XML_CONTROL.test(element.text)) return false;
    if (element.differentialStyle !== undefined) {
      if (
        (element.name !== "colorFilter" && element.name !== "sortCondition") ||
        sanitizeHyperlinkStyle(element.differentialStyle) === null
      )
        return false;
    }
    if (element.name === "colorFilter" && element.differentialStyle === undefined) return false;
    if (element.name === "sortCondition") {
      const sortBy = (attributes as Record<string, unknown>).sortBy;
      if (
        (sortBy === "cellColor" || sortBy === "fontColor") &&
        element.differentialStyle === undefined
      )
        return false;
    }
    budget.characters += element.text.length;
    for (const [name, attribute] of Object.entries(attributes)) {
      if (
        !allowedAttributes.includes(name) ||
        typeof attribute !== "string" ||
        INVALID_XML_CONTROL.test(attribute)
      )
        return false;
      budget.characters += name.length + attribute.length;
    }
    if (budget.characters > TABLE_RULE_MAX_TEXT) return false;
    for (const child of element.children) {
      if (!visit(child, allowedChildren, depth + 1)) return false;
    }
    return true;
  };
  return visit(value, [expectedName], 0);
}

const COLUMN_SPAN_REF = /^\$?([A-Za-z]{1,3})(\$?\d*)(?::\$?([A-Za-z]{1,3})(\$?\d*))?$/u;

/**
 * Move one stored A1 span through a column remap, keeping its row parts.
 * Returns null when the span is unreadable or either edge column was deleted.
 */
function remapColumnSpan(
  ref: string | undefined,
  remap: (col: number) => number | null,
): string | null {
  const match = COLUMN_SPAN_REF.exec(ref ?? "");
  const startLabel = match?.[1];
  if (!match || !startLabel) return null;
  const start = remap(labelToCol(startLabel.toUpperCase()));
  const end = remap(labelToCol((match[3] ?? startLabel).toUpperCase()));
  if (start === null || end === null) return null;
  const startRow = match[2] ?? "";
  const endRow = match[3] ? (match[4] ?? "") : startRow;
  return `${colToA1(start)}${startRow}:${colToA1(end)}${endRow}`;
}

/**
 * Carry a table's persisted filter and sort rules through a column insert or
 * delete. Rules on deleted columns are dropped, as Excel does; surviving
 * filter column indexes and sort-condition columns follow their columns.
 * `remap` maps an old absolute sheet column to its new one, or null if deleted.
 */
export function remapWorkbookTableRuleColumns(
  table: WorkbookTable,
  remap: (col: number) => number | null,
  newStart: number,
  newEnd: number,
): Pick<WorkbookTable, "autoFilter" | "sortState"> {
  const oldStart = table.range.start.col;
  // Table-wide refs: map the old outer edges onto the new table edges.
  const edges = (col: number): number => (col <= oldStart ? newStart : newEnd);
  const tableRef = (rule: WorkbookTableXmlElement): Record<string, string> => {
    const ref = remapColumnSpan(rule.attributes.ref, edges);
    return ref === null ? rule.attributes : { ...rule.attributes, ref };
  };
  const sortState = (rule: WorkbookTableXmlElement): WorkbookTableXmlElement | undefined => {
    const children: WorkbookTableXmlElement[] = [];
    for (const condition of rule.children) {
      const ref = remapColumnSpan(condition.attributes.ref, remap);
      if (ref !== null) {
        children.push({ ...condition, attributes: { ...condition.attributes, ref } });
      }
    }
    return children.length > 0 ? { ...rule, attributes: tableRef(rule), children } : undefined;
  };
  let autoFilter: WorkbookTableXmlElement | undefined;
  if (table.autoFilter) {
    const children: WorkbookTableXmlElement[] = [];
    for (const child of table.autoFilter.children) {
      if (child.name === "sortState") {
        const remapped = sortState(child);
        if (remapped) children.push(remapped);
        continue;
      }
      const colId = Number(child.attributes.colId);
      // An unreadable colId cannot follow its column; drop it like a deleted one.
      if (!Number.isSafeInteger(colId) || colId < 0) continue;
      const moved = remap(oldStart + colId);
      if (moved === null) continue;
      children.push({
        ...child,
        attributes: { ...child.attributes, colId: `${moved - newStart}` },
      });
    }
    autoFilter = { ...table.autoFilter, attributes: tableRef(table.autoFilter), children };
  }
  const remappedSort = table.sortState ? sortState(table.sortState) : undefined;
  return {
    ...(autoFilter ? { autoFilter } : {}),
    ...(remappedSort ? { sortState: remappedSort } : {}),
  };
}

function validColumn(
  column: WorkbookTableColumn,
  names: Set<string>,
  ids: Set<string>,
  limits: Readonly<WorkbookTableResourceLimits>,
  budget: { nodes: number; characters: number },
): boolean {
  const idKey = workbookTableNameKey(column.id);
  if (!validId(column.id, limits) || column.id !== column.id.normalize("NFC") || ids.has(idKey)) {
    return false;
  }
  if (
    column.name.length === 0 ||
    column.name.length > limits.maxNameLength ||
    column.name !== column.name.normalize("NFC") ||
    /[[\],]/u.test(column.name) ||
    column.name.startsWith("@") ||
    column.name.startsWith("#")
  ) {
    return false;
  }
  const key = workbookTableNameKey(column.name);
  if (names.has(key)) return false;
  if (column.totalsRowLabel !== undefined && column.totalsRowLabel.length > limits.maxNameLength) {
    return false;
  }
  if (column.totalsRowFunction !== undefined && !TOTALS_FUNCTIONS.has(column.totalsRowFunction)) {
    return false;
  }
  if (
    column.totalsRowFormula !== undefined &&
    !validWorkbookTableXmlElement(column.totalsRowFormula, "totalsRowFormula", budget)
  )
    return false;
  if (
    column.calculatedColumnFormula !== undefined &&
    !validWorkbookTableXmlElement(column.calculatedColumnFormula, "calculatedColumnFormula", budget)
  )
    return false;
  ids.add(idKey);
  names.add(key);
  return true;
}

function validStyle(
  style: WorkbookTableStyle | undefined,
  limits: Readonly<WorkbookTableResourceLimits>,
): boolean {
  if (!style) return true;
  if (style.name !== undefined && style.name.length > limits.maxStyleNameLength) return false;
  return [
    style.showFirstColumn,
    style.showLastColumn,
    style.showRowStripes,
    style.showColumnStripes,
  ].every((value) => value === undefined || typeof value === "boolean");
}

/** Validate one canonical table against sheet bounds and workbook-global identities. */
export function validWorkbookTable(
  table: WorkbookTable,
  sheet: Sheet,
  existing: readonly WorkbookTable[],
  limits: Readonly<WorkbookTableResourceLimits> = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
): boolean {
  if (!validId(table.id, limits) || existing.some((candidate) => candidate.id === table.id)) {
    return false;
  }
  const validatedName = validateWorkbookTableName(
    table.name,
    existing.map((candidate) => candidate.name),
    limits.maxNameLength,
  );
  if (!validatedName.ok || validatedName.name !== table.name) return false;
  if (table.range.sheet !== sheet.id) return false;
  const r0 = Math.min(table.range.start.row, table.range.end.row);
  const r1 = Math.max(table.range.start.row, table.range.end.row);
  const c0 = Math.min(table.range.start.col, table.range.end.col);
  const c1 = Math.max(table.range.start.col, table.range.end.col);
  if (
    table.range.start.row !== r0 ||
    table.range.end.row !== r1 ||
    table.range.start.col !== c0 ||
    table.range.end.col !== c1
  ) {
    return false;
  }
  if (
    !Number.isSafeInteger(r0) ||
    !Number.isSafeInteger(r1) ||
    !Number.isSafeInteger(c0) ||
    !Number.isSafeInteger(c1) ||
    r0 < 0 ||
    c0 < 0 ||
    r1 >= sheet.rowCount ||
    c1 >= sheet.columns.length
  ) {
    return false;
  }
  const width = c1 - c0 + 1;
  if (width > limits.maxColumnsPerTable || table.columns.length !== width) return false;
  if (typeof table.headerRow !== "boolean" || typeof table.totalsRow !== "boolean") return false;
  if (table.headerRow && table.totalsRow && r0 === r1) return false;
  const columnNames = new Set<string>();
  const columnIds = new Set<string>();
  const ruleBudget = { nodes: 0, characters: 0 };
  if (
    !table.columns.every((column) =>
      validColumn(column, columnNames, columnIds, limits, ruleBudget),
    )
  ) {
    return false;
  }
  if (!validStyle(table.style, limits)) return false;
  if (
    table.autoFilter !== undefined &&
    !validWorkbookTableXmlElement(table.autoFilter, "autoFilter", ruleBudget)
  )
    return false;
  if (
    table.sortState !== undefined &&
    !validWorkbookTableXmlElement(table.sortState, "sortState", ruleBudget)
  )
    return false;
  if (
    (table.unsupportedFeatures?.length ?? 0) > limits.maxUnsupportedFeaturesPerTable ||
    new Set(table.unsupportedFeatures).size !== (table.unsupportedFeatures?.length ?? 0) ||
    table.unsupportedFeatures?.some((feature) => UNSUPPORTED_FEATURES[feature] !== true)
  ) {
    return false;
  }
  return !existing.some((candidate) => {
    if (candidate.range.sheet !== table.range.sheet) return false;
    const otherR0 = Math.min(candidate.range.start.row, candidate.range.end.row);
    const otherR1 = Math.max(candidate.range.start.row, candidate.range.end.row);
    const otherC0 = Math.min(candidate.range.start.col, candidate.range.end.col);
    const otherC1 = Math.max(candidate.range.start.col, candidate.range.end.col);
    return r0 <= otherR1 && r1 >= otherR0 && c0 <= otherC1 && c1 >= otherC0;
  });
}

/** Reject an invalid or oversized live workbook before table arrays are copied to WASM. */
export function assertWorkbookTables(
  sheets: readonly Sheet[],
  limits: Readonly<WorkbookTableResourceLimits> = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  reservedNames: readonly string[] = [],
): void {
  const tableCount = sheets.reduce((count, sheet) => count + (sheet.tables?.length ?? 0), 0);
  if (tableCount > limits.maxTables) {
    throw new SheetwriteError(
      "resource-limit",
      "snapshot-allocate",
      `Sheetwrite: workbook table limit is ${limits.maxTables}; observed ${tableCount}`,
      { context: { resource: "tables", limit: limits.maxTables, actual: tableCount } },
    );
  }
  const reserved = new Set(reservedNames.map(workbookTableNameKey));
  const accepted: WorkbookTable[] = [];
  for (const sheet of sheets) {
    for (const table of sheet.tables ?? []) {
      if (
        reserved.has(workbookTableNameKey(table.name)) ||
        !validWorkbookTable(table, sheet, accepted, limits)
      ) {
        throw new SheetwriteError(
          "invalid-snapshot",
          "snapshot-allocate",
          `Sheetwrite: invalid or namespace-conflicting workbook table ${table.id || "<empty>"}`,
          { context: { tableId: table.id, sheet: sheet.id } },
        );
      }
      accepted.push(table);
    }
  }
}
