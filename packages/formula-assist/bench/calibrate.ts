// Measures how often each kind of candidate is right, to set the confidences
// in src/signals. Types each formula with no suggestion taken and, at every
// key, asks every signal for its candidates; a candidate is right when the
// formula starts with it.
//
//   bun packages/formula-assist/bench/calibrate.ts [--set <name>]...
//
// It refuses the held-out half: confidences are set on the development sets only.

import { parseArgs } from "node:util";

import { initSheetwrite } from "@sheetwrite/core";
import { xlsxAddon } from "@sheetwrite/xlsx";

import { continues, type Signal } from "../src/candidates.js";
import { openSignals, SIGNALS } from "../src/predictor.js";
import { percent } from "./bar.js";
import { REPLAY_SETS, type ReplaySetName, replayWorkbooks } from "./corpora.js";
import { agrees, emptyCounts, type ReplaySession, replayWorkbook } from "./replay.js";

const { values } = parseArgs({ options: { set: { type: "string", multiple: true } } });

function isDevelopmentSet(name: string): name is ReplaySetName {
  return name !== "enron-heldout" && REPLAY_SETS.some((set) => set === name);
}

const sets = (values.set ?? ["enron-dev", "conformance", "fixtures"]).map((name) => {
  if (!isDevelopmentSet(name)) throw new Error(`${name} is not a development set`);
  return name;
});

/** Candidates of one signal and reason, and how many were right. */
const tallies = new Map<string, { candidates: number; right: number }>();

/** A session that suggests nothing and scores every candidate against `formula`. */
function scoring(signals: readonly Signal[], formula: string): ReplaySession {
  const seen = new Set<string>();
  return {
    suggest(text, analysis) {
      for (const signal of signals) {
        for (const candidate of signal.candidates(text, analysis)) {
          if (!continues(candidate.formula, text)) continue;
          const key = `${candidate.signal}\u0000${candidate.reason}\u0000${candidate.formula.toUpperCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const tallyKey = `${candidate.signal} | ${candidate.reason}`;
          const tally = tallies.get(tallyKey) ?? { candidates: 0, right: 0 };
          tally.candidates++;
          if (agrees(formula, 0, candidate.formula)) tally.right++;
          tallies.set(tallyKey, tally);
        }
      }
      return null;
    },
    close: () => undefined,
  };
}

/** z for a one-sided 95% Wilson bound. */
const Z = 1.645;

/** The lower bound of the Wilson interval: a precision the sample size supports. */
function wilsonLower(right: number, total: number): number {
  if (total === 0) return 0;
  const share = right / total;
  const centre = share + (Z * Z) / (2 * total);
  const spread = Z * Math.sqrt((share * (1 - share) + (Z * Z) / (4 * total)) / total);
  return (centre - spread) / (1 + (Z * Z) / total);
}

await initSheetwrite({ addons: [xlsxAddon()] });
const counts = emptyCounts();
for (const set of sets) {
  for await (const workbook of replayWorkbooks(set)) {
    const formulas = new Map(
      workbook.targets.map((target) => [
        `${target.cell.sheet}:${target.cell.row}:${target.cell.col}`,
        target.formula,
      ]),
    );
    await replayWorkbook(
      workbook,
      (edit) => {
        const formula = formulas.get(`${edit.cell.sheet}:${edit.cell.row}:${edit.cell.col}`) ?? "";
        return scoring(openSignals(edit, SIGNALS), formula);
      },
      counts,
    );
  }
}

process.stdout.write(
  `Sets: ${sets.join(", ")}\n\n| Signal | Reason | Candidates | Right | Precision | 95% lower bound |\n| --- | --- | ---: | ---: | ---: | ---: |\n`,
);
for (const [key, tally] of [...tallies].sort(([left], [right]) => left.localeCompare(right))) {
  const precision = percent(tally.right / tally.candidates);
  const lower = percent(wilsonLower(tally.right, tally.candidates));
  process.stdout.write(`| ${key} | ${tally.candidates} | ${tally.right} | ${precision} | ${lower} |\n`);
}
