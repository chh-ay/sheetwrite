// Saved query contracts: the source, ordered steps and output table of one
// workbook query. No runtime values live here; `@sheetwrite/queries` runs them.

import type { CellAddress } from "./coordinates.js";
import type { WorkbookTableId } from "./table.js";

/** Physical column types; mixed columns use compact typed payload lanes. */
export type QueryColumnType = "number" | "logical" | "text" | "date" | "dateTime" | "mixed";

/** Stable identity is separate from the field name used by source records. */
export interface QueryColumnSpec {
  readonly id: string;
  readonly name: string;
  readonly type: QueryColumnType;
}

/** Data-only predicate trees use M null logic; only logical true selects a row. */
export type QueryPredicate =
  | {
      readonly kind: "compare";
      readonly column: string;
      readonly op: "eq" | "neq" | "lt" | "lte" | "gt" | "gte";
      readonly value: string | number | boolean | null;
    }
  | { readonly kind: "isNull"; readonly column: string }
  | { readonly kind: "contains"; readonly column: string; readonly text: string }
  | { readonly kind: "and" | "or"; readonly predicates: readonly QueryPredicate[] }
  | { readonly kind: "not"; readonly predicate: QueryPredicate };

/** Join kinds retain duplicate matches and match null keys to null keys. */
export type QueryJoinKind =
  | "inner"
  | "left"
  | "right"
  | "full"
  | "leftSemi"
  | "rightSemi"
  | "leftAnti"
  | "rightAnti";

/** Column is required except for countRows; numeric aggregates ignore nulls. */
export interface QueryAggregate {
  readonly id: string;
  readonly name: string;
  readonly op: "countRows" | "count" | "sum" | "average" | "min" | "max";
  readonly column?: string;
}

/**
 * Saved step order is execution order; each column reference is a stable identity.
 * In a saved query, a join `input` is the ID of another saved query.
 */
export type QueryStep =
  | { readonly kind: "filter"; readonly predicate: QueryPredicate }
  | { readonly kind: "select"; readonly columns: readonly string[] }
  | { readonly kind: "rename"; readonly columns: readonly (readonly [id: string, name: string])[] }
  | {
      readonly kind: "changeType";
      readonly column: string;
      readonly type: QueryColumnType;
      readonly onError: "error" | "null";
    }
  | {
      readonly kind: "join";
      readonly input: string;
      readonly keys: readonly (readonly [left: string, right: string])[];
      readonly join: QueryJoinKind;
    }
  | {
      readonly kind: "group";
      readonly keys: readonly string[];
      readonly aggregates: readonly QueryAggregate[];
    }
  | {
      readonly kind: "unpivot";
      readonly columns: readonly string[];
      readonly attribute: { readonly id: string; readonly name: string };
      readonly value: { readonly id: string; readonly name: string };
    };

/**
 * Where a saved query reads its data. The host's fetch callback resolves
 * `sourceId` to bytes or batches and applies any credentials itself. A
 * `locator` is a public, credential-free address such as an `https` URL;
 * it never holds tokens, signed parameters or passwords.
 */
export type SavedQuerySource =
  | {
      readonly kind: "csv";
      readonly sourceId: string;
      readonly locator?: string;
      readonly columns: readonly QueryColumnSpec[];
      /** ASCII delimiter byte; default comma. */
      readonly delimiter?: number;
      /** Whether the first record names the columns; default true. */
      readonly headers?: boolean;
      /** Whether an empty field is null rather than empty text; default true. */
      readonly emptyIsNull?: boolean;
    }
  | {
      readonly kind: "json";
      readonly sourceId: string;
      readonly locator?: string;
      readonly columns: readonly QueryColumnSpec[];
      /** Member names from the root to the record array; default the root. */
      readonly path?: readonly string[];
    }
  | {
      /** Typed column batches that the host supplies directly. */
      readonly kind: "host";
      readonly sourceId: string;
      readonly columns: readonly QueryColumnSpec[];
    };

/**
 * The workbook table that holds a query's last refreshed values. Its top-left
 * cell is `anchor`; the first row is the header row. The table cells are the
 * saved result, so a workbook without the query engine still reads them.
 */
export interface SavedQueryOutput {
  /** Stable `WorkbookTable.id`; refresh creates the table if it is absent. */
  readonly table: WorkbookTableId;
  /** Structured-reference name used when refresh creates the table. */
  readonly tableName: string;
  readonly anchor: CellAddress;
}

/** One saved, refreshable query. Definitions never contain host credentials. */
export interface SavedQuery {
  /** Stable identity, unique in the workbook. */
  readonly id: string;
  /** Display name, unique in the workbook when ASCII letter case is ignored. */
  readonly name: string;
  readonly source: SavedQuerySource;
  readonly steps: readonly QueryStep[];
  /** Absent for a query that only feeds other queries. */
  readonly output?: SavedQueryOutput;
}
