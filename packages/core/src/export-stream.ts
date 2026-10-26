const OUTPUT_CHUNK_BYTES = 64 * 1024;

/** No producer work occurs until demand; cancellation closes the underlying generator. */
export function readableBytes(
  chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  normalizeError: (error: unknown) => unknown = (error) => error,
): ReadableStream<Uint8Array> {
  const iterator =
    Symbol.asyncIterator in chunks ? chunks[Symbol.asyncIterator]() : chunks[Symbol.iterator]();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        } catch (error) {
          try {
            await iterator.return?.();
          } finally {
            controller.error(normalizeError(error));
          }
        }
      },
      async cancel() {
        await iterator.return?.();
      },
    },
    { highWaterMark: 0 },
  );
}

/** UTF-16 units joined before one encode; at most 3 UTF-8 bytes each keeps a batch near one chunk. */
const BATCH_UNITS = 16 * 1024;

/** Pack small field fragments into bounded UTF-8 byte chunks with one encode per batch. */
export function* utf8Chunks(fragments: Iterable<string>): Generator<Uint8Array> {
  const encoder = new TextEncoder();
  const batch: string[] = [];
  let units = 0;
  function* flush(): Generator<Uint8Array> {
    const encoded = encoder.encode(batch.join(""));
    batch.length = 0;
    units = 0;
    for (let offset = 0; offset < encoded.length; offset += OUTPUT_CHUNK_BYTES) {
      yield encoded.subarray(offset, offset + OUTPUT_CHUNK_BYTES);
    }
  }
  for (const fragment of fragments) {
    batch.push(fragment);
    units += fragment.length;
    if (units >= BATCH_UNITS) yield* flush();
  }
  if (units > 0) yield* flush();
}
