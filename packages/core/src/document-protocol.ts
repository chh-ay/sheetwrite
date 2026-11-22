import {
  isCellFontFamily,
  isCellNumberFormat,
  isCellVerticalAlign,
  MAX_FONT_FAMILY_LENGTH,
  MAX_NUMBER_FORMAT_LENGTH,
} from "./cell-style-fields.js";
import {
  MAX_CHART_SERIES,
  MAX_CHARTS_PER_SHEET,
  sanitizeChartDefinition,
  validSheetCharts,
} from "./chart-definition.js";
import {
  MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH,
  MAX_CONDITIONAL_FORMAT_RULES,
} from "./conditional-format.js";
import { cloneDashboard, validateDashboardItemShape, validateSheetKindShape } from "./dashboard.js";
import {
  validateDataModelShape,
  validateMeasureShape,
  validateRelationshipShape,
} from "./data-model.js";
import { SheetwriteError } from "./errors.js";
import { validateExternalLinksShape } from "./external-link.js";
import {
  cloneCellHyperlink,
  isSafeExternalHyperlink,
  isValidCellHyperlink,
  isValidHyperlinkId,
  MAX_HYPERLINK_DISPLAY_LENGTH,
  MAX_HYPERLINKS_PER_SHEET,
} from "./hyperlink.js";
import { boundedJsonByteLength, JsonByteLengthError, measureJson } from "./json-bytes.js";
import { formulaNameKey } from "./name-key.js";
import {
  clonePivot,
  MAX_PIVOTS_PER_WORKBOOK,
  validatePivotReferences,
  validatePivotShape,
} from "./pivot.js";
import { compareCodeUnits, isPlainRecord, ownValue, type PlainRecord } from "./plain-data.js";
import { ROW_ORDER_ENCODING } from "./row-order.js";
import { validateSavedQueriesShape, validateSavedQueryShape } from "./saved-query.js";
import { DYNAMIC_DATE_FILTERS, validFilterCondition } from "./store/autofilter.js";
import { MAX_VALIDATION_RULES, normalizeMerge } from "./store/ranges.js";
import { preparedRestore } from "./transaction-preparation.js";
import type { CellFormat } from "./types/cell.js";
import type { MergeRange, Range } from "./types/coordinates.js";
import type {
  CalculationSettings,
  DocumentOp,
  MutationIssue,
  SheetSnapshot,
  Workbook,
  WorkbookSnapshot,
} from "./types/document.js";
import type { WorkbookTable } from "./types/table.js";
import type { TransactionResourceLimits } from "./types/transaction.js";
import {
  assertWorkbookTables,
  DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
  validWorkbookTable,
  validWorkbookTableXmlElement,
} from "./workbook-table.js";

/** Current workbook snapshot schema version accepted by Sheetwrite. */
export const WORKBOOK_SCHEMA_VERSION = 1 as const;

/** Every column type a snapshot or patch may name. */
const COLUMN_TYPES: readonly string[] = [
  "general",
  "text",
  "number",
  "date",
  "currency",
] satisfies readonly CellFormat[];

/** Excel's iteration count for a new workbook. */
export const DEFAULT_MAX_ITERATIONS = 100;

/** Excel's convergence threshold for a new workbook. */
export const DEFAULT_MAX_CHANGE = 0.001;

/** Largest iteration count Excel accepts. */
export const MAX_ITERATIONS = 32_767;

/** Settings of a workbook that has never touched iterative calculation. */
export const DEFAULT_CALCULATION_SETTINGS: Readonly<CalculationSettings> = Object.freeze({
  iterate: false,
  maxIterations: DEFAULT_MAX_ITERATIONS,
  maxChange: DEFAULT_MAX_CHANGE,
});

/** Limits the engine accepts; anything else would be rejected by `setIterativeCalculation`. */
export function isValidCalculationSettings(settings: CalculationSettings): boolean {
  return (
    typeof settings.iterate === "boolean" &&
    Number.isInteger(settings.maxIterations) &&
    settings.maxIterations >= 1 &&
    settings.maxIterations <= MAX_ITERATIONS &&
    Number.isFinite(settings.maxChange) &&
    settings.maxChange >= 0
  );
}

/**
 * Detached copy of non-default settings, or `undefined` for the defaults, so
 * workbooks that never enable iteration keep byte-identical snapshots.
 */
export function storedCalculationSettings(
  settings: CalculationSettings | undefined,
): CalculationSettings | undefined {
  if (
    settings === undefined ||
    (settings.iterate === DEFAULT_CALCULATION_SETTINGS.iterate &&
      settings.maxIterations === DEFAULT_CALCULATION_SETTINGS.maxIterations &&
      settings.maxChange === DEFAULT_CALCULATION_SETTINGS.maxChange)
  ) {
    return undefined;
  }
  return {
    iterate: settings.iterate,
    maxIterations: settings.maxIterations,
    maxChange: settings.maxChange,
  };
}

/**
 * Inclusive defaults for every atomic document transaction accepted by a
 * Store or Grid. The count bounds object-heavy validation and dispatch; the
 * exact UTF-8 JSON size bounds hostile or accidentally oversized payloads.
 */
export const DEFAULT_TRANSACTION_RESOURCE_LIMITS: Readonly<TransactionResourceLimits> =
  Object.freeze({
    maxOperations: 10_000,
    maxEncodedBytes: 8 * 1024 * 1024,
  });

/** Successful byte/count inspection or one structured transaction rejection. */
export type TransactionResourceValidationResult =
  | {
      ok: true;
      operationCount: number;
      encodedBytes: number;
    }
  | {
      ok: false;
      issue: Extract<MutationIssue, { kind: "resource-limit" } | { kind: "invalid-operation" }>;
    };

const TRANSACTION_RESOURCE_KEYS = [
  "maxOperations",
  "maxEncodedBytes",
] as const satisfies readonly (keyof TransactionResourceLimits)[];

/**
 * Validate and merge transaction ceiling overrides without retaining the
 * caller-owned object. Every ceiling is an inclusive non-negative safe integer.
 *
 * @param overrides - Limits to change; the others keep their defaults.
 * @returns A frozen copy of the full set of limits.
 * @throws SheetwriteError with code `invalid-limits` when a value is not a non-negative safe integer.
 */
export function resolveTransactionResourceLimits(
  overrides: Partial<TransactionResourceLimits> = {},
): Readonly<TransactionResourceLimits> {
  const limits: TransactionResourceLimits = { ...DEFAULT_TRANSACTION_RESOURCE_LIMITS };
  for (const resource of TRANSACTION_RESOURCE_KEYS) {
    const value = overrides[resource];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new SheetwriteError(
        "invalid-limits",
        "transaction",
        `Transaction resource limit ${resource} must be a non-negative safe integer`,
        { context: { resource } },
      );
    }
    limits[resource] = value;
  }
  return Object.freeze(limits);
}

/**
 * Incrementally validate the operation count and exact encoded payload size
 * without constructing a JSON string. Compact operation ranges are measured by
 * their serialized fields; their logical cell area is deliberately irrelevant.
 *
 * @param operations - The transaction's operations.
 * @param limits - The limits to check against; defaults to the built-in limits.
 * @throws SheetwriteError with code `invalid-operations` when `operations` is not an array.
 */
export function validateTransactionResources(
  operations: readonly DocumentOp[],
  limits: Readonly<TransactionResourceLimits> = DEFAULT_TRANSACTION_RESOURCE_LIMITS,
): TransactionResourceValidationResult {
  if (!Array.isArray(operations)) {
    throw new SheetwriteError(
      "invalid-operations",
      "transaction",
      "Transaction patches must be an array of DocumentOps",
    );
  }

  if (operations.length > limits.maxOperations) {
    return {
      ok: false,
      issue: {
        kind: "resource-limit",
        severity: "error",
        resource: "operations",
        actual: operations.length,
        max: limits.maxOperations,
        message: `Transaction operation count ${operations.length} exceeds maximum ${limits.maxOperations}`,
      },
    };
  }

  try {
    return {
      ok: true,
      operationCount: operations.length,
      encodedBytes: boundedJsonByteLength(operations, limits.maxEncodedBytes, {
        omitUndefinedProperties: true,
      }),
    };
  } catch (error) {
    if (error instanceof JsonByteLengthError && error.code === "payload-limit") {
      const actual = error.actual ?? limits.maxEncodedBytes + 1;
      return {
        ok: false,
        issue: {
          kind: "resource-limit",
          severity: "error",
          resource: "encoded-bytes",
          actual,
          max: limits.maxEncodedBytes,
          message: `Transaction encoded operation payload exceeds maximum ${limits.maxEncodedBytes} bytes (${actual} bytes observed)`,
        },
      };
    }

    return {
      ok: false,
      issue: {
        kind: "invalid-operation",
        severity: "error",
        operationIndex: 0,
        message:
          error instanceof Error
            ? `Transaction operations must be JSON-safe: ${error.message}`
            : "Transaction operations must be JSON-safe",
      },
    };
  }
}

/**
 * Measurement of one operations array, handed between synchronous engine
 * layers so a large payload is encoded once instead of at every layer. A
 * record only describes the exact array instance it measured, under the exact
 * limits it was checked against. It stops being valid as soon as the
 * operations are replaced or rewritten, so layers drop it when a step changes
 * the operations or hands them to code that may do so.
 */
export interface AdmittedTransactionResources {
  readonly operations: readonly DocumentOp[];
  readonly operationCount: number;
  readonly encodedBytes: number;
  readonly limits: Readonly<TransactionResourceLimits>;
}

/**
 * Record a measurement for `operations`. `measuredOperations` names the array
 * the measurement was actually taken from; when it differs (a defensive copy
 * was made), the copy must hold the same operations in the same order or no
 * record is produced.
 */
export function admitTransactionResources(
  operations: readonly DocumentOp[],
  limits: Readonly<TransactionResourceLimits>,
  measurement: { readonly operationCount: number; readonly encodedBytes: number },
  measuredOperations: readonly DocumentOp[] = operations,
): AdmittedTransactionResources | undefined {
  if (measurement.operationCount !== operations.length) return undefined;
  if (!same_operations(measuredOperations, operations)) return undefined;
  return {
    operations,
    operationCount: measurement.operationCount,
    encodedBytes: measurement.encodedBytes,
    limits,
  };
}

/**
 * Validate the operation count and encoded byte size of `operations`, reusing
 * `admitted` when it measured this exact array under these exact limits. The
 * matching record is returned so callers can pass it on unchanged; otherwise
 * the payload is walked and a fresh record is returned on success.
 */
export function resolveTransactionResourceValidation(
  operations: readonly DocumentOp[],
  limits: Readonly<TransactionResourceLimits> = DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  admitted?: AdmittedTransactionResources,
): {
  readonly result: TransactionResourceValidationResult;
  readonly admitted?: AdmittedTransactionResources;
} {
  if (admitted !== undefined && admitted_covers(admitted, operations, limits)) {
    return {
      result: {
        ok: true,
        operationCount: admitted.operationCount,
        encodedBytes: admitted.encodedBytes,
      },
      admitted,
    };
  }
  const result = validateTransactionResources(operations, limits);
  if (!result.ok) return { result };
  return { result, admitted: admitTransactionResources(operations, limits, result) };
}

const admitted_resources_by_transaction = new WeakMap<object, AdmittedTransactionResources>();
/** Transactions an engine layer built from operations it already took in. */
const engine_built_transactions = new WeakSet<object>();

/**
 * Attach one measurement to the engine-built transaction that is about to be
 * applied, so the store can reuse it. Only this module can create a record, so
 * a caller-built transaction can never claim one.
 */
export function withAdmittedTransactionResources<T extends object>(
  transaction: T,
  admitted: AdmittedTransactionResources | undefined,
): T {
  engine_built_transactions.add(transaction);
  if (admitted !== undefined) admitted_resources_by_transaction.set(transaction, admitted);
  return transaction;
}

/**
 * Whether an engine layer built `transaction` through
 * `withAdmittedTransactionResources`. Its operations already passed that
 * layer's ingress, and the layer matches results to them by identity.
 */
export function isEngineBuiltTransaction(transaction: object): boolean {
  return engine_built_transactions.has(transaction);
}

/**
 * Take the measurement attached to an engine-built transaction. Single-use:
 * the entry is removed so a retained transaction object cannot reuse it after
 * later payload edits.
 */
export function takeAdmittedTransactionResources(
  transaction: object,
): AdmittedTransactionResources | undefined {
  const admitted = admitted_resources_by_transaction.get(transaction);
  if (admitted !== undefined) admitted_resources_by_transaction.delete(transaction);
  return admitted;
}

function admitted_covers(
  admitted: AdmittedTransactionResources,
  operations: readonly DocumentOp[],
  limits: Readonly<TransactionResourceLimits>,
): boolean {
  return (
    admitted.operations === operations &&
    admitted.operationCount === operations.length &&
    same_transaction_resource_limits(admitted.limits, limits)
  );
}

function same_transaction_resource_limits(
  left: Readonly<TransactionResourceLimits>,
  right: Readonly<TransactionResourceLimits>,
): boolean {
  return (
    left === right ||
    (left.maxOperations === right.maxOperations && left.maxEncodedBytes === right.maxEncodedBytes)
  );
}

/** True when both arrays reference the same operations in the same order. */
function same_operations(left: readonly DocumentOp[], right: readonly DocumentOp[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** Allocation mode used when enforcing snapshot construction capacity. */
export type SnapshotStorageMode = "dense" | "paged";

/** Resource ceilings applied before snapshot normalization or store allocation. */
export interface SnapshotResourceLimits {
  /** Workbook sheets; defaults to 256. */
  maxSheets: number;
  /** Rows in any sheet; defaults to 1,000,000. */
  maxRowsPerSheet: number;
  /** Columns in any sheet; defaults to 16,384. */
  maxColumnsPerSheet: number;
  /** Aggregate workbook/sheet metadata array entries; defaults to 1,000,000. */
  maxMetadataEntries: number;
  /** UTF-8 JSON bytes inspected while validating a snapshot; defaults to 64 MiB. */
  maxSerializedBytes: number;
  /** Logical row-by-column cells in any sheet; defaults to 4,294,967,295. */
  maxLogicalCellsPerSheet: number;
  /**
   * Aggregate cells allocated by dense storage; defaults to 5,000,000, the
   * engine's ceiling. A larger value is capped at the ceiling; a dense sheet
   * past it continues in local pages.
   */
  maxDenseCells: number;
  /**
   * Aggregate logical cells of local sheets: sheets of a dense-storage
   * workbook past `maxDenseCells`, which the engine keeps in pages it never
   * evicts; defaults to 20,000,000, the engine's ceiling. A larger value is
   * capped at the ceiling; 0 refuses every sheet past `maxDenseCells`.
   */
  maxLocalPagedCells: number;
}

/**
 * The engine's own ceilings on dense and local-page cells. The engine is
 * given the host's limits, capped at these, so core and engine place and
 * refuse sheets the same way.
 */
const ENGINE_STORAGE_CEILINGS = {
  maxDenseCells: 5_000_000,
  maxLocalPagedCells: 20_000_000,
} as const;

/** Conservative defaults that retain the million-row paged-sheet contract. */
export const DEFAULT_SNAPSHOT_RESOURCE_LIMITS: Readonly<SnapshotResourceLimits> = Object.freeze({
  // Bound sheet-indexed schema and store allocations.
  maxSheets: 256,
  // Product compatibility contract for allocation-lazy sheets.
  maxRowsPerSheet: 1_000_000,
  // Match the XLSX worksheet-width boundary.
  maxColumnsPerSheet: 16_384,
  // Bound aggregate names, ranges, cells, and sheet metadata inspection.
  maxMetadataEntries: 1_000_000,
  // Bound synchronous JSON-safety traversal without constructing a JSON string.
  maxSerializedBytes: 64 * 1024 * 1024,
  // Bound logical sheet area even when paged storage defers physical allocation.
  maxLogicalCellsPerSheet: 0xffff_ffff,
  // Bound eager dense allocation across the workbook.
  maxDenseCells: ENGINE_STORAGE_CEILINGS.maxDenseCells,
  // Bound local pages, which a full sheet fills at about 13 bytes a cell.
  maxLocalPagedCells: ENGINE_STORAGE_CEILINGS.maxLocalPagedCells,
});

/** Validation and allocation policy for an untrusted workbook snapshot. */
export interface SnapshotValidationOptions {
  /** Allocation model used for capacity checks; defaults to `dense`. */
  storage?: SnapshotStorageMode;
  /**
   * Non-negative safe-integer overrides merged over
   * `DEFAULT_SNAPSHOT_RESOURCE_LIMITS`; `maxDenseCells` and
   * `maxLocalPagedCells` are capped at the engine's ceilings.
   */
  resourceLimits?: Partial<SnapshotResourceLimits>;
}

/** Stable resource failure raised by direct workbook construction paths. */
export class SnapshotResourceError extends SheetwriteError {
  /** Always `"SnapshotResourceError"`. */
  override readonly name = "SnapshotResourceError";
  /** Always `"resource-limit"`. */
  declare readonly code: "resource-limit";

  /** Creates the error for one limit; `options.cause` keeps the underlying error. */
  constructor(
    /** The limit that was reached, such as `maxSheets`. */
    readonly resource: keyof SnapshotResourceLimits,
    /** The limit's value. */
    readonly limit: number,
    /** The amount the workbook needed, in the limit's unit. */
    readonly actual: number,
    options?: ErrorOptions,
  ) {
    super(
      "resource-limit",
      "snapshot-allocate",
      actual > limit
        ? `Snapshot ${resource} limit ${limit} exceeded by ${actual}`
        : `Snapshot allocation failed for ${actual} within ${resource} limit ${limit}`,
      { cause: options?.cause, context: { resource, limit, actual } },
    );
  }
}

/** Path-qualified validation failure for a document operation. */
export interface DocumentValidationError {
  /** JSON path of the bad value, such as `$.sheets[0].name`. */
  path: string;
  /** What kind of problem it is. */
  code:
    | "unsupported-schema"
    | "invalid-value"
    | "duplicate-id"
    | "missing-reference"
    | "out-of-bounds"
    | "overlapping-merge"
    | "non-serializable"
    | "resource-limit";
  /** A readable explanation of the problem. */
  message: string;
}

/** Success or structured errors returned by document validation. */
export type DocumentValidationResult =
  | { ok: true; value: WorkbookSnapshot }
  | { ok: false; errors: DocumentValidationError[] };

/** Issues an error keeps; an untrusted snapshot can break every cell. */
const MAX_REPORTED_VALIDATION_ISSUES = 64;

/** Path-qualified schema failure found while validating an untrusted snapshot. */
export class SnapshotValidationError extends SheetwriteError {
  /** Always `"SnapshotValidationError"`. */
  override readonly name = "SnapshotValidationError";
  /** Always `"invalid-snapshot"`. */
  declare readonly code: "invalid-snapshot";

  /** The first 64 issues; `context.issueCount` counts all of them. */
  readonly errors: readonly DocumentValidationError[];

  /** Creates the error; its message is the first issue's message. */
  constructor(errors: readonly DocumentValidationError[], options?: ErrorOptions) {
    super(
      "invalid-snapshot",
      "snapshot-validate",
      errors[0]?.message ?? "Invalid workbook snapshot",
      {
        cause: options?.cause,
        context: {
          issueCount: errors.length,
          firstPath: errors[0]?.path ?? "$",
          firstCode: errors[0]?.code ?? "invalid-value",
        },
      },
    );
    this.errors =
      errors.length > MAX_REPORTED_VALIDATION_ISSUES
        ? errors.slice(0, MAX_REPORTED_VALIDATION_ISSUES)
        : errors;
  }
}

interface ResolvedSnapshotValidationOptions {
  readonly storage: SnapshotStorageMode;
  readonly limits: SnapshotResourceLimits;
}

const SNAPSHOT_RESOURCE_KEYS = [
  "maxSheets",
  "maxRowsPerSheet",
  "maxColumnsPerSheet",
  "maxMetadataEntries",
  "maxSerializedBytes",
  "maxLogicalCellsPerSheet",
  "maxDenseCells",
  "maxLocalPagedCells",
] as const satisfies readonly (keyof SnapshotResourceLimits)[];

const SHEET_METADATA_ARRAY_KEYS = [
  "rowMeta",
  "merges",
  "conditionalFormats",
  "hyperlinks",
  "validationRules",
  "protectedRanges",
  "notes",
  "sortKeys",
  "filters",
  "rowGroups",
  "tables",
  "charts",
  "pivots",
  "cells",
] as const;

function non_negative_integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function finite_number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function child_path(path: string, key: string): string {
  if (path === "$") {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
  }
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function json_path(segments: readonly (string | number)[]): string {
  let path = "$";
  for (const segment of segments) {
    path = typeof segment === "number" ? `${path}[${segment}]` : child_path(path, segment);
  }
  return path;
}

/** The first value of `input` that JSON cannot carry, or the point where it passes `max_bytes`. */
function find_json_safety_issue(
  input: unknown,
  max_bytes: number,
  built_by_caller: boolean,
): DocumentValidationError | undefined {
  const { issue } = measureJson(input, max_bytes, { builtByCaller: built_by_caller });
  if (issue === undefined) return undefined;

  const path = json_path(issue.segments);
  return issue.kind === "limit"
    ? {
        path,
        code: "resource-limit",
        message: `Snapshot maxSerializedBytes limit ${max_bytes} exceeded`,
      }
    : { path, code: "non-serializable", message: issue.message };
}

function resource_validation_error(
  resource: keyof SnapshotResourceLimits,
  limit: number,
  actual: number,
  path: string,
): DocumentValidationError {
  return {
    path,
    code: "resource-limit",
    message: `Snapshot ${resource} limit ${limit} exceeded by ${actual}`,
  };
}

function resolve_snapshot_validation_options(
  options: SnapshotValidationOptions,
): ResolvedSnapshotValidationOptions | DocumentValidationError {
  const storage = options.storage ?? "dense";
  if (storage !== "dense" && storage !== "paged") {
    return {
      path: "options.storage",
      code: "invalid-value",
      message: "Snapshot storage must be dense or paged",
    };
  }
  const overrides: Partial<SnapshotResourceLimits> = {};
  for (const resource of SNAPSHOT_RESOURCE_KEYS) {
    const override = options.resourceLimits?.[resource];
    if (override === undefined) continue;
    if (!non_negative_integer(override)) {
      return {
        path: `options.resourceLimits.${resource}`,
        code: "invalid-value",
        message: `${resource} must be a non-negative safe integer`,
      };
    }
    overrides[resource] = override;
  }
  return { storage, limits: resolve_snapshot_resource_limits(overrides) };
}

/**
 * `DEFAULT_SNAPSHOT_RESOURCE_LIMITS` with validated `overrides` over it, and
 * `maxDenseCells` and `maxLocalPagedCells` capped at the engine's ceilings,
 * which `assertWorkbookAllocationLimits` returns to the store.
 */
function resolve_snapshot_resource_limits(
  overrides: Partial<SnapshotResourceLimits> = {},
): SnapshotResourceLimits {
  const limits: SnapshotResourceLimits = { ...DEFAULT_SNAPSHOT_RESOURCE_LIMITS };
  for (const resource of SNAPSHOT_RESOURCE_KEYS) {
    const override = overrides[resource];
    if (override !== undefined) limits[resource] = override;
  }
  limits.maxDenseCells = Math.min(limits.maxDenseCells, ENGINE_STORAGE_CEILINGS.maxDenseCells);
  limits.maxLocalPagedCells = Math.min(
    limits.maxLocalPagedCells,
    ENGINE_STORAGE_CEILINGS.maxLocalPagedCells,
  );
  return limits;
}

/** Cells a dense-storage workbook holds so far, by where the engine keeps them. */
interface DenseStorageCells {
  dense: number;
  local: number;
}

/**
 * Places a sheet of `cells` cells of a dense-storage workbook as the engine
 * does, in snapshot order: in dense storage while the dense sheets fit
 * `maxDenseCells`, else in local pages while the local sheets fit
 * `maxLocalPagedCells`. Returns whether it fits either.
 */
function place_dense_storage_sheet(
  placed: DenseStorageCells,
  cells: number,
  limits: Readonly<SnapshotResourceLimits>,
): boolean {
  if (placed.dense + cells <= limits.maxDenseCells) placed.dense += cells;
  else if (placed.local + cells <= limits.maxLocalPagedCells) placed.local += cells;
  else return false;
  return true;
}

function array_data_value(array: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
  return descriptor?.enumerable && "value" in descriptor ? descriptor.value : undefined;
}

function product_exceeds(left: number, right: number, limit: number): boolean {
  return left !== 0 && right > Math.floor(limit / left);
}

function preflight_snapshot_resources(
  input: unknown,
  options: ResolvedSnapshotValidationOptions,
): DocumentValidationError | undefined {
  if (!isPlainRecord(input)) return undefined;
  const sheets = ownValue(input, "sheets");
  if (!Array.isArray(sheets)) return undefined;
  const { limits } = options;
  if (sheets.length > limits.maxSheets) {
    return resource_validation_error("maxSheets", limits.maxSheets, sheets.length, "sheets");
  }

  let metadata_entries = 0;
  const workbook = ownValue(input, "workbook");
  if (isPlainRecord(workbook)) {
    const named_ranges = ownValue(workbook, "namedRanges");
    if (Array.isArray(named_ranges)) {
      metadata_entries = named_ranges.length;
      if (metadata_entries > limits.maxMetadataEntries) {
        return resource_validation_error(
          "maxMetadataEntries",
          limits.maxMetadataEntries,
          metadata_entries,
          "workbook.namedRanges",
        );
      }
    }
  }

  const placed: DenseStorageCells = { dense: 0, local: 0 };
  let table_count = 0;
  for (let sheet_index = 0; sheet_index < sheets.length; sheet_index++) {
    const sheet = array_data_value(sheets, sheet_index);
    if (!isPlainRecord(sheet)) continue;
    const path = `sheets[${sheet_index}]`;
    const row_count = ownValue(sheet, "rowCount");
    const columns = ownValue(sheet, "columns");
    if (non_negative_integer(row_count) && row_count > limits.maxRowsPerSheet) {
      return resource_validation_error(
        "maxRowsPerSheet",
        limits.maxRowsPerSheet,
        row_count,
        `${path}.rowCount`,
      );
    }

    if (Array.isArray(columns) && columns.length > limits.maxColumnsPerSheet) {
      return resource_validation_error(
        "maxColumnsPerSheet",
        limits.maxColumnsPerSheet,
        columns.length,
        `${path}.columns`,
      );
    }

    if (non_negative_integer(row_count) && Array.isArray(columns)) {
      if (product_exceeds(row_count, columns.length, limits.maxLogicalCellsPerSheet)) {
        return resource_validation_error(
          "maxLogicalCellsPerSheet",
          limits.maxLogicalCellsPerSheet,
          row_count * columns.length,
          path,
        );
      }

      if (options.storage === "dense") {
        // The logical-cell check above keeps the product exact.
        const cells = row_count * columns.length;
        if (!place_dense_storage_sheet(placed, cells, limits)) {
          return resource_validation_error(
            "maxLocalPagedCells",
            limits.maxLocalPagedCells,
            placed.local + cells,
            path,
          );
        }
      }
    }

    for (const key of SHEET_METADATA_ARRAY_KEYS) {
      const entries = ownValue(sheet, key);
      if (!Array.isArray(entries)) continue;
      if (entries.length > limits.maxMetadataEntries - metadata_entries) {
        return resource_validation_error(
          "maxMetadataEntries",
          limits.maxMetadataEntries,
          metadata_entries + entries.length,
          `${path}.${key}`,
        );
      }

      metadata_entries += entries.length;
      if (key === "tables") {
        table_count += entries.length;
        if (table_count > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables) {
          return {
            path: `${path}.tables`,
            code: "resource-limit",
            message: `Workbook table limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables} exceeded by ${table_count}`,
          };
        }

        for (let table_index = 0; table_index < entries.length; table_index++) {
          const table = array_data_value(entries, table_index);
          if (!isPlainRecord(table)) continue;
          const columns = ownValue(table, "columns");
          if (!Array.isArray(columns)) continue;
          if (columns.length > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable) {
            return {
              path: `${path}.tables[${table_index}].columns`,
              code: "resource-limit",
              message: `Workbook table column limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxColumnsPerTable} exceeded by ${columns.length}`,
            };
          }

          if (columns.length > limits.maxMetadataEntries - metadata_entries) {
            return resource_validation_error(
              "maxMetadataEntries",
              limits.maxMetadataEntries,
              metadata_entries + columns.length,
              `${path}.tables[${table_index}].columns`,
            );
          }

          metadata_entries += columns.length;
        }
      }
    }
  }

  return undefined;
}

/**
 * Reject workbook dimensions before a direct store or grid allocates JS/WASM
 * buffers, and return the resolved limits the workbook met.
 */
export function assertWorkbookAllocationLimits(
  workbook: Workbook,
  options: SnapshotValidationOptions = {},
): SnapshotResourceLimits {
  const resolved = resolve_snapshot_validation_options(options);
  if ("code" in resolved) {
    throw new SheetwriteError(
      resolved.path === "options.storage" ? "invalid-argument" : "invalid-limits",
      "snapshot-allocate",
      resolved.message,
      { context: { path: resolved.path } },
    );
  }

  const { limits } = resolved;
  if (workbook.sheets.length > limits.maxSheets) {
    throw new SnapshotResourceError("maxSheets", limits.maxSheets, workbook.sheets.length);
  }

  assertWorkbookTables(
    workbook.sheets,
    DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS,
    (workbook.namedRanges ?? []).map((range) => range.name),
  );
  for (const sheet of workbook.sheets) {
    if ((sheet.hyperlinks?.length ?? 0) > MAX_HYPERLINKS_PER_SHEET) {
      throw new SnapshotResourceError(
        "maxMetadataEntries",
        MAX_HYPERLINKS_PER_SHEET,
        sheet.hyperlinks!.length,
      );
    }

    if ((sheet.conditionalFormats?.length ?? 0) > MAX_CONDITIONAL_FORMAT_RULES) {
      throw new SnapshotResourceError(
        "maxMetadataEntries",
        MAX_CONDITIONAL_FORMAT_RULES,
        sheet.conditionalFormats!.length,
      );
    }

    if ((sheet.validationRules?.length ?? 0) > MAX_VALIDATION_RULES) {
      throw new SnapshotResourceError(
        "maxMetadataEntries",
        MAX_VALIDATION_RULES,
        sheet.validationRules!.length,
      );
    }

    const chart_count = sheet.charts?.length ?? 0;
    if (chart_count > MAX_CHARTS_PER_SHEET) {
      throw new SnapshotResourceError("maxMetadataEntries", MAX_CHARTS_PER_SHEET, chart_count);
    }
  }

  const placed: DenseStorageCells = { dense: 0, local: 0 };
  let metadata_entries = workbook.namedRanges?.length ?? 0;
  if (metadata_entries > limits.maxMetadataEntries) {
    throw new SnapshotResourceError(
      "maxMetadataEntries",
      limits.maxMetadataEntries,
      metadata_entries,
    );
  }

  for (const sheet of workbook.sheets) {
    if (!non_negative_integer(sheet.rowCount) || sheet.rowCount > limits.maxRowsPerSheet) {
      throw new SnapshotResourceError("maxRowsPerSheet", limits.maxRowsPerSheet, sheet.rowCount);
    }

    if (sheet.columns.length > limits.maxColumnsPerSheet) {
      throw new SnapshotResourceError(
        "maxColumnsPerSheet",
        limits.maxColumnsPerSheet,
        sheet.columns.length,
      );
    }

    if (product_exceeds(sheet.rowCount, sheet.columns.length, limits.maxLogicalCellsPerSheet)) {
      throw new SnapshotResourceError(
        "maxLogicalCellsPerSheet",
        limits.maxLogicalCellsPerSheet,
        sheet.rowCount * sheet.columns.length,
      );
    }

    if (resolved.storage === "dense") {
      const cells = sheet.rowCount * sheet.columns.length;
      if (!place_dense_storage_sheet(placed, cells, limits)) {
        throw new SnapshotResourceError(
          "maxLocalPagedCells",
          limits.maxLocalPagedCells,
          placed.local + cells,
        );
      }
    }

    metadata_entries +=
      (sheet.rowHeights?.size ?? 0) +
      (sheet.hiddenRows?.size ?? 0) +
      (sheet.merges?.length ?? 0) +
      (sheet.conditionalFormats?.length ?? 0) +
      (sheet.hyperlinks?.length ?? 0) +
      (sheet.validationRules?.length ?? 0) +
      (sheet.protectedRanges?.length ?? 0) +
      (sheet.notes?.length ?? 0) +
      (sheet.sortKeys?.length ?? 0) +
      (sheet.filters?.length ?? 0) +
      (sheet.autoFilter ? 1 : 0) +
      (sheet.rowGroups?.length ?? 0) +
      (sheet.tables?.length ?? 0) +
      (sheet.tables?.reduce((count, table) => count + table.columns.length, 0) ?? 0) +
      (sheet.charts?.length ?? 0) +
      (sheet.pivots?.length ?? 0) +
      (sheet.pivots?.reduce((count, pivot) => count + (pivot.savedOutput?.cells.length ?? 0), 0) ??
        0);
    if (metadata_entries > limits.maxMetadataEntries) {
      throw new SnapshotResourceError(
        "maxMetadataEntries",
        limits.maxMetadataEntries,
        metadata_entries,
      );
    }
  }
  return limits;
}

function invalid(
  errors: DocumentValidationError[],
  path: string,
  message: string,
  code: DocumentValidationError["code"] = "invalid-value",
): void {
  errors.push({ path, code, message });
}

function record_at(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): PlainRecord | undefined {
  if (isPlainRecord(value)) return value;
  invalid(errors, path, `${path} must be an object`);
  return undefined;
}

function array_at(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  invalid(errors, path, `${path} must be an array`);
  return undefined;
}

function optional_array(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
): unknown[] | undefined {
  const value = ownValue(record, key);
  return value === undefined ? undefined : array_at(value, `${path}.${key}`, errors);
}

function require_string(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
  non_empty = false,
): string | undefined {
  const value = ownValue(record, key);
  if (typeof value === "string" && (!non_empty || value.length > 0)) return value;
  invalid(errors, `${path}.${key}`, `${key} must be ${non_empty ? "a non-empty " : "a "}string`);
  return undefined;
}

/** Reads one field of a record under validation: `ownValue`, or `walked_field` after the JSON-safety walk. */
type FieldReader = (record: PlainRecord, key: string) => unknown;

function optional_string(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
  read: FieldReader = ownValue,
): void {
  const value = read(record, key);
  if (value !== undefined && typeof value !== "string") {
    invalid(errors, `${path}.${key}`, `${key} must be a string`);
  }
}

function optional_boolean(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
  read: FieldReader = ownValue,
): void {
  const value = read(record, key);
  if (value !== undefined && typeof value !== "boolean") {
    invalid(errors, `${path}.${key}`, `${key} must be a boolean`);
  }
}

function require_non_negative_integer(
  record: PlainRecord,
  key: string,
  path: string,
  errors: DocumentValidationError[],
  positive = false,
  negative_is_out_of_bounds = false,
): number | undefined {
  const value = ownValue(record, key);
  if (non_negative_integer(value) && (!positive || value > 0)) return value;
  invalid(
    errors,
    `${path}.${key}`,
    `${key} must be a ${positive ? "positive" : "non-negative"} integer`,
    negative_is_out_of_bounds && typeof value === "number" && Number.isInteger(value) && value < 0
      ? "out-of-bounds"
      : "invalid-value",
  );
  return undefined;
}

function scalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    finite_number(value)
  );
}

function validate_cell_border(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
  read: FieldReader,
): void {
  const border = record_at(value, path, errors);
  if (!border) return;
  optional_string(border, "color", path, errors, read);
  const width = read(border, "width");
  if (width !== undefined && (!finite_number(width) || width < 0)) {
    invalid(errors, `${path}.width`, "Border width must be finite and non-negative");
  }
  const style = read(border, "style");
  if (style !== undefined && !["solid", "dashed", "dotted"].includes(String(style))) {
    invalid(errors, `${path}.style`, "Border style is invalid");
  }
}

function validate_cell_style(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
  read: FieldReader = ownValue,
): void {
  const style = record_at(value, path, errors);
  if (!style) return;
  for (const key of ["bold", "italic", "underline", "strikethrough", "wrap"]) {
    optional_boolean(style, key, path, errors, read);
  }

  for (const key of ["color", "backgroundColor"]) {
    optional_string(style, key, path, errors, read);
  }

  const font_size = read(style, "fontSize");
  if (font_size !== undefined && (!finite_number(font_size) || font_size < 0)) {
    invalid(errors, `${path}.fontSize`, "fontSize must be finite and non-negative");
  }

  const align = read(style, "align");
  if (align !== undefined && !["left", "center", "right"].includes(String(align))) {
    invalid(errors, `${path}.align`, "align must be left, center, or right");
  }

  const vertical_align = read(style, "verticalAlign");
  if (vertical_align !== undefined && !isCellVerticalAlign(vertical_align)) {
    invalid(errors, `${path}.verticalAlign`, "verticalAlign must be top, middle, or bottom");
  }

  const font_family = read(style, "fontFamily");
  if (
    font_family !== undefined &&
    (typeof font_family !== "string" || !isCellFontFamily(font_family))
  ) {
    invalid(
      errors,
      `${path}.fontFamily`,
      `fontFamily must be 1-${MAX_FONT_FAMILY_LENGTH} letters, digits, spaces, ".", "_" or "-"`,
    );
  }

  const number_format = read(style, "numberFormat");
  if (
    number_format !== undefined &&
    (typeof number_format !== "string" || !isCellNumberFormat(number_format))
  ) {
    invalid(
      errors,
      `${path}.numberFormat`,
      `numberFormat must be 1-${MAX_NUMBER_FORMAT_LENGTH} characters without control characters`,
    );
  }

  const borders = read(style, "border");
  if (borders !== undefined) {
    const border_record = record_at(borders, `${path}.border`, errors);
    if (border_record) {
      for (const side of ["all", "top", "right", "bottom", "left"]) {
        const border = read(border_record, side);
        if (border !== undefined) {
          validate_cell_border(border, `${path}.border.${side}`, errors, read);
        }
      }
    }
  }
}

/**
 * A shifting `moveCells` (Insert or Delete with Shift cells) stays on its
 * sheet and moves along one axis.
 */
function validate_cell_shift(
  operation: PlainRecord,
  path: string,
  errors: DocumentValidationError[],
): void {
  const shift = ownValue(operation, "shift");
  if (shift === undefined) return;
  if (shift !== true) {
    invalid(errors, `${path}.shift`, "shift must be true when present");
    return;
  }
  const range = ownValue(operation, "range");
  const to = ownValue(operation, "to");
  if (!isPlainRecord(range) || !isPlainRecord(to)) return;
  const start = ownValue(range, "start");
  const end = ownValue(range, "end");
  if (!isPlainRecord(start) || !isPlainRecord(end)) return;
  const first = (key: string) => Math.min(Number(ownValue(start, key)), Number(ownValue(end, key)));
  const same_sheet = ownValue(range, "sheet") === ownValue(to, "sheet");
  if (
    !same_sheet ||
    (first("row") !== ownValue(to, "row") && first("col") !== ownValue(to, "col"))
  ) {
    invalid(errors, `${path}.shift`, "A shift moves cells along one row or column of their sheet");
  }
}

function validate_address(value: unknown, path: string, errors: DocumentValidationError[]): void {
  const address = record_at(value, path, errors);
  if (!address) return;
  require_string(address, "sheet", path, errors, true);
  require_non_negative_integer(address, "row", path, errors, false, true);
  require_non_negative_integer(address, "col", path, errors, false, true);
}

function validate_range_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const range = record_at(value, path, errors);
  if (!range) return;
  require_string(range, "sheet", path, errors, true);
  for (const end of ["start", "end"]) {
    const coordinate_path = `${path}.${end}`;
    const coordinate = record_at(ownValue(range, end), coordinate_path, errors);
    if (!coordinate) continue;
    require_non_negative_integer(coordinate, "row", coordinate_path, errors, false, true);
    require_non_negative_integer(coordinate, "col", coordinate_path, errors, false, true);
  }
}

/** True when `operation` carries every field of a `restoreBlock` operation. */
function is_restore_block_shape(
  operation: PlainRecord,
): operation is PlainRecord & Extract<DocumentOp, { op: "restoreBlock" }> {
  const range_errors: DocumentValidationError[] = [];
  validate_range_shape(ownValue(operation, "range"), "range", range_errors);
  return (
    range_errors.length === 0 &&
    ownValue(operation, "op") === "restoreBlock" &&
    ownValue(operation, "encoding") === "deflate-json-v1" &&
    typeof ownValue(operation, "decodedBytes") === "number" &&
    typeof ownValue(operation, "data") === "string"
  );
}

function validate_cell_value_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const cell_value = record_at(value, path, errors);
  if (!cell_value) return;
  const kind = ownValue(cell_value, "kind");
  if (kind === "literal") {
    const literal = ownValue(cell_value, "value");
    if (!scalar(literal)) invalid(errors, `${path}.value`, "Literal values must be JSON scalars");
    return;
  }
  if (kind === "formula") {
    require_string(cell_value, "src", path, errors);
    return;
  }
  if (kind === "ref") {
    validate_address(ownValue(cell_value, "target"), `${path}.target`, errors);
    return;
  }
  invalid(errors, `${path}.kind`, "Cell value kind must be literal, formula, or ref");
}

function validate_column_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const column = record_at(value, path, errors);
  if (!column) return;
  require_string(column, "key", path, errors, true);
  require_string(column, "header", path, errors);
  const width = ownValue(column, "width");
  if (!finite_number(width) || width < 0) {
    invalid(errors, `${path}.width`, "Column width must be finite and non-negative");
  }
  const type = ownValue(column, "type");
  if (!COLUMN_TYPES.includes(String(type))) {
    invalid(errors, `${path}.type`, "Column type is invalid");
  }
  for (const key of ["numberFormat", "numberLocale", "renderer"]) {
    optional_string(column, key, path, errors);
  }
  optional_boolean(column, "visible", path, errors);
  for (const key of ["headerStyle", "cellStyle"]) {
    const style = ownValue(column, key);
    if (style !== undefined) validate_cell_style(style, `${path}.${key}`, errors);
  }
}

function validate_conditional_predicate(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const predicate = record_at(value, path, errors);
  if (!predicate) return;

  const kind = ownValue(predicate, "kind");
  if (kind === "greaterThan" || kind === "lessThan") {
    if (!finite_number(ownValue(predicate, "value"))) {
      invalid(errors, `${path}.value`, "Conditional comparison value must be finite");
    }
  } else if (kind === "equal") {
    if (!scalar(ownValue(predicate, "value"))) {
      invalid(errors, `${path}.value`, "Conditional equality value must be a scalar");
    }
  } else if (kind === "contains") {
    require_string(predicate, "text", path, errors);
    optional_boolean(predicate, "matchCase", path, errors);
  } else if (kind === "formula") {
    const source = ownValue(predicate, "source");
    if (
      typeof source !== "string" ||
      !source.startsWith("=") ||
      source.length > MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH
    ) {
      invalid(
        errors,
        `${path}.source`,
        `Conditional formula source must start with = and contain at most ${MAX_CONDITIONAL_FORMAT_FORMULA_LENGTH} characters`,
        "resource-limit",
      );
    }
  } else {
    invalid(errors, `${path}.kind`, "Conditional format predicate kind is invalid");
  }
}

function validate_chart_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const chart = record_at(value, path, errors);
  if (!chart) return;

  // A series count over the bound is a resource rejection, not a malformed value.
  const series = ownValue(chart, "series");
  if (Array.isArray(series) && series.length > MAX_CHART_SERIES) {
    invalid(
      errors,
      `${path}.series`,
      `Chart series limit ${MAX_CHART_SERIES} exceeded`,
      "resource-limit",
    );
    return;
  }

  if (!sanitizeChartDefinition(chart)) {
    invalid(
      errors,
      path,
      "Chart must have a valid ID, kind, anchor, bounded text, and series ranges or #REF!",
    );
  }
}

function validate_hyperlink_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const hyperlink = record_at(value, path, errors);
  if (!hyperlink) return;
  const id = ownValue(hyperlink, "id");
  if (typeof id === "string" && !isValidHyperlinkId(id)) {
    invalid(
      errors,
      `${path}.id`,
      "Hyperlink ID must be non-empty, trimmed, control-free, and contain at most 128 characters",
      "resource-limit",
    );
  }

  require_string(hyperlink, "id", path, errors, true);
  validate_range_shape(ownValue(hyperlink, "range"), `${path}.range`, errors);
  const display = ownValue(hyperlink, "display");
  if (
    display !== undefined &&
    (typeof display !== "string" || display.length > MAX_HYPERLINK_DISPLAY_LENGTH)
  ) {
    invalid(
      errors,
      `${path}.display`,
      `Hyperlink display text must contain at most ${MAX_HYPERLINK_DISPLAY_LENGTH} characters`,
      "resource-limit",
    );
  }

  const style = ownValue(hyperlink, "style");
  if (style !== undefined) validate_cell_style(style, `${path}.style`, errors);
  const target_path = `${path}.target`;
  const target = record_at(ownValue(hyperlink, "target"), target_path, errors);
  if (!target) return;
  const kind = ownValue(target, "kind");
  if (kind === "external") {
    const url = ownValue(target, "url");
    if (typeof url !== "string" || !isSafeExternalHyperlink(url)) {
      invalid(
        errors,
        `${target_path}.url`,
        "Hyperlink external target must be an absolute HTTPS or mailto URL",
        "invalid-value",
      );
    }
  } else if (kind === "internal") {
    validate_range_shape(ownValue(target, "range"), `${target_path}.range`, errors);
  } else {
    invalid(errors, `${target_path}.kind`, "Hyperlink target kind is invalid");
  }

  if (!isValidCellHyperlink(value)) {
    invalid(
      errors,
      path,
      "Hyperlink metadata contains an unsafe, unbounded, or unsupported field",
      "invalid-value",
    );
  }
}

/** The longest formula Excel takes in a data validation rule. */
export const MAX_VALIDATION_FORMULA_LENGTH = 255;

/** Whether `value` is a validation formula: text with its leading `=`, within Excel's length. */
function validation_formula(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    value.length <= MAX_VALIDATION_FORMULA_LENGTH &&
    value.startsWith("=")
  );
}

function validate_validation_comparison(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
  text_length: boolean,
): void {
  const comparison = record_at(value, path, errors);
  if (!comparison) return;
  const operator = ownValue(comparison, "operator");
  const interval = operator === "between" || operator === "notBetween";
  const single = [
    "equal",
    "notEqual",
    "greaterThan",
    "lessThan",
    "greaterThanOrEqual",
    "lessThanOrEqual",
  ].includes(String(operator));
  if (!interval && !single) {
    invalid(errors, `${path}.operator`, "Validation comparison operator is invalid");
    return;
  }

  const validate_operand = (key: "min" | "max" | "value"): number | undefined => {
    const operand = ownValue(comparison, key);
    // A formula bound is checked when a value is, in its cell.
    if (validation_formula(operand)) return undefined;
    if (text_length) {
      if (non_negative_integer(operand)) return operand;
    } else if (finite_number(operand)) {
      return operand;
    }
    invalid(
      errors,
      `${path}.${key}`,
      text_length
        ? "Text length comparison operands must be non-negative integers or formulas"
        : "Validation comparison operands must be finite numbers or formulas",
    );
    return undefined;
  };

  if (interval) {
    const min = validate_operand("min");
    const max = validate_operand("max");
    if (ownValue(comparison, "value") !== undefined) {
      invalid(errors, path, "Interval validation comparisons may not define value");
    }
    if (min !== undefined && max !== undefined && min > max) {
      invalid(errors, path, "Validation comparison minimum may not exceed maximum");
    }
    return;
  }

  validate_operand("value");
  if (ownValue(comparison, "min") !== undefined || ownValue(comparison, "max") !== undefined) {
    invalid(errors, path, "Single-value validation comparisons may not define min or max");
  }
}

function validate_validation_condition(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const condition = record_at(value, path, errors);
  if (!condition) return;
  const kind = ownValue(condition, "kind");
  if (kind === "any") return;
  if (kind === "custom") {
    if (!validation_formula(ownValue(condition, "formula"))) {
      invalid(errors, `${path}.formula`, "A custom validation needs a formula that starts with =");
    }
    return;
  }
  if (kind === "list") {
    optional_boolean(condition, "allowCustom", path, errors);
    if (ownValue(condition, "source") !== undefined) {
      if (
        !validation_formula(ownValue(condition, "source")) ||
        ownValue(condition, "values") !== undefined
      ) {
        invalid(
          errors,
          `${path}.source`,
          "A list source is one formula that starts with =, without values",
        );
      }
      return;
    }
    const values = array_at(ownValue(condition, "values"), `${path}.values`, errors);
    if (values && values.length === 0) {
      invalid(errors, `${path}.values`, "List validation needs at least one value");
    }

    values?.forEach((entry, index) => {
      if (!scalar(entry)) {
        invalid(errors, `${path}.values[${index}]`, "List validation values must be scalars");
      }
    });

    return;
  }

  if (kind === "number" || kind === "date" || kind === "time") {
    const min = ownValue(condition, "min");
    const max = ownValue(condition, "max");
    const comparison = ownValue(condition, "comparison");
    if (comparison !== undefined && (min !== undefined || max !== undefined)) {
      invalid(errors, path, "Validation comparison may not be combined with legacy min or max");
    }

    if (comparison !== undefined) {
      validate_validation_comparison(comparison, `${path}.comparison`, errors, false);
    }

    if (min !== undefined && !finite_number(min)) {
      invalid(errors, `${path}.min`, "Validation minimum must be finite");
    }

    if (max !== undefined && !finite_number(max)) {
      invalid(errors, `${path}.max`, "Validation maximum must be finite");
    }

    if (finite_number(min) && finite_number(max) && min > max) {
      invalid(errors, path, "Validation minimum may not exceed maximum");
    }

    if (kind === "number") optional_boolean(condition, "integer", path, errors);
    return;
  }

  if (kind === "textLength") {
    const min = ownValue(condition, "min");
    const max = ownValue(condition, "max");
    const comparison = ownValue(condition, "comparison");
    if (comparison !== undefined && (min !== undefined || max !== undefined)) {
      invalid(errors, path, "Text length comparison may not be combined with legacy min or max");
    }

    if (comparison !== undefined) {
      validate_validation_comparison(comparison, `${path}.comparison`, errors, true);
    }

    if (min !== undefined && !non_negative_integer(min)) {
      invalid(errors, `${path}.min`, "Text length minimum must be a non-negative integer");
    }

    if (max !== undefined && !non_negative_integer(max)) {
      invalid(errors, `${path}.max`, "Text length maximum must be a non-negative integer");
    }

    if (non_negative_integer(min) && non_negative_integer(max) && min > max) {
      invalid(errors, path, "Text length minimum may not exceed maximum");
    }

    return;
  }

  if (kind === "checkbox") {
    for (const key of ["checkedValue", "uncheckedValue"]) {
      const entry = ownValue(condition, key);
      if (entry !== undefined && !scalar(entry)) {
        invalid(errors, `${path}.${key}`, `${key} must be a scalar`);
      }
    }

    return;
  }

  invalid(errors, `${path}.kind`, "Validation condition kind is invalid");
}

function validate_filter_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const filter = record_at(value, path, errors);
  if (!filter) return;
  const kind = ownValue(filter, "kind");
  if (kind === "values") {
    const values = array_at(ownValue(filter, "values"), `${path}.values`, errors);
    values?.forEach((entry, index) => {
      if (!scalar(entry))
        invalid(errors, `${path}.values[${index}]`, "Filter values must be scalars");
    });
  } else if (kind === "contains") {
    require_string(filter, "text", path, errors);
    optional_boolean(filter, "matchCase", path, errors);
  } else if (kind === "compare") {
    const operation = ownValue(filter, "op");
    if (!["gt", "gte", "lt", "lte", "eq", "neq"].includes(String(operation))) {
      invalid(errors, `${path}.op`, "Filter comparison operation is invalid");
    }
    if (!finite_number(ownValue(filter, "value"))) {
      invalid(errors, `${path}.value`, "Filter comparison value must be finite");
    }
  } else if (kind === "custom") {
    const join = ownValue(filter, "join");
    if (join !== "and" && join !== "or") {
      invalid(errors, `${path}.join`, "Custom filter join must be and or or");
    }
    const conditions = array_at(ownValue(filter, "conditions"), `${path}.conditions`, errors);
    if (conditions && (conditions.length < 1 || conditions.length > 2)) {
      invalid(errors, `${path}.conditions`, "Custom filters have one or two conditions");
    }
    conditions?.forEach((entry, index) => {
      const condition_path = `${path}.conditions[${index}]`;
      const condition = record_at(entry, condition_path, errors);
      if (
        condition &&
        !validFilterCondition({
          op: ownValue(condition, "op"),
          value: ownValue(condition, "value"),
        })
      ) {
        invalid(errors, condition_path, "Filter condition operation or value is invalid");
      }
    });
  } else if (kind === "dynamic") {
    if (!DYNAMIC_DATE_FILTERS.has(String(ownValue(filter, "type")))) {
      invalid(errors, `${path}.type`, "Dynamic date filter type is invalid");
    }
  } else if (kind !== "empty" && kind !== "nonEmpty") {
    invalid(errors, `${path}.kind`, "Filter kind is invalid");
  }
}

function validate_auto_filter_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const auto_filter = record_at(value, path, errors);
  if (auto_filter) validate_range_shape(ownValue(auto_filter, "range"), `${path}.range`, errors);
}

const TABLE_UNSUPPORTED_FEATURES = [
  "auto-filter",
  "sort-state",
  "calculated-columns",
  "totals-functions",
  "query-table",
  "external-data",
  "extensions",
] as const;

function validate_workbook_table_column_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const column = record_at(value, path, errors);
  if (!column) return;
  require_string(column, "id", path, errors, true);
  require_string(column, "name", path, errors, true);
  optional_string(column, "totalsRowLabel", path, errors);
  const totals_function = ownValue(column, "totalsRowFunction");
  if (
    totals_function !== undefined &&
    (typeof totals_function !== "string" ||
      ![
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
      ].includes(totals_function))
  ) {
    invalid(errors, `${path}.totalsRowFunction`, "Invalid table totals-row function");
  }

  for (const key of ["calculatedColumnFormula", "totalsRowFormula"]) {
    const formula = ownValue(column, key);
    if (formula !== undefined && !validWorkbookTableXmlElement(formula, key)) {
      invalid(errors, `${path}.${key}`, "Invalid or oversized table formula metadata");
    }
  }
}

function validate_workbook_table_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
  partial = false,
): void {
  const table = record_at(value, path, errors);
  if (!table) return;
  if (partial) optional_string(table, "name", path, errors);
  else {
    require_string(table, "id", path, errors, true);
    require_string(table, "name", path, errors, true);
  }

  const range = ownValue(table, "range");
  if (range !== undefined || !partial) validate_range_shape(range, `${path}.range`, errors);
  const columns_value = ownValue(table, "columns");
  if (columns_value !== undefined || !partial) {
    const columns = array_at(columns_value, `${path}.columns`, errors);
    columns?.forEach((column, index) => {
      validate_workbook_table_column_shape(column, `${path}.columns[${index}]`, errors);
    });
  }

  for (const key of ["headerRow", "totalsRow"]) {
    const flag = ownValue(table, key);
    if (flag === undefined && partial) continue;
    if (typeof flag !== "boolean") invalid(errors, `${path}.${key}`, `${key} must be a boolean`);
  }

  for (const key of ["autoFilter", "sortState"]) {
    const rule = ownValue(table, key);
    if (rule === undefined || (partial && rule === null)) continue;
    if (!validWorkbookTableXmlElement(rule, key)) {
      invalid(errors, `${path}.${key}`, "Invalid or oversized table rule metadata");
    }
  }

  const style_value = ownValue(table, "style");
  if (style_value !== undefined && style_value !== null) {
    const style_path = `${path}.style`;
    const style = record_at(style_value, style_path, errors);
    if (style) {
      optional_string(style, "name", style_path, errors);
      for (const key of [
        "showFirstColumn",
        "showLastColumn",
        "showRowStripes",
        "showColumnStripes",
      ]) {
        optional_boolean(style, key, style_path, errors);
      }
    }
  } else if (!partial && style_value === null) {
    invalid(errors, `${path}.style`, "Table style may not be null");
  }

  const unsupported_value = ownValue(table, "unsupportedFeatures");
  if (unsupported_value !== undefined) {
    const features = array_at(unsupported_value, `${path}.unsupportedFeatures`, errors);
    features?.forEach((feature, index) => {
      if (!TABLE_UNSUPPORTED_FEATURES.includes(feature as never)) {
        invalid(
          errors,
          `${path}.unsupportedFeatures[${index}]`,
          "Unsupported table feature is invalid",
        );
      }
    });
  }
}

/**
 * `walked` says the JSON-safety walk accepted `value` in this validation, with
 * no code run since, so its cells may be accepted by `is_valid_walked_cell`.
 */
function validate_sheet_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
  walked = false,
): void {
  const sheet = record_at(value, path, errors);
  if (!sheet) return;
  require_string(sheet, "id", path, errors, true);
  require_string(sheet, "name", path, errors);
  require_non_negative_integer(sheet, "order", path, errors);
  require_non_negative_integer(sheet, "rowCount", path, errors);
  const visibility = ownValue(sheet, "visibility");
  if (
    visibility !== undefined &&
    visibility !== "visible" &&
    visibility !== "hidden" &&
    visibility !== "veryHidden"
  ) {
    invalid(errors, `${path}.visibility`, "Sheet visibility is invalid");
  }

  const columns = array_at(ownValue(sheet, "columns"), `${path}.columns`, errors);
  // A dashboard has no columns; `validateSheetKindShape` checks it.
  if (columns && columns.length === 0 && ownValue(sheet, "kind") !== "dashboard") {
    invalid(errors, `${path}.columns`, "A sheet needs at least one column");
  }
  columns?.forEach((column, index) => {
    validate_column_shape(column, `${path}.columns[${index}]`, errors);
  });

  validate_tab_color(ownValue(sheet, "tabColor"), `${path}.tabColor`, errors);

  for (const key of ["frozenRows", "frozenCols"]) {
    const frozen = ownValue(sheet, key);
    if (frozen !== undefined && !non_negative_integer(frozen)) {
      invalid(errors, `${path}.${key}`, `${key} must be a non-negative integer`);
    }
  }

  const row_meta = optional_array(sheet, "rowMeta", path, errors);
  row_meta?.forEach((entry, index) => {
    const entry_path = `${path}.rowMeta[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      invalid(errors, entry_path, "Row metadata must be a [row, metadata] tuple");
      return;
    }
    if (!non_negative_integer(entry[0])) {
      invalid(errors, `${entry_path}[0]`, "Row metadata index must be a non-negative integer");
    }
    const metadata = record_at(entry[1], `${entry_path}[1]`, errors);
    if (!metadata) return;
    const height = ownValue(metadata, "height");
    if (height !== undefined && (!finite_number(height) || height <= 0)) {
      invalid(errors, `${entry_path}[1].height`, "Row height must be finite and positive");
    }
    optional_boolean(metadata, "hidden", `${entry_path}[1]`, errors);
  });

  const merges = optional_array(sheet, "merges", path, errors);
  merges?.forEach((entry, index) => {
    validate_merge_shape(entry, `${path}.merges[${index}]`, errors);
  });
  const hyperlinks = optional_array(sheet, "hyperlinks", path, errors);
  if (hyperlinks && hyperlinks.length > MAX_HYPERLINKS_PER_SHEET) {
    invalid(
      errors,
      `${path}.hyperlinks`,
      `Hyperlink limit ${MAX_HYPERLINKS_PER_SHEET} exceeded`,
      "resource-limit",
    );
  }
  hyperlinks?.forEach((entry, index) => {
    validate_hyperlink_shape(entry, `${path}.hyperlinks[${index}]`, errors);
  });

  const conditional_formats = optional_array(sheet, "conditionalFormats", path, errors);
  if (conditional_formats && conditional_formats.length > MAX_CONDITIONAL_FORMAT_RULES) {
    invalid(
      errors,
      `${path}.conditionalFormats`,
      `Conditional-format rule limit ${MAX_CONDITIONAL_FORMAT_RULES} exceeded`,
      "resource-limit",
    );
  }
  conditional_formats?.forEach((entry, index) => {
    validate_conditional_format_shape(entry, `${path}.conditionalFormats[${index}]`, errors, true);
  });

  const validation_rules = optional_array(sheet, "validationRules", path, errors);
  if (validation_rules && validation_rules.length > MAX_VALIDATION_RULES) {
    invalid(
      errors,
      `${path}.validationRules`,
      `Data validation rule limit ${MAX_VALIDATION_RULES} exceeded`,
      "resource-limit",
    );
  }
  validation_rules?.forEach((entry, index) => {
    validate_validation_rule_shape(entry, `${path}.validationRules[${index}]`, errors);
  });

  const protected_ranges = optional_array(sheet, "protectedRanges", path, errors);
  protected_ranges?.forEach((entry, index) => {
    validate_protected_range_shape(entry, `${path}.protectedRanges[${index}]`, errors);
  });

  const notes = optional_array(sheet, "notes", path, errors);
  notes?.forEach((entry, index) => {
    const note_path = `${path}.notes[${index}]`;
    const note = record_at(entry, note_path, errors);
    if (!note) return;
    validate_address(ownValue(note, "addr"), `${note_path}.addr`, errors);
    require_string(note, "text", note_path, errors, true);
  });

  const sort_keys = optional_array(sheet, "sortKeys", path, errors);
  sort_keys?.forEach((entry, index) => {
    const sort_path = `${path}.sortKeys[${index}]`;
    const sort_key = record_at(entry, sort_path, errors);
    if (!sort_key) return;
    require_non_negative_integer(sort_key, "col", sort_path, errors);
    const ascending = ownValue(sort_key, "ascending");
    if (typeof ascending !== "boolean") {
      invalid(errors, `${sort_path}.ascending`, "ascending must be a boolean");
    }
  });

  const sort_state = ownValue(sheet, "sortState");
  if (sort_state !== undefined && !validWorkbookTableXmlElement(sort_state, "sortState")) {
    invalid(errors, `${path}.sortState`, "Sort state must be a valid sortState element");
  }

  const filters = optional_array(sheet, "filters", path, errors);
  filters?.forEach((entry, index) => {
    const filter_path = `${path}.filters[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      invalid(errors, filter_path, "Filters must be [column, filter] tuples");
      return;
    }
    if (!non_negative_integer(entry[0])) {
      invalid(errors, `${filter_path}[0]`, "Filter column must be a non-negative integer");
    }
    validate_filter_shape(entry[1], `${filter_path}[1]`, errors);
  });

  const auto_filter = ownValue(sheet, "autoFilter");
  if (auto_filter !== undefined)
    validate_auto_filter_shape(auto_filter, `${path}.autoFilter`, errors);

  const row_groups = optional_array(sheet, "rowGroups", path, errors);
  row_groups?.forEach((entry, index) => {
    const group_path = `${path}.rowGroups[${index}]`;
    const group = record_at(entry, group_path, errors);
    if (!group) return;
    require_non_negative_integer(group, "start", group_path, errors);
    require_non_negative_integer(group, "end", group_path, errors);
    const collapsed = ownValue(group, "collapsed");
    if (typeof collapsed !== "boolean") {
      invalid(errors, `${group_path}.collapsed`, "collapsed must be a boolean");
    }
  });

  const tables = optional_array(sheet, "tables", path, errors);
  tables?.forEach((table, index) => {
    validate_workbook_table_shape(table, `${path}.tables[${index}]`, errors);
  });

  const charts = optional_array(sheet, "charts", path, errors);
  if (charts && charts.length > MAX_CHARTS_PER_SHEET) {
    invalid(
      errors,
      `${path}.charts`,
      `Chart limit ${MAX_CHARTS_PER_SHEET} exceeded`,
      "resource-limit",
    );
  } else {
    charts?.forEach((chart, index) => {
      validate_chart_shape(chart, `${path}.charts[${index}]`, errors);
    });
  }
  const pivots = optional_array(sheet, "pivots", path, errors);
  pivots?.forEach((pivot, index) => {
    validatePivotShape(pivot, `${path}.pivots[${index}]`, errors);
  });

  const blocks = array_at(ownValue(sheet, "cells"), `${path}.cells`, errors);
  // Cells can share a style object; each one is checked once per sheet.
  const valid_styles = new Set<unknown>();
  blocks?.forEach((entry, block_index) => {
    const block_path = `${path}.cells[${block_index}]`;
    const block = record_at(entry, block_path, errors);
    if (!block) return;
    for (const key of ["startRow", "startCol"]) {
      require_non_negative_integer(block, key, block_path, errors);
    }
    for (const key of ["rowCount", "colCount"]) {
      require_non_negative_integer(block, key, block_path, errors, true);
    }
    const cells = array_at(ownValue(block, "cells"), `${block_path}.cells`, errors);
    cells?.forEach((cell_entry, cell_index) => {
      if (walked && is_valid_walked_cell(cell_entry, valid_styles)) return;
      // Paths are read only by recorded errors, and almost every cell is valid,
      // so a cell's three path strings are built only to report the errors a
      // path-free pass already found.
      const error_count = errors.length;
      validate_cell_shape(cell_entry, "", errors);
      if (errors.length === error_count) return;
      errors.length = error_count;
      validate_cell_shape(cell_entry, `${block_path}.cells[${cell_index}]`, errors);
    });
  });

  validateSheetKindShape(sheet, path, errors);
}

function validate_operation_sheet_id(
  operation: PlainRecord,
  path: string,
  errors: DocumentValidationError[],
): void {
  require_string(operation, "sheet", path, errors, true);
}

function validate_cell_shape(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const cell = record_at(entry, path, errors);
  if (!cell) return;
  require_non_negative_integer(cell, "rowOffset", path, errors);
  require_non_negative_integer(cell, "colOffset", path, errors);
  validate_cell_value_shape(ownValue(cell, "value"), `${path}.value`, errors);
  const style = ownValue(cell, "style");
  if (style !== undefined) validate_cell_style(style, `${path}.style`, errors);
}

/**
 * `record[key]` when it is an own enumerable property, else undefined: the
 * same value as `ownValue` for a record the JSON-safety walk accepted, whose
 * own enumerable properties are all data properties.
 */
function walked_field(record: PlainRecord, key: string): unknown {
  return Object.prototype.propertyIsEnumerable.call(record, key) ? record[key] : undefined;
}

/**
 * Whether `validate_cell_shape` accepts `entry`, decided with direct reads and
 * without building paths. Only for a cell the JSON-safety walk accepted in
 * this validation. False means "check fully", not "invalid": a reference
 * cell or a style that fails takes the full check, which reports the errors.
 * `valid_styles` holds the style objects already accepted in this validation.
 */
function is_valid_walked_cell(entry: unknown, valid_styles: Set<unknown>): boolean {
  if (!isPlainRecord(entry)) return false;
  if (
    !non_negative_integer(walked_field(entry, "rowOffset")) ||
    !non_negative_integer(walked_field(entry, "colOffset"))
  ) {
    return false;
  }
  const value = walked_field(entry, "value");
  if (!isPlainRecord(value)) return false;
  const kind = walked_field(value, "kind");
  const valid =
    kind === "literal"
      ? scalar(walked_field(value, "value"))
      : kind === "formula" && typeof walked_field(value, "src") === "string";
  if (!valid) return false;

  const style = walked_field(entry, "style");
  if (style === undefined || valid_styles.has(style)) return true;
  const style_errors: DocumentValidationError[] = [];
  validate_cell_style(style, "", style_errors, walked_field);
  if (style_errors.length > 0) return false;
  valid_styles.add(style);
  return true;
}

function validate_merge_shape(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const merge = record_at(entry, path, errors);
  if (!merge) return;
  for (const key of ["r0", "c0", "r1", "c1"]) {
    require_non_negative_integer(merge, key, path, errors);
  }
}

function validate_conditional_format_shape(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
  validate_stop_if_true = false,
): void {
  const format = record_at(entry, path, errors);
  if (!format) return;
  validate_range_shape(ownValue(format, "range"), `${path}.range`, errors);
  validate_conditional_predicate(ownValue(format, "when"), `${path}.when`, errors);
  validate_cell_style(ownValue(format, "style"), `${path}.style`, errors);
  // Snapshot validation checks this field; operation validation historically does not.
  if (validate_stop_if_true) optional_boolean(format, "stopIfTrue", path, errors);
}

function validate_validation_rule_shape(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const rule = record_at(entry, path, errors);
  if (!rule) return;
  require_string(rule, "id", path, errors, true);
  validate_range_shape(ownValue(rule, "range"), `${path}.range`, errors);
  validate_validation_condition(ownValue(rule, "condition"), `${path}.condition`, errors);
  const policy = ownValue(rule, "policy");
  if (!["reject", "warn", "allow"].includes(String(policy))) {
    invalid(errors, `${path}.policy`, "Validation policy is invalid");
  }
  const error_style = ownValue(rule, "errorStyle");
  if (error_style !== undefined) {
    if (!["stop", "warning", "information"].includes(String(error_style))) {
      invalid(errors, `${path}.errorStyle`, "Validation error style is invalid");
    } else if ((policy === "reject") !== (error_style === "stop") && policy !== "allow") {
      invalid(
        errors,
        `${path}.errorStyle`,
        "A reject rule's error style is stop; a warn rule's is warning or information",
      );
    }
  }
  optional_boolean(rule, "allowBlank", path, errors);
  optional_boolean(rule, "inCellDropdown", path, errors);
  optional_string(rule, "helpText", path, errors);
  optional_string(rule, "errorTitle", path, errors);
  optional_boolean(rule, "showInputMessage", path, errors);
  optional_string(rule, "inputTitle", path, errors);
  optional_string(rule, "inputMessage", path, errors);
}

function validate_protected_range_shape(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const protected_range = record_at(entry, path, errors);
  if (!protected_range) return;
  require_string(protected_range, "id", path, errors, true);
  validate_range_shape(ownValue(protected_range, "range"), `${path}.range`, errors);
  optional_string(protected_range, "label", path, errors);
  optional_string(protected_range, "permissionKey", path, errors);
}

function validate_calculation_shape(
  value: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const calculation = record_at(value, path, errors);
  if (!calculation) return;

  if (typeof ownValue(calculation, "iterate") !== "boolean") {
    invalid(errors, `${path}.iterate`, "iterate must be a boolean");
  }

  const max_iterations = ownValue(calculation, "maxIterations");
  if (
    typeof max_iterations !== "number" ||
    !Number.isInteger(max_iterations) ||
    max_iterations < 1 ||
    max_iterations > MAX_ITERATIONS
  ) {
    invalid(
      errors,
      `${path}.maxIterations`,
      `maxIterations must be an integer from 1 to ${MAX_ITERATIONS}`,
    );
  }

  const max_change = ownValue(calculation, "maxChange");
  if (!finite_number(max_change) || max_change < 0) {
    invalid(errors, `${path}.maxChange`, "maxChange must be a finite number >= 0");
  }
}

function validate_named_range_shape(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const named_range = record_at(entry, path, errors);
  if (!named_range) return;
  const name = require_string(named_range, "name", path, errors, true);
  if (
    name !== undefined &&
    (name !== name.normalize("NFC") ||
      !/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name) ||
      /^[A-Za-z]+\d+$/.test(name) ||
      /^(TRUE|FALSE)$/i.test(name))
  ) {
    invalid(errors, `${path}.name`, "Named range name must be formula-safe");
  }
  optional_string(named_range, "scope", path, errors);

  const formula = ownValue(named_range, "formula");
  if (formula === undefined) {
    validate_range_shape(ownValue(named_range, "range"), `${path}.range`, errors);
  } else if (ownValue(named_range, "range") !== undefined) {
    invalid(errors, path, "A defined name has a range or a formula, not both");
  } else if (
    typeof formula !== "string" ||
    !formula.startsWith("=") ||
    formula.length > MAX_NAMED_FORMULA_LENGTH
  ) {
    invalid(
      errors,
      `${path}.formula`,
      `A defined name's formula must start with = and contain at most ${MAX_NAMED_FORMULA_LENGTH} characters`,
      "resource-limit",
    );
  }
}

/** Excel's limit on the length of a formula, which a defined name's formula shares. */
const MAX_NAMED_FORMULA_LENGTH = 8_192;

function validate_operation_sort_key(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const sort_key = record_at(entry, path, errors);
  if (!sort_key) return;
  require_non_negative_integer(sort_key, "col", path, errors);
  if (typeof ownValue(sort_key, "ascending") !== "boolean") {
    invalid(errors, `${path}.ascending`, "ascending must be a boolean");
  }
}

function validate_operation_filter_tuple(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  if (!Array.isArray(entry) || entry.length !== 2) {
    invalid(errors, path, "Filters must be [column, filter] tuples");
    return;
  }
  if (!non_negative_integer(entry[0])) {
    invalid(errors, `${path}[0]`, "Filter column must be a non-negative integer");
  }
  validate_filter_shape(entry[1], `${path}[1]`, errors);
}

function validate_operation_row_group(
  entry: unknown,
  path: string,
  errors: DocumentValidationError[],
): void {
  const group = record_at(entry, path, errors);
  if (!group) return;
  require_non_negative_integer(group, "start", path, errors);
  require_non_negative_integer(group, "end", path, errors);
  if (typeof ownValue(group, "collapsed") !== "boolean") {
    invalid(errors, `${path}.collapsed`, "collapsed must be a boolean");
  }
}

/**
 * Validate one untrusted operation before collaboration retains or applies it.
 * Workbook-relative bounds remain the Store's responsibility.
 */
export function validateDocumentOperationShape(
  value: unknown,
  path = "operation",
): readonly DocumentValidationError[] {
  const errors: DocumentValidationError[] = [];
  const operation = record_at(value, path, errors);
  if (!operation) return errors;
  const kind = ownValue(operation, "op");
  if (typeof kind !== "string") {
    invalid(errors, `${path}.op`, "Document operation kind is invalid");
    return errors;
  }

  const operation_kind = kind as DocumentOp["op"];

  switch (operation_kind) {
    case "set": {
      validate_address(ownValue(operation, "addr"), `${path}.addr`, errors);
      validate_cell_value_shape(ownValue(operation, "value"), `${path}.value`, errors);
      const style = ownValue(operation, "style");
      if (style !== undefined) validate_cell_style(style, `${path}.style`, errors);
      break;
    }

    case "setRange": {
      validate_range_shape(ownValue(operation, "range"), `${path}.range`, errors);
      const cells = array_at(ownValue(operation, "cells"), `${path}.cells`, errors);
      cells?.forEach((cell, index) => {
        validate_cell_shape(cell, `${path}.cells[${index}]`, errors);
      });

      break;
    }

    case "setBlock": {
      validate_range_shape(ownValue(operation, "range"), `${path}.range`, errors);
      const block_path = `${path}.block`;
      const block = record_at(ownValue(operation, "block"), block_path, errors);
      if (!block) break;
      const row_count = require_non_negative_integer(block, "rowCount", block_path, errors, true);
      const col_count = require_non_negative_integer(block, "colCount", block_path, errors, true);
      const values = array_at(ownValue(block, "values"), `${block_path}.values`, errors);
      values?.forEach((entry, index) => {
        if (!scalar(entry)) {
          invalid(errors, `${block_path}.values[${index}]`, "Block values must be scalars");
        }
      });

      const cell_count =
        row_count !== undefined &&
        col_count !== undefined &&
        !product_exceeds(row_count, col_count, Number.MAX_SAFE_INTEGER)
          ? row_count * col_count
          : undefined;
      if (cell_count === undefined && row_count !== undefined && col_count !== undefined) {
        invalid(errors, block_path, "Block dimensions exceed safe integer capacity");
      } else if (values && cell_count !== undefined && values.length !== cell_count) {
        invalid(errors, `${block_path}.values`, "Block values must match its dimensions");
      }

      const source_offsets = new Set<number>();
      const formulas = ownValue(block, "formulas");
      if (formulas !== undefined) {
        const entries = array_at(formulas, `${block_path}.formulas`, errors);
        entries?.forEach((entry, index) => {
          const entry_path = `${block_path}.formulas[${index}]`;
          if (!Array.isArray(entry) || entry.length !== 2) {
            invalid(errors, entry_path, "Block formulas must be [offset, source] tuples");
            return;
          }

          if (
            !non_negative_integer(entry[0]) ||
            (cell_count !== undefined && entry[0] >= cell_count)
          ) {
            invalid(errors, `${entry_path}[0]`, "Formula offset is outside the block");
          }

          if (typeof entry[0] === "number") {
            if (source_offsets.has(entry[0])) {
              invalid(errors, `${entry_path}[0]`, "Block source offsets must be unique");
            }

            source_offsets.add(entry[0]);
          }

          if (typeof entry[1] !== "string") {
            invalid(errors, `${entry_path}[1]`, "Formula source must be a string");
          }
        });
      }

      const refs = ownValue(block, "refs");
      if (refs !== undefined) {
        const entries = array_at(refs, `${block_path}.refs`, errors);
        entries?.forEach((entry, index) => {
          const entry_path = `${block_path}.refs[${index}]`;
          if (!Array.isArray(entry) || entry.length !== 2) {
            invalid(errors, entry_path, "Block refs must be [offset, address] tuples");
            return;
          }

          if (
            !non_negative_integer(entry[0]) ||
            (cell_count !== undefined && entry[0] >= cell_count)
          ) {
            invalid(errors, `${entry_path}[0]`, "Reference offset is outside the block");
          }

          if (typeof entry[0] === "number") {
            if (source_offsets.has(entry[0])) {
              invalid(errors, `${entry_path}[0]`, "Block source offsets must be unique");
            }

            source_offsets.add(entry[0]);
          }

          validate_address(entry[1], `${entry_path}[1]`, errors);
        });
      }

      const style_table_value = ownValue(block, "styleTable");
      const style_table =
        style_table_value === undefined
          ? undefined
          : array_at(style_table_value, `${block_path}.styleTable`, errors);
      style_table?.forEach((style, index) => {
        validate_cell_style(style, `${block_path}.styleTable[${index}]`, errors);
      });

      const style_ids_value = ownValue(block, "styleIds");
      if (style_ids_value !== undefined) {
        const style_ids = array_at(style_ids_value, `${block_path}.styleIds`, errors);
        if (style_ids && cell_count !== undefined && style_ids.length !== cell_count) {
          invalid(errors, `${block_path}.styleIds`, "Block style IDs must match its dimensions");
        }

        style_ids?.forEach((style_id, index) => {
          if (
            !non_negative_integer(style_id) ||
            (style_table !== undefined && style_id >= style_table.length)
          ) {
            invalid(errors, `${block_path}.styleIds[${index}]`, "Block style ID is invalid");
          }
        });
      }

      break;
    }

    case "restoreBlock": {
      validate_range_shape(ownValue(operation, "range"), `${path}.range`, errors);
      const encoding = ownValue(operation, "encoding");
      const decoded_bytes = ownValue(operation, "decodedBytes");
      const data = ownValue(operation, "data");
      if (encoding !== "deflate-json-v1") {
        invalid(errors, `${path}.encoding`, "Restore block encoding is invalid");
      }

      if (typeof decoded_bytes !== "number") {
        invalid(errors, `${path}.decodedBytes`, "Restore block decoded bytes must be a number");
      }

      if (typeof data !== "string") {
        invalid(errors, `${path}.data`, "Restore block data must be a string");
      }

      if (errors.length || !is_restore_block_shape(operation)) break;
      try {
        const prepared = preparedRestore(operation, validateDocumentOperationShape);
        errors.push(
          ...prepared.errors.map((error) => ({
            ...error,
            path: path + error.path.slice("operation".length),
          })),
        );
        if (prepared.errors.length === 0) {
          const range = operation.range;
          if (
            prepared.block.rowCount !== Math.abs(range.end.row - range.start.row) + 1 ||
            prepared.block.colCount !== Math.abs(range.end.col - range.start.col) + 1 ||
            (prepared.block.styleIds !== undefined && prepared.block.styleTable === undefined)
          ) {
            invalid(errors, path, "Invalid restore block");
          }
        }
      } catch (error) {
        invalid(errors, path, error instanceof Error ? error.message : "Invalid restore block");
      }

      break;
    }

    case "setRangeStyle": {
      validate_range_shape(ownValue(operation, "range"), `${path}.range`, errors);
      const style = ownValue(operation, "style");
      if (style !== null) validate_cell_style(style, `${path}.style`, errors);
      break;
    }

    case "clearRange":
      validate_range_shape(ownValue(operation, "range"), `${path}.range`, errors);
      optional_boolean(operation, "contents", path, errors);
      optional_boolean(operation, "style", path, errors);
      break;

    case "permuteRows":
      validate_range_shape(ownValue(operation, "range"), `${path}.range`, errors);
      if (ownValue(operation, "encoding") !== ROW_ORDER_ENCODING) {
        invalid(errors, `${path}.encoding`, "Row order encoding is invalid");
      }

      if (typeof ownValue(operation, "order") !== "string") {
        invalid(errors, `${path}.order`, "Row order must be a string");
      }
      break;

    case "moveCells":
      validate_range_shape(ownValue(operation, "range"), `${path}.range`, errors);
      validate_address(ownValue(operation, "to"), `${path}.to`, errors);
      validate_cell_shift(operation, path, errors);
      break;

    case "addRows":
    case "removeRows":
      validate_operation_sheet_id(operation, path, errors);
      require_non_negative_integer(operation, "at", path, errors);
      require_non_negative_integer(operation, "count", path, errors, true);
      break;

    case "moveRows":
    case "moveColumns":
      validate_operation_sheet_id(operation, path, errors);
      require_non_negative_integer(operation, "from", path, errors);
      require_non_negative_integer(operation, "count", path, errors, true);
      require_non_negative_integer(operation, "to", path, errors);
      break;

    case "addColumns": {
      validate_operation_sheet_id(operation, path, errors);
      require_non_negative_integer(operation, "at", path, errors);
      const columns = array_at(ownValue(operation, "columns"), `${path}.columns`, errors);
      columns?.forEach((column, index) => {
        validate_column_shape(column, `${path}.columns[${index}]`, errors);
      });

      break;
    }

    case "removeColumns":
      validate_operation_sheet_id(operation, path, errors);
      require_non_negative_integer(operation, "at", path, errors);
      require_non_negative_integer(operation, "count", path, errors, true);
      break;

    case "setColumn": {
      validate_operation_sheet_id(operation, path, errors);
      require_non_negative_integer(operation, "col", path, errors);
      const patch_path = `${path}.patch`;
      const patch = record_at(ownValue(operation, "patch"), patch_path, errors);
      if (!patch) break;
      const key = ownValue(patch, "key");
      if (key !== undefined && (typeof key !== "string" || key.length === 0)) {
        invalid(errors, `${patch_path}.key`, "Column key must be a non-empty string");
      }

      optional_string(patch, "header", patch_path, errors);
      const width = ownValue(patch, "width");
      if (width !== undefined && (!finite_number(width) || width < 0)) {
        invalid(errors, `${patch_path}.width`, "Column width must be finite and non-negative");
      }

      const type = ownValue(patch, "type");
      if (type !== undefined && !COLUMN_TYPES.includes(String(type))) {
        invalid(errors, `${patch_path}.type`, "Column type is invalid");
      }

      for (const field of ["numberFormat", "numberLocale", "renderer"]) {
        optional_string(patch, field, patch_path, errors);
      }

      optional_boolean(patch, "visible", patch_path, errors);
      for (const field of ["headerStyle", "cellStyle"]) {
        const style = ownValue(patch, field);
        if (style !== undefined) {
          validate_cell_style(style, `${patch_path}.${field}`, errors);
        }
      }

      break;
    }

    case "setRowMeta": {
      validate_operation_sheet_id(operation, path, errors);
      require_non_negative_integer(operation, "row", path, errors);
      const meta_value = ownValue(operation, "meta");
      if (meta_value === null) break;
      const meta_path = `${path}.meta`;
      const meta = record_at(meta_value, meta_path, errors);
      if (!meta) break;
      const height = ownValue(meta, "height");
      if (height !== undefined && (!finite_number(height) || height <= 0)) {
        invalid(errors, `${meta_path}.height`, "Row height must be finite and positive");
      }

      optional_boolean(meta, "hidden", meta_path, errors);
      break;
    }

    case "addMerge":
    case "removeMerge":
      validate_operation_sheet_id(operation, path, errors);
      validate_merge_shape(ownValue(operation, "merge"), `${path}.merge`, errors);
      break;

    case "addSheet":
      validate_sheet_shape(ownValue(operation, "sheet"), `${path}.sheet`, errors);
      break;

    case "removeSheet":
      validate_operation_sheet_id(operation, path, errors);
      break;

    case "renameSheet":
      validate_operation_sheet_id(operation, path, errors);
      require_string(operation, "name", path, errors, true);
      break;

    case "moveSheet":
      validate_operation_sheet_id(operation, path, errors);
      require_non_negative_integer(operation, "to", path, errors);
      break;

    case "setSheetVisibility": {
      validate_operation_sheet_id(operation, path, errors);
      const visibility = ownValue(operation, "visibility");
      if (visibility !== "visible" && visibility !== "hidden" && visibility !== "veryHidden") {
        invalid(errors, `${path}.visibility`, "Sheet visibility is invalid");
      }

      break;
    }

    case "addTable":
      validate_workbook_table_shape(ownValue(operation, "table"), `${path}.table`, errors);
      break;

    case "updateTable":
      validate_operation_sheet_id(operation, path, errors);
      require_string(operation, "tableId", path, errors, true);
      validate_workbook_table_shape(ownValue(operation, "patch"), `${path}.patch`, errors, true);
      break;

    case "removeTable":
      validate_operation_sheet_id(operation, path, errors);
      require_string(operation, "tableId", path, errors, true);
      break;

    case "setSheetMeta": {
      validate_operation_sheet_id(operation, path, errors);
      const patch_path = `${path}.patch`;
      const patch = record_at(ownValue(operation, "patch"), patch_path, errors);
      if (!patch) break;
      for (const field of ["frozenRows", "frozenCols"]) {
        const count = ownValue(patch, field);
        if (count !== undefined && !non_negative_integer(count)) {
          invalid(errors, `${patch_path}.${field}`, `${field} must be a non-negative integer`);
        }
      }

      const conditional_formats = ownValue(patch, "conditionalFormats");
      if (conditional_formats !== undefined) {
        const entries = array_at(conditional_formats, `${patch_path}.conditionalFormats`, errors);
        entries?.forEach((entry, index) => {
          validate_conditional_format_shape(
            entry,
            `${patch_path}.conditionalFormats[${index}]`,
            errors,
          );
        });
      }

      const row_groups = ownValue(patch, "rowGroups");
      if (row_groups !== undefined) {
        const entries = array_at(row_groups, `${patch_path}.rowGroups`, errors);
        entries?.forEach((entry, index) => {
          validate_operation_row_group(entry, `${patch_path}.rowGroups[${index}]`, errors);
        });
      }

      const sort_keys = ownValue(patch, "sortKeys");
      if (sort_keys !== undefined) {
        const entries = array_at(sort_keys, `${patch_path}.sortKeys`, errors);
        entries?.forEach((entry, index) => {
          validate_operation_sort_key(entry, `${patch_path}.sortKeys[${index}]`, errors);
        });
      }

      const filters = ownValue(patch, "filters");
      if (filters !== undefined) {
        const entries = array_at(filters, `${patch_path}.filters`, errors);
        entries?.forEach((entry, index) => {
          validate_operation_filter_tuple(entry, `${patch_path}.filters[${index}]`, errors);
        });
      }

      const auto_filter = ownValue(patch, "autoFilter");
      if (auto_filter !== undefined && auto_filter !== null) {
        validate_auto_filter_shape(auto_filter, `${patch_path}.autoFilter`, errors);
      }

      // `null` gives the tab its default look back.
      const tab_color = ownValue(patch, "tabColor");
      if (tab_color !== null) validate_tab_color(tab_color, `${patch_path}.tabColor`, errors);

      break;
    }

    case "setHyperlink":
      validate_operation_sheet_id(operation, path, errors);
      validate_hyperlink_shape(ownValue(operation, "hyperlink"), `${path}.hyperlink`, errors);
      break;

    case "removeHyperlink":
      validate_operation_sheet_id(operation, path, errors);
      require_string(operation, "id", path, errors, true);
      break;

    case "setValidationRule":
      validate_operation_sheet_id(operation, path, errors);
      validate_validation_rule_shape(ownValue(operation, "rule"), `${path}.rule`, errors);
      break;

    case "removeValidationRule":
    case "removeProtectedRange":
      validate_operation_sheet_id(operation, path, errors);
      require_string(operation, "id", path, errors, true);
      break;

    case "setProtectedRange":
      validate_operation_sheet_id(operation, path, errors);
      validate_protected_range_shape(
        ownValue(operation, "protectedRange"),
        `${path}.protectedRange`,
        errors,
      );
      break;

    case "setNote": {
      validate_address(ownValue(operation, "addr"), `${path}.addr`, errors);
      const text = ownValue(operation, "text");
      if (text !== null && typeof text !== "string") {
        invalid(errors, `${path}.text`, "Note text must be a string or null");
      }

      break;
    }

    case "setNamedRange":
      validate_named_range_shape(ownValue(operation, "namedRange"), `${path}.namedRange`, errors);
      break;

    case "removeNamedRange":
      require_string(operation, "name", path, errors, true);
      optional_string(operation, "scope", path, errors);
      break;

    case "setCalculation":
      validate_calculation_shape(ownValue(operation, "calculation"), `${path}.calculation`, errors);
      break;

    case "setExternalLinks":
      validateExternalLinksShape(ownValue(operation, "links"), `${path}.links`, errors);
      break;

    case "setMeasure":
      validateMeasureShape(ownValue(operation, "measure"), `${path}.measure`, errors);
      break;

    case "removeMeasure":
      require_string(operation, "id", path, errors, true);
      break;

    case "setRelationship":
      validateRelationshipShape(
        ownValue(operation, "relationship"),
        `${path}.relationship`,
        errors,
      );
      break;

    case "removeRelationship":
      require_string(operation, "id", path, errors, true);
      break;

    case "setQuery":
      validateSavedQueryShape(ownValue(operation, "query"), `${path}.query`, errors);
      break;

    case "removeQuery":
      require_string(operation, "id", path, errors, true);
      break;

    case "setChart":
      validate_operation_sheet_id(operation, path, errors);
      validate_chart_shape(ownValue(operation, "chart"), `${path}.chart`, errors);
      break;

    case "setPivot":
      validate_operation_sheet_id(operation, path, errors);
      validatePivotShape(ownValue(operation, "pivot"), `${path}.pivot`, errors);
      break;

    case "removeChart":
    case "removePivot":
    case "removeDashboardItem":
      validate_operation_sheet_id(operation, path, errors);
      require_string(operation, "id", path, errors, true);
      break;

    case "setDashboardItem":
      validate_operation_sheet_id(operation, path, errors);
      validateDashboardItemShape(ownValue(operation, "item"), `${path}.item`, errors);
      break;

    default: {
      const unsupported: never = operation_kind;
      invalid(errors, `${path}.op`, `Document operation kind ${String(unsupported)} is invalid`);
    }
  }

  return errors;
}

interface IndexedMerge extends MergeRange {
  index: number;
}

interface MergeIntervalNode {
  rect: IndexedMerge;
  left: MergeIntervalNode | null;
  right: MergeIntervalNode | null;
  height: number;
  maxC1: number;
  minIndex: number;
  maxIndex: number;
}

/** Work counters a caller may pass to `overlappingMergeIndices` to observe its cost. */
export interface MergeScanStats {
  /** Interval-tree nodes visited while searching for overlaps. */
  nodeVisits: number;
}

function merge_node_height(node: MergeIntervalNode | null): number {
  return node?.height ?? 0;
}

function update_merge_node(node: MergeIntervalNode): MergeIntervalNode {
  node.height = Math.max(merge_node_height(node.left), merge_node_height(node.right)) + 1;
  node.maxC1 = Math.max(node.rect.c1, node.left?.maxC1 ?? -1, node.right?.maxC1 ?? -1);
  node.minIndex = Math.min(
    node.rect.index,
    node.left?.minIndex ?? Number.POSITIVE_INFINITY,
    node.right?.minIndex ?? Number.POSITIVE_INFINITY,
  );
  node.maxIndex = Math.max(node.rect.index, node.left?.maxIndex ?? -1, node.right?.maxIndex ?? -1);
  return node;
}

function rotate_merge_right(root: MergeIntervalNode): MergeIntervalNode {
  const pivot = root.left!;
  root.left = pivot.right;
  pivot.right = update_merge_node(root);
  return update_merge_node(pivot);
}

function rotate_merge_left(root: MergeIntervalNode): MergeIntervalNode {
  const pivot = root.right!;
  root.right = pivot.left;
  pivot.left = update_merge_node(root);
  return update_merge_node(pivot);
}

function balance_merge_node(node: MergeIntervalNode): MergeIntervalNode {
  update_merge_node(node);
  const balance = merge_node_height(node.left) - merge_node_height(node.right);
  if (balance > 1) {
    if (merge_node_height(node.left!.left) < merge_node_height(node.left!.right)) {
      node.left = rotate_merge_left(node.left!);
    }
    return rotate_merge_right(node);
  }
  if (balance < -1) {
    if (merge_node_height(node.right!.right) < merge_node_height(node.right!.left)) {
      node.right = rotate_merge_right(node.right!);
    }
    return rotate_merge_left(node);
  }
  return node;
}

function compare_indexed_merge(left: IndexedMerge, right: IndexedMerge): number {
  return left.c0 - right.c0 || left.index - right.index;
}

function insert_merge_node(node: MergeIntervalNode | null, rect: IndexedMerge): MergeIntervalNode {
  if (!node) {
    return {
      rect,
      left: null,
      right: null,
      height: 1,
      maxC1: rect.c1,
      minIndex: rect.index,
      maxIndex: rect.index,
    };
  }
  if (compare_indexed_merge(rect, node.rect) < 0) node.left = insert_merge_node(node.left, rect);
  else node.right = insert_merge_node(node.right, rect);
  return balance_merge_node(node);
}

function remove_merge_node(
  node: MergeIntervalNode | null,
  rect: IndexedMerge,
): MergeIntervalNode | null {
  if (!node) return null;
  const order = compare_indexed_merge(rect, node.rect);
  if (order < 0) node.left = remove_merge_node(node.left, rect);
  else if (order > 0) node.right = remove_merge_node(node.right, rect);
  else {
    if (!node.left) return node.right;
    if (!node.right) return node.left;
    let successor = node.right;
    while (successor.left) successor = successor.left;
    node.rect = successor.rect;
    node.right = remove_merge_node(node.right, successor.rect);
  }
  return balance_merge_node(node);
}

function lower_index_overlap(
  node: MergeIntervalNode | null,
  rect: IndexedMerge,
  stats: MergeScanStats | undefined,
): IndexedMerge | null {
  if (!node || node.maxC1 < rect.c0 || node.minIndex >= rect.index) return null;
  if (stats) stats.nodeVisits += 1;
  const left = lower_index_overlap(node.left, rect, stats);
  if (left) return left;
  if (node.rect.index < rect.index && node.rect.c0 <= rect.c1 && node.rect.c1 >= rect.c0) {
    return node.rect;
  }
  if (node.rect.c0 > rect.c1) return null;
  return lower_index_overlap(node.right, rect, stats);
}

function higher_index_overlap(
  node: MergeIntervalNode | null,
  rect: IndexedMerge,
  stats: MergeScanStats | undefined,
): IndexedMerge | null {
  if (!node || node.maxC1 < rect.c0 || node.maxIndex <= rect.index) return null;
  if (stats) stats.nodeVisits += 1;
  const left = higher_index_overlap(node.left, rect, stats);
  if (left) return left;
  if (node.rect.index > rect.index && node.rect.c0 <= rect.c1 && node.rect.c1 >= rect.c0) {
    return node.rect;
  }
  if (node.rect.c0 > rect.c1) return null;
  return higher_index_overlap(node.right, rect, stats);
}

/** Flags every merge that overlaps another merge, in O(n log n) with an interval tree. */
export function overlappingMergeIndices(
  merges: readonly MergeRange[],
  stats?: MergeScanStats,
): boolean[] {
  const indexed: IndexedMerge[] = merges.map((merge, index) => ({ ...merge, index }));
  const starts = indexed
    .slice()
    .sort((left, right) => left.r0 - right.r0 || left.index - right.index);
  const ends = indexed
    .slice()
    .sort((left, right) => left.r1 - right.r1 || left.index - right.index);
  const overlapping = new Array<boolean>(merges.length).fill(false);
  let active: MergeIntervalNode | null = null;
  let unflagged: MergeIntervalNode | null = null;
  let end_index = 0;

  for (const rect of starts) {
    while ((ends[end_index]?.r1 ?? Number.POSITIVE_INFINITY) < rect.r0) {
      const expired = ends[end_index++]!;
      active = remove_merge_node(active, expired);
      unflagged = remove_merge_node(unflagged, expired);
    }

    if (lower_index_overlap(active, rect, stats)) overlapping[rect.index] = true;
    let later = higher_index_overlap(unflagged, rect, stats);
    while (later) {
      overlapping[later.index] = true;
      unflagged = remove_merge_node(unflagged, later);
      later = higher_index_overlap(unflagged, rect, stats);
    }

    active = insert_merge_node(active, rect);
    if (!overlapping[rect.index]) unflagged = insert_merge_node(unflagged, rect);
  }

  return overlapping;
}

function range_in_sheet(range: Range, sheet: SheetSnapshot): boolean {
  return (
    range.sheet === sheet.id &&
    Math.max(range.start.row, range.end.row) < sheet.rowCount &&
    Math.max(range.start.col, range.end.col) < sheet.columns.length
  );
}

/**
 * Hard ceilings for retained OOXML graphs in a snapshot. The XLSX backend's
 * configurable `maxPreservedBytes` (64 MiB by default) applies first; these
 * stop a hostile persisted snapshot before any part is decoded.
 */
const MAX_XLSX_SOURCE_COMPRESSED_BYTES = 256 * 1024 * 1024;
const MAX_XLSX_SOURCE_ENTRIES = 10_000;
const MAX_XLSX_PART_NAME_LENGTH = 1024;
/** A section holds few members; these caps keep a hostile list small. */
const MAX_UNSUPPORTED_QUERIES = 256;
const MAX_QUERY_MEMBER_LENGTH = 1024;
const MAX_QUERY_REASON_LENGTH = 64;
const MAX_XLSX_CONTENT_TYPE_LENGTH = 256;
const TAB_COLOR = /^#[\dA-Fa-f]{6}$/u;
const BASE64_PATTERN = /^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/;

/** A sheet's tab color, when present, is `#RRGGBB`. */
function validate_tab_color(value: unknown, path: string, errors: DocumentValidationError[]): void {
  if (value !== undefined && !(typeof value === "string" && TAB_COLOR.test(value))) {
    invalid(errors, path, "tabColor must be a #RRGGBB color");
  }
}

const CONTENT_TYPE_PATTERN = /^[a-z\d!#$&^_.+-]+\/[a-z\d!#$&^_.+-]+$/i;
const RELATIONSHIP_TYPE_PATTERN = /^https?:\/\/[^\s<>"'&]+$/;

const FIRST_PRINTABLE_CHARACTER = 0x20;

/** Package-relative OPC part names only; anything a writer could misinterpret is refused. */
function safe_xlsx_part_name(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_XLSX_PART_NAME_LENGTH) {
    return false;
  }

  // A char-code scan rejects control characters without a control-character regex.
  for (let index = 0; index < value.length; index++) {
    if (value.charCodeAt(index) < FIRST_PRINTABLE_CHARACTER) return false;
  }
  return (
    !/[\\?#%<>&"']/.test(value) &&
    !value.startsWith("/") &&
    !/^[a-z][a-z\d+.-]*:/i.test(value) &&
    value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

function validate_xlsx_source(value: unknown, errors: DocumentValidationError[]): void {
  if (value === undefined) return;
  const path = "workbook.xlsxSource";
  const source = record_at(value, path, errors);
  if (!source) return;
  const parts = array_at(ownValue(source, "parts"), `${path}.parts`, errors);
  const graphs = array_at(ownValue(source, "graphs"), `${path}.graphs`, errors);
  const dropped = optional_array(source, "dropped", path, errors);
  if (
    dropped &&
    (dropped.length > MAX_XLSX_SOURCE_ENTRIES ||
      !dropped.every((part) => safe_xlsx_part_name(part)))
  ) {
    invalid(errors, `${path}.dropped`, "dropped must list safe part names");
  }

  if (!parts || !graphs) return;
  if (parts.length > MAX_XLSX_SOURCE_ENTRIES || graphs.length > MAX_XLSX_SOURCE_ENTRIES) {
    invalid(errors, path, `xlsxSource exceeds ${MAX_XLSX_SOURCE_ENTRIES} parts or graphs`);
    return;
  }

  const names = new Set<string>();
  let compressed_bytes = 0;
  for (let index = 0; index < parts.length; index++) {
    const part_path = `${path}.parts[${index}]`;
    const part = record_at(parts[index], part_path, errors);
    if (!part) continue;
    const name = ownValue(part, "name");
    const content_type = ownValue(part, "contentType");
    const method = ownValue(part, "method");
    const crc32 = ownValue(part, "crc32");
    const size = ownValue(part, "uncompressedSize");
    const data = ownValue(part, "data");
    // OPC part names compare case-insensitively.
    if (!safe_xlsx_part_name(name) || names.has(name.toLowerCase())) {
      invalid(errors, `${part_path}.name`, "Part name must be a unique safe OPC name");
    } else names.add(name.toLowerCase());

    if (
      typeof content_type !== "string" ||
      content_type.length > MAX_XLSX_CONTENT_TYPE_LENGTH ||
      !CONTENT_TYPE_PATTERN.test(content_type)
    ) {
      invalid(errors, `${part_path}.contentType`, "contentType must be a MIME type");
    }

    if (method !== 0 && method !== 8)
      invalid(errors, `${part_path}.method`, "method must be 0 or 8");
    if (!non_negative_integer(crc32) || crc32 > 0xffffffff) {
      invalid(errors, `${part_path}.crc32`, "crc32 must be an unsigned 32-bit integer");
    }

    if (!non_negative_integer(size) || size > 0xffffffff) {
      invalid(errors, `${part_path}.uncompressedSize`, "uncompressedSize must fit ZIP32");
    }

    if (typeof data !== "string" || data.length % 4 !== 0) {
      invalid(errors, `${part_path}.data`, "data must be base64");
      continue;
    }

    compressed_bytes += (data.length / 4) * 3;
    if (compressed_bytes > MAX_XLSX_SOURCE_COMPRESSED_BYTES) {
      invalid(errors, path, "xlsxSource exceeds 256 MiB of compressed data");
      return;
    }

    if (!BASE64_PATTERN.test(data)) invalid(errors, `${part_path}.data`, "data must be base64");
  }

  for (let index = 0; index < graphs.length; index++) {
    const graph_path = `${path}.graphs[${index}]`;
    const graph = record_at(graphs[index], graph_path, errors);
    if (!graph) continue;
    const owner = ownValue(graph, "owner");
    const type = ownValue(graph, "type");
    const target = ownValue(graph, "target");
    const cache_id = ownValue(graph, "cacheId");
    if (owner !== "root" && owner !== "workbook" && owner !== "sheet") {
      invalid(errors, `${graph_path}.owner`, "owner must be root, workbook, or sheet");
    }

    if (owner === "sheet") require_string(graph, "sheetId", graph_path, errors, true);
    else if (ownValue(graph, "sheetId") !== undefined) {
      invalid(errors, `${graph_path}.sheetId`, "Only sheet-owned graphs name a sheet");
    }

    if (
      typeof type !== "string" ||
      type.length > MAX_XLSX_PART_NAME_LENGTH ||
      !RELATIONSHIP_TYPE_PATTERN.test(type)
    ) {
      invalid(errors, `${graph_path}.type`, "type must be a relationship type URI");
    }

    if (cache_id !== undefined && (typeof cache_id !== "string" || !/^\d{1,10}$/.test(cache_id))) {
      invalid(errors, `${graph_path}.cacheId`, "cacheId must be an unsigned integer string");
    }

    for (const key of ["queries", "externalLink"]) {
      const digest = ownValue(graph, key);
      if (digest !== undefined && (typeof digest !== "string" || !/^[0-9a-f]{16}$/.test(digest))) {
        invalid(errors, `${graph_path}.${key}`, `${key} must be a 64-bit hex digest`);
      }
    }

    const unsupported_path = `${graph_path}.unsupportedQueries`;
    const unsupported = ownValue(graph, "unsupportedQueries");
    const kept = unsupported === undefined ? [] : array_at(unsupported, unsupported_path, errors);
    if (kept && kept.length > MAX_UNSUPPORTED_QUERIES) {
      invalid(errors, unsupported_path, "unsupportedQueries holds too many members");
    }
    kept?.forEach((entry: unknown, entry_index) => {
      const entry_path = `${unsupported_path}[${entry_index}]`;
      const record = record_at(entry, entry_path, errors);
      if (!record) return;
      const member = require_string(record, "member", entry_path, errors, true);
      if (member && member.length > MAX_QUERY_MEMBER_LENGTH)
        invalid(errors, `${entry_path}.member`, "member is too long");
      const reason = require_string(record, "reason", entry_path, errors, true);
      if (reason && reason.length > MAX_QUERY_REASON_LENGTH)
        invalid(errors, `${entry_path}.reason`, "reason is too long");
    });

    const members = array_at(ownValue(graph, "parts"), `${graph_path}.parts`, errors);
    if (
      !members ||
      members.length > MAX_XLSX_SOURCE_ENTRIES ||
      !members.every((name) => safe_xlsx_part_name(name) && names.has(name.toLowerCase())) ||
      !safe_xlsx_part_name(target) ||
      !members.some((name) => name === target)
    ) {
      invalid(errors, `${graph_path}.parts`, "Graph parts must be retained and include target");
    }

    const dependencies = array_at(
      ownValue(graph, "dependencies"),
      `${graph_path}.dependencies`,
      errors,
    );
    if (!dependencies) continue;
    if (dependencies.length > MAX_XLSX_SOURCE_ENTRIES) {
      invalid(errors, `${graph_path}.dependencies`, "Too many graph dependencies");
      continue;
    }

    for (let dependency_index = 0; dependency_index < dependencies.length; dependency_index++) {
      const dependency_path = `${graph_path}.dependencies[${dependency_index}]`;
      const dependency = record_at(dependencies[dependency_index], dependency_path, errors);
      if (!dependency) continue;
      require_string(dependency, "sheetId", dependency_path, errors, true);
      require_string(dependency, "name", dependency_path, errors, true);
      const scope = ownValue(dependency, "scope");
      if (scope !== "layout" && scope !== "values") {
        invalid(errors, `${dependency_path}.scope`, "scope must be layout or values");
      }

      const digest = ownValue(dependency, "digest");
      if (typeof digest !== "string" || !/^[\da-f]{16}$/.test(digest)) {
        invalid(errors, `${dependency_path}.digest`, "digest must be 16 lowercase hex digits");
      }
    }
  }
}

function cell_block_in_sheet(block: SheetSnapshot["cells"][number], sheet: SheetSnapshot): boolean {
  return (
    block.startRow <= sheet.rowCount &&
    block.rowCount <= sheet.rowCount - block.startRow &&
    block.startCol <= sheet.columns.length &&
    block.colCount <= sheet.columns.length - block.startCol
  );
}

/**
 * Whether two in-bounds cells share an address. A sorted 8-byte key per cell
 * replaces a Set entry per cell, which cost about 100 bytes each and made
 * validating a large snapshot allocate as much as the snapshot itself.
 * In-bounds cells have col < columns.length, so row * width + col is unique
 * and, under the logical-cell limit, exact as a double.
 */
function has_duplicate_cell_address(sheet: SheetSnapshot): boolean {
  const width = sheet.columns.length;
  let cell_count = 0;
  for (const block of sheet.cells) cell_count += block.cells.length;
  const keys = new Float64Array(cell_count);
  let key_count = 0;
  for (const block of sheet.cells) {
    if (!cell_block_in_sheet(block, sheet)) continue;
    for (const cell of block.cells) {
      if (cell.rowOffset >= block.rowCount || cell.colOffset >= block.colCount) continue;
      keys[key_count++] =
        (block.startRow + cell.rowOffset) * width + block.startCol + cell.colOffset;
    }
  }
  const sorted = keys.subarray(0, key_count).sort();
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index] === sorted[index - 1]) return true;
  }
  return false;
}

/**
 * Pivot references may point at any sheet or table, including ones listed
 * later, so they are checked after every sheet and table is known.
 */
function validate_snapshot_pivots(
  sheets: readonly SheetSnapshot[],
  tables: readonly WorkbookTable[],
  errors: DocumentValidationError[],
): void {
  const sheet_sizes = new Map(
    sheets.map((sheet) => [sheet.id, { rows: sheet.rowCount, cols: sheet.columns.length }]),
  );
  const table_widths = new Map(tables.map((table) => [table.id, table.columns.length]));
  const scope = {
    sheetSize: (id: string) => sheet_sizes.get(id),
    tableWidth: (id: string) => table_widths.get(id),
  };
  const ids = new Set<string>();

  for (let sheet_index = 0; sheet_index < sheets.length; sheet_index++) {
    const sheet = sheets[sheet_index];
    if (!sheet?.pivots) continue;
    const owner_size = { rows: sheet.rowCount, cols: sheet.columns.length };
    for (let index = 0; index < sheet.pivots.length; index++) {
      const pivot = sheet.pivots[index];
      if (!pivot) continue;
      const path = `sheets[${sheet_index}].pivots[${index}]`;
      if (ids.has(pivot.id)) {
        errors.push({
          path: `${path}.id`,
          code: "duplicate-id",
          message: "Pivot IDs must be unique in the workbook",
        });
      }
      ids.add(pivot.id);
      if (ids.size > MAX_PIVOTS_PER_WORKBOOK) {
        errors.push({
          path,
          code: "resource-limit",
          message: `Workbook pivot limit ${MAX_PIVOTS_PER_WORKBOOK} exceeded`,
        });
        return;
      }
      validatePivotReferences(pivot, owner_size, scope, path, errors);
    }
  }
}

function validate_json_safe_snapshot(input: unknown): DocumentValidationResult {
  const errors: DocumentValidationError[] = [];
  const candidate = record_at(input, "$", errors);
  if (!candidate) return { ok: false, errors };

  const schema_version = ownValue(candidate, "schemaVersion");
  if (schema_version !== WORKBOOK_SCHEMA_VERSION) {
    invalid(
      errors,
      "schemaVersion",
      `Unsupported workbook schema version: ${String(schema_version)}`,
      "unsupported-schema",
    );
  }

  const document_id = ownValue(candidate, "documentId");
  if (document_id !== undefined && typeof document_id !== "string") {
    invalid(errors, "documentId", "documentId must be a string");
  }

  const version = ownValue(candidate, "version");
  if (version !== undefined && !non_negative_integer(version)) {
    invalid(errors, "version", "version must be a non-negative integer");
  }

  const workbook = record_at(ownValue(candidate, "workbook"), "workbook", errors);
  if (workbook) {
    require_string(workbook, "activeSheet", "workbook", errors, true);
    validate_xlsx_source(ownValue(workbook, "xlsxSource"), errors);
    const named_ranges = optional_array(workbook, "namedRanges", "workbook", errors);
    named_ranges?.forEach((entry, index) => {
      validate_named_range_shape(entry, `workbook.namedRanges[${index}]`, errors);
    });

    const calculation = ownValue(workbook, "calculation");
    if (calculation !== undefined) {
      validate_calculation_shape(calculation, "workbook.calculation", errors);
    }

    const data_model = ownValue(workbook, "dataModel");
    if (data_model !== undefined) {
      validateDataModelShape(data_model, "workbook.dataModel", errors);
    }

    const queries = ownValue(workbook, "queries");
    if (queries !== undefined) {
      validateSavedQueriesShape(queries, "workbook.queries", errors);
    }

    const external_links = ownValue(workbook, "externalLinks");
    if (external_links !== undefined) {
      validateExternalLinksShape(external_links, "workbook.externalLinks", errors);
    }
  }

  const sheets = array_at(ownValue(candidate, "sheets"), "sheets", errors);
  if (sheets && sheets.length === 0) {
    invalid(errors, "sheets", "At least one sheet is required");
  }

  sheets?.forEach((sheet, index) => {
    // `validateWorkbookSnapshot` runs the JSON-safety walk over `input` first.
    validate_sheet_shape(sheet, `sheets[${index}]`, errors, true);
  });

  if (errors.length > 0) return { ok: false, errors };

  // Shape validation above proves the complete schema before this trust-boundary cast.
  const validated = input as WorkbookSnapshot;
  const ids = new Set<string>();
  const orders = new Set<number>();
  const normalized_sheets: SheetSnapshot[] = [];
  const accepted_tables: WorkbookTable[] = [];

  for (let sheet_index = 0; sheet_index < validated.sheets.length; sheet_index++) {
    const sheet = validated.sheets[sheet_index]!;
    const path = `sheets[${sheet_index}]`;
    if (ids.has(sheet.id)) {
      invalid(errors, `${path}.id`, "Sheet IDs must be unique", "duplicate-id");
    }

    ids.add(sheet.id);
    if (orders.has(sheet.order)) {
      invalid(errors, `${path}.order`, "Sheet order must be unique", "duplicate-id");
    }

    orders.add(sheet.order);

    const column_keys = new Set<string>();
    for (let column_index = 0; column_index < sheet.columns.length; column_index++) {
      const column = sheet.columns[column_index]!;
      if (column_keys.has(column.key)) {
        invalid(
          errors,
          `${path}.columns[${column_index}].key`,
          "Column keys must be unique and stable",
          "duplicate-id",
        );
      }

      column_keys.add(column.key);
    }

    const merges: MergeRange[] = [];
    for (const [merge_index, source_merge] of (sheet.merges ?? []).entries()) {
      const merge = normalizeMerge(source_merge);
      const merge_path = `${path}.merges[${merge_index}]`;
      if (merge.r1 >= sheet.rowCount || merge.c1 >= sheet.columns.length) {
        invalid(errors, merge_path, "Merge lies outside the sheet", "out-of-bounds");
      }

      merges.push(merge);
    }

    const overlapping_merges = overlappingMergeIndices(merges);
    for (let merge_index = 0; merge_index < overlapping_merges.length; merge_index++) {
      if (!overlapping_merges[merge_index]) continue;
      invalid(
        errors,
        `${path}.merges[${merge_index}]`,
        "Merged regions may not overlap",
        "overlapping-merge",
      );
    }

    // Only a sheet with a duplicate address pays for the Set that names each
    // duplicate in cell order.
    const occupied = has_duplicate_cell_address(sheet) ? new Set<number>() : undefined;
    const sheet_width = sheet.columns.length;
    for (let block_index = 0; block_index < sheet.cells.length; block_index++) {
      const block = sheet.cells[block_index]!;
      const block_path = `${path}.cells[${block_index}]`;
      const block_in_bounds = cell_block_in_sheet(block, sheet);
      if (!block_in_bounds) {
        invalid(errors, block_path, "Cell block lies outside the sheet", "out-of-bounds");
      }

      for (let cell_index = 0; cell_index < block.cells.length; cell_index++) {
        const cell = block.cells[cell_index]!;
        if (cell.rowOffset >= block.rowCount || cell.colOffset >= block.colCount) {
          invalid(
            errors,
            `${block_path}.cells[${cell_index}]`,
            "Cell offset lies outside its block",
            "out-of-bounds",
          );
          continue;
        }

        if (!block_in_bounds || !occupied) continue;
        const key =
          (block.startRow + cell.rowOffset) * sheet_width + block.startCol + cell.colOffset;
        if (occupied.has(key)) {
          invalid(
            errors,
            `${block_path}.cells[${cell_index}]`,
            "A snapshot cell may appear only once",
            "duplicate-id",
          );
        }

        occupied.add(key);
      }
    }

    const metadata_rows = new Set<number>();
    for (const [index, meta] of (sheet.rowMeta ?? []).entries()) {
      const row = meta[0];
      if (row >= sheet.rowCount) {
        invalid(
          errors,
          `${path}.rowMeta[${index}][0]`,
          "Row metadata lies outside the sheet",
          "out-of-bounds",
        );
      } else if (metadata_rows.has(row)) {
        invalid(
          errors,
          `${path}.rowMeta[${index}][0]`,
          "Row metadata indices must be unique",
          "duplicate-id",
        );
      }

      metadata_rows.add(row);
    }

    for (const [field, value, limit] of [
      ["frozenRows", sheet.frozenRows, sheet.rowCount],
      ["frozenCols", sheet.frozenCols, sheet.columns.length],
    ] as const) {
      if (value !== undefined && value > limit) {
        invalid(errors, `${path}.${field}`, `${field} lies outside the sheet`, "out-of-bounds");
      }
    }

    for (const [index, group] of (sheet.rowGroups ?? []).entries()) {
      if (group.start > group.end || group.end >= sheet.rowCount) {
        invalid(
          errors,
          `${path}.rowGroups[${index}]`,
          "Row group lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    for (const [index, rule] of (sheet.conditionalFormats ?? []).entries()) {
      if (!range_in_sheet(rule.range, sheet)) {
        invalid(
          errors,
          `${path}.conditionalFormats[${index}].range`,
          "Conditional format range lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    const hyperlink_ids = new Set<string>();
    for (const [index, hyperlink] of (sheet.hyperlinks ?? []).entries()) {
      const hyperlink_path = `${path}.hyperlinks[${index}]`;
      if (hyperlink_ids.has(hyperlink.id)) {
        invalid(
          errors,
          `${hyperlink_path}.id`,
          "Hyperlink IDs must be unique within a sheet",
          "duplicate-id",
        );
      }

      hyperlink_ids.add(hyperlink.id);
      if (hyperlink.range.sheet !== sheet.id || !range_in_sheet(hyperlink.range, sheet)) {
        invalid(
          errors,
          `${hyperlink_path}.range`,
          "Hyperlink source range lies outside its sheet",
          "out-of-bounds",
        );
      }
    }

    const validation_ids = new Set<string>();
    for (const [index, rule] of (sheet.validationRules ?? []).entries()) {
      if (validation_ids.has(rule.id)) {
        invalid(
          errors,
          `${path}.validationRules[${index}].id`,
          "Validation rule IDs must be unique",
          "duplicate-id",
        );
      }

      validation_ids.add(rule.id);
      if (!range_in_sheet(rule.range, sheet)) {
        invalid(
          errors,
          `${path}.validationRules[${index}].range`,
          "Validation rule range lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    const protection_ids = new Set<string>();
    for (const [index, protected_range] of (sheet.protectedRanges ?? []).entries()) {
      if (protection_ids.has(protected_range.id)) {
        invalid(
          errors,
          `${path}.protectedRanges[${index}].id`,
          "Protected range IDs must be unique",
          "duplicate-id",
        );
      }

      protection_ids.add(protected_range.id);
      if (!range_in_sheet(protected_range.range, sheet)) {
        invalid(
          errors,
          `${path}.protectedRanges[${index}].range`,
          "Protected range lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    const note_addresses = new Set<string>();
    for (const [index, note] of (sheet.notes ?? []).entries()) {
      const key = `${note.addr.row}:${note.addr.col}`;
      if (
        note.addr.sheet !== sheet.id ||
        note.addr.row >= sheet.rowCount ||
        note.addr.col >= sheet.columns.length
      ) {
        invalid(
          errors,
          `${path}.notes[${index}].addr`,
          "Note address lies outside the sheet",
          "out-of-bounds",
        );
      } else if (note_addresses.has(key)) {
        invalid(
          errors,
          `${path}.notes[${index}].addr`,
          "Note addresses must be unique",
          "duplicate-id",
        );
      }

      note_addresses.add(key);
    }

    const sort_columns = new Set<number>();
    for (const [index, key] of (sheet.sortKeys ?? []).entries()) {
      if (key.col >= sheet.columns.length) {
        invalid(
          errors,
          `${path}.sortKeys[${index}].col`,
          "Sort column lies outside the sheet",
          "out-of-bounds",
        );
      } else if (sort_columns.has(key.col)) {
        invalid(
          errors,
          `${path}.sortKeys[${index}].col`,
          "Sort columns must be unique",
          "duplicate-id",
        );
      }

      sort_columns.add(key.col);
    }

    const filter_columns = new Set<number>();
    for (const [index, filter] of (sheet.filters ?? []).entries()) {
      const column = filter[0];
      if (column >= sheet.columns.length) {
        invalid(
          errors,
          `${path}.filters[${index}][0]`,
          "Filter column lies outside the sheet",
          "out-of-bounds",
        );
      } else if (filter_columns.has(column)) {
        invalid(
          errors,
          `${path}.filters[${index}][0]`,
          "Filter columns must be unique",
          "duplicate-id",
        );
      }

      filter_columns.add(column);
    }

    const auto_filter_range = sheet.autoFilter?.range;
    if (
      auto_filter_range &&
      (auto_filter_range.sheet !== sheet.id ||
        auto_filter_range.start.row > auto_filter_range.end.row ||
        auto_filter_range.start.col > auto_filter_range.end.col ||
        !range_in_sheet(auto_filter_range, sheet))
    ) {
      invalid(
        errors,
        `${path}.autoFilter.range`,
        "AutoFilter range must start at its top-left cell and lie inside its sheet",
        "out-of-bounds",
      );
    }

    for (const [index, table] of (sheet.tables ?? []).entries()) {
      if (!validWorkbookTable(table, sheet, accepted_tables)) {
        invalid(
          errors,
          `${path}.tables[${index}]`,
          "Workbook table must have unique stable IDs/names, canonical in-bounds non-overlapping range, and one unique column identity per range column",
        );
      } else {
        accepted_tables.push(table);
      }
    }

    const normalized_sheet: SheetSnapshot = {
      ...sheet,
      merges: merges.length > 0 ? merges : undefined,
      conditionalFormats: sheet.conditionalFormats
        ? sheet.conditionalFormats.map((rule) => structuredClone(rule))
        : undefined,
      hyperlinks: sheet.hyperlinks
        ? [...sheet.hyperlinks]
            .sort((left, right) => compareCodeUnits(left.id, right.id))
            .map(cloneCellHyperlink)
        : undefined,
      validationRules: sheet.validationRules
        ? [...sheet.validationRules].sort((a, b) => compareCodeUnits(a.id, b.id))
        : undefined,
      protectedRanges: sheet.protectedRanges
        ? [...sheet.protectedRanges].sort((a, b) => compareCodeUnits(a.id, b.id))
        : undefined,
      notes: sheet.notes
        ? [...sheet.notes].sort((a, b) => a.addr.row - b.addr.row || a.addr.col - b.addr.col)
        : undefined,
      filters: sheet.filters ? [...sheet.filters].sort((a, b) => a[0] - b[0]) : undefined,
      autoFilter: sheet.autoFilter ? structuredClone(sheet.autoFilter) : undefined,
      rowMeta: sheet.rowMeta ? [...sheet.rowMeta].sort((a, b) => a[0] - b[0]) : undefined,
      tables: sheet.tables
        ? [...sheet.tables]
            .sort((a, b) => compareCodeUnits(a.id, b.id))
            .map((table) => structuredClone(table))
        : undefined,
      charts: sheet.charts?.map((chart) => structuredClone(chart)),
      dashboard: sheet.dashboard ? cloneDashboard(sheet.dashboard) : undefined,
      pivots: sheet.pivots
        ? [...sheet.pivots].sort((a, b) => compareCodeUnits(a.id, b.id)).map(clonePivot)
        : undefined,
      cells: sheet.cells.map((block) => ({
        ...block,
        cells: [...block.cells].sort(
          (a, b) => a.rowOffset - b.rowOffset || a.colOffset - b.colOffset,
        ),
      })),
    };

    if (normalized_sheet.merges === undefined) delete normalized_sheet.merges;
    if (normalized_sheet.conditionalFormats === undefined)
      delete normalized_sheet.conditionalFormats;
    if (normalized_sheet.hyperlinks === undefined) delete normalized_sheet.hyperlinks;
    if (normalized_sheet.validationRules === undefined) delete normalized_sheet.validationRules;
    if (normalized_sheet.protectedRanges === undefined) delete normalized_sheet.protectedRanges;
    if (normalized_sheet.notes === undefined) delete normalized_sheet.notes;
    if (normalized_sheet.filters === undefined) delete normalized_sheet.filters;
    if (normalized_sheet.autoFilter === undefined) delete normalized_sheet.autoFilter;
    if (normalized_sheet.rowMeta === undefined) delete normalized_sheet.rowMeta;
    if (normalized_sheet.tables === undefined) delete normalized_sheet.tables;
    if (normalized_sheet.charts === undefined) delete normalized_sheet.charts;
    if (normalized_sheet.pivots === undefined) delete normalized_sheet.pivots;
    if (normalized_sheet.dashboard === undefined) delete normalized_sheet.dashboard;
    normalized_sheets.push(normalized_sheet);
  }

  if (!ids.has(validated.workbook.activeSheet)) {
    invalid(errors, "workbook.activeSheet", "Active sheet must exist", "missing-reference");
  }

  const sheet_by_id = new Map(validated.sheets.map((sheet) => [sheet.id, sheet]));
  for (let sheet_index = 0; sheet_index < validated.sheets.length; sheet_index++) {
    const sheet = validated.sheets[sheet_index]!;
    for (let block_index = 0; block_index < sheet.cells.length; block_index++) {
      const block = sheet.cells[block_index]!;
      for (let cell_index = 0; cell_index < block.cells.length; cell_index++) {
        const cell = block.cells[cell_index]!;
        if (cell.value.kind !== "ref") continue;
        const target_sheet = sheet_by_id.get(cell.value.target.sheet);
        const target_path = `sheets[${sheet_index}].cells[${block_index}].cells[${cell_index}].value.target`;
        if (!target_sheet) {
          invalid(errors, target_path, "Cell reference sheet must exist", "missing-reference");
        } else if (
          cell.value.target.row >= target_sheet.rowCount ||
          cell.value.target.col >= target_sheet.columns.length
        ) {
          invalid(
            errors,
            target_path,
            "Cell reference target lies outside the sheet",
            "out-of-bounds",
          );
        }
      }
    }

    for (const [link_index, hyperlink] of (sheet.hyperlinks ?? []).entries()) {
      if (hyperlink.target.kind !== "internal") continue;
      const target = hyperlink.target.range;
      const target_sheet = sheet_by_id.get(target.sheet);
      const target_path = `sheets[${sheet_index}].hyperlinks[${link_index}].target.range`;
      if (!target_sheet) {
        invalid(
          errors,
          target_path,
          "Internal hyperlink target sheet must exist",
          "missing-reference",
        );
      } else if (!range_in_sheet(target, target_sheet)) {
        invalid(
          errors,
          target_path,
          "Internal hyperlink target lies outside the sheet",
          "out-of-bounds",
        );
      }
    }

    // Chart sources may read other sheets, so bounds are checked once every sheet is known.
    if (sheet.charts && !validSheetCharts(sheet.charts, sheet, validated.sheets)) {
      invalid(
        errors,
        `sheets[${sheet_index}].charts`,
        "Charts must have unique IDs, an in-sheet anchor, and sources inside existing sheets",
        "out-of-bounds",
      );
    }
  }

  const named_range_ids = new Set<string>();
  for (const [index, named_range] of (validated.workbook.namedRanges ?? []).entries()) {
    const named_path = `workbook.namedRanges[${index}]`;
    const id = `${named_range.scope ?? ""}\u0000${formulaNameKey(named_range.name)}`;
    if (
      accepted_tables.some(
        (table) => formulaNameKey(table.name) === formulaNameKey(named_range.name),
      )
    ) {
      invalid(
        errors,
        `${named_path}.name`,
        "Named range name conflicts with a workbook table name",
        "duplicate-id",
      );
    }

    if (named_range_ids.has(id)) {
      invalid(
        errors,
        `${named_path}.name`,
        "Named range names must be unique within their scope",
        "duplicate-id",
      );
    }

    named_range_ids.add(id);
    if (named_range.scope !== undefined && !sheet_by_id.has(named_range.scope)) {
      invalid(
        errors,
        `${named_path}.scope`,
        "Named range scope sheet must exist",
        "missing-reference",
      );
    }

    // The engine checks a formula name's references when the store loads it.
    if (named_range.range === undefined) continue;
    const target_sheet = sheet_by_id.get(named_range.range.sheet);
    if (!target_sheet) {
      invalid(errors, `${named_path}.range`, "Named range sheet must exist", "missing-reference");
    } else if (!range_in_sheet(named_range.range, target_sheet)) {
      invalid(errors, `${named_path}.range`, "Named range lies outside the sheet", "out-of-bounds");
    }
  }

  validate_snapshot_pivots(validated.sheets, accepted_tables, errors);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...validated,
      schemaVersion: WORKBOOK_SCHEMA_VERSION,
      sheets: normalized_sheets.sort((a, b) => a.order - b.order),
    },
  };
}

/**
 * A snapshot that `validateWorkbookSnapshot` accepted, with its JSON size as
 * measured before that check. Only Sheetwrite builds one, around a snapshot
 * nothing else holds, so a store built from it repeats only the checks that
 * depend on its own options instead of walking every cell again.
 */
export class CheckedSnapshot {
  constructor(
    readonly snapshot: WorkbookSnapshot,
    readonly serializedBytes: number,
  ) {}
}

/**
 * The checks of `validateWorkbookSnapshot` that depend on `options`, for a
 * snapshot it accepted with other options: the resource preflight and the
 * byte limit. Validation keeps known fields only, so the snapshot is no larger
 * than the measured input; an input over the limit gets the full validation.
 */
export function recheckSnapshotResources(
  checked: CheckedSnapshot,
  options: SnapshotValidationOptions = {},
): DocumentValidationResult {
  const resolved = resolve_snapshot_validation_options(options);
  if ("code" in resolved) return { ok: false, errors: [resolved] };
  if (checked.serializedBytes > resolved.limits.maxSerializedBytes) {
    return validateWorkbookSnapshot(checked.snapshot, options);
  }

  const resource_issue = preflight_snapshot_resources(checked.snapshot, resolved);
  return resource_issue
    ? { ok: false, errors: [resource_issue] }
    : { ok: true, value: checked.snapshot };
}

/**
 * Validate and canonically order a schema-1 snapshot without hydrating runtime state.
 *
 * @param input - A snapshot from outside your code, such as parsed JSON.
 * @param options - The storage model to check capacity against, and resource
 *   limits that replace the defaults.
 */
export function validateWorkbookSnapshot(
  input: unknown,
  options: SnapshotValidationOptions = {},
): DocumentValidationResult {
  return validate_snapshot(input, options, false);
}

/**
 * `validateWorkbookSnapshot` for a snapshot the caller built in this call
 * from plain data that no other code has reached, such as the snapshot an
 * XLSX reader assembles. The checks and the result are the same, except
 * that fields are read directly: the caller vouches that no property is a
 * getter and that no array has holes, named fields or symbol keys. Never
 * use it on a snapshot that came from outside your code.
 *
 * @internal For Sheetwrite's own codecs, through `@sheetwrite/core/codec`;
 *   no compatibility promise.
 * @param input - A snapshot your code built in this call.
 * @param options - The same options as `validateWorkbookSnapshot`.
 */
export function validateBuiltWorkbookSnapshot(
  input: unknown,
  options: SnapshotValidationOptions = {},
): DocumentValidationResult {
  return validate_snapshot(input, options, true);
}

function validate_snapshot(
  input: unknown,
  options: SnapshotValidationOptions,
  built_by_caller: boolean,
): DocumentValidationResult {
  try {
    const resolved = resolve_snapshot_validation_options(options);
    if ("code" in resolved) return { ok: false, errors: [resolved] };
    const resource_issue = preflight_snapshot_resources(input, resolved);
    if (resource_issue) return { ok: false, errors: [resource_issue] };
    const issue = find_json_safety_issue(
      input,
      resolved.limits.maxSerializedBytes,
      built_by_caller,
    );
    if (issue) return { ok: false, errors: [issue] };

    return validate_json_safe_snapshot(input);
  } catch (error) {
    const resource_failure = error instanceof RangeError;
    return {
      ok: false,
      errors: [
        {
          path: "$",
          code: resource_failure ? "resource-limit" : "invalid-value",
          message: resource_failure
            ? "Snapshot inspection exceeded a safe resource limit"
            : "Snapshot could not be inspected safely",
        },
      ],
    };
  }
}

/**
 * Exhaustive stable target identity used by persistence/logging layers.
 *
 * @returns The stable ID of the sheet the operation changes; for workbook-level
 *   operations, a key such as a defined name, `query:<id>` or `calculation`. A
 *   `moveCells` operation gives the sheet its cells leave.
 */
export function documentOpTarget(operation: DocumentOp): string {
  switch (operation.op) {
    case "set":
      return operation.addr.sheet;

    case "setNote":
      return operation.addr.sheet;

    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "setRangeStyle":
    case "clearRange":
    case "permuteRows":
    case "moveCells":
      return operation.range.sheet;

    case "addTable":
      return operation.table.range.sheet;

    case "addRows":
    case "removeRows":
    case "moveRows":
    case "addColumns":
    case "removeColumns":
    case "moveColumns":
    case "setColumn":
    case "setRowMeta":
    case "addMerge":
    case "removeMerge":
    case "removeSheet":
    case "renameSheet":
    case "moveSheet":
    case "setSheetVisibility":
    case "setSheetMeta":
    case "setValidationRule":
    case "removeValidationRule":
    case "setHyperlink":
    case "removeHyperlink":
    case "setProtectedRange":
    case "removeProtectedRange":
    case "updateTable":
    case "removeTable":
    case "setChart":
    case "removeChart":
    case "setPivot":
    case "removePivot":
    case "setDashboardItem":
    case "removeDashboardItem":
      return operation.sheet;

    case "addSheet":
      return operation.sheet.id;

    case "setNamedRange":
      return operation.namedRange.name;

    case "removeNamedRange":
      return operation.name;

    case "setCalculation":
      return "calculation";

    case "setExternalLinks":
      return "external-links";

    case "setMeasure":
      return `measure:${operation.measure.id}`;

    case "removeMeasure":
      return `measure:${operation.id}`;

    case "setRelationship":
      return `relationship:${operation.relationship.id}`;

    case "removeRelationship":
      return `relationship:${operation.id}`;

    case "setQuery":
      return `query:${operation.query.id}`;

    case "removeQuery":
      return `query:${operation.id}`;

    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}
