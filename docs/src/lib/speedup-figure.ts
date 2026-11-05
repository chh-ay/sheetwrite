import type { PerfFigure, PerfMachine } from "./perf-bars.js";

/** One workbook size of the landing capture: how many times faster Sheetwrite is. */
export interface SpeedupSize {
  readonly size: number;
  readonly comparedScenarios: number;
  readonly medianRatio: number;
  /** Lower and upper quartile of the per-interaction ratios. */
  readonly middleHalf: readonly number[];
  readonly handsontableIncomplete: number;
}

/** One machine's capture in `generated/landing-bench.json`. */
export interface SpeedupMachine {
  readonly machine: PerfMachine;
  readonly label: string;
  readonly capture: {
    readonly commit: string;
    readonly timestamp: string;
    readonly browser: string;
    readonly rounds: number;
  };
  readonly sizes: readonly SpeedupSize[];
}

function rowsLabel(rows: number): string {
  return rows >= 1_000_000
    ? `${(rows / 1_000_000).toLocaleString("en-US")}M rows`
    : `${(rows / 1_000).toLocaleString("en-US")}k rows`;
}

/**
 * Sheetwrite against Handsontable, per workbook size and machine, as the
 * landing page and the performance showcase show it.
 */
export function speedupFigure(id: string, machines: readonly SpeedupMachine[]): PerfFigure {
  return {
    id,
    title: "Times faster than Handsontable, median interaction",
    unit: "ratio",
    scale: "log",
    rowHeader: "Workbook",
    ratioWord: "faster",
    series: { measured: "Median of the interactions" },
    spreadLabel: "Middle half of the interactions",
    groups: machines.map((machine) => ({
      label: machine.label,
      machine: machine.machine,
      note: `Captured ${machine.capture.timestamp.slice(0, 10)} · commit ${machine.capture.commit.slice(0, 7)} · ${machine.capture.rounds} rounds · ${machine.capture.browser}`,
      rows: machine.sizes.map((entry) => {
        const [low, high] = entry.middleHalf;
        return {
          label: rowsLabel(entry.size),
          detail: `${entry.comparedScenarios} interactions${entry.handsontableIncomplete > 0 ? ` · Handsontable did not finish ${entry.handsontableIncomplete}` : ""}`,
          bars: [
            {
              label: "",
              role: "measured",
              stat: {
                value: entry.medianRatio,
                ...(low !== undefined && high !== undefined ? { spread: [low, high] } : {}),
              },
            },
          ],
        };
      }),
    })),
    caption:
      "1× is as fast as Handsontable; each step to the right is ten times faster. Each machine has its own axis, and results from different machines are never compared.",
  };
}
