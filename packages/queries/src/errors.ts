import type { QueryDiagnostic } from "./types.js";

/** Fatal source or plan failure; cell-level errors stay in the returned column lanes. */
export class QueryError extends Error {
  readonly diagnostic: QueryDiagnostic;

  /** Diagnostic codes remain stable even when their human-readable context changes. */
  constructor(diagnostic: QueryDiagnostic) {
    super(`Sheetwrite query: ${diagnostic.code}`);
    this.name = "QueryError";
    this.diagnostic = diagnostic;
  }
}
