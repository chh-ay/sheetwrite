// The predictor: opens each signal for one formula edit and, on every key,
// ranks their proposals into at most one suggestion. This module is the
// add-on's lazy chunk; index.ts loads it.

import type { FormulaEdit, FormulaSuggestion, Store } from "@sheetwrite/core";
import type { FormulaAnalysis } from "@sheetwrite/core/functions";

import { CALIBRATION } from "./calibration.js";
import {
  calibrationKey,
  type Candidate,
  type Choice,
  choose,
  continues,
  LEAD,
  type OpenSignal,
  rank,
  type Signal,
  SIGNALS,
  type SignalName,
} from "./candidates.js";
import { openColumn } from "./signals/column.js";
import { openNeighbours } from "./signals/neighbours.js";
import { openSyntax } from "./signals/syntax.js";
import { openWorkbookFormulas } from "./signals/workbook.js";
import { type BuildMode, WorkbookPatterns } from "./workbook-patterns.js";

export { SIGNALS, type SignalName } from "./candidates.js";

/** A suggestion and the signal that made it, for the benchmark's per-signal report. */
export interface Prediction extends FormulaSuggestion {
  readonly signal: SignalName;
}

/** Suggestions of one formula edit. */
export interface PredictionSession {
  suggest(text: string, analysis: FormulaAnalysis): Prediction | null;
  feedback(event: "accept" | "accept-word" | "dismiss"): void;
  close(): void;
}

/** Which signals a session uses; the benchmark turns them on one at a time. */
export interface PredictorOptions {
  readonly signals: readonly SignalName[];
  /** When the workbook's formulas are counted: in idle time (the default), or at once. */
  readonly build?: BuildMode;
}

const OPEN_SIGNAL: Readonly<Record<SignalName, OpenSignal>> = {
  neighbours: openNeighbours,
  syntax: openSyntax,
  column: openColumn,
  workbook: openWorkbookFormulas,
};

export function openSignals(
  edit: FormulaEdit,
  signals: readonly SignalName[],
  patterns: WorkbookPatterns | null,
): Signal[] {
  return signals.map((name) => OPEN_SIGNAL[name](edit, patterns));
}

const ALL_SIGNALS: PredictorOptions = { signals: SIGNALS };

/** The suggestion on screen: the text it was shown after, and what it inserts. */
interface Shown {
  readonly text: string;
  readonly choice: Choice;
}

/** Letter case aside, so a dismissed formula stays dismissed however it is typed. */
function formula_key(formula: string): string {
  return formula.toUpperCase();
}

class Session implements PredictionSession {
  private readonly signals: Signal[];
  private shown: Shown | null = null;
  /** Formulas the user dismissed in this edit; they are not suggested again. */
  private readonly dismissed = new Set<string>();

  constructor(
    edit: FormulaEdit,
    signals: readonly SignalName[],
    patterns: WorkbookPatterns | null,
  ) {
    this.signals = openSignals(edit, signals, patterns);
  }

  suggest(text: string, analysis: FormulaAnalysis): Prediction | null {
    if (!text.startsWith("=")) {
      this.shown = null;
      return null;
    }

    const candidates: Candidate[] = [];
    for (const signal of this.signals) {
      for (const proposal of signal.proposals(text, analysis)) {
        if (this.dismissed.has(formula_key(proposal.formula))) continue;
        // A reason the development sets never saw has no measured chance, so it never shows.
        const confidence = CALIBRATION[calibrationKey(proposal, text)] ?? 0;
        candidates.push({ ...proposal, confidence });
      }
    }
    const choice = this.steady(text, choose(rank(text, candidates)));
    this.shown = choice === null ? null : { text, choice };
    return choice === null ? null : { text: choice.text, signal: choice.signal };
  }

  /**
   * Keep the suggestion on screen while the user types it: it is replaced
   * only by a different one that is clearly likelier, so it doesn't flicker.
   */
  private steady(text: string, choice: Choice | null): Choice | null {
    const shown = this.shown;
    if (shown === null) return choice;

    const formula = shown.text + shown.choice.text;
    if (!continues(formula, text)) return choice;

    const rest = { ...shown.choice, text: formula.slice(text.length) };
    if (choice === null || choice.text === rest.text) return rest;
    return choice.confidence >= shown.choice.confidence + LEAD ? choice : rest;
  }

  feedback(event: "accept" | "accept-word" | "dismiss"): void {
    const shown = this.shown;
    if (event !== "dismiss" || shown === null) return;
    this.dismissed.add(formula_key(shown.text + shown.choice.text));
    this.shown = null;
  }

  close(): void {
    this.shown = null;
  }
}

/** The predictor of one store's formula bars, and what it has counted of the store's workbook. */
export interface Predictor {
  open(edit: FormulaEdit): PredictionSession;
  /** Stop following the workbook, and forget it. */
  dispose(): void;
}

/**
 * The predictor of the formula bars of `store`. It counts the workbook's
 * formulas when the page is idle and follows the store's changes, so that an
 * edit can draw on the whole workbook.
 */
export function attachPredictor(store: Store, options: PredictorOptions = ALL_SIGNALS): Predictor {
  const counts = options.signals.includes("workbook");
  const patterns = counts ? new WorkbookPatterns(store, options.build ?? "idle") : null;
  return {
    open: (edit) => new Session(edit, options.signals, patterns),
    dispose: () => patterns?.dispose(),
  };
}
