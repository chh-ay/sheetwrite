import { Deflate, Inflate, Zip, type ZipInputFile } from "fflate";

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
const verified_entries = new WeakSet<StoredZipEntry>();

/** Record an entry rebuilt from bytes that `preservation.ts` verified earlier in this process. */
export function markStoredEntryVerified(entry: StoredZipEntry): void {
  verified_entries.add(entry);
}

/** Build a stored entry when only part of an opaque XML drawing is modelled. */
export function storedEntryFromBytes(data: Uint8Array): StoredZipEntry {
  return {
    method: 0,
    crc32: (update_crc32(0xffffffff, data) ^ 0xffffffff) >>> 0,
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
  if (verified_entries.has(entry)) return;
  let written = 0;
  let checksum = 0xffffffff;
  const accept = (chunk: Uint8Array): void => {
    written += chunk.byteLength;
    if (written > entry.uncompressedSize) fail("retained inflated size exceeds declaration");
    checksum = update_crc32(checksum, chunk);
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
  verified_entries.add(entry);
}

function fail(message: string, cause?: unknown): never {
  throw new TypeError(
    boundedErrorText(`Sheetwrite: invalid XLSX ZIP: ${message}`),
    cause === undefined ? undefined : { cause },
  );
}

function find_eocd(bytes: Uint8Array, view: DataView): number {
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

function* parse_entries(
  bytes: Uint8Array,
  context: XlsxCodecContext,
  base_offset = 0,
): Generator<{ offset: number; length: number }, ZipEntry[], Uint8Array> {
  if (bytes.byteLength < 22) return fail("archive is truncated");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = find_eocd(bytes, view);
  const disk = view.getUint16(eocd + 4, true);
  const central_disk = view.getUint16(eocd + 6, true);
  const disk_entries = view.getUint16(eocd + 8, true);
  const entry_count = view.getUint16(eocd + 10, true);
  const central_size = view.getUint32(eocd + 12, true);
  const central_offset = view.getUint32(eocd + 16, true);
  const comment_length = view.getUint16(eocd + 20, true);
  if (eocd + 22 + comment_length !== bytes.byteLength)
    return fail("trailing or truncated EOCD data");
  if (disk !== 0 || central_disk !== 0 || disk_entries !== entry_count) {
    return fail("multi-disk archives are unsupported");
  }
  if (entry_count === 0xffff || central_size === 0xffffffff || central_offset === 0xffffffff) {
    return fail("ZIP64 archives are unsupported");
  }
  assertResource(context, "maxArchiveEntries", entry_count);
  if (central_offset + central_size !== eocd + base_offset) {
    return fail("central directory bounds are inconsistent");
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let offset = central_offset - base_offset;
  for (let index = 0; index < entry_count; index++) {
    checkAbort(context);
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return fail(`central directory entry ${index} is truncated`);
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressed_size = view.getUint32(offset + 20, true);
    const uncompressed_size = view.getUint32(offset + 24, true);
    const name_length = view.getUint16(offset + 28, true);
    const extra_length = view.getUint16(offset + 30, true);
    const entry_comment_length = view.getUint16(offset + 32, true);
    const disk_start = view.getUint16(offset + 34, true);
    const local_offset = view.getUint32(offset + 42, true);
    const end = offset + 46 + name_length + extra_length + entry_comment_length;
    if (end > eocd) return fail(`central directory entry ${index} exceeds its directory`);
    if ((flags & 1) !== 0) return fail("encrypted entries are unsupported");
    if (method !== 0 && method !== 8) return fail(`compression method ${method} is unsupported`);
    if (disk_start !== 0) return fail("multi-disk entry is unsupported");
    if (
      compressed_size === 0xffffffff ||
      uncompressed_size === 0xffffffff ||
      local_offset === 0xffffffff
    ) {
      return fail("ZIP64 entry is unsupported");
    }
    let name: string;
    try {
      name = UTF8.decode(bytes.subarray(offset + 46, offset + 46 + name_length));
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return fail(`entry ${index} has an invalid UTF-8 name`, error);
    }
    const directory = name.endsWith("/");
    const normalized = normalizePartName(directory ? name.slice(0, -1) : name);
    name = directory ? `${normalized}/` : normalized;
    const folded_name = asciiFold(normalized);
    if (!directory) {
      if (names.has(folded_name)) return fail(`duplicate logical part name ${name}`);
      names.add(folded_name);
    }
    if (local_offset + 30 + name_length > central_offset) {
      return fail(`local header for ${name} is invalid`);
    }
    const local_bytes = yield { offset: local_offset, length: 30 + name_length };
    const local_view = new DataView(
      local_bytes.buffer,
      local_bytes.byteOffset,
      local_bytes.byteLength,
    );
    if (local_view.getUint32(0, true) !== LOCAL_SIGNATURE) {
      return fail(`local header for ${name} is invalid`);
    }
    const local_flags = local_view.getUint16(6, true);
    const local_method = local_view.getUint16(8, true);
    const local_name_length = local_view.getUint16(26, true);
    const local_extra_length = local_view.getUint16(28, true);
    if (local_flags !== flags || local_method !== method)
      return fail(`headers disagree for ${name}`);
    if (local_offset + 30 + local_name_length + local_extra_length > central_offset) {
      return fail(`local header for ${name} exceeds the file-data area`);
    }
    if (local_name_length !== name_length)
      return fail(`local filename length disagrees for ${name}`);
    for (let byte = 0; byte < name_length; byte++) {
      if (local_bytes[30 + byte] !== bytes[offset + 46 + byte]) {
        return fail(`local filename disagrees for ${name}`);
      }
    }
    const local_crc = local_view.getUint32(14, true);
    const local_compressed_size = local_view.getUint32(18, true);
    const local_uncompressed_size = local_view.getUint32(22, true);
    if (
      (flags & 8) === 0
        ? local_crc !== crc32 ||
          local_compressed_size !== compressed_size ||
          local_uncompressed_size !== uncompressed_size
        : (local_crc !== 0 && local_crc !== crc32) ||
          (local_compressed_size !== 0 && local_compressed_size !== compressed_size) ||
          (local_uncompressed_size !== 0 && local_uncompressed_size !== uncompressed_size)
    ) {
      return fail(`local sizes or CRC disagree for ${name}`);
    }
    const data_offset = local_offset + 30 + local_name_length + local_extra_length;
    if (data_offset + compressed_size > central_offset)
      return fail(`compressed data for ${name} is truncated`);
    if (!directory) {
      entries.push({
        name,
        method,
        flags,
        crc32,
        compressedSize: compressed_size,
        uncompressedSize: uncompressed_size,
        dataOffset: data_offset,
        localOffset: local_offset,
      });
    }
    offset = end;
  }
  const local_order = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 0; index + 1 < local_order.length; index++) {
    const current = local_order[index];
    const next = local_order[index + 1];
    if (!current || !next) return fail("local entry ordering is inconsistent");
    if (current.dataOffset + current.compressedSize > next.localOffset) {
      return fail(`local file records overlap near ${current.name}`);
    }
  }
  if (offset !== eocd) return fail("central directory entry count is inconsistent");
  return entries;
}

/** Reject declared expansion before reading local headers or constructing entry records. */
function preflight_expansion(bytes: Uint8Array, context: XlsxCodecContext): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = find_eocd(bytes, view);
  const entry_count = view.getUint16(eocd + 10, true);
  let offset = 0;
  let total_uncompressed = 0;

  for (let index = 0; index < entry_count; index++) {
    checkAbort(context);
    if (offset + 46 > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return fail(`central directory entry ${index} is truncated`);
    }
    const compressed_size = view.getUint32(offset + 20, true);
    const uncompressed_size = view.getUint32(offset + 24, true);
    // ZIP64 sentinels are not real sizes; the entry parser reports them as unsupported.
    if (compressed_size !== ZIP64_SIZE && uncompressed_size !== ZIP64_SIZE) {
      assertResource(context, "maxEntryUncompressedBytes", uncompressed_size);
      if (uncompressed_size > 0) {
        assertResource(context, "maxCompressionRatio", uncompressed_size / compressed_size);
      }
      total_uncompressed += uncompressed_size;
      assertResource(context, "maxTotalUncompressedBytes", total_uncompressed);
    }

    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

/** Slice-by-8 CRC-32 tables: table `k` holds the CRC of a byte followed by `k` zero bytes. */
const CRC_TABLES = (() => {
  const tables = new Uint32Array(8 * 256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    tables[n] = value;
  }
  for (let index = 256; index < tables.length; index++) {
    const previous = tables[index - 256] ?? 0;
    tables[index] = (previous >>> 8) ^ (tables[previous & 0xff] ?? 0);
  }
  return tables;
})();

/** Continue a CRC-32 register over `data`; start at `0xffffffff` and invert the result. */
function update_crc32(checksum: number, data: Uint8Array): number {
  const table = CRC_TABLES;
  let index = 0;
  for (const end = data.length - 7; index < end; index += 8) {
    const word =
      checksum ^
      ((data[index] ?? 0) |
        ((data[index + 1] ?? 0) << 8) |
        ((data[index + 2] ?? 0) << 16) |
        ((data[index + 3] ?? 0) << 24));
    checksum =
      (table[1792 + (word & 0xff)] ?? 0) ^
      (table[1536 + ((word >>> 8) & 0xff)] ?? 0) ^
      (table[1280 + ((word >>> 16) & 0xff)] ?? 0) ^
      (table[1024 + (word >>> 24)] ?? 0) ^
      (table[768 + (data[index + 4] ?? 0)] ?? 0) ^
      (table[512 + (data[index + 5] ?? 0)] ?? 0) ^
      (table[256 + (data[index + 6] ?? 0)] ?? 0) ^
      (table[data[index + 7] ?? 0] ?? 0);
  }
  for (; index < data.length; index++) {
    checksum = (table[(checksum ^ (data[index] ?? 0)) & 0xff] ?? 0) ^ (checksum >>> 8);
  }
  return checksum;
}

let native_inflate: boolean | undefined;

/** Bun, Node 20.12+, Chrome 103+, Firefox 113+ and Safari 16.4+ inflate raw deflate natively. */
function has_native_inflate(): boolean {
  if (native_inflate === undefined) {
    try {
      native_inflate = new DecompressionStream("deflate-raw") instanceof DecompressionStream;
    } catch {
      native_inflate = false;
    }
  }
  return native_inflate;
}

/** The runtime's raw deflate stream, or undefined where the runtime has none. */
function native_deflate(): CompressionStream | undefined {
  try {
    return new CompressionStream("deflate-raw");
  } catch {
    return undefined;
  }
}

/**
 * Run `input` through the runtime's zlib. The stream pulls the next input chunk only after its
 * output is read, so one chunk bounds the output that the caller has not checked yet.
 */
async function* pipe_native(
  stream: CompressionStream | DecompressionStream,
  input: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  void (async () => {
    try {
      for await (const chunk of input) {
        // Web streams take no views of shared memory.
        const { buffer, byteOffset: byte_offset, byteLength: byte_length } = chunk;
        await writer.write(
          buffer instanceof ArrayBuffer
            ? new Uint8Array(buffer, byte_offset, byte_length)
            : chunk.slice(),
        );
      }
      await writer.close();
    } catch (error) {
      // An input failure (an abort, a limit or a read error) reaches the reader through the abort.
      await writer.abort(error).catch(() => undefined);
    }
  })();
  try {
    for (let step = await reader.read(); !step.done; step = await reader.read()) {
      yield step.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Deflate at fflate level 6: the default, and the `native` compression where the runtime has no
 * `CompressionStream`.
 */
function* deflate_fflate(input: Iterable<Uint8Array>): Generator<Uint8Array<ArrayBuffer>> {
  const pending: Uint8Array<ArrayBuffer>[] = [];
  const deflater = new Deflate({ level: 6 }, (chunk) => {
    pending.push(chunk);
  });
  for (const piece of input) {
    deflater.push(piece);
    yield* pending;
    pending.length = 0;
  }
  deflater.push(new Uint8Array(0), true);
  yield* pending;
}

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
    const read_range = async (offset: number, length: number): Promise<Uint8Array> =>
      source instanceof Uint8Array
        ? source.subarray(offset, offset + length)
        : new Uint8Array(await source.slice(offset, offset + length).arrayBuffer());
    const tail_offset = Math.max(0, size - MAX_EOCD_SEARCH);
    const tail = await read_range(tail_offset, size - tail_offset);
    if (tail.length < 22) return fail("archive is truncated");
    const tail_view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    const eocd = find_eocd(tail, tail_view);
    const central_offset = tail_view.getUint32(eocd + 16, true);
    const central_size = tail_view.getUint32(eocd + 12, true);
    assertResource(context, "maxArchiveEntries", tail_view.getUint16(eocd + 10, true));
    if (central_offset + central_size !== tail_offset + eocd)
      return fail("central directory bounds are inconsistent");
    const directory = await read_range(central_offset, size - central_offset);
    preflight_expansion(directory, context);
    const parser = parse_entries(directory, context, central_offset);
    let step = parser.next();
    while (!step.done) {
      checkAbort(context);
      step = parser.next(await read_range(step.value.offset, step.value.length));
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
    if (entry.method === 0 && entry.compressedSize !== entry.uncompressedSize)
      fail(`stored size mismatch for ${name}`);
    let written = 0;
    let checksum = 0xffffffff;
    const data = entry.method === 8 ? this.#inflate(entry, name) : this.#payload(entry);
    for await (const chunk of data) {
      written += chunk.length;
      if (written > entry.uncompressedSize) fail(`inflated size exceeds declaration for ${name}`);
      checksum = update_crc32(checksum, chunk);
      yield chunk;
    }
    if (written !== entry.uncompressedSize) fail(`inflated size mismatch for ${name}`);
    if ((checksum ^ 0xffffffff) >>> 0 !== entry.crc32) fail(`CRC mismatch for ${name}`);
  }

  /** The compressed bytes of an entry, in codec input slices. */
  async *#payload(entry: ZipEntry): AsyncGenerator<Uint8Array> {
    const read_bytes = 256 * 1024;
    for (let range_offset = 0; range_offset < entry.compressedSize; range_offset += read_bytes) {
      const range = await this.#range(
        entry.dataOffset + range_offset,
        Math.min(read_bytes, entry.compressedSize - range_offset),
      );
      for (let offset = 0; offset < range.length; offset += CODEC_INPUT_CHUNK_BYTES) {
        yield range.subarray(offset, offset + CODEC_INPUT_CHUNK_BYTES);
      }
    }
  }

  /**
   * Native zlib inflates when the runtime has it. When zlib rejects a stream, fflate inflates it
   * again and decides, so accepted input and error text do not depend on the runtime.
   */
  async *#inflate(entry: ZipEntry, name: string): AsyncGenerator<Uint8Array> {
    let produced = 0;
    if (has_native_inflate()) {
      try {
        for await (const chunk of pipe_native(
          new DecompressionStream("deflate-raw"),
          this.#payload(entry),
        )) {
          produced += chunk.length;
          yield chunk;
        }
        return;
      } catch (error) {
        if (isAbort(this.context, error)) throw error;
      }
    }
    // fflate output repeats the bytes that zlib produced before it failed; skip them.
    let skip = produced;
    const pending: Uint8Array[] = [];
    const inflater = new Inflate((chunk) => {
      if (skip >= chunk.length) {
        skip -= chunk.length;
      } else {
        pending.push(chunk.subarray(skip));
        skip = 0;
      }
    });
    let consumed = 0;
    const push = (chunk: Uint8Array): void => {
      consumed += chunk.length;
      try {
        inflater.push(chunk, consumed === entry.compressedSize);
      } catch (error) {
        fail(`deflate stream for ${name} is corrupt`, error);
      }
    };
    if (entry.compressedSize === 0) push(new Uint8Array(0));
    for await (const chunk of this.#payload(entry)) {
      push(chunk);
      yield* pending;
      pending.length = 0;
    }
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

/** A part `writeZip` deflated as the writer produced it, before the parts are sorted. */
interface DeflatedPart {
  readonly name: string;
  readonly deflated: {
    readonly chunks: readonly Uint8Array<ArrayBuffer>[];
    readonly crc: number;
    /** The uncompressed size. */
    readonly size: number;
  };
}

const ZIP_OUTPUT_CHUNK_BYTES = 64 * 1024;
/** Per-entry header/directory allowance in the pre-compression output bound. */
const ENTRY_OVERHEAD_BYTES = 256;

/** Pull-driven ZIP encoding; pending codec output is drained after each bounded push. */
export function zipChunks(
  parts: Iterable<ZipPart>,
  context: XlsxCodecContext,
): AsyncGenerator<Uint8Array> {
  return zip_parts(parts, context);
}

async function* zip_parts(
  parts: Iterable<ZipPart | DeflatedPart>,
  context: XlsxCodecContext,
): AsyncGenerator<Uint8Array> {
  const pending: Uint8Array[] = [];
  let output_bytes = 0;
  let total_bytes = 0;
  const names = new Set<string>();
  const archive = new Zip((error, chunk) => {
    if (error) throw error;
    if (chunk.length === 0) return;
    output_bytes += chunk.length;
    assertResource(context, "maxOutputBytes", output_bytes);
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
        total_bytes += part.stored.uncompressedSize;
        assertResource(context, "maxTotalUncompressedBytes", total_bytes);
        assertResource(context, "maxOutputBytes", total_bytes + names.size * ENTRY_OVERHEAD_BYTES);
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
        const file: ZipInputFile = {
          filename: name,
          compression: 8,
          size: 0,
          crc: 0,
          mtime: DOS_EPOCH,
        };
        archive.add(file);
        yield* drain();
        if (!file.ondata) throw new Error(`Sheetwrite: ZIP output handler missing for ${name}`);
        let entry_bytes = 0;
        let checksum = 0xffffffff;
        /** The codec takes each piece only after the limits allow it. */
        const admit = (piece: number): void => {
          checkAbort(context);
          entry_bytes += piece;
          total_bytes += piece;
          assertResource(context, "maxEntryUncompressedBytes", entry_bytes);
          assertResource(context, "maxTotalUncompressedBytes", total_bytes);
          assertResource(
            context,
            "maxOutputBytes",
            total_bytes + names.size * ENTRY_OVERHEAD_BYTES,
          );
        };
        let compressed: AsyncIterable<Uint8Array<ArrayBuffer>> | Iterable<Uint8Array<ArrayBuffer>>;
        if ("deflated" in part) {
          // The pieces it was deflated in pass the same checks, in archive order.
          const { size } = part.deflated;
          for (let offset = 0; offset < size; offset += DEFLATE_PUSH_BYTES) {
            admit(Math.min(DEFLATE_PUSH_BYTES, size - offset));
          }
          checksum = part.deflated.crc ^ 0xffffffff;
          compressed = part.deflated.chunks;
        } else {
          const chunks = part.data instanceof Uint8Array ? [part.data] : part.data;
          const pieces = function* (): Generator<Uint8Array> {
            for (const chunk of chunks) {
              // fflate emits a Huffman block per push over 8 KiB; larger pushes keep blocks efficient.
              for (let offset = 0; offset < chunk.length; offset += DEFLATE_PUSH_BYTES) {
                const piece = chunk.subarray(offset, offset + DEFLATE_PUSH_BYTES);
                admit(piece.length);
                checksum = update_crc32(checksum, piece);
                yield piece;
              }
            }
          };
          // fflate is the default: its bytes are the same in every runtime.
          const native = context.options?.compression === "native" ? native_deflate() : undefined;
          compressed = native ? pipe_native(native, pieces()) : deflate_fflate(pieces());
        }
        for await (const chunk of compressed) {
          file.ondata(null, chunk, false);
          yield* drain();
        }
        file.crc = (checksum ^ 0xffffffff) >>> 0;
        file.size = entry_bytes;
        file.ondata(null, new Uint8Array(0), true);
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
 * Cut `data` into the DEFLATE_PUSH_BYTES pieces `zipChunks` pushes for one
 * buffer of the same bytes, so the codec emits the same stream. A piece that
 * spans chunks is copied; with `reuse`, always into the same buffer, which the
 * consumer must read before it takes the next piece.
 */
function* buffer_pieces(data: Iterable<Uint8Array>, reuse: boolean): Generator<Uint8Array> {
  let staged = new Uint8Array(0);
  let used = 0;
  for (const chunk of data) {
    let offset = 0;
    while (offset < chunk.length) {
      if (used === 0 && chunk.length - offset >= DEFLATE_PUSH_BYTES) {
        yield chunk.subarray(offset, offset + DEFLATE_PUSH_BYTES);
        offset += DEFLATE_PUSH_BYTES;
        continue;
      }
      if (used === 0 && !(reuse && staged.length === DEFLATE_PUSH_BYTES)) {
        staged = new Uint8Array(DEFLATE_PUSH_BYTES);
      }
      const count = Math.min(DEFLATE_PUSH_BYTES - used, chunk.length - offset);
      staged.set(chunk.subarray(offset, offset + count), used);
      offset += count;
      used += count;
      if (used === DEFLATE_PUSH_BYTES) {
        yield staged;
        used = 0;
      }
    }
  }
  if (used > 0) yield staged.subarray(0, used);
}

/** Deflate a part as the writer produces it; `zipChunks` checks its limits when it is written. */
async function deflate_part(
  data: Iterable<Uint8Array>,
  context: XlsxCodecContext,
): Promise<DeflatedPart["deflated"]> {
  let size = 0;
  let checksum = 0xffffffff;
  const native = context.options?.compression === "native" ? native_deflate() : undefined;
  const pieces = function* (): Generator<Uint8Array> {
    // The fflate codec copies each piece before it takes the next; a native stream may not.
    for (const piece of buffer_pieces(data, native === undefined)) {
      checkAbort(context);
      size += piece.length;
      checksum = update_crc32(checksum, piece);
      yield piece;
    }
  };
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  if (native) {
    for await (const chunk of pipe_native(native, pieces())) chunks.push(chunk);
  } else {
    for (const chunk of deflate_fflate(pieces())) chunks.push(chunk);
  }
  return { chunks, crc: (checksum ^ 0xffffffff) >>> 0, size };
}

/**
 * A streamed part up to this size is buffered and deflated with the other
 * parts once they are sorted; a longer one is deflated as it is produced.
 */
const BUFFERED_PART_BYTES = 1024 * 1024;

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/**
 * Buffered API: parts are sorted by name for canonical archives. A long part is
 * deflated as the writer produces it, so only its compressed bytes wait for the
 * sort. Streams cannot sort because styles and content types depend on every
 * worksheet.
 */
export async function writeZip(
  parts: Iterable<ZipPart>,
  context: XlsxCodecContext,
): Promise<Uint8Array> {
  const sources: (ZipPart | DeflatedPart)[] = [];
  for (const part of parts) {
    if ("stored" in part || part.data instanceof Uint8Array) {
      sources.push(part);
      continue;
    }
    const iterator = part.data[Symbol.iterator]();
    const head: Uint8Array[] = [];
    let bytes = 0;
    let step = iterator.next();
    for (; !step.done && bytes <= BUFFERED_PART_BYTES; step = iterator.next()) {
      head.push(step.value);
      bytes += step.value.length;
    }
    if (step.done) {
      sources.push({ name: part.name, data: concat(head, bytes) });
      continue;
    }
    const next = step.value;
    const rest: Iterable<Uint8Array> = { [Symbol.iterator]: () => iterator };
    const data = (function* (): Generator<Uint8Array> {
      yield* head.splice(0);
      yield next;
      yield* rest;
    })();
    sources.push({ name: part.name, deflated: await deflate_part(data, context) });
  }
  sources.sort((left, right) => left.name.localeCompare(right.name));
  const chunks: Uint8Array[] = [];
  for await (const chunk of zip_parts(sources, context)) chunks.push(chunk);
  return concat(
    chunks,
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
}
