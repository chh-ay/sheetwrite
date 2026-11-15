import { describe, expect, it } from "bun:test";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import { rawXlsx, worksheet } from "./raw-opc.js";

/** The last row of a worksheet: one outline row per sheet row. */
const SHEET_ROWS = 1_048_576;
/** Isolated outlined rows: every other row, so each one is its own group. */
const ISOLATED_OUTLINE_ROWS = 200_000;
/** Full-width column declarations that each cover every column. */
const OVERLAPPING_COLUMN_DECLARATIONS = 5_000;
const LAST_COLUMN = 16_384;
/** Each hostile workbook must import in well under the default test timeout. */
const TIMEOUT_MS = 30_000;

function outlinedRows(rows: Iterable<number>, attributes = ""): string {
  let xml = "";
  for (const row of rows) xml += `<row r="${row + 1}" outlineLevel="1"${attributes}/>`;
  return xml;
}

function* range(count: number, step = 1): Generator<number> {
  for (let index = 0; index < count; index++) yield index * step;
}

describe("hostile worksheets", () => {
  it(
    "reads an outline over every sheet row",
    async () => {
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({
          sheets: [{ xml: worksheet(`<sheetData>${outlinedRows(range(SHEET_ROWS))}</sheetData>`) }],
        }),
      );

      expect(imported.sheets[0]?.rowGroups).toEqual([
        { start: 0, end: SHEET_ROWS - 1, collapsed: false },
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "groups isolated outlined rows in one walk and keeps their hidden state",
    async () => {
      const rows = outlinedRows(range(ISOLATED_OUTLINE_ROWS, 2), ' hidden="1"');
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({
          sheets: [
            {
              xml: worksheet(
                `<sheetData>${rows}<row r="${ISOLATED_OUTLINE_ROWS * 2 + 1}" outlineLevel="1"/></sheetData>`,
              ),
            },
          ],
        }),
      );

      const groups = imported.sheets[0]?.rowGroups ?? [];
      expect(groups).toHaveLength(ISOLATED_OUTLINE_ROWS + 1);
      expect(groups[0]).toEqual({ start: 0, end: 0, collapsed: true });
      expect(groups.at(-1)).toEqual({
        start: ISOLATED_OUTLINE_ROWS * 2,
        end: ISOLATED_OUTLINE_ROWS * 2,
        collapsed: false,
      });
    },
    TIMEOUT_MS,
  );

  it(
    "resolves overlapping full-width column declarations once per column",
    async () => {
      let columns = "";
      for (let declaration = 1; declaration <= OVERLAPPING_COLUMN_DECLARATIONS; declaration++) {
        columns += `<col min="${declaration}" max="${LAST_COLUMN}" width="${declaration}" customWidth="1"/>`;
      }
      const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({
          sheets: [{ xml: worksheet(`<cols>${columns}</cols><sheetData/>`) }],
        }),
      );

      const widths = imported.sheets[0]?.columns.map((column) => column.width) ?? [];
      expect(widths).toHaveLength(LAST_COLUMN);
      expect(widths[0]).toBeLessThan(widths[1] ?? 0);
      expect(widths[OVERLAPPING_COLUMN_DECLARATIONS - 1]).toBe(widths[LAST_COLUMN - 1]);
    },
    TIMEOUT_MS,
  );
});
