// Proposals, candidates and their ranking into one suggestion. A signal
// proposes whole formulas, each with the reason it has for it; the predictor
// turns a proposal into a candidate with the measured chance that its reason
// is right, and ranking shows one only when it is clearly the likeliest.

import type { FormulaEdit } from "@sheetwrite/core";
import type { FormulaAnalysis } from "@sheetwrite/core/functions";

import type { WorkbookPatterns } from "./workbook-patterns.js";

/**
 * The signals that earn their keep on the benchmark. #801 also listed
 * argument roles, repeats within a formula and the ranges AutoSum picks; the
 * formulas typed in the session and the same cell on other sheets were tried
 * too. None of those paid on the benchmark.
 */
export const SIGNALS = ["neighbours", "syntax", "column", "workbook"] as const;

/** One signal's name. */
export type SignalName = (typeof SIGNALS)[number];

/** A formula a signal expects in the edited cell, and why. */
export interface Proposal {
  /** The whole formula, starting with `=`. */
  readonly formula: string;
  readonly signal: SignalName;
  /** The situation that made the signal propose it, such as `aboveAndBelow`; calibration is per reason. */
  readonly reason: string;
}

/** A proposal with the chance that the user is typing it. */
export interface Candidate extends Proposal {
  readonly confidence: number;
}

/** One signal's view of one edit: proposals for the text typed so far. */
export interface Signal {
  /** Runs on every key, so it does its reads when the edit opens and only filters here. */
  proposals(text: string, analysis: FormulaAnalysis): readonly Proposal[];
}

/** Opens a signal for one edit; `patterns` is what the predictor has counted of the workbook. */
export type OpenSignal = (edit: FormulaEdit, patterns: WorkbookPatterns | null) => Signal;

/** Characters typed after the `=` at most counted apart; more count as this many. */
const MOST_TYPED = 3;

/**
 * How much the user has typed, for calibration: the characters after the
 * `=`, as `0`, `1`, `2` or `3+`. A formula that keeps agreeing with what the
 * user types gets likelier with every character.
 */
function typedBucket(text: string): string {
  const typed = text.length - 1;
  return typed >= MOST_TYPED ? `${MOST_TYPED}+` : String(typed);
}

/** The calibration key of a proposal after `text`. */
export function calibrationKey(proposal: Proposal, text: string): string {
  return `${proposal.signal}|${proposal.reason}|${typedBucket(text)}`;
}

/**
 * The largest of `steps` (ascending) that `value` reaches, as part of a
 * reason: `≥5` for 7 with steps 1, 2, 5, 20. Calibration counts each bucket apart.
 */
export function bucket(value: number, steps: readonly number[]): string {
  let reached = steps[0] ?? 0;
  for (const step of steps) if (value >= step) reached = step;
  return `≥${reached}`;
}

/**
 * A suggestion shows only when one of its proposals reaches the bar of its
 * signal. The column and workbook signals decide alone where the neighbours
 * have nothing to say, and there they were wrong more often than their
 * confidence over all keys says; on the development sets, any bar from 97%
 * to 99% gives them the same savings without more wrong suggestions.
 */
const SHOW_AT: Readonly<Record<SignalName, number>> = {
  neighbours: 0.9,
  syntax: 0.9,
  column: 0.98,
  workbook: 0.98,
};
/** The bar for the shared start of two candidates, which together are this likely. */
const SHARED_AT = 0.9;
/** A suggestion shows only when it leads the next different candidate by this much. */
export const LEAD = 0.15;
/** A shared start of disagreeing candidates is shown only from this many characters. */
const MIN_SHARED = 2;

/** Whether `formula` starts with `text` and goes on, where letters outside strings may differ in case. */
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
  confidence: number;
  signal: SignalName;
  /** The highest confidence of one member, whose signal the group reports. */
  best: number;
  /** Whether one member reaches the bar of its signal. */
  shows: boolean;
}

/**
 * The candidates that continue `text`, merged by what they insert and sorted
 * by confidence, highest first. Independent reasons that agree make a merged
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
        confidence: candidate.confidence,
        signal: candidate.signal,
        best: candidate.confidence,
        shows: candidate.confidence >= SHOW_AT[candidate.signal],
      });
      continue;
    }
    group.confidence = 1 - (1 - group.confidence) * (1 - candidate.confidence);
    group.shows ||= candidate.confidence >= SHOW_AT[candidate.signal];
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
 * when one of its proposals reaches its signal's bar and it is clearly ahead
 * of the next. When the two best disagree only later on, their shared start
 * shows if together they are likely enough and the best reaches its bar: it
 * is right whichever of them the user means.
 */
export function choose(ranked: readonly Ranked[]): Choice | null {
  const [best, next] = ranked;
  if (best === undefined) return null;

  const lead = best.confidence - (next?.confidence ?? 0);
  if (best.shows && lead >= LEAD) {
    return { text: best.continuation, signal: best.signal, confidence: best.confidence };
  }
  if (next === undefined) return null;

  const shared = sharedLength(best.continuation, next.continuation);
  // Different formulas exclude each other, so their chances add up.
  const together = Math.min(1, best.confidence + next.confidence);
  if (shared < MIN_SHARED || together < SHARED_AT || !best.shows) return null;
  return { text: best.continuation.slice(0, shared), signal: best.signal, confidence: together };
}
