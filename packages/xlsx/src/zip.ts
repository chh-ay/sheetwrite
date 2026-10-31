import { Inflate, Zip, ZipDeflate, type ZipInputFile } from "fflate";

import {
  assertResource,
  boundedErrorText,
  checkAbort,
  isAbort,
  type XlsxCodecContext,
} from "./resources.js";

const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
/** ZIP64 marks a 32-bit size field with this value and moves the real size elsewhere. */
const ZIP64_SIZE = 0xffffffff;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
const DOS_EPOCH = new Date(1980, 0, 1, 0, 0, 0, 0);

export function asciiFold(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

export interface ZipEntry {
  readonly name: string;
  readonly method: 0 | 8;
  readonly flags: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly dataOffset: number;
  readonly localOffset: number;
}

/** Compressed payload and integrity fields, independent of the original ZIP. */
export interface StoredZipEntry {
  readonly method: 0 | 8;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly data: Uint8Array;
}

const CODEC_INPUT_CHUNK_BYTES = 8 * 1024;
const DEFLATE_PUSH_BYTES = 64 * 1024;
/** Entry objects whose exact bytes already passed CRC; objects are never handed to user code. */
const verifiedEntries = new WeakSet<StoredZipEntry>();

/** Record an entry rebuilt from bytes that `preservation.ts` verified earlier in this process. */
export function markStoredEntryVerified(entry: StoredZipEntry): void {
  verifiedEntries.add(entry);
}

/** Build a stored entry when only part of an opaque XML drawing is modelled. */
export function storedEntryFromBytes(data: Uint8Array): StoredZipEntry {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum = (CRC_TABLE[(checksum ^ byte) & 0xff] ?? 0) ^ (checksum >>> 8);
  }

  return {
    method: 0,
    crc32: (checksum ^ 0xffffffff) >>> 0,
    compressedSize: data.length,
    uncompressedSize: data.length,
    data,
  };
}

/** Validate persisted compressed entries without allocating their inflated payload. */
export function validateStoredEntry(entry: StoredZipEntry, context: XlsxCodecContext): void {
  if (
    (entry.method !== 0 && entry.method !== 8) ||
    !Number.isSafeInteger(entry.compressedSize) ||
    entry.compressedSize < 0 ||
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.uncompressedSize < 0 ||
    !Number.isInteger(entry.crc32) ||
    entry.crc32 < 0 ||
    entry.crc32 > 0xffffffff ||
    !(entry.data instanceof Uint8Array) ||
    entry.data.byteLength !== entry.compressedSize
  ) {
    fail("invalid retained entry metadata");
  }
  assertResource(context, "maxEntryUncompressedBytes", entry.uncompressedSize);
  if (entry.uncompressedSize > 0) {
    assertResource(
      context,
      "maxCompressionRatio",
      entry.compressedSize === 0 ? Infinity : entry.uncompressedSize / entry.compressedSize,
    );
  }
  if (entry.method === 0 && entry.compressedSize !== entry.uncompressedSize) {
    fail("retained stored size mismatch");
  }
  if (verifiedEntries.has(entry)) return;
  let written = 0;
  let checksum = 0xffffffff;
  const accept = (chunk: Uint8Array): void => {
    written += chunk.byteLength;
    if (written > entry.uncompressedSize) fail("retained inflated size exceeds declaration");
    for (let index = 0; index < chunk.length; index++) {
      checksum = (CRC_TABLE[(checksum ^ (chunk[index] ?? 0)) & 0xff] ?? 0) ^ (checksum >>> 8);
    }
  };
  const inflater = entry.method === 8 ? new Inflate(accept) : undefined;
  try {
    for (let offset = 0; offset < entry.data.length; offset += CODEC_INPUT_CHUNK_BYTES) {
      checkAbort(context);
      const end = Math.min(entry.data.length, offset + CODEC_INPUT_CHUNK_BYTES);
      const chunk = entry.data.subarray(offset, end);
      if (inflater) inflater.push(chunk, end === entry.data.length);
      else accept(chunk);
    }
    if (inflater && entry.data.length === 0) inflater.push(new Uint8Array(0), true);
  } catch (error) {
    if (isAbort(context, error)) throw error;
    if (error instanceof Error && error.message.startsWith("Sheetwrite:")) throw error;
    throw new TypeError("Sheetwrite: invalid retained ZIP deflate stream", { cause: error });
  }
  if (written !== entry.uncompressedSize) fail("retained inflated size mismatch");
  if ((checksum ^ 0xffffffff) >>> 0 !== entry.crc32) fail("retained CRC mismatch");
  verifiedEntries.add(entry);
}

function fail(message: string, cause?: unknown): never {
  throw new TypeError(
    boundedErrorText(`Sheetwrite: invalid XLSX ZIP: ${message}`),
    cause === undefined ? undefined : { cause },
  );
}

function findEocd(bytes: Uint8Array, view: DataView): number {
  const start = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  for (let offset = bytes.byteLength - 22; offset >= start; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return fail("end-of-central-directory record not found");
}
export function normalizeDecodedPartName(decoded: string, source = decoded): string {
  if (
    decoded.length === 0 ||
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    decoded.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(decoded)
  ) {
    return fail(`unsafe part name ${JSON.stringify(source)}`);
  }
  const segments = decoded.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return fail(`unsafe part name ${JSON.stringify(source)}`);
  }
  return segments.join("/");
}

/** Decode and validate one logical OPC part name without resolving traversal. */
export function normalizePartName(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return fail(`part name ${JSON.stringify(value)} has invalid percent escaping`, error);
  }
  return normalizeDecodedPartName(decoded, value);
}

function* parseEntries(
  bytes: Uint8Array,
  context: XlsxCodecContext,
  baseOffset = 0,
): Generator<{ offset: number; length: number }, ZipEntry[], Uint8Array> {
  if (bytes.byteLength < 22) return fail("archive is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes, view);
  const disk = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const diskEntries = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const commentLength = view.getUint16(eocd + 20, true);
  if (eocd + 22 + commentLength !== bytes.byteLength)
    return fail("trailing or truncated EOCD data");
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) {
    return fail("multi-disk archives are unsupported");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    return fail("ZIP64 archives are unsupported");
  }
  assertResource(context, "maxArchiveEntries", entryCount);
  if (centralOffset + centralSize !== eocd + baseOffset) {
    return fail("central directory bounds are inconsistent");
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset - baseOffset;
  for (let index = 0; index < entryCount; index++) {
    checkAbort(context);
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return fail(`central directory entry ${index} is truncated`);
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localOffset = view.getUint32(offset + 42, true);
    const end = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (end > eocd) return fail(`central directory entry ${index} exceeds its directory`);
    if ((flags & 1) !== 0) return fail("encrypted entries are unsupported");
    if (method !== 0 && method !== 8) return fail(`compression method ${method} is unsupported`);
    if (diskStart !== 0) return fail("multi-disk entry is unsupported");
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      return fail("ZIP64 entry is unsupported");
    }
    let name: string;
    try {
      name = UTF8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return fail(`entry ${index} has an invalid UTF-8 name`, error);
    }
    const directory = name.endsWith("/");
    const normalized = normalizePartName(directory ? name.slice(0, -1) : name);
    name = directory ? `${normalized}/` : normalized;
    const foldedName = asciiFold(normalized);
    if (!directory) {
      if (names.has(foldedName)) return fail(`duplicate logical part name ${name}`);
      names.add(foldedName);
    }
    if (localOffset + 30 + nameLength > centralOffset) {
      return fail(`local header for ${name} is invalid`);
    }
    const localBytes = yield { offset: localOffset, length: 30 + nameLength };
    const localView = new DataView(localBytes.buffer, localBytes.byteOffset, localBytes.byteLength);
    if (localView.getUint32(0, true) !== LOCAL_SIGNATURE) {
      return fail(`local header for ${name} is invalid`);
    }
    const localFlags = localView.getUint16(6, true);
    const localMethod = localView.getUint16(8, true);
    const localNameLength = localView.getUint16(26, true);
    const localExtraLength = localView.getUint16(28, true);
    if (localFlags !== flags || localMethod !== method) return fail(`headers disagree for ${name}`);
    if (localOffset + 30 + localNameLength + localExtraLength > centralOffset) {
      return fail(`local header for ${name} exceeds the file-data area`);
    }
    if (localNameLength !== nameLength) return fail(`local filename length disagrees for ${name}`);
    for (let byte = 0; byte < nameLength; byte++) {
      if (localBytes[30 + byte] !== bytes[offset + 46 + byte]) {
        return fail(`local filename disagrees for ${name}`);
      }
    }
    const localCrc = localView.getUint32(14, true);
    const localCompressedSize = localView.getUint32(18, true);
    const localUncompressedSize = localView.getUint32(22, true);
    if (
      (flags & 8) === 0
        ? localCrc !== crc32 ||
          localCompressedSize !== compressedSize ||
          localUncompressedSize !== uncompressedSize
        : (localCrc !== 0 && localCrc !== crc32) ||
          (localCompressedSize !== 0 && localCompressedSize !== compressedSize) ||
          (localUncompressedSize !== 0 && localUncompressedSize !== uncompressedSize)
    ) {
      return fail(`local sizes or CRC disagree for ${name}`);
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > centralOffset)
      return fail(`compressed data for ${name} is truncated`);
    if (!directory) {
      entries.push({
        name,
        method,
        flags,
        crc32,
        compressedSize,
        uncompressedSize,
        dataOffset,
        localOffset,
      });
    }
    offset = end;
  }
  const localOrder = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 0; index + 1 < localOrder.length; index++) {
    const current = localOrder[index];
    const next = localOrder[index + 1];
    if (!current || !next) return fail("local entry ordering is inconsistent");
    if (current.dataOffset + current.compressedSize > next.localOffset) {
      return fail(`local file records overlap near ${current.name}`);
    }
  }
  if (offset !== eocd) return fail("central directory entry count is inconsistent");
  return entries;
}

/** Reject declared expansion before reading local headers or constructing entry records. */
function preflightExpansion(bytes: Uint8Array, context: XlsxCodecContext): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(bytes, view);
  const entryCount = view.getUint16(eocd + 10, true);
  let offset = 0;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index++) {
    checkAbort(context);
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return fail(`central directory entry ${index} is truncated`);
    }
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    // ZIP64 sentinels are not real sizes; the entry parser reports them as unsupported.
    if (compressedSize !== ZIP64_SIZE && uncompressedSize !== ZIP64_SIZE) {
      assertResource(context, "maxEntryUncompressedBytes", uncompressedSize);
      if (uncompressedSize > 0) {
        assertResource(context, "maxCompressionRatio", uncompressedSize / compressedSize);
      }
      totalUncompressed += uncompressedSize;
      assertResource(context, "maxTotalUncompressedBytes", totalUncompressed);
    }

    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < table.length; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

/** Seekable ZIP reader: only the directory and one requested part are resident. */
export class ZipReader {
  readonly entries: ReadonlyMap<string, ZipEntry>;
  readonly #lookup: ReadonlyMap<string, ZipEntry>;

  private constructor(
    private readonly source: Blob | Uint8Array,
    private readonly context: XlsxCodecContext,
    entries: readonly ZipEntry[],
  ) {
    this.entries = new Map(entries.map((entry) => [entry.name, entry]));
    this.#lookup = new Map(entries.map((entry) => [asciiFold(entry.name), entry]));
  }

  static async open(
    input: Blob | ArrayBuffer | Uint8Array,
    context: XlsxCodecContext,
  ): Promise<ZipReader> {
    const source = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
    const size = source instanceof Uint8Array ? source.byteLength : source.size;
    assertResource(context, "maxInputBytes", size);
    checkAbort(context);
    const readRange = async (offset: number, length: number): Promise<Uint8Array> =>
      source instanceof Uint8Array
        ? source.subarray(offset, offset + length)
        : new Uint8Array(await source.slice(offset, offset + length).arrayBuffer());
    const tailOffset = Math.max(0, size - MAX_EOCD_SEARCH);
    const tail = await readRange(tailOffset, size - tailOffset);
    if (tail.length < 22) return fail("archive is truncated");
    const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    const eocd = findEocd(tail, tailView);
    const centralOffset = tailView.getUint32(eocd + 16, true);
    const centralSize = tailView.getUint32(eocd + 12, true);
    assertResource(context, "maxArchiveEntries", tailView.getUint16(eocd + 10, true));
    if (centralOffset + centralSize !== tailOffset + eocd)
      return fail("central directory bounds are inconsistent");
    const directory = await readRange(centralOffset, size - centralOffset);
    preflightExpansion(directory, context);
    const parser = parseEntries(directory, context, centralOffset);
    let step = parser.next();
    while (!step.done) {
      checkAbort(context);
      step = parser.next(await readRange(step.value.offset, step.value.length));
    }
    return new ZipReader(source, context, step.value);
  }

  has(name: string): boolean {
    return this.#lookup.has(asciiFold(normalizePartName(name)));
  }

  #entry(name: string): ZipEntry {
    const entry = this.#lookup.get(asciiFold(normalizePartName(name)));
    if (!entry)
      throw new TypeError(boundedErrorText(`Sheetwrite: XLSX package is missing ${name}`));
    return entry;
  }

  async #range(offset: number, length: number): Promise<Uint8Array> {
    checkAbort(this.context);
    return this.source instanceof Uint8Array
      ? this.source.subarray(offset, offset + length)
      : new Uint8Array(await this.source.slice(offset, offset + length).arrayBuffer());
  }

  async stored(name: string): Promise<StoredZipEntry> {
    const entry = this.#entry(name);
    const payload = await this.#range(entry.dataOffset, entry.compressedSize);
    return {
      method: entry.method,
      crc32: entry.crc32,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      data: this.source instanceof Uint8Array ? payload.slice() : payload,
    };
  }

  async *chunks(name: string): AsyncGenerator<Uint8Array> {
    const entry = this.#entry(name);
    let written = 0;
    let checksum = 0xffffffff;
    const pending: Uint8Array[] = [];
    const accept = (chunk: Uint8Array): void => {
      written += chunk.length;
      if (written > entry.uncompressedSize) fail(`inflated size exceeds declaration for ${name}`);
      for (let index = 0; index < chunk.length; index++) {
        checksum = (CRC_TABLE[(checksum ^ (chunk[index] ?? 0)) & 0xff] ?? 0) ^ (checksum >>> 8);
      }
      if (chunk.length) pending.push(chunk);
    };
    if (entry.method === 0 && entry.compressedSize !== entry.uncompressedSize)
      fail(`stored size mismatch for ${name}`);
    const inflater = entry.method === 8 ? new Inflate(accept) : undefined;
    const readBytes = 256 * 1024;
    for (let rangeOffset = 0; rangeOffset < entry.compressedSize; rangeOffset += readBytes) {
      const range = await this.#range(
        entry.dataOffset + rangeOffset,
        Math.min(readBytes, entry.compressedSize - rangeOffset),
      );
      for (let offset = 0; offset < range.length; offset += CODEC_INPUT_CHUNK_BYTES) {
        const chunk = range.subarray(offset, offset + CODEC_INPUT_CHUNK_BYTES);
        const isFinal = rangeOffset + offset + chunk.length === entry.compressedSize;
        try {
          if (inflater) inflater.push(chunk, isFinal);
          else accept(chunk);
        } catch (error) {
          if (error instanceof TypeError && error.message.startsWith("Sheetwrite:")) throw error;
          throw new TypeError(
            boundedErrorText(`Sheetwrite: invalid XLSX ZIP: deflate stream for ${name} is corrupt`),
            { cause: error },
          );
        }
        yield* pending;
        pending.length = 0;
      }
    }
    if (inflater && entry.compressedSize === 0) inflater.push(new Uint8Array(0), true);
    if (written !== entry.uncompressedSize) fail(`inflated size mismatch for ${name}`);
    if ((checksum ^ 0xffffffff) >>> 0 !== entry.crc32) fail(`CRC mismatch for ${name}`);
  }

  async read(name: string): Promise<Uint8Array> {
    const output = new Uint8Array(this.#entry(name).uncompressedSize);
    let offset = 0;
    for await (const chunk of this.chunks(name)) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
}

/** Each part's iterator is fully consumed before advancing to the next part. */
export type ZipPart =
  | { readonly name: string; readonly data: Uint8Array | Iterable<Uint8Array> }
  | { readonly name: string; readonly stored: StoredZipEntry };

const ZIP_OUTPUT_CHUNK_BYTES = 64 * 1024;
/** Per-entry header/directory allowance in the pre-compression output bound. */
const ENTRY_OVERHEAD_BYTES = 256;

/** Pull-driven ZIP encoding; pending codec output is drained after each bounded push. */
export function* zipChunks(
  parts: Iterable<ZipPart>,
  context: XlsxCodecContext,
): Generator<Uint8Array> {
  const pending: Uint8Array[] = [];
  let outputBytes = 0;
  let totalBytes = 0;
  const names = new Set<string>();
  const archive = new Zip((error, chunk) => {
    if (error) throw error;
    if (chunk.length === 0) return;
    outputBytes += chunk.length;
    assertResource(context, "maxOutputBytes", outputBytes);
    pending.push(chunk);
  });
  let output = new Uint8Array(ZIP_OUTPUT_CHUNK_BYTES);
  let used = 0;
  /** Coalesce small codec emissions so consumers see full chunks, except the final one. */
  function* drain(final = false): Generator<Uint8Array> {
    for (const chunk of pending) {
      for (let offset = 0; offset < chunk.length;) {
        const count = Math.min(output.length - used, chunk.length - offset);
        output.set(chunk.subarray(offset, offset + count), used);
        offset += count;
        used += count;
        if (used === output.length) {
          yield output;
          output = new Uint8Array(ZIP_OUTPUT_CHUNK_BYTES);
          used = 0;
        }
      }
    }
    pending.length = 0;
    if (final && used > 0) yield output.subarray(0, used);
  }
  try {
    for (const part of parts) {
      checkAbort(context);
      const name = normalizePartName(part.name);
      const folded = asciiFold(name);
      if (names.has(folded)) fail(`duplicate output part ${name}`);
      names.add(folded);
      assertResource(context, "maxArchiveEntries", names.size);
      if ("stored" in part) {
        validateStoredEntry(part.stored, context);
        totalBytes += part.stored.uncompressedSize;
        assertResource(context, "maxTotalUncompressedBytes", totalBytes);
        assertResource(context, "maxOutputBytes", totalBytes + names.size * ENTRY_OVERHEAD_BYTES);
        const file: ZipInputFile = {
          filename: name,
          compression: part.stored.method,
          size: part.stored.uncompressedSize,
          crc: part.stored.crc32,
          mtime: DOS_EPOCH,
        };
        archive.add(file);
        yield* drain();
        if (!file.ondata) throw new Error(`Sheetwrite: ZIP output handler missing for ${name}`);
        const source = part.stored.data;
        const payload =
          source.buffer instanceof ArrayBuffer
            ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
            : new Uint8Array(source);
        for (let offset = 0; offset < payload.length; offset += CODEC_INPUT_CHUNK_BYTES) {
          checkAbort(context);
          file.ondata(null, payload.subarray(offset, offset + CODEC_INPUT_CHUNK_BYTES), false);
          yield* drain();
        }
        file.ondata(null, new Uint8Array(0), true);
      } else {
        const file = new ZipDeflate(name, { level: 6 });
        file.mtime = DOS_EPOCH;
        archive.add(file);
        yield* drain();
        let entryBytes = 0;
        const chunks = part.data instanceof Uint8Array ? [part.data] : part.data;
        for (const chunk of chunks) {
          // fflate emits a Huffman block per push over 8 KiB; larger pushes keep blocks efficient.
          for (let offset = 0; offset < chunk.length; offset += DEFLATE_PUSH_BYTES) {
            checkAbort(context);
            const piece = chunk.subarray(offset, offset + DEFLATE_PUSH_BYTES);
            entryBytes += piece.length;
            totalBytes += piece.length;
            assertResource(context, "maxEntryUncompressedBytes", entryBytes);
            assertResource(context, "maxTotalUncompressedBytes", totalBytes);
            assertResource(
              context,
              "maxOutputBytes",
              totalBytes + names.size * ENTRY_OVERHEAD_BYTES,
            );
            file.push(piece);
            yield* drain();
          }
        }
        file.push(new Uint8Array(0), true);
      }
      yield* drain();
    }
    archive.end();
    yield* drain(true);
  } finally {
    archive.terminate();
  }
}

/**
 * Buffered API: parts are materialized and sorted by name for canonical archives.
 * Streams cannot sort because styles and content types depend on every worksheet.
 */
export function writeZip(
  parts: ReadonlyMap<string, Uint8Array> | Iterable<ZipPart>,
  context: XlsxCodecContext,
): Uint8Array {
  const materialized: ZipPart[] = [];
  const entries =
    parts instanceof Map
      ? [...parts].map(([name, data]) => ({ name, data }))
      : (parts as Iterable<ZipPart>);
  for (const part of entries) {
    if ("stored" in part || part.data instanceof Uint8Array) {
      materialized.push(part);
      continue;
    }
    const pieces = [...part.data];
    const data = new Uint8Array(pieces.reduce((total, piece) => total + piece.length, 0));
    let written = 0;
    for (const piece of pieces) {
      data.set(piece, written);
      written += piece.length;
    }
    materialized.push({ name: part.name, data });
  }
  materialized.sort((left, right) => left.name.localeCompare(right.name));
  const sources: Iterable<ZipPart> = materialized;
  const chunks = [...zipChunks(sources, context)];
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
