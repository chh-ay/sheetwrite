import type {
  CalculationSettings,
  CellHyperlink,
  CellScalar,
  CellStyle,
  CellValue,
  Column,
  ConditionalFormatPredicate,
  ConditionalFormatRule,
  DataValidationComparison,
  DataValidationCondition,
  DataValidationRule,
  MergeRange,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
  WorkbookTable,
  WorkbookTableTotalsFunction,
  WorkbookTableUnsupportedFeature,
  WorkbookTableXmlElement,
} from "@sheetwrite/core";
import {
  cellA1,
  colToA1,
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  isSafeExternalHyperlink,
  MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH,
  MAX_CONDITIONAL_FORMAT_RULES,
  MAX_HYPERLINK_DISPLAY_LENGTH,
  MAX_HYPERLINKS_PER_SHEET,
  MAX_ITERATIONS,
  sheetNameKey,
  validateSheetName,
  validateWorkbookTableName,
  validWorkbookTableXmlElement,
  withXlsxFormulaEngine,
} from "@sheetwrite/core";

import { parseCellRect, parseCellReference } from "./cell-reference.js";
import { readCharts } from "./chart-read.js";
import { hasExcelDataModel, readExcelDataModel } from "./data-model.js";
import {
  columnWidthCharacters,
  columnWidthPixels,
  isoDateSerial,
  MAIN_NAMESPACES,
  META_MARKER,
  META_STEM,
} from "./format.js";
import {
  convertFormulaSources,
  formulaContainsExternalReference,
  workbookFormulaSources,
} from "./formula.js";
import { OpcPackage, type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import { readPivots } from "./pivot.js";
import { capturePreserved, isRetainedRelationship } from "./preservation.js";
import {
  assertResource,
  boundedErrorText,
  checkAbort,
  emitWarning,
  validateCodecSnapshot,
  type XlsxCodecContext,
} from "./resources.js";
import {
  expandSharedFormulas,
  type SharedFormulaGroup,
  type SharedFormulaMember,
} from "./shared-formula.js";
import { type ParsedCellStyle, ParsedStyles } from "./styles.js";
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
  xmlRootMatches,
} from "./xml.js";
import { normalizePartName } from "./zip.js";

const BUFFERED_WORKSHEET_XML_BYTES = 64 * 1024;

/** Columns' style records and numeric literals, gathered as rows stream past. */
interface ColumnCells {
  readonly styleIndices: Set<number>;
  hasNumericValue: boolean;
}

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

const INITIAL_STYLE_INDEX_CAPACITY = 1_024;

/**
 * Style record index of each parsed cell, in cell order. The cell's own style
 * copy waits for its column's default format, which needs every row; four
 * bytes per cell keep that wait far below a second record per cell.
 */
class CellStyleIndices {
  #values = new Uint32Array(INITIAL_STYLE_INDEX_CAPACITY);
  #length = 0;

  clear(): void {
    this.#values = new Uint32Array(INITIAL_STYLE_INDEX_CAPACITY);
    this.#length = 0;
  }

  push(styleIndex: number): void {
    if (this.#length === this.#values.length) {
      const grown = new Uint32Array(this.#values.length * 2);
      grown.set(this.#values);
      this.#values = grown;
    }
    this.#values[this.#length++] = styleIndex;
  }

  get length(): number {
    return this.#length;
  }

  /** Style index of one recorded cell; the caller checks `cellIndex < length` once per sheet. */
  at(cellIndex: number): number {
    return this.#values[cellIndex] ?? 0;
  }
}

interface ParsedValidation {
  readonly range: Omit<DataValidationRule["range"], "sheet">;
  readonly condition: DataValidationCondition;
  readonly policy: DataValidationRule["policy"];
  readonly allowBlank?: boolean;
  readonly helpText?: string;
}

interface ParsedHyperlink {
  readonly range: Omit<CellHyperlink["range"], "sheet">;
  readonly target:
    | { readonly kind: "external"; readonly url: string }
    | {
        readonly kind: "internal";
        readonly sheetName: string;
        readonly range: Omit<CellHyperlink["range"], "sheet">;
      };
  readonly display?: string;
}

interface ParsedSheet {
  readonly name: string;
  readonly state: string | undefined;
  readonly part: string;
  /**
   * Output cells, built while rows stream so no second per-cell record is
   * resident; offsets are sheet coordinates and styles are attached later.
   */
  readonly cells: SnapshotCell[];
  readonly cellStyles: CellStyleIndices;
  readonly columnCells: ReadonlyMap<number, ColumnCells>;
  /** Shared formulas, expanded by the engine once every sheet is read. */
  readonly sharedFormulas: readonly SharedFormulaGroup[];
  readonly rowCount: number;
  readonly columnCount: number;
  readonly conditionalFormats: ConditionalFormatRule[];
  /** The worksheet `sortState`, kept unapplied for export. */
  readonly sortState?: WorkbookTableXmlElement;
  readonly columns: Map<number, Partial<Column>>;
  readonly rowMeta: NonNullable<SheetSnapshot["rowMeta"]>;
  readonly merges: MergeRange[];
  readonly frozenRows?: number;
  readonly frozenCols?: number;
  readonly rowGroups: NonNullable<SheetSnapshot["rowGroups"]>;
  readonly validations: ParsedValidation[];
  readonly notes: { row: number; col: number; text: string }[];
  readonly hyperlinks: ParsedHyperlink[];
  readonly tables: (Omit<WorkbookTable, "range"> & {
    readonly range: Omit<WorkbookTable["range"], "sheet">;
  })[];
  readonly hasRowOutlines: boolean;
  readonly hasUnsupportedValidation: boolean;
  readonly hasConditionalFormatting: boolean;
  readonly hasProtection: boolean;
  readonly hasAutoFilter: boolean;
  readonly hasValidationCollection: boolean;
  readonly hasComments: boolean;
  readonly hasHyperlinks: boolean;
  readonly hasConditionalFormatExtensions: boolean;
}

interface WorkbookSheetReference {
  readonly name: string;
  readonly state: string | undefined;
  readonly relationship: OpcRelationship;
}

interface ReaderResourceUsage {
  cells: number;
  merges: number;
}

function reader_failure(message: string): never {
  throw new TypeError(boundedErrorText(`Sheetwrite: invalid XLSX workbook: ${message}`));
}

/**
 * Deep copy of parser-built style data: plain objects and arrays of strings,
 * numbers and booleans. Every styled output cell needs its own copy, and this
 * is much cheaper than `structuredClone` for such small records.
 */
function copy_style_data(source: unknown): unknown {
  if (source === null || typeof source !== "object") return source;
  if (Array.isArray(source)) return source.map(copy_style_data);
  const copy: Record<string, unknown> = {};
  for (const key in source) {
    if (Object.hasOwn(source, key)) copy[key] = copy_style_data(Reflect.get(source, key));
  }
  return copy;
}

function display_text(element: XmlElement): string {
  if (xmlLocalName(element.name) === "t") return decodeXstring(element.text);
  let text = "";
  for (const child of element.children) {
    const local_name = xmlLocalName(child.name);
    if (local_name === "t") text += decodeXstring(child.text);
    else if (local_name === "r") {
      for (const run_text of xmlChildren(child, "t")) text += decodeXstring(run_text.text);
    }
  }
  return text;
}

function parse_unsigned(value: string | undefined, description: string): number {
  const text = value?.trim() ?? "";
  if (!/^\d+$/.test(text)) return reader_failure(`${description} is invalid`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) return reader_failure(`${description} is invalid`);
  return parsed;
}

function parse_range(value: string): MergeRange {
  return parseCellRect(value) ?? reader_failure(`range ${value} is invalid`);
}

function unique_sheet_id(name: string, order: number, used: Set<string>): string {
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `sheet-${order + 1}`;
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}-${suffix++}`;
  used.add(id);
  return id;
}

/**
 * The sidecar sheet that holds each worksheet's Sheetwrite metadata, by
 * worksheet order. A worksheet takes the sidecar sheet of the same name
 * first; a worksheet without one then takes the sidecar sheet at its order,
 * if no other worksheet claimed it (a renamed sheet). Each sidecar sheet and
 * each sheet ID is claimed at most once, so a sheet inserted before a known
 * sheet gets a new identity.
 */
function claim_sidecar_sheets(
  sources: readonly ParsedSheet[],
  metadata: WorkbookSnapshot | null,
  context: XlsxCodecContext,
): (SheetSnapshot | undefined)[] {
  const claims: (SheetSnapshot | undefined)[] = sources.map(() => undefined);
  if (!metadata) return claims;

  const claimed_ids = new Set<string>();
  const claim = (order: number, meta: SheetSnapshot | undefined): boolean => {
    if (!meta || claimed_ids.has(meta.id)) return false;
    claimed_ids.add(meta.id);
    claims[order] = meta;
    return true;
  };

  sources.forEach((source, order) => {
    const key = sheetNameKey(source.name);
    claim(
      order,
      metadata.sheets.find((candidate) => sheetNameKey(candidate.name) === key),
    );
  });

  sources.forEach((source, order) => {
    if (claims[order]) return;
    const ordinal = metadata.sheets.find((candidate) => candidate.order === order);
    if (!claim(order, ordinal)) return;
    emitWarning(context, {
      code: "invalid-metadata",
      message: `Reconciled renamed worksheet ${source.name} to sidecar identity by stable ordinal`,
      sheet: source.name,
    });
  });

  return claims;
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
        return reader_failure(`shared formula ${member.index} at ${member.address} has no master`);
      }

      group = { sheet, formula: master.formula, row: master.row, col: master.col, members: [] };
      groups.set(member.index, group);
    }
    group.members.push(member);
  }
  return [...groups.values()];
}

function parse_shared_strings(
  package_file: OpcPackage,
  part: string | undefined,
  context: XlsxCodecContext,
): string[] {
  if (!part) return [];
  const strings: string[] = [];
  let warned_rich_text = false;
  let warned_phonetic = false;
  const process_item = (item: XmlElement): void => {
    assertResource(context, "maxSharedStrings", strings.length + 1);
    const rich_runs = xmlChildren(item, "r");
    if (rich_runs.length > 0 && !warned_rich_text) {
      warned_rich_text = true;
      emitWarning(context, {
        code: "rich-text",
        message: "Rich text formatting was flattened",
        part,
      });
    }
    if (!warned_phonetic && (xmlChildren(item, "rPh").length > 0 || xmlChild(item, "phoneticPr"))) {
      warned_phonetic = true;
      emitWarning(context, {
        code: "rich-text",
        message: "Phonetic guide text was omitted from the displayed shared string",
        part,
      });
    }
    strings.push(display_text(item));
  };
  const name = normalizePartName(part);
  const root = parseXml(package_file.read(name), name, context, {
    parent: "sst",
    parentIsRoot: true,
    shouldStream: (root_element) => xmlRootMatches(root_element, "sst", MAIN_NAMESPACES),
    // The tree path reads only `si` children; other children are skipped alike.
    child: (item) => {
      if (xmlLocalName(item.name) === "si") process_item(item);
    },
  });
  assertXmlRoot(root, "sst", MAIN_NAMESPACES, part);
  return strings;
}

function literal_from_cell(
  cell: XmlElement,
  type: string | undefined,
  shared_strings: readonly string[],
  style: ParsedCellStyle,
  context: XlsxCodecContext,
  sheet: string,
  address: string,
  date1904: boolean,
): CellValue | null {
  const value_text = xmlChild(cell, "v")?.text ?? "";
  if (type === "inlineStr") {
    const inline = xmlChild(cell, "is") ?? cell;
    if (xmlChildren(inline, "r").length > 0) {
      emitWarning(context, {
        code: "rich-text",
        message: "Inline rich text formatting was flattened",
        sheet,
        cell: address,
      });
    }
    if (xmlChildren(inline, "rPh").length > 0 || xmlChild(inline, "phoneticPr")) {
      emitWarning(context, {
        code: "rich-text",
        message: "Phonetic guide text was omitted from the displayed inline string",
        sheet,
        cell: address,
      });
    }
    return { kind: "literal", value: display_text(inline) };
  }
  if (type === "s") {
    const index = parse_unsigned(value_text, `shared string index at ${address}`);
    const value = shared_strings[index];
    if (value === undefined)
      return reader_failure(`shared string index ${index} at ${address} is out of range`);
    return { kind: "literal", value };
  }
  if (type === "str") return { kind: "literal", value: decodeXstring(value_text) };
  if (type === "b")
    return { kind: "literal", value: value_text === "1" || value_text.toLowerCase() === "true" };
  if (type === "d") {
    const serial =
      isoDateSerial(value_text) ?? reader_failure(`date value at ${address} is invalid`);
    return { kind: "literal", value: serial };
  }
  if (type === "e") {
    emitWarning(context, {
      code: "unsupported-cell-value",
      message: "Unbound Excel error was preserved as text",
      sheet,
      cell: address,
    });
    return { kind: "literal", value: value_text };
  }
  if (value_text === "") return style.style ? { kind: "literal", value: null } : null;
  const number = Number(value_text);
  if (!Number.isFinite(number)) return reader_failure(`numeric value at ${address} is invalid`);
  return { kind: "literal", value: style.date && date1904 ? number + 1462 : number };
}

function parse_validation(
  element: XmlElement,
  context: XlsxCodecContext,
  sheet: string,
  date1904: boolean,
): ParsedValidation[] {
  const type = xmlAttribute(element, "type") ?? "none";
  const ranges = (xmlAttribute(element, "sqref") ?? "").trim().split(/\s+/).filter(Boolean);
  const formula1 = xmlChild(element, "formula1")?.text;
  const formula2 = xmlChild(element, "formula2")?.text;
  let condition: DataValidationCondition | undefined;
  if (type === "list" && formula1?.startsWith('"') && formula1.endsWith('"')) {
    const body = formula1.slice(1, -1);
    const values: CellScalar[] = [];
    let value = "";
    for (let index = 0; index <= body.length; index++) {
      const character = body[index];
      if (character === '"' && body[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === "," || index === body.length) {
        const decoded = decodeXstring(value);
        values.push(decoded === "TRUE" ? true : decoded === "FALSE" ? false : decoded);
        value = "";
      } else {
        value += character ?? "";
      }
    }
    condition = { kind: "list", values };
  } else if (type === "decimal" || type === "whole" || type === "date" || type === "textLength") {
    let first = formula1 === undefined ? undefined : Number(formula1);
    let second = formula2 === undefined ? undefined : Number(formula2);
    if (
      (first !== undefined && !Number.isFinite(first)) ||
      (second !== undefined && !Number.isFinite(second))
    ) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Formula-based Excel validation was dropped",
        sheet,
      });
      return [];
    }
    if (type === "date" && date1904) {
      if (first !== undefined) first += 1462;
      if (second !== undefined) second += 1462;
    }
    const operator = xmlAttribute(element, "operator") ?? "between";
    const bounds: { min?: number; max?: number } = {};
    let comparison: DataValidationComparison | undefined;
    if (operator === "between" && first !== undefined && second !== undefined && first <= second) {
      bounds.min = first;
      bounds.max = second;
    } else if (
      operator === "notBetween" &&
      first !== undefined &&
      second !== undefined &&
      first <= second
    ) {
      comparison = { operator, min: first, max: second };
    } else if (operator === "equal" && first !== undefined) {
      bounds.min = first;
      bounds.max = first;
    } else if (operator === "greaterThanOrEqual" && first !== undefined) {
      bounds.min = first;
    } else if (operator === "lessThanOrEqual" && first !== undefined) {
      bounds.max = first;
    } else if (
      (operator === "notEqual" || operator === "greaterThan" || operator === "lessThan") &&
      first !== undefined
    ) {
      comparison = { operator, value: first };
    } else {
      emitWarning(context, {
        code: "validation-loss",
        message: `Excel validation operator ${operator} could not be represented without broadening and was dropped`,
        sheet,
      });
      return [];
    }
    const text_length_operand_valid =
      comparison === undefined
        ? (bounds.min === undefined || (Number.isSafeInteger(bounds.min) && bounds.min >= 0)) &&
          (bounds.max === undefined || (Number.isSafeInteger(bounds.max) && bounds.max >= 0))
        : "value" in comparison
          ? Number.isSafeInteger(comparison.value) && comparison.value >= 0
          : Number.isSafeInteger(comparison.min) &&
            comparison.min >= 0 &&
            Number.isSafeInteger(comparison.max) &&
            comparison.max >= 0;
    if (type === "textLength" && !text_length_operand_valid) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Non-integer or negative text-length validation was dropped",
        sheet,
      });
      return [];
    }
    const comparison_fields = comparison === undefined ? bounds : { comparison };
    condition =
      type === "date"
        ? { kind: "date", ...comparison_fields }
        : type === "textLength"
          ? { kind: "textLength", ...comparison_fields }
          : {
              kind: "number",
              ...comparison_fields,
              ...(type === "whole" ? { integer: true } : {}),
            };
  }
  if (!condition || ranges.length === 0) {
    emitWarning(context, {
      code: "validation-loss",
      message: `Excel validation type ${type} was dropped`,
      sheet,
    });
    return [];
  }
  const show_error = xmlBoolean(xmlAttribute(element, "showErrorMessage"));
  const error_style = xmlAttribute(element, "errorStyle") ?? "stop";
  const policy: DataValidationRule["policy"] = !show_error
    ? "allow"
    : error_style === "stop"
      ? "reject"
      : "warn";
  const prompt = xmlAttribute(element, "prompt");
  const error = xmlAttribute(element, "error");
  let help_text = prompt ?? error;
  if (prompt !== undefined && error !== undefined && prompt !== error) {
    emitWarning(context, {
      code: "validation-loss",
      message: "Distinct Excel validation prompt and error text were reduced to the prompt",
      sheet,
    });
  }
  if (help_text && Array.from(help_text).length > 255) {
    emitWarning(context, {
      code: "validation-loss",
      message: "Excel validation prompt/error exceeded 255 characters and was dropped",
      sheet,
    });
    help_text = undefined;
  }
  return ranges.map((range_text) => {
    const range = parse_range(range_text);
    return {
      range: { start: { row: range.r0, col: range.c0 }, end: { row: range.r1, col: range.c1 } },
      condition: structuredClone(condition),
      policy,
      allowBlank: xmlBoolean(xmlAttribute(element, "allowBlank")),
      ...(help_text ? { helpText: decodeXstring(help_text) } : {}),
    };
  });
}

function conditional_scalar(formula: string | undefined): CellScalar | undefined {
  if (formula === undefined) return undefined;
  const value = formula.trim();
  if (/^TRUE$/i.test(value)) return true;
  if (/^FALSE$/i.test(value)) return false;
  if (value.startsWith('"') && value.endsWith('"')) {
    return decodeXstring(value.slice(1, -1).replaceAll('""', '"'));
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parse_conditional_formats(
  root: XmlElement,
  styles: ParsedStyles,
  sheet: string,
  context: XlsxCodecContext,
): ConditionalFormatRule[] {
  const parsed: { priority: number; order: number; rule: ConditionalFormatRule }[] = [];
  let source_order = 0;
  const dropped = (message: string): void =>
    emitWarning(context, { code: "format-loss", message, sheet });
  for (const collection of xmlChildren(root, "conditionalFormatting")) {
    const ranges = (xmlAttribute(collection, "sqref") ?? "").trim().split(/\s+/).filter(Boolean);
    for (const element of xmlChildren(collection, "cfRule")) {
      const order = source_order++;
      const type = xmlAttribute(element, "type") ?? "(missing)";
      if (type === "colorScale" || type === "dataBar" || type === "iconSet") {
        dropped(`Excel conditional-format rule type ${type} is unsupported and was dropped`);
        continue;
      }
      const raw_priority = xmlAttribute(element, "priority");
      const priority = raw_priority === undefined ? Number.MAX_SAFE_INTEGER : Number(raw_priority);
      if (!Number.isSafeInteger(priority) || priority < 0) {
        dropped("Excel conditional-format rule has an invalid priority and was dropped");
        continue;
      }
      const operator = xmlAttribute(element, "operator");
      const raw_formula = xmlChild(element, "formula")?.text;
      const formula = raw_formula === undefined ? undefined : decodeXstring(raw_formula.trim());
      let when: ConditionalFormatPredicate | undefined;
      if (type === "cellIs") {
        const value = conditional_scalar(formula);
        if (value !== undefined) {
          when =
            operator === "greaterThan" && typeof value === "number"
              ? { kind: "greaterThan", value }
              : operator === "lessThan" && typeof value === "number"
                ? { kind: "lessThan", value }
                : operator === "equal"
                  ? { kind: "equal", value }
                  : undefined;
        }
      } else if (type === "containsBlanks") {
        when = { kind: "equal", value: null };
      } else if (type === "containsText") {
        const text = xmlAttribute(element, "text");
        if (text !== undefined) when = { kind: "contains", text: decodeXstring(text) };
      } else if (type === "expression" && formula) {
        const match = /^ISNUMBER\(FIND\("((?:[^"]|"")*)",[^)]+\)\)$/i.exec(formula);
        when = match
          ? {
              kind: "contains",
              text: decodeXstring(match[1]!.replaceAll('""', '"')),
              matchCase: true,
            }
          : { kind: "formula", source: formula.startsWith("=") ? formula : `=${formula}` };
      }
      if (!when || ranges.length === 0) {
        dropped(`Excel conditional-format rule type ${type} is unsupported and was dropped`);
        continue;
      }
      if (when.kind === "formula" && when.source.length > MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH) {
        dropped(
          `Excel conditional-format formula exceeds ${MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH} characters and was dropped`,
        );
        continue;
      }
      if (when.kind === "formula" && formulaContainsExternalReference(when.source)) {
        dropped("External-data conditional-format formula was dropped");
        continue;
      }
      const raw_dxf = xmlAttribute(element, "dxfId");
      const differential =
        raw_dxf !== undefined && /^\d+$/.test(raw_dxf)
          ? styles.differentialAt(Number(raw_dxf))
          : undefined;
      if (raw_dxf !== undefined && !differential) {
        dropped(
          `Excel conditional-format rule type ${type} has an invalid differential style and was dropped`,
        );
        continue;
      }
      const style: CellStyle = differential ?? {};
      for (const range_text of ranges) {
        const range = parse_range(range_text);
        parsed.push({
          priority,
          order,
          rule: {
            range: {
              sheet,
              start: { row: range.r0, col: range.c0 },
              end: { row: range.r1, col: range.c1 },
            },
            when: structuredClone(when),
            style: structuredClone(style),
            ...(xmlBoolean(xmlAttribute(element, "stopIfTrue")) ? { stopIfTrue: true } : {}),
          },
        });
      }
    }
  }
  parsed.sort((left, right) => left.priority - right.priority || left.order - right.order);
  if (parsed.length > MAX_CONDITIONAL_FORMAT_RULES) {
    dropped(
      `Excel conditional-format rule limit ${MAX_CONDITIONAL_FORMAT_RULES} was exceeded; later rules were dropped`,
    );
    parsed.length = MAX_CONDITIONAL_FORMAT_RULES;
  }
  return parsed.map((entry) => entry.rule);
}

function xml_has_descendant(element: XmlElement, local_name: string): boolean {
  return element.children.some(
    (child) => xmlLocalName(child.name) === local_name || xml_has_descendant(child, local_name),
  );
}

function parse_hyperlink_location(
  value: string,
  current_sheet: string,
): { sheetName: string; range: Omit<CellHyperlink["range"], "sheet"> } | null {
  const location = decodeXstring(value).replace(/^#/, "");
  const separator = location.lastIndexOf("!");
  let sheet_name = current_sheet;
  let range_text = location;
  if (separator >= 0) {
    const raw_sheet = location.slice(0, separator);
    range_text = location.slice(separator + 1);
    if (raw_sheet.startsWith("'") && raw_sheet.endsWith("'")) {
      sheet_name = raw_sheet.slice(1, -1).replaceAll("''", "'");
    } else {
      sheet_name = raw_sheet;
    }
  }
  if (!sheet_name || !range_text) return null;
  try {
    const parsed = parse_range(range_text.replaceAll("$", ""));
    return {
      sheetName: sheet_name,
      range: {
        start: { row: parsed.r0, col: parsed.c0 },
        end: { row: parsed.r1, col: parsed.c1 },
      },
    };
  } catch (error) {
    // An unreadable internal location makes only this hyperlink unusable.
    if (error instanceof TypeError) return null;
    throw error;
  }
}

function parse_hyperlinks(
  collection: XmlElement | undefined,
  relationships: readonly OpcRelationship[],
  sheet: string,
  context: XlsxCodecContext,
): ParsedHyperlink[] {
  if (!collection) return [];
  const elements = xmlChildren(collection, "hyperlink");
  if (elements.length > MAX_HYPERLINKS_PER_SHEET) {
    emitWarning(context, {
      code: "hyperlink",
      message: `Excel hyperlink limit ${MAX_HYPERLINKS_PER_SHEET} was exceeded; later hyperlinks were dropped`,
      sheet,
    });
  }
  const result: ParsedHyperlink[] = [];
  for (const element of elements.slice(0, MAX_HYPERLINKS_PER_SHEET)) {
    const reference = xmlAttribute(element, "ref");
    if (!reference) return reader_failure(`hyperlink in ${sheet} has no source range`);
    const source = parse_range(reference);
    const range = {
      start: { row: source.r0, col: source.c0 },
      end: { row: source.r1, col: source.c1 },
    };
    const relationship_id = xmlAttribute(element, "id");
    const location = xmlAttribute(element, "location");
    const display = xmlAttribute(element, "display");
    if (display !== undefined && display.length > MAX_HYPERLINK_DISPLAY_LENGTH) {
      emitWarning(context, {
        code: "hyperlink",
        message: `Excel hyperlink display text exceeds ${MAX_HYPERLINK_DISPLAY_LENGTH} characters and the hyperlink was dropped`,
        sheet,
        cell: reference,
      });
      continue;
    }
    if (xmlAttribute(element, "tooltip") !== undefined) {
      emitWarning(context, {
        code: "hyperlink",
        message: "Hyperlink tooltip is unsupported and was dropped",
        sheet,
        cell: reference,
      });
    }
    if (relationship_id && location) {
      emitWarning(context, {
        code: "hyperlink",
        message: "Hyperlink combined relationship and location is unsupported and was dropped",
        sheet,
        cell: reference,
      });
      continue;
    }
    if (relationship_id) {
      const relationship = relationships.find((candidate) => candidate.id === relationship_id);
      if (!relationship || !relationshipTypeMatches(relationship.type, "hyperlink")) {
        return reader_failure(`hyperlink relationship ${relationship_id} in ${sheet} is invalid`);
      }
      if (!relationship.external) {
        emitWarning(context, {
          code: "hyperlink",
          message: "Internal package-part hyperlink relationships are unsupported and were dropped",
          sheet,
          cell: reference,
          part: relationship.target,
        });
        continue;
      }
      if (!isSafeExternalHyperlink(relationship.target)) {
        emitWarning(context, {
          code: "hyperlink",
          message:
            "Hyperlink external target is not an absolute HTTPS or mailto URL and was dropped",
          sheet,
          cell: reference,
        });
        continue;
      }
      result.push({
        range,
        target: { kind: "external", url: relationship.target },
        ...(display !== undefined ? { display: decodeXstring(display) } : {}),
      });
      continue;
    }
    if (location) {
      const target = parse_hyperlink_location(location, sheet);
      if (!target) {
        emitWarning(context, {
          code: "hyperlink",
          message: "Hyperlink internal location is malformed and was dropped",
          sheet,
          cell: reference,
        });
        continue;
      }
      result.push({
        range,
        target: { kind: "internal", ...target },
        ...(display !== undefined ? { display: decodeXstring(display) } : {}),
      });
      continue;
    }
    emitWarning(context, {
      code: "hyperlink",
      message: "Hyperlink has no target and was dropped",
      sheet,
      cell: reference,
    });
  }
  return result;
}

/**
 * The worksheet `sortState`. Excel writes it after a sort whose cells it
 * already moved, so it is kept for export and not applied as a view sort.
 */
function parse_sort_state(
  root: XmlElement,
  styles: ParsedStyles,
  context: XlsxCodecContext,
  sheet_name: string,
): WorkbookTableXmlElement | undefined {
  const element = xmlChild(root, "sortState");
  if (!element) return undefined;

  const rule = table_rule_metadata(element, styles, { remaining: MAX_TABLE_RULE_NODES });
  if (rule && validWorkbookTableXmlElement(rule, "sortState")) return rule;

  emitWarning(context, {
    code: "unsupported-feature",
    message: "Invalid or oversized worksheet sortState was dropped",
    sheet: sheet_name,
  });
  return undefined;
}

function parse_comments(
  package_file: OpcPackage,
  sheet_part: string,
  relationships: readonly OpcRelationship[],
  context: XlsxCodecContext,
): { comments: { row: number; col: number; text: string }[]; present: boolean } {
  const relationship = relationships.find(
    (candidate) => relationshipTypeMatches(candidate.type, "comments") && !candidate.external,
  );
  if (!relationship) return { comments: [], present: false };
  const root = package_file.readXml(relationship.target);
  assertXmlRoot(root, "comments", MAIN_NAMESPACES, relationship.target);
  const list = xmlChild(root, "commentList");
  if (!list) return { comments: [], present: true };
  const comments = xmlChildren(list, "comment").map((comment) => {
    const reference = xmlAttribute(comment, "ref");
    if (!reference) return reader_failure(`comment in ${sheet_part} has no cell reference`);
    const address =
      parseCellReference(reference) ?? reader_failure(`cell reference ${reference} is invalid`);
    const text = xmlChild(comment, "text") ?? comment;
    if (xmlChildren(text, "r").length > 0) {
      emitWarning(context, {
        code: "rich-text",
        message: "Comment rich text formatting was flattened",
        part: relationship.target,
        cell: reference,
      });
    }
    return { ...address, text: display_text(text) };
  });
  return { comments, present: true };
}

/**
 * For each column, the index of the last declaration in `spans` that covers
 * it, or -1. `spans` holds each declaration's first and last zero-based
 * column. A later declaration wins, as in Excel. Declarations are visited
 * last to first and each column is claimed once, so overlapping full-width
 * declarations cost one pass over the columns, not one per declaration.
 */
function last_column_declarations(spans: readonly number[]): Int32Array {
  let column_count = 0;
  for (let at = 1; at < spans.length; at += 2) {
    column_count = Math.max(column_count, (spans[at] ?? 0) + 1);
  }

  const owners = new Int32Array(column_count).fill(-1);
  // `next_free[col]` leads to the first unclaimed column at or after `col`.
  const next_free = Int32Array.from({ length: column_count + 1 }, (_, col) => col);
  const first_free = (col: number): number => {
    let free = col;
    while (next_free[free] !== free) free = next_free[free] ?? column_count;

    // Point every column on the walked path at the answer, so no path is walked twice.
    let step = col;
    while (step !== free) {
      const next = next_free[step] ?? column_count;
      next_free[step] = free;
      step = next;
    }
    return free;
  };

  for (let declaration = spans.length / 2 - 1; declaration >= 0; declaration--) {
    const first = spans[declaration * 2] ?? 0;
    const last = spans[declaration * 2 + 1] ?? -1;
    for (let col = first_free(first); col <= last; col = first_free(col + 1)) {
      owners[col] = declaration;
      next_free[col] = col + 1;
    }
  }

  return owners;
}
function parse_columns(
  root: XmlElement,
  styles: ParsedStyles,
  context: XlsxCodecContext,
  part: string,
): Map<number, Partial<Column>> {
  const columns = new Map<number, Partial<Column>>();
  const collection = xmlChild(root, "cols");
  if (!collection) return columns;

  const spans: number[] = [];
  const definitions: Partial<Column>[] = [];
  for (const element of xmlChildren(collection, "col")) {
    const min = parse_unsigned(xmlAttribute(element, "min"), "column minimum");
    const max = parse_unsigned(xmlAttribute(element, "max"), "column maximum");
    if (min < 1 || max < min) return reader_failure("column range is invalid");
    assertResource(context, "maxColumnsPerSheet", max);
    const column_outline = Number(xmlAttribute(element, "outlineLevel") ?? 0);
    if (!Number.isInteger(column_outline) || column_outline < 0 || column_outline > 7) {
      return reader_failure("column outline level is invalid");
    }
    if (column_outline > 0 || xmlBoolean(xmlAttribute(element, "collapsed"))) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel column outline/collapsed presentation cannot be represented and was dropped",
        part,
      });
    }
    const width_text = xmlAttribute(element, "width");
    const width_chars = width_text === undefined ? undefined : Number(width_text);
    if (width_chars !== undefined && (!Number.isFinite(width_chars) || width_chars <= 0)) {
      return reader_failure("column width is invalid");
    }
    const style_text = xmlAttribute(element, "style");
    const style = styles.at(
      style_text === undefined ? 0 : parse_unsigned(style_text, "column style"),
    );
    const type: Column["type"] | undefined = style?.date
      ? "date"
      : style?.numberFormat
        ? /[$€£¥]|currency/i.test(style.numberFormat)
          ? "currency"
          : "number"
        : undefined;
    spans.push(min - 1, max - 1);
    definitions.push({
      ...(width_chars !== undefined ? { width: columnWidthPixels(width_chars) } : {}),
      ...(xmlAttribute(element, "hidden") !== undefined
        ? { visible: !xmlBoolean(xmlAttribute(element, "hidden")) }
        : {}),
      cellStyle: structuredClone(style.style ?? {}),
      ...(style?.numberFormat ? { numberFormat: style.numberFormat } : {}),
      ...(type ? { type } : {}),
    });
  }

  // Readers copy a definition before they change it, so columns of one declaration share it.
  last_column_declarations(spans).forEach((declaration, col) => {
    const definition = definitions[declaration];
    if (definition) columns.set(col, definition);
  });
  return columns;
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

function parse_tables(
  package_file: OpcPackage,
  worksheet_root: XmlElement,
  relationships: readonly OpcRelationship[],
  sheet_name: string,
  context: XlsxCodecContext,
  styles: ParsedStyles,
): ParsedSheet["tables"] {
  const collection = xmlChild(worksheet_root, "tableParts");
  if (!collection) return [];
  const parts = xmlChildren(collection, "tablePart");
  if (parts.length > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables) {
    return reader_failure(
      `worksheet ${sheet_name} exceeds the workbook table limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables}`,
    );
  }
  const tables: ParsedSheet["tables"] = [];
  for (const part_element of parts) {
    const relationship_id = xmlAttribute(part_element, "id");
    if (!relationship_id) return reader_failure(`tablePart in ${sheet_name} has no relationship`);
    const relationship = relationships.find((candidate) => candidate.id === relationship_id);
    if (
      !relationship ||
      relationship.external ||
      !relationshipTypeMatches(relationship.type, "table")
    ) {
      return reader_failure(
        `tablePart relationship ${relationship_id} in ${sheet_name} is invalid`,
      );
    }
    const root = package_file.readXml(relationship.target);
    assertXmlRoot(root, "table", MAIN_NAMESPACES, relationship.target);
    const native_id = parse_unsigned(xmlAttribute(root, "id"), "table id");
    if (native_id < 1) return reader_failure(`table id in ${relationship.target} is invalid`);
    const raw_name = xmlAttribute(root, "displayName") ?? xmlAttribute(root, "name");
    if (!raw_name) return reader_failure(`table name in ${relationship.target} is missing`);
    const name_result = validateWorkbookTableName(decodeXstring(raw_name));
    if (!name_result.ok) {
      return reader_failure(
        `table name ${JSON.stringify(raw_name)} is invalid (${name_result.code})`,
      );
    }
    const ref = xmlAttribute(root, "ref");
    if (!ref) return reader_failure(`table range in ${relationship.target} is missing`);
    const parsed = parse_range(ref);
    assertResource(context, "maxRowsPerSheet", parsed.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", parsed.c1 + 1);
    const header_count = xmlAttribute(root, "headerRowCount");
    const totals_count = xmlAttribute(root, "totalsRowCount");
    const header_row =
      header_count === undefined || parse_unsigned(header_count, "header row count") === 1;
    const totals_row =
      totals_count !== undefined && parse_unsigned(totals_count, "totals row count") === 1;
    if (
      (header_count !== undefined && !["0", "1"].includes(header_count)) ||
      (totals_count !== undefined && !["0", "1"].includes(totals_count))
    ) {
      return reader_failure(
        `table row metadata in ${relationship.target} exceeds the supported subset`,
      );
    }
    const column_collection = xmlChild(root, "tableColumns");
    if (!column_collection)
      return reader_failure(`table columns in ${relationship.target} are missing`);
    const declared_count = parse_unsigned(
      xmlAttribute(column_collection, "count"),
      "table column count",
    );
    if (declared_count > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable) {
      return reader_failure(
        `table ${name_result.name} exceeds the column limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable}`,
      );
    }
    const column_elements = xmlChildren(column_collection, "tableColumn");
    if (column_elements.length !== declared_count || parsed.c1 - parsed.c0 + 1 !== declared_count) {
      return reader_failure(`table ${name_result.name} column count does not match its range`);
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
          sheet: sheet_name,
          part: relationship.target,
        });
        return undefined;
      }
      return rule;
    };
    const columns = column_elements.map((column, index) => {
      const id = parse_unsigned(xmlAttribute(column, "id"), "table column id");
      const name = xmlAttribute(column, "name");
      if (id < 1 || !name) return reader_failure(`table column ${index + 1} is invalid`);
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
        return reader_failure(`table column ${index + 1} has an invalid totals-row function`);
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
        sheet: sheet_name,
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
    const table_relationships = package_file.relationships(relationship.target);
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

/**
 * Rows are streamed from the inflated worksheet; only cells and the small
 * non-row tree stay resident. `column_source` is set for the second pass over a
 * worksheet whose `cols` follow its rows, whose row warnings were already sent.
 */
async function parse_sheet(
  package_file: OpcPackage,
  reference: WorkbookSheetReference,
  styles: ParsedStyles,
  shared_strings: readonly string[],
  context: XlsxCodecContext,
  usage: ReaderResourceUsage,
  date1904: boolean,
  column_source?: XmlElement,
): Promise<ParsedSheet> {
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
  let column_styles_read = false;
  let columns_precede_rows = false;
  const cells_before_sheet = usage.cells;
  const row_context: XlsxCodecContext =
    column_source && context.options
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
      const min = parse_unsigned(xmlAttribute(column_element, "min"), "column minimum");
      const max = parse_unsigned(xmlAttribute(column_element, "max"), "column maximum");
      if (min < 1 || max < min) reader_failure("column range is invalid");
      assertResource(context, "maxColumnsPerSheet", max);
      spans.push(min - 1, max - 1);
      column_styles.push(style);
    }

    last_column_declarations(spans).forEach((declaration, col) => {
      const style = column_styles[declaration];
      if (style !== undefined) inherited_column_styles.set(col, style);
    });
  };
  if (column_source) read_column_styles(column_source);

  const process_row = (row_element: XmlElement, root: XmlElement): void => {
    if (!column_styles_read) assertXmlRoot(root, "worksheet", MAIN_NAMESPACES, target);
    read_column_styles(root);
    const row =
      xmlAttribute(row_element, "r") === undefined
        ? inferred_row
        : parse_unsigned(xmlAttribute(row_element, "r"), "row number") - 1;
    if (row < 0) reader_failure(`row number in ${reference.name} is invalid`);
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
      reader_failure(`row outline level in ${reference.name} is invalid`);
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
    let inferred_col = 0;
    for (const cell_element of xmlChildren(row_element, "c")) {
      const address_text = xmlAttribute(cell_element, "r") ?? cellA1(row, inferred_col);
      const address =
        parseCellReference(address_text) ??
        reader_failure(`cell reference ${address_text} is invalid`);
      if (address.row !== row) reader_failure(`cell ${address_text} is outside its row`);
      inferred_col = address.col + 1;
      assertResource(context, "maxColumnsPerSheet", address.col + 1);
      max_col = Math.max(max_col, address.col);
      const style_index = parse_unsigned(
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
        if (formula_type === "shared") {
          shared_formula = xmlAttribute(formula_element, "si");
          if (!shared_formula) reader_failure(`shared formula at ${address_text} has no index`);
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
        } else if (formula_type !== "normal") {
          emitWarning(row_context, {
            code: "unsupported-feature",
            message: `Excel ${formula_type} formula was neutralized because its range semantics are unsupported`,
            sheet: reference.name,
            cell: address_text,
          });
          value = formula_text ? { kind: "literal", value: `=${formula_text}` } : null;
        } else if (formulaContainsExternalReference(formula_text)) {
          emitWarning(row_context, {
            code: "external-formula",
            message: "External-data formula was neutralized as inert text",
            sheet: reference.name,
            cell: address_text,
          });
          value = { kind: "literal", value: `=${formula_text}` };
        } else {
          value = formula_text ? { kind: "formula", src: `=${formula_text}` } : null;
        }
      } else {
        value = literal_from_cell(
          cell_element,
          xmlAttribute(cell_element, "t"),
          shared_strings,
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
          column = { styleIndices: new Set(), hasNumericValue: false };
          column_cells.set(address.col, column);
        }
        column.styleIndices.add(style_index);
        if (value?.kind === "literal" && typeof value.value === "number") {
          column.hasNumericValue = true;
        }
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
    // The tree path read only `row` children; other children are skipped alike.
    child: (row_element, root_element) => {
      if (xmlLocalName(row_element.name) === "row") process_row(row_element, root_element);
    },
  };
  const entry = package_file.archive.entries.get(part);
  // For a small worksheet, the asynchronous XML driver costs more than the parse. Both parsers
  // apply the same XML limits, and the declared size is checked against the inflated bytes.
  const root =
    entry && entry.uncompressedSize <= BUFFERED_WORKSHEET_XML_BYTES
      ? parseXml(await package_file.archive.read(part), part, context, row_stream)
      : await parseXmlChunks(package_file.archive.chunks(part), part, context, row_stream);
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
    return parse_sheet(
      package_file,
      reference,
      styles,
      shared_strings,
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
  const dimension = xmlAttribute(
    xmlChild(root, "dimension") ?? { attributes: {}, children: [], name: "", text: "" },
    "ref",
  );
  if (dimension) {
    const range = parse_range(dimension);
    assertResource(context, "maxRowsPerSheet", range.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", range.c1 + 1);
    max_row = Math.max(max_row, range.r1);
    max_col = Math.max(max_col, range.c1);
  }
  const columns = parse_columns(root, styles, context, reference.relationship.target);
  for (const index of columns.keys()) max_col = Math.max(max_col, index);
  const merge_elements = xmlChild(root, "mergeCells")
    ? xmlChildren(xmlChild(root, "mergeCells")!, "mergeCell")
    : [];
  usage.merges += merge_elements.length;
  assertResource(context, "maxMerges", usage.merges);
  const merges = merge_elements.map((merge) => {
    const value = xmlAttribute(merge, "ref");
    if (!value) return reader_failure(`merge in ${reference.name} has no range`);
    const parsed = parse_range(value);
    max_row = Math.max(max_row, parsed.r1);
    max_col = Math.max(max_col, parsed.c1);
    return parsed;
  });
  assertResource(context, "maxRowsPerSheet", max_row + 1);
  assertResource(context, "maxColumnsPerSheet", max_col + 1);
  const hidden_outline_rows = new Set(
    row_meta.filter(([, metadata]) => metadata.hidden).map(([row]) => row),
  );
  const row_groups = outline_row_groups(outline_levels, collapsed_rows, hidden_outline_rows);
  const view = xmlChildren(xmlChild(root, "sheetViews") ?? root, "sheetView").at(-1);
  const pane = view ? xmlChild(view, "pane") : undefined;
  const pane_state = pane ? xmlAttribute(pane, "state") : undefined;
  const frozen = pane_state === "frozen" || pane_state === "frozenSplit";
  const frozen_rows = frozen ? Number(xmlAttribute(pane!, "ySplit") ?? 0) : 0;
  const frozen_cols = frozen ? Number(xmlAttribute(pane!, "xSplit") ?? 0) : 0;
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
        parse_validation(validation, context, reference.name, date1904),
      )
    : [];
  const conditional_formats = parse_conditional_formats(root, styles, reference.name, context);
  const sort_state = parse_sort_state(root, styles, context, reference.name);
  const relationships = package_file.relationships(reference.relationship.target);
  const hyperlink_collection = xmlChild(root, "hyperlinks");
  const hyperlinks = parse_hyperlinks(hyperlink_collection, relationships, reference.name, context);
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
    extension_list !== undefined && xml_has_descendant(extension_list, "conditionalFormattings");
  if (has_conditional_format_extensions) {
    emitWarning(context, {
      code: "format-loss",
      message: "Extended conditional formatting is unsupported and was dropped",
      sheet: reference.name,
    });
  }
  const comments = parse_comments(
    package_file,
    reference.relationship.target,
    relationships,
    context,
  );
  const tables = parse_tables(package_file, root, relationships, reference.name, context, styles);
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
    rowMeta: row_meta,
    merges,
    rowGroups: row_groups,
    ...(Number.isInteger(frozen_rows) && frozen_rows > 0 ? { frozenRows: frozen_rows } : {}),
    ...(Number.isInteger(frozen_cols) && frozen_cols > 0 ? { frozenCols: frozen_cols } : {}),
    validations,
    conditionalFormats: conditional_formats,
    ...(sort_state ? { sortState: sort_state } : {}),
    notes: comments.comments,
    hyperlinks,
    hasUnsupportedValidation: Boolean(validation_collection && validations.length === 0),
    tables,
    hasConditionalFormatting: root.children.some(
      (child) => xmlLocalName(child.name) === "conditionalFormatting",
    ),
    hasRowOutlines: outline_levels.size > 0,
    hasProtection: Boolean(xmlChild(root, "sheetProtection")),
    hasAutoFilter: Boolean(xmlChild(root, "autoFilter")),
    hasValidationCollection: Boolean(validation_collection),
    hasComments: comments.present,
    hasHyperlinks: hyperlink_collection !== undefined,
    hasConditionalFormatExtensions: has_conditional_format_extensions,
  };
}

function metadata_from_sheet(
  sheet: ParsedSheet,
  context: XlsxCodecContext,
): WorkbookSnapshot | null {
  if (!sheet.name.startsWith(META_STEM)) return null;
  const ordered = sheet.cells
    .filter((cell) => cell.colOffset === 0)
    .sort((left, right) => left.rowOffset - right.rowOffset);
  const marker = ordered[0]?.value;
  if (marker?.kind !== "literal" || marker.value !== META_MARKER) return null;
  let json = "";
  for (const cell of ordered.slice(1)) {
    if (cell.value.kind === "literal" && typeof cell.value.value === "string")
      json += cell.value.value;
  }
  try {
    const checked = validateCodecSnapshot(JSON.parse(json), context);
    if (checked.ok) return checked.value;
  } catch (error) {
    // Malformed or too deeply nested JSON gets the same warning as an invalid
    // snapshot; any other error is a bug and fails the import.
    if (!(error instanceof SyntaxError || error instanceof RangeError)) throw error;
  }
  emitWarning(context, {
    code: "invalid-metadata",
    message: "Ignored unreadable or invalid Sheetwrite metadata",
    sheet: sheet.name,
  });
  return null;
}

function column_from_parsed(
  sheet: ParsedSheet,
  styles: ParsedStyles,
  col: number,
  key: string,
): Column {
  const definition = sheet.columns.get(col);
  const formats = new Set<string>();
  const semantic_types = new Set<Column["type"]>();
  const cells = sheet.columnCells.get(col);
  for (const style_index of cells?.styleIndices ?? []) {
    const record = styles.at(style_index);
    if (record.numberFormat) formats.add(record.numberFormat);
    if (record.date) semantic_types.add("date");
    else if (record.numberFormat) {
      semantic_types.add(/[$€£¥]|currency/i.test(record.numberFormat) ? "currency" : "number");
    }
  }
  const has_numeric_value = cells?.hasNumericValue === true;
  if (definition?.type) semantic_types.add(definition.type);
  if (definition?.numberFormat) formats.add(definition.numberFormat);
  // A column default is chosen only when every formatted cell agrees; cells
  // that differ keep their own format (see the snapshot cell mapping below).
  const mixed = semantic_types.size > 1 || formats.size > 1;
  const only_type = semantic_types.values().next().value as Column["type"] | undefined;
  const number_format = mixed
    ? undefined
    : (definition?.numberFormat ?? formats.values().next().value);
  const type: Column["type"] = mixed
    ? "number"
    : (definition?.type ?? only_type ?? (has_numeric_value ? "number" : "text"));
  const default_style = definition?.cellStyle ?? styles.at(0).style;
  return {
    key,
    header: colToA1(col),
    width: definition?.width ?? 75,
    type,
    ...(number_format ? { numberFormat: number_format } : {}),
    ...(default_style && Object.keys(default_style).length > 0
      ? { cellStyle: structuredClone(default_style) }
      : {}),
    ...(definition?.visible === false ? { visible: false } : {}),
  };
}

/**
 * The number format a cell must carry itself because its column default would
 * render it differently: its own code, or `General` for an unformatted number
 * in a formatted column. Text literals ignore number formats, so they never
 * need an override.
 */
function cell_number_format_override(
  record: ParsedCellStyle,
  value: CellValue,
  column_format: string | undefined,
): string | undefined {
  const own = record.numberFormat;
  if (own === column_format) return undefined;
  if (own !== undefined) return own;
  if (value.kind === "literal" && typeof value.value !== "number") return undefined;
  return "General";
}

/** Excel links customXml items from the workbook part; other writers may link them from the root. */
function has_custom_xml(package_file: OpcPackage): boolean {
  return [
    ...package_file.relationships(package_file.officeDocumentPart()),
    ...package_file.relationships(""),
  ].some(
    (relationship) =>
      !relationship.external && relationshipTypeMatches(relationship.type, "customXml"),
  );
}

/** Restore sidecar cell fields from the sidecar sheet each worksheet claimed, by sheet order. */
function restore_sidecar_fields(
  snapshot: WorkbookSnapshot,
  claims: readonly (SheetSnapshot | undefined)[],
): void {
  for (const sheet of snapshot.sheets) {
    const meta = claims[sheet.order];
    if (!meta || sheet.cells.length === 0) continue;
    // Index the sidecar, which holds only the cells it restores, so the sheet's
    // cells are scanned once instead of indexed.
    const sidecar_cells = new Map<number, SnapshotCell[]>();
    for (const block of meta.cells) {
      for (const sidecar of block.cells) {
        const row = block.startRow + sidecar.rowOffset;
        const col = block.startCol + sidecar.colOffset;
        const offset = row * sheet.columns.length + col;
        const restored = sidecar_cells.get(offset);
        if (restored) restored.push(sidecar);
        else sidecar_cells.set(offset, [sidecar]);
      }
    }
    if (sidecar_cells.size === 0) continue;
    for (const existing of sheet.cells[0]?.cells ?? []) {
      const offset = existing.rowOffset * sheet.columns.length + existing.colOffset;
      for (const sidecar of sidecar_cells.get(offset) ?? []) {
        if (sidecar.value.kind === "ref" && existing.value.kind === "formula") {
          const reference = sidecar.value;
          const target = snapshot.sheets.find(
            (candidate) => candidate.id === reference.target.sheet,
          );
          if (!target) continue;
          const expected = `='${target.name.replaceAll("'", "''")}'!${cellA1(reference.target.row, reference.target.col)}`;
          if (existing.value.src === expected) existing.value = structuredClone(reference);
        }
        const sidecar_border = sidecar.style?.border;
        const has_exact_width = Object.values(sidecar_border ?? {}).some(
          (border) => border.width !== undefined && border.width !== 1 && border.width !== 2,
        );
        if (has_exact_width) {
          existing.style = structuredClone(sidecar.style);
        }
      }
    }
  }
}

function projected_conditional_style(style: CellStyle): string {
  const color = (value: string | undefined): string | undefined =>
    value?.replace(/^#/, "").toUpperCase();
  const projected: CellStyle = {
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.strikethrough ? { strikethrough: true } : {}),
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.color ? { color: `#${color(style.color)}` } : {}),
    ...(style.backgroundColor ? { backgroundColor: `#${color(style.backgroundColor)}` } : {}),
    ...(style.align ? { align: style.align } : {}),
    ...(style.wrap ? { wrap: true } : {}),
  };
  const borders: NonNullable<CellStyle["border"]> = {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const value = style.border?.[side] ?? style.border?.all;
    if (!value) continue;
    borders[side] = {
      ...(value.color ? { color: `#${color(value.color)}` } : {}),
      style: value.style === "dashed" ? "dashed" : value.style === "dotted" ? "dotted" : "solid",
      width:
        value.style === "dotted"
          ? 1
          : value.style === "dashed" && (value.width ?? 1) >= 2
            ? 2
            : (value.width ?? 1) >= 2
              ? 2
              : 1,
    };
  }
  if (Object.keys(borders).length > 0) projected.border = borders;
  return JSON.stringify(projected);
}
function conditional_predicate_fingerprint(predicate: ConditionalFormatPredicate): string {
  if (predicate.kind === "contains") {
    return JSON.stringify({
      kind: predicate.kind,
      text: predicate.text,
      matchCase: predicate.matchCase === true,
    });
  }
  if (predicate.kind === "formula") {
    return JSON.stringify({ kind: predicate.kind, source: predicate.source });
  }
  return JSON.stringify({ kind: predicate.kind, value: predicate.value });
}

function reconcile_conditional_formats(
  native_rules: readonly ConditionalFormatRule[],
  sidecar_rules: readonly ConditionalFormatRule[] | undefined,
): ConditionalFormatRule[] {
  const remaining = new Set(sidecar_rules?.map((_, index) => index) ?? []);
  return native_rules.map((native) => {
    const match = sidecar_rules?.findIndex(
      (sidecar, index) =>
        remaining.has(index) &&
        sidecar.range.start.row === native.range.start.row &&
        sidecar.range.start.col === native.range.start.col &&
        sidecar.range.end.row === native.range.end.row &&
        sidecar.range.end.col === native.range.end.col &&
        conditional_predicate_fingerprint(sidecar.when) ===
          conditional_predicate_fingerprint(native.when) &&
        sidecar.stopIfTrue === native.stopIfTrue &&
        projected_conditional_style(sidecar.style) === projected_conditional_style(native.style),
    );
    if (match === undefined || match < 0) return structuredClone(native);
    remaining.delete(match);
    return {
      ...structuredClone(native),
      style: structuredClone(sidecar_rules![match]!.style),
    };
  });
}

function reconcile_hyperlinks(
  native_links: readonly CellHyperlink[],
  sidecar_links: readonly CellHyperlink[] | undefined,
): CellHyperlink[] {
  const remaining = new Set(sidecar_links?.map((_, index) => index) ?? []);
  return native_links.map((native) => {
    const match = sidecar_links?.findIndex(
      (sidecar, index) =>
        remaining.has(index) &&
        sidecar.range.start.row === native.range.start.row &&
        sidecar.range.start.col === native.range.start.col &&
        sidecar.range.end.row === native.range.end.row &&
        sidecar.range.end.col === native.range.end.col &&
        sidecar.display === native.display &&
        JSON.stringify(sidecar.target) === JSON.stringify(native.target),
    );
    if (match === undefined || match < 0) return structuredClone(native);
    remaining.delete(match);
    return structuredClone(sidecar_links![match]!);
  });
}

/**
 * Iterative calculation options from `<calcPr>`, or `undefined` when they are
 * the ECMA defaults. Unreadable counts and deltas fall back to the defaults, and
 * counts beyond Excel's range are clamped into it, so a damaged attribute never
 * rejects the file.
 */
function workbook_calculation(workbook_root: XmlElement): CalculationSettings | undefined {
  const calc_pr = xmlChild(workbook_root, "calcPr");
  if (!calc_pr) return undefined;

  const iterate = xmlBoolean(xmlAttribute(calc_pr, "iterate"));

  const count = Number(xmlAttribute(calc_pr, "iterateCount") ?? DEFAULT_MAX_ITERATIONS);
  const max_iterations = Number.isInteger(count)
    ? Math.min(Math.max(count, 1), MAX_ITERATIONS)
    : DEFAULT_MAX_ITERATIONS;

  const delta = Number(xmlAttribute(calc_pr, "iterateDelta") ?? DEFAULT_MAX_CHANGE);
  const max_change = Number.isFinite(delta) && delta >= 0 ? delta : DEFAULT_MAX_CHANGE;

  if (!iterate && max_iterations === DEFAULT_MAX_ITERATIONS && max_change === DEFAULT_MAX_CHANGE) {
    return undefined;
  }
  return { iterate, maxIterations: max_iterations, maxChange: max_change };
}

function external_named_ranges(
  workbook_root: XmlElement,
  sheet_ids: ReadonlyMap<string, string>,
  sheets: readonly WorkbookSheetReference[],
  context: XlsxCodecContext,
): WorkbookSnapshot["workbook"]["namedRanges"] {
  const definitions = xmlChild(workbook_root, "definedNames");
  if (!definitions) return undefined;
  const ranges: NonNullable<WorkbookSnapshot["workbook"]["namedRanges"]> = [];
  for (const definition of xmlChildren(definitions, "definedName")) {
    const raw_name = xmlAttribute(definition, "name");
    if (!raw_name) continue;
    const name = decodeXstring(raw_name);
    if (name.startsWith("_xlnm.")) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `Reserved Excel defined name ${name} was dropped`,
      });
      continue;
    }
    if (formulaContainsExternalReference(definition.text)) {
      emitWarning(context, {
        code: "external-formula",
        message: `External defined name ${name} was dropped`,
      });
      continue;
    }
    const local_sheet_id = xmlAttribute(definition, "localSheetId");
    let scope: string | undefined;
    if (local_sheet_id !== undefined) {
      const scope_index = /^\d+$/.test(local_sheet_id) ? Number(local_sheet_id) : Number.NaN;
      const scope_sheet =
        Number.isSafeInteger(scope_index) && scope_index >= 0 ? sheets[scope_index] : undefined;
      scope = scope_sheet ? sheet_ids.get(sheetNameKey(scope_sheet.name)) : undefined;
      if (!scope) {
        emitWarning(context, {
          code: "unsupported-feature",
          message: `Defined name ${name} had invalid localSheetId ${local_sheet_id} and was dropped`,
        });
        continue;
      }
    }
    const source = decodeXstring(definition.text);
    const match =
      /^(?:'((?:[^']|'')+)'|([^!]+))!(\$[A-Z]{1,3}\$[1-9]\d*(?::\$[A-Z]{1,3}\$[1-9]\d*)?)$/i.exec(
        source,
      );
    const reference = match?.[3];
    if (match === null || reference === undefined) {
      ranges.push({ name, ...(scope ? { scope } : {}), formula: `=${source.replace(/^=/, "")}` });
      continue;
    }
    const sheet_name = (match[1] ?? match[2] ?? "").replaceAll("''", "'");
    const sheet = sheet_ids.get(sheetNameKey(sheet_name));
    if (sheet === undefined) {
      ranges.push({ name, ...(scope ? { scope } : {}), formula: `=${source.replace(/^=/, "")}` });
      continue;
    }
    const parsed = parse_range(reference);
    assertResource(context, "maxRowsPerSheet", parsed.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", parsed.c1 + 1);
    ranges.push({
      name,
      ...(scope ? { scope } : {}),
      range: {
        sheet,
        start: { row: parsed.r0, col: parsed.c0 },
        end: { row: parsed.r1, col: parsed.c1 },
      },
    });
  }
  return ranges.length > 0 ? ranges : undefined;
}

/** The first of `stem`, `stem_2`, `stem_3`… that `keys` does not hold, added to `keys`. */
function claim_column_key(stem: string, keys: Set<string>): string {
  let key = stem;
  let suffix = 2;
  while (keys.has(key)) key = `${stem}_${suffix++}`;
  keys.add(key);
  return key;
}

/**
 * Expand shared formulas, then convert every formula source to editor
 * spelling, in one engine session. A workbook without formulas leaves the
 * engine unloaded.
 */
async function import_workbook_formulas(
  snapshot: WorkbookSnapshot,
  shared_formulas: readonly SharedFormulaGroup[],
  context: XlsxCodecContext,
): Promise<void> {
  if (shared_formulas.length === 0 && workbookFormulaSources(snapshot).length === 0) return;

  const converted = await withXlsxFormulaEngine((engine) => {
    expandSharedFormulas(engine, shared_formulas, context);
    return convertFormulaSources(engine, workbookFormulaSources(snapshot), "import");
  });
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if (cell.value.kind !== "formula") continue;
        const source = converted.get(cell.value.src);
        if (source === undefined) throw new Error("Missing imported cell formula");
        cell.value.src = source;
      }
    }
  }
  for (const named of snapshot.workbook.namedRanges ?? []) {
    if (named.formula === undefined) continue;
    const source = converted.get(named.formula);
    if (source === undefined) throw new Error("Missing imported defined-name formula");
    named.formula = source;
  }
}

/** Grow `sheet` so that `row` and `col` lie inside it; references may point past the cells. */
function extend_sheet(sheet: SheetSnapshot, row: number, col: number): void {
  sheet.rowCount = Math.max(sheet.rowCount, row + 1);
  if (sheet.columns.length <= col) {
    const keys = new Set(sheet.columns.map((column) => column.key));
    while (sheet.columns.length <= col) {
      const index = sheet.columns.length;
      const key = claim_column_key(`column${index + 1}`, keys);
      sheet.columns.push({ key, header: colToA1(index), width: 75, type: "text" });
    }
  }
  const block = sheet.cells[0];
  if (block) {
    block.rowCount = Math.max(block.rowCount, sheet.rowCount);
    block.colCount = Math.max(block.colCount, sheet.columns.length);
  }
}

/** Read a preflighted OOXML workbook into Sheetwrite's implementation-neutral snapshot. */
export async function readWorkbook(
  data: Blob | ArrayBuffer | Uint8Array,
  context: XlsxCodecContext,
  readOptions: { readonly preserveOpaqueParts?: boolean } = {},
): Promise<WorkbookSnapshot> {
  const package_file = await OpcPackage.open(data, context);
  const workbook_part = package_file.officeDocumentPart();
  await package_file.load([workbook_part]);
  const workbook_root = package_file.readXml(workbook_part);
  package_file.release([workbook_part]);
  assertXmlRoot(workbook_root, "workbook", MAIN_NAMESPACES, workbook_part);
  const date1904 = xmlBoolean(
    xmlAttribute(xmlChild(workbook_root, "workbookPr") ?? workbook_root, "date1904"),
  );
  const workbook_relationships = package_file.relationships(workbook_part);
  const styles_part = workbook_relationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "styles") && !relationship.external,
  )?.target;
  const shared_strings_part = workbook_relationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "sharedStrings") && !relationship.external,
  )?.target;
  const theme_part = workbook_relationships.find(
    (relationship) => relationshipTypeMatches(relationship.type, "theme") && !relationship.external,
  )?.target;
  for (const relationship of workbook_relationships) {
    if (
      relationship.external ||
      ["worksheet", "styles", "sharedStrings", "theme"].some((kind) =>
        relationshipTypeMatches(relationship.type, kind),
      ) ||
      isRetainedRelationship("workbook", relationship.type)
    ) {
      continue;
    }
    const external_link = relationshipTypeMatches(relationship.type, "externalLink");
    emitWarning(context, {
      code: external_link ? "external-relationship" : "unsupported-feature",
      message: external_link
        ? "External-link workbook graph was dropped"
        : `Unsupported workbook relationship ${relationship.type.slice(relationship.type.lastIndexOf("/") + 1)} was dropped`,
      part: relationship.target,
    });
  }
  const style_parts = [styles_part, theme_part].filter(
    (part): part is string => part !== undefined,
  );
  await package_file.load(style_parts);
  const styles = new ParsedStyles(
    styles_part ? package_file.readXml(styles_part) : undefined,
    context,
    theme_part ? package_file.readXml(theme_part) : undefined,
    styles_part ?? "xl/styles.xml",
    theme_part ?? "xl/theme/theme1.xml",
  );
  package_file.release(style_parts);
  if (shared_strings_part) await package_file.load([shared_strings_part]);
  const shared_strings = parse_shared_strings(package_file, shared_strings_part, context);
  if (shared_strings_part) package_file.release([shared_strings_part]);
  const sheet_collection = xmlChild(workbook_root, "sheets");
  if (!sheet_collection) return reader_failure("workbook has no sheet collection");
  const references: WorkbookSheetReference[] = [];
  const sheet_names: string[] = [];
  for (const element of xmlChildren(sheet_collection, "sheet")) {
    const raw_name = xmlAttribute(element, "name");
    const relationship_id = xmlAttribute(element, "id");
    if (raw_name === undefined || !relationship_id) {
      return reader_failure("worksheet declaration is incomplete");
    }
    const validated_name = validateSheetName(decodeXstring(raw_name), sheet_names);
    if (!validated_name.ok) {
      return reader_failure(
        `worksheet name ${JSON.stringify(validated_name.name)} is unsafe or duplicated (${validated_name.code})`,
      );
    }
    const name = validated_name.name;
    sheet_names.push(name);
    const relationship = package_file.relationship(workbook_part, relationship_id);
    if (!relationshipTypeMatches(relationship.type, "worksheet")) {
      return reader_failure(`relationship ${relationship_id} is not a worksheet`);
    }
    const state = xmlAttribute(element, "state");
    if (
      state !== undefined &&
      state !== "visible" &&
      state !== "hidden" &&
      state !== "veryHidden"
    ) {
      return reader_failure(`worksheet ${name} has invalid visibility state ${state}`);
    }
    references.push({ name, state, relationship });
  }
  const metadata_candidates = references.filter((reference) =>
    reference.name.startsWith(META_STEM),
  ).length;
  assertResource(context, "maxSheets", references.length - Math.min(1, metadata_candidates));
  const usage: ReaderResourceUsage = { cells: 0, merges: 0 };
  const parsed_sheets: ParsedSheet[] = [];
  for (const reference of references) {
    checkAbort(context);
    const worksheet_part = reference.relationship.target;
    // The worksheet itself is streamed by parse_sheet; only its small parts are loaded.
    const parts = package_file
      .relationships(worksheet_part)
      .filter(
        (relationship) =>
          !relationship.external &&
          ["comments", "table"].some((kind) => relationshipTypeMatches(relationship.type, kind)),
      )
      .map((relationship) => relationship.target);
    await package_file.load(parts);
    try {
      parsed_sheets.push(
        await parse_sheet(
          package_file,
          reference,
          styles,
          shared_strings,
          context,
          usage,
          date1904,
        ),
      );
    } finally {
      package_file.release(parts);
    }
  }
  let metadata: WorkbookSnapshot | null = null;
  let metadata_index = -1;
  for (let index = 0; index < parsed_sheets.length; index++) {
    const parsed = metadata_from_sheet(parsed_sheets[index]!, context);
    if (parsed) {
      metadata = parsed;
      metadata_index = index;
      break;
    }
  }
  const source_sheets = parsed_sheets.filter((_sheet, index) => index !== metadata_index);
  const source_references = references.filter((_sheet, index) => index !== metadata_index);
  assertResource(context, "maxSheets", source_sheets.length);
  if (source_sheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX workbook has no worksheets");
  if (
    source_references.every(
      (reference) => reference.state === "hidden" || reference.state === "veryHidden",
    )
  ) {
    return reader_failure("workbook requires at least one visible worksheet");
  }
  let source_cell_count = 0;
  let source_table_count = 0;
  for (const source of source_sheets) {
    source_cell_count += source.cells.length;
    source_table_count += source.tables.length;
    assertResource(context, "maxCells", source_cell_count);
    if (source_table_count > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables) {
      return reader_failure(
        `workbook exceeds the table limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables}`,
      );
    }
  }
  const sheet_ids = new Map<string, string>();
  const resolved_metadata = claim_sidecar_sheets(source_sheets, metadata, context);
  const used_ids = new Set<string>();
  for (const meta of resolved_metadata) {
    if (meta) used_ids.add(meta.id);
  }

  const resolved_ids = source_sheets.map((source, order) => {
    const id = resolved_metadata[order]?.id ?? unique_sheet_id(source.name, order, used_ids);
    sheet_ids.set(sheetNameKey(source.name), id);
    return id;
  });
  const used_table_ids = new Set<string>();
  const used_table_names = new Set<string>();
  const sheets: SheetSnapshot[] = [];
  for (let order = 0; order < source_sheets.length; order++) {
    checkAbort(context);
    const source = source_sheets[order]!;
    const meta = resolved_metadata[order];
    const id = resolved_ids[order]!;
    const table_column_count = source.tables.reduce(
      (maximum, table) => Math.max(maximum, table.range.end.col + 1),
      0,
    );
    const column_count = Math.max(
      1,
      source.columnCount,
      table_column_count,
      meta?.columns.length ?? 0,
    );
    assertResource(context, "maxColumnsPerSheet", column_count);
    const columns: Column[] = [];
    const keys = new Set<string>();
    for (let col = 0; col < column_count; col++) {
      const meta_column = meta?.columns[col];
      const key = claim_column_key(meta_column?.key ?? `column${col + 1}`, keys);
      const native_column = column_from_parsed(source, styles, col, key);
      if (!meta_column) {
        columns.push(native_column);
        continue;
      }
      const column = structuredClone(meta_column);
      if (native_column.cellStyle) column.cellStyle = native_column.cellStyle;
      else delete column.cellStyle;
      const definition = source.columns.get(col);
      if (definition) {
        for (const property of ["width", "visible", "numberFormat", "type"] as const) {
          const value = definition[property];
          // Preserve subpixel Sheetwrite widths only while the native column
          // still represents the metadata width; native edits remain authoritative.
          if (
            property === "width" &&
            value === columnWidthPixels(columnWidthCharacters(meta_column.width))
          )
            continue;
          if (value !== undefined) Object.assign(column, { [property]: structuredClone(value) });
        }
      }
      if (source.columnCells.has(col)) {
        column.type = native_column.type;
        if (native_column.numberFormat) column.numberFormat = native_column.numberFormat;
        else delete column.numberFormat;
      }
      column.key = key;
      columns.push(column);
    }
    const row_count = Math.max(
      source.rowCount,
      source.tables.reduce((maximum, table) => Math.max(maximum, table.range.end.row + 1), 0),
    );
    assertResource(context, "maxRowsPerSheet", row_count);
    // The parsed cells become the snapshot's cells: each gets its own style copy
    // now that every column default is known, and no second array is built.
    const snapshot_cells = source.cells;
    if (source.cellStyles.length !== snapshot_cells.length) {
      throw new RangeError("Sheetwrite: XLSX cell styles and cells are out of step");
    }
    for (let index = 0; index < snapshot_cells.length; index++) {
      const cell = snapshot_cells[index];
      if (!cell) continue;
      const record = styles.at(source.cellStyles.at(index));
      // Parsed styles are typed `CellStyle`, and the copy keeps their shape.
      let style = record.style ? (copy_style_data(record.style) as CellStyle) : undefined;
      // Native center is normally unset, but must override an inherited bottom.
      if (
        style?.verticalAlign === undefined &&
        columns[cell.colOffset]?.cellStyle?.verticalAlign === "bottom"
      ) {
        style ??= {};
        style.verticalAlign = "middle";
      }
      const number_format = cell_number_format_override(
        record,
        cell.value,
        columns[cell.colOffset]?.numberFormat,
      );
      const cell_style = number_format ? { ...style, numberFormat: number_format } : style;
      if (cell_style) cell.style = cell_style;
    }
    const native_validations = source.validations.map((validation, index) => {
      const sidecar = meta?.validationRules?.[index];
      const same_blank_default =
        sidecar !== undefined &&
        validation.allowBlank === (sidecar.allowBlank === undefined ? true : sidecar.allowBlank);
      return {
        id: sidecar?.id ?? `xlsx-validation-${index + 1}`,
        range: { sheet: id, ...structuredClone(validation.range) },
        condition: structuredClone(validation.condition),
        policy: validation.policy,
        ...(same_blank_default
          ? sidecar?.allowBlank !== undefined
            ? { allowBlank: sidecar.allowBlank }
            : {}
          : validation.allowBlank !== undefined
            ? { allowBlank: validation.allowBlank }
            : {}),
        ...(validation.helpText ? { helpText: validation.helpText } : {}),
      };
    });
    const validations = source.hasValidationCollection
      ? native_validations
      : (structuredClone(meta?.validationRules) ?? []);
    const native_notes = source.notes.map((note) => ({
      addr: { sheet: id, row: note.row, col: note.col },
      text: note.text,
    }));
    const notes = source.hasComments ? native_notes : (structuredClone(meta?.notes) ?? []);
    const native_hyperlinks = reconcile_hyperlinks(
      source.hyperlinks.flatMap((link, link_index): CellHyperlink[] => {
        let target: CellHyperlink["target"] | null;
        if (link.target.kind === "external") {
          target = structuredClone(link.target);
        } else {
          const internal = link.target;
          const target_sheet = sheet_ids.get(sheetNameKey(internal.sheetName));
          if (!target_sheet) {
            emitWarning(context, {
              code: "hyperlink",
              message: "Hyperlink internal target references a missing worksheet and was dropped",
              sheet: source.name,
            });
            target = null;
          } else {
            target = {
              kind: "internal",
              range: { sheet: target_sheet, ...structuredClone(internal.range) },
            };
          }
        }
        if (!target) return [];
        return [
          {
            id: `xlsx-hyperlink-${order + 1}-${link_index + 1}`,
            range: { sheet: id, ...structuredClone(link.range) },
            target,
            ...(link.display !== undefined ? { display: link.display } : {}),
          },
        ];
      }),
      meta?.hyperlinks,
    );
    const hyperlinks = source.hasHyperlinks
      ? native_hyperlinks
      : (structuredClone(meta?.hyperlinks) ?? []);
    const native_conditional_formats = reconcile_conditional_formats(
      source.conditionalFormats.map((rule) => ({
        ...structuredClone(rule),
        range: { ...structuredClone(rule.range), sheet: id },
      })),
      meta?.conditionalFormats,
    );
    const conditional_formats = source.hasConditionalFormatting
      ? native_conditional_formats
      : (structuredClone(meta?.conditionalFormats) ?? []);
    // A live view sort comes only from Sheetwrite's own metadata. The
    // worksheet sortState is kept unapplied, unless it is the export of that
    // view sort.
    const sort_keys = structuredClone(meta?.sortKeys) ?? [];
    const sort_state = sort_keys.length === 0 ? source.sortState : undefined;
    const tables: WorkbookTable[] = source.tables.map((native_table, table_index) => {
      const meta_table =
        meta?.tables?.find(
          (candidate) =>
            candidate.name.normalize("NFC").toUpperCase() ===
            native_table.name.normalize("NFC").toUpperCase(),
        ) ?? meta?.tables?.[table_index];
      const table_id = meta_table?.id ?? native_table.id;
      const table_name_key = native_table.name.normalize("NFC").toUpperCase();
      if (used_table_ids.has(table_id) || used_table_names.has(table_name_key)) {
        return reader_failure(
          `workbook table ${native_table.name} has a duplicate identity or name`,
        );
      }
      used_table_ids.add(table_id);
      used_table_names.add(table_name_key);
      return {
        ...structuredClone(native_table),
        id: table_id,
        range: { sheet: id, ...structuredClone(native_table.range) },
        columns: native_table.columns.map((column, column_index) => ({
          ...structuredClone(column),
          id: meta_table?.columns[column_index]?.id ?? column.id,
        })),
        ...(meta_table?.style !== undefined ? { style: structuredClone(meta_table.style) } : {}),
        ...(meta_table?.unsupportedFeatures !== undefined
          ? { unsupportedFeatures: structuredClone(meta_table.unsupportedFeatures) }
          : {}),
      };
    });
    if (source.hasUnsupportedValidation && validations.length === 0) {
      emitWarning(context, {
        code: "validation-loss",
        message: "Excel data validation rules could not be mapped safely and were dropped",
        sheet: source.name,
      });
    }
    if (source.hasProtection) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel locked-cell protection is static workbook security and cannot be mapped to Sheetwrite host authorization callbacks; it was not represented as protected ranges",
        sheet: source.name,
      });
    }
    if (source.hasAutoFilter) {
      emitWarning(context, {
        code: "unsupported-feature",
        message:
          "Excel autoFilter excludes its header row, while Sheetwrite filters every data row; native filter semantics were not broadened or shifted",
        sheet: source.name,
      });
    }
    sheets.push({
      id,
      name: source.name,
      order,
      ...(source.state === "hidden" || source.state === "veryHidden"
        ? { visibility: source.state }
        : {}),
      rowCount: row_count,
      columns,
      ...(source.frozenRows ? { frozenRows: source.frozenRows } : {}),
      ...(source.frozenCols ? { frozenCols: source.frozenCols } : {}),
      ...(source.rowMeta.length > 0 ? { rowMeta: source.rowMeta } : {}),
      ...(source.merges.length > 0 ? { merges: source.merges } : {}),
      ...(conditional_formats.length > 0 ? { conditionalFormats: conditional_formats } : {}),
      ...(hyperlinks.length > 0 ? { hyperlinks } : {}),
      ...(source.hasRowOutlines
        ? { rowGroups: source.rowGroups }
        : meta?.rowGroups
          ? { rowGroups: structuredClone(meta.rowGroups) }
          : {}),
      ...(validations.length > 0 ? { validationRules: validations } : {}),
      ...(!source.hasProtection && meta?.protectedRanges
        ? { protectedRanges: structuredClone(meta.protectedRanges) }
        : {}),
      ...(notes.length > 0 ? { notes } : {}),
      ...(sort_keys.length > 0 ? { sortKeys: sort_keys } : {}),
      ...(sort_state ? { sortState: structuredClone(sort_state) } : {}),
      ...(!source.hasAutoFilter && meta?.filters ? { filters: structuredClone(meta.filters) } : {}),
      ...(tables.length > 0 ? { tables } : {}),
      cells:
        snapshot_cells.length > 0
          ? [
              {
                startRow: 0,
                startCol: 0,
                rowCount: row_count,
                colCount: columns.length,
                cells: snapshot_cells,
              },
            ]
          : [],
    });
  }
  for (const owner of sheets) {
    for (const hyperlink of owner.hyperlinks ?? []) {
      if (hyperlink.target.kind !== "internal") continue;
      const target_range = hyperlink.target.range;
      const target = sheets.find((candidate) => candidate.id === target_range.sheet);
      if (target) extend_sheet(target, target_range.end.row, target_range.end.col);
    }
  }
  const workbook_views = xmlChildren(
    xmlChild(workbook_root, "bookViews") ?? workbook_root,
    "workbookView",
  );
  const active_tab = Number(xmlAttribute(workbook_views.at(-1) ?? workbook_root, "activeTab") ?? 0);
  const requested_reference =
    Number.isInteger(active_tab) && active_tab >= 0 && active_tab < references.length
      ? references[active_tab]
      : undefined;
  const requested_active = requested_reference
    ? source_references.indexOf(requested_reference)
    : -1;
  const active_index =
    requested_active >= 0 &&
    source_references[requested_active]!.state !== "hidden" &&
    source_references[requested_active]!.state !== "veryHidden"
      ? requested_active
      : source_references.findIndex(
          (reference) => reference.state !== "hidden" && reference.state !== "veryHidden",
        );
  const active_sheet = sheets[active_index]!.id;
  const native_named_ranges = external_named_ranges(
    workbook_root,
    sheet_ids,
    source_references,
    context,
  );
  const named_ranges = xmlChild(workbook_root, "definedNames")
    ? native_named_ranges
    : metadata?.workbook.namedRanges;
  const defined_name_keys = new Map(
    (named_ranges ?? []).map((named) => [named.name.normalize("NFC").toUpperCase(), named.name]),
  );
  for (const sheet of sheets) {
    const tables = sheet.tables?.filter((table) => {
      const collision = defined_name_keys.get(table.name.normalize("NFC").toUpperCase());
      if (collision === undefined) return true;
      emitWarning(context, {
        code: "invalid-metadata",
        message: `Excel table ${table.name} was dropped because its name conflicts case-insensitively with workbook defined name ${collision}; the defined name was retained to keep formula resolution unambiguous`,
        sheet: sheet.name,
      });
      return false;
    });
    if (tables?.length) sheet.tables = tables;
    else delete sheet.tables;
  }
  for (const named_range of named_ranges ?? []) {
    if (named_range.range === undefined) continue;
    const range = named_range.range;
    const sheet = sheets.find((candidate) => candidate.id === range.sheet);
    if (sheet) extend_sheet(sheet, named_range.range.end.row, named_range.range.end.col);
  }
  const calculation = workbook_calculation(workbook_root);
  // Sheetwrite's own metadata holds relationships by stable IDs; a file
  // without it may hold Excel's data model relationships.
  let data_model = metadata?.workbook.dataModel;
  if (data_model === undefined && hasExcelDataModel(workbook_root)) {
    const connections_part = workbook_relationships.find(
      (relationship) =>
        relationshipTypeMatches(relationship.type, "connections") && !relationship.external,
    )?.target;
    // A relationship can name a part the package lacks; such a file has no connections to read.
    const readable =
      connections_part !== undefined && package_file.contentType(connections_part) !== undefined;
    if (readable) await package_file.load([connections_part]);
    const connections = readable ? package_file.readXml(connections_part) : undefined;
    if (readable) package_file.release([connections_part]);
    data_model = readExcelDataModel(workbook_root, connections, sheets, context);
  }
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    ...(metadata?.documentId ? { documentId: metadata.documentId } : {}),
    ...(metadata?.version !== undefined ? { version: metadata.version } : {}),
    workbook: {
      activeSheet: active_sheet,
      ...(named_ranges?.length ? { namedRanges: structuredClone(named_ranges) } : {}),
      ...(calculation ? { calculation } : {}),
      ...(data_model?.relationships.length ? { dataModel: structuredClone(data_model) } : {}),
    },
    sheets,
  };
  await import_workbook_formulas(
    snapshot,
    source_sheets.flatMap((source) => source.sharedFormulas),
    context,
  );
  restore_sidecar_fields(snapshot, resolved_metadata);
  const sheet_parts = source_references.map((reference) => reference.relationship.target);
  const modelled_pivot_parts = await readPivots(
    package_file,
    { snapshot, sheetParts: sheet_parts, metadata, extendSheet: extend_sheet },
    context,
  );
  const chart_parts = await readCharts(
    package_file,
    {
      snapshot,
      sheetParts: sheet_parts,
      metadata: metadata ?? undefined,
      extendSheet: extend_sheet,
    },
    context,
  );
  if (readOptions.preserveOpaqueParts !== false)
    await capturePreserved(
      package_file,
      snapshot,
      context,
      new Set([...modelled_pivot_parts, ...chart_parts.modelled]),
      chart_parts.replacements,
    );
  // The Power Query module loads only for workbooks that can hold queries:
  // saved definitions in the hidden metadata, or a customXml item.
  const sidecar_queries = metadata?.workbook.queries;
  if (sidecar_queries?.length || has_custom_xml(package_file)) {
    const { readPowerQuery: read_power_query } = await import("./power-query.js");
    await read_power_query(package_file, snapshot, sidecar_queries, context);
  }
  const checked = validateCodecSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      boundedErrorText(
        `Sheetwrite: imported invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
      ),
    );
  }
  return checked.value;
}
