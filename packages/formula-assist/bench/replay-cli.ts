// Prints the replay's metrics as Markdown tables.
//
//   bun packages/formula-assist/bench/replay-cli.ts [--set <name>]... [--signals a,b] [--per-signal]
//
// Without `--set` it runs every committed development set. Tune on those and
// on `enron-dev-large` and `enron-dev-large-whole` (built by enron/build.ts),
// never on the held-out sets.
// `--signals` runs those signals instead of all of them; `--per-signal` adds
// each signal alone and the predictor without each one.

import { parseArgs } from "node:util";

import { initSheetwrite } from "@sheetwrite/core";
import { xlsxAddon } from "@sheetwrite/xlsx";

import { attachPredictor, SIGNALS, type SignalName } from "../src/predictor.js";
import { barMisses, percent, QUALITY_BAR } from "./bar.js";
import { DEVELOPMENT_SETS, REPLAY_SETS, type ReplaySetName, replayWorkbooks } from "./corpora.js";
import { type ReplayCounts, replayMetrics, replaySet } from "./replay.js";

const { values } = parseArgs({
  options: {
    set: { type: "string", multiple: true },
    "per-signal": { type: "boolean", default: false },
    signals: { type: "string" },
  },
});

function is_set_name(name: string): name is ReplaySetName {
  return REPLAY_SETS.some((set) => set === name);
}

const requested = values.set ?? DEVELOPMENT_SETS;
const sets = requested.map((name) => {
  if (!is_set_name(name)) throw new Error(`Unknown set ${name}; sets: ${REPLAY_SETS.join(", ")}`);
  return name;
});

function is_signal_name(name: string): name is SignalName {
  return SIGNALS.some((signal) => signal === name);
}

const chosen = (values.signals?.split(",") ?? SIGNALS).map((name) => {
  if (!is_signal_name(name))
    throw new Error(`Unknown signal ${name}; signals: ${SIGNALS.join(", ")}`);
  return name;
});

await initSheetwrite({ addons: [xlsxAddon()] });

function replay(set: ReplaySetName, signals: readonly SignalName[]): Promise<ReplayCounts> {
  return replaySet(replayWorkbooks(set), (store) =>
    attachPredictor(store, { signals, build: "now" }),
  );
}

const MS_DIGITS = 3;

function row(label: string, counts: ReplayCounts): string {
  const metrics = replayMetrics(counts);
  return [
    label,
    String(metrics.formulas),
    percent(metrics.saved),
    percent(metrics.wrong),
    `${counts.shown}`,
    percent(metrics.coverage),
    percent(metrics.acceptance),
    metrics.churn.toFixed(1),
    metrics.suggestP95Ms.toFixed(MS_DIGITS),
  ].join(" | ");
}

const HEADER =
  "| Run | Formulas | Saved | Wrong | Shown | Coverage | Accepted | Shown per 100 keys | suggest p95 (ms) |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |";

let failed = false;
for (const set of sets) {
  process.stdout.write(`\n### ${set}\n\n${HEADER}\n`);
  const floor = await replay(set, []);
  process.stdout.write(`| ${row("Excel floor (function list only)", floor)} |\n`);
  const all = await replay(set, chosen);
  const label = values.signals === undefined ? "All signals" : chosen.join(", ");
  process.stdout.write(`| ${row(label, all)} |\n`);

  if (values["per-signal"]) {
    for (const signal of chosen) {
      process.stdout.write(`| ${row(`${signal} alone`, await replay(set, [signal]))} |\n`);
      const without = chosen.filter((other) => other !== signal);
      process.stdout.write(`| ${row(`all but ${signal}`, await replay(set, without))} |\n`);
    }
  }

  const bar = QUALITY_BAR[set];
  const misses = bar === undefined ? [] : barMisses(set, replayMetrics(all), bar);
  for (const miss of misses) process.stdout.write(`\nBelow the bar: ${miss}\n`);
  failed ||= misses.length > 0;
}
process.exitCode = failed ? 1 : 0;
