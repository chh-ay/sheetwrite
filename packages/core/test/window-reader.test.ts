import { describe, expect, it } from "bun:test";

import type { RecomputingCellStore } from "../src/store/wasm-contract.js";
import { decodePackedWindow, StoreWindowReader } from "../src/store/window-reader.js";
import { KIND_BOOL, KIND_EMPTY, KIND_NUMBER, KIND_STRING } from "../src/store/wire-tags.js";
import { StyleDictionary } from "../src/style-dictionary.js";
import { makeWorkbook } from "./fixtures.js";

const HEADER_BYTES = 40;

function makePackedWindow(): Uint8Array {
  const kinds = new Uint8Array([KIND_EMPTY, KIND_NUMBER, KIND_STRING, KIND_BOOL]);
  const numbers = new Float64Array([0, 42.5, 0, 1]);
  const stringIds = new Uint32Array([0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff]);
  const stringIndex = new Int32Array([-1, -1, 0, -1]);
  const styleIds = new Uint32Array([0, 1, 1, 0]);
  const styleDict = new Uint32Array([4, 9]);
  const condMatches = new Uint32Array([0, 2, 1, 0]);
  const numbersStart = (HEADER_BYTES + kinds.length + 7) & ~7;
  const stringIdsStart = numbersStart + numbers.byteLength;
  const stringIndexStart = stringIdsStart + stringIds.byteLength;
  const styleIdsStart = stringIndexStart + stringIndex.byteLength;
  const styleDictStart = styleIdsStart + styleIds.byteLength;
  const condMatchesStart = styleDictStart + styleDict.byteLength;
  const totalBytes = condMatchesStart + condMatches.byteLength;
  const packed = new Uint8Array(totalBytes);
  const header = new DataView(packed.buffer);
  for (const [index, value] of [
    0x3157_4e53,
    1,
    HEADER_BYTES,
    totalBytes,
    2,
    2,
    kinds.length,
    styleDict.length,
    condMatches.length,
    1,
  ].entries()) {
    header.setUint32(index * 4, value, true);
  }
  packed.set(kinds, HEADER_BYTES);
  new Float64Array(packed.buffer, numbersStart, numbers.length).set(numbers);
  new Uint32Array(packed.buffer, stringIdsStart, stringIds.length).set(stringIds);
  new Int32Array(packed.buffer, stringIndexStart, stringIndex.length).set(stringIndex);
  new Uint32Array(packed.buffer, styleIdsStart, styleIds.length).set(styleIds);
  new Uint32Array(packed.buffer, styleDictStart, styleDict.length).set(styleDict);
  new Uint32Array(packed.buffer, condMatchesStart, condMatches.length).set(condMatches);
  return packed;
}

describe("packed window decoding", () => {
  it("rejects truncated, inconsistent, and unaligned layouts", () => {
    expect(() => decodePackedWindow(new Uint8Array(HEADER_BYTES - 1))).toThrow(Error);

    const truncated = makePackedWindow().slice(0, -1);
    expect(() => decodePackedWindow(truncated)).toThrow(Error);

    const badDimensions = makePackedWindow();
    new DataView(badDimensions.buffer).setUint32(24, 3, true);
    expect(() => decodePackedWindow(badDimensions)).toThrow(Error);

    const badConditionalLength = makePackedWindow();
    new DataView(badConditionalLength.buffer).setUint32(32, 1, true);
    expect(() => decodePackedWindow(badConditionalLength)).toThrow(Error);

    const badStyleLength = makePackedWindow();
    new DataView(badStyleLength.buffer).setUint32(28, 3, true);
    expect(() => decodePackedWindow(badStyleLength)).toThrow(Error);

    const valid = makePackedWindow();
    expect(decodePackedWindow(valid)).toMatchObject({
      nRows: 2,
      nCols: 2,
      numbers: new Float64Array([0, 42.5, 0, 1]),
    });
    const shifted = new Uint8Array(valid.byteLength + 1);
    shifted.set(valid, 1);
    expect(() => decodePackedWindow(shifted.subarray(1))).toThrow(Error);
  });
});

function makeEpochReader() {
  const pool = { epoch: 0, text: "before collection" };
  const wasm = {
    stringPoolEpoch: () => pool.epoch,
    isPaged: () => false,
    getWindow: () => {
      const epoch = pool.epoch;
      const packed = makePackedWindow();
      const decoded = decodePackedWindow(packed);
      decoded.stringIds[2] = 0;
      decoded.stringIndex[2] = -1;
      new DataView(packed.buffer).setUint32(36, 0, true);
      return {
        stringPoolEpoch: () => epoch,
        takePacked: () => packed,
        free: () => {},
      };
    },
    poolStrings: (ids: Uint32Array) =>
      Array.from(ids, (id) => {
        if (id !== 0) throw new Error(`Unexpected fixture pool ID ${id}`);
        return pool.text;
      }),
    persistedCellData: () => new Float64Array([1, 0, KIND_STRING, 0, 0, 0, 0, 0]),
  };
  const reader = new StoreWindowReader(
    wasm as unknown as RecomputingCellStore,
    makeWorkbook(2),
    new Map([["s1", 0]]),
    new StyleDictionary(),
  );
  const readVisible = () => reader.read("s1", { start: 0, end: 2 }, [0, 1], undefined, false);
  return { pool, wasm, reader, readVisible };
}

describe("string-pool epoch lifetime", () => {
  for (const boundary of ["visible window", "rectangle", "persisted cells"] as const) {
    it(`resolves reused IDs after collection through ${boundary} and rewarms worker updates`, () => {
      const { pool, reader, readVisible } = makeEpochReader();
      expect(Array.from(readVisible().values)).toEqual([null, 42.5, "before collection", true]);
      pool.epoch += 1;
      pool.text = "after collection";

      if (boundary === "rectangle") {
        expect(reader.readRectangle("s1", 0, 2, [0, 1]).values).toEqual([
          null,
          42.5,
          "after collection",
          true,
        ]);
      } else if (boundary === "persisted cells") {
        expect(reader.capturePersistedCells("s1").values).toEqual(["after collection"]);
      }
      const refreshed = readVisible();
      expect(Array.from(refreshed.values)).toEqual([null, 42.5, "after collection", true]);
      expect(refreshed.stringPoolEpoch).toBe(pool.epoch);
      expect(refreshed.stringPoolUpdateIds).toEqual(new Uint32Array([0]));
      expect(refreshed.stringPoolUpdateValues).toEqual(["after collection"]);
      expect(readVisible().stringPoolUpdateIds).toBeUndefined();
    });
  }
});
