import { SheetwriteError } from "@sheetwrite/core";

import type { QueryDiagnostic } from "./types.js";

const LIMIT_DIAGNOSTIC = "limit";

/** Fatal source or plan failure; cell-level errors stay in the returned column lanes. */
export class QueryError extends SheetwriteError {
  override readonly name = "QueryError";
  declare readonly code: "resource-limit" | "invalid-argument";
  readonly diagnostic: QueryDiagnostic;

  /** Diagnostic codes remain stable even when their human-readable context changes. */
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
