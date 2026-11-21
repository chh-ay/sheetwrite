import { seededRandom } from "../../lib/random.js";

/**
 * Larkspur Workspace sells office furniture in four regions. This module holds
 * 24 months of its orders, January 2025 to December 2026. Authored tables and
 * rules make every row, so a pivot or a chart of the orders tells one story:
 *
 * - Demand is seasonal: it peaks in Q4 and falls in the summer.
 * - The Halo screen launches in July 2025 and ramps up for a year.
 * - EMEA raises its prices in March 2026. Its orders fall for two months,
 *   then partly recover.
 * - Three key accounts own most of the LATAM revenue.
 *
 * A small seeded variation changes each order size, so that rows are not
 * identical. It is much smaller than every story effect.
 */

export const STORY_COMPANY = "Larkspur Workspace";
export const STORY_FIRST_YEAR = 2025;
export const STORY_MONTHS = 24;
/** Enough rows for a real pivot, small enough to build on every page load. */
export const STORY_ORDER_ROWS = 4_800;

export const STORY_REGIONS = ["Americas", "EMEA", "APAC", "LATAM"] as const;
export type StoryRegion = (typeof STORY_REGIONS)[number];

/**
 * Part of all unit demand that each region holds, in the order of
 * `STORY_REGIONS`. APAC stays below a quarter of the orders, so the formulas
 * showcase can promote all APAC orders in one Grid transaction.
 */
const REGION_DEMAND = [0.38, 0.3, 0.2, 0.12] as const;

/**
 * `revenueWeight` sets the part of revenue that each product earns at full
 * demand. `orderUnits` is a typical order size: buyers order fewer units of
 * an expensive product, so units per order fall as the price rises.
 */
export const STORY_PRODUCTS = [
  { name: "Atlas desk", listPrice: 420, orderUnits: 3, revenueWeight: 1.3 },
  { name: "Beacon lamp", listPrice: 65, orderUnits: 14, revenueWeight: 0.7 },
  { name: "Cobalt chair", listPrice: 310, orderUnits: 4, revenueWeight: 1.2 },
  { name: "Delta shelf", listPrice: 180, orderUnits: 6, revenueWeight: 0.9 },
  { name: "Echo stool", listPrice: 95, orderUnits: 10, revenueWeight: 0.6 },
  { name: "Flux monitor arm", listPrice: 140, orderUnits: 8, revenueWeight: 0.8 },
  { name: "Grove planter", listPrice: 48, orderUnits: 18, revenueWeight: 0.4 },
  { name: "Halo screen", listPrice: 260, orderUnits: 5, revenueWeight: 1.6 },
] as const;

export const STORY_CHANNELS = ["Online", "Retail", "Partner"] as const;

/** Channel mix per region, in the order of `STORY_REGIONS`. */
const CHANNEL_MIX = [
  [0.55, 0.3, 0.15],
  [0.4, 0.35, 0.25],
  [0.62, 0.18, 0.2],
  [0.3, 0.25, 0.45],
] as const;

/** Partners resell, so they buy below the list price. Order of `STORY_CHANNELS`. */
const CHANNEL_PRICE = [1, 1, 0.92] as const;

/** Demand index per calendar month, January first. */
export const STORY_SEASONALITY = [
  0.92, 0.88, 0.98, 1, 0.96, 0.84, 0.76, 0.78, 0.98, 1.12, 1.32, 1.46,
] as const;

/** Zero-based calendar months of the Q4 peak (October to December). */
export const PEAK_MONTHS_OF_YEAR = [9, 10, 11] as const;
/** Zero-based calendar months of the summer lull (June to August). */
export const LULL_MONTHS_OF_YEAR = [5, 6, 7] as const;

/** Underlying demand grows by this part each year. */
export const STORY_ANNUAL_GROWTH = 0.08;

export const LAUNCH_PRODUCT = "Halo screen";
/** Zero-based story month of the launch: July 2025, month 7 of year 1. */
export const LAUNCH_MONTH_INDEX = 6;
export const LAUNCH_MONTH = "2025-07";
/** The launched product reaches its full demand after this many months. */
export const LAUNCH_RAMP_MONTHS = 12;

export const DIP_REGION: StoryRegion = "EMEA";
/** Zero-based story month of the EMEA price change: March 2026. */
export const PRICE_CHANGE_MONTH_INDEX = 14;
export const PRICE_CHANGE_MONTH = "2026-03";
/** The EMEA list prices rise by this part from the price change month. */
export const PRICE_CHANGE_RATE = 0.08;
/** The months in which EMEA demand falls after the price change. */
export const DIP_MONTHS = ["2026-03", "2026-04"] as const;
/** EMEA units against trend in each dip month. */
const DIP_UNIT_FACTORS = [0.66, 0.74] as const;
/** EMEA units against trend after the dip: a partial recovery. */
export const RECOVERED_UNIT_FACTOR = 0.84;

/** True when `region` is in its dip after the price change in a story month. */
export function isDipMonth(region: StoryRegion, monthIndex: number): boolean {
  const offset = monthIndex - PRICE_CHANGE_MONTH_INDEX;
  return region === DIP_REGION && offset >= 0 && offset < DIP_MONTHS.length;
}

export const KEY_ACCOUNT_REGION: StoryRegion = "LATAM";
export const KEY_ACCOUNTS = [
  "Andes Retail Group",
  "Pampas Office Supply",
  "Costa Workspace",
] as const;
/** The key accounts hold more than this part of their region's revenue. */
export const KEY_ACCOUNT_SHARE_FLOOR = 0.7;

/** Key accounts order more often (weight) and order more units (scale). */
const KEY_ACCOUNT_SCALE = 3.5;

interface StoryAccount {
  readonly name: string;
  /** Relative number of orders that the account places. */
  readonly weight: number;
  /** Multiplier on the typical order size. */
  readonly scale: number;
}

const account = (name: string, weight: number, scale = 1): StoryAccount => ({
  name,
  weight,
  scale,
});

/** Accounts per region, in the order of `STORY_REGIONS`. */
const ACCOUNTS: readonly (readonly StoryAccount[])[] = [
  [
    account("Harbor & Pine", 1.3),
    account("Northgate Offices", 1.2),
    account("Summit Cowork", 1.1),
    account("Bluewater Labs", 1),
    account("Cedar Health", 1),
    account("Prairie Schools", 0.9),
    account("Redline Studios", 0.8),
    account("Union Legal", 0.7),
  ],
  [
    account("Albion Works", 1.2),
    account("Rhein Partners", 1.1),
    account("Nordlys Studio", 1),
    account("Lumen Paris", 1),
    account("Atlas Iberia", 0.9),
    account("Vltava Tech", 0.9),
    account("Baltic Hub", 0.8),
  ],
  [
    account("Kestrel Pacific", 1.2),
    account("Sakura Office", 1.1),
    account("Monsoon Labs", 1),
    account("Coral Bay Group", 1),
    account("Tasman Design", 0.9),
    account("Lotus Systems", 0.8),
  ],
  [
    account("Andes Retail Group", 4, KEY_ACCOUNT_SCALE),
    account("Pampas Office Supply", 3, KEY_ACCOUNT_SCALE),
    account("Costa Workspace", 3, KEY_ACCOUNT_SCALE),
    account("Selva Studio", 1),
    account("Rio Claro Clinic", 1),
    account("Bahia Coworking", 1),
    account("Lima Legal", 1),
    account("Quito Labs", 1),
    account("Patagonia Design", 1),
  ],
];

/** Each order size moves by at most this part, so rows are not identical. */
const ORDER_SIZE_VARIATION = 0.12;
const STORY_SEED = 2025;
/** Spreads the first order of each cell over the month, so days mix regions. */
const DAY_PHASE_STEP = 0.618_034;

const MONTHS_PER_YEAR = 12;

/** `YYYY-MM` of a zero-based story month. */
export function storyMonthKey(monthIndex: number): string {
  const year = STORY_FIRST_YEAR + Math.floor(monthIndex / MONTHS_PER_YEAR);
  const month = (monthIndex % MONTHS_PER_YEAR) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Season and growth: the demand of a zero-based story month against January 2025. */
export function storyDemandIndex(monthIndex: number): number {
  const season = STORY_SEASONALITY[monthIndex % MONTHS_PER_YEAR] ?? 1;
  return season * (1 + STORY_ANNUAL_GROWTH) ** (monthIndex / MONTHS_PER_YEAR);
}

/** Part of its full demand that the launched product has in a story month. */
export function launchRamp(monthIndex: number): number {
  if (monthIndex < LAUNCH_MONTH_INDEX) return 0;

  return Math.min(1, (monthIndex - LAUNCH_MONTH_INDEX + 1) / LAUNCH_RAMP_MONTHS);
}

/** Units of a region against its trend in a story month. */
export function regionUnitFactor(region: StoryRegion, monthIndex: number): number {
  if (region !== DIP_REGION || monthIndex < PRICE_CHANGE_MONTH_INDEX) return 1;

  return DIP_UNIT_FACTORS[monthIndex - PRICE_CHANGE_MONTH_INDEX] ?? RECOVERED_UNIT_FACTOR;
}

/** List price multiplier of a region in a story month. */
export function regionPriceFactor(region: StoryRegion, monthIndex: number): number {
  if (region !== DIP_REGION || monthIndex < PRICE_CHANGE_MONTH_INDEX) return 1;

  return 1 + PRICE_CHANGE_RATE;
}

/** Revenue of a region against its trend: the unit change and the price change together. */
export function regionRevenueFactor(region: StoryRegion, monthIndex: number): number {
  return regionUnitFactor(region, monthIndex) * regionPriceFactor(region, monthIndex);
}

/** Columnar orders: index `i` of every array is one order. */
export interface StoryOrders {
  readonly rowCount: number;
  readonly orderId: string[];
  /** ISO date, `YYYY-MM-DD`. */
  readonly date: string[];
  /** `YYYY-MM`. */
  readonly month: string[];
  readonly region: StoryRegion[];
  readonly product: string[];
  readonly account: string[];
  readonly channel: string[];
  readonly units: Float64Array;
  readonly unitPrice: Float64Array;
  readonly revenue: Float64Array;
}

export interface StoryWindow {
  /** Zero-based story month of the first order. */
  readonly firstMonth: number;
  readonly months: number;
  /** Exact number of orders to make. */
  readonly rows: number;
}

interface StoryCell {
  readonly monthIndex: number;
  readonly regionIndex: number;
  readonly productIndex: number;
  readonly weight: number;
}

interface PendingOrder {
  /** Part of the month that has passed when the order arrives, from 0 to 1. */
  readonly time: number;
  readonly region: StoryRegion;
  readonly product: string;
  readonly account: string;
  readonly channel: string;
  readonly units: number;
  readonly unitPrice: number;
}

/**
 * Smooth weighted round robin. Over any run of picks, each item gets its
 * share of the weights, with no randomness.
 */
function weightedRotation(weights: readonly number[]): () => number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const current = new Float64Array(weights.length);

  return () => {
    let best = 0;
    for (let index = 0; index < weights.length; index++) {
      current[index] = (current[index] ?? 0) + (weights[index] ?? 0);
      if ((current[index] ?? 0) > (current[best] ?? 0)) best = index;
    }

    current[best] = (current[best] ?? 0) - total;
    return best;
  };
}

/** Largest remainder: whole counts in proportion to `weights` that sum to exactly `total`. */
function apportion(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const exact = weights.map((weight) => (sum === 0 ? 0 : (total * weight) / sum));
  const counts = exact.map(Math.floor);

  const assigned = counts.reduce((acc, count) => acc + count, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder.slice(0, total - assigned)) {
    counts[index] = (counts[index] ?? 0) + 1;
  }

  return counts;
}

function daysInStoryMonth(monthIndex: number): number {
  const year = STORY_FIRST_YEAR + Math.floor(monthIndex / MONTHS_PER_YEAR);
  return new Date(Date.UTC(year, (monthIndex % MONTHS_PER_YEAR) + 1, 0)).getUTCDate();
}

/** Mean order size multiplier of a region, with each account weighted by its orders. */
function meanAccountScale(accounts: readonly StoryAccount[]): number {
  const weight = accounts.reduce((sum, item) => sum + item.weight, 0);
  return accounts.reduce((sum, item) => sum + item.weight * item.scale, 0) / weight;
}

/**
 * Orders of a window of story months, made from the story rules. Each month,
 * region and product cell gets orders in proportion to its unit demand. A
 * larger `rows` gives a denser sample of the same story.
 */
export function generateStoryOrders(window: StoryWindow): StoryOrders {
  const scales = ACCOUNTS.map(meanAccountScale);

  const cells: StoryCell[] = [];
  for (let offset = 0; offset < window.months; offset++) {
    const monthIndex = window.firstMonth + offset;
    for (let regionIndex = 0; regionIndex < STORY_REGIONS.length; regionIndex++) {
      const region = STORY_REGIONS[regionIndex] ?? DIP_REGION;
      for (let productIndex = 0; productIndex < STORY_PRODUCTS.length; productIndex++) {
        const item = STORY_PRODUCTS[productIndex] ?? STORY_PRODUCTS[0];
        const ramp = item.name === LAUNCH_PRODUCT ? launchRamp(monthIndex) : 1;
        const units =
          (item.revenueWeight / item.listPrice) *
          (REGION_DEMAND[regionIndex] ?? 0) *
          storyDemandIndex(monthIndex) *
          ramp *
          regionUnitFactor(region, monthIndex);

        // Large accounts place larger orders, so a region with large accounts
        // needs fewer orders for the same units.
        const ordersWeight = units / (item.orderUnits * (scales[regionIndex] ?? 1));
        cells.push({ monthIndex, regionIndex, productIndex, weight: ordersWeight });
      }
    }
  }

  const counts = apportion(
    cells.map((cell) => cell.weight),
    window.rows,
  );

  const random = seededRandom(STORY_SEED);
  const accountTurn = ACCOUNTS.map((accounts) =>
    weightedRotation(accounts.map((item) => item.weight)),
  );
  const channelTurn = CHANNEL_MIX.map((mix) => weightedRotation(mix));

  const orders = emptyOrders(window.rows);
  let row = 0;
  let cellIndex = 0;
  for (let offset = 0; offset < window.months; offset++) {
    const monthIndex = window.firstMonth + offset;
    const days = daysInStoryMonth(monthIndex);
    const pending: PendingOrder[] = [];

    for (let index = 0; index < STORY_REGIONS.length * STORY_PRODUCTS.length; index++) {
      const cell = cells[cellIndex];
      const count = counts[cellIndex] ?? 0;
      cellIndex++;
      if (!cell) continue;

      const region = STORY_REGIONS[cell.regionIndex] ?? DIP_REGION;
      const item = STORY_PRODUCTS[cell.productIndex] ?? STORY_PRODUCTS[0];
      const accounts = ACCOUNTS[cell.regionIndex] ?? [];
      const phase = (cellIndex * DAY_PHASE_STEP) % 1;

      for (let order = 0; order < count; order++) {
        const buyer = accounts[accountTurn[cell.regionIndex]?.() ?? 0];
        const channelIndex = channelTurn[cell.regionIndex]?.() ?? 0;
        const variation = 1 + ORDER_SIZE_VARIATION * (2 * random() - 1);
        const units = Math.max(1, Math.round(item.orderUnits * (buyer?.scale ?? 1) * variation));
        const unitPrice = Math.round(
          item.listPrice *
            regionPriceFactor(region, cell.monthIndex) *
            (CHANNEL_PRICE[channelIndex] ?? 1),
        );

        pending.push({
          time: (order + phase) / count,
          region,
          product: item.name,
          account: buyer?.name ?? "",
          channel: STORY_CHANNELS[channelIndex] ?? "Online",
          units,
          unitPrice,
        });
      }
    }

    // Orders of all cells arrive spread over the month, so one day mixes regions and products.
    pending.sort((a, b) => a.time - b.time);

    const monthKey = storyMonthKey(monthIndex);
    for (const order of pending) {
      const day = 1 + Math.floor(order.time * days);
      orders.orderId[row] = `SO-${String(row + 1).padStart(5, "0")}`;
      orders.date[row] = `${monthKey}-${String(day).padStart(2, "0")}`;
      orders.month[row] = monthKey;
      orders.region[row] = order.region;
      orders.product[row] = order.product;
      orders.account[row] = order.account;
      orders.channel[row] = order.channel;
      orders.units[row] = order.units;
      orders.unitPrice[row] = order.unitPrice;
      orders.revenue[row] = order.units * order.unitPrice;
      row++;
    }
  }

  return orders;
}

function emptyOrders(rows: number): StoryOrders {
  return {
    rowCount: rows,
    orderId: new Array<string>(rows),
    date: new Array<string>(rows),
    month: new Array<string>(rows),
    region: new Array<StoryRegion>(rows),
    product: new Array<string>(rows),
    account: new Array<string>(rows),
    channel: new Array<string>(rows),
    units: new Float64Array(rows),
    unitPrice: new Float64Array(rows),
    revenue: new Float64Array(rows),
  };
}

/** All 24 story months at `STORY_ORDER_ROWS` orders: the shared showcase dataset. */
export function buildStoryOrders(): StoryOrders {
  return generateStoryOrders({ firstMonth: 0, months: STORY_MONTHS, rows: STORY_ORDER_ROWS });
}
