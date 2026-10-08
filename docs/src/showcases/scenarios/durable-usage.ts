import type { SheetSnapshot } from "@sheetwrite/core";

export const USAGE_SHEET_ID = "usage";
export const USAGE_ROWS = 50_000;
export const USAGE_CELLS = USAGE_ROWS * 2;
export const USAGE_TOTAL_CELL = {
  sheet: USAGE_SHEET_ID,
  row: USAGE_ROWS + 1,
  col: 0,
} as const;
export const USAGE_RANGE = {
  sheet: USAGE_SHEET_ID,
  start: { row: 0, col: 0 },
  end: { row: USAGE_ROWS - 1, col: 1 },
} as const;

/** Metered events retain a receipt checksum for invoice reconciliation. */
export function makeUsageSheet(): SheetSnapshot {
  let randomState = 0x4f21c8a7;
  const receipt = () => {
    let checksum = "";
    for (let digit = 0; digit < 64; digit++) {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      checksum += (randomState >>> 28).toString(16);
    }
    return checksum;
  };
  return {
    id: USAGE_SHEET_ID,
    name: "Metered usage · March",
    order: 1,
    rowCount: USAGE_ROWS + 2,
    columns: [
      { key: "units", header: "Billable units", width: 145, type: "number" },
      { key: "receipt", header: "Invoice reconciliation receipt", width: 620, type: "text" },
    ],
    cells: [
      {
        startRow: 0,
        startCol: 0,
        rowCount: USAGE_ROWS + 2,
        colCount: 2,
        cells: [
          ...Array.from({ length: USAGE_ROWS }, (_, row) => [
            {
              rowOffset: row,
              colOffset: 0,
              value: { kind: "literal" as const, value: 1 + (row % 20) },
            },
            {
              rowOffset: row,
              colOffset: 1,
              value: {
                kind: "literal" as const,
                value: `March 2026 · Usage event ${String(row + 1).padStart(6, "0")} · Invoice reconciliation: billable service units accepted; receipt checksum ${receipt()}`,
              },
            },
          ]).flat(),
          {
            rowOffset: USAGE_TOTAL_CELL.row,
            colOffset: 0,
            value: { kind: "formula" as const, src: `=SUM(A1:A${USAGE_ROWS})` },
          },
          {
            rowOffset: USAGE_TOTAL_CELL.row,
            colOffset: 1,
            value: { kind: "literal" as const, value: "March billable units" },
          },
        ],
      },
    ],
  };
}
