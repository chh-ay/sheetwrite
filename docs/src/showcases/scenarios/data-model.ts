import {
  formatNumber,
  SheetwriteStore,
  type CellScalar,
  type DocumentOp,
  type Grid,
  type PivotDefinition,
  type RelationshipStatus,
  type TableColumnRef,
  type Workbook,
  type WorkbookTable,
} from "@sheetwrite/core";

import type { LiveScenario } from "../use-live-scenario.js";
import {
  createListeners,
  mountShowcaseShell,
  pressRibbonCommand,
  requireApplied,
} from "./showcase-shell.js";

// The data model showcase: an Orders table related to Products and Regions
// tables by key columns, a pivot on the Report sheet that groups orders by a
// field of a related table, a measure that recalculates in every pivot cell,
// and GETPIVOTDATA formulas that read the pivot.

export const ORDERS_SHEET = "orders";
export const LOOKUPS_SHEET = "lookups";
export const REPORT_SHEET = "report";
export const ORDER_ROWS = 240;
const PIVOT_ID = "revenue-by-group";
const MONEY = "$#,##0";

const PRODUCTS = [
  ["P-101", "Desk lamp", "Hardware"],
  ["P-102", "Monitor arm", "Hardware"],
  ["P-103", "Dock", "Hardware"],
  ["P-104", "Design suite", "Software"],
  ["P-105", "Backup plan", "Software"],
  ["P-106", "Setup visit", "Services"],
  ["P-107", "Training day", "Services"],
  ["P-108", "Support year", "Services"],
] as const;

/** A product key that no row of Products holds. */
export const UNKNOWN_PRODUCT = "P-999";

const REGIONS = [
  ["AM", "Americas", "Ana Ruiz"],
  ["AP", "APAC", "Chen Wei"],
  ["EU", "EMEA", "Eli Moreau"],
  ["LA", "LATAM", "Dana Holt"],
] as const;

/** A workbook table: a header row, then `rows` data rows from `start`. */
function table(
  id: string,
  name: string,
  sheet: string,
  start: { row: number; col: number },
  rows: number,
  columns: readonly (readonly [id: string, name: string])[],
): WorkbookTable {
  return {
    id,
    name,
    range: {
      sheet,
      start,
      end: { row: start.row + rows, col: start.col + columns.length - 1 },
    },
    columns: columns.map(([columnId, columnName]) => ({ id: columnId, name: columnName })),
    headerRow: true,
    totalsRow: false,
  };
}

const ORDERS_TABLE = table("orders", "Orders", ORDERS_SHEET, { row: 0, col: 0 }, ORDER_ROWS, [
  ["order", "Order"],
  ["product", "Product"],
  ["region", "Region"],
  ["units", "Units"],
  ["amount", "Amount"],
]);
const PRODUCTS_TABLE = table(
  "products",
  "Products",
  LOOKUPS_SHEET,
  { row: 0, col: 0 },
  PRODUCTS.length,
  [
    ["id", "Product ID"],
    ["name", "Product"],
    ["category", "Category"],
  ],
);
const REGIONS_TABLE = table(
  "regions",
  "Regions",
  LOOKUPS_SHEET,
  { row: 0, col: 4 },
  REGIONS.length,
  [
    ["code", "Code"],
    ["name", "Region"],
    ["manager", "Manager"],
  ],
);

export const RELATIONSHIPS = [
  {
    id: "orders-products",
    label: "Orders[Product] → Products[Product ID]",
    from: { table: "orders", column: "product" },
    to: { table: "products", column: "id" },
  },
  {
    id: "orders-regions",
    label: "Orders[Region] → Regions[Code]",
    from: { table: "orders", column: "region" },
    to: { table: "regions", column: "code" },
  },
] as const;

const MEASURE = {
  id: "average-order",
  name: "Average order",
  table: "orders",
  formula: "=SUM(Orders[Amount])/COUNT(Orders[Amount])",
} as const;

/** The related-table fields the pivot can group its rows by. */
export const ROW_FIELDS = {
  category: { label: "Category", field: { table: "products", column: "category" } },
  region: { label: "Region", field: { table: "regions", column: "name" } },
  manager: { label: "Manager", field: { table: "regions", column: "manager" } },
} as const satisfies Record<string, { label: string; field: TableColumnRef }>;

export type RowFieldId = keyof typeof ROW_FIELDS;

/** A model pivot: rows from a related table, revenue and orders from Orders, and the measure. */
function modelPivot(rowField: RowFieldId): PivotDefinition {
  const fields: TableColumnRef[] = [
    ROW_FIELDS[rowField].field,
    { table: "orders", column: "amount" },
    { table: "orders", column: "order" },
  ];
  return {
    id: PIVOT_ID,
    name: "Revenue by group",
    source: { model: { table: "orders", fields } },
    anchor: { row: 0, col: 0 },
    rows: [0],
    columns: [],
    values: [
      { field: 1, aggregation: "SUM", name: "Revenue" },
      { field: 2, aggregation: "COUNTA", name: "Orders" },
      { measure: MEASURE.id },
    ],
  };
}

/** GETPIVOTDATA formulas beside the pivot: the grand totals, by data field name. */
const PIVOT_READS = [
  { label: "Revenue", src: `=GETPIVOTDATA("Revenue",$A$1)`, format: MONEY },
  { label: "Orders", src: `=GETPIVOTDATA("Orders",$A$1)`, format: "#,##0" },
] as const;

/** Report columns that hold money: the pivot's Revenue and Average order values. */
const PIVOT_REVENUE_COL = 1;
const PIVOT_MEASURE_COL = 3;
const ORDERS_AMOUNT_COL = 4;
const REPORT_ROWS = 24;
const READ_LABEL_COL = 6;

/** A deterministic order: product and region keys, units and an amount. */
function orderRow(index: number): CellScalar[] {
  const product = PRODUCTS[(index * 5 + Math.floor(index / 7)) % PRODUCTS.length] ?? PRODUCTS[0];
  const region = REGIONS[(index * 3 + Math.floor(index / 5)) % REGIONS.length] ?? REGIONS[0];
  const units = 1 + ((index * 7) % 9);
  const price = 40 + ((index * 53) % 11) * 35;
  return [`ORD-${5001 + index}`, product[0], region[0], units, units * price];
}

function setRow(
  sheet: string,
  row: number,
  col: number,
  values: readonly CellScalar[],
): DocumentOp[] {
  return values.map((value, offset) => ({
    op: "set",
    addr: { sheet, row, col: col + offset },
    value: { kind: "literal", value },
  }));
}

function modelOperations(): DocumentOp[] {
  const header = (source: WorkbookTable) => source.columns.map((column) => column.name);
  const operations: DocumentOp[] = [
    ...setRow(ORDERS_SHEET, 0, 0, header(ORDERS_TABLE)),
    ...setRow(LOOKUPS_SHEET, 0, 0, header(PRODUCTS_TABLE)),
    ...setRow(LOOKUPS_SHEET, 0, 4, header(REGIONS_TABLE)),
  ];
  for (let index = 0; index < ORDER_ROWS; index++) {
    operations.push(...setRow(ORDERS_SHEET, index + 1, 0, orderRow(index)));
  }
  PRODUCTS.forEach((product, index) =>
    operations.push(...setRow(LOOKUPS_SHEET, index + 1, 0, product)),
  );
  REGIONS.forEach((region, index) =>
    operations.push(...setRow(LOOKUPS_SHEET, index + 1, 4, region)),
  );
  PIVOT_READS.forEach((read, row) => {
    operations.push(...setRow(REPORT_SHEET, row, READ_LABEL_COL, [read.label]), {
      op: "set",
      addr: { sheet: REPORT_SHEET, row, col: READ_LABEL_COL + 1 },
      value: { kind: "formula", src: read.src },
    });
  });
  const format = (sheet: string, rows: [number, number], col: number, numberFormat: string) =>
    operations.push({
      op: "setRangeStyle",
      range: { sheet, start: { row: rows[0], col }, end: { row: rows[1], col } },
      style: { numberFormat },
    });
  format(ORDERS_SHEET, [1, ORDER_ROWS], ORDERS_AMOUNT_COL, MONEY);
  // The pivot's Revenue and Average order columns, for every row a row field can produce.
  format(REPORT_SHEET, [1, REPORT_ROWS - 1], PIVOT_REVENUE_COL, MONEY);
  format(REPORT_SHEET, [1, REPORT_ROWS - 1], PIVOT_MEASURE_COL, MONEY);
  PIVOT_READS.forEach((read, row) =>
    format(REPORT_SHEET, [row, row], READ_LABEL_COL + 1, read.format),
  );
  return operations;
}

function modelWorkbook(): Workbook {
  const columns = (widths: readonly number[]) =>
    widths.map((width, index) => ({ key: `c${index}`, header: "", width, type: "text" as const }));
  return {
    activeSheet: REPORT_SHEET,
    sheets: [
      {
        id: REPORT_SHEET,
        name: "Report",
        rowCount: REPORT_ROWS,
        columns: columns([120, 112, 88, 120, 32, 32, 120, 112]),
      },
      {
        id: ORDERS_SHEET,
        name: "Orders",
        rowCount: ORDER_ROWS + 1,
        frozenRows: 1,
        columns: columns([104, 88, 80, 64, 96]),
        tables: [ORDERS_TABLE],
      },
      {
        id: LOOKUPS_SHEET,
        name: "Lookups",
        rowCount: PRODUCTS.length + 1,
        columns: columns([96, 120, 96, 32, 64, 96, 104]),
        tables: [PRODUCTS_TABLE, REGIONS_TABLE],
      },
    ],
    dataModel: {
      relationships: RELATIONSHIPS.map((relationship) => ({
        id: relationship.id,
        from: { ...relationship.from },
        to: { ...relationship.to },
      })),
      measures: [{ ...MEASURE }],
    },
  };
}

export interface RelationshipReading {
  readonly id: string;
  readonly label: string;
  readonly status: RelationshipStatus;
}

export interface DataModelSnapshot {
  readonly rowField: RowFieldId;
  readonly relationships: readonly RelationshipReading[];
  readonly reads: readonly { label: string; src: string; value: string }[];
}

export interface DataModelScenario extends LiveScenario<DataModelSnapshot> {
  setRowField(id: RowFieldId): void;
  /** Give a second product the first product's ID, so the lookup key repeats. */
  duplicateProductKey(): void;
  /** Point the first order at a product that is in no row of Products. */
  orphanOrder(): void;
  openRelationships(): void;
  openFieldList(): void;
  undo(): void;
}

/** Mount the three tables, their relationships, the measure and the model pivot. */
export function createDataModelScenario(host: HTMLElement): DataModelScenario {
  const controller = new AbortController();
  const listeners = createListeners();
  let grid: Grid | null = null;
  let shellElement: HTMLElement | null = null;
  let dispose = () => {};
  let rowField: RowFieldId = "category";

  const ready = (async () => {
    const shell = await mountShowcaseShell(host, { workbook: modelWorkbook() }, controller.signal);
    if (!shell) return;
    grid = shell.grid;
    shellElement = shell.element;
    requireApplied(grid.applyRemoteOperations(modelOperations()), "The model tables");
    requireApplied(grid.setPivot(modelPivot(rowField), REPORT_SHEET), "The model pivot");
    const stopChanges = grid.on("change", () => listeners.notify());
    dispose = () => {
      stopChanges();
      shell.dispose();
    };
  })();

  const requireGrid = (): Grid => {
    if (!grid) throw new Error("The data model is still loading");
    return grid;
  };

  return {
    ready,
    subscribe: listeners.subscribe,
    snapshot() {
      const current = grid;
      return {
        rowField,
        relationships: RELATIONSHIPS.map((relationship) => ({
          id: relationship.id,
          label: relationship.label,
          status:
            current?.store instanceof SheetwriteStore
              ? current.store.getRelationshipStatus(relationship.id)
              : { status: "unavailable" },
        })),
        reads: PIVOT_READS.map((read, row) => {
          const value = current?.store.getCell({
            sheet: REPORT_SHEET,
            row,
            col: READ_LABEL_COL + 1,
          }).resolved;
          return {
            label: read.label,
            src: read.src,
            value:
              typeof value === "number" ? formatNumber(value, read.format) : String(value ?? ""),
          };
        }),
      };
    },
    setRowField(id) {
      requireApplied(requireGrid().setPivot(modelPivot(id), REPORT_SHEET), "The pivot change");
      rowField = id;
      listeners.notify();
    },
    duplicateProductKey() {
      const [first] = PRODUCTS;
      requireApplied(
        requireGrid().applyTransaction({
          patches: setRow(LOOKUPS_SHEET, 2, 0, [first[0]]),
        }),
        "The key change",
      );
    },
    orphanOrder() {
      const productCol = ORDERS_TABLE.columns.findIndex((column) => column.id === "product");
      requireApplied(
        requireGrid().applyTransaction({
          patches: setRow(ORDERS_SHEET, 1, productCol, [UNKNOWN_PRODUCT]),
        }),
        "The order change",
      );
    },
    openRelationships() {
      if (!shellElement) throw new Error("The data model is still loading");
      pressRibbonCommand(shellElement, "Data", "relationships");
    },
    openFieldList() {
      const current = requireGrid();
      current.setActiveSheet(REPORT_SHEET);
      current.setSelection({ kind: "cell", addr: { sheet: REPORT_SHEET, row: 1, col: 0 } });
      current.actions.showPivotFields();
    },
    undo() {
      requireGrid().undo();
    },
    dispose() {
      controller.abort();
      dispose();
      grid = null;
    },
  };
}
