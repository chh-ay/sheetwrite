import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { parseCellLiteralInput } from "../src/cell-input.js";
import { parseDateInput } from "../src/date-serial.js";
import {
  DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS,
  DelimitedTextOptionsError,
  DelimitedTextResourceError,
} from "../src/delimited-text.js";
import { fromCsv, parseCsv, toCsv, toCsvStream, toTsv, toTsvStream } from "../src/export.js";
import { initSheetwrite } from "../src/grid.js";
import { IncompleteDataError, SheetwriteStore } from "../src/store.js";
import type { Column, Workbook, WorkbookSnapshot } from "../src/types.js";
import {
  fromXlsxTable,
  fromXlsxWorkbook,
  toXlsxTable,
  toXlsxWorkbook,
} from "../src/xlsx-bridge.js";
import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
} from "../src/xlsx-slots.js";
import { keepXlsxSlots } from "./fixtures.js";

let restore_xlsx_slots = keepXlsxSlots();
beforeEach(() => {
  restore_xlsx_slots = keepXlsxSlots();
});
afterEach(() => {
  restore_xlsx_slots();
});

beforeAll(async () => {
  await initSheetwrite();
});

const AB: Column[] = [
  { key: "a", header: "A", width: 80, type: "text" },
  { key: "b", header: "B", width: 80, type: "number" },
];

/** One sheet "s" with fresh copies of `columns`. */
function workbook(columns: Column[] = AB, row_count = 3): Workbook {
  const copies = columns.map((column) => ({ ...column }));
  return {
    activeSheet: "s",
    sheets: [{ id: "s", name: "S", rowCount: row_count, columns: copies }],
  };
}

describe("export", () => {
  it("csv and tsv: BOM + CRLF + header + injection hardening + quoting", () => {
    const wb = workbook();
    wb.sheets[0]!.columns[0]!.header = "=HYPERLINK(1)";
    const store = new SheetwriteStore(wb);
    store.applyTransaction({
      patches: [
        {
          op: "set",
          addr: { sheet: "s", row: 0, col: 0 },
          value: { kind: "literal", value: "=cmd" },
        },
        { op: "set", addr: { sheet: "s", row: 0, col: 1 }, value: { kind: "literal", value: 42 } },
        {
          op: "set",
          addr: { sheet: "s", row: 1, col: 0 },
          value: { kind: "literal", value: "a,b" },
        },
        // A negative number is data, not an injection.
        { op: "set", addr: { sheet: "s", row: 1, col: 1 }, value: { kind: "literal", value: -5 } },
      ],
    });
    const csv = toCsv(store.getWorkbook().sheets[0]!, store);
    expect(csv.startsWith("\ufeff")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("'=HYPERLINK(1),B");
    expect(lines[1]).toBe("'=cmd,42");
    expect(lines[2]).toBe('"a,b",-5');
    const range = { sheet: "s", start: { row: 0, col: 0 }, end: { row: 1, col: 1 } };
    expect(toTsv(range, store)).toBe("'=cmd\t42\r\na,b\t-5");
  });

  it("reports missing optional XLSX backends through stable error fields", async () => {
    const store = new SheetwriteStore(workbook());
    setXlsxTableExportBackend(null);
    setXlsxTableImportBackend(null);
    setXlsxWorkbookBackend(null);

    const snapshot: WorkbookSnapshot = {
      schemaVersion: 1,
      workbook: { activeSheet: "s" },
      sheets: [],
    };
    const calls: Array<[Promise<unknown>, string, string]> = [
      [toXlsxTable(store.getWorkbook(), store), "xlsx-export", "toXlsxTable"],
      [fromXlsxTable(new Uint8Array()), "xlsx-import", "fromXlsxTable"],
      [toXlsxWorkbook(snapshot), "xlsx-export", "toXlsxWorkbook"],
      [fromXlsxWorkbook(new Uint8Array()), "xlsx-import", "fromXlsxWorkbook"],
    ];
    for (const [call, operation, function_name] of calls) {
      await expect(call).rejects.toMatchObject({
        code: "optional-backend-unavailable",
        operation,
        context: { backend: "xlsx", functionName: function_name },
      });
    }
    store.dispose();
  });

  it("csv import preserves reserved declared keys as enumerable own properties", () => {
    const columns: Column[] = [
      { key: "__proto__", header: "Prototype", width: 100, type: "text" },
      { key: "constructor", header: "Constructor", width: 100, type: "text" },
      { key: "ordinary", header: "Ordinary", width: 100, type: "text" },
    ];
    const data = fromCsv("Prototype,Constructor,Ordinary\r\nalpha,beta,gamma", columns);

    expect(JSON.stringify(data.columns)).toBe(
      '{"__proto__":["alpha"],"constructor":["beta"],"ordinary":["gamma"]}',
    );

    const imported = new SheetwriteStore(workbook(columns, 1), data);
    expect(imported.getCell({ sheet: "s", row: 0, col: 0 }).resolved).toBe("alpha");
    expect(imported.getCell({ sheet: "s", row: 0, col: 1 }).resolved).toBe("beta");
    imported.dispose();
  });

  it("csv exports only the sorted, filtered, non-hidden view and never pads filtered rows", () => {
    const store = new SheetwriteStore(workbook([AB[0]!, { ...AB[1]!, visible: false }], 4), {
      rowCount: 4,
      columns: { a: ["keep-a", "drop", "keep-b", "keep-c"], b: [2, 9, 3, 1] },
    });
    store.setColumnFilter("s", 0, { kind: "contains", text: "keep" });
    store.hideRows("s", [2]);
    store.setViewSort("s", [{ col: 1, ascending: true }]);

    expect(toCsv(store.getWorkbook().sheets[0]!, store)).toBe("\ufeffA\r\nkeep-c\r\nkeep-a");

    store.setColumnFilter("s", 0, { kind: "values", values: ["missing"] });
    expect(toCsv(store.getWorkbook().sheets[0]!, store)).toBe("\ufeffA");
    store.dispose();
  });

  it("tsv reads normalized canonical data coordinates despite the active view", () => {
    const store = new SheetwriteStore(workbook(), {
      rowCount: 3,
      columns: { a: ["zero", "one", "two"], b: [0, 1, 2] },
    });
    store.setColumnFilter("s", 0, { kind: "values", values: ["two"] });
    store.setViewSort("s", [{ col: 1, ascending: false }]);

    expect(toTsv({ sheet: "s", start: { row: 2, col: 1 }, end: { row: 0, col: 0 } }, store)).toBe(
      "zero\t0\r\none\t1\r\ntwo\t2",
    );
    store.dispose();
  });

  it("direct CSV and TSV exports reject incomplete paged data before reading sentinels", () => {
    const store = new SheetwriteStore(workbook(), undefined, { storage: "paged" });
    expect(store.queryCapability("s").status).toBe("incomplete");
    expect(() => toCsv(store.getWorkbook().sheets[0]!, store)).toThrow(IncompleteDataError);
    expect(() =>
      toTsv({ sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 1 } }, store),
    ).toThrow(IncompleteDataError);
    store.dispose();
  });

  it("parses both fixed-dialect record breaks, Unicode, quotes, and trailing empties", () => {
    expect(parseCsv('α,"b,c","q""x"\rbare,cr,\r\nlast,,')).toEqual([
      ["α", "b,c", 'q"x'],
      ["bare", "cr", ""],
      ["last", "", ""],
    ]);
    expect(parseCsv('""')).toEqual([[""]]);
    expect(parseCsv("\ufeffa")).toEqual([["a"]]);
    expect(parseCsv("\ufeff\ufeffa")).toEqual([["\ufeffa"]]);
  });

  it("preserves one-column trailing blank records across CSV export and import", () => {
    const wb = workbook([{ key: "only", header: "Only", width: 80, type: "text" }]);
    const store = new SheetwriteStore(wb);
    const csv = toCsv(store.getWorkbook().sheets[0]!, store);
    expect(csv).toBe('\ufeffOnly\r\n""\r\n""\r\n""');
    expect(parseCsv(csv)).toEqual([["Only"], [""], [""], [""]]);
    expect(fromCsv(csv, wb.sheets[0]!.columns)).toEqual({
      rowCount: 3,
      columns: { only: [null, null, null] },
    });
    store.dispose();
  });

  it("projects visible CSV fields around hidden declared columns on reimport", () => {
    const columns: Column[] = [
      { key: "a", header: "A", width: 80, type: "text" },
      { key: "hidden", header: "Hidden", width: 80, type: "number", visible: false },
      { key: "c", header: "C", width: 80, type: "text" },
    ];
    const data = fromCsv("A,C\r\nleft,right", columns);
    expect(data.columns).toEqual({ a: ["left"], hidden: [null], c: ["right"] });
    expect(Object.keys(data.columns)).toEqual(["a", "hidden", "c"]);
  });

  it("drops extra CSV fields from the projection but still counts them toward ceilings", () => {
    const columns: Column[] = [
      { key: "a", header: "A", width: 80, type: "text" },
      { key: "b", header: "B", width: 80, type: "text" },
    ];
    expect(fromCsv("A,B,C\r\n1,2,3\r\n4", columns)).toEqual({
      rowCount: 2,
      columns: { a: ["1", "4"], b: ["2", null] },
    });
    expect(() => fromCsv("A,B,C\r\n1,2,3", columns, { resourceLimits: { maxColumns: 2 } })).toThrow(
      DelimitedTextResourceError,
    );
    expect(() => fromCsv("A,B,C\r\n1,2,3", columns, { resourceLimits: { maxCells: 5 } })).toThrow(
      DelimitedTextResourceError,
    );
  });

  it("coerces declared types canonically and loads booleans and dates without type loss", () => {
    const columns: Column[] = [
      { key: "bool", header: "Bool", width: 80, type: "text" },
      { key: "num", header: "Num", width: 80, type: "number" },
      { key: "serial", header: "Serial", width: 80, type: "date" },
      { key: "date", header: "Date", width: 80, type: "date" },
      { key: "money", header: "Money", width: 80, type: "currency" },
      { key: "blank", header: "Blank", width: 80, type: "text" },
      { key: "formula", header: "Formula", width: 80, type: "number" },
    ];
    const data = fromCsv(
      'Bool,Num,Serial,Date,Money,Blank,Formula\r\n TRUE , 42 ,45678.5,2026-07-18,"$1,234.50",   ,=1+1\r\n false ,-2,45679,07/18/2026,"(€2,000.25)",\t,+1+1',
      columns,
    );
    expect(data.columns.bool).toEqual([true, false]);
    expect(data.columns.num).toEqual([42, -2]);
    expect(data.columns.serial).toEqual([45678.5, 45679]);
    expect(data.columns.date).toEqual([parseDateInput("2026-07-18"), parseDateInput("07/18/2026")]);
    expect(data.columns.money).toEqual([1234.5, -2000.25]);
    expect(data.columns.blank).toEqual([null, null]);
    expect(data.columns.formula).toEqual(["=1+1", "+1+1"]);

    const store = new SheetwriteStore(workbook(columns, 2), data);
    expect(store.getCell({ sheet: "s", row: 0, col: 0 }).resolved).toBe(true);
    expect(store.getCell({ sheet: "s", row: 1, col: 0 }).resolved).toBe(false);
    expect(store.getCell({ sheet: "s", row: 0, col: 6 }).resolved).toBe("=1+1");
    expect(store.getFormula({ sheet: "s", row: 0, col: 6 })).toBeNull();
    store.dispose();
  });

  it("reads unquoted numeric fields exactly as their text would be read", () => {
    const types = ["number", "currency", "date", "text"] as const;
    const columns: Column[] = types.map((type) => ({ key: type, header: type, width: 80, type }));
    const listed = [
      ...["0", "-0", "+5", ".5", "-.5", "5.", "007", "00.00", "0.1", "-123.456"],
      ...["0.30000000000000004", "123456789012345", "1234567890123456", "9007199254740993"],
      ...["1e3", "0x10", " 7 ", "1.2.3", ".", "-", "+", "", "Infinity", "TRUE", "=1"],
      ...["0.0000000000000000000001", "0.00000000000000000000001", "1.0000000000000000000001"],
      ...['"12"', '"-0"', '"1.5"""'],
    ];
    // Seeded strings of signs, digits and points, so the parse meets many shapes.
    const alphabet = "0123456789.-+";
    let seed = 1;
    const random = (bound: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % bound;
    };
    const fuzzed = Array.from({ length: 4_000 }, () =>
      Array.from({ length: 1 + random(20) }, () => alphabet[random(alphabet.length)]).join(""),
    );
    const fields = [...listed, ...fuzzed];
    const csv = [types.join(","), ...fields.map((field) => types.map(() => field).join(","))].join(
      "\n",
    );

    const data = fromCsv(csv, columns);
    const texts = parseCsv(csv).slice(1);
    expect(data.rowCount).toBe(fields.length);
    for (const type of types) {
      const expected = texts.map((row) => parseCellLiteralInput(row[0] ?? "", type));
      const actual = Array.from(data.columns[type] ?? []);
      const mismatches = actual.flatMap((value, row) =>
        Object.is(value, expected[row]) ? [] : [{ row, field: fields[row], value }],
      );
      expect(mismatches).toEqual([]);
    }
  });

  it("keeps non-ASCII boolean look-alikes and formula-like dates as text", () => {
    const columns: Column[] = [
      { key: "flag", header: "Flag", width: 80, type: "number" },
      { key: "when", header: "When", width: 80, type: "date" },
    ];
    // `ſ` upper-cases to `S`, but spreadsheet booleans are ASCII only.
    expect(fromCsv("Flag,When\nfalſe,=2026-07-18\nFaLsE,2026-07-18", columns).columns).toEqual({
      flag: ["falſe", false],
      when: ["=2026-07-18", parseDateInput("2026-07-18")],
    });
  });

  it("enforces exact defaults and limit+1 before oversized delimited allocations", () => {
    expect(DEFAULT_DELIMITED_TEXT_RESOURCE_LIMITS).toEqual({
      maxInputBytes: 32 * 1024 * 1024,
      maxOutputBytes: 64 * 1024 * 1024,
      maxRows: 1_000_000,
      maxColumns: 16_384,
      maxCells: 1_000_000,
      maxFieldBytes: 1 * 1024 * 1024,
      maxWriterWindowRows: 4_096,
    });
    expect(parseCsv("éé", { resourceLimits: { maxInputBytes: 4, maxFieldBytes: 4 } })).toEqual([
      ["éé"],
    ]);

    let input_failure: unknown;
    try {
      parseCsv("ééx", { resourceLimits: { maxInputBytes: 4 } });
    } catch (error) {
      input_failure = error;
    }
    expect(input_failure).toBeInstanceOf(DelimitedTextResourceError);
    expect(input_failure).toMatchObject({
      resource: "maxInputBytes",
      limit: 4,
      actual: 5,
      operation: "delimited-parse",
    });
    for (const [text, resource_limits] of [
      ["ééx", { maxFieldBytes: 4 }],
      ["a\nb", { maxRows: 1 }],
      ["a,b", { maxColumns: 1 }],
      ["a,b\nc", { maxCells: 2 }],
    ] as const) {
      expect(() => parseCsv(text, { resourceLimits: resource_limits })).toThrow(
        DelimitedTextResourceError,
      );
    }
    expect(() => parseCsv("a", { resourceLimits: { maxRows: 0 } })).toThrow(
      DelimitedTextOptionsError,
    );

    const store = new SheetwriteStore(workbook(), {
      rowCount: 3,
      columns: { a: ["a", "ab", null] },
    });
    const cell = (row: number) => ({ sheet: "s", start: { row, col: 0 }, end: { row, col: 0 } });
    expect(toTsv(cell(0), store, { resourceLimits: { maxOutputBytes: 1 } })).toBe("a");
    expect(() => toTsv(cell(1), store, { resourceLimits: { maxOutputBytes: 1 } })).toThrow(
      DelimitedTextResourceError,
    );
    store.dispose();
  });

  it("streams CSV/TSV on demand with byte-identical output and lazy cancellable store reads", async () => {
    const row_count = 20_000;
    const text = Array.from(
      { length: row_count },
      (_unused, row) => `value-${row}-${"x".repeat(12)}`,
    );
    const store = new SheetwriteStore(workbook(AB, row_count), {
      rowCount: row_count,
      columns: { a: text, b: Array.from({ length: row_count }, (_unused, row) => row) },
    });
    const options = {
      resourceLimits: {
        maxWriterWindowRows: 128,
        maxRows: row_count + 1,
        maxCells: (row_count + 1) * 2,
      },
    };
    let window_reads = 0;
    const read_window = store.getVisibleWindow.bind(store);
    store.getVisibleWindow = ((sheet, rows, columns) => {
      window_reads++;
      return read_window(sheet, rows, columns);
    }) as typeof store.getVisibleWindow;
    const sheet = store.getWorkbook().sheets[0]!;
    const stream = toCsvStream(sheet, store, options);
    expect(window_reads).toBe(0);

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((chunk) => chunk.byteLength))).toBeLessThanOrEqual(64 * 1024);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(Buffer.concat(chunks))).toBe(
      toCsv(sheet, store, options),
    );

    window_reads = 0;
    const reader = toCsvStream(sheet, store, options).getReader();
    await reader.read();
    await reader.cancel();
    const reads_at_cancel = window_reads;
    expect(await reader.read()).toEqual({ done: true, value: undefined });
    expect(window_reads).toBe(reads_at_cancel);
    expect(reads_at_cancel).toBeLessThan(Math.ceil(row_count / 128) / 2);

    const range = { sheet: "s", start: { row: 0, col: 0 }, end: { row: row_count - 1, col: 1 } };
    const tsv: Uint8Array[] = [];
    for await (const chunk of toTsvStream(range, store, options)) tsv.push(chunk);
    expect(new TextDecoder().decode(Buffer.concat(tsv))).toBe(toTsv(range, store, options));
    store.dispose();
  });

  it("surfaces abort and output ceilings through the delimited stream", async () => {
    const store = new SheetwriteStore(workbook(), {
      rowCount: 3,
      columns: { a: ["a", "b", "c"], b: [1, 2, 3] },
    });
    const sheet = store.getWorkbook().sheets[0]!;
    const controller = new AbortController();
    controller.abort(new Error("cancelled CSV stream"));
    const failure_of = async (stream: ReadableStream<Uint8Array>): Promise<unknown> => {
      const reader = stream.getReader();
      try {
        while (!(await reader.read()).done);
      } catch (error) {
        return error;
      }
      throw new Error("expected the stream to fail");
    };
    expect(await failure_of(toCsvStream(sheet, store, { signal: controller.signal }))).toBe(
      controller.signal.reason,
    );
    expect(
      await failure_of(toCsvStream(sheet, store, { resourceLimits: { maxOutputBytes: 8 } })),
    ).toBeInstanceOf(DelimitedTextResourceError);
    store.dispose();
  });
});
