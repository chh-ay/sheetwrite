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
  /** Most rows a source or any step's output may have; default 1,000,000. */
  readonly maxRows: number;
  /** Most cells (rows times columns) a source or any step's output may have; default 16,000,000. */
  readonly maxCells: number;
  /** Most bytes a source may have before it is parsed; default 64 MiB. */
  readonly maxSourceBytes: number;
  /** Conservative cell payload budget across all columns, checked before each append; default 256 MiB. */
  readonly maxOutputBytes: number;
  /** Most steps a plan may have; default 256. */
  readonly maxSteps: number;
}

/** A stable failure code and optional coordinates, without source values or credentials. */
export interface QueryDiagnostic {
  /** Stable failure code, such as `limit`, `type` or `column`. */
  readonly code: string;
  /** Zero-based index of the step that failed; `null` when no step had started. */
  readonly step: number | null;
  /** Id of the column the failure belongs to, or `null`. */
  readonly column: string | null;
  /** Zero-based row the failure belongs to, or `null`. */
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
  /** Values of the rows tagged 1. */
  readonly numbers: Float64Array;
  /** Values of the rows tagged 2, one bit each, lowest bit first. */
  readonly logical: Uint8Array;
  /** UTF-8 bytes of the rows tagged 3, split by `offsets`. */
  readonly text: Uint8Array;
  /** Byte offsets into `text`: text entry `i` runs from `offsets[i]` to `offsets[i + 1]`. */
  readonly offsets: Uint32Array;
  /** Values of the rows tagged 4, as whole days since 1970-01-01. */
  readonly dates: Int32Array;
  /** Values of the rows tagged 5, as microseconds since 1970-01-01T00:00:00, without a time zone. */
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
  /** Number of rows; every column holds this many. */
  readonly rowCount: number;
  /** The batch's columns, in output order. */
  readonly columns: readonly QueryColumn[];
}

/** One execution-local named input, consumed by join steps without a result cache. */
export interface QueryInput {
  /** Id a join step's `input` names to read this batch. */
  readonly id: string;
  /** The rows the join reads. */
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
