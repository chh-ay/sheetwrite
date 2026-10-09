import type { WorkbookSnapshot } from "@sheetwrite/core";
import { makeUsageSheet, USAGE_SHEET_ID } from "./scenarios/durable-usage.js";

// Pure seed data shared by the showcase and prebuilt-site browser specs.
/** Forecast document: the chaos, conflict and offline proofs run against it. */
export const COLLABORATION_DOCUMENT_ID = "showcase-collaboration";
/**
 * Usage document for the 100,000-cell batch proof. It is a separate document,
 * so conflict recovery on the forecast never reloads its 10 MB of receipts.
 */
export const COLLABORATION_USAGE_DOCUMENT_ID = "showcase-collaboration-usage";
export const COLLABORATION_FORECAST_ROWS = 2_000;
export const COLLABORATION_WORKBOOK_ROWS = COLLABORATION_FORECAST_ROWS + 2;
export const COLLABORATION_WORKBOOK_COLUMNS = 5;

/** Q3 forecast totals row: forecast and weighted value sum all deal rows. */
export const COLLABORATION_TOTAL_CELL = {
  sheet: "plan",
  row: COLLABORATION_FORECAST_ROWS,
  col: 2,
} as const;

/**
 * Two analysts own separate halves of one Q3 pipeline: 2,000 deals across 450
 * accounts, with the weighted value as a per-row formula.
 */
export function makeCollaborationSnapshot(): WorkbookSnapshot {
  const accountPrefixes = [
    "Harbor",
    "Northvale",
    "Cedar",
    "Bridgewell",
    "Summit",
    "Pinecrest",
    "Lakeside",
    "Alder",
    "Westhaven",
    "Meadow",
    "Stonegate",
    "Fieldstone",
    "Clearwater",
    "Oakridge",
    "Brookfield",
    "Redwood",
    "Eastgate",
    "Silverpine",
    "Crestwell",
    "Windward",
    "Mapleline",
    "Riverbend",
    "Hillcrest",
    "Greenfield",
    "Birchwood",
    "Westridge",
    "Fairhaven",
    "Ashford",
    "Parkside",
    "Elmstead",
  ];
  const accountSuffixes = [
    "Studio",
    "Design",
    "Systems",
    "Media",
    "Analytics",
    "Works",
    "Research",
    "Services",
    "Supply",
    "Software",
    "Labs",
    "Group",
    "Digital",
    "Partners",
    "Consulting",
  ];
  const deals = Array.from({ length: COLLABORATION_FORECAST_ROWS }, (_, index) => ({
    account: `${accountPrefixes[index % accountPrefixes.length]} ${
      accountSuffixes[Math.floor(index / accountPrefixes.length) % accountSuffixes.length]
    }`,
    owner: index < COLLABORATION_FORECAST_ROWS / 2 ? "Ana" : "Bram",
    amount: 9_000 + (index % 9) * 1_500 + (Math.floor(index / 90) % 8) * 1_000,
    probability: 40 + (index % 12) * 5,
  }));
  return {
    schemaVersion: 1,
    documentId: COLLABORATION_DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: "plan" },
    sheets: [
      {
        id: "plan",
        name: "Q3 sales forecast",
        order: 0,
        rowCount: COLLABORATION_WORKBOOK_ROWS,
        // Widths total 467: the exact column space of one client Grid at the
        // 1568-wide stage (panel 543, gutter 48, cell padding 12 per column).
        columns: [
          { key: "account", header: "Account", width: 155, type: "text" },
          { key: "analyst", header: "Analyst", width: 60, type: "text" },
          { key: "forecast", header: "Forecast", width: 90, type: "number" },
          { key: "probability", header: "Win %", width: 55, type: "number" },
          { key: "weighted", header: "Weighted", width: 107, type: "number" },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: COLLABORATION_FORECAST_ROWS + 2,
            colCount: COLLABORATION_WORKBOOK_COLUMNS,
            cells: [
              ...deals.flatMap((entry, row) => [
                {
                  rowOffset: row,
                  colOffset: 0,
                  value: { kind: "literal" as const, value: entry.account },
                },
                {
                  rowOffset: row,
                  colOffset: 1,
                  value: { kind: "literal" as const, value: entry.owner },
                },
                {
                  rowOffset: row,
                  colOffset: 2,
                  value: { kind: "literal" as const, value: entry.amount },
                },
                {
                  rowOffset: row,
                  colOffset: 3,
                  value: { kind: "literal" as const, value: entry.probability },
                },
                {
                  rowOffset: row,
                  colOffset: 4,
                  value: { kind: "formula" as const, src: `=C${row + 1}*D${row + 1}/100` },
                },
              ]),
              {
                rowOffset: COLLABORATION_TOTAL_CELL.row,
                colOffset: 0,
                value: { kind: "literal" as const, value: "Q3 total" },
              },
              {
                rowOffset: COLLABORATION_TOTAL_CELL.row,
                colOffset: 2,
                value: {
                  kind: "formula" as const,
                  src: `=SUM(C1:C${COLLABORATION_FORECAST_ROWS})`,
                },
              },
              {
                rowOffset: COLLABORATION_TOTAL_CELL.row,
                colOffset: 4,
                value: {
                  kind: "formula" as const,
                  src: `=SUM(E1:E${COLLABORATION_FORECAST_ROWS})`,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/** The metered-usage sheet as its own document. */
export function makeCollaborationUsageSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: COLLABORATION_USAGE_DOCUMENT_ID,
    version: 0,
    workbook: { activeSheet: USAGE_SHEET_ID },
    sheets: [{ ...makeUsageSheet(), order: 0 }],
  };
}
