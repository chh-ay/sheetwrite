import type {
  CellValue,
  ChangeEvent,
  DataCell,
  DataSource,
  DataSourceStorageOptions,
  DocumentOp,
  Grid,
  PersistenceCommitRequest,
  PersistenceCommitResponse,
  RowData,
  RuntimeResourceOperation,
  SheetId,
  Theme,
  Workbook,
} from "@sheetwrite/core";
import { SheetwriteStore } from "@sheetwrite/core";

export const ENGINE_LIVE_SHEET = "forecast" satisfies SheetId;
export const ENGINE_LIVE_ROWS = 50_000;
export const ENGINE_TRACE_LIMIT = 40;
export const ENGINE_PENDING_LIMIT = 16;

/** What the engine resolves a cell to while its page has not arrived. */
export const ENGINE_LOADING_MARKER = "#LOADING!";

export const ENGINE_LIVE_STORAGE: Required<DataSourceStorageOptions> = {
  mode: "paged",
  chunkRows: 512,
  cacheBytes: 2 * 1024 * 1024,
  dirtyCellLimit: 4_096,
};

const ENGINE_THEME_BASE = {
  font: '500 13px "Inter Variable", Inter, system-ui, sans-serif',
  rowHeight: 30,
  headerHeight: 32,
  rowHeaderWidth: 48,
} as const;

export function engineLiveTheme(mode: "light" | "dark"): Partial<Theme> {
  return mode === "dark"
    ? {
        ...ENGINE_THEME_BASE,
        bg: "#0d1522",
        fg: "#dce5f3",
        gridLine: "#26364f",
        headerBg: "#121f30",
        headerFg: "#a8b7cd",
        selection: "rgb(52 211 153 / 18%)",
        selectionBorder: "#34d399",
        searchMatch: "rgb(251 191 36 / 24%)",
        searchActiveMatch: "#fbbf24",
        highlight: "rgb(96 165 250 / 24%)",
      }
    : {
        ...ENGINE_THEME_BASE,
        bg: "#fbfcfe",
        fg: "#1b2435",
        gridLine: "#d9e0e9",
        headerBg: "#e9eef5",
        headerFg: "#46546a",
        selection: "rgb(4 120 87 / 14%)",
        selectionBorder: "#047857",
        searchMatch: "rgb(180 83 9 / 18%)",
        searchActiveMatch: "#a34d08",
        highlight: "rgb(37 99 235 / 16%)",
      };
}

const REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America"] as const;
const PRODUCTS = [
  "Subscriptions",
  "Managed services",
  "Cloud storage",
  "Support",
  "Training",
] as const;
const PRODUCT_PRICE = [72, 155, 110, 95, 240] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const SEASONALITY = [
  0.94, 0.96, 1.02, 0.98, 1.01, 1.06, 0.95, 0.97, 1.04, 1.08, 1.12, 1.18,
] as const;
const SUBSCRIPTION_DISCOUNT = 0.05;
export const ENGINE_ACTUAL_ADJUSTMENT = 1_250;

/** One account row per month plus its annual total; the annual total is a formula row. */
export const ENGINE_ACCOUNT_ROWS = 13;

/** Zero-based indices of the money columns that the stage reads and follows. */
export const ENGINE_COLUMN_INDEX = {
  actual: 2,
  forecast: 3,
  variance: 4,
  attainment: 5,
} as const;

/** The forecast scenario multiplier that the formula rewrite adds and removes. */
export const ENGINE_FORECAST_UPSIDE = 1.02;

/** The monthly volume column that belongs to each product line. */
const VOLUME_KEY_BY_PRODUCT: Readonly<Record<number, string>> = {
  0: "seats",
  1: "serviceHours",
  2: "storage",
  3: "supportUnits",
  4: "trainingPlaces",
};

/** Annual totals sum these columns; prices and rates stay per-unit values. */
const SUMMED_KEYS_BY_PRODUCT: Readonly<Record<number, readonly string[]>> = {
  0: ["seats", "newSeats", "churnSeats", "baseFees"],
  1: ["serviceHours"],
  2: ["storage"],
  3: ["supportUnits"],
  4: ["trainingPlaces"],
};

const BANNER_ROW_STYLE = {
  bold: true,
  backgroundColor: "#152b31",
  color: "#dcefe9",
} as const;
const TOTAL_ROW_STYLE = {
  bold: true,
  backgroundColor: "#152b31",
  color: "#c5eadc",
} as const;

/** A1 letters for one-based column numbers. */
function columnLetter(index: number): string {
  let label = "";
  let remaining = index;
  do {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return label;
}

/** Twelve monthly records followed by their formula-backed annual total. */
export function engineAccountTotalRow(row: number): number {
  return 1 + Math.floor((row - 1) / ENGINE_ACCOUNT_ROWS) * ENGINE_ACCOUNT_ROWS + 12;
}

export type EngineRenderer = "canvas" | "worker";
export type EngineAction = "jump" | "edit" | "undo" | "save" | "renderer";
export type EngineResourceReason = "load" | "jump" | "edit" | "undo" | "save";

export interface EngineColumnBand {
  readonly start: number;
  readonly end: number;
  readonly keys: readonly string[];
}

const RESOURCE_OPERATION_BY_REASON: Readonly<
  Record<EngineResourceReason, RuntimeResourceOperation>
> = {
  load: "ingest",
  jump: "scroll",
  edit: "formula-recompute",
  undo: "formula-recompute",
  save: "persistence",
};

interface EngineEventBase {
  readonly sequence: number;
  readonly observedAt: number;
}

export type EngineEvent =
  | (EngineEventBase & {
      readonly type: "datasource-request";
      readonly requestId: number;
      readonly start: number;
      readonly end: number;
      readonly columns: readonly EngineColumnBand[];
    })
  | (EngineEventBase & {
      readonly type: "datasource-result";
      readonly requestId: number;
      readonly rows: number;
      readonly durationMs: number;
      readonly columns: readonly EngineColumnBand[];
    })
  | (EngineEventBase & {
      readonly type: "transaction-result";
      readonly action: "edit" | "undo" | "grid-edit";
      readonly status: "applied" | "noop" | "rejected" | "conflict";
      readonly changedCells: number;
      readonly epoch: number | null;
    })
  | (EngineEventBase & {
      readonly type: "page-resource";
      readonly reason: EngineResourceReason;
      readonly loadedCells: number;
      readonly dirtyCells: number;
      readonly pageBytes: number;
      readonly engineBytes: number;
    })
  | (EngineEventBase & {
      readonly type: "formula-update";
      readonly action: "edit" | "undo";
      readonly row: number;
      readonly dependencies: readonly {
        readonly address: string;
        readonly label: string;
        readonly kind: "money" | "percent";
        readonly formula: string;
        readonly before: string | number | boolean | null;
        readonly after: string | number | boolean | null;
      }[];
    })
  | (EngineEventBase & {
      readonly type: "visible-window";
      readonly firstRow: number;
      readonly lastRow: number;
      readonly scrollTop: number;
    })
  | (EngineEventBase & {
      readonly type: "renderer";
      readonly requested: EngineRenderer;
      readonly active: EngineRenderer;
      readonly fallback: string | null;
    })
  | (EngineEventBase & {
      readonly type: "host-save";
      readonly saveId: string;
      readonly status: PersistenceCommitResponse["status"];
      readonly version: number;
      readonly operations: number;
    })
  | (EngineEventBase & {
      readonly type: "browser-frame";
      readonly durationMs: number;
    })
  | (EngineEventBase & {
      readonly type: "formula-rewrite";
      readonly address: string;
      readonly formula: string;
      readonly durationMs: number;
    });

export type EngineEventInput = EngineEvent extends infer Event
  ? Event extends EngineEvent
    ? Omit<Event, "sequence" | "observedAt">
    : never
  : never;

export interface EngineTrace {
  push(event: EngineEventInput): EngineEvent;
  clear(): void;
  snapshot(): readonly EngineEvent[];
  readonly size: number;
}

/** Scenario-local fixed-size event storage; this is not a core event bus. */
export function createEngineTrace(limit = ENGINE_TRACE_LIMIT): EngineTrace {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError("trace limit must be positive");
  const events = new Array<EngineEvent>(limit);
  let sequence = 0;
  let start = 0;
  let size = 0;

  return {
    push(input) {
      sequence += 1;
      const event = { ...input, sequence, observedAt: performance.now() } as EngineEvent;
      const index = (start + size) % limit;
      events[index] = event;
      if (size < limit) {
        size += 1;
      } else {
        start = (start + 1) % limit;
      }
      return event;
    },
    clear() {
      start = 0;
      size = 0;
      events.fill(undefined as never);
    },
    snapshot() {
      return Array.from({ length: size }, (_, index) => events[(start + index) % limit]!);
    },
    get size() {
      return size;
    },
  };
}

const FORECAST_COLUMNS: Workbook["sheets"][number]["columns"] = [
  { key: "period", header: "Month", width: 106, type: "text" },
  { key: "region", header: "Region", width: 132, type: "text" },
  { key: "actual", header: "Actual", width: 124, type: "currency", numberFormat: "$#,##0" },
  { key: "forecast", header: "Forecast", width: 124, type: "currency", numberFormat: "$#,##0" },
  { key: "variance", header: "Variance", width: 124, type: "currency", numberFormat: "$#,##0" },
  { key: "attainment", header: "Attainment", width: 108, type: "number", numberFormat: "0.0%" },
  { key: "product", header: "Product line", width: 164, type: "text" },
  { key: "account", header: "Account", width: 114, type: "text" },
  { key: "seats", header: "Seats", width: 100, type: "number" },
  { key: "newSeats", header: "New seats", width: 100, type: "number" },
  { key: "churnSeats", header: "Churn seats", width: 100, type: "number" },
  {
    key: "seatPrice",
    header: "Price / seat",
    width: 124,
    type: "currency",
    numberFormat: "$#,##0",
  },
  { key: "discount", header: "Discount", width: 104, type: "number", numberFormat: "0.0%" },
  { key: "baseFees", header: "Base fees", width: 124, type: "currency", numberFormat: "$#,##0" },
  { key: "serviceHours", header: "Service hours", width: 124, type: "number" },
  { key: "hourRate", header: "Rate / hour", width: 124, type: "currency", numberFormat: "$#,##0" },
  { key: "storage", header: "Storage TB", width: 114, type: "number" },
  {
    key: "storagePrice",
    header: "Price / TB",
    width: 124,
    type: "currency",
    numberFormat: "$#,##0",
  },
  { key: "supportUnits", header: "Support units", width: 124, type: "number" },
  {
    key: "supportPrice",
    header: "Price / unit",
    width: 124,
    type: "currency",
    numberFormat: "$#,##0",
  },
  { key: "trainingPlaces", header: "Training places", width: 132, type: "number" },
  {
    key: "trainingPrice",
    header: "Price / place",
    width: 132,
    type: "currency",
    numberFormat: "$#,##0",
  },
  { key: "renewal", header: "Renewal", width: 104, type: "number", numberFormat: "0.0%" },
  { key: "contractTerm", header: "Term / months", width: 124, type: "number" },
  { key: "quarter", header: "Quarter", width: 104, type: "text" },
  { key: "planVersion", header: "Plan version", width: 136, type: "text" },
  { key: "plan", header: "Plan USD", width: 132, type: "currency", numberFormat: "$#,##0" },
];

const COLUMN_LETTER_BY_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  FORECAST_COLUMNS.map((column, index) => [column.key, columnLetter(index)]),
);

function columnLetterOf(key: string): string {
  const letter = COLUMN_LETTER_BY_KEY[key];
  if (!letter) throw new Error(`The forecast workbook has no ${key} column`);
  return letter;
}

/** A1 letter of the far-right board plan column that visible formulas read. */
export const ENGINE_PLAN_COLUMN = columnLetterOf("plan");

/** Workbook key of the far-right board plan column. */
export const ENGINE_PLAN_KEY = "plan";

/** A1 letters of the money columns the stage follows, for copy and evidence text. */
export const ENGINE_COLUMN_LETTER = {
  actual: columnLetterOf("actual"),
  forecast: columnLetterOf("forecast"),
  variance: columnLetterOf("variance"),
  attainment: columnLetterOf("attainment"),
} as const;

export function createEngineLiveWorkbook(): Workbook {
  return {
    activeSheet: ENGINE_LIVE_SHEET,
    sheets: [
      {
        id: ENGINE_LIVE_SHEET,
        name: "FY26 regional forecast",
        rowCount: ENGINE_LIVE_ROWS,
        columns: FORECAST_COLUMNS,
      },
    ],
  };
}

interface EngineAccountFacts {
  readonly region: string;
  readonly product: string;
  readonly productIndex: number;
  readonly label: string;
  readonly seed: number;
  readonly price: number;
  readonly renewal: number;
  readonly contractTerm: number;
  readonly planVersion: string;
}

/**
 * Seeded account facts. One account holds one product line in one region for
 * twelve months, then its annual total row.
 */
function engineAccountFacts(account: number): EngineAccountFacts {
  const seed = ((account + 1) * 2_654_435_761) >>> 0;
  const productIndex = Math.floor(account / REGIONS.length) % PRODUCTS.length;
  return {
    region: REGIONS[account % REGIONS.length] ?? "North America",
    product: PRODUCTS[productIndex] ?? "Subscriptions",
    productIndex,
    label: `AC-${String(account + 1).padStart(4, "0")}`,
    seed,
    price: PRODUCT_PRICE[productIndex] ?? 72,
    renewal: 0.95 + ((seed >>> 20) % 40) / 1_000,
    contractTerm: [12, 24, 36][seed % 3] ?? 12,
    planVersion: account % 5 === 0 ? "Re-forecast / Apr 2026" : "Board / Jan 2026",
  };
}

/** Per-unit prices and rates of one product line; a price never sums over a year. */
function accountUnitValues(facts: EngineAccountFacts): RowData {
  switch (facts.productIndex) {
    case 0:
      return { seatPrice: facts.price, discount: SUBSCRIPTION_DISCOUNT };
    case 1:
      return { hourRate: facts.price };
    case 2:
      return { storagePrice: facts.price };
    case 3:
      return { supportPrice: facts.price };
    default:
      return { trainingPrice: facts.price };
  }
}

/** Datasource cells accept bare scalars; styled rows carry an explicit literal. */
function asCellValue(cell: DataCell | undefined): CellValue {
  if (typeof cell !== "object") return { kind: "literal", value: cell ?? null };
  if (cell === null || cell === undefined) return { kind: "literal", value: null };
  if ("kind" in cell) return cell;
  return cell.value;
}

/**
 * Every cell of a requested column band, so a page always covers exactly the
 * keys it declares. Column AA (the board plan) stays far right of the money
 * columns; the visible forecast and variance formulas read it there.
 */
export function engineLiveRow(row: number, columns?: readonly EngineColumnBand[]): RowData {
  let completeRow: RowData;
  if (row === 0) {
    // Row 1 names every column, as in a finance workbook: the Grid keeps
    // A/B/C letters because the formulas on this page address cells by them.
    completeRow = Object.fromEntries(
      FORECAST_COLUMNS.map((column) => [
        column.key,
        { value: { kind: "literal", value: column.header }, style: BANNER_ROW_STYLE },
      ]),
    );
  } else if (row === ENGINE_LIVE_ROWS - 1) {
    const end: RowData = {
      period: "Ledger end",
      region: "3,846 accounts",
      product: "12 months + total",
      account: "FY26 / USD",
      quarter: "FY26",
      planVersion: "Board / Jan 2026",
    };
    completeRow = Object.fromEntries(
      FORECAST_COLUMNS.map((column) => [
        column.key,
        { value: asCellValue(end[column.key]), style: BANNER_ROW_STYLE },
      ]),
    );
  } else {
    const account = Math.floor((row - 1) / ENGINE_ACCOUNT_ROWS);
    const month = (row - 1) % ENGINE_ACCOUNT_ROWS;
    const facts = engineAccountFacts(account);
    const sheetRow = row + 1;
    if (month === ENGINE_ACCOUNT_ROWS - 1) {
      const first = 2 + account * ENGINE_ACCOUNT_ROWS;
      const last = first + 11;
      const total: RowData = {
        period: "FY26 total",
        region: facts.region,
        product: facts.product,
        account: facts.label,
        actual: { kind: "formula", src: `=SUM(C${first}:C${last})` },
        forecast: { kind: "formula", src: `=SUM(D${first}:D${last})` },
        variance: { kind: "formula", src: `=SUM(E${first}:E${last})` },
        attainment: { kind: "formula", src: `=IF(D${sheetRow}=0,0,C${sheetRow}/D${sheetRow})` },
        plan: {
          kind: "formula",
          src: `=SUM(${ENGINE_PLAN_COLUMN}${first}:${ENGINE_PLAN_COLUMN}${last})`,
        },
        renewal: facts.renewal,
        contractTerm: facts.contractTerm,
        quarter: "FY26",
        planVersion: facts.planVersion,
      };
      for (const key of SUMMED_KEYS_BY_PRODUCT[facts.productIndex] ?? []) {
        const letter = columnLetterOf(key);
        total[key] = { kind: "formula", src: `=SUM(${letter}${first}:${letter}${last})` };
      }
      Object.assign(total, accountUnitValues(facts));
      completeRow = Object.fromEntries(
        FORECAST_COLUMNS.map((column) => [
          column.key,
          { value: asCellValue(total[column.key]), style: TOTAL_ROW_STYLE },
        ]),
      );
    } else {
      // Seeded account sizes and seasonality, not a repeating arithmetic sawtooth.
      const volumeKey = VOLUME_KEY_BY_PRODUCT[facts.productIndex] ?? "seats";
      const volume = Math.round((35 + (facts.seed % 380)) * (SEASONALITY[month] ?? 1));
      const baseFees = 600 + ((facts.seed >>> 12) % 12) * 125;
      const plan =
        facts.productIndex === 0
          ? Math.round(volume * facts.price * (1 - SUBSCRIPTION_DISCOUNT) + baseFees)
          : Math.round(volume * facts.price);
      const noise = ((((facts.seed >>> 8) + month * 43) % 121) - 60) / 1_000;
      const renewalDip =
        facts.region === "Europe" && facts.productIndex === 2 && month === 8 ? -0.16 : 0;
      const supportUpside = facts.productIndex === 3 && month >= 9 ? 0.085 : 0;
      completeRow = {
        period: `${MONTHS[month] ?? ""} 2026`,
        region: facts.region,
        product: facts.product,
        account: facts.label,
        actual: Math.round(plan * (1 + noise + renewalDip + supportUpside)),
        // AA stays off screen; D and E read it and the Grid loads it with the window.
        forecast: { kind: "formula", src: `=${ENGINE_PLAN_COLUMN}${sheetRow}` },
        variance: { kind: "formula", src: `=C${sheetRow}-${ENGINE_PLAN_COLUMN}${sheetRow}` },
        attainment: { kind: "formula", src: `=IF(D${sheetRow}=0,0,C${sheetRow}/D${sheetRow})` },
        [volumeKey]: volume,
        ...(facts.productIndex === 0
          ? {
              newSeats: Math.round(volume * 0.07),
              churnSeats: Math.round(volume * 0.025),
              baseFees,
            }
          : {}),
        ...accountUnitValues(facts),
        renewal: renewalDip ? 0.81 : facts.renewal,
        contractTerm: facts.contractTerm,
        quarter: `Q${Math.floor(month / 3) + 1}`,
        planVersion: facts.planVersion,
        plan,
      };
    }
  }
  if (!columns) return completeRow;
  return Object.fromEntries(
    columns.flatMap((band) => band.keys).map((key) => [key, completeRow[key] ?? null]),
  );
}
export function createEngineLiveDataSource(
  emit: (event: EngineEventInput) => void,
  onResult?: () => void,
): DataSource {
  let requestId = 0;
  return {
    capabilities: { protocol: 2, columns: "windowed" },
    async getRows({ protocol, sheet, start, end, columns, signal, revision }) {
      if (protocol !== 2) throw new Error(`Unsupported datasource protocol ${protocol}`);
      requestId += 1;
      const currentRequest = requestId;
      const startedAt = performance.now();
      const requestedColumns = columns;
      emit({
        type: "datasource-request",
        requestId: currentRequest,
        start,
        end,
        columns: requestedColumns,
      });
      if (signal.aborted) {
        throw new DOMException(`Request for ${sheet} was cancelled`, "AbortError");
      }
      // Immediate local replies chain page ingestion and formula recomputation
      // in one microtask checkpoint. Use browser idle tasks to keep page
      // arrivals out of the next scroll/paint frame; no simulated latency.
      const delivery = Promise.withResolvers<void>();
      const useIdleTask = typeof requestIdleCallback === "function";
      const cancel = () => {
        if (useIdleTask && typeof task === "number") cancelIdleCallback(task);
        else clearTimeout(task);
        delivery.reject(new DOMException(`Request for ${sheet} was cancelled`, "AbortError"));
      };
      const deliver = () => {
        signal.removeEventListener("abort", cancel);
        delivery.resolve();
      };
      const task = useIdleTask ? requestIdleCallback(deliver) : setTimeout(deliver, 0);
      signal.addEventListener("abort", cancel, { once: true });
      await delivery.promise;
      if (signal.aborted) {
        throw new DOMException(`Request for ${sheet} was cancelled`, "AbortError");
      }
      const rows = Array.from({ length: end - start }, (_, offset) =>
        engineLiveRow(start + offset, requestedColumns),
      );
      if (signal.aborted) {
        throw new DOMException(`Request for ${sheet} was cancelled`, "AbortError");
      }
      emit({
        type: "datasource-result",
        requestId: currentRequest,
        rows: rows.length,
        durationMs: performance.now() - startedAt,
        columns: requestedColumns,
      });
      queueMicrotask(() => onResult?.());
      return { protocol: 2, start, columns: requestedColumns, rows, revision };
    },
  };
}

function changeAction(change: ChangeEvent): "edit" | "undo" | "grid-edit" {
  if (change.commitReason === "undo") return "undo";
  if (
    change.commitReason === "edit-blur" ||
    change.commitReason === "edit-enter" ||
    change.commitReason === "edit-tab"
  ) {
    return "grid-edit";
  }
  return "edit";
}

function operationKey(operation: DocumentOp, index: number): string {
  if (operation.op === "set") {
    return `${operation.addr.sheet}:${operation.addr.row}:${operation.addr.col}`;
  }
  return `${operation.op}:${index}`;
}

interface EngineDependencySnapshot {
  readonly address: string;
  readonly label: string;
  readonly kind: "money" | "percent";
  readonly formula: string;
  readonly value: string | number | boolean | null;
}

export interface EngineEventBindings {
  announceRenderer(requested: EngineRenderer, fallback?: string | null): void;
  announceResult(
    action: "edit" | "undo" | "grid-edit",
    status: "noop" | "rejected" | "conflict",
  ): void;
  dependencySnapshot(row: number): readonly EngineDependencySnapshot[];
  announceDependencies(
    action: "edit" | "undo",
    row: number,
    before: readonly EngineDependencySnapshot[],
  ): void;
  acknowledgeHost(response: PersistenceCommitResponse, operations: readonly DocumentOp[]): void;
  pendingOperations(): readonly DocumentOp[];
  sampleResource(reason: EngineResourceReason, operation?: RuntimeResourceOperation): void;
  dispose(): void;
}

/**
 * Bind public Grid events and measurements to the engine showcase's typed,
 * fixed-size event stream. Explanatory state is emitted only after the Grid
 * event or API result already exists.
 */
export function bindEngineEvents(
  grid: Grid,
  emit: (event: EngineEventInput) => void,
  onPendingChange?: (count: number) => void,
): EngineEventBindings {
  const pending = new Map<string, DocumentOp>();
  const unsubscribes: Array<() => void> = [];

  const sampleResource = (
    reason: EngineResourceReason,
    operation: RuntimeResourceOperation = RESOURCE_OPERATION_BY_REASON[reason],
  ) => {
    const page =
      grid.store instanceof SheetwriteStore ? grid.store.getPagedStats(ENGINE_LIVE_SHEET) : null;
    const resource = grid.getRuntimeResourceSnapshot(operation, "settled");
    emit({
      type: "page-resource",
      reason,
      loadedCells: page?.loadedCells ?? 0,
      dirtyCells: page?.dirtyCells ?? 0,
      pageBytes: page?.allocatedBytes ?? 0,
      engineBytes: resource.wasm.allocatedCapacityBytes,
    });
  };

  unsubscribes.push(
    grid.on("change", (change) => {
      change.transaction.patches.forEach((operation, index) => {
        pending.set(operationKey(operation, index), operation);
      });
      while (pending.size > ENGINE_PENDING_LIMIT) {
        const oldest = pending.keys().next().value;
        if (oldest === undefined) break;
        pending.delete(oldest);
      }
      onPendingChange?.(pending.size);
      const action = changeAction(change);
      emit({
        type: "transaction-result",
        action,
        status: "applied",
        changedCells: change.changes.length,
        epoch: change.epoch ?? null,
      });
      sampleResource(action === "undo" ? "undo" : "edit", "formula-recompute");
    }),
    grid.on("renderer-fallback", ({ requested, error }) => {
      emit({
        type: "renderer",
        requested,
        active: grid.rendererKind(),
        fallback: error.message,
      });
    }),
  );

  const dependencySnapshot = (row: number): readonly EngineDependencySnapshot[] => {
    const totalRow = engineAccountTotalRow(row);
    const cells: readonly {
      readonly row: number;
      readonly col: number;
      readonly label: string;
      readonly kind: "money" | "percent";
    }[] = [
      { row, col: ENGINE_COLUMN_INDEX.forecast, label: "Monthly forecast", kind: "money" },
      { row, col: ENGINE_COLUMN_INDEX.variance, label: "Monthly variance", kind: "money" },
      { row, col: ENGINE_COLUMN_INDEX.attainment, label: "Monthly attainment", kind: "percent" },
      { row: totalRow, col: ENGINE_COLUMN_INDEX.forecast, label: "Annual forecast", kind: "money" },
      { row: totalRow, col: ENGINE_COLUMN_INDEX.actual, label: "Annual actual", kind: "money" },
      { row: totalRow, col: ENGINE_COLUMN_INDEX.variance, label: "Annual variance", kind: "money" },
      {
        row: totalRow,
        col: ENGINE_COLUMN_INDEX.attainment,
        label: "Annual attainment",
        kind: "percent",
      },
    ];
    return cells.map(({ row: dependencyRow, col, label, kind }) => {
      const address = { sheet: ENGINE_LIVE_SHEET, row: dependencyRow, col };
      return {
        address: `${columnLetter(col)}${dependencyRow + 1}`,
        label,
        kind,
        formula: grid.store.getFormula(address) ?? "",
        value: grid.store.getCell(address).resolved,
      };
    });
  };

  return {
    announceRenderer(requested, fallback = null) {
      emit({ type: "renderer", requested, active: grid.rendererKind(), fallback });
    },
    announceResult(action, status) {
      emit({ type: "transaction-result", action, status, changedCells: 0, epoch: null });
    },
    dependencySnapshot,
    announceDependencies(action, row, before) {
      const after = dependencySnapshot(row);
      const dependencies = after.map((dependency, index) => ({
        address: dependency.address,
        label: dependency.label,
        kind: dependency.kind,
        formula: dependency.formula,
        before: before[index]?.value ?? null,
        after: dependency.value,
      }));
      emit({ type: "formula-update", action, row, dependencies });
    },
    acknowledgeHost(response, operations) {
      if (response.status === "conflict") {
        emit({
          type: "host-save",
          saveId: "conflict",
          status: response.status,
          version: response.currentVersion,
          operations: operations.length,
        });
        return;
      }
      for (const operation of operations) pending.delete(operationKey(operation, 0));
      grid.store.acknowledgeOperations?.(operations, BigInt(response.version));
      onPendingChange?.(pending.size);
      emit({
        type: "host-save",
        saveId: response.clientMutationId,
        status: response.status,
        version: response.version,
        operations: operations.length,
      });
      sampleResource("save", "persistence");
    },
    pendingOperations() {
      return [...pending.values()];
    },
    sampleResource,
    dispose() {
      for (const unsubscribe of unsubscribes) unsubscribe();
      pending.clear();
      onPendingChange?.(0);
    },
  };
}

export interface EngineHostSaver {
  commit(operations: readonly DocumentOp[]): Promise<PersistenceCommitResponse>;
  reset(): void;
  readonly version: number;
}

/** Small real host boundary: accepts the exact Grid operations and returns a typed acknowledgement. */
export function createEngineHostSaver(): EngineHostSaver {
  let version = 0;
  let saveSequence = 0;
  return {
    async commit(operations) {
      saveSequence += 1;
      const request: PersistenceCommitRequest = {
        documentId: "engine-live",
        baseVersion: version,
        clientMutationId: `engine-save-${saveSequence}`,
        operations,
      };
      version += 1;
      return {
        status: "applied",
        version,
        clientMutationId: request.clientMutationId,
      };
    },
    reset() {
      version = 0;
      saveSequence = 0;
    },
    get version() {
      return version;
    },
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const engineMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * One rendering for a formula value, shared by the trace and the dependency
 * cards: money as currency, rates as percentages, an empty cell spelled out.
 */
export function formatEngineValue(
  kind: "money" | "percent",
  value: string | number | boolean | null,
): string {
  if (value === null) return "blank";
  if (typeof value !== "number") return String(value);
  return kind === "percent" ? `${(value * 100).toFixed(1)}%` : engineMoney.format(value);
}

export function formatEngineEvent(event: EngineEvent): string {
  switch (event.type) {
    case "datasource-request": {
      const bands = event.columns.map((band) => band.keys.join(", ")).join(" | ") || "none";
      return `Rows requested: ${event.start + 1}–${event.end}; columns ${bands}`;
    }
    case "datasource-result": {
      const bands = event.columns.map((band) => band.keys.join(", ")).join(" | ") || "none";
      return `Rows ready: ${event.rows.toLocaleString()} in ${event.durationMs.toFixed(1)} ms; columns ${bands}`;
    }
    case "transaction-result":
      return `${event.action === "undo" ? "Undo" : "Edit"}: ${event.status}, ${event.changedCells} cell${event.changedCells === 1 ? "" : "s"} changed`;
    case "page-resource":
      return `Page sample: ${event.loadedCells.toLocaleString()} cells loaded, ${event.dirtyCells.toLocaleString()} changed, ${formatBytes(event.pageBytes)} kept in pages, ${formatBytes(event.engineBytes)} in the calculation engine`;
    case "formula-update": {
      const changed = event.dependencies.filter(
        (dependency) => dependency.before !== dependency.after,
      );
      const summary =
        changed.length === 0
          ? "no value changed"
          : changed
              .map(
                (dependency) =>
                  `${dependency.address} ${dependency.label.toLowerCase()} ${formatEngineValue(dependency.kind, dependency.before)} → ${formatEngineValue(dependency.kind, dependency.after)}`,
              )
              .join("; ");
      return `${event.action === "undo" ? "Undo reached" : "Recalculation reached"} ${summary}`;
    }
    case "visible-window":
      return `Visible rows: ${event.firstRow + 1}–${event.lastRow + 1}`;
    case "renderer":
      return event.fallback
        ? `Drawing: ${event.requested} requested, ${event.active} active (${event.fallback})`
        : `Drawing: ${event.active} active`;
    case "host-save":
      return `Host save: ${event.status} at version ${event.version}, ${event.operations} change${event.operations === 1 ? "" : "s"}`;
    case "browser-frame":
      return `Browser paint checkpoint after ${event.durationMs.toFixed(1)} ms; two animation frames, not a renderer acknowledgement`;
    case "formula-rewrite":
      return `${event.address} is now ${event.formula}; its reads did not change, and the one-cell transaction took ${event.durationMs.toFixed(2)} ms`;
  }
}
