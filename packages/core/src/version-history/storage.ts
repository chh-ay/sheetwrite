import { compareCodeUnits } from "../plain-data.js";
import {
  checkAbort,
  checkRecord,
  HistoryError,
  integer,
  jsonBytes,
  recordBytes,
  validId,
} from "./codec.js";
import type {
  HistoryGetRequest,
  HistoryHead,
  HistoryListPage,
  HistoryListRequest,
  HistoryManifest,
  HistoryPinRequest,
  HistoryPruneRequest,
  HistoryPublishRequest,
  HistoryPutRequest,
  HistoryRecordMetadata,
  HistoryStorageAdapter,
  HistoryStorageRequest,
  HistoryStoredRecord,
  HistoryVersion,
} from "./types.js";

/** A reader lease lasts five minutes and renews on each leased read. */
const READER_LEASE_MS = 5 * 60 * 1000;

/** Concurrent reader leases per document; each one pins a complete replay chain. */
const MAX_READER_LEASES = 32;

/** Record nesting is checkpoint → sheet → metadata list → metadata slice, or envelope → segment. */
const MAX_REFERENCE_DEPTH = 32;

/** Ceiling for the JSON of one marker, head or lease. */
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

/** Ceiling for a log tail between two checkpoints; the cadence closes a tail far earlier. */
const MAX_TAIL_TRANSACTIONS = 100_000;

/** Ceiling for the records of one publication. */
const MAX_PUBLICATION_RECORDS = 100_000;

/** UTF-8 code units in an author ID, marker name or reader token. */
const MAX_LABEL_LENGTH = 256;

/** A record with the count of heads, markers, leases and records that refer to it. */
export interface StoredHistoryRecord {
  record: HistoryStoredRecord;
  owners: number;
}

/** A reader lease that keeps the replay chain of `version` alive until `expires`. */
export interface HistoryReaderPin {
  token: string;
  expires: number;
  version: HistoryVersion;
}

/**
 * One atomic database transaction. The memory and IndexedDB adapters supply
 * it; `AtomicHistoryStorage` keeps all publication and retention rules.
 */
export interface HistoryStorageTransaction {
  manifest(): Promise<HistoryManifest>;
  saveManifest(manifest: HistoryManifest): Promise<void>;

  record(id: string): Promise<StoredHistoryRecord | undefined>;
  saveRecord(value: StoredHistoryRecord): Promise<void>;
  deleteRecord(id: string): Promise<void>;

  /** Up to `count` records of `kind` with IDs after `afterId`, in ID order. */
  recordPage(
    kind: HistoryStoredRecord["kind"],
    afterId: string,
    count: number,
  ): Promise<HistoryRecordMetadata[]>;

  versions(): Promise<HistoryVersion[]>;
  saveVersion(version: HistoryVersion): Promise<void>;
  deleteVersion(id: string): Promise<void>;

  pins(): Promise<HistoryReaderPin[]>;
  savePin(pin: HistoryReaderPin): Promise<void>;
  deletePin(token: string): Promise<void>;
}

/** Records that a head or marker owns directly: its checkpoints and log tail. */
function roots(owner: Pick<HistoryVersion, "checkpoint" | "tail" | "checkpoints">): string[] {
  return [...new Set([owner.checkpoint, ...owner.tail, ...owner.checkpoints])];
}

function metadata_bytes(value: unknown): number {
  return jsonBytes(value, MAX_METADATA_BYTES).length;
}

function oldest_first(left: HistoryVersion, right: HistoryVersion): number {
  return left.time - right.time || compareCodeUnits(left.id, right.id);
}

function check_owner(
  owner: Pick<HistoryVersion, "revision" | "checkpoint" | "tail" | "checkpoints">,
): void {
  const valid =
    integer(owner.revision) &&
    validId(owner.checkpoint) &&
    Array.isArray(owner.tail) &&
    owner.tail.length <= MAX_TAIL_TRANSACTIONS &&
    owner.tail.every(validId) &&
    Array.isArray(owner.checkpoints) &&
    owner.checkpoints.length <= MAX_TAIL_TRANSACTIONS &&
    owner.checkpoints.every(validId);

  if (!valid) {
    throw new HistoryError("invalid-history", "Invalid history revision references");
  }
}

function check_head(head: HistoryHead): void {
  check_owner(head);

  const counters = [
    head.time,
    head.activeMs,
    head.automaticAt,
    head.checkpointAt,
    head.checkpointTransactions,
    head.checkpointLogBytes,
  ];

  if (!counters.every(integer)) {
    throw new HistoryError("invalid-history", "Invalid history recorder cursor");
  }
}

function check_version(version: HistoryVersion): void {
  check_owner(version);

  const valid_name =
    version.kind === "automatic" ||
    (version.kind === "named" &&
      typeof version.name === "string" &&
      version.name.trim().length > 0 &&
      version.name.length <= MAX_LABEL_LENGTH);

  const valid =
    validId(version.id) &&
    integer(version.time) &&
    typeof version.authorId === "string" &&
    version.authorId.length > 0 &&
    version.authorId.length <= MAX_LABEL_LENGTH &&
    valid_name;

  if (!valid) {
    throw new HistoryError("invalid-history", "Invalid history version marker");
  }
}

/** Add one owner to each record. A missing record means the publication is incomplete. */
async function retain(
  transaction: HistoryStorageTransaction,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    const stored = await transaction.record(id);
    if (!stored) {
      throw new HistoryError("integrity", "Published history references a missing record");
    }

    await transaction.saveRecord({ ...stored, owners: stored.owners + 1 });
  }
}

/** Remove one owner from each record, and delete records that no longer have one. */
async function release(
  transaction: HistoryStorageTransaction,
  ids: readonly string[],
  manifest: HistoryManifest,
  depth = 0,
): Promise<void> {
  if (depth > MAX_REFERENCE_DEPTH) {
    throw new HistoryError("integrity", "History dependency graph is too deep");
  }

  for (const id of ids) {
    const stored = await transaction.record(id);
    if (!stored || stored.owners <= 0) {
      throw new HistoryError("integrity", "Invalid history reference count");
    }

    if (stored.owners > 1) {
      await transaction.saveRecord({ ...stored, owners: stored.owners - 1 });
      continue;
    }

    await transaction.deleteRecord(id);
    manifest.recordCount--;
    manifest.encodedBytes -= recordBytes(stored.record);

    await release(transaction, stored.record.references, manifest, depth + 1);
  }
}

async function expire_pins(
  transaction: HistoryStorageTransaction,
  manifest: HistoryManifest,
): Promise<void> {
  const now = Date.now();

  for (const pin of await transaction.pins()) {
    if (pin.expires > now) {
      continue;
    }

    await release(transaction, roots(pin.version), manifest);
    await transaction.deletePin(pin.token);
    manifest.encodedBytes -= metadata_bytes(pin);
  }
}

async function remove_version(
  transaction: HistoryStorageTransaction,
  manifest: HistoryManifest,
  version: HistoryVersion,
): Promise<void> {
  await transaction.deleteVersion(version.id);

  manifest.versionCount--;
  if (version.kind === "named") {
    manifest.namedVersionCount--;
  }
  manifest.encodedBytes -= metadata_bytes(version);

  await release(transaction, roots(version), manifest);
}

/** Copy and validate a publication before the first await, so later host edits cannot change it. */
async function admit_publication(input: HistoryPublishRequest): Promise<HistoryPublishRequest> {
  const payload_bytes = input.records.reduce((total, record) => total + record.bytes.length, 0);
  const too_large =
    payload_bytes > input.limits.maxWorkingBytes / 2 ||
    input.records.length > MAX_PUBLICATION_RECORDS;

  if (too_large) {
    throw new HistoryError("capacity", "History publication exceeds the working-set reservation");
  }

  const request: HistoryPublishRequest = {
    ...input,
    records: structuredClone(input.records),
    head: structuredClone(input.head),
    version: structuredClone(input.version),
  };

  let submitted_bytes = 0;
  for (const record of request.records) {
    await checkRecord(record, request.limits);
    submitted_bytes += recordBytes(record);
  }

  if (submitted_bytes > request.limits.maxSnapshotBytes + request.limits.maxTransactionBytes) {
    throw new HistoryError("capacity", "One history publication exceeds its byte ceiling");
  }

  if (request.head) {
    check_head(request.head);
  }

  if (request.version) {
    check_version(request.version);
  }

  return request;
}

/**
 * Publication, reader leases and reference-counted retention, shared by the
 * supplied adapters. Every method runs in one `transact` call, so a failure
 * leaves the stored archive unchanged.
 */
export abstract class AtomicHistoryStorage implements HistoryStorageAdapter {
  protected abstract transact<T>(
    request: HistoryStorageRequest,
    action: (transaction: HistoryStorageTransaction) => Promise<T>,
  ): Promise<T>;

  async put(input: HistoryPutRequest): Promise<HistoryManifest> {
    checkAbort(input.signal);

    if (input.kind !== "publish") {
      return this.transact(input, (transaction) => this.lease(transaction, { ...input }));
    }

    const request = await admit_publication(input);

    return this.transact(request, (transaction) => this.publish(transaction, request));
  }

  private async lease(
    transaction: HistoryStorageTransaction,
    request: HistoryPinRequest,
  ): Promise<HistoryManifest> {
    const manifest = await transaction.manifest();
    await expire_pins(transaction, manifest);

    const pins = await transaction.pins();
    const existing = pins.find((pin) => pin.token === request.token);

    if (request.kind === "release") {
      if (existing) {
        await release(transaction, roots(existing.version), manifest);
        await transaction.deletePin(existing.token);
        manifest.encodedBytes -= metadata_bytes(existing);
      }

      await transaction.saveManifest(manifest);
      return manifest;
    }

    if (pins.length >= MAX_READER_LEASES) {
      throw new HistoryError("capacity", "Too many concurrent history readers");
    }

    if (existing || request.token.length > MAX_LABEL_LENGTH) {
      throw new HistoryError("invalid-history", "Invalid history reader token");
    }

    const versions = request.versionId === "head" ? [] : await transaction.versions();
    const head = manifest.head;
    const version: HistoryVersion | undefined =
      request.versionId === "head" && head
        ? {
            id: "head",
            revision: head.revision,
            kind: "automatic",
            authorId: "",
            time: head.time,
            checkpoint: head.checkpoint,
            tail: head.tail,
            checkpoints: head.checkpoints,
          }
        : versions.find((candidate) => candidate.id === request.versionId);
    if (!version) {
      throw new HistoryError("not-found", "History version does not exist");
    }

    const pin = { token: request.token, expires: Date.now() + READER_LEASE_MS, version };
    await retain(transaction, roots(version));
    await transaction.savePin(pin);
    manifest.encodedBytes += metadata_bytes(pin);

    await transaction.saveManifest(manifest);
    return manifest;
  }

  private async publish(
    transaction: HistoryStorageTransaction,
    request: HistoryPublishRequest,
  ): Promise<HistoryManifest> {
    const manifest = await transaction.manifest();
    await expire_pins(transaction, manifest);

    if (manifest.generation !== request.expectedGeneration) {
      throw new HistoryError("conflict", "History manifest advanced");
    }

    const inserted = await this.insert_records(transaction, manifest, request.records);

    // The marker first: it takes over checkpoints that the new head no longer
    // lists, so they keep an owner while the old head lets them go.
    if (request.version) {
      await this.add_version(transaction, manifest, request.version, request.head ?? manifest.head);
    }

    if (request.head) {
      await this.move_head(transaction, manifest, request.head);
    }

    // Every new record must have an owner; an orphan would never be pruned.
    for (const id of inserted) {
      const stored = await transaction.record(id);
      if (stored?.owners === 0) {
        throw new HistoryError("invalid-history", "Publication includes an unreachable record");
      }
    }

    await this.expire_automatic(transaction, manifest, request);

    const over_capacity =
      manifest.namedVersionCount > request.limits.maxNamedVersions ||
      manifest.versionCount > request.limits.maxVersions ||
      manifest.encodedBytes > request.limits.maxStorageBytes;

    if (over_capacity) {
      throw new HistoryError(
        "capacity",
        "Pinned history or the current head exceeds archive capacity",
      );
    }

    manifest.generation++;
    checkAbort(request.signal);
    await transaction.saveManifest(manifest);

    return manifest;
  }

  /**
   * Store records that are not stored yet. Records are content-addressed, so an
   * existing ID already holds the same bytes. Children come before their owners
   * in a publication, so a record can only refer to stored records and the
   * reference graph cannot form a cycle.
   */
  private async insert_records(
    transaction: HistoryStorageTransaction,
    manifest: HistoryManifest,
    records: readonly HistoryStoredRecord[],
  ): Promise<string[]> {
    const inserted: string[] = [];

    for (const record of records) {
      if (await transaction.record(record.id)) {
        continue;
      }

      await retain(transaction, record.references);
      await transaction.saveRecord({ record, owners: 0 });

      inserted.push(record.id);
      manifest.recordCount++;
      manifest.encodedBytes += recordBytes(record);
    }

    return inserted;
  }

  private async move_head(
    transaction: HistoryStorageTransaction,
    manifest: HistoryManifest,
    head: HistoryHead,
  ): Promise<void> {
    if (manifest.head && head.revision < manifest.head.revision) {
      throw new HistoryError("conflict", "History head cannot move backwards");
    }

    // Retain the new head first: it can share records with the old head.
    await retain(transaction, roots(head));

    if (manifest.head) {
      await release(transaction, roots(manifest.head), manifest);
      manifest.encodedBytes -= metadata_bytes(manifest.head);
    }

    manifest.head = structuredClone(head);
    manifest.encodedBytes += metadata_bytes(head);
  }

  private async add_version(
    transaction: HistoryStorageTransaction,
    manifest: HistoryManifest,
    version: HistoryVersion,
    head: HistoryHead | undefined,
  ): Promise<void> {
    const versions = await transaction.versions();
    const duplicate = versions.find((candidate) => candidate.id === version.id);

    // Marker IDs are content-addressed, so a retry of the same marker changes nothing.
    if (duplicate) {
      if (JSON.stringify(duplicate) !== JSON.stringify(version)) {
        throw new HistoryError("integrity", "History marker ID was reused");
      }

      return;
    }

    if (!head || version.revision > head.revision) {
      throw new HistoryError("invalid-history", "Version is ahead of the history head");
    }

    await retain(transaction, roots(version));
    await transaction.saveVersion(structuredClone(version));

    manifest.versionCount++;
    if (version.kind === "named") {
      manifest.namedVersionCount++;
    }
    manifest.encodedBytes += metadata_bytes(version);
  }

  /** Remove the oldest automatic markers past the age ceiling or while the archive is over capacity. */
  private async expire_automatic(
    transaction: HistoryStorageTransaction,
    manifest: HistoryManifest,
    request: HistoryPublishRequest,
  ): Promise<void> {
    const versions = await transaction.versions();
    const automatic = versions.filter((version) => version.kind === "automatic").sort(oldest_first);
    const expires_before = (manifest.head?.time ?? 0) - request.limits.maxAgeMs;

    for (const version of automatic) {
      const keep =
        version.time >= expires_before &&
        manifest.encodedBytes <= request.limits.maxStorageBytes &&
        manifest.versionCount <= request.limits.maxVersions;

      if (keep) {
        break;
      }

      await remove_version(transaction, manifest, version);
    }
  }

  async get(
    request: HistoryGetRequest,
  ): Promise<HistoryManifest | HistoryVersion | HistoryStoredRecord> {
    return this.transact(request, async (transaction) => {
      if (request.kind === "manifest") {
        return transaction.manifest();
      }

      if (request.kind === "version") {
        const versions = await transaction.versions();
        const version = versions.find((candidate) => candidate.id === request.id);
        if (!version) {
          throw new HistoryError("not-found", "History version does not exist");
        }

        return version;
      }

      if (!integer(request.maxBytes) || request.maxBytes === 0) {
        throw new HistoryError("invalid-history", "A positive read byte ceiling is required");
      }

      if (request.pin) {
        const pins = await transaction.pins();
        const pin = pins.find((candidate) => candidate.token === request.pin);
        if (!pin || pin.expires <= Date.now()) {
          throw new HistoryError("conflict", "History reader lease expired");
        }

        await transaction.savePin({ ...pin, expires: Date.now() + READER_LEASE_MS });
      }

      const stored = await transaction.record(request.id);
      if (!stored) {
        throw new HistoryError("not-found", "History record does not exist");
      }

      if (stored.record.bytes.length > request.maxBytes) {
        throw new HistoryError("capacity", "History read exceeds its byte ceiling");
      }

      return structuredClone(stored.record);
    });
  }

  async list(request: HistoryListRequest): Promise<HistoryListPage> {
    const valid_page =
      integer(request.maxEntries) &&
      request.maxEntries > 0 &&
      request.maxEntries <= request.limits.maxPageEntries &&
      integer(request.maxBytes) &&
      request.maxBytes > 0 &&
      request.maxBytes <= request.limits.maxPageBytes;

    if (!valid_page) {
      throw new HistoryError("capacity", "History metadata page exceeds its bounds");
    }

    const valid_interval =
      (request.fromRevision === undefined || integer(request.fromRevision)) &&
      (request.toRevision === undefined || integer(request.toRevision));

    if (!valid_interval) {
      throw new HistoryError("invalid-history", "Invalid history listing revision interval");
    }

    return this.transact(request, async (transaction) => {
      const manifest = await transaction.manifest();
      const kind = request.kind ?? "versions";

      // A cursor holds the generation and the listing it belongs to, so any
      // publication or a different filter makes it stale.
      const scope = `${manifest.generation}:${kind}:${request.fromRevision ?? 0}:${request.toRevision ?? "head"}:`;
      let position = "";
      if (request.cursor !== undefined) {
        if (!request.cursor.startsWith(scope)) {
          throw new HistoryError(
            "conflict",
            "History metadata cursor is stale or belongs to another listing",
          );
        }

        position = request.cursor.slice(scope.length);
      }

      if (kind === "versions") {
        return this.list_versions(transaction, request, manifest, scope, position);
      }

      return this.list_records(transaction, request, manifest, kind, scope, position);
    });
  }

  private async list_versions(
    transaction: HistoryStorageTransaction,
    request: HistoryListRequest,
    manifest: HistoryManifest,
    scope: string,
    position: string,
  ): Promise<HistoryListPage> {
    const start = position === "" ? 0 : Number(position);
    if (!integer(start)) {
      throw new HistoryError("invalid-history", "Invalid history version cursor");
    }

    const from = request.fromRevision ?? 0;
    const to = request.toRevision ?? Number.MAX_SAFE_INTEGER;
    const versions = (await transaction.versions())
      .filter((version) => version.revision >= from && version.revision <= to)
      .sort((left, right) => oldest_first(right, left));

    const page: HistoryVersion[] = [];
    let bytes = 0;
    let offset = start;

    for (; offset < versions.length && page.length < request.maxEntries; offset++) {
      const version = versions[offset];
      if (!version) {
        break;
      }

      const size = metadata_bytes(version);
      if (bytes + size > request.maxBytes) {
        if (page.length === 0) {
          throw new HistoryError("capacity", "A history marker exceeds the metadata page limit");
        }

        break;
      }

      page.push(version);
      bytes += size;
    }

    const cursor = offset < versions.length ? { cursor: `${scope}${offset}` } : {};

    return { versions: page, generation: manifest.generation, ...cursor };
  }

  private async list_records(
    transaction: HistoryStorageTransaction,
    request: HistoryListRequest,
    manifest: HistoryManifest,
    kind: HistoryStoredRecord["kind"],
    scope: string,
    after_id: string,
  ): Promise<HistoryListPage> {
    if (after_id !== "" && !validId(after_id)) {
      throw new HistoryError("invalid-history", "Invalid history record cursor");
    }

    // One extra candidate tells whether another page exists.
    const candidates = await transaction.recordPage(kind, after_id, request.maxEntries + 1);

    const records: HistoryRecordMetadata[] = [];
    let bytes = 0;

    for (const candidate of candidates) {
      const size = metadata_bytes(candidate);
      if (records.length === request.maxEntries || bytes + size > request.maxBytes) {
        break;
      }

      records.push(candidate);
      bytes += size;
    }

    if (records.length === 0 && candidates.length > 0) {
      throw new HistoryError("capacity", "A history record exceeds the metadata page ceiling");
    }

    const last = records[records.length - 1];
    const more = last !== undefined && records.length < candidates.length;
    const cursor = more ? { cursor: `${scope}${last.id}` } : {};

    return { versions: [], records, generation: manifest.generation, ...cursor };
  }

  async prune(request: HistoryPruneRequest): Promise<HistoryManifest> {
    return this.transact(request, async (transaction) => {
      const manifest = await transaction.manifest();
      if (manifest.generation !== request.expectedGeneration) {
        throw new HistoryError("conflict", "History manifest advanced before prune");
      }

      await expire_pins(transaction, manifest);

      const target_bytes = request.targetBytes ?? request.limits.maxStorageBytes;
      const versions = (await transaction.versions()).sort(oldest_first);

      for (const version of versions) {
        const explicit = version.id === request.deleteVersionId;
        const expired =
          version.kind === "automatic" &&
          (version.time <= request.beforeTime || manifest.encodedBytes > target_bytes);

        if (explicit || expired) {
          await remove_version(transaction, manifest, version);
        }
      }

      manifest.generation++;
      await transaction.saveManifest(manifest);

      return manifest;
    });
  }
}

interface MemoryDocument {
  manifest: HistoryManifest;
  records: Map<string, StoredHistoryRecord>;
  versions: Map<string, HistoryVersion>;
  pins: Map<string, HistoryReaderPin>;
}

/**
 * Pending writes over one stored map. Reads see the writes; `commit` applies
 * them. A failed transaction drops this object, so the stored map never sees a
 * partial change, and nothing is copied for keys the transaction does not touch.
 */
class PendingMapWrites<T> {
  /** `undefined` marks a deleted key. */
  private readonly writes = new Map<string, T | undefined>();

  constructor(private readonly stored: Map<string, T>) {}

  get(id: string): T | undefined {
    return this.writes.has(id) ? this.writes.get(id) : this.stored.get(id);
  }

  set(id: string, value: T): void {
    this.writes.set(id, value);
  }

  delete(id: string): void {
    this.writes.set(id, undefined);
  }

  *entries(): IterableIterator<[string, T]> {
    for (const [id, value] of this.stored) {
      if (!this.writes.has(id)) {
        yield [id, value];
      }
    }

    for (const [id, value] of this.writes) {
      if (value !== undefined) {
        yield [id, value];
      }
    }
  }

  values(): T[] {
    const values: T[] = [];
    for (const [, value] of this.entries()) {
      values.push(value);
    }

    return values;
  }

  commit(): void {
    for (const [id, value] of this.writes) {
      if (value === undefined) {
        this.stored.delete(id);
      } else {
        this.stored.set(id, value);
      }
    }
  }
}

function empty_manifest(): HistoryManifest {
  return { generation: 0, encodedBytes: 0, recordCount: 0, versionCount: 0, namedVersionCount: 0 };
}

function record_metadata(stored: StoredHistoryRecord): HistoryRecordMetadata {
  return {
    id: stored.record.id,
    kind: stored.record.kind,
    encodedBytes: stored.record.bytes.length,
    decodedBytes: stored.record.decodedBytes,
  };
}

/**
 * In-memory history for one page session and for tests. Transactions run one
 * at a time per adapter and write through `PendingMapWrites`, so a failure or
 * an abort leaves the stored maps unchanged without copying them.
 */
export class MemoryHistoryStorage extends AtomicHistoryStorage {
  private readonly documents = new Map<string, MemoryDocument>();
  private lock = Promise.resolve();

  /** Runs `action` in one atomic transaction over the stored archive; a failure leaves it unchanged. */
  protected async transact<T>(
    request: HistoryStorageRequest,
    action: (transaction: HistoryStorageTransaction) => Promise<T>,
  ): Promise<T> {
    checkAbort(request.signal);

    const previous = this.lock;
    const gate = Promise.withResolvers<void>();
    this.lock = gate.promise;
    await previous;

    try {
      checkAbort(request.signal);

      const current = this.documents.get(request.documentId) ?? {
        manifest: empty_manifest(),
        records: new Map(),
        versions: new Map(),
        pins: new Map(),
      };

      let manifest = structuredClone(current.manifest);
      const records = new PendingMapWrites(current.records);
      const versions = new PendingMapWrites(current.versions);
      const pins = new PendingMapWrites(current.pins);

      const transaction: HistoryStorageTransaction = {
        manifest: async () => structuredClone(manifest),
        saveManifest: async (value) => {
          manifest = value;
        },

        record: async (id) => records.get(id),
        saveRecord: async (value) => {
          records.set(value.record.id, value);
        },
        deleteRecord: async (id) => {
          records.delete(id);
        },
        recordPage: async (kind, after_id, count) => {
          const page: HistoryRecordMetadata[] = [];
          for (const [id, stored] of records.entries()) {
            if (id > after_id && stored.record.kind === kind) {
              page.push(record_metadata(stored));
            }
          }

          page.sort((left, right) => compareCodeUnits(left.id, right.id));
          return page.slice(0, count);
        },

        versions: async () => versions.values(),
        saveVersion: async (version) => {
          versions.set(version.id, version);
        },
        deleteVersion: async (id) => {
          versions.delete(id);
        },

        pins: async () => pins.values(),
        savePin: async (pin) => {
          pins.set(pin.token, pin);
        },
        deletePin: async (token) => {
          pins.delete(token);
        },
      };

      const result = await action(transaction);
      checkAbort(request.signal);

      records.commit();
      versions.commit();
      pins.commit();
      current.manifest = manifest;
      this.documents.set(request.documentId, current);

      return structuredClone(result);
    } finally {
      gate.resolve();
    }
  }
}
