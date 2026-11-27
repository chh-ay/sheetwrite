import { SheetwriteError } from "@sheetwrite/core";

import type { QueryDiagnostic } from "./types.js";

const LIMIT_DIAGNOSTIC = "limit";

/** Fatal source or plan failure; cell-level errors stay in the returned column lanes. */
export class QueryError extends SheetwriteError {
  /** Tells query failures apart from other `SheetwriteError`s in logs and `error.name` checks. */
  override readonly name = "QueryError";
  /** `resource-limit` when a {@link QueryLimits} ceiling was hit, otherwise `invalid-argument`. */
  declare readonly code: "resource-limit" | "invalid-argument";
  /** What failed and where: the step, column and row, never source values. */
  readonly diagnostic: QueryDiagnostic;

  /**
   * Maps the `limit` diagnostic to `resource-limit` and every other diagnostic
   * to `invalid-argument`. The message names only the stable diagnostic code.
   */
  constructor(diagnostic: QueryDiagnostic) {
    super(
      diagnostic.code === LIMIT_DIAGNOSTIC ? "resource-limit" : "invalid-argument",
      "query",
      `Sheetwrite query: ${diagnostic.code}`,
      {
        context: {
          diagnostic: diagnostic.code,
          step: diagnostic.step,
          row: diagnostic.row,
          column: diagnostic.column,
        },
      },
    );
    this.diagnostic = diagnostic;
  }
}
