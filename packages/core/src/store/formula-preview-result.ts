// The result-preview types and the decoding of the engine's preview object
// (`previewFormula` in packages/wasm/src/eval/preview.rs). Separate from the
// public `previewFormula`, so the store can decode without importing the
// engine registry.

/** One value of a preview: an error is its text, such as `#DIV/0!`. */
export type FormulaPreviewValue = number | string | boolean | null | { readonly error: string };

/** Why a formula has no preview. */
export type FormulaPreviewUnavailable =
  /** The formula calls RAND, RANDBETWEEN or a host function, which are never run for a preview. */
  | "unsafe-function"
  /** The formula reads or builds more than a preview allows. */
  | "cost-limit"
  /** A cell the formula reads is not loaded yet. */
  | "loading"
  /** The text is not a complete formula. */
  | "syntax";

/** The result of {@link previewFormula}. */
export type FormulaPreview =
  | { readonly status: "value"; readonly value: FormulaPreviewValue }
  | {
      readonly status: "array";
      readonly rows: number;
      readonly cols: number;
      /** The top-left value. */
      readonly first: FormulaPreviewValue;
    }
  | { readonly status: "unavailable"; readonly reason: FormulaPreviewUnavailable };

/** What the engine returns; the numbers are the Rust enums' values. */
export interface EnginePreview {
  readonly status: number;
  readonly kind: number;
  readonly number: number;
  readonly text: string | undefined;
  readonly rows: number;
  readonly cols: number;
  free(): void;
}

const STATUS_VALUE = 0;
const STATUS_ARRAY = 1;
const UNAVAILABLE: readonly (FormulaPreviewUnavailable | undefined)[] = [
  undefined,
  undefined,
  "unsafe-function",
  "cost-limit",
  "loading",
  "syntax",
];

const KIND_NUMBER = 1;
const KIND_TEXT = 2;
const KIND_BOOLEAN = 3;
const KIND_ERROR = 4;

function previewValue(preview: EnginePreview): FormulaPreviewValue {
  switch (preview.kind) {
    case KIND_NUMBER:
      return preview.number;
    case KIND_TEXT:
      return preview.text ?? "";
    case KIND_BOOLEAN:
      return preview.number !== 0;
    case KIND_ERROR:
      return { error: preview.text ?? "#VALUE!" };
    default:
      return null;
  }
}

/** The public form of an engine preview; frees the engine object. */
export function decodePreview(preview: EnginePreview): FormulaPreview {
  try {
    if (preview.status === STATUS_VALUE) return { status: "value", value: previewValue(preview) };
    if (preview.status === STATUS_ARRAY) {
      return {
        status: "array",
        rows: preview.rows,
        cols: preview.cols,
        first: previewValue(preview),
      };
    }

    const reason = UNAVAILABLE[preview.status];
    if (reason === undefined) {
      throw new Error(`Sheetwrite: unknown formula preview status ${preview.status}`);
    }
    return { status: "unavailable", reason };
  } finally {
    preview.free();
  }
}
