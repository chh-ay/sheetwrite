import { describe, expect, it } from "bun:test";

import { compareRelocations } from "./wasm-relocations.js";

/** Where the data of the test modules starts, as in the engine builds. */
const DATA_START = 1_048_576;
const MEMORY_PAGES = 17;
const OPCODE_CALL = 0x10;
const OPCODE_DROP = 0x1a;
const OPCODE_I32_CONST = 0x41;
const OPCODE_I32_LOAD = 0x28;
const OPCODE_END = 0x0b;
const WORD_ALIGNMENT = 2;

function unsignedLeb(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  do {
    const low = rest % 128;
    rest = Math.floor(rest / 128);
    bytes.push(rest === 0 ? low : low | 0x80);
  } while (rest !== 0);
  return bytes;
}

function signedLeb(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  for (;;) {
    const low = rest & 0x7f;
    rest >>= 7;
    const isDone = (rest === 0 && (low & 0x40) === 0) || (rest === -1 && (low & 0x40) !== 0);
    bytes.push(isDone ? low : low | 0x80);
    if (isDone) return bytes;
  }
}

function vector(items: number[][]): number[] {
  return [...unsignedLeb(items.length), ...items.flat()];
}

function text(value: string): number[] {
  const bytes = [...new TextEncoder().encode(value)];
  return [...unsignedLeb(bytes.length), ...bytes];
}

function section(id: number, body: number[]): number[] {
  return [id, ...unsignedLeb(body.length), ...body];
}

interface TestFunction {
  name: string;
  /** Instructions without the final `end`; each leaves nothing on the stack. */
  body: number[];
}

/** A module whose functions take nothing and return nothing, with one data segment. */
function module(functions: TestFunction[], data: { address: number; bytes: number[] }): Uint8Array {
  const type = [0x60, 0, 0];
  const bodies = functions.map(({ body }) => {
    const code = [0, ...body, OPCODE_END];
    return [...unsignedLeb(code.length), ...code];
  });
  const names = vector(functions.map(({ name }, index) => [...unsignedLeb(index), ...text(name)]));
  return new Uint8Array([
    ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
    ...section(1, vector([type])),
    ...section(3, vector(functions.map(() => [0]))),
    ...section(5, vector([[0, ...unsignedLeb(MEMORY_PAGES)]])),
    ...section(10, vector(bodies)),
    ...section(
      11,
      vector([
        [
          0,
          OPCODE_I32_CONST,
          ...signedLeb(data.address),
          OPCODE_END,
          ...vector(data.bytes.map((byte) => [byte])),
        ],
      ]),
    ),
    ...section(0, [...text("name"), ...section(1, names)]),
  ]);
}

/** Loads the word at `address` and drops it. */
function load(address: number): number[] {
  return [OPCODE_I32_CONST, ...signedLeb(address), OPCODE_I32_LOAD, WORD_ALIGNMENT, 0, OPCODE_DROP];
}

function call(index: number): number[] {
  return [OPCODE_CALL, ...unsignedLeb(index)];
}

const GREETING = [...new TextEncoder().encode("greeting")];

/** Before the move: `parse` reads the greeting, `write` reads it too and calls `parse`. */
const before = module(
  [
    { name: "engine::calc::parse", body: load(DATA_START) },
    { name: "engine::calc::write", body: [...load(DATA_START), ...call(0)] },
  ],
  { address: DATA_START, bytes: GREETING },
);

/** The move: `write` now comes first, from a new module, and the greeting moved 8 bytes on. */
function moved(
  options: { constant?: number; greeting?: number[]; callee?: number } = {},
): Uint8Array {
  const address = DATA_START + 8;
  return module(
    [
      {
        name: "engine::calc::write::write",
        body: [...load(options.constant ?? address), ...call(options.callee ?? 1)],
      },
      { name: "engine::calc::parse", body: load(address) },
    ],
    { address: DATA_START, bytes: [0, 0, 0, 0, 0, 0, 0, 0, ...(options.greeting ?? GREETING)] },
  );
}

const MODULES: [string, string][] = [["calc::write", "calc"]];

describe("compareRelocations", () => {
  it("passes a move that only renumbers functions and moves data", () => {
    const report = compareRelocations(before, moved(), MODULES);

    expect(report.lines.at(-1)).toStartWith("Same code");
    expect(report.isSameCode).toBe(true);
  });

  it.each([
    ["a function uses another constant", { constant: DATA_START + 9 }],
    ["moved data changed", { greeting: [0x47, ...GREETING.slice(1)] }],
    ["a call goes to another function", { callee: 0 }],
  ])("fails when %s", (_label, change) => {
    expect(compareRelocations(before, moved(change), MODULES).isSameCode).toBe(false);
  });
});
