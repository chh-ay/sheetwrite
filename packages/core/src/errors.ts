/**
 * Stable discriminator for every consumer-visible Sheetwrite failure. Messages
 * are diagnostic and are not API contracts. Each `SheetwriteError` subclass
 * narrows `code` to its own codes; this union is the sum of all of them, so a
 * host can `switch (error.code)`. The union costs no bytes at run time.
 */
export type SheetwriteErrorCode =
  | "initialization-failed"
  | "initialization-required"
  | "engine-failed"
  | "datasource-request-failed"
  | "renderer-fallback"
  | "export-failed"
  | "xlsx-import-failed"
  | "optional-backend-unavailable"
  | "delimited-text-resource-limit"
  | "delimited-text-invalid-limit"
  | "xlsx-resource-limit"
  | "resource-limit"
  | "invalid-snapshot"
  | "invalid-argument"
  | "aborted"
  | "not-found"
  | "commit-rejected"
  | "unavailable"
  | "blocked"
  | "quota"
  | "unsupported-schema"
  | "transaction"
  | "conflict"
  | "limit"
  | "invalid-limits"
  | "invalid-version"
  | "invalid-id"
  | "invalid-operations"
  | "operation-limit"
  | "payload-limit"
  | "response-id-mismatch"
  | "future-distance-limit"
  | "buffer-count-limit"
  | "buffer-operation-limit"
  | "buffer-byte-limit"
  | "pending-count-limit"
  | "pending-operation-limit"
  | "pending-byte-limit"
  | "late-echo"
  | "remote-operations-rejected"
  | "invalid-batch"
  | "batch-limit"
  | "pending-capacity"
  | "presence-failed"
  | "revision-failed"
  | "comment-failed"
  | "sync-failed"
  | "sync-storage-failed"
  | "incomplete-data"
  | "xlsx-invalid-options"
  | "unsafe-hyperlink"
  | "invalid-shortcut"
  | "shortcut-conflict"
  | "invalid-function";

/**
 * Every `SheetwriteErrorCode`, for hosts that list the codes at run time.
 * Sheetwrite itself does not read this array, so a bundle that does not import
 * it does not contain it.
 */
export const SHEETWRITE_ERROR_CODES = [
  "initialization-failed",
  "initialization-required",
  "engine-failed",
  "datasource-request-failed",
  "renderer-fallback",
  "export-failed",
  "xlsx-import-failed",
  "optional-backend-unavailable",
  "delimited-text-resource-limit",
  "delimited-text-invalid-limit",
  "xlsx-resource-limit",
  "resource-limit",
  "invalid-snapshot",
  "invalid-argument",
  "aborted",
  "not-found",
  "commit-rejected",
  "unavailable",
  "blocked",
  "quota",
  "unsupported-schema",
  "transaction",
  "conflict",
  "limit",
  "invalid-limits",
  "invalid-version",
  "invalid-id",
  "invalid-operations",
  "operation-limit",
  "payload-limit",
  "response-id-mismatch",
  "future-distance-limit",
  "buffer-count-limit",
  "buffer-operation-limit",
  "buffer-byte-limit",
  "pending-count-limit",
  "pending-operation-limit",
  "pending-byte-limit",
  "late-echo",
  "remote-operations-rejected",
  "invalid-batch",
  "batch-limit",
  "pending-capacity",
  "presence-failed",
  "revision-failed",
  "comment-failed",
  "sync-failed",
  "sync-storage-failed",
  "incomplete-data",
  "xlsx-invalid-options",
  "unsafe-hyperlink",
  "invalid-shortcut",
  "shortcut-conflict",
  "invalid-function",
] as const satisfies readonly SheetwriteErrorCode[];

/** Stable operation at which a consumer-visible failure can surface. */
export type SheetwriteErrorOperation =
  | "initialize"
  | "create-grid"
  | "engine"
  | "store"
  | "transaction"
  | "render"
  | "datasource-request"
  | "renderer-worker"
  | "xlsx-import"
  | "xlsx-export"
  | "delimited-parse"
  | "delimited-import"
  | "delimited-encode"
  | "delimited-export"
  | "delimited-options"
  | "snapshot-validate"
  | "snapshot-allocate"
  | "persistence"
  | "pending-storage"
  | "synchronize"
  | "presence"
  | "revision"
  | "comment"
  | "query"
  | "row-bridge"
  | "resource-diagnostics"
  | "hyperlink-activate"
  | "keyboard-configure"
  | "chart-view"
  | "host-function";

/**
 * Every `SheetwriteErrorOperation`, for hosts that list the operations at run
 * time. Sheetwrite itself does not read this array.
 */
export const SHEETWRITE_ERROR_OPERATIONS = [
  "initialize",
  "create-grid",
  "engine",
  "store",
  "transaction",
  "render",
  "datasource-request",
  "renderer-worker",
  "xlsx-import",
  "xlsx-export",
  "delimited-parse",
  "delimited-import",
  "delimited-encode",
  "delimited-export",
  "delimited-options",
  "snapshot-validate",
  "snapshot-allocate",
  "persistence",
  "pending-storage",
  "synchronize",
  "presence",
  "revision",
  "comment",
  "query",
  "row-bridge",
  "resource-diagnostics",
  "hyperlink-activate",
  "keyboard-configure",
  "chart-view",
  "host-function",
] as const satisfies readonly SheetwriteErrorOperation[];

/** JSON-safe values accepted in a public failure context. */
export type SheetwriteErrorContextValue =
  | null
  | string
  | number
  | boolean
  | readonly SheetwriteErrorContextValue[]
  | { readonly [key: string]: SheetwriteErrorContextValue };

/** Stable, serialization-safe diagnostic context. */
export type SheetwriteErrorContext = Readonly<Record<string, SheetwriteErrorContextValue>>;

/** Structural form preserved across realms and JSON serialization. */
export interface SheetwriteErrorEnvelope {
  readonly name: string;
  readonly message: string;
  readonly code: SheetwriteErrorCode;
  readonly operation: SheetwriteErrorOperation;
  readonly context?: SheetwriteErrorContext;
  readonly retryable?: boolean;
}

/** Optional cause, diagnostic context, and boundary-known retryability. */
export interface SheetwriteErrorOptions extends ErrorOptions {
  context?: SheetwriteErrorContext;
  /** Present only when Sheetwrite can determine retryability from the boundary itself. */
  retryable?: boolean;
}

const MAX_ERROR_CONTEXT_DEPTH = 32;
const MAX_ERROR_CONTEXT_WIDTH = 256;
const MAX_ERROR_CONTEXT_ENTRIES = 1_024;
/**
 * UTF-8 budget for host or file text that goes into one error: the message,
 * and the sum of all strings in its context. An error stays small, whatever
 * data the failed operation held.
 */
const MAX_ERROR_TEXT_BYTES = 8 * 1024;
/** A UTF-16 code unit encodes to at most three UTF-8 bytes. */
const MAX_UTF8_BYTES_PER_UNIT = 3;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;
const ELLIPSIS = "…";
const ERROR_TEXT_ENCODER = new TextEncoder();
const INVALID_CONTEXT_VALUE = Symbol("invalid-context-value");
/** The context is JSON-safe but passes a depth, width or entry cap. */
const OVERSIZED_CONTEXT = Symbol("oversized-context");
/** Replaces a context that passes a cap, so the error itself can still be built. */
const TRUNCATED_CONTEXT: SheetwriteErrorContext = Object.freeze({ truncated: true });

type MutableContextContainer =
  | SheetwriteErrorContextValue[]
  | Record<string, SheetwriteErrorContextValue>;

interface ContextInspection {
  entries: number;
  /** UTF-8 bytes still free for strings; set only when a snapshot is taken. */
  textBudget?: number;
  readonly active: WeakSet<object>;
  readonly clones?: WeakMap<object, MutableContextContainer>;
  readonly snapshots?: MutableContextContainer[];
}

function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit <= 0x7f) bytes += 1;
    else if (unit <= 0x7ff) bytes += 2;
    else if (unit >= 0xd800 && unit < LOW_SURROGATE_MIN) {
      const next = text.charCodeAt(index + 1);
      if (next >= LOW_SURROGATE_MIN && next <= LOW_SURROGATE_MAX) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Cut text to at most `maxBytes` UTF-8 bytes. The start and the end stay,
 * because a message names the failure after the data it quotes. No cut splits
 * a code point.
 */
function boundedErrorText(text: string, maxBytes: number = MAX_ERROR_TEXT_BYTES): string {
  if (text.length * MAX_UTF8_BYTES_PER_UNIT <= maxBytes) return text;

  const whole = ERROR_TEXT_ENCODER.encodeInto(text, new Uint8Array(maxBytes));
  if (whole.read === text.length) return text;

  const keptEndBytes = Math.floor(maxBytes / 2) - ELLIPSIS.length * MAX_UTF8_BYTES_PER_UNIT;
  if (keptEndBytes <= 0) return ELLIPSIS;
  const head = ERROR_TEXT_ENCODER.encodeInto(text, new Uint8Array(keptEndBytes));
  // Each tail unit encodes to at most three bytes, so the tail fits in its half.
  let tailStart = text.length - Math.floor(keptEndBytes / MAX_UTF8_BYTES_PER_UNIT);
  const first = text.charCodeAt(tailStart);
  if (first >= LOW_SURROGATE_MIN && first <= LOW_SURROGATE_MAX) tailStart += 1;
  return `${text.slice(0, head.read)}${ELLIPSIS}${text.slice(tailStart)}`;
}

function isPlainContextObject(value: object): boolean {
  if (Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  const constructorDescriptor = Object.getOwnPropertyDescriptor(prototype, "constructor");
  return (
    Object.getPrototypeOf(prototype) === null &&
    constructorDescriptor !== undefined &&
    "value" in constructorDescriptor &&
    typeof constructorDescriptor.value === "function" &&
    constructorDescriptor.value.name === "Object"
  );
}

function hasUnsafeToJSON(value: object): boolean {
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "toJSON");
    if (descriptor !== undefined) {
      return !("value" in descriptor) || typeof descriptor.value === "function";
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

type ContextFailure = typeof INVALID_CONTEXT_VALUE | typeof OVERSIZED_CONTEXT;

function isContextFailure(value: unknown): value is ContextFailure {
  return value === INVALID_CONTEXT_VALUE || value === OVERSIZED_CONTEXT;
}

/** Keep a context string inside the error's remaining text budget. */
function budgetedContextText(text: string, inspection: ContextInspection): string {
  if (inspection.textBudget === undefined) return text;

  const kept = boundedErrorText(text, inspection.textBudget);
  inspection.textBudget = Math.max(0, inspection.textBudget - utf8ByteLength(kept));
  return kept;
}

function inspectContextValue(
  value: unknown,
  depth: number,
  inspection: ContextInspection,
): SheetwriteErrorContextValue | ContextFailure {
  if (typeof value === "string") return budgetedContextText(value, inspection);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : INVALID_CONTEXT_VALUE;
  }
  if (typeof value !== "object") return INVALID_CONTEXT_VALUE;
  if (depth > MAX_ERROR_CONTEXT_DEPTH) return OVERSIZED_CONTEXT;

  const source = value;
  const isArray = Array.isArray(source);
  if ((!isArray && !isPlainContextObject(source)) || hasUnsafeToJSON(source)) {
    return INVALID_CONTEXT_VALUE;
  }
  if (inspection.active.has(source)) return INVALID_CONTEXT_VALUE;

  let target = inspection.clones?.get(source);
  if (inspection.clones && inspection.snapshots && target === undefined) {
    target = isArray
      ? (Object.setPrototypeOf([], null) as SheetwriteErrorContextValue[])
      : (Object.create(null) as Record<string, SheetwriteErrorContextValue>);
    inspection.clones.set(source, target);
    inspection.snapshots.push(target);
  }

  inspection.active.add(source);
  try {
    if (isArray) {
      if (source.length > MAX_ERROR_CONTEXT_WIDTH) return OVERSIZED_CONTEXT;
      const ownKeys = Reflect.ownKeys(source);
      if (ownKeys.length !== source.length + 1) return INVALID_CONTEXT_VALUE;
      for (const key of ownKeys) {
        if (key === "length") continue;
        if (
          typeof key !== "string" ||
          !Number.isSafeInteger(Number(key)) ||
          Number(key) < 0 ||
          Number(key) >= source.length ||
          String(Number(key)) !== key
        ) {
          return INVALID_CONTEXT_VALUE;
        }
      }
      inspection.entries += source.length;
      if (inspection.entries > MAX_ERROR_CONTEXT_ENTRIES) return OVERSIZED_CONTEXT;

      for (let index = 0; index < source.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
        if (descriptor === undefined || !("value" in descriptor)) return INVALID_CONTEXT_VALUE;
        const child = inspectContextValue(descriptor.value, depth + 1, inspection);
        if (isContextFailure(child)) return child;
        if (target) (target as SheetwriteErrorContextValue[])[index] = child;
      }
    } else {
      const keys = Reflect.ownKeys(source);
      if (keys.length > MAX_ERROR_CONTEXT_WIDTH) return OVERSIZED_CONTEXT;
      inspection.entries += keys.length;
      if (inspection.entries > MAX_ERROR_CONTEXT_ENTRIES) return OVERSIZED_CONTEXT;

      for (const key of keys) {
        if (typeof key !== "string") return INVALID_CONTEXT_VALUE;
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) {
          return INVALID_CONTEXT_VALUE;
        }
        const child = inspectContextValue(descriptor.value, depth + 1, inspection);
        if (isContextFailure(child)) return child;
        if (target) {
          (target as Record<string, SheetwriteErrorContextValue>)[key] = child;
        }
      }
    }
    return target ?? (source as SheetwriteErrorContextValue);
  } finally {
    inspection.active.delete(source);
  }
}

function inspectSheetwriteErrorContext(
  context: unknown,
  snapshot: boolean,
): SheetwriteErrorContext | ContextFailure {
  if (typeof context !== "object" || context === null) return INVALID_CONTEXT_VALUE;

  const snapshots: MutableContextContainer[] | undefined = snapshot ? [] : undefined;
  const inspection: ContextInspection = {
    entries: 0,
    textBudget: snapshot ? MAX_ERROR_TEXT_BYTES : undefined,
    active: new WeakSet<object>(),
    clones: snapshot ? new WeakMap<object, MutableContextContainer>() : undefined,
    snapshots,
  };
  let inspected: SheetwriteErrorContextValue | ContextFailure;
  try {
    if (!isPlainContextObject(context)) return INVALID_CONTEXT_VALUE;
    inspected = inspectContextValue(context, 0, inspection);
  } catch {
    // A throwing getter or proxy trap makes a value unusable as context. The
    // result is a typed failure: the guard reports "not a Sheetwrite error",
    // and the constructor reports a bad context, instead of the host's error.
    return INVALID_CONTEXT_VALUE;
  }
  if (isContextFailure(inspected)) return inspected;
  if (Array.isArray(inspected)) return INVALID_CONTEXT_VALUE;

  if (snapshots) {
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      Object.freeze(snapshots[index]);
    }
  }
  return inspected as SheetwriteErrorContext;
}

/**
 * Copy a context into frozen plain data. A context that passes a cap becomes
 * `{ truncated: true }`, so a large failure still builds its error. A context
 * that is not JSON-safe is a bug in the caller.
 */
function snapshotSheetwriteErrorContext(context: SheetwriteErrorContext): SheetwriteErrorContext {
  const snapshot = inspectSheetwriteErrorContext(context, true);
  if (snapshot === OVERSIZED_CONTEXT) return TRUNCATED_CONTEXT;
  if (snapshot === INVALID_CONTEXT_VALUE) {
    throw new TypeError("SheetwriteError context must be a record of JSON-safe values");
  }
  return snapshot;
}

function isSheetwriteErrorContext(context: unknown): context is SheetwriteErrorContext {
  return !isContextFailure(inspectSheetwriteErrorContext(context, false));
}

/**
 * Canonical envelope for thrown and callback-delivered Sheetwrite failures.
 * The message is cut to an 8 KiB UTF-8 budget, and so is the sum of the
 * context strings, because both can quote host or file data.
 */
export class SheetwriteError extends Error implements SheetwriteErrorEnvelope {
  override readonly name: string = "SheetwriteError";
  readonly context?: SheetwriteErrorContext;
  readonly retryable?: boolean;

  constructor(
    readonly code: SheetwriteErrorCode,
    readonly operation: SheetwriteErrorOperation,
    message: string,
    options: SheetwriteErrorOptions = {},
  ) {
    super(
      boundedErrorText(message),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    Object.defineProperty(this, "context", {
      value:
        options.context === undefined ? undefined : snapshotSheetwriteErrorContext(options.context),
      enumerable: true,
      writable: false,
      configurable: false,
    });
    this.retryable = options.retryable;
  }

  toJSON(): SheetwriteErrorEnvelope {
    return {
      name: "SheetwriteError",
      message: this.message,
      code: this.code,
      operation: this.operation,
      ...(this.context === undefined ? {} : { context: this.context }),
      ...(this.retryable === undefined ? {} : { retryable: this.retryable }),
    };
  }
}

/**
 * Narrow same-realm errors, cross-realm errors, and serialized failure
 * envelopes by shape: a string `name` and `message`, a non-empty string `code`
 * and `operation`, and a JSON-safe `context` when present. The guard does not
 * check `code` against a list, so a code from a newer Sheetwrite still passes;
 * handle unknown codes in the `default` branch of a `switch`.
 */
export function isSheetwriteError(value: unknown): value is SheetwriteErrorEnvelope {
  if (value instanceof SheetwriteError) return true;
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<Record<keyof SheetwriteErrorEnvelope, unknown>>;
  try {
    return (
      typeof candidate.name === "string" &&
      typeof candidate.message === "string" &&
      typeof candidate.code === "string" &&
      candidate.code.length > 0 &&
      typeof candidate.operation === "string" &&
      candidate.operation.length > 0 &&
      (candidate.context === undefined || isSheetwriteErrorContext(candidate.context)) &&
      (candidate.retryable === undefined || typeof candidate.retryable === "boolean")
    );
  } catch {
    // A throwing getter or proxy trap means the value has no readable failure
    // shape. That is the guard's answer, not a failure of the caller.
    return false;
  }
}

/** Internal boundary helper: retain canonical failures and wrap arbitrary causes once. */
export function normalizeSheetwriteError(
  error: unknown,
  code: SheetwriteErrorCode,
  operation: SheetwriteErrorOperation,
  context?: SheetwriteErrorContext,
): SheetwriteError {
  if (isSheetwriteError(error)) {
    if (error instanceof SheetwriteError) return error;
    return new SheetwriteError(error.code, error.operation, error.message, {
      cause: error,
      context: error.context,
      retryable: error.retryable,
    });
  }
  return new SheetwriteError(
    code,
    operation,
    error instanceof Error ? error.message : `Sheetwrite ${operation} failed`,
    { cause: error, context },
  );
}

/** The one failure for a sheet ID that no sheet of the workbook has. */
export function unknownSheetError(sheet: string): SheetwriteError {
  return new SheetwriteError("not-found", "store", `Sheetwrite: unknown sheet ${sheet}`, {
    context: { sheet },
  });
}

/** A datasource page or option that breaks the datasource protocol. */
export function datasourceFailure(message: string): SheetwriteError {
  return new SheetwriteError("datasource-request-failed", "datasource-request", message);
}

/**
 * Internal failure of `boundedJsonByteLength`. Callers that own a public code
 * catch it and throw their own failure; any other path lets it reach the host
 * as a transaction failure.
 */
export class JsonByteLengthError extends SheetwriteError {
  override readonly name = "JsonByteLengthError";
  declare readonly code: "payload-limit" | "invalid-operations";

  constructor(
    code: "payload-limit" | "invalid-operations",
    message: string,
    readonly actual?: number,
    readonly limit?: number,
  ) {
    super(
      code,
      "transaction",
      message,
      actual === undefined || limit === undefined ? {} : { context: { actual, limit } },
    );
  }
}

export interface JsonByteLengthOptions {
  /** Match JSON object encoding by omitting own properties whose value is undefined. */
  omitUndefinedProperties?: boolean;
}

/** Computes exact JSON UTF-8 bytes without constructing the encoded payload. */
export function boundedJsonByteLength(
  value: unknown,
  limit: number,
  options: JsonByteLengthOptions = {},
): number {
  let bytes = 0;
  const ancestors = new Set<object>();
  const add = (amount: number): void => {
    bytes += amount;
    if (bytes > limit) {
      throw new JsonByteLengthError(
        "payload-limit",
        `Encoded JSON exceeds the ${limit} byte limit`,
        bytes,
        limit,
      );
    }
  };
  const addString = (input: string): void => {
    add(2);
    let index = 0;
    while (index < input.length) {
      const code = input.charCodeAt(index);
      if (code >= 0x20 && code <= 0x7f && code !== 0x22 && code !== 0x5c) {
        // Batch plain ASCII, but stop scanning at the first overflowing byte.
        const runLimit = Math.min(input.length, index + Math.floor(limit - bytes) + 1);
        let runEnd = index + 1;
        while (runEnd < runLimit) {
          const next = input.charCodeAt(runEnd);
          if (next < 0x20 || next > 0x7f || next === 0x22 || next === 0x5c) break;
          runEnd += 1;
        }
        add(runEnd - index);
        index = runEnd;
        continue;
      }
      if (
        code === 0x22 ||
        code === 0x5c ||
        code === 0x08 ||
        code === 0x09 ||
        code === 0x0a ||
        code === 0x0c ||
        code === 0x0d
      ) {
        add(2);
      } else if (code < 0x20) {
        add(6);
      } else if (code <= 0x7ff) {
        add(2);
      } else if (code >= 0xd800 && code <= 0xdbff) {
        const next = input.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          add(4);
          index += 1;
        } else {
          add(6);
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        add(6);
      } else {
        add(3);
      }
      index += 1;
    }
  };
  const visit = (input: unknown): void => {
    if (input === null) {
      add(4);
      return;
    }
    if (typeof input === "string") {
      addString(input);
      return;
    }
    if (typeof input === "boolean") {
      add(input ? 4 : 5);
      return;
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        throw new JsonByteLengthError("invalid-operations", "JSON numbers must be finite");
      }
      // JSON encodes a finite number as its ToString, so no JSON machinery is needed.
      add(String(input).length);
      return;
    }
    if (typeof input !== "object") {
      throw new JsonByteLengthError("invalid-operations", "Value is not JSON-safe");
    }
    if (ancestors.has(input)) {
      throw new JsonByteLengthError("invalid-operations", "JSON values cannot contain cycles");
    }
    ancestors.add(input);
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) {
        throw new JsonByteLengthError("invalid-operations", "Arrays must use Array prototype");
      }
      add(2);
      for (let index = 0; index < input.length; index++) {
        if (index > 0) add(1);
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new JsonByteLengthError("invalid-operations", "Arrays cannot be sparse");
        }
        visit(descriptor.value);
      }
      for (const key in input) {
        const index = Number(key);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== key ||
          index >= input.length
        ) {
          throw new JsonByteLengthError(
            "invalid-operations",
            "Arrays cannot contain named properties",
          );
        }
      }
      ancestors.delete(input);
      return;
    }
    if (Object.getPrototypeOf(input) !== Object.prototype) {
      throw new JsonByteLengthError(
        "invalid-operations",
        "JSON values must contain only plain objects",
      );
    }
    const record = input as Record<string, unknown>;
    // Any own property named toJSON is rejected, whatever its descriptor says.
    if (Object.hasOwn(record, "toJSON")) {
      throw new JsonByteLengthError("invalid-operations", "JSON values cannot define toJSON");
    }
    add(2);
    let first = true;
    for (const key in record) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new JsonByteLengthError(
          "invalid-operations",
          "JSON fields must be enumerable data properties",
        );
      }
      if (descriptor.value === undefined && options.omitUndefinedProperties) continue;
      if (!first) add(1);
      first = false;
      addString(key);
      add(1);
      visit(descriptor.value);
    }
    ancestors.delete(input);
  };
  visit(value);
  return bytes;
}
