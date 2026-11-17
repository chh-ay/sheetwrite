import type { DocumentOp, Grid, Workbook } from "@sheetwrite/core";
import { formulaAssistAddon } from "@sheetwrite/formula-assist";

import type { LiveScenario } from "./live-scenario.js";
import { createListeners, mountShowcaseShell, requireApplied } from "./showcase-shell.js";

// The formula assist showcase: a six-month budget with row totals, shares and
// column totals, and a Rates sheet to look prices up in. A few totals and
// shares are left empty, so typing them in the formula bar shows what the
// add-on predicts from their neighbours.

export const BUDGET_SHEET = "budget";
export const RATES_SHEET = "rates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] as const;
export const DEPARTMENTS = [
  "Sales",
  "Marketing",
  "Support",
  "Engineering",
  "Finance",
  "Legal",
  "Operations",
  "People",
  "Facilities",
  "Research",
] as const;

/** Columns: Department, the six months, Total, Share, Category, Rate. */
export const TOTAL_COL = 1 + MONTHS.length;
export const SHARE_COL = TOTAL_COL + 1;
/** 0-based rows: the header, one row per department, a blank row, then the totals row. */
const FIRST_ROW = 1;
const LAST_ROW = FIRST_ROW + DEPARTMENTS.length - 1;
export const TOTALS_ROW = LAST_ROW + 2;

/**
 * Cells left empty for the reader (and the demo) to type: two row totals, a
 * share and a month total. Each has neighbours that agree, so the formula bar
 * suggests the formula as soon as `=` is typed.
 */
export const OPEN_CELLS = {
  rowTotal: { row: FIRST_ROW + 4, col: TOTAL_COL },
  share: { row: FIRST_ROW + 4, col: SHARE_COL },
  monthTotal: { row: TOTALS_ROW, col: 3 },
  secondRowTotal: { row: FIRST_ROW + 7, col: TOTAL_COL },
} as const;

/** The 1-based row of a 0-based one, as formulas write it. */
const line = (row: number): number => row + 1;
const letter = (col: number): string => String.fromCharCode(65 + col);

/** Every formula the budget holds once the open cells are filled in. */
export const FORMULA_COUNT = DEPARTMENTS.length * 2 + MONTHS.length + 1;

function budgetWorkbook(): Workbook {
  const money = { type: "number", numberFormat: "$#,##0" } as const;
  return {
    activeSheet: BUDGET_SHEET,
    sheets: [
      {
        id: BUDGET_SHEET,
        name: "Budget",
        rowCount: TOTALS_ROW + 6,
        columns: [
          { key: "department", header: "A", width: 120, type: "text" },
          ...MONTHS.map((month) => ({ key: month.toLowerCase(), header: month, width: 84, ...money })),
          { key: "total", header: "Total", width: 96, ...money },
          { key: "share", header: "Share", width: 80, type: "number", numberFormat: "0.0%" },
          { key: "notes", header: "Notes", width: 160, type: "text" },
        ],
      },
      {
        id: RATES_SHEET,
        name: "Rates",
        rowCount: DEPARTMENTS.length + 1,
        columns: [
          { key: "department", header: "A", width: 120, type: "text" },
          { key: "rate", header: "B", width: 96, type: "number", numberFormat: "0.0%" },
        ],
      },
    ],
  };
}

function isOpen(row: number, col: number): boolean {
  return Object.values(OPEN_CELLS).some((cell) => cell.row === row && cell.col === col);
}

/** The budget's values and formulas, with the open cells left empty. */
function budgetOperations(): DocumentOp[] {
  const operations: DocumentOp[] = [];
  const put = (sheet: string, row: number, col: number, value: string | number): void => {
    if (isOpen(row, col) && sheet === BUDGET_SHEET) return;
    const cell =
      typeof value === "string" && value.startsWith("=")
        ? { kind: "formula" as const, src: value }
        : { kind: "literal" as const, value };
    operations.push({ op: "set", addr: { sheet, row, col }, value: cell });
  };

  put(BUDGET_SHEET, 0, 0, "Department");
  MONTHS.forEach((month, index) => put(BUDGET_SHEET, 0, 1 + index, month));
  put(BUDGET_SHEET, 0, TOTAL_COL, "Total");
  put(BUDGET_SHEET, 0, SHARE_COL, "Share");
  const totalsLine = line(TOTALS_ROW);
  DEPARTMENTS.forEach((department, index) => {
    const row = FIRST_ROW + index;
    put(BUDGET_SHEET, row, 0, department);
    MONTHS.forEach((_, month) => {
      put(BUDGET_SHEET, row, 1 + month, 4_000 + ((index * 1_733 + month * 911) % 9_000));
    });
    put(BUDGET_SHEET, row, TOTAL_COL, `=SUM(B${line(row)}:${letter(TOTAL_COL - 1)}${line(row)})`);
    put(BUDGET_SHEET, row, SHARE_COL, `=${letter(TOTAL_COL)}${line(row)}/${letter(TOTAL_COL)}$${totalsLine}`);
    put(RATES_SHEET, index, 0, department);
    put(RATES_SHEET, index, 1, 0.02 + (index % 5) * 0.01);
  });
  put(BUDGET_SHEET, TOTALS_ROW, 0, "Total");
  for (let col = 1; col <= TOTAL_COL; col++) {
    put(BUDGET_SHEET, TOTALS_ROW, col, `=SUM(${letter(col)}${line(FIRST_ROW)}:${letter(col)}${line(LAST_ROW)})`);
  }
  return operations;
}

export interface FormulaAssistSnapshot {
  /** The open cells the reader has filled in, of all of them. */
  readonly filled: number;
}

export interface FormulaAssistScenario extends LiveScenario<FormulaAssistSnapshot> {
  /** Select an open cell and put the caret in the formula bar, ready to type. */
  focusCell(id: keyof typeof OPEN_CELLS): void;
  /** Put the open cells back to empty. */
  reset(): void;
}

/** Mount the budget in the spreadsheet shell, with formula assist installed. */
export function createFormulaAssistScenario(host: HTMLElement): FormulaAssistScenario {
  const controller = new AbortController();
  const listeners = createListeners();
  let grid: Grid | null = null;
  let dispose = () => {};

  const snapshot = (): FormulaAssistSnapshot => ({
    filled: Object.values(OPEN_CELLS).filter(
      (cell) => grid?.store.getCell({ sheet: BUDGET_SHEET, ...cell }).resolved !== null,
    ).length,
  });

  const ready = (async () => {
    const shell = await mountShowcaseShell(
      host,
      { workbook: budgetWorkbook() },
      controller.signal,
      [formulaAssistAddon()],
    );
    if (!shell) return;
    grid = shell.grid;
    requireApplied(grid.applyRemoteOperations(budgetOperations()), "The budget");
    const stopChanges = grid.on("change", () => listeners.notify());
    dispose = () => {
      stopChanges();
      shell.dispose();
    };
    listeners.notify();
  })();

  return {
    ready,
    subscribe: listeners.subscribe,
    snapshot,
    focusCell(id) {
      const cell = OPEN_CELLS[id];
      grid?.select({ row: cell.row, col: cell.col });
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Formula bar"]')?.focus();
    },
    reset() {
      const current = grid;
      if (current === null) return;
      current.applyTransaction({
        patches: Object.values(OPEN_CELLS).map((cell) => ({
          op: "set",
          addr: { sheet: BUDGET_SHEET, ...cell },
          value: { kind: "literal", value: null },
        })),
      });
    },
    dispose() {
      controller.abort();
      dispose();
    },
  };
}
