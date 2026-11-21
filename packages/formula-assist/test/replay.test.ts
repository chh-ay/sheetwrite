import { beforeAll, expect, it } from "bun:test";

import { initSheetwrite } from "@sheetwrite/core";

// The XLSX add-on from its source, as the XLSX package's own tests install it. The add-on
// registry keeps the first add-on of a name, so installing the built package here would stand
// in for the source one in every later test file of the run, and coverage would miss it.
import { xlsxAddon } from "../../xlsx/src/index.js";
import { barMisses, QUALITY_BAR } from "../bench/bar.js";
import { REPLAY_SETS, replayWorkbooks } from "../bench/corpora.js";
import { replayMetrics, replaySet } from "../bench/replay.js";
import { attachPredictor, SIGNALS } from "../src/predictor.js";

// The quality gate of #801: replay every formula of each set key by key and
// hold the predictor to the bar of bench/bar.ts.

/** A set replays thousands of formulas key by key. */
const SET_TIMEOUT_MS = 600_000;

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

for (const set of REPLAY_SETS) {
  const bar = QUALITY_BAR[set];
  if (bar === undefined) continue;

  it(
    `meets the quality bar on ${set}`,
    async () => {
      const counts = await replaySet(replayWorkbooks(set), (store) =>
        attachPredictor(store, { signals: SIGNALS, build: "now" }),
      );
      expect(barMisses(set, replayMetrics(counts), bar)).toEqual([]);
    },
    SET_TIMEOUT_MS,
  );
}
