import { describe, expect, test } from "bun:test";

import { validateTransactionResources } from "../../packages/core/src/document-protocol.js";
import {
  apacPromotionOps,
  buildOrdersLedger,
  ORDER_ROWS,
} from "../src/showcases/scenarios/formulas.js";
import { buildStoryOrders, STORY_ORDER_ROWS } from "../src/showcases/scenarios/orders-story.js";

/** The panel "Largest orders" shows five orders above this revenue. */
const LARGE_ORDER_REVENUE = 4_000;
const LARGE_ORDERS_SHOWN = 5;

test("story orders are deterministic, and each order's revenue is its units times its price", () => {
  const orders = buildStoryOrders();
  const again = buildStoryOrders();

  expect(orders.rowCount).toBe(STORY_ORDER_ROWS);
  expect(again.revenue).toEqual(orders.revenue);
  expect(again.account).toEqual(orders.account);
  expect(again.date).toEqual(orders.date);
  for (let row = 0; row < orders.rowCount; row++) {
    expect(orders.revenue[row]).toBe((orders.units[row] ?? 0) * (orders.unitPrice[row] ?? 0));
  }
});

describe("formulas ledger", () => {
  const ledger = buildOrdersLedger();

  test("gives every panel data: large orders and demand that falls as price rises", () => {
    expect(ledger.data.rowCount).toBe(ORDER_ROWS);
    const revenue = ledger.data.columns.revenue as Float64Array;
    const large = revenue.filter((value) => value > LARGE_ORDER_REVENUE);
    expect(large.length).toBeGreaterThanOrEqual(LARGE_ORDERS_SHOWN);

    // The sign of the covariance is the sign of the LINEST slope.
    const mean = (values: ArrayLike<number>) =>
      Array.from(values).reduce((sum, value) => sum + value, 0) / values.length;
    const meanUnits = mean(ledger.units);
    const meanPrice = mean(ledger.price);
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
