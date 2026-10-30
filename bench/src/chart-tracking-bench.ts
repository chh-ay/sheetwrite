import "./dom-setup.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, hostname } from "node:os";
import { dirname } from "node:path";
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
  DocumentOp,
  Sheet,
  Workbook,
} from "../../packages/core/src/types.js";
import { protocolCaptureMeta, type ProtocolCaptureMeta } from "./protocol-meta.js";
import { now, summarize, type Stat } from "./stats.js";

const CHARTS_PER_SHEET = 100;
const FULL_COUNTS = [200, 2_000, 20_000] as const;
const SAMPLES = 101;
const WARMUPS = 20;
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
  readonly expectedEvents: number;
  readonly expectedCharts: number;
  readonly resolutionsPerCommit: number;
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
}

/** Validate identities, not just counts: a duplicate or unrelated chart is incorrect. */
export function checkChartEvents(
  events: readonly ChartChangeEvent[],
  expected: readonly ChartRef[],
): void {
  const expectedEvents = expected.length === 0 ? 0 : 1;
  if (events.length !== expectedEvents) {
    throw new Error(`Expected ${expectedEvents} chart events, received ${events.length}`);
  }

  const actual = events
    .flatMap((event) => event.charts)
    .map((ref) => `${ref.sheet}/${ref.id}`)
    .sort();
  const wanted = expected.map((ref) => `${ref.sheet}/${ref.id}`).sort();
  if (actual.length !== wanted.length || actual.some((id, index) => id !== wanted[index])) {
    throw new Error(
      `Incorrect chart identities: expected ${wanted.join(",")}, received ${actual.join(",")}`,
    );
  }
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

/** Setup, index construction, and correctness checks are outside the timed interval. */
export async function captureChartTracking(smoke: boolean): Promise<ChartTrackingArtifact> {
  await initSheetwrite(undefined, formulas);
  // Smoke must check full-size admission even though it records only short timing rows.
  if (smoke) {
    const largest = Math.max(...FULL_COUNTS);
    for (const source of ["literal", "formula"] as const) {
      fixture(largest, source, true).dispose();
    }
  }
  const samples = smoke ? 5 : SAMPLES;
  const warmups = smoke ? 2 : WARMUPS;
  const rows: ChartTrackingRow[] = [];
  let baseline: Stat | undefined;

  for (const count of smoke ? [200] : FULL_COUNTS) {
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
    const baselineMs = summarize(controlTimes);
    if (count === 2_000 || baseline === undefined) baseline = baselineMs;

    for (const source of ["literal", "formula"] as const) {
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
          const expected =
            source === "formula"
              ? Array.from({ length: count }, (_, index) => reference(index))
              : scenario === "inside"
                ? [reference(0)]
                : [];
          const commits: number[] = [];
          const latencies: number[] = [];
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
            checkChartEvents(events, expected);
            for (const event of events) {
              for (const ref of event.charts) {
                const view = resolveChartView(store, ref.sheet, ref.id);
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
            }
            if (resolutions !== expected.length)
              throw new Error("Incorrect chart resolution count");
            if (iteration >= 0) {
              commits.push(elapsed);
              if (expected.length > 0) latencies.push(eventLatency);
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
            expectedEvents: expected.length > 0 ? 1 : 0,
            expectedCharts: expected.length,
            resolutionsPerCommit: expected.length,
          });
        }
      } finally {
        detach();
        store.dispose();
      }
    }
  }

  if (baseline === undefined) throw new Error("Missing no-chart baseline");
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
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      smoke: { type: "boolean", default: false },
      output: { type: "string", default: "results/chart-tracking-results.json" },
    },
  });
  const result = await captureChartTracking(values.smoke);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  mkdirSync(dirname(values.output), { recursive: true });
  writeFileSync(values.output, json);
  process.stdout.write(json);
}
