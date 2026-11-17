// The predictor: the candidates each signal proposes for one formula edit,
// ranked into at most one suggestion. This module is the add-on's lazy chunk;
// the add-on entry loads it on the first formula edit.

import type { FormulaAnalysis, FormulaEdit, FormulaSuggestion } from "@sheetwrite/core";

/** The signals, strongest first, as #801 lists them. */
export const SIGNALS = ["neighbours", "shape", "roles", "patterns", "syntax"] as const;

/** One signal's name. */
export type SignalName = (typeof SIGNALS)[number];

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
}

const ALL_SIGNALS: PredictorOptions = { signals: SIGNALS };

/**
 * Open the suggestions of one formula edit. With no signal built yet, the
 * session suggests nothing and the formula bar behaves as Excel's.
 */
export function openPrediction(
  _edit: FormulaEdit,
  _options: PredictorOptions = ALL_SIGNALS,
): PredictionSession {
  return {
    suggest: () => null,
    feedback: () => undefined,
    close: () => undefined,
  };
}
