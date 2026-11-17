// The quality bar of formula assist, set in the design note on #801. The
// replay is deterministic, so a change that moves a number moves it on every
// run; floors only go up.

import type { ReplaySetName } from "./corpora.js";
import type { ReplayMetrics } from "./replay.js";

/** The least share of keystrokes saved and the most wrong suggestions one set may show. */
export interface SetBar {
  readonly minSaved: number;
  readonly maxWrong: number;
}

/** The bar of each set the gate runs. The development half is tuned on, so the gate does not use it. */
export const QUALITY_BAR: Readonly<Partial<Record<ReplaySetName, SetBar>>> = {
  "enron-heldout": { minSaved: 0.4, maxWrong: 0.02 },
  conformance: { minSaved: 0, maxWrong: 0.02 },
  fixtures: { minSaved: 0, maxWrong: 0.02 },
};

/** The ways `metrics` misses `bar`, as sentences; empty when it meets it. */
export function barMisses(set: ReplaySetName, metrics: ReplayMetrics, bar: SetBar): string[] {
  const misses: string[] = [];
  if (metrics.saved < bar.minSaved) {
    misses.push(`${set}: saves ${percent(metrics.saved)} of keystrokes, below ${percent(bar.minSaved)}`);
  }
  if (metrics.wrong >= bar.maxWrong) {
    misses.push(`${set}: ${percent(metrics.wrong)} of suggestions are wrong, ${percent(bar.maxWrong)} or more`);
  }
  return misses;
}

/** `share` as a percentage with one decimal. */
export function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
