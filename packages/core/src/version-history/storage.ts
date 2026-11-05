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
  HistoryPruneRequest,
  HistoryPutRequest,
  HistoryRecordMetadata,
  HistoryStorageAdapter,
  HistoryStorageRequest,
  HistoryStoredRecord,
  HistoryVersion,
} from "./types.js";

const READER_LEASE_MS = 5 * 60 * 1000;
const MAX_REFERENCE_DEPTH = 32;

export interface StoredHistoryRecord {
  record: HistoryStoredRecord;
  owners: number;
}

export interface HistoryReaderPin {
  token: string;
  expires: number;
  version: HistoryVersion;
}

/** Database transaction seam shared by memory and IndexedDB adapters. */
export interface HistoryStorageTransaction {
  manifest(): Promise<HistoryManifest>;
  saveManifest(manifest: HistoryManifest): Promise<void>;
  record(id: string): Promise<StoredHistoryRecord | undefined>;
  saveRecord(value: StoredHistoryRecord): Promise<void>;
  deleteRecord(id: string): Promise<void>;
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

function roots(owner: Pick<HistoryVersion, "checkpoint" | "tail">): string[] {
  return [...new Set([owner.checkpoint, ...owner.tail])];
}

function metadataBytes(value: unknown): number {
  return jsonBytes(value, 4 * 1024 * 1024).length;
}

function checkOwner(owner: Pick<HistoryVersion, "revision" | "checkpoint" | "tail">): void {
  if (
    !integer(owner.revision) ||
    !validId(owner.checkpoint) ||
    !Array.isArray(owner.tail) ||
    owner.tail.length > 100_000 ||
    !owner.tail.every(validId)
  ) {
    throw new HistoryError("invalid-history", "Invalid history revision references");
  }
}

function checkHead(head: HistoryHead): void {
  checkOwner(head);
  for (const value of [
    head.time,
    head.activeMs,
    head.automaticAt,
    head.checkpointAt,
    head.checkpointTransactions,
    head.checkpointLogBytes,
  ]) {
    if (!integer(value))
      throw new HistoryError("invalid-history", "Invalid history recorder cursor");
  }
}

function checkVersion(version: HistoryVersion): void {
  checkOwner(version);
  if (
    !validId(version.id) ||
    !integer(version.time) ||
    typeof version.authorId !== "string" ||
    version.authorId.length === 0 ||
    version.authorId.length > 256 ||
    !["named", "automatic"].includes(version.kind) ||
    (version.kind === "named" &&
      (typeof version.name !== "string" ||
        version.name.trim().length === 0 ||
        version.name.length > 256))
  ) {
    throw new HistoryError("invalid-history", "Invalid history version marker");
  }
}

async function retain(
  transaction: HistoryStorageTransaction,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids) {
    const stored = await transaction.record(id);
    if (!stored)
      throw new HistoryError("integrity", "Published history references a missing record");
    await transaction.saveRecord({ ...stored, owners: stored.owners + 1 });
  }
}

async function release(
  transaction: HistoryStorageTransaction,
  ids: readonly string[],
  manifest: HistoryManifest,
  depth = 0,
): Promise<void> {
  if (depth > MAX_REFERENCE_DEPTH)
    throw new HistoryError("integrity", "History dependency graph is too deep");
  for (const id of ids) {
    const stored = await transaction.record(id);
    if (!stored || stored.owners <= 0)
      throw new HistoryError("integrity", "Invalid history reference count");
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

async function expirePins(
  transaction: HistoryStorageTransaction,
  manifest: HistoryManifest,
): Promise<void> {
  const now = Date.now();
  for (const pin of await transaction.pins()) {
    if (pin.expires > now) continue;
    await release(transaction, roots(pin.version), manifest);
    await transaction.deletePin(pin.token);
    manifest.encodedBytes -= metadataBytes(pin);
  }
}

async function removeVersion(
  transaction: HistoryStorageTransaction,
  manifest: HistoryManifest,
  version: HistoryVersion,
): Promise<void> {
  await transaction.deleteVersion(version.id);
  manifest.versionCount--;
  if (version.kind === "named") manifest.namedVersionCount--;
  manifest.encodedBytes -= metadataBytes(version);
  await release(transaction, roots(version), manifest);
}

/** Atomic publication and reference-counted retention shared by both supplied adapters. */
export abstract class AtomicHistoryStorage implements HistoryStorageAdapter {
  protected abstract transact<T>(
    request: HistoryStorageRequest,
    action: (transaction: HistoryStorageTransaction) => Promise<T>,
  ): Promise<T>;

  async put(input: HistoryPutRequest): Promise<HistoryManifest> {
    checkAbort(input.signal);
    if (input.kind === "publish") {
      const payloadBytes = input.records.reduce((total, record) => total + record.bytes.length, 0);
      if (payloadBytes > input.limits.maxWorkingBytes / 2 || input.records.length > 100_000) {
        throw new HistoryError(
          "capacity",
          "History publication exceeds the working-set reservation",
        );
      }
    }
    // Capture before the first await: a host must not mutate already-verified bytes in flight.
    const request: HistoryPutRequest =
      input.kind === "publish"
        ? {
            ...input,
            records: structuredClone(input.records),
            head: structuredClone(input.head),
            version: structuredClone(input.version),
          }
        : { ...input };
    if (request.kind === "publish") {
      let submittedBytes = 0;
      for (const record of request.records) {
        await checkRecord(record, request.limits);
        submittedBytes += recordBytes(record);
      }
      if (submittedBytes > request.limits.maxSnapshotBytes + request.limits.maxTransactionBytes) {
        throw new HistoryError("capacity", "One history publication exceeds its byte ceiling");
      }
      if (request.head) checkHead(request.head);
      if (request.version) checkVersion(request.version);
    }

    return this.transact(request, async (transaction) => {
      const manifest = await transaction.manifest();
      await expirePins(transaction, manifest);
      if (request.kind !== "publish") {
        const pins = await transaction.pins();
        const existing = pins.find((pin) => pin.token === request.token);
        if (request.kind === "release") {
          if (existing) {
            await release(transaction, roots(existing.version), manifest);
            await transaction.deletePin(existing.token);
            manifest.encodedBytes -= metadataBytes(existing);
          }
        } else {
          if (pins.length >= 32)
            throw new HistoryError("capacity", "Too many concurrent history readers");
          if (existing || request.token.length > 256)
            throw new HistoryError("invalid-history", "Invalid history reader token");
          const version = (await transaction.versions()).find(
            (candidate) => candidate.id === request.versionId,
          );
          if (!version) throw new HistoryError("not-found", "History version does not exist");
          const pin = { token: request.token, expires: Date.now() + READER_LEASE_MS, version };
          await retain(transaction, roots(version));
          await transaction.savePin(pin);
          manifest.encodedBytes += metadataBytes(pin);
        }
        await transaction.saveManifest(manifest);
        return manifest;
      }

      if (manifest.generation !== request.expectedGeneration)
        throw new HistoryError("conflict", "History manifest advanced");
      const inserted: string[] = [];
      for (const record of request.records) {
        const existing = await transaction.record(record.id);
        if (existing) continue;
        // Children must already exist, so an immutable publication cannot form a cycle.
        await retain(transaction, record.references);
        await transaction.saveRecord({ record, owners: 0 });
        inserted.push(record.id);
        manifest.recordCount++;
        manifest.encodedBytes += recordBytes(record);
      }
      if (request.head) {
        if (manifest.head && request.head.revision < manifest.head.revision)
          throw new HistoryError("conflict", "History head cannot move backwards");
        await retain(transaction, roots(request.head));
        if (manifest.head) {
          await release(transaction, roots(manifest.head), manifest);
          manifest.encodedBytes -= metadataBytes(manifest.head);
        }
        manifest.head = structuredClone(request.head);
        manifest.encodedBytes += metadataBytes(request.head);
      }
      if (request.version) {
        const versions = await transaction.versions();
        const duplicate = versions.find((version) => version.id === request.version?.id);
        if (duplicate) {
          if (JSON.stringify(duplicate) !== JSON.stringify(request.version))
            throw new HistoryError("integrity", "History marker ID was reused");
        } else {
          if (!manifest.head || request.version.revision > manifest.head.revision)
            throw new HistoryError("invalid-history", "Version is ahead of the history head");
          await retain(transaction, roots(request.version));
          await transaction.saveVersion(structuredClone(request.version));
          manifest.versionCount++;
          if (request.version.kind === "named") manifest.namedVersionCount++;
          manifest.encodedBytes += metadataBytes(request.version);
        }
      }
      for (const id of inserted) {
        const stored = await transaction.record(id);
        if (stored?.owners === 0)
          throw new HistoryError("invalid-history", "Publication includes an unreachable record");
      }
      const automatic = (await transaction.versions())
        .filter((version) => version.kind === "automatic")
        .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
      const expiresBefore = (manifest.head?.time ?? 0) - request.limits.maxAgeMs;
      for (const version of automatic) {
        if (
          version.time >= expiresBefore &&
          manifest.encodedBytes <= request.limits.maxStorageBytes &&
          manifest.versionCount <= request.limits.maxVersions
        )
          break;
        await removeVersion(transaction, manifest, version);
      }
      if (
        manifest.namedVersionCount > request.limits.maxNamedVersions ||
        manifest.versionCount > request.limits.maxVersions ||
        manifest.encodedBytes > request.limits.maxStorageBytes
      ) {
        throw new HistoryError(
          "capacity",
          "Pinned history or the current head exceeds archive capacity",
        );
      }
      manifest.generation++;
      checkAbort(request.signal);
      await transaction.saveManifest(manifest);
      return manifest;
    });
  }

  async get(
    request: HistoryGetRequest,
  ): Promise<HistoryManifest | HistoryVersion | HistoryStoredRecord> {
    return this.transact(request, async (transaction) => {
      if (request.kind === "manifest") return transaction.manifest();
      if (request.kind === "version") {
        const version = (await transaction.versions()).find(
          (candidate) => candidate.id === request.id,
        );
        if (!version) throw new HistoryError("not-found", "History version does not exist");
        return version;
      }
      if (!integer(request.maxBytes) || request.maxBytes === 0)
        throw new HistoryError("invalid-history", "A positive read byte ceiling is required");
      if (request.pin) {
        const pin = (await transaction.pins()).find((candidate) => candidate.token === request.pin);
        if (!pin || pin.expires <= Date.now())
          throw new HistoryError("conflict", "History reader lease expired");
        await transaction.savePin({ ...pin, expires: Date.now() + READER_LEASE_MS });
      }
      const stored = await transaction.record(request.id);
      if (!stored) throw new HistoryError("not-found", "History record does not exist");
      if (stored.record.bytes.length > request.maxBytes)
        throw new HistoryError("capacity", "History read exceeds its byte ceiling");
      return structuredClone(stored.record);
    });
  }

  async list(request: HistoryListRequest): Promise<HistoryListPage> {
    if (
      !integer(request.maxEntries) ||
      request.maxEntries === 0 ||
      request.maxEntries > request.limits.maxPageEntries ||
      !integer(request.maxBytes) ||
      request.maxBytes === 0 ||
      request.maxBytes > request.limits.maxPageBytes
    ) {
      throw new HistoryError("capacity", "History metadata page exceeds its bounds");
    }
    if (
      (request.fromRevision !== undefined && !integer(request.fromRevision)) ||
      (request.toRevision !== undefined && !integer(request.toRevision))
    ) {
      throw new HistoryError("invalid-history", "Invalid history listing revision interval");
    }
    return this.transact(request, async (transaction) => {
      const manifest = await transaction.manifest();
      const kind = request.kind ?? "versions";
      let position = "0";
      const cursorScope = `${kind}:${request.fromRevision ?? 0}:${request.toRevision ?? "head"}`;
      if (request.cursor) {
        const prefix = `${manifest.generation}:${cursorScope}:`;
        if (!request.cursor.startsWith(prefix))
          throw new HistoryError(
            "conflict",
            "History metadata cursor is stale or belongs to another listing",
          );
        position = request.cursor.slice(prefix.length);
      }
      if (kind !== "versions") {
        const afterId = position === "0" ? "" : position;
        if (afterId && !validId(afterId))
          throw new HistoryError("invalid-history", "Invalid history record cursor");
        const candidates = await transaction.recordPage(kind, afterId, request.maxEntries + 1);
        const records: HistoryRecordMetadata[] = [];
        let bytes = 0;
        for (const candidate of candidates) {
          const size = metadataBytes(candidate);
          if (records.length === request.maxEntries || bytes + size > request.maxBytes) break;
          records.push(candidate);
          bytes += size;
        }
        if (records.length === 0 && candidates.length > 0)
          throw new HistoryError("capacity", "A history record exceeds the metadata page ceiling");
        const last = records[records.length - 1];
        return {
          versions: [],
          records,
          generation: manifest.generation,
          ...(last && records.length < candidates.length
            ? { cursor: `${manifest.generation}:${cursorScope}:${last.id}` }
            : {}),
        };
      }
      const offsetValue = Number(position);
      if (!integer(offsetValue))
        throw new HistoryError("invalid-history", "Invalid history version cursor");
      let offset = offsetValue;
      const versions = (await transaction.versions())
        .filter(
          (version) =>
            version.revision >= (request.fromRevision ?? 0) &&
            version.revision <= (request.toRevision ?? Number.MAX_SAFE_INTEGER),
        )
        .sort((left, right) => right.time - left.time || right.id.localeCompare(left.id));
      const page: HistoryVersion[] = [];
      let bytes = 0;
      while (offset < versions.length && page.length < request.maxEntries) {
        const version = versions[offset];
        if (!version) break;
        const size = metadataBytes(version);
        if (bytes + size > request.maxBytes) {
          if (page.length === 0)
            throw new HistoryError("capacity", "A history marker exceeds the metadata page limit");
          break;
        }
        page.push(version);
        bytes += size;
        offset++;
      }
      return {
        versions: page,
        generation: manifest.generation,
        ...(offset < versions.length
          ? { cursor: `${manifest.generation}:${cursorScope}:${offset}` }
          : {}),
      };
    });
  }

  async prune(request: HistoryPruneRequest): Promise<HistoryManifest> {
    return this.transact(request, async (transaction) => {
      const manifest = await transaction.manifest();
      if (manifest.generation !== request.expectedGeneration)
        throw new HistoryError("conflict", "History manifest advanced before prune");
      await expirePins(transaction, manifest);
      const versions = (await transaction.versions()).sort(
        (left, right) => left.time - right.time || left.id.localeCompare(right.id),
      );
      for (const version of versions) {
        const explicit = version.id === request.deleteVersionId;
        const automatic =
          version.kind === "automatic" &&
          (version.time <= request.beforeTime ||
            manifest.encodedBytes > (request.targetBytes ?? request.limits.maxStorageBytes));
        if (explicit || automatic) await removeVersion(transaction, manifest, version);
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

class HistoryMapWrites<T> {
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

  values(): T[] {
    const values: T[] = [];
    for (const [id, value] of this.stored) {
      if (!this.writes.has(id)) values.push(value);
    }
    for (const value of this.writes.values()) {
      if (value !== undefined) values.push(value);
    }
    return values;
  }

  *entries(): IterableIterator<[string, T]> {
    for (const [id, value] of this.stored) {
      if (!this.writes.has(id)) yield [id, value];
    }
    for (const [id, value] of this.writes) {
      if (value !== undefined) yield [id, value];
    }
  }

  commit(): void {
    for (const [id, value] of this.writes) {
      if (value === undefined) this.stored.delete(id);
      else this.stored.set(id, value);
    }
  }
}

function emptyManifest(): HistoryManifest {
  return { generation: 0, encodedBytes: 0, recordCount: 0, versionCount: 0, namedVersionCount: 0 };
}

/** Bounded session storage. Transactions use copy-on-write maps, not workbook copies. */
export class MemoryHistoryStorage extends AtomicHistoryStorage {
  private readonly documents = new Map<string, MemoryDocument>();
  private lock = Promise.resolve();

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
        manifest: emptyManifest(),
        records: new Map(),
        versions: new Map(),
        pins: new Map(),
      };
      let manifest = structuredClone(current.manifest);
      const records = new HistoryMapWrites(current.records);
      const versions = new HistoryMapWrites(current.versions);
      const pins = new HistoryMapWrites(current.pins);
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
        recordPage: async (kind, afterId, count) => {
          const page: HistoryRecordMetadata[] = [];
          for (const [id, stored] of records.entries()) {
            if (id <= afterId || stored.record.kind !== kind) continue;
            page.push({
              id,
              kind,
              encodedBytes: stored.record.bytes.length,
              decodedBytes: stored.record.decodedBytes,
            });
            page.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
            if (page.length > count) page.pop();
          }
          return page;
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
