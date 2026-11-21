// @sheetwrite/formula-assist: predicts the rest of the formula typed in the
// formula bar and shows it as dimmed text, accepted with Tab. This entry only
// registers the add-on; the predictor is a chunk of its own that starts
// loading when a grid with the add-on mounts, so it is there by the first
// formula edit, and is never part of the page's first load.

import type {
  FormulaEdit,
  FormulaSuggester,
  FormulaSuggestionSession,
  SheetwriteAddon,
} from "@sheetwrite/core";

import type * as PredictorChunk from "./predictor.js";

type PredictorModule = typeof PredictorChunk;

let predictor: PredictorModule | null = null;
let loading: Promise<PredictorModule> | null = null;

/** Load the predictor once; a failed load is not kept, so the next edit tries again. */
function loadPredictor(): Promise<PredictorModule> {
  loading ??= import("./predictor.js").then(
    (module) => {
      predictor = module;
      return module;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

/**
 * The session of an edit that started before the predictor loaded: it
 * suggests nothing until the chunk arrives, then forwards to the real one.
 */
function pendingSession(edit: FormulaEdit): FormulaSuggestionSession {
  let session: PredictorChunk.PredictionSession | null = null;
  let closed = false;
  loadPredictor().then(
    (module) => {
      if (!closed) session = module.openPrediction(edit);
    },
    (error: unknown) => {
      // Without the predictor the bar keeps Excel's behaviour; the next edit retries the load.
      console.warn("Sheetwrite: formula assist could not load its predictor", error);
    },
  );
  return {
    suggest: (text, analysis) => session?.suggest(text, analysis) ?? null,
    feedback: (event) => session?.feedback(event),
    close: () => {
      closed = true;
      session?.close();
    },
  };
}

const suggester: FormulaSuggester = {
  open: (edit) => predictor?.openPrediction(edit) ?? pendingSession(edit),
};

/**
 * The formula assist add-on. While a formula is typed in a grid's formula
 * bar, it shows the most likely rest of the formula as dimmed text after the
 * caret: Tab takes all of it, Ctrl+→ one word, and Esc hides it. It predicts
 * from the sheet itself, without network or AI: a formula that the cells
 * above and below, or left and right, agree on, and the formula's syntax. It
 * shows a suggestion only when it is confident, and nothing otherwise.
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
    grid: ({ formulaSuggestions }) => {
      // An edit that opens before the chunk arrives suggests nothing until the next key, so
      // fetch it now. A failed load is retried by the first edit, which reports it.
      loadPredictor().catch(() => undefined);
      return formulaSuggestions(suggester);
    },
  };
}
