import { describe, expect, test } from "bun:test";

import { validateTransactionResources } from "../../packages/core/src/document-protocol.js";
import {
  apacPromotionOps,
  buildOrdersLedger,
  LEDGER_YEAR,
  ORDER_ROWS,
} from "../src/showcases/scenarios/formulas.js";
import {
  buildStoryOrders,
  DIP_MONTHS,
  DIP_REGION,
  KEY_ACCOUNT_REGION,
  KEY_ACCOUNT_SHARE_FLOOR,
  KEY_ACCOUNTS,
  LAUNCH_MONTH,
  LAUNCH_PRODUCT,
  LULL_MONTHS_OF_YEAR,
  PEAK_MONTHS_OF_YEAR,
  PRICE_CHANGE_MONTH,
  STORY_FIRST_YEAR,
  STORY_MONTHS,
  STORY_ORDER_ROWS,
  STORY_REGIONS,
  storyMonthKey,
} from "../src/showcases/scenarios/orders-story.js";

/** A clear seasonal story: Q4 months beat summer months by at least this ratio. */
const SEASONAL_MARGIN = 1.4;
/** In a dip month the dip region keeps less than this part of its usual share. */
const DIP_SHARE_CEILING = 0.85;
/** The panel "Largest orders" shows five orders above this revenue. */
const LARGE_ORDER_REVENUE = 4_000;
const LARGE_ORDERS_SHOWN = 5;
/** Months of the year that a test compares; a story year has twelve. */
const MONTHS_PER_YEAR = 12;

interface OrderColumns {
  readonly rowCount: number;
  readonly month: readonly string[];
  readonly region: readonly string[];
  readonly revenue: Float64Array;
}

function sumBy(
  orders: OrderColumns,
  key: (row: number) => string,
  include: (row: number) => boolean = () => true,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (let row = 0; row < orders.rowCount; row++) {
    if (!include(row)) continue;

    const name = key(row);
    totals.set(name, (totals.get(name) ?? 0) + (orders.revenue[row] ?? 0));
  }
  return totals;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function monthsOf(year: number, monthsOfYear: readonly number[]): string[] {
  return monthsOfYear.map((month) => `${year}-${String(month + 1).padStart(2, "0")}`);
}

/** Mean monthly revenue of the Q4 peak against the summer lull of one year. */
function peakToLull(monthly: ReadonlyMap<string, number>, year: number): number {
  const peak = mean(monthsOf(year, PEAK_MONTHS_OF_YEAR).map((month) => monthly.get(month) ?? 0));
  const lull = mean(monthsOf(year, LULL_MONTHS_OF_YEAR).map((month) => monthly.get(month) ?? 0));
  return peak / lull;
}

/** Part of each month's revenue that the dip region earns. */
function dipRegionShare(orders: OrderColumns): Map<string, number> {
  const monthly = sumBy(orders, (row) => orders.month[row] ?? "");
  const region = sumBy(
    orders,
    (row) => orders.month[row] ?? "",
    (row) => orders.region[row] === DIP_REGION,
  );
  return new Map([...monthly].map(([month, total]) => [month, (region.get(month) ?? 0) / total]));
}

/** Expect the dip region share to fall in the dip months, then partly recover. */
function expectDipAndPartialRecovery(orders: OrderColumns) {
  const share = dipRegionShare(orders);
  const months = [...share.keys()].sort();
  const changeAt = months.indexOf(PRICE_CHANGE_MONTH);
  const before = mean(months.slice(0, changeAt).map((month) => share.get(month) ?? 0));
  const dip = DIP_MONTHS.map((month) => share.get(month) ?? 0);
  const after = mean(
    months.slice(changeAt + DIP_MONTHS.length).map((month) => share.get(month) ?? 0),
  );

  for (const value of dip) expect(value).toBeLessThan(before * DIP_SHARE_CEILING);
  expect(after).toBeGreaterThan(Math.max(...dip));
  expect(after).toBeLessThan(before);
}

describe("story orders", () => {
  const orders = buildStoryOrders();
  const monthly = sumBy(orders, (row) => orders.month[row] ?? "");

  test("are deterministic and cover 24 months", () => {
    const again = buildStoryOrders();

    expect(orders.rowCount).toBe(STORY_ORDER_ROWS);
    expect(again.revenue).toEqual(orders.revenue);
    expect(again.account).toEqual(orders.account);
    expect(again.date).toEqual(orders.date);
    expect([...monthly.keys()]).toEqual(
      Array.from({ length: STORY_MONTHS }, (_, index) => storyMonthKey(index)),
    );
    for (let row = 0; row < orders.rowCount; row++) {
      expect(orders.revenue[row]).toBe((orders.units[row] ?? 0) * (orders.unitPrice[row] ?? 0));
    }
  });

  test("peak in Q4 and fall in the summer of each year", () => {
    for (const year of [STORY_FIRST_YEAR, STORY_FIRST_YEAR + 1]) {
      expect(peakToLull(monthly, year)).toBeGreaterThan(SEASONAL_MARGIN);

      const yearMonths = [...monthly].filter(([month]) => month.startsWith(`${year}-`));
      const [best] = yearMonths.sort((a, b) => b[1] - a[1]);
      const bestMonth = Number(best?.[0].slice(5)) - 1;
      expect(PEAK_MONTHS_OF_YEAR).toContain(bestMonth as (typeof PEAK_MONTHS_OF_YEAR)[number]);
    }
  });

  test("have no launched product before its launch, then a growing share", () => {
    const launched = sumBy(
      orders,
      (row) => orders.month[row] ?? "",
      (row) => orders.product[row] === LAUNCH_PRODUCT,
    );

    for (const month of monthly.keys()) {
      if (month < LAUNCH_MONTH) expect(launched.get(month) ?? 0).toBe(0);
    }
    expect(launched.get(LAUNCH_MONTH) ?? 0).toBeGreaterThan(0);

    // Shares remove the season, so each ramp quarter must beat the one before it.
    const launchIndex = [...monthly.keys()].indexOf(LAUNCH_MONTH);
    const quarterShares = Array.from({ length: 4 }, (_, quarter) => {
      const months = [...monthly.keys()].slice(
        launchIndex + quarter * 3,
        launchIndex + quarter * 3 + 3,
      );
      const product = months.reduce((sum, month) => sum + (launched.get(month) ?? 0), 0);
      const total = months.reduce((sum, month) => sum + (monthly.get(month) ?? 0), 0);
      return product / total;
    });
    for (let quarter = 1; quarter < quarterShares.length; quarter++) {
      expect(quarterShares[quarter] ?? 0).toBeGreaterThan(quarterShares[quarter - 1] ?? 0);
    }
  });

  test("dip in one region after its price change, then partly recover", () => {
    expectDipAndPartialRecovery(orders);

    // Against the same months a year earlier, only the dip region falls.
    const lastYear = DIP_MONTHS.map((month) => `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`);
    for (const region of STORY_REGIONS) {
      const inRegion = (months: readonly string[]) =>
        sumBy(
          orders,
          () => region,
          (row) => orders.region[row] === region && months.includes(orders.month[row] ?? ""),
        ).get(region) ?? 0;
      const growth = inRegion(DIP_MONTHS) / inRegion(lastYear);

      if (region === DIP_REGION) expect(growth).toBeLessThan(1);
      else expect(growth).toBeGreaterThan(1);
    }
  });

  test("give the key accounts most of their region's revenue", () => {
    const topThreeShare = (region: string) => {
      const byAccount = sumBy(
        orders,
        (row) => orders.account[row] ?? "",
        (row) => orders.region[row] === region,
      );
      const values = [...byAccount.values()].sort((a, b) => b - a);
      const total = values.reduce((sum, value) => sum + value, 0);
      return {
        total,
        top: values.slice(0, KEY_ACCOUNTS.length).reduce((sum, value) => sum + value, 0) / total,
        accounts: byAccount,
      };
    };

    const key = topThreeShare(KEY_ACCOUNT_REGION);
    const keyRevenue = KEY_ACCOUNTS.reduce((sum, name) => sum + (key.accounts.get(name) ?? 0), 0);
    expect(keyRevenue / key.total).toBeGreaterThan(KEY_ACCOUNT_SHARE_FLOOR);

    for (const region of STORY_REGIONS) {
      if (region === KEY_ACCOUNT_REGION) continue;
      expect(topThreeShare(region).top).toBeLessThan(KEY_ACCOUNT_SHARE_FLOOR);
    }
  });
});

describe("formulas ledger", () => {
  const ledger = buildOrdersLedger();
  const { columns } = ledger.data;
  const orders: OrderColumns = {
    rowCount: ledger.data.rowCount,
    month: columns.month as string[],
    region: ledger.region,
    revenue: columns.revenue as Float64Array,
  };

  test("holds one story year at the published row count", () => {
    expect(ledger.data.rowCount).toBe(ORDER_ROWS);

    const yearMonths = monthsOf(
      LEDGER_YEAR,
      Array.from({ length: MONTHS_PER_YEAR }, (_, index) => index),
    );
    expect(new Set(orders.month)).toEqual(new Set(yearMonths));
  });

  test("tells the same story as the shared orders", () => {
    const monthly = sumBy(orders, (row) => orders.month[row] ?? "");

    expect(peakToLull(monthly, LEDGER_YEAR)).toBeGreaterThan(SEASONAL_MARGIN);
    expectDipAndPartialRecovery(orders);
  });

  test("gives every panel data: large orders and demand that falls as price rises", () => {
    const large = orders.revenue.filter((revenue) => revenue > LARGE_ORDER_REVENUE);
    expect(large.length).toBeGreaterThanOrEqual(LARGE_ORDERS_SHOWN);

    // The sign of the covariance is the sign of the LINEST slope.
    const meanUnits = mean([...ledger.units]);
    const meanPrice = mean([...ledger.price]);
    let covariance = 0;
    for (let row = 0; row < ORDER_ROWS; row++) {
      covariance += ((ledger.units[row] ?? 0) - meanUnits) * ((ledger.price[row] ?? 0) - meanPrice);
    }
    expect(covariance).toBeLessThan(0);
  });

  test("keeps the APAC promotion inside one Grid transaction", () => {
    // The Grid rejects a larger transaction, and the promotion button then does nothing.
    expect(validateTransactionResources(apacPromotionOps(ledger))).toMatchObject({ ok: true });
  });
});
