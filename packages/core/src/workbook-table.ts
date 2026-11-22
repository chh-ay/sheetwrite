import { colToA1, labelToCol } from "./a1.js";
import { sanitizeCellStyle } from "./cell-style-fields.js";
import { SheetwriteError } from "./errors.js";
import { formulaNameKey } from "./name-key.js";
import { rangesIntersect } from "./store/ranges.js";
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
  /** The largest number of tables in one workbook; defaults to 1,024. */
  maxTables: number;
  /** The largest number of columns in one table; defaults to 16,384. */
  maxColumnsPerTable: number;
  /** The longest table or column name, in UTF-16 code units; defaults to 255. */
  maxNameLength: number;
  /** The longest table or column ID, in UTF-16 code units; defaults to 128. */
  maxIdLength: number;
  /** The longest table style name, in UTF-16 code units; defaults to 255. */
  maxStyleNameLength: number;
  /** The largest number of kept Excel features that Sheetwrite does not model, on one table; defaults to 16. */
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

/**
 * Locale-independent key used for table and table-column collision checks.
 *
 * @param name - A table or column name.
 * @returns The name in NFC form and upper case, so names that differ only in case match.
 */
export function workbookTableNameKey(name: string): string {
  return formulaNameKey(name);
}

/**
 * Validate and NFC-normalize an ECMA-compatible structured-reference name.
 *
 * @param input - The name to check, such as `Sales_2024`.
 * @param existingNames - Names already in use; a match, ignoring case, gives `duplicate`.
 * @param maxLength - The longest allowed name, in UTF-16 code units; defaults to 255.
 */
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

function valid_id(value: string, limits: Readonly<WorkbookTableResourceLimits>): boolean {
  return value.length > 0 && value.length <= limits.maxIdLength;
}

const TABLE_RULE_MAX_DEPTH = 8;
const TABLE_RULE_MAX_NODES = 16_384;
const TABLE_RULE_MAX_TEXT = 1_048_576;
const TABLE_RULE_FIELDS = new Set(["name", "attributes", "text", "children", "differentialStyle"]);
const XML_TAB = 0x09;
const XML_LINE_FEED = 0x0a;
const XML_CARRIAGE_RETURN = 0x0d;
const XML_FIRST_PRINTABLE = 0x20;
const XML_NONCHARACTER_FFFE = 0xfffe;
const XML_NONCHARACTER_FFFF = 0xffff;

/** XML 1.0 forbids these code units; a char-code scan avoids a control-character regex. */
function has_invalid_xml_character(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (
      (code < XML_FIRST_PRINTABLE &&
        code !== XML_TAB &&
        code !== XML_LINE_FEED &&
        code !== XML_CARRIAGE_RETURN) ||
      code === XML_NONCHARACTER_FFFE ||
      code === XML_NONCHARACTER_FFFF
    ) {
      return true;
    }
  }
  return false;
}
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
 *
 * @param value - The rule tree to check, from outside your code.
 * @param expectedName - The element name the root must have, such as `autoFilter`.
 * @param budget - Node and text counters shared across several calls; omit for one tree.
 * @returns `true` when the tree is within the allowed elements, depth and size.
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
    const allowed_attributes = TABLE_RULE_ATTRIBUTES[element.name];
    const allowed_children = TABLE_RULE_CHILDREN[element.name];
    if (!allowed_attributes || !allowed_children) return false;
    if (typeof element.text !== "string" || !Array.isArray(element.children)) return false;
    if (has_invalid_xml_character(element.text)) return false;
    if (element.differentialStyle !== undefined) {
      if (
        (element.name !== "colorFilter" && element.name !== "sortCondition") ||
        sanitizeCellStyle(element.differentialStyle) === null
      )
        return false;
    }

    if (element.name === "colorFilter" && element.differentialStyle === undefined) return false;
    if (element.name === "sortCondition") {
      const sort_by = (attributes as Record<string, unknown>).sortBy;
      if (
        (sort_by === "cellColor" || sort_by === "fontColor") &&
        element.differentialStyle === undefined
      )
        return false;
    }

    budget.characters += element.text.length;
    for (const [name, attribute] of Object.entries(attributes)) {
      if (
        !allowed_attributes.includes(name) ||
        typeof attribute !== "string" ||
        has_invalid_xml_character(attribute)
      )
        return false;
      budget.characters += name.length + attribute.length;
    }

    if (budget.characters > TABLE_RULE_MAX_TEXT) return false;
    for (const child of element.children) {
      if (!visit(child, allowed_children, depth + 1)) return false;
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
function remap_column_span(
  ref: string | undefined,
  remap: (col: number) => number | null,
): string | null {
  const match = COLUMN_SPAN_REF.exec(ref ?? "");
  const start_label = match?.[1];
  if (!match || !start_label) return null;
  const start = remap(labelToCol(start_label.toUpperCase()));
  const end = remap(labelToCol((match[3] ?? start_label).toUpperCase()));
  if (start === null || end === null) return null;
  const start_row = match[2] ?? "";
  const end_row = match[3] ? (match[4] ?? "") : start_row;
  return `${colToA1(start)}${start_row}:${colToA1(end)}${end_row}`;
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
  const old_start = table.range.start.col;
  // Table-wide refs: map the old outer edges onto the new table edges.
  const edges = (col: number): number => (col <= old_start ? newStart : newEnd);
  const table_ref = (rule: WorkbookTableXmlElement): Record<string, string> => {
    const ref = remap_column_span(rule.attributes.ref, edges);
    return ref === null ? rule.attributes : { ...rule.attributes, ref };
  };

  const sort_state = (rule: WorkbookTableXmlElement): WorkbookTableXmlElement | undefined => {
    const children: WorkbookTableXmlElement[] = [];
    for (const condition of rule.children) {
      const ref = remap_column_span(condition.attributes.ref, remap);
      if (ref !== null) {
        children.push({ ...condition, attributes: { ...condition.attributes, ref } });
      }
    }

    return children.length > 0 ? { ...rule, attributes: table_ref(rule), children } : undefined;
  };

  let auto_filter: WorkbookTableXmlElement | undefined;
  if (table.autoFilter) {
    const children: WorkbookTableXmlElement[] = [];
    for (const child of table.autoFilter.children) {
      if (child.name === "sortState") {
        const remapped = sort_state(child);
        if (remapped) children.push(remapped);
        continue;
      }

      const col_id = Number(child.attributes.colId);
      // An unreadable colId cannot follow its column; drop it like a deleted one.
      if (!Number.isSafeInteger(col_id) || col_id < 0) continue;
      const moved = remap(old_start + col_id);
      if (moved === null) continue;
      children.push({
        ...child,
        attributes: { ...child.attributes, colId: `${moved - newStart}` },
      });
    }

    auto_filter = { ...table.autoFilter, attributes: table_ref(table.autoFilter), children };
  }

  const remapped_sort = table.sortState ? sort_state(table.sortState) : undefined;
  return {
    ...(auto_filter ? { autoFilter: auto_filter } : {}),
    ...(remapped_sort ? { sortState: remapped_sort } : {}),
  };
}

function valid_column(
  column: WorkbookTableColumn,
  names: Set<string>,
  ids: Set<string>,
  limits: Readonly<WorkbookTableResourceLimits>,
  budget: { nodes: number; characters: number },
): boolean {
  const id_key = workbookTableNameKey(column.id);
  if (!valid_id(column.id, limits) || column.id !== column.id.normalize("NFC") || ids.has(id_key)) {
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
  ids.add(id_key);
  names.add(key);
  return true;
}

function valid_style(
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

/**
 * Validate one canonical table against sheet bounds and workbook-global identities.
 *
 * @param table - The table to check.
 * @param sheet - The sheet the table is on; the table must fit inside it.
 * @param existing - Tables already accepted; the new one must not share an ID or
 *   name with them, or overlap them.
 * @param limits - The limits to check against; defaults to the built-in limits.
 * @returns `true` when the table is valid.
 */
export function validWorkbookTable(
  table: WorkbookTable,
  sheet: Sheet,
  existing: readonly WorkbookTable[],
  limits: Readonly<WorkbookTableResourceLimits> = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
): boolean {
  if (!valid_id(table.id, limits) || existing.some((candidate) => candidate.id === table.id)) {
    return false;
  }

  const validated_name = validateWorkbookTableName(
    table.name,
    existing.map((candidate) => candidate.name),
    limits.maxNameLength,
  );
  if (!validated_name.ok || validated_name.name !== table.name) return false;
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
  const column_names = new Set<string>();
  const column_ids = new Set<string>();
  const rule_budget = { nodes: 0, characters: 0 };
  if (
    !table.columns.every((column) =>
      valid_column(column, column_names, column_ids, limits, rule_budget),
    )
  ) {
    return false;
  }

  if (!valid_style(table.style, limits)) return false;
  if (
    table.autoFilter !== undefined &&
    !validWorkbookTableXmlElement(table.autoFilter, "autoFilter", rule_budget)
  )
    return false;
  if (
    table.sortState !== undefined &&
    !validWorkbookTableXmlElement(table.sortState, "sortState", rule_budget)
  )
    return false;
  if (
    (table.unsupportedFeatures?.length ?? 0) > limits.maxUnsupportedFeaturesPerTable ||
    new Set(table.unsupportedFeatures).size !== (table.unsupportedFeatures?.length ?? 0) ||
    table.unsupportedFeatures?.some((feature) => UNSUPPORTED_FEATURES[feature] !== true)
  ) {
    return false;
  }

  return !existing.some((candidate) => rangesIntersect(candidate.range, table.range));
}

/**
 * Reject an invalid or oversized live workbook before table arrays are copied to WASM.
 *
 * @param sheets - The workbook's sheets, with their tables.
 * @param limits - The limits to check against; defaults to the built-in limits.
 * @param reservedNames - Names tables must not use, such as the workbook's defined names.
 * @throws SheetwriteError with code `resource-limit` when there are too many tables,
 *   and `invalid-snapshot` when a table is invalid or its name is taken.
 */
export function assertWorkbookTables(
  sheets: readonly Sheet[],
  limits: Readonly<WorkbookTableResourceLimits> = DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  reservedNames: readonly string[] = [],
): void {
  const table_count = sheets.reduce((count, sheet) => count + (sheet.tables?.length ?? 0), 0);
  if (table_count > limits.maxTables) {
    throw new SheetwriteError(
      "resource-limit",
      "snapshot-allocate",
      `Sheetwrite: workbook table limit is ${limits.maxTables}; observed ${table_count}`,
      { context: { resource: "tables", limit: limits.maxTables, actual: table_count } },
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
