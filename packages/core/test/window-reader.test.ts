import { describe, expect, it } from "bun:test";

import { SheetRegistry } from "../src/store/sheet-registry.js";
import type { RecomputingCellStore } from "../src/store/wasm-contract.js";
import { decodePackedWindow, StoreWindowReader } from "../src/store/window-reader.js";
import { KIND_BOOL, KIND_EMPTY, KIND_NUMBER, KIND_STRING } from "../src/store/wire-tags.js";
import { StyleDictionary } from "../src/style-dictionary.js";
import type { Workbook } from "../src/types.js";
import { makeWorkbook } from "./fixtures.js";

function sheet_registry(
  document: Workbook,
  handles: ReadonlyArray<[string, number]>,
): SheetRegistry {
  const sheets = new SheetRegistry(document);
  for (const [sheet, handle] of handles) sheets.handles.set(sheet, handle);
  return sheets;
}

const HEADER_BYTES = 40;

function make_packed_window(): Uint8Array {
  const kinds = new Uint8Array([KIND_EMPTY, KIND_NUMBER, KIND_STRING, KIND_BOOL]);
  const numbers = new Float64Array([0, 42.5, 0, 1]);
  const string_ids = new Uint32Array([0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff]);
  const string_index = new Int32Array([-1, -1, 0, -1]);
  const style_ids = new Uint32Array([0, 1, 1, 0]);
  const style_dict = new Uint32Array([4, 9]);
  const cond_matches = new Uint32Array([0, 2, 1, 0]);
  const numbers_start = (HEADER_BYTES + kinds.length + 7) & ~7;
  const string_ids_start = numbers_start + numbers.byteLength;
  const string_index_start = string_ids_start + string_ids.byteLength;
  const style_ids_start = string_index_start + string_index.byteLength;
  const style_dict_start = style_ids_start + style_ids.byteLength;
  const cond_matches_start = style_dict_start + style_dict.byteLength;
  const total_bytes = cond_matches_start + cond_matches.byteLength;
  const packed = new Uint8Array(total_bytes);
  const header = new DataView(packed.buffer);
  for (const [index, value] of [
    0x3157_4e53,
    1,
    HEADER_BYTES,
    total_bytes,
    2,
    2,
    kinds.length,
    style_dict.length,
    cond_matches.length,
    1,
  ].entries()) {
    header.setUint32(index * 4, value, true);
  }
  packed.set(kinds, HEADER_BYTES);
  new Float64Array(packed.buffer, numbers_start, numbers.length).set(numbers);
  new Uint32Array(packed.buffer, string_ids_start, string_ids.length).set(string_ids);
  new Int32Array(packed.buffer, string_index_start, string_index.length).set(string_index);
  new Uint32Array(packed.buffer, style_ids_start, style_ids.length).set(style_ids);
  new Uint32Array(packed.buffer, style_dict_start, style_dict.length).set(style_dict);
  new Uint32Array(packed.buffer, cond_matches_start, cond_matches.length).set(cond_matches);
  return packed;
}

describe("packed window decoding", () => {
  it("rejects truncated, inconsistent, and unaligned layouts", () => {
    expect(() => decodePackedWindow(new Uint8Array(HEADER_BYTES - 1))).toThrow(Error);

    const truncated = make_packed_window().slice(0, -1);
    expect(() => decodePackedWindow(truncated)).toThrow(Error);

    const bad_dimensions = make_packed_window();
    new DataView(bad_dimensions.buffer).setUint32(24, 3, true);
    expect(() => decodePackedWindow(bad_dimensions)).toThrow(Error);

    const bad_conditional_length = make_packed_window();
    new DataView(bad_conditional_length.buffer).setUint32(32, 1, true);
    expect(() => decodePackedWindow(bad_conditional_length)).toThrow(Error);

    const bad_style_length = make_packed_window();
    new DataView(bad_style_length.buffer).setUint32(28, 3, true);
    expect(() => decodePackedWindow(bad_style_length)).toThrow(Error);

    const valid = make_packed_window();
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

function make_epoch_reader() {
  const pool = { epoch: 0, text: "before collection" };
  const wasm = {
    stringPoolEpoch: () => pool.epoch,
    isPaged: () => false,
    getWindow: () => {
      const epoch = pool.epoch;
      const packed = make_packed_window();
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
    sheet_registry(makeWorkbook(2), [["s1", 0]]),
    new StyleDictionary(),
  );
  const read_visible = () => reader.read("s1", { start: 0, end: 2 }, [0, 1], undefined, false);
  return { pool, wasm, reader, readVisible: read_visible };
}

describe("string-pool epoch lifetime", () => {
  for (const boundary of ["visible window", "rectangle", "persisted cells"] as const) {
    it(`resolves reused IDs after collection through ${boundary} and rewarms worker updates`, () => {
      const { pool, reader, readVisible: read_visible } = make_epoch_reader();
      expect(Array.from(read_visible().values)).toEqual([null, 42.5, "before collection", true]);
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
      const refreshed = read_visible();
      expect(Array.from(refreshed.values)).toEqual([null, 42.5, "after collection", true]);
      expect(refreshed.stringPoolEpoch).toBe(pool.epoch);
      expect(refreshed.stringPoolUpdateIds).toEqual(new Uint32Array([0]));
      expect(refreshed.stringPoolUpdateValues).toEqual(["after collection"]);
      expect(read_visible().stringPoolUpdateIds).toBeUndefined();
    });
  }
});
