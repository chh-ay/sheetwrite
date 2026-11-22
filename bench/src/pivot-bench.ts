import { writeFileSync } from "node:fs";
import { cpus, hostname } from "node:os";
import { parseArgs } from "node:util";

import { CellStore, load } from "@sheetwrite/formulas";

import { writeNumberColumn } from "./packed-fixture.js";
import { protocolCaptureMeta } from "./protocol-meta.js";
import { now, summarize } from "./stats.js";

// Run through bench-run --slot 4. Only the full-engine artifacts are needed.
const SOURCE_ROWS = 100_000;
const SOURCE_FIELDS = 6;
const AXIS_CARDINALITY = 10;
const ROW_FIELDS = 3;
const COLUMN_FIELDS = 1;
const SUM_FIELD = 4;
const OUTPUT_ROWS = 2_000;
const OUTPUT_COLS = 32;
const WARMUPS = 3;
const SAMPLES = 15;
const EDITS_PER_SAMPLE = 100;
const TARGET_SPEEDUP = 100;

function retained_bytes(stats: Float64Array): number {
  const allocated = stats.at(-1);
  if (allocated === undefined) throw new Error("Missing memory stats totals");
  return allocated;
}

await load();
const store = new CellStore();
try {
  const source = store.addSheet(SOURCE_FIELDS, SOURCE_ROWS + 1);
  const output = store.addSheet(OUTPUT_COLS, OUTPUT_ROWS);
  const max_output = store.addSheet(OUTPUT_COLS, OUTPUT_ROWS);
  for (let field = 0; field < SOURCE_FIELDS; field++) {
    store.setString(source, 0, field, `Field${field}`, 0);
    const values = Float64Array.from({ length: SOURCE_ROWS }, (_, row) =>
      field < 4 ? Math.floor(row / AXIS_CARDINALITY ** field) % AXIS_CARDINALITY : row + field,
    );
    writeNumberColumn(store, source, field, 1, values, 0);
  }
  store.commitSources();
  const baseline_bytes = retained_bytes(store.memoryStats());
  // Three row fields, one column field, SUM and AVERAGE, all totals/subtotals.
  const definition = new Float64Array([
    0,
    0,
    source,
    0,
    0,
    SOURCE_ROWS,
    SOURCE_FIELDS - 1,
    0,
    0,
    3,
    0,
    1,
    2,
    1,
    3,
    2,
    4,
    0,
    -1,
    5,
    2,
    -1,
    0,
    0,
    7,
  ]);
  // The same axes with one MAX of field 5, which no other case edits.
  const MAX_FIELD = 5;
  const MAX_AGGREGATION = 4;
  // Source, anchor and axes end at index 15; filters, sort and flags are
  // the last three numbers.
  const AXES_END = 15;
  const TAIL = 3;
  const max_definition = new Float64Array([
    ...definition.slice(0, AXES_END),
    1,
    MAX_FIELD,
    MAX_AGGREGATION,
    -1,
    ...definition.slice(-TAIL),
  ]);
  const builds: number[] = [];
  const edits: number[] = [];
  const key_edits: number[] = [];
  const max_builds: number[] = [];
  const max_edits: number[] = [];
  let edit_value = SOURCE_ROWS;

  // The leaf group of data row 0 holds rows 0, 10,000, … 90,000; its MAX is
  // the field-5 value of its last row. Lowering that value removes the
  // extreme, so the cache must read the next one from its counted set.
  const group_stride = AXIS_CARDINALITY ** (ROW_FIELDS + COLUMN_FIELDS);
  const extreme_row = SOURCE_ROWS - group_stride + 1;
  const extreme = extreme_row - 1 + MAX_FIELD;
  const next_extreme = extreme - group_stride;
  const leaf_cell = ROW_FIELDS + COLUMN_FIELDS;
  const expect_max = (expected: number, when: string): void => {
    const cell = store.getCell(max_output, leaf_cell, 1);
    try {
      if (cell.num !== expected) {
        throw new Error(`MAX ${when}: expected ${expected}, got ${cell.num}`);
      }
    } finally {
      cell.free();
    }
  };
  for (let sample = -WARMUPS; sample < SAMPLES; sample++) {
    store.setPivots(output, new Float64Array(), []);
    store.recompute(output);
    const build_start = now();
    if (!store.setPivots(output, definition, ["benchmark"]))
      throw new Error("Rejected benchmark pivot");
    store.recompute(output);
    const build_ms = now() - build_start;
    const status = store.pivotStatus(output);
    if (status[0] !== 0) throw new Error(`Pivot failed: ${Array.from(status).join(",")}`);
    const edit_start = now();
    for (let edit = 0; edit < EDITS_PER_SAMPLE; edit++) {
      store.setNumber(source, 1, 4, ++edit_value, 0);
      store.recompute(source);
    }
    const edit_ms = (now() - edit_start) / EDITS_PER_SAMPLE;
    const group_rows = SOURCE_ROWS / group_stride;
    const expected_sum =
      (group_stride * group_rows * (group_rows - 1)) / 2 +
      (group_rows - 1) * SUM_FIELD +
      edit_value;
    const actual_sum = store.getCell(output, ROW_FIELDS + COLUMN_FIELDS, 1);
    try {
      if (actual_sum.num !== expected_sum) {
        throw new Error(`Edited pivot SUM: expected ${expected_sum}, got ${actual_sum.num}`);
      }
    } finally {
      actual_sum.free();
    }

    // Row 1 is the first member, and so the label row, of the group with
    // key 0 at every row level. Moving its first row-field key out and back
    // makes each of those groups find its next label row. An even count
    // leaves the source as it was.
    const key_edit_start = now();
    for (let edit = 0; edit < EDITS_PER_SAMPLE; edit++) {
      store.setNumber(source, 1, 0, edit % 2 === 0 ? 1 : 0, 0);
      store.recompute(source);
    }
    const key_edit_ms = (now() - key_edit_start) / EDITS_PER_SAMPLE;
    const key_status = store.pivotStatus(output);
    if (key_status[0] !== 0) {
      throw new Error(`Pivot failed after key edits: ${Array.from(key_status).join(",")}`);
    }

    // Each phase times one pivot: the SUM/AVERAGE pivot also reads field 5,
    // so it is removed while the MAX pivot runs, and the MAX pivot is
    // removed before the next sample.
    store.setPivots(output, new Float64Array(), []);
    store.recompute(output);
    const max_build_start = now();
    if (!store.setPivots(max_output, max_definition, ["max"])) {
      throw new Error("Rejected MAX benchmark pivot");
    }
    store.recompute(max_output);
    const max_build_ms = now() - max_build_start;
    expect_max(extreme, "after build");
    const max_edit_start = now();
    for (let edit = 0; edit < EDITS_PER_SAMPLE; edit++) {
      store.setNumber(source, extreme_row, MAX_FIELD, edit % 2 === 0 ? 0 : extreme, 0);
      store.recompute(source);
    }
    const max_edit_ms = (now() - max_edit_start) / EDITS_PER_SAMPLE;

    // An even count restores the extreme; one more edit removes it again.
    expect_max(extreme, "after restore");
    store.setNumber(source, extreme_row, MAX_FIELD, 0, 0);
    store.recompute(source);
    expect_max(next_extreme, "after removing the extreme");
    store.setNumber(source, extreme_row, MAX_FIELD, extreme, 0);
    store.recompute(source);
    store.setPivots(max_output, new Float64Array(), []);
    store.recompute(max_output);

    if (sample >= 0) {
      builds.push(build_ms);
      edits.push(edit_ms);
      key_edits.push(key_edit_ms);
      max_builds.push(max_build_ms);
      max_edits.push(max_edit_ms);
    }
  }

  // Memory per pivot counts the SUM/AVERAGE pivot alone.
  if (!store.setPivots(output, definition, ["benchmark"])) {
    throw new Error("Rejected benchmark pivot");
  }
  store.recompute(output);
  const build = summarize(builds);
  const edit = summarize(edits);
  const speedup = build.median / edit.median;
  const key_edit = summarize(key_edits);
  const key_edit_speedup = build.median / key_edit.median;
  const max_build = summarize(max_builds);
  const max_edit = summarize(max_edits);
  const max_edit_speedup = max_build.median / max_edit.median;
  const result = {
    schemaVersion: 1,
    protocol: "sheetwrite-pivot-v1",
    mode: "full",
    meta: {
      ...protocolCaptureMeta(),
      machine: hostname(),
      cpu: cpus()[0]?.model ?? "unknown",
      memoryMax: process.env.BENCH_MEMORY_MAX ?? "6G",
    },
    sourceRows: SOURCE_ROWS,
    rowFields: 3,
    columnFields: 1,
    valueFields: 2,
    buildMs: build,
    editMs: edit,
    speedup,
    donorKeyEditMs: key_edit,
    donorKeyEditSpeedup: key_edit_speedup,
    maxBuildMs: max_build,
    maxExtremeEditMs: max_edit,
    maxExtremeEditSpeedup: max_edit_speedup,
    targetSpeedup: TARGET_SPEEDUP,
    meetsTarget:
      speedup >= TARGET_SPEEDUP &&
      key_edit_speedup >= TARGET_SPEEDUP &&
      max_edit_speedup >= TARGET_SPEEDUP,
    retainedBytesBeforePivot: baseline_bytes,
    retainedBytesWithPivot: retained_bytes(store.memoryStats()),
    retainedBytesPerPivot: retained_bytes(store.memoryStats()) - baseline_bytes,
    status: Array.from(store.pivotStatus(output)),
  };
  const { values } = parseArgs({ options: { output: { type: "string" } } });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (values.output) writeFileSync(values.output, json);
  process.stdout.write(json);
  if (!result.meetsTarget) process.exitCode = 1;
} finally {
  store.free();
}
