// @sheetwrite/formula-assist: predicts the rest of the formula typed in the
// formula bar and shows it as dimmed text, accepted with Tab. This entry only
// registers the add-on; the predictor is a chunk of its own that starts
// loading when a grid with the add-on mounts, so it is there by the first
// formula edit, and is never part of the page's first load. Once it is there,
// it counts the workbook's formulas when the page is idle.

import type {
  FormulaEdit,
  FormulaSuggester,
  FormulaSuggestionSession,
  SheetwriteAddon,
  Store,
} from "@sheetwrite/core";

import type * as PredictorChunk from "./predictor.js";

type PredictorModule = typeof PredictorChunk;

let loading: Promise<PredictorModule> | null = null;

/** Load the predictor once; a failed load is not kept, so the next edit tries again. */
function load_predictor(): Promise<PredictorModule> {
  loading ??= import("./predictor.js").catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Without the predictor the bar keeps Excel's behaviour; the next edit loads it again. */
function report_load_failure(error: unknown): void {
  console.warn("Sheetwrite: formula assist could not load its predictor", error);
}

/** The predictor of a grid's store once the chunk is there; null after the grid is gone. */
type Attach = (module: PredictorModule) => PredictorChunk.Predictor | null;

/**
 * The session of an edit that started before the predictor loaded: it
 * suggests nothing until the chunk arrives, then forwards to the real one.
 */
function pending_session(edit: FormulaEdit, attach: Attach): FormulaSuggestionSession {
  let session: PredictorChunk.PredictionSession | null = null;
  let closed = false;
  load_predictor().then((module) => {
    if (!closed) session = attach(module)?.open(edit) ?? null;
  }, report_load_failure);
  return {
    suggest: (text, analysis) => session?.suggest(text, analysis) ?? null,
    feedback: (event) => session?.feedback(event),
    close: () => {
      closed = true;
      session?.close();
    },
  };
}

/** The suggester of one grid, and what removes its predictor when the grid goes. */
function grid_suggester(store: Store): { suggester: FormulaSuggester; dispose(): void } {
  let predictor: PredictorChunk.Predictor | null = null;
  let disposed = false;
  const attach: Attach = (module) => {
    if (!disposed) predictor ??= module.attachPredictor(store);
    return predictor;
  };
  // An edit that opens before the chunk arrives suggests nothing until the next key, so
  // fetch it now. A failed load is reported, and the first edit loads it again.
  load_predictor().then(attach, report_load_failure);
  return {
    suggester: { open: (edit) => predictor?.open(edit) ?? pending_session(edit, attach) },
    dispose: () => {
      disposed = true;
      predictor?.dispose();
      predictor = null;
    },
  };
}

/**
 * The formula assist add-on. While a formula is typed in a grid's formula
 * bar, it shows the most likely rest of the formula as dimmed text after the
 * caret: Tab takes all of it, Ctrl+→ one word, and Esc hides it. It predicts
 * from the workbook itself, without network or AI: a formula that the cells
 * above and below, or left and right, agree on; the formula a run of cells in
 * the column repeats; the workbook's most common formulas; and the formula's
 * syntax. It shows a suggestion only when it is confident, and nothing
 * otherwise. It reads visible sheets only and keeps what it counts in memory only.
 *
 * @example
 * ```ts
 * import { initSheetwrite } from "@sheetwrite/core";
 * import { formulaAssistAddon } from "@sheetwrite/formula-assist";
 *
 * await initSheetwrite({ addons: [formulaAssistAddon()] });
 * ```
 * @returns The add-on to pass in `initSheetwrite({ addons })`.
 * @see /docs/features/formulas/formula-assist/
 */
export function formulaAssistAddon(): SheetwriteAddon {
  return {
    name: "formulaAssist",
    grid: ({ grid, formulaSuggestions: formula_suggestions }) => {
      const { suggester, dispose } = grid_suggester(grid.store);
      const remove = formula_suggestions(suggester);
      return () => {
        remove();
        dispose();
      };
    },
  };
}
