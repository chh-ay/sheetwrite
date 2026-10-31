import {
  DEFAULT_XLSX_RESOURCE_LIMITS,
  isSheetwriteError,
  SheetwriteError,
  validateWorkbookSnapshot,
  XlsxResourceError,
  type XlsxResourceLimits,
  type XlsxWorkbookOptions,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";

export interface XlsxCodecContext {
  readonly operation: "import" | "export";
  readonly limits: Readonly<XlsxResourceLimits>;
  readonly options: XlsxWorkbookOptions | undefined;
  /** Warnings given to `onWarning` so far; see `MAX_WARNINGS`. */
  warningCount: number;
}

/** Warnings one conversion reports, so a hostile file cannot flood the host callback. */
const MAX_WARNINGS = 64;
/** UTF-8 bytes of file or host text that one error message keeps. */
const MAX_ERROR_TEXT_BYTES = 8 * 1024;
const ELLIPSIS = "…";
/** UTF-8 bytes of `ELLIPSIS`. */
const ELLIPSIS_BYTES = 3;
/** Most UTF-8 bytes that one UTF-16 code unit encodes to. */
const MAX_UTF8_BYTES_PER_UNIT = 3;
const ERROR_TEXT_ENCODER = new TextEncoder();

const RESOURCE_KEYS = Object.keys(DEFAULT_XLSX_RESOURCE_LIMITS) as (keyof XlsxResourceLimits)[];

function positiveLimit(
  operation: "import" | "export",
  name: keyof XlsxResourceLimits,
  value: number,
): number {
  const integerOnly = name !== "maxCompressionRatio";
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    (integerOnly ? !Number.isSafeInteger(value) : false)
  ) {
    throw new SheetwriteError(
      "xlsx-invalid-options",
      `xlsx-${operation}`,
      `Sheetwrite: XLSX ${name} must be ${integerOnly ? "a positive integer" : "positive"}`,
      { context: { format: "xlsx", resource: name } },
    );
  }
  return value;
}

/** Resolve and validate every XLSX resource limit before codec work begins. */
export function createCodecContext(
  operation: "import" | "export",
  options?: XlsxWorkbookOptions,
): XlsxCodecContext {
  const overrides = options?.resourceLimits;
  if (overrides) {
    for (const key of Object.keys(overrides)) {
      if (!RESOURCE_KEYS.includes(key as keyof XlsxResourceLimits) || key === "maxCells") {
        const resource = boundedErrorText(key);
        throw new SheetwriteError(
          "xlsx-invalid-options",
          `xlsx-${operation}`,
          `Sheetwrite: unknown XLSX resource limit ${resource}`,
          { context: { format: "xlsx", resource } },
        );
      }
    }
  }
  const limits = { ...DEFAULT_XLSX_RESOURCE_LIMITS };
  for (const key of RESOURCE_KEYS) {
    if (key === "maxCells") continue;
    const value = overrides?.[key];
    if (value !== undefined) limits[key] = positiveLimit(operation, key, value);
  }
  if (options?.maxCells !== undefined) {
    limits.maxCells = positiveLimit(operation, "maxCells", options.maxCells);
  }
  const context = { operation, limits: Object.freeze(limits), options, warningCount: 0 };
  checkAbort(context);
  return context;
}

/**
 * Cut file or host text that goes into an error to `MAX_ERROR_TEXT_BYTES` UTF-8
 * bytes, so a hostile part name or attribute cannot make an error large. The
 * cut never splits a code point.
 */
export function boundedErrorText(text: string): string {
  if (text.length * MAX_UTF8_BYTES_PER_UNIT <= MAX_ERROR_TEXT_BYTES) return text;

  const kept = new Uint8Array(MAX_ERROR_TEXT_BYTES - ELLIPSIS_BYTES);
  const { read } = ERROR_TEXT_ENCODER.encodeInto(text, kept);
  return read === text.length ? text : `${text.slice(0, read)}${ELLIPSIS}`;
}

/**
 * Normalize direct optional-package backend failures into the shared core
 * envelope. An abort is not a failure: once `signal` fired, the result is
 * `signal.reason`, unwrapped.
 */
export function xlsxFailure(
  error: unknown,
  operation: "import" | "export",
  backend: string,
  signal: AbortSignal | undefined,
): unknown {
  if (signal?.aborted) return signal.reason;
  if (error instanceof SheetwriteError) return error;
  if (isSheetwriteError(error)) {
    return new SheetwriteError(error.code, error.operation, boundedErrorText(error.message), {
      cause: error,
      context: error.context,
      retryable: error.retryable,
    });
  }
  return new SheetwriteError(
    operation === "import" ? "xlsx-import-failed" : "export-failed",
    `xlsx-${operation}`,
    error instanceof Error
      ? boundedErrorText(error.message)
      : `Sheetwrite XLSX ${operation} failed`,
    { cause: error, context: { format: "xlsx", backend } },
  );
}

/** Stop at a codec checkpoint once the caller's signal fired, with the signal's reason. */
export function checkAbort(context: XlsxCodecContext): void {
  const signal = context.options?.signal;
  if (signal?.aborted) throw signal.reason;
}

/**
 * True when `error` is the abort of this conversion. A catch that turns damaged
 * content into a warning or a dropped part must rethrow it first, because an
 * abort reason can be any value, also a `TypeError`.
 */
export function isAbort(context: XlsxCodecContext, error: unknown): boolean {
  const signal = context.options?.signal;
  return signal?.aborted === true && error === signal.reason;
}

export function assertResource(
  context: XlsxCodecContext,
  resource: keyof XlsxResourceLimits,
  actual: number,
): void {
  const limit = context.limits[resource];
  if (actual > limit) {
    throw new XlsxResourceError(resource, limit, actual, context.operation);
  }
}

/** Validate a sparse codec snapshot without applying live dense-store allocation ceilings. */
export function validateCodecSnapshot(input: unknown, context: XlsxCodecContext) {
  return validateWorkbookSnapshot(input, {
    storage: "paged",
    resourceLimits: {
      maxSheets: context.limits.maxSheets,
      maxRowsPerSheet: context.limits.maxRowsPerSheet,
      maxColumnsPerSheet: context.limits.maxColumnsPerSheet,
      maxLogicalCellsPerSheet: context.limits.maxRowsPerSheet * context.limits.maxColumnsPerSheet,
      maxDenseCells: 0,
      maxMetadataEntries: Number.MAX_SAFE_INTEGER,
      maxSerializedBytes: context.limits.maxTotalUncompressedBytes,
    },
  });
}

/** Report a fidelity warning. Warnings after the first `MAX_WARNINGS` are not reported. */
export function emitWarning(context: XlsxCodecContext, warning: XlsxWorkbookWarning): void {
  if (context.warningCount >= MAX_WARNINGS) return;
  context.warningCount += 1;
  context.options?.onWarning?.(warning);
}
