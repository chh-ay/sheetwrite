// JavaScriptCore does not optimize WebAssembly functions above 100,000 bytes:
// https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/runtime/OptionsList.h
// maximumOMGCandidateCost. A 75,000-byte budget leaves 25,000 bytes of safety
// margin and room above the current largest engine function (55,441 bytes).
export const WASM_FUNCTION_BUDGET_BYTES = 75_000;

const WASM_HEADER = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0);
const TOP_FUNCTION_COUNT = 10;
const SECTION_CUSTOM = 0;
const SECTION_IMPORT = 2;
const SECTION_CODE = 10;
const NAME_FUNCTIONS = 1;
const IMPORT_FUNCTION = 0;
const IMPORT_TABLE = 1;
const IMPORT_MEMORY = 2;
const IMPORT_GLOBAL = 3;
const IMPORT_TAG = 4;
const LEB_PAYLOAD_BITS = 7;
const LEB_PAYLOAD_MASK = 0x7f;
const LEB_CONTINUATION = 0x80;
const U32_LEB_MAX_BYTES = 5;
const U32_LEB_FINAL_MAX = 0x0f;
const LIMIT_HAS_MAXIMUM = 1;
const LIMIT_IS_64_BIT = 4;
const textDecoder = new TextDecoder("utf-8", { fatal: true });

interface WasmFunctionSize {
  readonly name: string;
  readonly bytes: number;
}

class Reader {
  position = 0;

  constructor(readonly bytes: Uint8Array) {}

  byte(): number {
    const byte = this.bytes[this.position];
    if (byte === undefined) throw new Error("Truncated WASM section");

    this.position++;
    return byte;
  }

  u32(): number {
    let value = 0;
    for (let i = 0; i < U32_LEB_MAX_BYTES; i++) {
      const byte = this.byte();
      if (i === U32_LEB_MAX_BYTES - 1 && byte > U32_LEB_FINAL_MAX) {
        throw new Error("WASM integer exceeds u32");
      }

      value += (byte & LEB_PAYLOAD_MASK) * 2 ** (i * LEB_PAYLOAD_BITS);
      if ((byte & LEB_CONTINUATION) === 0) return value;
    }
    throw new Error("Unterminated WASM integer");
  }

  take(length: number): Uint8Array {
    const end = this.position + length;
    if (end > this.bytes.length) throw new Error("Truncated WASM section");

    const bytes = this.bytes.subarray(this.position, end);
    this.position = end;
    return bytes;
  }

  string(): string {
    return textDecoder.decode(this.take(this.u32()));
  }
}

function skipLimits(reader: Reader): void {
  const flags = reader.u32();
  if ((flags & LIMIT_IS_64_BIT) !== 0) {
    throw new Error("Expected wasm32 engine limits, not 64-bit limits");
  }

  reader.u32();
  if ((flags & LIMIT_HAS_MAXIMUM) !== 0) reader.u32();
}

function countImportedFunctions(reader: Reader): number {
  let functions = 0;
  const count = reader.u32();
  for (let i = 0; i < count; i++) {
    reader.string();
    reader.string();
    const kind = reader.byte();
    switch (kind) {
      case IMPORT_FUNCTION:
        functions++;
        reader.u32();
        break;
      case IMPORT_TABLE:
        reader.byte();
        skipLimits(reader);
        break;
      case IMPORT_MEMORY:
        skipLimits(reader);
        break;
      case IMPORT_GLOBAL:
        reader.byte();
        reader.byte();
        break;
      case IMPORT_TAG:
        reader.byte();
        reader.u32();
        break;
      default:
        throw new Error(`Unknown WASM import kind ${kind}`);
    }
  }
  return functions;
}

function readFunctionNames(reader: Reader, names: Map<number, string>): void {
  while (reader.position < reader.bytes.length) {
    const kind = reader.byte();
    const subsection = new Reader(reader.take(reader.u32()));
    if (kind !== NAME_FUNCTIONS) continue;

    const count = subsection.u32();
    for (let i = 0; i < count; i++) {
      const index = subsection.u32();
      names.set(index, subsection.string());
    }
  }
}

/**
 * Check the exact optimized bodies before names are removed for publication.
 * Keeping the names through wasm-opt avoids a second optimization pipeline
 * whose functions would need to be matched back to the shipped artifact.
 */
export function checkWasmFunctionSizes(bytes: Uint8Array): {
  wasm: Uint8Array;
  largestFunctions: readonly WasmFunctionSize[];
} {
  const reader = new Reader(bytes);
  const header = reader.take(WASM_HEADER.length);
  if (!header.every((byte, index) => byte === WASM_HEADER[index])) {
    throw new Error("Expected a WebAssembly version 1 module");
  }

  let importedFunctions = 0;
  const bodySizes: number[] = [];
  const names = new Map<number, string>();
  const publishedSections: Uint8Array[] = [header];
  while (reader.position < bytes.length) {
    const start = reader.position;
    const kind = reader.byte();
    const section = new Reader(reader.take(reader.u32()));
    if (kind === SECTION_CUSTOM && section.string() === "name") {
      readFunctionNames(section, names);
      continue;
    }

    publishedSections.push(bytes.subarray(start, reader.position));
    if (kind === SECTION_IMPORT) {
      importedFunctions = countImportedFunctions(section);
    } else if (kind === SECTION_CODE) {
      const count = section.u32();
      for (let i = 0; i < count; i++) {
        const size = section.u32();
        bodySizes.push(size);
        section.take(size);
      }
    }
  }

  if (bodySizes.length === 0) throw new Error("Engine WASM contains no function bodies");

  const functions = bodySizes.map((size, index) => {
    const name = names.get(importedFunctions + index);
    if (!name) {
      throw new Error(
        "Engine WASM is missing function names; keep wasm-opt -g before finalization",
      );
    }
    return {
      name: name
        .replace(/\[[0-9a-f]{16}\]|::h[0-9a-f]{16}/g, "")
        .replaceAll("sheetwrite_wasm::", ""),
      bytes: size,
    };
  });
  functions.sort((left, right) => right.bytes - left.bytes);

  const oversized = functions.filter((entry) => entry.bytes > WASM_FUNCTION_BUDGET_BYTES);
  if (oversized.length > 0) {
    throw new Error(
      [
        `WASM function budget exceeded (${WASM_FUNCTION_BUDGET_BYTES.toLocaleString("en-US")} bytes):`,
        ...oversized.map(
          (entry) => `  ${entry.name}: ${entry.bytes.toLocaleString("en-US")} bytes`,
        ),
        "Split evaluator work into #[inline(never)] *_family handlers and keep wasm-opt --no-inline=*_family before -O3.",
        "Do not raise the budget toward JavaScriptCore's 100,000-byte optimizing-compiler limit.",
      ].join("\n"),
    );
  }

  return {
    wasm: Buffer.concat(publishedSections),
    largestFunctions: functions.slice(0, TOP_FUNCTION_COUNT),
  };
}
