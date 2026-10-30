import { writeFileSync } from "node:fs";
import { cpus, hostname } from "node:os";
import { parseArgs } from "node:util";

import { CellStore, load } from "@sheetwrite/formulas";

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

function retainedBytes(stats: Float64Array): number {
  const allocated = stats.at(-1);
  if (allocated === undefined) throw new Error("Missing memory stats totals");
  return allocated;
}

await load();
const store = new CellStore();
try {
  const source = store.addSheet(SOURCE_FIELDS, SOURCE_ROWS + 1);
  const output = store.addSheet(OUTPUT_COLS, OUTPUT_ROWS);
  const maxOutput = store.addSheet(OUTPUT_COLS, OUTPUT_ROWS);
  for (let field = 0; field < SOURCE_FIELDS; field++) {
    store.setString(source, 0, field, `Field${field}`, 0);
    const values = Float64Array.from({ length: SOURCE_ROWS }, (_, row) =>
      field < 4 ? Math.floor(row / AXIS_CARDINALITY ** field) % AXIS_CARDINALITY : row + field,
    );
    store.setColumnNumbers(source, field, 1, values, 0);
  }
  store.commitSources();
  const baselineBytes = retainedBytes(store.memoryStats());
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
  const maxDefinition = new Float64Array([
    ...definition.slice(0, AXES_END),
    1,
    MAX_FIELD,
    MAX_AGGREGATION,
    -1,
    ...definition.slice(-TAIL),
  ]);
  const builds: number[] = [];
  const edits: number[] = [];
  const keyEdits: number[] = [];
  const maxBuilds: number[] = [];
  const maxEdits: number[] = [];
  let editValue = SOURCE_ROWS;

  // The leaf group of data row 0 holds rows 0, 10,000, … 90,000; its MAX is
  // the field-5 value of its last row. Lowering that value removes the
  // extreme, so the cache must read the next one from its counted set.
  const groupStride = AXIS_CARDINALITY ** (ROW_FIELDS + COLUMN_FIELDS);
  const extremeRow = SOURCE_ROWS - groupStride + 1;
  const extreme = extremeRow - 1 + MAX_FIELD;
  const nextExtreme = extreme - groupStride;
  const leafCell = ROW_FIELDS + COLUMN_FIELDS;
  const expectMax = (expected: number, when: string): void => {
    const cell = store.getCell(maxOutput, leafCell, 1);
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
    const buildStart = now();
    if (!store.setPivots(output, definition, ["benchmark"]))
      throw new Error("Rejected benchmark pivot");
    store.recompute(output);
    const buildMs = now() - buildStart;
    const status = store.pivotStatus(output);
    if (status[0] !== 0) throw new Error(`Pivot failed: ${Array.from(status).join(",")}`);
    const editStart = now();
    for (let edit = 0; edit < EDITS_PER_SAMPLE; edit++) {
      store.setNumber(source, 1, 4, ++editValue, 0);
      store.recompute(source);
    }
    const editMs = (now() - editStart) / EDITS_PER_SAMPLE;
    const groupRows = SOURCE_ROWS / groupStride;
    const expectedSum =
      (groupStride * groupRows * (groupRows - 1)) / 2 + (groupRows - 1) * SUM_FIELD + editValue;
    const actualSum = store.getCell(output, ROW_FIELDS + COLUMN_FIELDS, 1);
    try {
      if (actualSum.num !== expectedSum) {
        throw new Error(`Edited pivot SUM: expected ${expectedSum}, got ${actualSum.num}`);
      }
    } finally {
      actualSum.free();
    }

    // Row 1 is the first member, and so the label row, of the group with
    // key 0 at every row level. Moving its first row-field key out and back
    // makes each of those groups find its next label row. An even count
    // leaves the source as it was.
    const keyEditStart = now();
    for (let edit = 0; edit < EDITS_PER_SAMPLE; edit++) {
      store.setNumber(source, 1, 0, edit % 2 === 0 ? 1 : 0, 0);
      store.recompute(source);
    }
    const keyEditMs = (now() - keyEditStart) / EDITS_PER_SAMPLE;
    const keyStatus = store.pivotStatus(output);
    if (keyStatus[0] !== 0) {
      throw new Error(`Pivot failed after key edits: ${Array.from(keyStatus).join(",")}`);
    }

    // Each phase times one pivot: the SUM/AVERAGE pivot also reads field 5,
    // so it is removed while the MAX pivot runs, and the MAX pivot is
    // removed before the next sample.
    store.setPivots(output, new Float64Array(), []);
    store.recompute(output);
    const maxBuildStart = now();
    if (!store.setPivots(maxOutput, maxDefinition, ["max"])) {
      throw new Error("Rejected MAX benchmark pivot");
    }
    store.recompute(maxOutput);
    const maxBuildMs = now() - maxBuildStart;
    expectMax(extreme, "after build");
    const maxEditStart = now();
    for (let edit = 0; edit < EDITS_PER_SAMPLE; edit++) {
      store.setNumber(source, extremeRow, MAX_FIELD, edit % 2 === 0 ? 0 : extreme, 0);
      store.recompute(source);
    }
    const maxEditMs = (now() - maxEditStart) / EDITS_PER_SAMPLE;

    // An even count restores the extreme; one more edit removes it again.
    expectMax(extreme, "after restore");
    store.setNumber(source, extremeRow, MAX_FIELD, 0, 0);
    store.recompute(source);
    expectMax(nextExtreme, "after removing the extreme");
    store.setNumber(source, extremeRow, MAX_FIELD, extreme, 0);
    store.recompute(source);
    store.setPivots(maxOutput, new Float64Array(), []);
    store.recompute(maxOutput);

    if (sample >= 0) {
      builds.push(buildMs);
      edits.push(editMs);
      keyEdits.push(keyEditMs);
      maxBuilds.push(maxBuildMs);
      maxEdits.push(maxEditMs);
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
  const keyEdit = summarize(keyEdits);
  const keyEditSpeedup = build.median / keyEdit.median;
  const maxBuild = summarize(maxBuilds);
  const maxEdit = summarize(maxEdits);
  const maxEditSpeedup = maxBuild.median / maxEdit.median;
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
    donorKeyEditMs: keyEdit,
    donorKeyEditSpeedup: keyEditSpeedup,
    maxBuildMs: maxBuild,
    maxExtremeEditMs: maxEdit,
    maxExtremeEditSpeedup: maxEditSpeedup,
    targetSpeedup: TARGET_SPEEDUP,
    meetsTarget:
      speedup >= TARGET_SPEEDUP &&
      keyEditSpeedup >= TARGET_SPEEDUP &&
      maxEditSpeedup >= TARGET_SPEEDUP,
    retainedBytesBeforePivot: baselineBytes,
    retainedBytesWithPivot: retainedBytes(store.memoryStats()),
    retainedBytesPerPivot: retainedBytes(store.memoryStats()) - baselineBytes,
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
