import type { QueryColumnSpec, QueryStep } from "@sheetwrite/core";

// Saved workbook queries and headless execution share one step contract.
export type {
  QueryAggregate,
  QueryColumnSpec,
  QueryColumnType,
  QueryJoinKind,
  QueryPredicate,
  QueryStep,
} from "@sheetwrite/core";

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
