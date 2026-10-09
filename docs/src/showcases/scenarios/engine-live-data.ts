import type {
  CellValue,
  DataCell,
  DataSourceStorageOptions,
  RowData,
  SheetId,
  Workbook,
} from "@sheetwrite/core";

// Pure workbook data shared by the showcase and prebuilt-site browser specs.
export const ENGINE_LIVE_SHEET = "forecast" satisfies SheetId;
export const ENGINE_LIVE_ROWS = 50_000;
export const ENGINE_LIVE_STORAGE: Required<DataSourceStorageOptions> = {
  mode: "paged",
  chunkRows: 512,
  cacheBytes: 2 * 1024 * 1024,
  dirtyCellLimit: 4_096,
};
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
export function columnLetter(index: number): string {
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

export interface EngineColumnBand {
  readonly start: number;
  readonly end: number;
  readonly keys: readonly string[];
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
