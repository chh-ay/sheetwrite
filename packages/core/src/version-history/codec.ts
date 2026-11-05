import { deflateSync, Inflate } from "fflate";

import { boundedJsonByteLength, JsonByteLengthError, SheetwriteError } from "../errors.js";
import type { HistoryLimits, HistoryStoredRecord } from "./types.js";

const MIB = 1024 * 1024;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Version of the record envelope that the content ID covers. */
const RECORD_SCHEMA_VERSION = 1;

/** Ceiling for one record header: the kind, encoding, size and reference list. */
const MAX_HEADER_BYTES = 4 * MIB;

/** Deflate level 1: history pages are numbers and text, which higher levels shrink little. */
const DEFLATE_LEVEL = 1;

/**
 * Compressed bytes a full segment can have above its decoded size. Deflate
 * stores incompressible input with 5 header bytes per 64 KiB block.
 */
const SEGMENT_DEFLATE_SLACK_BYTES = 64 * 1024;

/**
 * Working-set bytes per decoded byte: the output buffer, the decoded string
 * and the parsed values that the caller builds from it.
 */
const DECODE_RESERVATION_MULTIPLIER = 4;

/** Compressed bytes given to the inflater per step, so one call cannot produce unbounded output. */
const INFLATE_INPUT_STEP_BYTES = 1024;

/** Estimated per-record cost of the adapter's key and index entry. */
const RECORD_INDEX_BYTES = 128;

const RECORD_KINDS: readonly string[] = [
  "cells",
  "metadata",
  "sheet",
  "checkpoint",
  "segment",
  "transaction",
];

const RECORD_ENCODINGS: readonly string[] = ["deflate-json-v1", "deflate-bytes-v1"];

/** Stable failure category for history validation, storage, and replay. */
export type HistoryErrorCode =
  | "invalid-history"
  | "invalid-scope"
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

/** Default byte, count, cadence, and retention bounds (decision recorded in #228). */
export const DEFAULT_HISTORY_LIMITS: Readonly<HistoryLimits> = Object.freeze({
  maxSnapshotBytes: 64 * MIB,
  maxSegmentBytes: MIB,
  maxTransactionBytes: 64 * MIB,
  maxStorageBytes: 512 * MIB,
  maxWorkingBytes: 256 * MIB,
  maxNamedVersions: 100,
  maxVersions: 10_000,
  maxPageEntries: 100,
  maxPageBytes: 256 * 1024,
  maxAgeMs: 30 * DAY_MS,
  automaticIntervalMs: 5 * MINUTE_MS,
  checkpointIntervalMs: 30 * MINUTE_MS,
  checkpointTransactions: 1000,
  checkpointLogBytes: 2 * MIB,
});

/**
 * Merge host overrides over the defaults. Every limit must be a positive safe
 * integer. The transaction ceiling cannot rise above the atomic-batch ceiling,
 * because history only archives transactions the document accepted.
 */
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

/** Reject with the caller's abort reason when `signal` has fired. */
export function checkAbort(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

/** A non-negative safe integer. */
export function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A non-array object, as decoded from JSON. */
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** An array that holds only strings. */
export function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

/** A record content ID: 64 lowercase hex digits of SHA-256. */
export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Exact JSON bytes of `value`; a typed history failure when it passes `limit` or is not JSON. */
export function historyJsonSize(value: unknown, limit: number): number {
  try {
    return boundedJsonByteLength(value, limit, { omitUndefinedProperties: true });
  } catch (cause) {
    if (!(cause instanceof JsonByteLengthError)) {
      throw cause;
    }

    const code = cause.code === "payload-limit" ? "capacity" : "invalid-history";
    throw new HistoryError(code, "History JSON exceeds its byte ceiling or is not serializable", {
      cause,
    });
  }
}

/** UTF-8 JSON of `value`, measured before the string is built. */
export function jsonBytes(value: unknown, limit: number): Uint8Array {
  historyJsonSize(value, limit);

  return new TextEncoder().encode(JSON.stringify(value));
}

function header(record: Omit<HistoryStoredRecord, "id" | "bytes">): Uint8Array {
  const fields = [
    record.schemaVersion,
    record.kind,
    record.encoding,
    record.decodedBytes,
    record.references,
  ];

  return jsonBytes(fields, MAX_HEADER_BYTES);
}

/** SHA-256 over the header and the compressed bytes, so every envelope field is covered. */
async function digest(record: Omit<HistoryStoredRecord, "id">): Promise<string> {
  const prefix = header(record);
  const input = new Uint8Array(prefix.length + record.bytes.length);
  input.set(prefix);
  input.set(record.bytes, prefix.length);

  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", input));

  let result = "";
  for (const byte of hash) {
    result += byte.toString(16).padStart(2, "0");
  }

  return result;
}

/** Compress JSON of `value` into one content-addressed record. */
export async function encodeRecord(
  kind: HistoryStoredRecord["kind"],
  value: unknown,
  references: readonly string[] = [],
  limit = DEFAULT_HISTORY_LIMITS.maxSnapshotBytes,
): Promise<HistoryStoredRecord> {
  const source = jsonBytes(value, limit);

  return encodeBytes(kind, source, references, "deflate-json-v1");
}

/** Compress `source` into one content-addressed record that refers to `references`. */
export async function encodeBytes(
  kind: HistoryStoredRecord["kind"],
  source: Uint8Array,
  references: readonly string[] = [],
  encoding: HistoryStoredRecord["encoding"] = "deflate-bytes-v1",
): Promise<HistoryStoredRecord> {
  const record: Omit<HistoryStoredRecord, "id"> = {
    schemaVersion: RECORD_SCHEMA_VERSION,
    kind,
    encoding,
    decodedBytes: source.length,
    bytes: deflateSync(source, { level: DEFLATE_LEVEL }),
    references: [...references],
  };

  return { ...record, id: await digest(record) };
}

/** Validate an untrusted record envelope and its digest before any decode. */
export async function checkRecord(
  record: HistoryStoredRecord,
  limits: Readonly<HistoryLimits>,
): Promise<void> {
  const validEnvelope =
    record.schemaVersion === RECORD_SCHEMA_VERSION &&
    validId(record.id) &&
    integer(record.decodedBytes) &&
    record.decodedBytes > 0 &&
    record.decodedBytes <= limits.maxSnapshotBytes &&
    record.bytes instanceof Uint8Array &&
    record.bytes.length <= limits.maxSnapshotBytes &&
    strings(record.references) &&
    record.references.every(validId) &&
    new Set(record.references).size === record.references.length &&
    RECORD_KINDS.includes(record.kind) &&
    RECORD_ENCODINGS.includes(record.encoding);

  if (!validEnvelope) {
    throw new HistoryError("integrity", "Invalid history record envelope");
  }

  const oversizedSegment =
    record.kind === "segment" &&
    (record.bytes.length > limits.maxSegmentBytes + SEGMENT_DEFLATE_SLACK_BYTES ||
      record.decodedBytes > limits.maxSegmentBytes);

  if (oversizedSegment) {
    throw new HistoryError("capacity", "History segment exceeds its byte ceiling");
  }

  if ((await digest(record)) !== record.id) {
    throw new HistoryError("integrity", "History record digest does not match");
  }
}

/** Verify and inflate a record into exactly its declared number of bytes. */
export async function decodeBytes(
  record: HistoryStoredRecord,
  limits: Readonly<HistoryLimits>,
): Promise<Uint8Array> {
  await checkRecord(record, limits);

  const reservation = record.decodedBytes * DECODE_RESERVATION_MULTIPLIER + record.bytes.length;
  if (reservation > limits.maxWorkingBytes) {
    throw new HistoryError("capacity", "History decode exceeds the working-set reservation");
  }

  const output = new Uint8Array(record.decodedBytes);
  let offset = 0;

  try {
    const decoder = new Inflate((chunk) => {
      if (offset + chunk.length > output.length) {
        throw new HistoryError("integrity", "History expansion exceeds its declared size");
      }

      output.set(chunk, offset);
      offset += chunk.length;
    });

    for (let at = 0; at < record.bytes.length; at += INFLATE_INPUT_STEP_BYTES) {
      const end = at + INFLATE_INPUT_STEP_BYTES;
      decoder.push(record.bytes.subarray(at, end), end >= record.bytes.length);
    }
  } catch (cause) {
    if (cause instanceof HistoryError) {
      throw cause;
    }

    throw new HistoryError("integrity", "Invalid compressed history payload", { cause });
  }

  if (offset !== output.length) {
    throw new HistoryError("integrity", "History expansion has an invalid size");
  }

  return output;
}

/** Verify, inflate and parse a JSON record. The caller validates the parsed shape. */
export async function decodeRecord(
  record: HistoryStoredRecord,
  limits: Readonly<HistoryLimits>,
): Promise<unknown> {
  if (record.encoding !== "deflate-json-v1") {
    throw new HistoryError("integrity", "History record is not JSON");
  }

  const bytes = await decodeBytes(record, limits);

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (cause) {
    throw new HistoryError("integrity", "Invalid history JSON", { cause });
  }
}

/** Retained bytes charged for one record: payload, header and index entry. */
export function recordBytes(record: HistoryStoredRecord): number {
  return record.bytes.length + header(record).length + RECORD_INDEX_BYTES;
}
