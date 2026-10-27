import {
  initSheetwrite,
  type CellStyle,
  type DocumentOp,
  type Grid,
  type Workbook,
} from "@sheetwrite/core";
import { createSpreadsheetShell, type SpreadsheetShell } from "@sheetwrite/core/shell";

import { observeSiteTheme } from "../../lib/site-theme.js";
import { siteGridTheme } from "../site-grid-theme.js";

// A two-sheet sales workbook for the ribbon showcase: a ledger of orders and a
// summary that reads it through cross-sheet SUMIF formulas, so every ribbon
// command has real numbers, dates and text to act on.

export const SALES_SHEET = "sales";
export const SUMMARY_SHEET = "summary";
export const SALES_ROWS = 48;

const REGIONS = ["North", "South", "East", "West"] as const;
const REPS = ["Avery", "Blake", "Casey", "Devon", "Emery", "Finley"] as const;
const PRODUCTS = [
  ["Desk lamp", 39.5],
  ["Monitor arm", 89],
  ["Keyboard", 64.25],
  ["Webcam", 79.99],
  ["Headset", 112],
] as const;

/** Excel serial for 2 January 2026, the first order date. */
const FIRST_ORDER_SERIAL = 46024;
const DAYS_BETWEEN_ORDERS = 2;

const HEADER_STYLE: CellStyle = {
  bold: true,
  backgroundColor: "#e2efda",
  color: "#1f3d2b",
  border: { bottom: { color: "#5b8a6b", width: 1 } },
};
const TOTAL_STYLE: CellStyle = {
  bold: true,
  border: { top: { color: "#5b8a6b", width: 1 }, bottom: { color: "#5b8a6b", width: 2 } },
};

const CURRENCY = "$#,##0.00";
const SHARE = "0.0%";

const column = (key: string, header: string, width: number, type: "text" | "number" = "text") => ({
  key,
  header,
  width,
  type,
});

/** G3: the revenue of the second order, which the note explains. */
export const SALES_NOTE_CELL = { sheet: SALES_SHEET, row: 2, col: 6 } as const;
export const SALES_NOTE_TEXT = "Includes a 10% volume discount, approved by Maya.";

/** Workbook schema: both sheets, with Excel-like widths. Values arrive as operations. */
export function salesWorkbook(): Workbook {
  return {
    activeSheet: SALES_SHEET,
    sheets: [
      {
        id: SALES_SHEET,
        name: "Sales",
        // Header, orders, and one empty row where AutoSum can total a column.
        rowCount: SALES_ROWS + 2,
        columns: [
          column("date", "Date", 96, "number"),
          column("region", "Region", 88),
          column("rep", "Rep", 88),
          column("product", "Product", 120),
          column("units", "Units", 72, "number"),
          column("price", "Unit price", 96, "number"),
          column("revenue", "Revenue", 112, "number"),
        ],
        // One note, so the amber corner and its hover card have something to show.
        notes: [{ addr: SALES_NOTE_CELL, text: SALES_NOTE_TEXT }],
      },
      {
        id: SUMMARY_SHEET,
        name: "Summary",
        rowCount: REGIONS.length + 2,
        columns: [
          column("region", "Region", 112),
          column("units", "Units", 88, "number"),
          column("revenue", "Revenue", 120, "number"),
          column("share", "Share", 88, "number"),
        ],
      },
    ],
  };
}

const literal = (sheet: string, row: number, col: number, value: string | number): DocumentOp => ({
  op: "set",
  addr: { sheet, row, col },
  value: { kind: "literal", value },
});

const formula = (sheet: string, row: number, col: number, src: string): DocumentOp => ({
  op: "set",
  addr: { sheet, row, col },
  value: { kind: "formula", src },
});

const style = (
  sheet: string,
  rows: [number, number],
  cols: [number, number],
  patch: CellStyle,
): DocumentOp => ({
  op: "setRangeStyle",
  range: {
    sheet,
    start: { row: rows[0], col: cols[0] },
    end: { row: rows[1], col: cols[1] },
  },
  style: patch,
});

/** One order per row; deterministic so tests and screenshots are stable. */
export function salesOrder(index: number) {
  const product = PRODUCTS[(index * 3) % PRODUCTS.length] ?? PRODUCTS[0];
  return {
    serial: FIRST_ORDER_SERIAL + index * DAYS_BETWEEN_ORDERS,
    region: REGIONS[index % REGIONS.length] ?? REGIONS[0],
    rep: REPS[(index * 5) % REPS.length] ?? REPS[0],
    product: product[0],
    units: 2 + ((index * 7) % 23),
    price: product[1],
  };
}

/** Every value, formula and style both sheets start with, as one transaction. */
export function salesOperations(): DocumentOp[] {
  const ops: DocumentOp[] = [];
  const lastSalesRow = SALES_ROWS + 1;

  ["Date", "Region", "Rep", "Product", "Units", "Unit price", "Revenue"].forEach((title, col) =>
    ops.push(literal(SALES_SHEET, 0, col, title)),
  );
  for (let index = 0; index < SALES_ROWS; index += 1) {
    const row = index + 1;
    const order = salesOrder(index);
    ops.push(
      literal(SALES_SHEET, row, 0, order.serial),
      literal(SALES_SHEET, row, 1, order.region),
      literal(SALES_SHEET, row, 2, order.rep),
      literal(SALES_SHEET, row, 3, order.product),
      literal(SALES_SHEET, row, 4, order.units),
      literal(SALES_SHEET, row, 5, order.price),
      // Sheet rows are 1-based in formulas: data row `row` is spreadsheet row row + 1.
      formula(SALES_SHEET, row, 6, `=E${row + 1}*F${row + 1}`),
    );
  }
  ops.push(
    style(SALES_SHEET, [0, 0], [0, 6], HEADER_STYLE),
    style(SALES_SHEET, [1, SALES_ROWS], [0, 0], { numberFormat: "m/d/yyyy" }),
    style(SALES_SHEET, [1, SALES_ROWS], [5, 6], { numberFormat: CURRENCY }),
  );

  const regions = `Sales!$B$2:$B$${lastSalesRow}`;
  const totalRow = REGIONS.length + 1;
  ["Region", "Units", "Revenue", "Share"].forEach((title, col) =>
    ops.push(literal(SUMMARY_SHEET, 0, col, title)),
  );
  REGIONS.forEach((region, index) => {
    const row = index + 1;
    const cell = row + 1;
    ops.push(
      literal(SUMMARY_SHEET, row, 0, region),
      formula(SUMMARY_SHEET, row, 1, `=SUMIF(${regions},A${cell},Sales!$E$2:$E$${lastSalesRow})`),
      formula(SUMMARY_SHEET, row, 2, `=SUMIF(${regions},A${cell},Sales!$G$2:$G$${lastSalesRow})`),
      formula(SUMMARY_SHEET, row, 3, `=C${cell}/$C$${totalRow + 1}`),
    );
  });
  ops.push(
    literal(SUMMARY_SHEET, totalRow, 0, "Total"),
    formula(SUMMARY_SHEET, totalRow, 1, `=SUM(B2:B${totalRow})`),
    formula(SUMMARY_SHEET, totalRow, 2, `=SUM(C2:C${totalRow})`),
    formula(SUMMARY_SHEET, totalRow, 3, `=SUM(D2:D${totalRow})`),
    style(SUMMARY_SHEET, [0, 0], [0, 3], HEADER_STYLE),
    style(SUMMARY_SHEET, [1, totalRow], [2, 2], { numberFormat: CURRENCY }),
    style(SUMMARY_SHEET, [1, totalRow], [3, 3], { numberFormat: SHARE }),
    style(SUMMARY_SHEET, [totalRow, totalRow], [0, 3], TOTAL_STYLE),
  );
  return ops;
}

export interface SpreadsheetScenario {
  readonly ready: Promise<void>;
  grid(): Grid | null;
  dispose(): void;
}

/**
 * Mount the full shell (ribbon, name box, formula bar, grid, sheet tabs,
 * status) with the sales workbook, and keep it on the site's light or dark
 * theme. Public API only.
 */
export function createSpreadsheetScenario(host: HTMLElement): SpreadsheetScenario {
  let shell: SpreadsheetShell | null = null;
  let disposed = false;

  const ready = initSheetwrite().then(() => {
    if (disposed) return;
    shell = createSpreadsheetShell(host, {
      ribbon: true,
      grid: { workbook: salesWorkbook(), theme: siteGridTheme(), config: {} },
    });
    const result = shell.grid.applyTransaction({ patches: salesOperations() });
    if (result.status === "rejected") {
      throw new Error(
        `The sales workbook did not load: ${result.issues[0]?.message ?? "rejected"}`,
      );
    }
    if (result.status !== "applied")
      throw new Error(`The sales workbook did not load: ${result.status}`);
    shell.grid.setSelection({ kind: "cell", addr: { sheet: SALES_SHEET, row: 1, col: 6 } });
  });

  const stopTheme = observeSiteTheme(() => shell?.setTheme(siteGridTheme()));

  return {
    ready,
    grid: () => shell?.grid ?? null,
    dispose() {
      disposed = true;
      stopTheme();
      shell?.destroy();
      shell = null;
    },
  };
}
