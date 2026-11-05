import type { ApplyTransactionResult, QueryCommands } from "@sheetwrite/core";

import type { QueryDefinitionResult, QueryRefreshResult, QuerySession } from "./session.js";
import type { QueryDiagnostic } from "./types.js";

// The grid's Data commands show these texts; diagnostics keep only stable
// codes and coordinates, never source values or credentials.
const NOT_APPLIED = "The grid did not accept this change.";

const BLOCKED: Readonly<Record<string, string>> = {
  "missing-sheet": "its output sheet no longer exists",
  "too-wide": "its output is wider than the sheet",
  occupied: "its output would cover cells that other content uses",
};

const READ_ONLY = "The grid is read-only; nothing was written.";

function transactionMessage(result: ApplyTransactionResult): string | null {
  if (result.status === "applied") return null;
  if (result.status === "noop" && result.reason === "read-only") return READ_ONLY;
  if (result.status === "rejected") return result.issues[0]?.message ?? NOT_APPLIED;
  return NOT_APPLIED;
}

function diagnosticMessage(diagnostic: QueryDiagnostic): string {
  const at = [
    diagnostic.step === null ? undefined : `step ${diagnostic.step + 1}`,
    diagnostic.column === null ? undefined : `column ${diagnostic.column}`,
    diagnostic.row === null ? undefined : `row ${diagnostic.row + 1}`,
  ].filter((part) => part !== undefined);
  return `The query engine reported ${diagnostic.code}${at.length > 0 ? ` at ${at.join(", ")}` : ""}.`;
}

function definitionMessage(result: QueryDefinitionResult): string | null {
  if (result.status === "invalid") return diagnosticMessage(result.diagnostic);
  return transactionMessage(result);
}

function refreshMessage(result: QueryRefreshResult): string | null {
  switch (result.status) {
    case "applied":
      return transactionMessage(result.transaction);
    case "failed":
      return `Query ${result.queryId} failed: ${diagnosticMessage(result.diagnostic)} Nothing was written.`;
    case "blocked":
      return `Query ${result.queryId} was not written: ${BLOCKED[result.reason] ?? result.reason}.`;
    case "missing":
      return `Query ${result.queryId} no longer exists.`;
    case "stale":
      return "A query or its output table changed during the refresh; nothing was written.";
    case "aborted":
      return "The refresh was cancelled; nothing was written.";
    case "rejected":
      return transactionMessage(result.transaction) ?? NOT_APPLIED;
  }
}

/** The grid commands' view of a session. */
export function sessionCommands(session: QuerySession): QueryCommands {
  return {
    define: (query) => definitionMessage(session.define(query)),
    async refresh(ids, signal) {
      if (ids === null) return refreshMessage(await session.refreshAll({ signal }));
      for (const id of ids) {
        const message = refreshMessage(await session.refresh(id, { signal }));
        if (message !== null) return message;
      }
      return null;
    },
  };
}
