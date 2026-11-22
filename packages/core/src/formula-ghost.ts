// Ghost text in the formula bar: the suggestion of the store's formula
// suggester (an add-on such as @sheetwrite/formula-assist), drawn dimmed after
// the caret. Tab takes all of it, Ctrl+→ (also ⌥→ on macOS) one word, and Esc
// hides it until the text changes. Without a suggestion every key keeps
// Excel's behaviour, except one: inside a call that still lacks a required
// argument, Tab writes the `,` and moves to the next argument, where Excel's
// Tab could only refuse the formula.

import { analyzeFormula, type FormulaAnalysis } from "./formula-analysis.js";
import { formulaEdit, formulaSuggester } from "./formula-suggestions.js";
import { suggestionWordEnds } from "./formula-words.js";
import type { FormulaFunctionMetadata } from "./functions/types.js";
import type { CellAddress } from "./types/coordinates.js";
import type { FormulaSuggestion, FormulaSuggestionSession } from "./types/formula-suggestion.js";
import type { Store } from "./types/store.js";

/** What the bar shows of a suggestion: its text, and the function list entry Tab takes with it. */
export interface ShownSuggestion {
  readonly text: string;
  /** The entry of the open function list whose text the suggestion starts with; `null` when there is none. */
  readonly listIndex: number | null;
}

/** The suggestion on screen and the text it showed after. */
export interface GhostOnScreen {
  readonly text: string;
  readonly shown: ShownSuggestion;
}

/** Whether a quote opens a string before the end of `text`. */
function ends_in_string(text: string): boolean {
  let inside = false;
  for (const char of text) if (char === '"') inside = !inside;
  return inside;
}

/**
 * The rest of the ghost on screen once the user has typed into it: `text`
 * extends the text it showed after by characters that start the ghost
 * (letter case aside outside strings, as Excel capitalises names). Null on a
 * mismatch, or when the ghost is all typed.
 */
function typed_through(previous: GhostOnScreen | null, text: string): string | null {
  if (previous === null || !text.startsWith(previous.text)) return null;
  const typed = text.slice(previous.text.length);
  const ghost = previous.shown.text;
  if (typed.length === 0 || typed.length >= ghost.length) return null;

  let in_string = ends_in_string(previous.text);
  for (let index = 0; index < typed.length; index++) {
    const expected = ghost.charAt(index);
    const char = typed.charAt(index);
    const same = in_string ? char === expected : char.toUpperCase() === expected.toUpperCase();
    if (!same) return null;
    if (expected === '"') in_string = !in_string;
  }
  return ghost.slice(typed.length);
}

/**
 * What the formula bar shows of `suggestion` after `text`, or null.
 *
 * While the function list is open, a suggestion shows only when it starts
 * with what one entry inserts (its name and `(`): that entry becomes the
 * active one, so the list and the ghost agree. A ghost on screen
 * (`previous`) stays while the user types its next characters, shortened by
 * them, unless another suggestion shows instead; a mismatch drops it. A shown
 * ghost takes Tab while the list's active entry is the one it showed with.
 */
export function shownSuggestion(
  text: string,
  analysis: Pick<FormulaAnalysis, "completion">,
  suggestion: FormulaSuggestion | null,
  previous: GhostOnScreen | null = null,
): ShownSuggestion | null {
  const completion = analysis.completion;
  const entry_of = (rest: string): number => {
    if (completion === null) return -1;
    const name = `${text.slice(completion.from)}${rest}`.toUpperCase();
    return completion.matches.findIndex((fn) => name.startsWith(`${fn.name.toUpperCase()}(`));
  };
  // A new suggestion needs an entry while the list is open; one the user is typing through doesn't.
  const shown = (rest: string, needs_entry: boolean): ShownSuggestion | null => {
    const entry = entry_of(rest);
    if (entry >= 0) return { text: rest, listIndex: entry };
    return completion === null || !needs_entry ? { text: rest, listIndex: null } : null;
  };

  const fresh =
    suggestion === null || suggestion.text.length === 0 || suggestion.text.includes("\n")
      ? null
      : shown(suggestion.text, true);
  if (fresh !== null) return fresh;
  const kept = typed_through(previous, text);
  return kept === null ? null : shown(kept, false);
}

/** Arguments a function needs: those before its first optional or repeating one, plus one repeating. */
function required_arguments(fn: FormulaFunctionMetadata): number {
  let required = 0;
  for (const argument of fn.arguments) {
    if (argument.optional === true) break;
    required++;
    if (argument.repeating === true) break;
  }
  return required;
}

/**
 * Whether Tab moves to the next argument of the call at the end of `text`:
 * the argument guide shows the call, the current argument is filled in, and
 * the function needs more arguments, so the formula is incomplete.
 */
function moves_to_next_argument(text: string, analysis: FormulaAnalysis): boolean {
  const call = analysis.call;
  const fn = call?.function;
  if (call === null || fn === undefined) return false;
  if (call.argumentIndex + 1 >= required_arguments(fn)) return false;

  const last = analysis.tokens.at(-1);
  if (last === undefined || last.to !== text.length) return false;
  const symbol = text.slice(last.from, last.to);
  return symbol !== "(" && symbol !== ",";
}

/** Whether `event` takes one word of the ghost: Ctrl+→, or ⌥→ on macOS. */
function is_word_key(event: KeyboardEvent): boolean {
  if (event.key !== "ArrowRight" || event.shiftKey || event.metaKey) return false;
  return event.ctrlKey !== event.altKey;
}

/** What the ghost needs from formula help: the store, the edited cell and the function list. */
export interface GhostDeps {
  readonly store: Store;
  cell(): Readonly<CellAddress> | null;
  functions(): readonly FormulaFunctionMetadata[];
}

/** One field's suggestions: the session of the cell being edited and the ghost on screen. */
export class FormulaGhost {
  private session: FormulaSuggestionSession | null = null;
  private session_cell: string | null = null;
  private shown: ShownSuggestion | null = null;
  /** The text the shown ghost follows. */
  private shown_after = "";
  /** The text at which Esc hid the ghost; it stays hidden until the text changes. */
  private dismissed_text: string | null = null;

  constructor(private readonly deps: GhostDeps) {}

  /** The ghost on screen, or null. */
  current(): ShownSuggestion | null {
    return this.shown;
  }

  /** The ghost for `text` with the caret at `cursor`; `null` when none shows. */
  update(text: string, cursor: number, analysis: FormulaAnalysis): ShownSuggestion | null {
    if (this.dismissed_text !== null && this.dismissed_text !== text) this.dismissed_text = null;

    const session = this.session_for();
    const at_end = cursor === text.length;
    const asks = session !== null && at_end && this.dismissed_text === null && text.startsWith("=");
    const suggestion = asks ? session.suggest(text, analysis) : null;
    const previous =
      asks && this.shown !== null ? { text: this.shown_after, shown: this.shown } : null;
    this.shown = shownSuggestion(text, analysis, suggestion, previous);
    this.shown_after = text;
    return this.shown;
  }

  /** Take the ghost off: the field no longer holds a formula. */
  hide(): void {
    this.shown = null;
  }

  /**
   * Tab, word and Esc keys while a ghost shows, and Tab at a missing
   * argument. Returns the text to put in the field, or null when the key is
   * not the ghost's. The function list's own keys run before this.
   */
  keyDown(event: KeyboardEvent, text: string, analysis: FormulaAnalysis): string | null {
    const shown = this.shown;
    const plain_tab =
      event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;

    if (shown !== null && plain_tab) {
      this.session?.feedback?.("accept");
      return text + shown.text;
    }
    if (shown !== null && is_word_key(event)) {
      const full = text + shown.text;
      const words = analyzeFormula(full, full.length, this.deps.functions());
      const [first_word] = suggestionWordEnds(words, text.length, full.length);
      this.session?.feedback?.("accept-word");
      return text + shown.text.slice(0, first_word ?? shown.text.length);
    }
    if (shown !== null && event.key === "Escape") {
      this.dismiss(text);
      return text;
    }
    // Only with a suggester: without the add-on the bar keeps Excel's keys exactly.
    const stops = shown === null && plain_tab && this.session !== null;
    if (stops && moves_to_next_argument(text, analysis)) return `${text},`;
    return null;
  }

  /** Hide the ghost until the text changes, and tell the session it was refused. */
  dismiss(text: string): void {
    if (this.shown !== null) this.session?.feedback?.("dismiss");
    this.dismissed_text = text;
    this.shown = null;
  }

  /** End the edit's session. */
  close(): void {
    this.session?.close();
    this.session = null;
    this.session_cell = null;
    this.shown = null;
    this.dismissed_text = null;
  }

  /** The session of the cell being edited, opened on its first key. */
  private session_for(): FormulaSuggestionSession | null {
    const cell = this.deps.cell();
    const suggester = formulaSuggester(this.deps.store);
    const key = cell === null ? null : `${cell.sheet}:${cell.row}:${cell.col}`;
    if (key !== this.session_cell) this.close();
    if (cell === null || suggester === null) return null;

    this.session ??= suggester.open(formulaEdit(this.deps.store, cell, this.deps.functions));
    this.session_cell = key;
    return this.session;
  }
}
