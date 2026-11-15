import { expect, test } from "bun:test";

import { validateTransactionResources } from "../../packages/core/src/document-protocol.js";
import { apacPromotionOps, buildOrdersLedger } from "../src/showcases/scenarios/formulas.js";

test("the APAC promotion fits in one Grid transaction", () => {
  // The Grid rejects a larger transaction, and the promotion button then does nothing.
  expect(validateTransactionResources(apacPromotionOps(buildOrdersLedger()))).toMatchObject({
    ok: true,
  });
});
