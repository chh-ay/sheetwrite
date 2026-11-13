import "./dom-setup.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, hostname } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import * as formulas from "@sheetwrite/formulas";

import { resolveChartView, subscribeChartChanges } from "../../packages/core/src/charts-live.js";
import {
  DEFAULT_TRANSACTION_RESOURCE_LIMITS,
  validateTransactionResources,
} from "../../packages/core/src/document-protocol.js";
import { initSheetwrite } from "../../packages/core/src/grid.js";
import { SheetwriteStore } from "../../packages/core/src/store.js";
import type {
  ChartChangeEvent,
  ChartDefinition,
  ChartRef,
  ChartView,
  DocumentOp,
  Sheet,
  Workbook,
} from "../../packages/core/src/types.js";
import { protocolCaptureMeta, type ProtocolCaptureMeta } from "./protocol-meta.js";
import { now, summarize, type Stat } from "./stats.js";

const CHARTS_PER_SHEET = 100;
const FULL_COUNTS = [200, 2_000, 20_000] as const;
/** Cold rows load the larger workbooks, where a first-use cost would show. */
const COLD_COUNTS = [2_000, 20_000] as const;
/** Fresh processes per cold row. */
const COLD_SAMPLES = 21;
const SAMPLES = 101;
/**
 * Untimed commits before each row's samples. A row times microsecond commits,
 * so twenty warmups left JavaScriptCore still tiering up the commit and
 * resolution paths, and a row then measured how much earlier rows had warmed
 * them rather than its own cost. A thousand commits reach steady tiering on
 * every row, so the order rows run in no longer shows in their times.
 */
const WARMUPS = 1_000;
const SOURCE_SHEET = "data";
const SOURCE_VALUE_COL = 0;
const EDIT_VALUE_COL = 1;
const OUTSIDE_COL = 2;
const FORMULA_FACTOR = 2;

export interface ChartTrackingRow {
  readonly chartCount: number;
  readonly source: "literal" | "formula";
  readonly scenario: "outside" | "inside" | "literal-dependency-edit";
  readonly commitMs: Stat;
  readonly baselineMs: Stat;
  readonly eventMs: Stat | null;
  /** Resolving every chart the commit named, after the commit; null when it named none. */
  readonly resolveMs: Stat | null;
  /** Events in each measured commit. */
  readonly expectedEvents: number;
  /** Median charts the implementation named; must include every required chart. */
  readonly expectedCharts: number;
  readonly resolutionsPerCommit: number;
  /** Charts whose source value necessarily changed. */
  readonly requiredCharts: number;
}

/**
 * The first commit after load, plus resolving the charts it names, each sample
 * in a fresh process. Warm rows hide a first-use regression; this row keeps it
 * visible.
 */
export interface ChartColdRow {
  readonly chartCount: number;
  readonly source: ChartSource;
  readonly scenario: "outside" | "inside";
  readonly firstMs: Stat;
}

export interface ChartTrackingArtifact {
  readonly schemaVersion: 1;
  readonly protocol: "sheetwrite-chart-tracking-v2";
  readonly mode: "full" | "smoke";
  readonly meta: ProtocolCaptureMeta & {
    readonly machine: string;
    readonly cpu: string;
    readonly memoryMax: string;
  };
  readonly samples: number;
  readonly warmups: number;
  readonly baseline: Stat;
  readonly rows: readonly ChartTrackingRow[];
  /** One fresh process per sample; `coldSamples` of them per row. */
  readonly coldSamples: number;
  readonly coldRows: readonly ChartColdRow[];
}

/**
 * Validate identities, not just counts. `allowed` keeps conservative engines valid
 * for paired comparisons, while every required chart must still be named once.
 */
export function checkChartEvents(
  events: readonly ChartChangeEvent[],
  required: readonly ChartRef[],
  allowed: readonly ChartRef[] = required,
): number {
  if (events.length > 1) {
    throw new Error(`Expected at most one chart event, received ${events.length}`);
  }
  if (required.length > 0 && events.length === 0) {
    throw new Error("Expected one chart event, received 0");
  }

  const actual = events.flatMap((event) => event.charts).map((ref) => `${ref.sheet}/${ref.id}`);
  const unique = new Set(actual);
  const allowedIds = new Set(allowed.map((ref) => `${ref.sheet}/${ref.id}`));
  const missing = required.map((ref) => `${ref.sheet}/${ref.id}`).filter((id) => !unique.has(id));
  const unrelated = actual.filter((id) => !allowedIds.has(id));
  if (unique.size !== actual.length || missing.length > 0 || unrelated.length > 0) {
    throw new Error(
      `Incorrect chart identities: missing ${missing.join(",")}, unrelated ${unrelated.join(",")}`,
    );
  }
  return actual.length;
}

function sheet(id: string, rowCount: number): Sheet {
  return {
    id,
    name: id,
    rowCount,
    columns: ["a", "b", "c", "d"].map((key) => ({
      key,
      header: key,
      width: 80,
      type: "number" as const,
    })),
  };
}

function reference(index: number): ChartRef {
  return { sheet: `charts${Math.floor(index / CHARTS_PER_SHEET)}`, id: `chart${index}` };
}

function chart(index: number): ChartDefinition {
  return {
    id: reference(index).id,
    kind: "column",
    anchor: { row: 0, col: 3, offsetX: 0, offsetY: 0, width: 400, height: 300 },
    series: [
      {
        values: {
          sheet: SOURCE_SHEET,
          start: { row: index, col: SOURCE_VALUE_COL },
          end: { row: index, col: EDIT_VALUE_COL },
        },
      },
    ],
  };
}

function apply(store: SheetwriteStore, patches: DocumentOp[]): void {
  const result = store.applyTransaction({ patches });
  if (result.status !== "applied") {
    throw new Error(`Benchmark edit rejected: ${JSON.stringify(result)}`);
  }
}

function fixture(
  count: number,
  source: "literal" | "formula",
  withCharts: boolean,
): SheetwriteStore {
  const sheets = [sheet(SOURCE_SHEET, count + 2)];
  for (let index = 0; index < Math.ceil(count / CHARTS_PER_SHEET); index++) {
    const owner = sheet(`charts${index}`, 10);
    if (withCharts) {
      owner.charts = Array.from(
        { length: Math.min(CHARTS_PER_SHEET, count - index * CHARTS_PER_SHEET) },
        (_, slot) => chart(index * CHARTS_PER_SHEET + slot),
      );
    }
    sheets.push(owner);
  }

  const workbook: Workbook = { activeSheet: SOURCE_SHEET, sheets };
  const store = new SheetwriteStore(workbook);
  const { maxOperations } = DEFAULT_TRANSACTION_RESOURCE_LIMITS;
  for (let start = 0; start < count; start += maxOperations) {
    const patches: DocumentOp[] = Array.from(
      { length: Math.min(maxOperations, count - start) },
      (_, offset) => {
        const row = start + offset;
        return {
          op: "set",
          addr: { sheet: SOURCE_SHEET, row, col: SOURCE_VALUE_COL },
          value:
            source === "formula"
              ? { kind: "formula", src: `=B${row + 1}*${FORMULA_FACTOR}` }
              : { kind: "literal", value: row },
        };
      },
    );
    const resources = validateTransactionResources(patches);
    if (!resources.ok) {
      store.dispose();
      throw new Error(`Chart fixture exceeds transaction limits: ${resources.issue.message}`);
    }
    apply(store, patches);
  }
  return store;
}

type ChartSource = "literal" | "formula";
/**
 * Literal-source rows first: they are the control, and formula rows resolve
 * hundreds of charts per commit, which leaves the resolution path warmed up
 * for whatever runs after them. `--source` runs one source per process.
 */
const SOURCES: readonly ChartSource[] = ["literal", "formula"];

/** Commit time of the no-chart control workbook of `count` charts' size. */
function measureControl(count: number, samples: number, warmups: number): Stat {
  const control = fixture(count, "literal", false);
  const controlTimes: number[] = [];
  try {
    // Keep the subscription and workbook shape identical in the no-chart control.
    const detach = subscribeChartChanges(control, () => {
      throw new Error("No-chart control emitted an event");
    });
    for (let iteration = -warmups; iteration < samples; iteration++) {
      const patch: DocumentOp = {
        op: "set",
        addr: { sheet: SOURCE_SHEET, row: count + 1, col: OUTSIDE_COL },
        value: { kind: "literal", value: iteration },
      };
      const start = now();
      apply(control, [patch]);
      const elapsed = now() - start;
      if (iteration >= 0) controlTimes.push(elapsed);
    }
    detach();
  } finally {
    control.dispose();
  }
  return summarize(controlTimes);
}

interface SourceRun {
  readonly count: number;
  readonly source: ChartSource;
  readonly baselineMs: Stat;
  readonly samples: number;
  readonly warmups: number;
}

/** The outside and inside rows of one workbook. */
function measureSource({
  count,
  source,
  baselineMs,
  samples,
  warmups,
}: SourceRun): ChartTrackingRow[] {
  const rows: ChartTrackingRow[] = [];
  const store = fixture(count, source, true);
  const events: ChartChangeEvent[] = [];
  let started = 0;
  let eventLatency = 0;
  let resolutions = 0;
  const detach = subscribeChartChanges(store, (event) => {
    eventLatency = now() - started;
    events.push(event);
    // Resolving views is consumer work, not chart invalidation.
  });
  try {
    for (const scenario of ["outside", "inside"] as const) {
      const required = scenario === "inside" ? [reference(0)] : [];
      const allowed =
        source === "formula"
          ? Array.from({ length: count }, (_, index) => reference(index))
          : required;
      const commits: number[] = [];
      const latencies: number[] = [];
      const resolveTimes: number[] = [];
      const named: number[] = [];
      for (let iteration = -warmups; iteration < samples; iteration++) {
        events.length = 0;
        resolutions = 0;
        // The literal dependency is inside the chart source, so no index rebuild is needed.
        const row = scenario === "outside" ? count + 1 : 0;
        const col = scenario === "outside" ? OUTSIDE_COL : EDIT_VALUE_COL;
        const value = iteration + samples + warmups + 1;
        const patch: DocumentOp = {
          op: "set",
          addr: { sheet: SOURCE_SHEET, row, col },
          value: { kind: "literal", value },
        };
        started = now();
        apply(store, [patch]);
        const elapsed = now() - started;
        const namedCharts = checkChartEvents(events, required, allowed);
        // Resolution is what a consumer does with the event; it is timed on its own.
        const resolved: Array<{ ref: ChartRef; view: ChartView | null }> = [];
        const resolveStart = now();
        for (const event of events) {
          for (const ref of event.charts) {
            resolved.push({ ref, view: resolveChartView(store, ref.sheet, ref.id) });
          }
        }
        const resolveElapsed = now() - resolveStart;
        for (const { ref, view } of resolved) {
          if (view === null) {
            throw new Error(`Reported chart did not resolve: ${ref.sheet}/${ref.id}`);
          }
          if (scenario === "inside" && ref.id === reference(0).id) {
            const values = view.series[0]?.values;
            if (
              values?.[EDIT_VALUE_COL] !== value ||
              (source === "formula" && values?.[SOURCE_VALUE_COL] !== value * FORMULA_FACTOR)
            ) {
              throw new Error("Reported chart did not contain the committed source value");
            }
          }
          resolutions++;
        }
        if (resolutions !== namedCharts) throw new Error("Incorrect chart resolution count");
        if (iteration >= 0) {
          commits.push(elapsed);
          named.push(namedCharts);
          if (namedCharts > 0) {
            latencies.push(eventLatency);
            resolveTimes.push(resolveElapsed);
          }
        }
      }
      rows.push({
        chartCount: count,
        source,
        scenario:
          source === "formula" && scenario === "inside" ? "literal-dependency-edit" : scenario,
        commitMs: summarize(commits),
        baselineMs,
        eventMs: latencies.length > 0 ? summarize(latencies) : null,
        resolveMs: resolveTimes.length > 0 ? summarize(resolveTimes) : null,
        expectedEvents: summarize(named).median > 0 ? 1 : 0,
        expectedCharts: summarize(named).median,
        resolutionsPerCommit: summarize(named).median,
        requiredCharts: required.length,
      });
    }
  } finally {
    detach();
    store.dispose();
  }
  return rows;
}

type ColdScenario = ChartColdRow["scenario"];

/**
 * One cold sample, in this process: load the workbook, then time its first
 * commit and the resolution of every chart that commit names.
 */
async function coldSample(
  source: ChartSource,
  count: number,
  scenario: ColdScenario,
): Promise<number> {
  await initSheetwrite({ engine: formulas });
  const store = fixture(count, source, true);
  const events: ChartChangeEvent[] = [];
  const detach = subscribeChartChanges(store, (event) => events.push(event));
  try {
    const patch: DocumentOp = {
      op: "set",
      addr:
        scenario === "inside"
          ? { sheet: SOURCE_SHEET, row: 0, col: EDIT_VALUE_COL }
          : { sheet: SOURCE_SHEET, row: count + 1, col: OUTSIDE_COL },
      value: { kind: "literal", value: -1 },
    };
    const start = now();
    apply(store, [patch]);
    for (const event of events) {
      for (const ref of event.charts) {
        if (resolveChartView(store, ref.sheet, ref.id) === null) {
          throw new Error(`Reported chart did not resolve: ${ref.sheet}/${ref.id}`);
        }
      }
    }
    const elapsed = now() - start;
    const required = scenario === "inside" ? [reference(0)] : [];
    const allowed =
      source === "formula"
        ? Array.from({ length: count }, (_, index) => reference(index))
        : required;
    checkChartEvents(events, required, allowed);
    return elapsed;
  } finally {
    detach();
    store.dispose();
  }
}

/** Run `samples` cold samples of one row, each in a fresh process. */
function measureCold(
  source: ChartSource,
  count: number,
  scenario: ColdScenario,
  samples: number,
): ChartColdRow {
  const times: number[] = [];
  const script = fileURLToPath(import.meta.url);
  for (let sample = 0; sample < samples; sample++) {
    const child = Bun.spawnSync(
      [process.execPath, script, "--cold-sample", `${source}:${count}:${scenario}`],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = child.stdout.toString().trim();
    const elapsed = Number(output);
    if (child.exitCode !== 0 || !Number.isFinite(elapsed)) {
      throw new Error(`Cold sample failed: ${child.stderr.toString() || output}`);
    }
    times.push(elapsed);
  }
  return { chartCount: count, source, scenario, firstMs: summarize(times) };
}

/** Setup, index construction, and correctness checks are outside the timed interval. */
export async function captureChartTracking(
  smoke: boolean,
  only?: ChartSource,
): Promise<ChartTrackingArtifact> {
  await initSheetwrite({ engine: formulas });
  // Smoke must check full-size admission even though it records only short timing rows.
  if (smoke) {
    const largest = Math.max(...FULL_COUNTS);
    for (const source of SOURCES) {
      fixture(largest, source, true).dispose();
    }
  }
  const samples = smoke ? 5 : SAMPLES;
  const warmups = smoke ? 2 : WARMUPS;
  const counts: readonly number[] = smoke ? [200] : FULL_COUNTS;
  const baselines = new Map<number, Stat>();
  for (const count of counts) baselines.set(count, measureControl(count, samples, warmups));

  const rows: ChartTrackingRow[] = [];
  for (const source of only === undefined ? SOURCES : [only]) {
    for (const count of counts) {
      const baselineMs = baselines.get(count);
      if (baselineMs === undefined) throw new Error(`Missing no-chart baseline for ${count}`);
      rows.push(...measureSource({ count, source, baselineMs, samples, warmups }));
    }
  }
  // Report rows by chart count, as before; the measurement order is above.
  rows.sort((left, right) => left.chartCount - right.chartCount);
  const baseline = baselines.get(2_000) ?? baselines.get(counts[0] ?? 0);

  if (baseline === undefined) throw new Error("Missing no-chart baseline");

  const coldSamples = smoke ? 3 : COLD_SAMPLES;
  const coldRows: ChartColdRow[] = [];
  for (const source of only === undefined ? SOURCES : [only]) {
    for (const count of smoke ? [200] : COLD_COUNTS) {
      for (const scenario of ["outside", "inside"] as const) {
        coldRows.push(measureCold(source, count, scenario, coldSamples));
      }
    }
  }
  return {
    schemaVersion: 1,
    protocol: "sheetwrite-chart-tracking-v2",
    mode: smoke ? "smoke" : "full",
    meta: {
      ...protocolCaptureMeta(),
      machine: hostname(),
      cpu: cpus()[0]?.model ?? "unknown",
      memoryMax: process.env.BENCH_MEMORY_MAX ?? "6G",
    },
    samples,
    warmups,
    baseline,
    rows,
    coldSamples,
    coldRows,
  };
}

/** Parse `<source>:<count>:<scenario>` of a cold sample child process. */
function coldSampleArgs(value: string): [ChartSource, number, ColdScenario] {
  const [source, count, scenario] = value.split(":");
  if (
    (source !== "literal" && source !== "formula") ||
    (scenario !== "inside" && scenario !== "outside") ||
    !Number.isInteger(Number(count))
  ) {
    throw new Error(`Invalid cold sample: ${value}`);
  }
  return [source, Number(count), scenario];
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      smoke: { type: "boolean", default: false },
      source: { type: "string" },
      "cold-sample": { type: "string" },
      output: { type: "string", default: "results/chart-tracking-results.json" },
    },
  });
  const coldArgs = values["cold-sample"];
  if (coldArgs !== undefined) {
    process.stdout.write(`${await coldSample(...coldSampleArgs(coldArgs))}\n`);
    process.exit(0);
  }
  const { source } = values;
  if (source !== undefined && source !== "literal" && source !== "formula") {
    throw new Error("--source must be literal or formula");
  }
  const result = await captureChartTracking(values.smoke, source);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  mkdirSync(dirname(values.output), { recursive: true });
  writeFileSync(values.output, json);
  process.stdout.write(json);
}
