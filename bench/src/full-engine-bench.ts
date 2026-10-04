import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";
import { initSheetwrite } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";
import {
  type CompleteFormulaBenchmarkResult,
  type CompleteFormulaWorkloadResult,
  collectFixture,
  validateFormulaCapture,
} from "./formula-bench.js";
import { validateExactMatrix, validateRawStat } from "./gate-protocol.js";
import { type ProtocolCaptureMeta, protocolCaptureMeta } from "./protocol-meta.js";
import { type Stat, summarize } from "./stats.js";

const ENGINE_IDS = ["default", "full"] as const;
const SAMPLE_COUNT = 5;
const ANALYSIS_COUNT = 1_000;
export const ANALYSIS_CASES = [
  { id: "linest", formula: "=SUM(LINEST(B1:B100,A1:A100))", expected: 5 },
  { id: "xirr", formula: "=XIRR(A1:A2,B1:B2)", expected: 0.1 },
  { id: "dsum", formula: '=DSUM(A1:B101,"value",D1:D2)', expected: 10_400 },
  {
    id: "textsplit-regexreplace",
    formula: '=COUNTA(TEXTSPLIT(REGEXREPLACE("a1,b2,c3","[0-9]",""),","))',
    expected: 3,
  },
  { id: "sortby", formula: "=INDEX(SORTBY(B1:B100,A1:A100,-1),1,1)", expected: 203 },
  { id: "mode-mult", formula: "=SUM(MODE.MULT(1,1,2,2,3))", expected: 3 },
  {
    id: "map-reduce",
    formula: "=REDUCE(0,MAP(A1:A100,LAMBDA(x,x+1)),LAMBDA(a,x,a+x))",
    expected: 5_150,
  },
  { id: "mmult", formula: "=SUM(MMULT(A1:B2,C1:D2))", expected: 134 },
] as const;

interface EngineCapture {
  engine: (typeof ENGINE_IDS)[number];
  shared: CompleteFormulaBenchmarkResult;
  wasm: { rawBytes: number; brotliBytes: number; sha256: string };
  initialization: { samplesMs: number[]; stat: Stat };
}
export interface FullEngineResult {
  schemaVersion: 1;
  meta: ProtocolCaptureMeta;
  sourceFiles: Record<string, string>;
  sourceDigest: string;
  initializationMethod: string;
  engines: EngineCapture[];
  analysis: CompleteFormulaWorkloadResult[];
}
const INIT_METHOD =
  "five fresh Node processes; monotonic time around initSheetwrite only; imports and process startup excluded; filesystem cache not cleared";
const SOURCE_PATHS = [
  "bench/src/full-engine-bench.ts",
  "bench/src/formula-bench.ts",
  "bench/src/node-engine-init.mjs",
  "packages/core/dist/index.js",
  "packages/formulas/loader.mjs",
  "packages/formulas/pkg/sheetwrite_wasm.js",
  "packages/formulas/pkg/sheetwrite_wasm_bg.wasm",
  "packages/wasm/loader.mjs",
  "packages/wasm/pkg/sheetwrite_wasm.js",
  "packages/wasm/pkg/sheetwrite_wasm_bg.wasm",
];
function hash(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function sourceDigest(result: Pick<FullEngineResult, "meta" | "sourceFiles">): string {
  return hash(JSON.stringify({ commit: result.meta.commit, files: result.sourceFiles }));
}
function exactKeys(value: object, keys: readonly string[], label: string): void {
  validateExactMatrix(label, keys, Object.keys(value));
}
export function validateFullEngineResult(result: FullEngineResult): void {
  exactKeys(
    result,
    [
      "schemaVersion",
      "meta",
      "sourceFiles",
      "sourceDigest",
      "initializationMethod",
      "engines",
      "analysis",
    ],
    "engine artifact fields",
  );
  if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024)
    throw new Error("engine artifact exceeds the 4 MiB bound");
  exactKeys(result.meta, ["commit", "dirty", "timestamp"], "engine metadata");
  if (
    !/^[0-9a-f]{40}$/u.test(result.meta.commit) ||
    typeof result.meta.dirty !== "boolean" ||
    !Number.isFinite(Date.parse(result.meta.timestamp)) ||
    new Date(result.meta.timestamp).toISOString() !== result.meta.timestamp
  )
    throw new Error("invalid engine metadata");
  if (result.schemaVersion !== 1 || result.initializationMethod !== INIT_METHOD)
    throw new Error("engine protocol mismatch");
  exactKeys(result.sourceFiles, SOURCE_PATHS, "engine source files");
  if (
    Object.values(result.sourceFiles).some((digest) => !/^[0-9a-f]{64}$/u.test(digest)) ||
    result.sourceDigest !== sourceDigest(result)
  )
    throw new Error("engine source digest mismatch");
  validateExactMatrix(
    "engine",
    ENGINE_IDS,
    result.engines.map((capture) => capture.engine),
  );
  for (const capture of result.engines) {
    exactKeys(capture, ["engine", "shared", "wasm", "initialization"], "engine capture fields");
    validateFormulaCapture(capture.shared);
    if (
      capture.shared.mode !== "full" ||
      capture.shared.meta.commit !== result.meta.commit ||
      capture.shared.meta.dirty !== result.meta.dirty
    )
      throw new Error("engine capture provenance mismatch");
    exactKeys(capture.wasm, ["rawBytes", "brotliBytes", "sha256"], "engine wasm fields");
    const wasmPath = `packages/${capture.engine === "full" ? "formulas" : "wasm"}/pkg/sheetwrite_wasm_bg.wasm`;
    if (
      capture.wasm.sha256 !== result.sourceFiles[wasmPath] ||
      !Number.isSafeInteger(capture.wasm.rawBytes) ||
      !Number.isSafeInteger(capture.wasm.brotliBytes) ||
      capture.wasm.brotliBytes <= 0 ||
      capture.wasm.rawBytes < capture.wasm.brotliBytes
    )
      throw new Error("engine wasm evidence mismatch");
    exactKeys(capture.initialization, ["samplesMs", "stat"], "engine initialization fields");
    if (capture.initialization.samplesMs.length !== SAMPLE_COUNT)
      throw new Error("missing initialization samples");
    validateRawStat(
      capture.initialization.samplesMs,
      capture.initialization.stat,
      "initialization",
    );
  }
  validateExactMatrix(
    "analysis",
    ANALYSIS_CASES.map((scenario) => scenario.id),
    result.analysis.map((workload) => workload.id),
  );
  for (const workload of result.analysis) {
    const scenario = ANALYSIS_CASES.find((candidate) => candidate.id === workload.id);
    if (
      !scenario ||
      workload.size !== ANALYSIS_COUNT ||
      workload.samplesMs.length !== SAMPLE_COUNT ||
      typeof workload.output !== "number" ||
      !Number.isFinite(workload.output) ||
      Math.abs(workload.output - scenario.expected * ANALYSIS_COUNT) >
        1e-7 * Math.max(1, Math.abs(workload.output))
    )
      throw new Error("analysis output or samples mismatch");
    exactKeys(
      workload,
      ["id", "size", "samplesMs", "stat", "allocationSamples", "allocationStat", "output"],
      "analysis fields",
    );
    validateRawStat(workload.samplesMs, workload.stat, workload.id);
    if (workload.stat.p95 >= 30_000) throw new Error("analysis exceeded the 30 second ceiling");
    exactKeys(
      workload.allocationStat,
      ["retainedBytes", "peakTransientBytes", "transientAllocations"],
      "analysis allocation fields",
    );
    for (const sample of workload.allocationSamples)
      exactKeys(
        sample,
        ["retainedBytes", "peakTransientBytes", "transientAllocations"],
        "analysis allocation sample fields",
      );
    if (workload.allocationSamples.length !== SAMPLE_COUNT)
      throw new Error("missing analysis allocation samples");
    for (const field of ["retainedBytes", "peakTransientBytes", "transientAllocations"] as const) {
      const samples = workload.allocationSamples.map((sample) => sample[field]);
      if (samples.some((sample) => !Number.isSafeInteger(sample) || sample < 0))
        throw new Error("invalid analysis allocation");
      validateRawStat(samples, workload.allocationStat[field], `${workload.id}.${field}`);
    }
  }
}
function analysisFixture(formula: string) {
  const store = new formulas.CellStore();
  const sheet = store.addSheet(6, ANALYSIS_COUNT);
  store.setColumnNumbers(
    sheet,
    0,
    0,
    Float64Array.from({ length: 100 }, (_, row) => row + 1),
    0,
  );
  store.setColumnNumbers(
    sheet,
    1,
    0,
    Float64Array.from({ length: 100 }, (_, row) => 2 * (row + 1) + 3),
    0,
  );
  if (formula.startsWith("=XIRR")) {
    store.setColumnNumbers(sheet, 0, 0, new Float64Array([-100, 110]), 0);
    store.setColumnNumbers(sheet, 1, 0, new Float64Array([1, 366]), 0);
  }
  if (formula.includes("MMULT")) {
    store.setColumnNumbers(sheet, 0, 0, new Float64Array([1, 3]), 0);
    store.setColumnNumbers(sheet, 1, 0, new Float64Array([2, 4]), 0);
    store.setColumnNumbers(sheet, 2, 0, new Float64Array([5, 7]), 0);
    store.setColumnNumbers(sheet, 3, 0, new Float64Array([6, 8]), 0);
  }
  // The database has its own header row. Its final value is not part of the regression data.
  if (formula.startsWith("=DSUM")) {
    store.setString(sheet, 0, 0, "key", 0);
    store.setString(sheet, 0, 1, "value", 0);
    store.setColumnNumbers(
      sheet,
      0,
      1,
      Float64Array.from({ length: 100 }, (_, row) => row + 1),
      0,
    );
    store.setColumnNumbers(
      sheet,
      1,
      1,
      Float64Array.from({ length: 100 }, (_, row) => 2 * (row + 1) + 3),
      0,
    );
    store.setString(sheet, 0, 3, "key", 0);
    store.setString(sheet, 1, 3, ">0", 0);
  }
  for (let row = 0; row < ANALYSIS_COUNT; row++) store.setFormula(sheet, row, 5, formula, 0);
  return {
    store,
    run: () => store.recompute(sheet),
    check: () => {
      let checksum = 0;
      for (let row = 0; row < ANALYSIS_COUNT; row++) {
        const cell = store.getCell(sheet, row, 5);
        const value = cell.num;
        const error = cell.string;
        cell.free();
        if (error !== undefined) throw new Error(`${formula} returned ${error}`);
        checksum += value;
      }
      return checksum;
    },
    dispose: () => store.free(),
  };
}
async function capture(): Promise<void> {
  const meta = protocolCaptureMeta();
  const engines: EngineCapture[] = [];
  for (const engine of ENGINE_IDS) {
    const output = new URL(`../results/formula-${engine}-results.json`, import.meta.url).pathname;
    const child = Bun.spawnSync(["bun", "run", "src/formula-bench.ts", "--output", output], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, SHEETWRITE_BENCH_ENGINE: engine },
      stdout: "pipe",
      stderr: "inherit",
    });
    if (child.exitCode !== 0) throw new Error(`${engine} shared capture failed`);
    const shared = JSON.parse(readFileSync(output, "utf8")) as CompleteFormulaBenchmarkResult;
    const bytes = readFileSync(
      new URL(
        `../../packages/${engine === "full" ? "formulas" : "wasm"}/pkg/sheetwrite_wasm_bg.wasm`,
        import.meta.url,
      ),
    );
    const samplesMs: number[] = [];
    for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
      const initialized = Bun.spawnSync(
        ["node", new URL("./node-engine-init.mjs", import.meta.url).pathname, engine],
        { stdout: "pipe", stderr: "inherit" },
      );
      if (initialized.exitCode !== 0) throw new Error(`${engine} Node initialization failed`);
      samplesMs.push(Number(initialized.stdout.toString()));
    }
    engines.push({
      engine,
      shared,
      wasm: {
        rawBytes: bytes.length,
        brotliBytes: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
          .length,
        sha256: hash(bytes),
      },
      initialization: { samplesMs, stat: summarize(samplesMs) },
    });
  }
  await initSheetwrite(undefined, formulas);
  const analysis = ANALYSIS_CASES.map((scenario) =>
    collectFixture(
      scenario.id,
      ANALYSIS_COUNT,
      () => analysisFixture(scenario.formula),
      SAMPLE_COUNT,
      scenario.expected * ANALYSIS_COUNT,
    ),
  );
  const sourceFiles = Object.fromEntries(
    SOURCE_PATHS.map((path) => [
      path,
      hash(readFileSync(new URL(`../../${path}`, import.meta.url))),
    ]),
  );
  const result: FullEngineResult = {
    schemaVersion: 1,
    meta,
    sourceFiles,
    sourceDigest: sourceDigest({ meta, sourceFiles }),
    initializationMethod: INIT_METHOD,
    engines,
    analysis,
  };
  validateFullEngineResult(result);
  await Bun.write(
    new URL("../results/full-engine-results.json", import.meta.url),
    `${JSON.stringify(result, null, 2)}\n`,
  );
}
if (import.meta.main) await capture();
