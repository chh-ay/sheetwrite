// Types formulas key by key into formula edits and measures what a
// suggester saves: keys pressed against characters typed, suggestions that
// were wrong, and how often a suggestion helped. This is the quality
// benchmark of #801; the CI gate and the per-signal reports run it.
//
// The typist presses Tab when the suggestion is a prefix of the rest of the
// formula, takes the leading words that agree with Ctrl+→ when that saves
// keys, takes the function list's entry with Tab when it is the function
// being typed (Excel's own completion), and otherwise types the next
// character. It never presses Esc: dismissing costs a key and saves none.

import {
  type CellAddress,
  type FormulaEdit,
  SheetwriteStore,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { analyzeFormula, type FormulaAnalysis } from "@sheetwrite/core/functions";
import {
  type GhostOnScreen,
  openFormulaEdit,
  shownSuggestion,
  suggestionWordEnds,
} from "@sheetwrite/core/testing";

/** One formula to type, in the cell it was found in. */
export interface ReplayTarget {
  readonly cell: CellAddress;
  /** The formula's text, starting with `=`. */
  readonly formula: string;
}

/** A workbook and the formulas typed into it, one at a time. */
export interface ReplayWorkbook {
  readonly id: string;
  readonly snapshot: WorkbookSnapshot;
  readonly targets: readonly ReplayTarget[];
}

/** A suggestion and the name of the signal that made it. */
interface AttributedSuggestion {
  readonly text: string;
  readonly signal: string;
}

/** The session the replay drives: the suggester's own, so each suggestion names its signal. */
export interface ReplaySession {
  suggest(text: string, analysis: FormulaAnalysis): AttributedSuggestion | null;
  feedback?(event: "accept" | "accept-word" | "dismiss"): void;
  close(): void;
}

/** The suggester of one workbook's edits, as `attachPredictor` gives it for the workbook's store. */
interface ReplaySuggester {
  open(edit: FormulaEdit): ReplaySession;
  dispose(): void;
}

/** Attaches a suggester to the store of one workbook. */
export type AttachReplay = (store: SheetwriteStore) => ReplaySuggester;

/** What one signal's suggestions did. */
interface SignalTally {
  shown: number;
  wrong: number;
  /** Suggestions taken whole with Tab or in part with Ctrl+→. */
  taken: number;
  /** Keys the taken suggestions saved: characters inserted minus the keys that took them. */
  savedKeys: number;
}

/** Counts of one replay; `replayMetrics` turns them into rates. */
export interface ReplayCounts {
  formulas: number;
  characters: number;
  keys: number;
  shown: number;
  wrong: number;
  /** Tab presses that took a whole suggestion. */
  accepts: number;
  /** Ctrl+→ presses. */
  wordAccepts: number;
  /** Tab presses that took the function list's entry, as in Excel. */
  listAccepts: number;
  /** Formulas where at least one suggestion was taken. */
  helpedFormulas: number;
  /** Characters inserted by taken suggestions. */
  suggestedCharacters: number;
  readonly bySignal: Map<string, SignalTally>;
  /** Milliseconds of each `suggest` call. */
  readonly suggestMs: number[];
}

/** An empty set of counts. */
export function emptyCounts(): ReplayCounts {
  return {
    formulas: 0,
    characters: 0,
    keys: 0,
    shown: 0,
    wrong: 0,
    accepts: 0,
    wordAccepts: 0,
    listAccepts: 0,
    helpedFormulas: 0,
    suggestedCharacters: 0,
    bySignal: new Map(),
    suggestMs: [],
  };
}

/** The rates the bar is set on. */
export interface ReplayMetrics {
  readonly formulas: number;
  /** Share of keystrokes saved: 1 − keys ÷ characters. */
  readonly saved: number;
  /** Share of shown suggestions that were not a prefix of the rest of the formula. */
  readonly wrong: number;
  /** Share of formulas where a suggestion was taken. */
  readonly coverage: number;
  /** Share of the formulas' characters that taken suggestions inserted. */
  readonly suggestedShare: number;
  /** Share of shown suggestions that were taken. */
  readonly acceptance: number;
  /** Suggestions shown per 100 keys. */
  readonly churn: number;
  /** 95th percentile of `suggest`, in milliseconds. */
  readonly suggestP95Ms: number;
}

const PERCENT = 100;
const P95 = 0.95;

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(rank * sorted.length))] ?? 0;
}

/** The rates of `counts`. */
export function replayMetrics(counts: ReplayCounts): ReplayMetrics {
  return {
    formulas: counts.formulas,
    saved: 1 - ratio(counts.keys, counts.characters),
    wrong: ratio(counts.wrong, counts.shown),
    coverage: ratio(counts.helpedFormulas, counts.formulas),
    suggestedShare: ratio(counts.suggestedCharacters, counts.characters),
    acceptance: ratio(counts.accepts + counts.wordAccepts, counts.shown),
    churn: ratio(counts.shown * PERCENT, counts.keys),
    suggestP95Ms: percentile(counts.suggestMs, P95),
  };
}

/** Whether a quote opens a string before `at` in `formula`. */
function insideString(formula: string, at: number): boolean {
  let inside = false;
  for (let index = 0; index < at; index++) if (formula.charAt(index) === '"') inside = !inside;
  return inside;
}

/**
 * Whether `insert`, typed at `at`, agrees with `formula`: equal text, where
 * letters outside strings may differ in case, as Excel writes names and
 * references in capitals when it commits.
 */
export function agrees(formula: string, at: number, insert: string): boolean {
  if (at + insert.length > formula.length) return false;

  let inside = insideString(formula, at);
  for (let offset = 0; offset < insert.length; offset++) {
    const expected = formula.charAt(at + offset);
    const typed = insert.charAt(offset);
    const same = inside ? expected === typed : expected.toUpperCase() === typed.toUpperCase();
    if (!same) return false;
    if (expected === '"') inside = !inside;
  }
  return true;
}

function tally(counts: ReplayCounts, signal: string): SignalTally {
  let entry = counts.bySignal.get(signal);
  if (entry === undefined) {
    entry = { shown: 0, wrong: 0, taken: 0, savedKeys: 0 };
    counts.bySignal.set(signal, entry);
  }
  return entry;
}

/** The suggestion on screen, so typing through it does not count it again. */
interface ShownSuggestion {
  readonly at: number;
  readonly text: string;
}

/**
 * Whether `text` at `at` is still `shown`: the user typed the start of the
 * shown suggestion and the rest of it is what shows now.
 */
function stillShown(
  shown: ShownSuggestion | null,
  formula: string,
  at: number,
  text: string,
): boolean {
  if (shown === null || at < shown.at) return false;
  const typed = at - shown.at;
  return (
    typed <= shown.text.length &&
    agrees(formula, shown.at, shown.text.slice(0, typed)) &&
    shown.text.slice(typed) === text
  );
}

/** The longest run of leading words of `suggestion` that agrees with `formula`, as a length. */
function agreeingWords(
  formula: string,
  text: string,
  suggestion: string,
  analyzed: (text: string) => FormulaAnalysis,
): { length: number; words: number } {
  const full = text + suggestion;
  const ends = suggestionWordEnds(analyzed(full), text.length, full.length);
  let best = { length: 0, words: 0 };
  for (const [index, end] of ends.entries()) {
    if (!agrees(formula, text.length, suggestion.slice(0, end))) break;
    best = { length: end, words: index + 1 };
  }
  return best;
}

/** One formula edit: the typist, the session and what they did. */
class TypedFormula {
  private text = "=";
  private shown: ShownSuggestion | null = null;
  /** The ghost on screen as the formula bar keeps it, and the signal that made it. */
  private ghost: GhostOnScreen | null = null;
  private ghostSignal = "";
  private helped = false;

  constructor(
    private readonly formula: string,
    private readonly session: ReplaySession,
    private readonly edit: FormulaEdit,
    private readonly counts: ReplayCounts,
  ) {}

  private analyzed = (text: string): FormulaAnalysis =>
    analyzeFormula(text, text.length, this.edit.functions());

  /** Type the whole formula; returns the keys it took. */
  type(): number {
    let keys = 1;
    while (this.text.length < this.formula.length) {
      keys += this.step();
    }
    if (this.helped) this.counts.helpedFormulas++;
    return keys;
  }

  /** One key: take the suggestion, a run of its words or the list's entry, or type a character. */
  private step(): number {
    const analysis = this.analyzed(this.text);
    const started = performance.now();
    const suggestion = this.session.suggest(this.text, analysis);
    this.counts.suggestMs.push(performance.now() - started);

    // What the formula bar would show: the ghost the user types through, or a new suggestion,
    // which needs a list entry it starts with while the function list is open.
    const shown = shownSuggestion(this.text, analysis, suggestion, this.ghost);
    if (shown !== null) {
      if (suggestion !== null && suggestion.text === shown.text)
        this.ghostSignal = suggestion.signal;
      this.ghost = { text: this.text, shown };
      const keys = this.considerSuggestion({ text: shown.text, signal: this.ghostSignal });
      if (keys > 0) return keys;
    } else {
      this.shown = null;
      this.ghost = null;
    }

    if (this.takeListEntry(analysis)) return 1;

    this.insert(1);
    return 1;
  }

  /** Count the suggestion and take what agrees of it; returns the keys used, 0 for none. */
  private considerSuggestion(suggestion: AttributedSuggestion): number {
    const at = this.text.length;
    const signal = tally(this.counts, suggestion.signal);
    if (!stillShown(this.shown, this.formula, at, suggestion.text)) {
      this.counts.shown++;
      signal.shown++;
      if (!agrees(this.formula, at, suggestion.text)) {
        this.counts.wrong++;
        signal.wrong++;
      }
    }
    this.shown = { at, text: suggestion.text };

    if (agrees(this.formula, at, suggestion.text)) {
      this.take(signal, suggestion.text.length, 1);
      this.counts.accepts++;
      this.session.feedback?.("accept");
      this.shown = null;
      return 1;
    }

    const words = agreeingWords(this.formula, this.text, suggestion.text, this.analyzed);
    if (words.length <= words.words) return 0;

    this.take(signal, words.length, words.words);
    this.counts.wordAccepts += words.words;
    for (let word = 0; word < words.words; word++) this.session.feedback?.("accept-word");
    this.shown = { at: this.text.length, text: suggestion.text.slice(words.length) };
    return words.words;
  }

  private take(signal: SignalTally, length: number, keys: number): void {
    this.insert(length);
    signal.taken++;
    signal.savedKeys += length - keys;
    this.counts.suggestedCharacters += length;
    this.helped = true;
  }

  /** Excel's completion: Tab takes the list's first entry when it is the function being typed. */
  private takeListEntry(analysis: FormulaAnalysis): boolean {
    const completion = analysis.completion;
    const entry = completion?.matches[0];
    if (completion === null || entry === undefined) return false;

    const opensCall = this.formula.charAt(completion.to) === "(" ? "" : "(";
    const completed = `${this.text.slice(0, completion.from)}${entry.name}${opensCall}`;
    const length = completed.length - this.text.length;
    if (length <= 1 || !agrees(this.formula, this.text.length, completed.slice(this.text.length))) {
      return false;
    }

    this.insert(length);
    this.counts.listAccepts++;
    return true;
  }

  private insert(length: number): void {
    this.text = this.formula.slice(0, this.text.length + length);
  }
}

/** The most cells dense storage holds; a larger workbook opens paged, as a large file does. */
const MAX_DENSE_CELLS = 5_000_000;

/** A store of `snapshot`, dense unless its sheets hold more cells than dense storage can. */
export function openReplayStore(snapshot: WorkbookSnapshot): SheetwriteStore {
  const cells = snapshot.sheets.reduce(
    (sum, sheet) => sum + sheet.rowCount * sheet.columns.length,
    0,
  );
  return SheetwriteStore.fromSnapshot(snapshot, {
    storage: cells > MAX_DENSE_CELLS ? "paged" : "dense",
  });
}

/** Clear or restore one cell. */
function setCell(store: SheetwriteStore, cell: CellAddress, formula: string | null): void {
  store.applyTransaction({
    patches: [
      {
        op: "set",
        addr: cell,
        value:
          formula === null ? { kind: "literal", value: null } : { kind: "formula", src: formula },
      },
    ],
  });
}

/**
 * Type each target of `workbook` into the workbook without that cell, one at
 * a time, and add what happened to `counts`. The suggester follows the
 * store's changes as it does in a grid, so clearing the cell takes its
 * formula out of what the suggester counted before the edit opens.
 */
export async function replayWorkbook(
  workbook: ReplayWorkbook,
  attach: AttachReplay,
  counts: ReplayCounts,
): Promise<void> {
  const store = openReplayStore(workbook.snapshot);
  const suggester = attach(store);
  try {
    for (const target of workbook.targets) {
      setCell(store, target.cell, null);
      const edit = await openFormulaEdit(store, target.cell);
      const session = suggester.open(edit);
      try {
        const keys = new TypedFormula(target.formula, session, edit, counts).type();
        counts.formulas++;
        counts.characters += target.formula.length;
        counts.keys += keys;
      } finally {
        session.close();
        setCell(store, target.cell, target.formula);
      }
    }
  } finally {
    suggester.dispose();
    store.dispose();
  }
}

/** Replay every workbook of a set. */
export async function replaySet(
  workbooks: Iterable<ReplayWorkbook> | AsyncIterable<ReplayWorkbook>,
  attach: AttachReplay,
): Promise<ReplayCounts> {
  const counts = emptyCounts();
  for await (const workbook of workbooks) await replayWorkbook(workbook, attach, counts);
  return counts;
}
