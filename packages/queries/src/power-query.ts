import type {
  PowerQueryCodec,
  PowerQueryExport,
  PowerQueryImport,
  PowerQueryUnsupported,
  SavedQuery,
} from "@sheetwrite/core";

import type * as WasmBindings from "../pkg/sheetwrite_queries.js";
import { unpackStrings } from "./encoding.js";
import { QueryError } from "./errors.js";
import { NO_COLUMN } from "./plan-wire.js";
import { decodeQueries, encodeQueries } from "./query-wire.js";

type WasmModule = typeof WasmBindings;

const LOSS_WIDTH = 3;
const UNSUPPORTED_WIDTH = 3;
const SPAN_WIDTH = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function failure<T>(wasm: WasmModule, operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    if (cause instanceof wasm.QueryFailure) {
      try {
        throw new QueryError({ code: cause.takeCode(), column: null, step: null, row: null });
      } finally {
        cause.free();
      }
    }

    throw cause;
  }
}

function encode(wasm: WasmModule, queries: readonly SavedQuery[]): PowerQueryExport {
  const lanes = encodeQueries(queries);
  const section = failure(wasm, () =>
    wasm.emitPowerQuery(lanes.codes, lanes.numbers, lanes.text, lanes.offsets),
  );

  try {
    const text = section.takeText();
    const members = unpackStrings(section.takeMemberText(), section.takeMemberOffsets());
    const triples = section.takeLosses();
    const codes = unpackStrings(section.takeLossText(), section.takeLossOffsets());
    const losses = [];

    for (let offset = 0; offset + LOSS_WIDTH <= triples.length; offset += LOSS_WIDTH) {
      const query = queries[triples[offset] ?? 0];
      const step = triples[offset + 1] ?? NO_COLUMN;
      const code = codes[triples[offset + 2] ?? 0];
      if (query === undefined || code === undefined) continue;

      losses.push({ query: query.id, step: step === NO_COLUMN ? null : step, code });
    }

    return { section: text, members, losses };
  } finally {
    section.free();
  }
}

function decode(wasm: WasmModule, section: string): PowerQueryImport {
  const imported = failure(wasm, () => wasm.importPowerQuery(section));

  try {
    const queries = decodeQueries({
      codes: imported.takeCodes(),
      numbers: imported.takeNumbers(),
      text: imported.takeText(),
      offsets: imported.takeOffsets(),
    });
    const spans = imported.takeSpans();
    const strings = unpackStrings(
      imported.takeUnsupportedText(),
      imported.takeUnsupportedOffsets(),
    );

    // Spans are UTF-8 byte offsets, so the member text is cut from the encoded document.
    const bytes = encoder.encode(section);
    const unsupported: PowerQueryUnsupported[] = [];
    for (let index = 0; index * UNSUPPORTED_WIDTH < strings.length; index += 1) {
      const start = spans[index * SPAN_WIDTH] ?? 0;
      const end = spans[index * SPAN_WIDTH + 1] ?? start;
      unsupported.push({
        member: strings[index * UNSUPPORTED_WIDTH] ?? "",
        reason: strings[index * UNSUPPORTED_WIDTH + 1] ?? "",
        detail: strings[index * UNSUPPORTED_WIDTH + 2] ?? "",
        text: decoder.decode(bytes.subarray(start, end)),
      });
    }

    return { queries, unsupported };
  } finally {
    imported.free();
  }
}

/** Binds the codec to a loaded query engine artifact. */
export function createPowerQueryCodec(wasm: WasmModule): PowerQueryCodec {
  return {
    encode: (queries) => encode(wasm, queries),
    decode: (section) => decode(wasm, section),
  };
}
