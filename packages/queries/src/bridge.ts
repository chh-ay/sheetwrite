import type * as WasmBindings from "../pkg/sheetwrite_queries.js";
import { checkedU32, decodeType, encodeType, packStrings, unpackStrings } from "./encoding.js";
import { QueryError } from "./errors.js";
import type {
  QueryBatch,
  QueryColumn,
  QueryEngine,
  QueryInput,
  QueryLimits,
  QuerySource,
  QueryStep,
} from "./types.js";

type WasmModule = typeof WasmBindings;
type WasmBatch = WasmBindings.QueryBatch;
type WasmColumn = WasmBindings.QueryColumn;
type WasmRunner = WasmBindings.QueryRunner;

const DEFAULT_LIMITS: QueryLimits = {
  maxRows: 1_000_000,
  maxCells: 16_000_000,
  maxSourceBytes: 64 * 1024 * 1024,
  maxOutputBytes: 256 * 1024 * 1024,
  maxSteps: 256,
};
const JSON_FORMAT = 0;
const CSV_FORMAT = 1;
const DEFAULT_CSV_DELIMITER = 44;

function invoke<T>(wasm: WasmModule, operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    if (cause instanceof wasm.QueryFailure) {
      try {
        throw new QueryError({
          code: cause.takeCode(),
          column: cause.takeColumn() || null,
          step: cause.step ?? null,
          row: cause.row ?? null,
        });
      } finally {
        cause.free();
      }
    }

    throw cause;
  }
}

function importColumn(
  wasm: WasmModule,
  column: QueryColumn,
  rows: number,
): InstanceType<WasmModule["ColumnBuilder"]> {
  const metadata = packStrings([column.id, column.name, ...column.errorPool]);
  const builder = new wasm.ColumnBuilder(
    encodeType(column.type),
    checkedU32(rows),
    metadata.bytes,
    metadata.offsets,
    column.validity,
    column.errorRows,
    column.errorCodes,
  );

  try {
    switch (column.type) {
      case "number":
        builder.setNumbers(column.values);
        break;
      case "logical":
        builder.setLogical(column.values);
        break;
      case "text":
        builder.setText(column.bytes, column.offsets);
        break;
      case "date":
        builder.setDates(column.values);
        break;
      case "dateTime":
        builder.setDateTimes(column.values);
        break;
      case "mixed":
        builder.setMixed(column.tags, column.indexes);
        builder.setNumbers(column.numbers);
        builder.setLogical(column.logical);
        builder.setText(column.text, column.offsets);
        builder.setDates(column.dates);
        builder.setDateTimes(column.dateTimes);
        break;
    }

    return builder;
  } catch (cause) {
    builder.free();
    throw cause;
  }
}

function importBatch(wasm: WasmModule, source: QueryBatch): WasmBatch {
  const batch = new wasm.QueryBatch(checkedU32(source.rowCount));

  try {
    for (const column of source.columns) {
      batch.addColumn(importColumn(wasm, column, source.rowCount));
    }

    return batch;
  } catch (cause) {
    batch.free();
    throw cause;
  }
}

function exportColumn(column: WasmColumn): QueryColumn {
  const [id, name, ...errorPool] = unpackStrings(
    column.takeMetadata(),
    column.takeMetadataOffsets(),
  );
  if (id === undefined || name === undefined) {
    throw new Error("Query engine returned incomplete column metadata");
  }

  const state = {
    id,
    name,
    errorPool,
    validity: column.takeValidity(),
    errorRows: column.takeErrorRows(),
    errorCodes: column.takeErrorCodes(),
  };

  switch (decodeType(column.columnType)) {
    case "number":
      return { ...state, type: "number", values: column.takeNumbers() };
    case "logical":
      return { ...state, type: "logical", values: column.takeLogical() };
    case "text":
      return { ...state, type: "text", bytes: column.takeText(), offsets: column.takeOffsets() };
    case "date":
      return { ...state, type: "date", values: column.takeDates() };
    case "dateTime":
      return { ...state, type: "dateTime", values: column.takeDateTimes() };
    case "mixed":
      return {
        ...state,
        type: "mixed",
        tags: column.takeTags(),
        indexes: column.takeIndexes(),
        numbers: column.takeNumbers(),
        logical: column.takeLogical(),
        text: column.takeText(),
        offsets: column.takeOffsets(),
        dates: column.takeDates(),
        dateTimes: column.takeDateTimes(),
      };
  }
}

function exportBatch(batch: WasmBatch): QueryBatch {
  try {
    const columns: QueryColumn[] = [];
    for (let index = 0; index < batch.columnCount; index += 1) {
      const column = batch.takeColumn(index);
      try {
        columns.push(exportColumn(column));
      } finally {
        column.free();
      }
    }

    return { rowCount: batch.rowCount, columns };
  } finally {
    batch.free();
  }
}

function withRunner<T>(
  wasm: WasmModule,
  limits: Partial<QueryLimits> | undefined,
  operation: (runner: WasmRunner) => T,
): T {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const runner = new wasm.QueryRunner(
    checkedU32(resolved.maxRows),
    checkedU32(resolved.maxCells),
    checkedU32(resolved.maxSourceBytes),
    checkedU32(resolved.maxOutputBytes),
    checkedU32(resolved.maxSteps),
  );

  try {
    return operation(runner);
  } finally {
    runner.free();
  }
}

function parse(
  wasm: WasmModule,
  runner: WasmRunner,
  bytes: Uint8Array,
  source: QuerySource,
): QueryBatch {
  const names = packStrings(source.columns.flatMap((column) => [column.id, column.name]));
  const types = Uint8Array.from(source.columns, (column) => encodeType(column.type));
  const path = packStrings(source.format === "json" ? (source.path ?? []) : []);
  const options =
    source.format === "csv"
      ? Uint32Array.of(
          checkedU32(source.delimiter ?? DEFAULT_CSV_DELIMITER),
          source.headers === false ? 0 : 1,
          source.emptyIsNull === false ? 0 : 1,
        )
      : new Uint32Array();
  const schema = new wasm.QuerySchema(types, names.bytes, names.offsets);

  // parseSource consumes the schema even when Rust returns a source failure.
  return exportBatch(
    runner.parseSource(
      bytes,
      schema,
      source.format === "json" ? JSON_FORMAT : CSV_FORMAT,
      options,
      path.bytes,
      path.offsets,
    ),
  );
}

function encodePlan(steps: readonly QueryStep[]): Uint8Array {
  const json = JSON.stringify(steps, (_key: string, value: unknown): unknown => {
    if (typeof value === "number" && Number.isFinite(value) === false) {
      throw new QueryError({ code: "definition", step: null, row: null, column: null });
    }

    return value;
  });

  return new TextEncoder().encode(json);
}

/** The adapter only transfers buffers; Rust owns source parsing and step semantics. */
export function createEngine(wasm: WasmModule): QueryEngine {
  return {
    parse(bytes: Uint8Array, source: QuerySource, limits?: Partial<QueryLimits>): QueryBatch {
      return invoke(wasm, () =>
        withRunner(wasm, limits, (runner) => parse(wasm, runner, bytes, source)),
      );
    },

    execute(
      source: QueryBatch,
      steps: readonly QueryStep[],
      inputs: readonly QueryInput[] = [],
      limits?: Partial<QueryLimits>,
    ): QueryBatch {
      return invoke(wasm, () =>
        withRunner(wasm, limits, (runner) => {
          for (const input of inputs) {
            runner.addInput(input.id, importBatch(wasm, input.batch));
          }

          const plan = encodePlan(steps);
          return exportBatch(runner.execute(importBatch(wasm, source), plan));
        }),
      );
    },
  };
}
