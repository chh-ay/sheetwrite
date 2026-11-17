// Candidates and their ranking into one suggestion. A candidate is a whole
// formula a signal expects, with the measured chance that it is what the
// user is typing; ranking keeps those that continue the typed text and shows
// one only when it is clearly the likeliest.

import type { FormulaAnalysis, FormulaEdit } from "@sheetwrite/core";

/** The signals, strongest first, as #801 lists them. */
export const SIGNALS = ["neighbours", "shape", "roles", "patterns", "syntax"] as const;

/** One signal's name. */
export type SignalName = (typeof SIGNALS)[number];

/** A formula a signal expects in the edited cell. */
export interface Candidate {
  /** The whole formula, starting with `=`. */
  readonly formula: string;
  /**
   * The chance that the user is typing this formula, from the share of such
   * candidates that were right on the benchmark's development sets.
   */
  readonly confidence: number;
  readonly signal: SignalName;
}

/** One signal's view of one edit: candidates for the text typed so far. */
export interface Signal {
  /** Runs on every key, so it does its reads when the edit opens and only filters here. */
  candidates(text: string, analysis: FormulaAnalysis): readonly Candidate[];
}

/** Opens a signal for one edit. */
export type OpenSignal = (edit: FormulaEdit) => Signal;

/** A suggestion is shown only at this confidence or above… */
export const SHOW_AT = 0.9;
/** …and only when it leads the next different candidate by this much. */
export const LEAD = 0.15;
/** A shared start of disagreeing candidates is shown only from this many characters. */
const MIN_SHARED = 2;

/** Whether `formula` starts with `text`, where letters outside strings may differ in case. */
export function continues(formula: string, text: string): boolean {
  if (formula.length <= text.length) return false;

  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const expected = formula.charAt(index);
    const typed = text.charAt(index);
    const same = inString ? expected === typed : expected.toUpperCase() === typed.toUpperCase();
    if (!same) return false;
    if (expected === '"') inString = !inString;
  }
  return true;
}

/** A key that is equal for continuations that insert the same text, letter case aside outside strings. */
function continuationKey(continuation: string): string {
  return continuation
    .split('"')
    .map((part, index) => (index % 2 === 0 ? part.toUpperCase() : part))
    .join('"');
}

/** Candidates that insert the same text, merged. */
interface Ranked {
  readonly continuation: string;
  readonly key: string;
  confidence: number;
  signal: SignalName;
  /** The highest confidence of one member, whose signal the group reports. */
  best: number;
}

/**
 * The candidates that continue `text`, merged by what they insert and sorted
 * by confidence, highest first. Independent signals that agree make a merged
 * candidate likelier: 1 − ∏(1 − pᵢ).
 */
export function rank(text: string, candidates: Iterable<Candidate>): Ranked[] {
  const groups = new Map<string, Ranked>();
  for (const candidate of candidates) {
    if (!continues(candidate.formula, text)) continue;

    const continuation = candidate.formula.slice(text.length);
    const key = continuationKey(continuation);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        continuation,
        key,
        confidence: candidate.confidence,
        signal: candidate.signal,
        best: candidate.confidence,
      });
      continue;
    }
    group.confidence = 1 - (1 - group.confidence) * (1 - candidate.confidence);
    if (candidate.confidence > group.best) {
      group.best = candidate.confidence;
      group.signal = candidate.signal;
    }
  }
  return [...groups.values()].sort((left, right) => right.confidence - left.confidence);
}

/** The length of the start two continuations share, letter case aside outside strings. */
function sharedLength(left: string, right: string): number {
  const leftKey = continuationKey(left);
  const rightKey = continuationKey(right);
  let length = 0;
  while (length < leftKey.length && leftKey.charAt(length) === rightKey.charAt(length)) length++;
  return length;
}

/** What ranking chose: the text to show and the signal behind it. */
export interface Choice {
  readonly text: string;
  readonly signal: SignalName;
  readonly confidence: number;
}

/**
 * The one suggestion to show for `ranked`, or null. The best candidate shows
 * when it is likely enough and clearly ahead of the next. When the two best
 * disagree only later on, their shared start shows if together they are
 * likely enough: it is right whichever of them the user means.
 */
export function choose(ranked: readonly Ranked[]): Choice | null {
  const [best, next] = ranked;
  if (best === undefined) return null;

  const lead = best.confidence - (next?.confidence ?? 0);
  if (best.confidence >= SHOW_AT && lead >= LEAD) {
    return { text: best.continuation, signal: best.signal, confidence: best.confidence };
  }
  if (next === undefined) return null;

  const shared = sharedLength(best.continuation, next.continuation);
  // Different formulas exclude each other, so their chances add up.
  const together = Math.min(1, best.confidence + next.confidence);
  if (shared < MIN_SHARED || together < SHOW_AT) return null;
  return { text: best.continuation.slice(0, shared), signal: best.signal, confidence: together };
}
