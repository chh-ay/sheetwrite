import { describe, expect, it } from "bun:test";

import { checkWasmFunctionSizes, WASM_FUNCTION_BUDGET_BYTES } from "./wasm-function-sizes.js";

const WASM_HEADER = [0, 97, 115, 109, 1, 0, 0, 0];
const SECTION_CUSTOM = 0;
const SECTION_TYPE = 1;
const SECTION_IMPORT = 2;
const SECTION_FUNCTION = 3;
const SECTION_CODE = 10;
const FUNCTION_TYPE = 0x60;
const IMPORT_FUNCTION = 0;
const NAME_FUNCTIONS = 1;
const NOP = 0x01;
const END = 0x0b;
const LEB_BASE = 128;
const BODY_FRAMING_BYTES = 2;

function u32(value: number): number[] {
  const encoded: number[] = [];
  do {
    const payload = value % LEB_BASE;
    value = Math.floor(value / LEB_BASE);
    encoded.push(payload + (value > 0 ? LEB_BASE : 0));
  } while (value > 0);
  return encoded;
}

function string(value: string): number[] {
  const encoded = new TextEncoder().encode(value);
  return [...u32(encoded.length), ...encoded];
}

function section(kind: number, content: readonly number[]): number[] {
  return [kind, ...u32(content.length), ...content];
}

/** Valid modules exercise code and name sections, including an imported index. */
function moduleWithBodies(
  functions: readonly { name: string; bytes: number }[],
): Uint8Array<ArrayBuffer> {
  const importedFunctions = 1;
  const names = functions.flatMap((entry, index) => [
    ...u32(importedFunctions + index),
    ...string(entry.name),
  ]);
  const bodies = functions.flatMap((entry) => [
    ...u32(entry.bytes),
    0,
    ...Array.from({ length: entry.bytes - BODY_FRAMING_BYTES }, () => NOP),
    END,
  ]);
  const functionNames = [NAME_FUNCTIONS, ...u32(u32(functions.length).length + names.length)];
  const bytes = Uint8Array.from([
    ...WASM_HEADER,
    ...section(SECTION_TYPE, [1, FUNCTION_TYPE, 0, 0]),
    ...section(SECTION_IMPORT, [1, ...string("host"), ...string("noop"), IMPORT_FUNCTION, 0]),
    ...section(SECTION_FUNCTION, [...u32(functions.length), ...functions.map(() => 0)]),
    ...section(SECTION_CUSTOM, [...string("keep"), 42]),
    ...section(SECTION_CUSTOM, [
      ...string("name"),
      ...functionNames,
      ...u32(functions.length),
      ...names,
    ]),
    ...section(SECTION_CODE, [...u32(functions.length), ...bodies]),
  ]);
  expect(WebAssembly.validate(bytes)).toBe(true);
  return bytes;
}

describe("optimized WASM function budget", () => {
  it("rejects an oversized body with its name, accounting for imported function indices", () => {
    const bytes = moduleWithBodies([
      { name: "CellStore::eval_ast", bytes: WASM_FUNCTION_BUDGET_BYTES + 1 },
    ]);
    expect(() => checkWasmFunctionSizes(bytes)).toThrow("CellStore::eval_ast");
  });

  it("fails closed when a build drops names before the guard", () => {
    const bytes = moduleWithBodies([{ name: "small", bytes: BODY_FRAMING_BYTES }]);
    const { wasm } = checkWasmFunctionSizes(bytes);
    expect(() => checkWasmFunctionSizes(wasm)).toThrow();
  });
});
