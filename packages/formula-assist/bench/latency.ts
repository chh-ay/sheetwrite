// The latency budget of formula assist: a suggestion within 4 ms at the 95th
// percentile per key on a 100,000-row sheet. Types 200 formulas spread over
// such a sheet and times opening each edit and every `suggest` call.
//
//   bench-run --slot 4 bun packages/formula-assist/bench/latency.ts [--json out.json]
//
// Run it on a quiet core (bench-run on Linux, mac-quiet on the Mac) and
// never compare the two machines' numbers.

import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  type CellValue,
  colToA1,
  type Column,
  initSheetwrite,
  SheetwriteStore,
  type SnapshotCell,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { analyzeFormula } from "@sheetwrite/core/functions";
import { type GhostOnScreen, openFormulaEdit, shownSuggestion } from "@sheetwrite/core/testing";

import { attachPredictor, SIGNALS } from "../src/predictor.js";
import { SLICE_MS, WorkbookPatterns } from "../src/workbook-patterns.js";

const DATA_ROWS = 100_000;
const PRODUCTS = 50;
const REGIONS = ["North", "South", "East", "West", "Central", "Export"];
const TARGETS = 200;
/** The budget per key at the 95th percentile. */
const BUDGET_MS = 4;
const P50 = 0.5;
const P95 = 0.95;
/** Excel's first date serial in 2026. */
const FIRST_DATE = 46_023;
const DAYS = 365;
const MAX_QUANTITY = 40;
const PRICE_STEP = 1.25;

const { values } = parseArgs({ options: { json: { type: "string" } } });

function columns(names: readonly string[]): Column[] {
  return names.map((name, index) => ({ key: `c${index}`, header: name, width: 100, type: "text" }));
}

function literal(value: string | number): CellValue {
  return { kind: "literal", value };
}

/**
 * Orders: ID, Region, Product, Date, Qty, Price, Amount (=E*F) and Taxed
 * (=IF(B="West",G*1.1,G)) on 100,000 rows under a header row. Products: a
 * lookup table of names, prices and categories.
 */
function workbook(): WorkbookSnapshot {
  const orders: SnapshotCell[] = [];
  const headers = ["ID", "Region", "Product", "Date", "Qty", "Price", "Amount", "Taxed"];
  for (const [col, header] of headers.entries()) {
    orders.push({ rowOffset: 0, colOffset: col, value: literal(header) });
  }
  for (let index = 0; index < DATA_ROWS; index++) {
    const row = index + 1;
    const a1 = row + 1;
    const cells: CellValue[] = [
      literal(index + 1),
      literal(REGIONS[index % REGIONS.length] ?? "North"),
      literal(`Product ${(index * 7) % PRODUCTS}`),
      literal(FIRST_DATE + (index % DAYS)),
      literal(1 + (index % MAX_QUANTITY)),
      literal(PRICE_STEP * (1 + (index % PRODUCTS))),
      { kind: "formula", src: `=E${a1}*F${a1}` },
      { kind: "formula", src: `=IF(B${a1}="West",G${a1}*1.1,G${a1})` },
    ];
    for (const [col, value] of cells.entries())
      orders.push({ rowOffset: row, colOffset: col, value });
  }

  const products: SnapshotCell[] = ["Product", "Price", "Category"].map((header, col) => ({
    rowOffset: 0,
    colOffset: col,
    value: literal(header),
  }));
  for (let index = 0; index < PRODUCTS; index++) {
    products.push(
      { rowOffset: index + 1, colOffset: 0, value: literal(`Product ${index}`) },
      { rowOffset: index + 1, colOffset: 1, value: literal(PRICE_STEP * (1 + index)) },
      { rowOffset: index + 1, colOffset: 2, value: literal(`Category ${index % REGIONS.length}`) },
    );
  }

  const order_columns = [...headers, "Lookup", "Share"];
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "orders" },
    sheets: [
      {
        id: "orders",
        name: "Orders",
        order: 0,
        rowCount: DATA_ROWS + 2,
        columns: columns(order_columns),
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: DATA_ROWS + 1,
            colCount: headers.length,
            cells: orders,
          },
        ],
      },
      {
        id: "products",
        name: "Products",
        order: 1,
        rowCount: PRODUCTS + 1,
        columns: columns(["Product", "Price", "Category"]),
        cells: [{ startRow: 0, startCol: 0, rowCount: PRODUCTS + 1, colCount: 3, cells: products }],
      },
    ],
  };
}

/** The formulas typed: copies of the formula columns, lookups beside them, and totals under 100,000 rows. */
function targets(): { row: number; col: number; formula: string }[] {
  const list: { row: number; col: number; formula: string }[] = [];
  const step = Math.floor(DATA_ROWS / TARGETS);
  for (let index = 0; index < TARGETS; index++) {
    const row = 1 + index * step;
    const a1 = row + 1;
    switch (index % 4) {
      case 0:
        list.push({ row, col: 6, formula: `=E${a1}*F${a1}` });
        break;
      case 1:
        list.push({ row, col: 7, formula: `=IF(B${a1}="West",G${a1}*1.1,G${a1})` });
        break;
      case 2:
        list.push({ row, col: 8, formula: `=XLOOKUP(C${a1},Products!A:A,Products!B:B)` });
        break;
      default: {
        const col = 4 + (index % 3);
        const letter = colToA1(col);
        list.push({
          row: DATA_ROWS + 1,
          col,
          formula: `=SUM(${letter}2:${letter}${DATA_ROWS + 1})`,
        });
      }
    }
  }
  return list;
}

function percentile(sorted: readonly number[], rank: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(rank * sorted.length))] ?? 0;
}

/** Times of one step, in milliseconds. */
interface Summary {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

function summary(samples: number[]): Summary {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    count: sorted.length,
    p50: percentile(sorted, P50),
    p95: percentile(sorted, P95),
    max: sorted.at(-1) ?? 0,
  };
}

await initSheetwrite();
const store = SheetwriteStore.fromSnapshot(workbook());

/** Heap in use after a full collection, in bytes. */
function heap_used(): number {
  Bun.gc(true);
  return process.memoryUsage().heapUsed;
}

// Count the workbook's formulas in idle slices, as a grid does after it mounts.
const heap_before = heap_used();
const counting = new WorkbookPatterns(store, "idle");
const slices: number[] = [];
const count_started = performance.now();
for (let more = true; more;) {
  const slice_started = performance.now();
  more = counting.step(slice_started + SLICE_MS);
  slices.push(performance.now() - slice_started);
}
const count_ms = performance.now() - count_started;
const count_bytes = heap_used() - heap_before;
counting.dispose();

const predictor = attachPredictor(store, { signals: SIGNALS, build: "now" });
const open: number[] = [];
const suggest: number[] = [];
/** Everything the formula bar does per key: the analysis, `suggest`, and the ghost's own analysis. */
const per_key: number[] = [];
try {
  for (const target of targets()) {
    const cell = { sheet: "orders", row: target.row, col: target.col };
    const saved = store.getFormula(cell);
    store.applyTransaction({ patches: [{ op: "set", addr: cell, value: literal("") }] });
    const edit = await openFormulaEdit(store, cell);
    const functions = edit.functions();

    let started = performance.now();
    const session = predictor.open(edit);
    open.push(performance.now() - started);
    let ghost: GhostOnScreen | null = null;
    for (let length = 1; length <= target.formula.length; length++) {
      const text = target.formula.slice(0, length);
      const key_started = performance.now();
      const analysis = analyzeFormula(text, text.length, functions);
      started = performance.now();
      const suggestion = session.suggest(text, analysis);
      suggest.push(performance.now() - started);
      const shown = shownSuggestion(text, analysis, suggestion, ghost);
      ghost = shown === null ? null : { text, shown };
      // The bar analyses the text with the ghost to colour the ranges it names.
      if (shown !== null) analyzeFormula(text + shown.text, text.length, functions);
      per_key.push(performance.now() - key_started);
    }
    session.close();
    const restored: CellValue =
      saved === null ? { kind: "literal", value: null } : { kind: "formula", src: saved };
    store.applyTransaction({ patches: [{ op: "set", addr: cell, value: restored }] });
  }
} finally {
  predictor.dispose();
  store.dispose();
}

const result = {
  rows: DATA_ROWS,
  open: summary(open),
  suggest: summary(suggest),
  perKey: summary(per_key),
  slices: summary(slices),
  countMs: count_ms,
  countBytes: count_bytes,
  budgetMs: BUDGET_MS,
};
const MS_DIGITS = 3;
const rows: [string, Summary][] = [
  ["open (per edit)", result.open],
  ["suggest (per key)", result.suggest],
  ["formula bar per key (analysis, suggest, ghost)", result.perKey],
  ["counting the workbook, per idle slice", result.slices],
];
process.stdout.write(
  "| Step | Calls | p50 (ms) | p95 (ms) | max (ms) |\n| --- | ---: | ---: | ---: | ---: |\n",
);
for (const [label, stats] of rows) {
  const times = [stats.p50, stats.p95, stats.max].map((ms) => ms.toFixed(MS_DIGITS));
  process.stdout.write(`| ${label} | ${stats.count} | ${times.join(" | ")} |\n`);
}
const KIB = 1024;
process.stdout.write(
  `\nCounting the workbook: ${count_ms.toFixed(0)} ms in ${slices.length} idle slices; heap ${(count_bytes / KIB).toFixed(0)} KiB after it.\n`,
);
if (values.json !== undefined) await writeFile(values.json, `${JSON.stringify(result, null, 2)}\n`);
const worst = Math.max(result.open.p95, result.suggest.p95);
if (worst >= BUDGET_MS) {
  process.stdout.write(`Over budget: p95 ${worst.toFixed(3)} ms, budget ${BUDGET_MS} ms\n`);
  process.exitCode = 1;
}
