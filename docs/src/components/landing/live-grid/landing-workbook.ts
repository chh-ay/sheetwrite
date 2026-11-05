import type { CellStyle, DocumentOp, Workbook } from "@sheetwrite/core";

/**
 * The workbook in the landing hero: four regions with units and a unit price,
 * revenue and share computed by formulas, and a total row. The same rows feed
 * the server-rendered preview and the live grid, so the swap is seamless.
 */

export const LANDING_SHEET = "sales";

/** One region's inputs; revenue and share are formulas. */
export interface LandingRegion {
  readonly region: string;
  readonly units: number;
  readonly price: number;
}

export const LANDING_REGIONS: readonly LandingRegion[] = [
  { region: "North", units: 128, price: 42 },
  { region: "West", units: 96, price: 48 },
  { region: "South", units: 112, price: 44 },
  { region: "East", units: 104, price: 46 },
];

export const LANDING_HEADERS = ["Region", "Units", "Price", "Revenue", "Share"] as const;

/** Spreadsheet row of the totals: the header row plus every region, 1-based. */
const TOTAL_ROW = LANDING_REGIONS.length + 2;
/** Zero-based row index of the totals in the sheet. */
const TOTAL_INDEX = TOTAL_ROW - 1;
const COLUMN_WIDTHS = [112, 84, 84, 104, 84] as const;
/** Empty rows under the totals, so the grid reads as a sheet, not a table. */
const SPARE_ROWS = 6;

const CURRENCY = "$#,##0";
const SHARE = "0.0%";
const HEADER_STYLE: CellStyle = { bold: true };
const TOTAL_STYLE: CellStyle = { bold: true, border: { top: { color: "#7a8494", width: 1 } } };

/** The formula each computed cell holds, in A1 notation. */
export function revenueFormula(row: number): string {
  return `=B${row}*C${row}`;
}

export function shareFormula(row: number): string {
  return `=D${row}/D$${TOTAL_ROW}`;
}

export const TOTAL_FORMULAS = {
  units: `=SUM(B2:B${TOTAL_ROW - 1})`,
  revenue: `=SUM(D2:D${TOTAL_ROW - 1})`,
  share: `=SUM(E2:E${TOTAL_ROW - 1})`,
} as const;

/** The schema: one sheet, Excel-like widths. Values arrive as operations. */
export function landingWorkbook(): Workbook {
  return {
    activeSheet: LANDING_SHEET,
    sheets: [
      {
        id: LANDING_SHEET,
        name: "Sales",
        rowCount: TOTAL_ROW + SPARE_ROWS,
        columns: LANDING_HEADERS.map((header, index) => ({
          key: header.toLowerCase(),
          header,
          width: COLUMN_WIDTHS[index] ?? COLUMN_WIDTHS[0],
          type: index === 0 ? ("text" as const) : ("number" as const),
        })),
      },
    ],
  };
}

const at = (row: number, col: number) => ({ sheet: LANDING_SHEET, row, col });

/** Every value, formula and style the hero workbook starts with, as one transaction. */
export function landingOperations(): DocumentOp[] {
  const ops: DocumentOp[] = LANDING_HEADERS.map((header, col) => ({
    op: "set",
    addr: at(0, col),
    value: { kind: "literal", value: header },
  }));
  LANDING_REGIONS.forEach((entry, index) => {
    const row = index + 1;
    const sheetRow = row + 1;
    ops.push(
      { op: "set", addr: at(row, 0), value: { kind: "literal", value: entry.region } },
      { op: "set", addr: at(row, 1), value: { kind: "literal", value: entry.units } },
      { op: "set", addr: at(row, 2), value: { kind: "literal", value: entry.price } },
      { op: "set", addr: at(row, 3), value: { kind: "formula", src: revenueFormula(sheetRow) } },
      { op: "set", addr: at(row, 4), value: { kind: "formula", src: shareFormula(sheetRow) } },
    );
  });
  ops.push(
    { op: "set", addr: at(TOTAL_INDEX, 0), value: { kind: "literal", value: "Total" } },
    { op: "set", addr: at(TOTAL_INDEX, 1), value: { kind: "formula", src: TOTAL_FORMULAS.units } },
    {
      op: "set",
      addr: at(TOTAL_INDEX, 3),
      value: { kind: "formula", src: TOTAL_FORMULAS.revenue },
    },
    { op: "set", addr: at(TOTAL_INDEX, 4), value: { kind: "formula", src: TOTAL_FORMULAS.share } },
    rangeStyle([0, 0], [0, LANDING_HEADERS.length - 1], HEADER_STYLE),
    rangeStyle([1, TOTAL_INDEX], [2, 3], { numberFormat: CURRENCY }),
    rangeStyle([1, TOTAL_INDEX], [4, 4], { numberFormat: SHARE }),
    rangeStyle([TOTAL_INDEX, TOTAL_INDEX], [0, LANDING_HEADERS.length - 1], TOTAL_STYLE),
  );
  return ops;
}

function rangeStyle(rows: [number, number], cols: [number, number], style: CellStyle): DocumentOp {
  return {
    op: "setRangeStyle",
    range: {
      sheet: LANDING_SHEET,
      start: { row: rows[0], col: cols[0] },
      end: { row: rows[1], col: cols[1] },
    },
    style,
  };
}

/** The values the formulas produce, for the server-rendered preview. */
export function landingPreviewRows(): string[][] {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const percent = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const revenues = LANDING_REGIONS.map((entry) => entry.units * entry.price);
  const totalRevenue = revenues.reduce((sum, revenue) => sum + revenue, 0);
  const totalUnits = LANDING_REGIONS.reduce((sum, entry) => sum + entry.units, 0);
  return [
    [...LANDING_HEADERS],
    ...LANDING_REGIONS.map((entry, index) => [
      entry.region,
      String(entry.units),
      money.format(entry.price),
      money.format(revenues[index] ?? 0),
      percent.format((revenues[index] ?? 0) / totalRevenue),
    ]),
    ["Total", String(totalUnits), "", money.format(totalRevenue), percent.format(1)],
  ];
}
