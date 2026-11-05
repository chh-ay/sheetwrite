import { deflateSync, Inflate } from "fflate";

import { boundedJsonByteLength, JsonByteLengthError, SheetwriteError } from "../errors.js";
import type { HistoryLimits, HistoryStoredRecord } from "./types.js";

/** Stable failure category for history validation, storage, and replay. */
export type HistoryErrorCode =
  | "invalid-history"
  | "conflict"
  | "capacity"
  | "not-found"
  | "integrity"
  | "unavailable"
  | "blocked"
  | "transaction";

/** Expected archive failure; cancellation preserves the caller's abort reason. */
export class HistoryError extends SheetwriteError {
  override readonly name = "HistoryError";
  declare readonly code: HistoryErrorCode;

  constructor(code: HistoryErrorCode, message: string, options?: ErrorOptions) {
    super(code, "history", message, { cause: options?.cause });
  }
}

/** Default byte, count, cadence, and retention bounds. */
export const DEFAULT_HISTORY_LIMITS: Readonly<HistoryLimits> = Object.freeze({
  maxSnapshotBytes: 64 * 1024 * 1024,
  maxSegmentBytes: 1024 * 1024,
  maxTransactionBytes: 64 * 1024 * 1024,
  maxStorageBytes: 512 * 1024 * 1024,
  maxWorkingBytes: 256 * 1024 * 1024,
  maxNamedVersions: 100,
  maxVersions: 10_000,
  maxPageEntries: 100,
  maxPageBytes: 256 * 1024,
  maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  automaticIntervalMs: 5 * 60 * 1000,
  checkpointIntervalMs: 30 * 60 * 1000,
  checkpointTransactions: 1000,
  checkpointLogBytes: 2 * 1024 * 1024,
});

export function resolveHistoryLimits(input: Partial<HistoryLimits> = {}): Readonly<HistoryLimits> {
  const limits = { ...DEFAULT_HISTORY_LIMITS, ...input };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new HistoryError("invalid-history", "History limits must be positive safe integers");
    }
  }
  if (limits.maxTransactionBytes > DEFAULT_HISTORY_LIMITS.maxTransactionBytes) {
    throw new HistoryError(
      "invalid-history",
      "History cannot raise the atomic transaction ceiling",
    );
  }
  return Object.freeze(limits);
}

export function checkAbort(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

export function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

export function historyJsonSize(value: unknown, limit: number): number {
  try {
    return boundedJsonByteLength(value, limit, { omitUndefinedProperties: true });
  } catch (cause) {
    if (!(cause instanceof JsonByteLengthError)) throw cause;
    throw new HistoryError(
      cause.code === "payload-limit" ? "capacity" : "invalid-history",
      "History JSON exceeds its byte ceiling or is not serializable",
      { cause },
    );
  }
}

export function jsonBytes(value: unknown, limit: number): Uint8Array {
  historyJsonSize(value, limit);
  return new TextEncoder().encode(JSON.stringify(value));
}

function header(record: Omit<HistoryStoredRecord, "id" | "bytes">): Uint8Array {
  return jsonBytes(
    [record.schemaVersion, record.kind, record.encoding, record.decodedBytes, record.references],
    4 * 1024 * 1024,
  );
}

async function digest(record: Omit<HistoryStoredRecord, "id">): Promise<string> {
  const prefix = header(record);
  const input = new Uint8Array(prefix.length + record.bytes.length);
  input.set(prefix);
  input.set(record.bytes, prefix.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  let result = "";
  for (const byte of hash) result += byte.toString(16).padStart(2, "0");
  return result;
}

export async function encodeRecord(
  kind: HistoryStoredRecord["kind"],
  value: unknown,
  references: readonly string[] = [],
  limit = DEFAULT_HISTORY_LIMITS.maxSnapshotBytes,
): Promise<HistoryStoredRecord> {
  return encodeBytes(kind, jsonBytes(value, limit), references, "deflate-json-v1");
}

export async function encodeBytes(
  kind: HistoryStoredRecord["kind"],
  source: Uint8Array,
  references: readonly string[] = [],
  encoding: HistoryStoredRecord["encoding"] = "deflate-bytes-v1",
): Promise<HistoryStoredRecord> {
  const record: Omit<HistoryStoredRecord, "id"> = {
    schemaVersion: 1,
    kind,
    encoding,
    decodedBytes: source.length,
    bytes: deflateSync(source, { level: 1 }),
    references: [...references],
  };
  return { ...record, id: await digest(record) };
}

export async function checkRecord(
  record: HistoryStoredRecord,
  limits: Readonly<HistoryLimits>,
): Promise<void> {
  if (
    record.schemaVersion !== 1 ||
    !validId(record.id) ||
    !integer(record.decodedBytes) ||
    record.decodedBytes === 0 ||
    record.decodedBytes > limits.maxSnapshotBytes ||
    !(record.bytes instanceof Uint8Array) ||
    record.bytes.length > limits.maxSnapshotBytes ||
    !strings(record.references) ||
    !record.references.every(validId) ||
    new Set(record.references).size !== record.references.length ||
    !["cells", "metadata", "sheet", "checkpoint", "segment", "transaction"].includes(record.kind) ||
    !["deflate-json-v1", "deflate-bytes-v1"].includes(record.encoding)
  ) {
    throw new HistoryError("integrity", "Invalid history record envelope");
  }
  if (
    record.kind === "segment" &&
    (record.bytes.length > limits.maxSegmentBytes + 65536 ||
      record.decodedBytes > limits.maxSegmentBytes)
  ) {
    throw new HistoryError("capacity", "History segment exceeds its byte ceiling");
  }
  if ((await digest(record)) !== record.id)
    throw new HistoryError("integrity", "History record digest does not match");
}

export async function decodeBytes(
  record: HistoryStoredRecord,
  limits: Readonly<HistoryLimits>,
): Promise<Uint8Array> {
  await checkRecord(record, limits);
  if (record.decodedBytes * 4 + record.bytes.length > limits.maxWorkingBytes) {
    throw new HistoryError("capacity", "History decode exceeds the working-set reservation");
  }
  const output = new Uint8Array(record.decodedBytes);
  let offset = 0;
  try {
    const decoder = new Inflate((chunk) => {
      if (offset + chunk.length > output.length)
        throw new HistoryError("integrity", "History expansion exceeds its declared size");
      output.set(chunk, offset);
      offset += chunk.length;
    });
    // Bound decompressor input too; malformed streams cannot force one giant output callback.
    for (let at = 0; at < record.bytes.length; at += 1024) {
      decoder.push(record.bytes.subarray(at, at + 1024), at + 1024 >= record.bytes.length);
    }
    if (offset !== output.length)
      throw new HistoryError("integrity", "History expansion has an invalid size");
  } catch (cause) {
    if (cause instanceof HistoryError) throw cause;
    throw new HistoryError("integrity", "Invalid compressed history payload", { cause });
  }
  return output;
}

export async function decodeRecord(
  record: HistoryStoredRecord,
  limits: Readonly<HistoryLimits>,
): Promise<unknown> {
  if (record.encoding !== "deflate-json-v1")
    throw new HistoryError("integrity", "History record is not JSON");
  const bytes = await decodeBytes(record, limits);
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return parsed;
  } catch (cause) {
    throw new HistoryError("integrity", "Invalid history JSON", { cause });
  }
}

export function recordBytes(record: HistoryStoredRecord): number {
  return record.bytes.length + header(record).length + 128;
}
