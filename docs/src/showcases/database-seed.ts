import type { WorkbookSnapshot } from "@sheetwrite/core";

// Pure seed data shared by the showcase and prebuilt-site browser specs.
/** Document id the public database proof persists under. */
export const DATABASE_DOCUMENT_ID = "showcase-database";

/** Jan, Feb, and Mar rows for the twelve subscription accounts. */
export const DATABASE_REVENUE_ROWS = 36;

/** Q1 totals row: revenue, service cost, and gross margin sum all 36 rows. */
export const DATABASE_TOTAL_CELL = { sheet: "ledger", row: DATABASE_REVENUE_ROWS, col: 3 } as const;

/**
 * Three months of tiered subscription revenue. Every account adds seats each
 * month, so revenue grows month over month while gross margin stays positive.
 */
export function makeDatabaseSeedSnapshot(): WorkbookSnapshot {
  const accounts: ReadonlyArray<readonly [string, number, number, number]> = [
    ["Harbor Studio", 18, 29, 9],
    ["Northvale Design", 32, 49, 14],
    ["Cedar Systems", 46, 79, 22],
    ["Bridgewell Media", 24, 29, 9],
    ["Summit Analytics", 65, 49, 14],
    ["Pinecrest Works", 38, 79, 22],
    ["Lakeside Research", 52, 29, 9],
    ["Alder Services", 29, 49, 14],
    ["Westhaven Supply", 81, 79, 22],
    ["Meadow Software", 43, 29, 9],
    ["Stonegate Labs", 57, 49, 14],
    ["Fieldstone Group", 35, 79, 22],
  ];
  const months = ["Jan", "Feb", "Mar"];
  const lines = months.flatMap((month, monthIndex) =>
    accounts.map(([account, seats, rate, cost], index) => ({
      account: `${month} · ${account}`,
      seats: seats + monthIndex * (2 + (index % 4)),
      rate,
      cost,
    })),
  );
  return {
    schemaVersion: 1,
    documentId: DATABASE_DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: "ledger" },
    sheets: [
      {
        id: "ledger",
        name: "Subscription revenue · Q1",
        order: 0,
        rowCount: DATABASE_REVENUE_ROWS + 2,
        // Widths total 1010: the exact column space next to the stage rail at
        // the 1568-wide stage (panel 1058, gutter 48, cell padding 12 per column).
        columns: [
          { key: "account", header: "Month / account", width: 250, type: "text" },
          { key: "seats", header: "Seats", width: 120, type: "number" },
          { key: "rate", header: "Monthly rate", width: 150, type: "number" },
          { key: "revenue", header: "Revenue", width: 172, type: "number" },
          { key: "cost", header: "Service cost", width: 160, type: "number" },
          { key: "margin", header: "Gross margin", width: 158, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: DATABASE_REVENUE_ROWS + 2,
            colCount: 6,
            cells: [
              ...lines.flatMap((line, row) => [
                {
                  rowOffset: row,
                  colOffset: 0,
                  value: { kind: "literal" as const, value: line.account },
                },
                {
                  rowOffset: row,
                  colOffset: 1,
                  value: { kind: "literal" as const, value: line.seats },
                },
                {
                  rowOffset: row,
                  colOffset: 2,
                  value: { kind: "literal" as const, value: line.rate },
                },
                {
                  rowOffset: row,
                  colOffset: 3,
                  value: { kind: "formula" as const, src: `=B${row + 1}*C${row + 1}` },
                },
                {
                  rowOffset: row,
                  colOffset: 4,
                  value: { kind: "formula" as const, src: `=B${row + 1}*${line.cost}` },
                },
                {
                  rowOffset: row,
                  colOffset: 5,
                  value: { kind: "formula" as const, src: `=D${row + 1}-E${row + 1}` },
                },
              ]),
              {
                rowOffset: DATABASE_TOTAL_CELL.row,
                colOffset: 0,
                value: { kind: "literal" as const, value: "Q1 total" },
              },
              ...[3, 4, 5].map((col) => ({
                rowOffset: DATABASE_TOTAL_CELL.row,
                colOffset: col,
                value: {
                  kind: "formula" as const,
                  src: `=SUM(${String.fromCharCode(65 + col)}1:${String.fromCharCode(65 + col)}${DATABASE_REVENUE_ROWS})`,
                },
              })),
            ],
          },
        ],
      },
    ],
  };
}
