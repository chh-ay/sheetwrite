import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import type { QueryBatch, QueryColumn, QueryStep } from "./dist/index.js";
import { loadQueryEngine } from "./dist/node.js";

const ROW_COUNTS = [10_000, 100_000];
const KEY_COUNT = 1_000;
const BITS_PER_BYTE = 8;
const FULL_MASK_BYTE = 0xff;
const WARMUP_COUNT = 3;
const MIN_SAMPLE_COUNT = 5;
const MIN_SAMPLE_MS = 250;

declare const gc: (() => void) | undefined;

function collect(): void {
  if (typeof Bun !== "undefined") {
    Bun.gc(true);
  } else if (typeof gc === "function") {
    gc();
  }
}

function numbers(id: string, name: string, values: Float64Array): QueryColumn {
  const validity = new Uint8Array(Math.ceil(values.length / BITS_PER_BYTE)).fill(FULL_MASK_BYTE);
  const remainder = values.length % BITS_PER_BYTE;
  if (remainder > 0) {
    validity[validity.length - 1] = (1 << remainder) - 1;
  }

  return {
    id,
    name,
    type: "number",
    values,
    validity,
    errorRows: new Uint32Array(),
    errorCodes: new Uint32Array(),
    errorPool: [],
  };
}

function batch(rows: number): QueryBatch {
  return {
    rowCount: rows,
    columns: [
      numbers(
        "key",
        "Key",
        Float64Array.from({ length: rows }, (_, row) => row % KEY_COUNT),
      ),
      numbers(
        "value",
        "Value",
        Float64Array.from({ length: rows }, (_, row) => row),
      ),
    ],
  };
}

function numericColumn(output: QueryBatch, index: number): Float64Array {
  const column = output.columns[index];
  if (column?.type !== "number") throw new Error("Expected numeric benchmark output");

  return column.values;
}

const engine = await loadQueryEngine();
const right: QueryBatch = {
  rowCount: KEY_COUNT,
  columns: [
    numbers(
      "rightKey",
      "RightKey",
      Float64Array.from({ length: KEY_COUNT }, (_, row) => row),
    ),
  ],
};
const records: { workload: string; rows: number; iterations: number; milliseconds: number }[] = [];

collect();
const memoryBefore = process.memoryUsage();

for (const rows of ROW_COUNTS) {
  const source = batch(rows);
  const workloads: { name: string; steps: QueryStep[]; expectedRows: number }[] = [
    {
      name: "filter",
      expectedRows: rows / 2,
      steps: [
        {
          kind: "filter",
          predicate: { kind: "compare", column: "value", op: "gte", value: rows / 2 },
        },
      ],
    },
    {
      name: "join",
      expectedRows: rows,
      steps: [{ kind: "join", input: "right", keys: [["key", "rightKey"]], join: "inner" }],
    },
    {
      name: "group",
      expectedRows: KEY_COUNT,
      steps: [
        {
          kind: "group",
          keys: ["key"],
          aggregates: [{ id: "sum", name: "Sum", op: "sum", column: "value" }],
        },
      ],
    },
  ];

  for (const workload of workloads) {
    const inputs = workload.name === "join" ? [{ id: "right", batch: right }] : [];
    const run = (): QueryBatch => engine.execute(source, workload.steps, inputs);
    const output = run();
    assert.equal(output.rowCount, workload.expectedRows);

    if (workload.name === "filter") {
      assert.equal(numericColumn(output, 1)[0], rows / 2);
    } else if (workload.name === "join") {
      assert.equal(numericColumn(output, 2)[0], 0);
      assert.equal(numericColumn(output, 2)[rows - 1], KEY_COUNT - 1);
    } else {
      const perKey = rows / KEY_COUNT;
      assert.equal(numericColumn(output, 1)[0], (KEY_COUNT * perKey * (perKey - 1)) / 2);
    }

    for (let warmup = 0; warmup < WARMUP_COUNT; warmup += 1) run();
    collect();

    let iterations = 0;
    const started = performance.now();
    let elapsed = 0;
    while (iterations < MIN_SAMPLE_COUNT || elapsed < MIN_SAMPLE_MS) {
      run();
      iterations += 1;
      elapsed = performance.now() - started;
    }

    records.push({ workload: workload.name, rows, iterations, milliseconds: elapsed / iterations });
  }
}

collect();
const memoryAfter = process.memoryUsage();
const artifact = await readFile(new URL("./pkg/sheetwrite_queries_bg.wasm", import.meta.url));
// The generated loader is already initialized by the public interface; this reads
// its existing memory capacity, not a second engine or a test-only production hook.
const bindings = await import("./pkg/sheetwrite_queries.js");
const initialized = await bindings.default({ module_or_path: artifact });

process.stdout.write(
  JSON.stringify(
    {
      runtime: process.versions.bun === undefined ? "node" : "bun",
      versions: process.versions,
      method: "host transfer plus Rust execution plus output transfer; warmups excluded",
      records,
      memoryBefore,
      memoryAfter,
      wasmCapacityBytes: initialized.memory.buffer.byteLength,
    },
    null,
    2,
  ) + "\n",
);
