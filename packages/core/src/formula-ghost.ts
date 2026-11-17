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
  /** The entry of the open function list that inserts the same text; `null` when the list is closed. */
  readonly listIndex: number | null;
}

/**
 * What the formula bar shows of `suggestion` after `text`, or null. While the
 * function list is open, Tab takes the list's entry as in Excel, so a
 * suggestion shows only when it is exactly what one entry inserts (its name
 * and `(`); that entry becomes the active one.
 */
export function shownSuggestion(
  text: string,
  analysis: Pick<FormulaAnalysis, "completion">,
  suggestion: FormulaSuggestion | null,
): ShownSuggestion | null {
  if (suggestion === null || suggestion.text.length === 0 || suggestion.text.includes("\n")) {
    return null;
  }

  const completion = analysis.completion;
  if (completion === null) return { text: suggestion.text, listIndex: null };

  const name = `${text.slice(completion.from)}${suggestion.text}`.toUpperCase();
  const listIndex = completion.matches.findIndex((fn) => `${fn.name.toUpperCase()}(` === name);
  return listIndex < 0 ? null : { text: suggestion.text, listIndex };
}

/** Arguments a function needs: those before its first optional or repeating one, plus one repeating. */
function requiredArguments(fn: FormulaFunctionMetadata): number {
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
export function movesToNextArgument(text: string, analysis: FormulaAnalysis): boolean {
  const call = analysis.call;
  const fn = call?.function;
  if (call === null || fn === undefined) return false;
  if (call.argumentIndex + 1 >= requiredArguments(fn)) return false;

  const last = analysis.tokens.at(-1);
  if (last === undefined || last.to !== text.length) return false;
  const symbol = text.slice(last.from, last.to);
  return symbol !== "(" && symbol !== ",";
}

/** Whether `event` takes one word of the ghost: Ctrl+→, or ⌥→ on macOS. */
function isWordKey(event: KeyboardEvent): boolean {
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
  private sessionCell: string | null = null;
  private shown: ShownSuggestion | null = null;
  /** The text at which Esc hid the ghost; it stays hidden until the text changes. */
  private dismissedText: string | null = null;

  constructor(private readonly deps: GhostDeps) {}

  /** The ghost for `text` with the caret at `cursor`; `null` when none shows. */
  update(text: string, cursor: number, analysis: FormulaAnalysis): ShownSuggestion | null {
    if (this.dismissedText !== null && this.dismissedText !== text) this.dismissedText = null;

    const session = this.sessionFor();
    const atEnd = cursor === text.length;
    const suggestion =
      session === null || !atEnd || this.dismissedText !== null || !text.startsWith("=")
        ? null
        : session.suggest(text, analysis);
    this.shown = shownSuggestion(text, analysis, suggestion);
    return this.shown;
  }

  /** The suggestion on screen, if any. */
  get current(): ShownSuggestion | null {
    return this.shown;
  }

  /**
   * Tab, word and Esc keys while a ghost shows, and Tab at a missing
   * argument. Returns the text to put in the field, or null when the key is
   * not the ghost's. The function list's own keys run before this.
   */
  keyDown(event: KeyboardEvent, text: string, analysis: FormulaAnalysis): string | null {
    const shown = this.shown;
    const plainTab =
      event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;

    if (shown !== null && plainTab) {
      this.session?.feedback?.("accept");
      return text + shown.text;
    }
    if (shown !== null && isWordKey(event)) {
      const full = text + shown.text;
      const words = analyzeFormula(full, full.length, this.deps.functions());
      const [firstWord] = suggestionWordEnds(words, text.length, full.length);
      this.session?.feedback?.("accept-word");
      return text + shown.text.slice(0, firstWord ?? shown.text.length);
    }
    if (shown !== null && event.key === "Escape") {
      this.dismiss(text);
      return text;
    }
    // Only with a suggester: without the add-on the bar keeps Excel's keys exactly.
    const stops = shown === null && plainTab && this.session !== null;
    if (stops && movesToNextArgument(text, analysis)) return `${text},`;
    return null;
  }

  /** Hide the ghost until the text changes, and tell the session it was refused. */
  dismiss(text: string): void {
    if (this.shown !== null) this.session?.feedback?.("dismiss");
    this.dismissedText = text;
    this.shown = null;
  }

  /** End the edit's session. */
  close(): void {
    this.session?.close();
    this.session = null;
    this.sessionCell = null;
    this.shown = null;
    this.dismissedText = null;
  }

  /** The session of the cell being edited, opened on its first key. */
  private sessionFor(): FormulaSuggestionSession | null {
    const cell = this.deps.cell();
    const suggester = formulaSuggester(this.deps.store);
    const key = cell === null ? null : `${cell.sheet}:${cell.row}:${cell.col}`;
    if (key !== this.sessionCell) this.close();
    if (cell === null || suggester === null) return null;

    this.session ??= suggester.open(formulaEdit(this.deps.store, cell, this.deps.functions));
    this.sessionCell = key;
    return this.session;
  }
}
