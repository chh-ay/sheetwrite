/** Physical column types; mixed columns use compact typed payload lanes. */
export type QueryColumnType = "number" | "logical" | "text" | "date" | "dateTime" | "mixed";

/** Stable identity is separate from the field name used by source records. */
export interface QueryColumnSpec {
  readonly id: string;
  readonly name: string;
  readonly type: QueryColumnType;
}

/** Per-execution ceilings; expanding operations reject output before allocation. */
export interface QueryLimits {
  readonly maxRows: number;
  readonly maxCells: number;
  readonly maxSourceBytes: number;
  /** Conservative cell payload budget across all columns, checked before each append. */
  readonly maxOutputBytes: number;
  readonly maxSteps: number;
}

/** A stable failure code and optional coordinates, without source values or credentials. */
export interface QueryDiagnostic {
  readonly code: string;
  readonly step: number | null;
  readonly column: string | null;
  readonly row: number | null;
}

/** Host-owned UTF-8 bytes are parsed against an explicit schema, without type guessing. */
export type QuerySource =
  | {
      readonly format: "json";
      readonly columns: readonly QueryColumnSpec[];
      readonly path?: readonly string[];
    }
  | {
      readonly format: "csv";
      readonly columns: readonly QueryColumnSpec[];
      readonly delimiter?: number;
      readonly headers?: boolean;
      readonly emptyIsNull?: boolean;
    };

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

/** Saved step order is execution order; each column reference is a stable identity. */
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

interface ColumnState {
  readonly id: string;
  readonly name: string;
  /** One little-endian bit per row; zero means null or an error record. */
  readonly validity: Uint8Array;
  /** Sorted unique physical row indexes for sparse error values. */
  readonly errorRows: Uint32Array;
  /** Each entry selects an interned code in errorPool for the matching errorRows entry. */
  readonly errorCodes: Uint32Array;
  /** Stable error codes; mixed error-tag indexes address this same pool. */
  readonly errorPool: readonly string[];
}

/** The tag selects a compact lane; indexes address that lane or the error-code pool. */
export interface QueryMixedLanes {
  /** 0 = null, 1 = number, 2 = logical, 3 = text, 4 = date, 5 = dateTime, 6 = error. */
  readonly tags: Uint8Array;
  /** Index in the typed lane selected by the row's tag. */
  readonly indexes: Uint32Array;
  readonly numbers: Float64Array;
  readonly logical: Uint8Array;
  readonly text: Uint8Array;
  readonly offsets: Uint32Array;
  readonly dates: Int32Array;
  readonly dateTimes: BigInt64Array;
}

/** Typed host buffers; validity and sparse error lanes preserve null/error distinctions. */
export type QueryColumn = ColumnState &
  (
    | { readonly type: "number"; readonly values: Float64Array }
    | { readonly type: "logical"; readonly values: Uint8Array }
    | { readonly type: "text"; readonly bytes: Uint8Array; readonly offsets: Uint32Array }
    | { readonly type: "date"; readonly values: Int32Array }
    | { readonly type: "dateTime"; readonly values: BigInt64Array }
    | ({ readonly type: "mixed" } & QueryMixedLanes)
  );

/** Equal-length columns with a u32 row count; returned buffers are owned by the caller. */
export interface QueryBatch {
  readonly rowCount: number;
  readonly columns: readonly QueryColumn[];
}

/** One execution-local named input, consumed by join steps without a result cache. */
export interface QueryInput {
  readonly id: string;
  readonly batch: QueryBatch;
}

/** Rust performs parsing and every step; this interface does no source fetching. */
export interface QueryEngine {
  /** Parse host-provided bytes; fatal failures throw QueryError. */
  parse(bytes: Uint8Array, source: QuerySource, limits?: Partial<QueryLimits>): QueryBatch;

  /** Execute an ordered plan; cell errors stay in the typed output buffers. */
  execute(
    source: QueryBatch,
    steps: readonly QueryStep[],
    inputs?: readonly QueryInput[],
    limits?: Partial<QueryLimits>,
  ): QueryBatch;
}
