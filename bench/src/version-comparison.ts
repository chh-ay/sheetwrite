/**
 * Compare published Sheetwrite releases on one machine with one workload.
 *
 * Every version is an npm install in its own folder (`@sheetwrite/core`,
 * `wasm`, `formulas`, `xlsx`). The workloads below use only API that 0.5.4,
 * 0.6.1 and 0.7.0 all ship; the one per-version difference is the setup call
 * (`initSheetwrite(undefined, engine)` plus `registerXlsxBackends()` before
 * 0.7.0, `initSheetwrite({ engine, addons: [xlsxAddon()] })` from 0.7.0).
 *
 * The script has no imports from this repository, so it runs from any folder:
 *
 *   bun version-comparison.ts run --machine linux --rounds 6 \
 *     --version 0.5.4=<dir> --version 0.6.1=<dir> --version 0.7.0=<dir> \
 *     --output linux.json
 *   bun version-comparison.ts report --input linux.json --input mac.json \
 *     --output version-comparison.md
 *
 * `run` interleaves versions (ABC in even rounds, CBA in odd rounds) and
 * engines, one fresh process per version, engine and part, and keeps every
 * sample. Tables report medians across rounds.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

const ENGINES = ["default", "full"] as const;
type EngineName = (typeof ENGINES)[number];
const ENGINE_PACKAGE: Record<EngineName, string> = { default: "wasm", full: "formulas" };

const SHEET = "s1";
/** Release limit on operations per transaction in 0.5.4; fixtures load in chunks this size. */
const PATCHES_PER_TRANSACTION = 10_000;
/** Each timed recalculation sample repeats the edit until it has run this long. */
const MIN_SAMPLE_MS = 50;
const MIN_EDITS_PER_SAMPLE = 3;
const WARMUP_EDITS = 3;
const RECALC_SAMPLES_PER_PROCESS = 3;
const XLSX_SAMPLES_PER_PROCESS = 3;
const XLSX_ROWS = 50_000;
const MEMORY_FORMULAS = 100_000;
const GC_TURNS = 5;
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = 1024 * 1024;
const BROTLI_QUALITY = 11;
const DEFAULT_ROUNDS = 6;

// ---------------------------------------------------------------------------
// Package loading: the only per-version difference is the setup call.

interface CellAddress {
  sheet: string;
  row: number;
  col: number;
}
interface SetPatch {
  op: "set";
  addr: CellAddress;
  value: { kind: "formula"; src: string } | { kind: "literal"; value: number };
}
interface ColumnShape {
  key: string;
  header: string;
  type: "number" | "text";
  width: number;
}
interface WorkbookShape {
  activeSheet: string;
  sheets: { id: string; name: string; rowCount: number; columns: ColumnShape[] }[];
}
interface ColumnarShape {
  rowCount: number;
  columns: Record<string, Float64Array | string[]>;
}
interface StoreShape {
  applyTransaction(transaction: { patches: SetPatch[] }): { status: string };
  getCell(address: CellAddress): { resolved: unknown };
  exportSnapshot(): unknown;
  dispose(): void;
}
interface StoreClass {
  new (workbook: WorkbookShape, data?: ColumnarShape): StoreShape;
  fromSnapshot(input: unknown): StoreShape;
}
interface CoreModule {
  initSheetwrite(...args: unknown[]): Promise<void>;
  SheetwriteStore: StoreClass;
  toXlsxWorkbook(snapshot: unknown): Promise<Uint8Array>;
  fromXlsxWorkbook(bytes: Uint8Array): Promise<unknown>;
}
interface XlsxModule {
  registerXlsxBackends?: () => void;
  xlsxAddon?: () => unknown;
}

interface LoadedVersion {
  core: CoreModule;
  setupCall: string;
  packageVersions: Record<string, string>;
  engineWasmSha256: string;
}

function packageRoot(dir: string, name: string): string {
  const root = join(dir, "node_modules", "@sheetwrite", name);
  if (!existsSync(join(root, "package.json"))) throw new Error(`${dir} has no @sheetwrite/${name}`);
  return root;
}

function packageVersion(dir: string, name: string): string {
  const manifest: unknown = JSON.parse(
    readFileSync(join(packageRoot(dir, name), "package.json"), "utf8"),
  );
  if (typeof manifest !== "object" || manifest === null || !("version" in manifest)) {
    throw new Error(`@sheetwrite/${name} in ${dir} has no version`);
  }
  return String(manifest.version);
}

async function importFrom(dir: string, specifier: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(Bun.resolveSync(specifier, dir)).href);
}

function requireFunctions(
  module: Record<string, unknown>,
  names: readonly string[],
  label: string,
) {
  for (const name of names) {
    if (typeof module[name] !== "function") throw new Error(`${label} does not export ${name}`);
  }
}

async function loadVersion(dir: string, engine: EngineName): Promise<LoadedVersion> {
  const coreExports = await importFrom(dir, "@sheetwrite/core");
  requireFunctions(
    coreExports,
    ["initSheetwrite", "SheetwriteStore", "toXlsxWorkbook", "fromXlsxWorkbook"],
    "@sheetwrite/core",
  );
  const core = coreExports as unknown as CoreModule;
  const xlsx = (await importFrom(dir, "@sheetwrite/xlsx")) as XlsxModule;
  const engineModule = await importFrom(dir, `@sheetwrite/${ENGINE_PACKAGE[engine]}`);

  let setupCall: string;
  if (typeof xlsx.xlsxAddon === "function") {
    await core.initSheetwrite({ engine: engineModule, addons: [xlsx.xlsxAddon()] });
    setupCall = "initSheetwrite({ engine, addons: [xlsxAddon()] })";
  } else if (typeof xlsx.registerXlsxBackends === "function") {
    await core.initSheetwrite(undefined, engineModule);
    xlsx.registerXlsxBackends();
    setupCall = "initSheetwrite(undefined, engine); registerXlsxBackends()";
  } else {
    throw new Error(`@sheetwrite/xlsx in ${dir} has neither xlsxAddon nor registerXlsxBackends`);
  }

  const wasmPath = join(packageRoot(dir, ENGINE_PACKAGE[engine]), "pkg", "sheetwrite_wasm_bg.wasm");
  return {
    core,
    setupCall,
    packageVersions: Object.fromEntries(
      ["core", "wasm", "formulas", "xlsx"].map((name) => [name, packageVersion(dir, name)]),
    ),
    engineWasmSha256: sha256(readFileSync(wasmPath)),
  };
}

/** The full engine computes SUMSQ; the default engine does not have it. */
function assertEngine(core: CoreModule, engine: EngineName): void {
  const store = new core.SheetwriteStore(workbook(1, 2), { rowCount: 1, columns: {} });
  try {
    applyAll(store, [formulaPatch(0, 0, "=SUMSQ(3)")]);
    const hasFullFunctions = store.getCell(address(0, 0)).resolved === 9;
    if (hasFullFunctions !== (engine === "full")) {
      throw new Error(
        `Loaded engine does not match ${engine}: SUMSQ(3) gave ${String(store.getCell(address(0, 0)).resolved)}`,
      );
    }
  } finally {
    store.dispose();
  }
}

// ---------------------------------------------------------------------------
// Fixtures.

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const address = (row: number, col: number): CellAddress => ({ sheet: SHEET, row, col });
const columnKey = (col: number): string => `c${col}`;

function workbook(rows: number, columnCount: number): WorkbookShape {
  return {
    activeSheet: SHEET,
    sheets: [
      {
        id: SHEET,
        name: "Data",
        rowCount: rows,
        columns: Array.from({ length: columnCount }, (_, col) => ({
          key: columnKey(col),
          header: String.fromCharCode(65 + col),
          type: "number",
          width: 80,
        })),
      },
    ],
  };
}

/** Column A holds row + 1; the other columns start empty. */
function numberData(rows: number, columnCount: number): ColumnarShape {
  const columns: Record<string, Float64Array> = {};
  for (let col = 0; col < columnCount; col++) columns[columnKey(col)] = new Float64Array(rows);
  const first = columns[columnKey(0)];
  if (first === undefined) throw new Error("Fixture needs at least one column");
  for (let row = 0; row < rows; row++) first[row] = row + 1;
  return { rowCount: rows, columns };
}

function formulaPatch(row: number, col: number, src: string): SetPatch {
  return { op: "set", addr: address(row, col), value: { kind: "formula", src } };
}

function applyAll(store: StoreShape, patches: readonly SetPatch[]): void {
  for (let start = 0; start < patches.length; start += PATCHES_PER_TRANSACTION) {
    const result = store.applyTransaction({
      patches: patches.slice(start, start + PATCHES_PER_TRANSACTION),
    });
    if (result.status !== "applied") throw new Error(`Fixture transaction was ${result.status}`);
  }
}

interface RecalcRow {
  id: string;
  description: string;
  rows: number;
  columns: number;
  formulas(): SetPatch[];
  /** The cell to read after the edit of A1 to `value`, and the value it must hold. */
  expected(value: number): { address: CellAddress; value: number };
}

const sumOfRowsTwoTo = (last: number): number => (last * (last + 1)) / 2 - 1;

/** Rows from the formula benchmark's topologies; every timed edit writes A1. */
const RECALC_ROWS: readonly RecalcRow[] = [
  {
    id: "fan-out-100k",
    description: "100,000 formulas =$A$1+n; the edit recalculates all of them",
    rows: 100_000,
    columns: 2,
    formulas: () =>
      Array.from({ length: 100_000 }, (_, row) => formulaPatch(row, 1, `=$A$1+${row + 1}`)),
    expected: (value) => ({ address: address(99_999, 1), value: value + 100_000 }),
  },
  {
    id: "chain-64",
    description:
      "a 64-cell chain =A(n-1)+1 down column A (the benchmark's deepest linear-chain row)",
    rows: 64,
    columns: 1,
    formulas: () =>
      Array.from({ length: 63 }, (_, index) => formulaPatch(index + 1, 0, `=A${index + 1}+1`)),
    expected: (value) => ({ address: address(63, 0), value: value + 63 }),
  },
  {
    id: "diamond-32",
    description:
      "32 levels of B/C branches joined in D (96 formulas, the benchmark's diamond-edit row)",
    rows: 32,
    columns: 4,
    formulas: () =>
      Array.from({ length: 32 }, (_, row) => {
        const source = row === 0 ? "$A$1" : `$D$${row}`;
        return [
          formulaPatch(row, 1, `=${source}+1`),
          formulaPatch(row, 2, `=${source}+2`),
          formulaPatch(row, 3, `=B${row + 1}+C${row + 1}`),
        ];
      }).flat(),
    // D(k) = 2 D(k-1) + 3 with D(1) = 2 A1 + 3, so D(32) = (A1 + 3) 2^32 - 3.
    expected: (value) => ({ address: address(31, 3), value: (value + 3) * 2 ** 32 - 3 }),
  },
  {
    id: "shared-range-10k",
    description: "10,000 formulas =SUM($A$1:$A$100)",
    rows: 10_000,
    columns: 2,
    formulas: () =>
      Array.from({ length: 10_000 }, (_, row) => formulaPatch(row, 1, "=SUM($A$1:$A$100)")),
    expected: (value) => ({ address: address(9_999, 1), value: value + sumOfRowsTwoTo(100) }),
  },
  {
    id: "distinct-range-10k",
    description: "10,000 formulas over distinct ten-row ranges; the edit reaches one",
    rows: 100_000,
    columns: 2,
    formulas: () =>
      Array.from({ length: 10_000 }, (_, row) => {
        const start = row * 10 + 1;
        return formulaPatch(row, 1, `=SUM(A${start}:A${start + 9})`);
      }),
    expected: (value) => ({ address: address(0, 1), value: value + sumOfRowsTwoTo(10) }),
  },
  {
    id: "closure-100k",
    description: "100,000 independent B/C pairs (200,000 formulas); the edit reaches one pair",
    rows: 100_000,
    columns: 3,
    formulas: () =>
      Array.from({ length: 100_000 }, (_, row) => [
        formulaPatch(row, 1, `=A${row + 1}+1`),
        formulaPatch(row, 2, `=B${row + 1}+1`),
      ]).flat(),
    expected: (value) => ({ address: address(0, 2), value: value + 2 }),
  },
  {
    id: "sum-100k",
    description: "one =SUM(A1:A100000)",
    rows: 100_000,
    columns: 2,
    formulas: () => [formulaPatch(0, 1, "=SUM(A1:A100000)")],
    expected: (value) => ({ address: address(0, 1), value: value + sumOfRowsTwoTo(100_000) }),
  },
];

function xlsxWorkbook(): { workbook: WorkbookShape; data: ColumnarShape; formulas: SetPatch[] } {
  const ids = new Float64Array(XLSX_ROWS);
  const amounts = new Float64Array(XLSX_ROWS);
  const names: string[] = new Array(XLSX_ROWS);
  const regions: string[] = new Array(XLSX_ROWS);
  const regionNames = ["North", "South", "East", "West"];
  const formulas: SetPatch[] = [];
  for (let row = 0; row < XLSX_ROWS; row++) {
    ids[row] = row + 1;
    amounts[row] = xlsxAmount(row);
    names[row] = `Customer ${row % 997}`;
    regions[row] = regionNames[row % regionNames.length] ?? "North";
    formulas.push(
      formulaPatch(row, 4, `=C${row + 1}*2`),
      formulaPatch(row, 5, `=IF(C${row + 1}>500,"high","low")`),
    );
  }
  const columns: ColumnShape[] = [
    { key: "id", header: "Id", type: "number", width: 80 },
    { key: "name", header: "Name", type: "text", width: 120 },
    { key: "amount", header: "Amount", type: "number", width: 80 },
    { key: "region", header: "Region", type: "text", width: 80 },
    { key: "total", header: "Total", type: "number", width: 80 },
    { key: "band", header: "Band", type: "text", width: 80 },
  ];
  return {
    workbook: {
      activeSheet: SHEET,
      sheets: [{ id: SHEET, name: "Data", rowCount: XLSX_ROWS, columns }],
    },
    data: {
      rowCount: XLSX_ROWS,
      columns: { id: ids, name: names, amount: amounts, region: regions },
    },
    formulas,
  };
}

/** Deterministic amounts in [0.25, 999.25]; about half are above 500. */
function xlsxAmount(row: number): number {
  return ((row * 37) % 1000) + 0.25;
}

const XLSX_CHECK_ROW = 1;

// ---------------------------------------------------------------------------
// Child parts: each runs in a fresh process.

async function collectGarbage(): Promise<void> {
  for (let turn = 0; turn < GC_TURNS; turn++) {
    await new Promise<void>((done) => setImmediate(done));
    Bun.gc(true);
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Number.NaN)
    : ((sorted[middle - 1] ?? Number.NaN) + (sorted[middle] ?? Number.NaN)) / 2;
}

function geomean(values: readonly number[]): number {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function assertValue(
  store: StoreShape,
  expected: { address: CellAddress; value: number },
  label: string,
) {
  const resolved = store.getCell(expected.address).resolved;
  if (resolved !== expected.value) {
    throw new Error(`${label}: expected ${expected.value}, got ${String(resolved)}`);
  }
}

function measureRecalcRow(core: CoreModule, row: RecalcRow): number[] {
  const store = new core.SheetwriteStore(
    workbook(row.rows, row.columns),
    numberData(row.rows, row.columns),
  );
  try {
    applyAll(store, row.formulas());
    let nextValue = 1_000;
    const edit = (): void => {
      nextValue += 1;
      const result = store.applyTransaction({
        patches: [{ op: "set", addr: address(0, 0), value: { kind: "literal", value: nextValue } }],
      });
      if (result.status !== "applied") throw new Error(`${row.id} edit was ${result.status}`);
    };
    for (let warmup = 0; warmup < WARMUP_EDITS; warmup++) edit();
    assertValue(store, row.expected(nextValue), row.id);

    const perEditMs: number[] = [];
    for (let sample = 0; sample < RECALC_SAMPLES_PER_PROCESS; sample++) {
      let edits = 0;
      const started = performance.now();
      let elapsed = 0;
      while (edits < MIN_EDITS_PER_SAMPLE || elapsed < MIN_SAMPLE_MS) {
        edit();
        edits += 1;
        elapsed = performance.now() - started;
      }
      perEditMs.push(elapsed / edits);
      assertValue(store, row.expected(nextValue), row.id);
    }
    return perEditMs;
  } finally {
    store.dispose();
  }
}

async function measureXlsx(core: CoreModule, importFile: string) {
  const fixture = xlsxWorkbook();
  const store = new core.SheetwriteStore(fixture.workbook, fixture.data);
  const exportMs: number[] = [];
  try {
    applyAll(store, fixture.formulas);
    for (let sample = -1; sample < XLSX_SAMPLES_PER_PROCESS; sample++) {
      const started = performance.now();
      const bytes = await core.toXlsxWorkbook(store.exportSnapshot());
      const elapsed = performance.now() - started;
      if (bytes.byteLength === 0) throw new Error("Export wrote no bytes");
      if (sample >= 0) exportMs.push(elapsed);
    }
  } finally {
    store.dispose();
  }

  const input = new Uint8Array(readFileSync(importFile));
  const expectedTotal = {
    address: address(XLSX_CHECK_ROW, 4),
    value: xlsxAmount(XLSX_CHECK_ROW) * 2,
  };
  const importMs: number[] = [];
  for (let sample = -1; sample < XLSX_SAMPLES_PER_PROCESS; sample++) {
    const started = performance.now();
    const snapshot = await core.fromXlsxWorkbook(input.slice());
    const imported = core.SheetwriteStore.fromSnapshot(snapshot);
    const elapsed = performance.now() - started;
    try {
      assertValue(imported, expectedTotal, "xlsx import");
    } finally {
      imported.dispose();
    }
    if (sample >= 0) importMs.push(elapsed);
  }
  return { exportMs, importMs };
}

/** Process RSS in bytes; `maxRSS` is reported in KiB on both Linux and macOS. */
function rssBytes(): { rss: number; maxRss: number } {
  return { rss: process.memoryUsage().rss, maxRss: process.resourceUsage().maxRSS * BYTES_PER_KIB };
}

/**
 * Samples process RSS every millisecond on its own thread, so it sees peaks
 * inside the synchronous engine calls. Linux updates the kernel's max RSS
 * lazily and can miss memory that is returned before the call ends.
 */
const RSS_SAMPLER_SOURCE = `
let peak = 0;
let isSampling = true;
const sample = () => {
  const rss = process.memoryUsage.rss();
  if (rss > peak) peak = rss;
  if (isSampling) setTimeout(sample, 1);
};
self.onmessage = (event) => {
  if (event.data === "reset") {
    peak = 0;
    postMessage("reset");
    return;
  }
  isSampling = false;
  postMessage(peak);
};
sample();
postMessage("ready");
`;

interface RssSampler {
  reset(): Promise<void>;
  /** The highest RSS seen since the last reset. */
  stop(): Promise<number>;
  /** Ends the thread; safe after stop() and on failure paths. */
  terminate(): void;
}

async function startRssSampler(): Promise<RssSampler> {
  const worker = new Worker(URL.createObjectURL(new Blob([RSS_SAMPLER_SOURCE])));
  const nextMessage = () =>
    new Promise<unknown>((done, fail) => {
      worker.addEventListener("message", (event) => done(event.data), { once: true });
      worker.addEventListener(
        "error",
        (event) => fail(new Error(`RSS sampler failed: ${event.message}`)),
        {
          once: true,
        },
      );
    });
  if ((await nextMessage()) !== "ready") throw new Error("RSS sampler did not start");
  return {
    async reset() {
      const reply = nextMessage();
      worker.postMessage("reset");
      if ((await reply) !== "reset") throw new Error("RSS sampler did not reset");
    },
    async stop() {
      const reply = nextMessage();
      worker.postMessage("stop");
      const peak = await reply;
      if (typeof peak !== "number") throw new Error("RSS sampler returned no peak");
      return peak;
    },
    terminate() {
      worker.terminate();
    },
  };
}

async function measureMemory(core: CoreModule) {
  const columns = 2;
  const store = new core.SheetwriteStore(
    workbook(MEMORY_FORMULAS, columns),
    numberData(MEMORY_FORMULAS, columns),
  );
  const sampler = await startRssSampler();
  try {
    const formulas = Array.from({ length: MEMORY_FORMULAS }, (_, row) =>
      formulaPatch(row, 1, `=A${row + 1}+1`),
    );
    await collectGarbage();
    const before = rssBytes();
    await sampler.reset();
    applyAll(store, formulas);
    assertValue(
      store,
      { address: address(MEMORY_FORMULAS - 1, 1), value: MEMORY_FORMULAS + 1 },
      "memory fixture",
    );
    await collectGarbage();
    const after = rssBytes();
    const sampledPeak = await sampler.stop();
    // The kernel max counts only when the load raised it; an earlier, higher
    // peak of the same process says nothing about this load.
    const buildSetNewPeak = after.maxRss > before.maxRss;
    return {
      rssBeforeBytes: before.rss,
      rssAfterBytes: after.rss,
      maxRssBeforeBytes: before.maxRss,
      maxRssBytes: after.maxRss,
      sampledPeakRssBytes: sampledPeak,
      buildSetNewPeak,
      retainedBytes: after.rss - before.rss,
      peakBytes: Math.max(sampledPeak, buildSetNewPeak ? after.maxRss : 0, after.rss) - before.rss,
    };
  } finally {
    sampler.terminate();
    store.dispose();
  }
}

type ChildPart = "timing" | "memory" | "prepare-import";

async function child(dir: string, engine: EngineName, part: ChildPart, importFile: string) {
  const loaded = await loadVersion(dir, engine);
  assertEngine(loaded.core, engine);
  const identity = {
    packageVersions: loaded.packageVersions,
    setupCall: loaded.setupCall,
    engineWasmSha256: loaded.engineWasmSha256,
  };
  switch (part) {
    case "timing": {
      const recalcMs: Record<string, number[]> = {};
      for (const row of RECALC_ROWS) recalcMs[row.id] = measureRecalcRow(loaded.core, row);
      return { ...identity, recalcMs, ...(await measureXlsx(loaded.core, importFile)) };
    }
    case "memory":
      return { ...identity, memory: await measureMemory(loaded.core) };
    case "prepare-import": {
      const fixture = xlsxWorkbook();
      const store = new loaded.core.SheetwriteStore(fixture.workbook, fixture.data);
      try {
        applyAll(store, fixture.formulas);
        const bytes = await loaded.core.toXlsxWorkbook(store.exportSnapshot());
        writeFileSync(importFile, bytes);
        return { ...identity, importFileSha256: sha256(bytes), importFileBytes: bytes.byteLength };
      } finally {
        store.dispose();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Download sizes: the engine's .wasm and the JS a browser loads for it.

const RELATIVE_IMPORT = /(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g;

function browserEntry(root: string): string {
  const manifest: { exports?: { ".": { browser?: string } } } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const entry = manifest.exports?.["."]?.browser;
  if (entry === undefined) throw new Error(`${root} has no browser entry`);
  return resolve(root, entry);
}

/** The browser entry and every file it reaches through relative imports. */
function jsClosure(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(RELATIVE_IMPORT)) {
      const target = match[1];
      if (target !== undefined && !target.endsWith(".wasm"))
        pending.push(resolve(dirname(file), target));
    }
  }
  return [...seen].sort();
}

function brotliBytes(bytes: Uint8Array): number {
  return brotliCompressSync(bytes, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
    },
  }).byteLength;
}

function engineSizes(dir: string) {
  return Object.fromEntries(
    ENGINES.map((engine) => {
      const root = packageRoot(dir, ENGINE_PACKAGE[engine]);
      const wasm = readFileSync(join(root, "pkg", "sheetwrite_wasm_bg.wasm"));
      const jsFiles = jsClosure(browserEntry(root)).map((file) => ({
        file: file.slice(root.length + 1),
        bytes: readFileSync(file),
      }));
      const js = {
        files: jsFiles.map(({ file }) => file),
        rawBytes: jsFiles.reduce((sum, { bytes }) => sum + bytes.byteLength, 0),
        brotliBytes: jsFiles.reduce((sum, { bytes }) => sum + brotliBytes(bytes), 0),
      };
      const wasmSizes = {
        rawBytes: wasm.byteLength,
        brotliBytes: brotliBytes(wasm),
        sha256: sha256(wasm),
      };
      return [
        engine,
        { wasm: wasmSizes, js, totalBrotliBytes: wasmSizes.brotliBytes + js.brotliBytes },
      ];
    }),
  );
}

// ---------------------------------------------------------------------------
// Orchestration.

interface VersionInput {
  label: string;
  dir: string;
}

function parseVersion(value: string): VersionInput {
  const separator = value.indexOf("=");
  if (separator <= 0) throw new Error(`--version expects label=dir, got ${value}`);
  return { label: value.slice(0, separator), dir: resolve(value.slice(separator + 1)) };
}

function runChild(
  input: VersionInput,
  engine: EngineName,
  part: ChildPart,
  importFile: string,
): Record<string, unknown> {
  const result = Bun.spawnSync(
    [
      process.execPath,
      import.meta.path,
      "child",
      "--dir",
      input.dir,
      "--engine",
      engine,
      "--part",
      part,
      "--import-file",
      importFile,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `${input.label} ${engine} ${part} failed (${result.exitCode}):\n${result.stderr.toString()}`,
    );
  }
  const lines = result.stdout.toString().trim().split("\n");
  return JSON.parse(lines[lines.length - 1] ?? "");
}

function machineDescription() {
  const cpuList = cpus();
  return {
    platform: platform(),
    release: release(),
    cpuModel: cpuList[0]?.model ?? "unknown",
    logicalCpus: cpuList.length,
    bun: Bun.version,
    affinity: platform() === "linux" ? readAffinity() : null,
  };
}

function readAffinity(): string | null {
  const status = readFileSync("/proc/self/status", "utf8");
  return /Cpus_allowed_list:\s*(\S+)/.exec(status)?.[1] ?? null;
}

interface TimingSample {
  recalcMs: Record<string, number[]>;
  importMs: number[];
  exportMs: number[];
}
interface MemorySample {
  memory: { retainedBytes: number; peakBytes: number };
}

async function run(options: {
  versions: VersionInput[];
  rounds: number;
  machine: string;
  output: string;
  commits: Record<string, string>;
}) {
  const [oldest] = options.versions;
  if (oldest === undefined) throw new Error("Pass at least one --version label=dir");
  const importFile = join(tmpdir(), `sheetwrite-version-comparison-${process.pid}.xlsx`);
  const samples: {
    round: number;
    order: number;
    version: string;
    engine: EngineName;
    part: string;
    result: Record<string, unknown>;
  }[] = [];
  let prepared: Record<string, unknown>;
  try {
    prepared = runChild(oldest, "default", "prepare-import", importFile);
    for (let round = 0; round < options.rounds; round++) {
      const versionOrder = round % 2 === 0 ? options.versions : [...options.versions].reverse();
      const engineOrder = round % 2 === 0 ? ENGINES : [...ENGINES].reverse();
      let order = 0;
      for (const version of versionOrder) {
        for (const engine of engineOrder) {
          for (const part of ["timing", "memory"] as const) {
            process.stderr.write(
              `round ${round + 1}/${options.rounds}: ${version.label} ${engine} ${part}\n`,
            );
            samples.push({
              round,
              order: order++,
              version: version.label,
              engine,
              part,
              result: runChild(version, engine, part, importFile),
            });
          }
        }
      }
    }
  } finally {
    rmSync(importFile, { force: true });
  }

  const summary: Record<string, Record<string, unknown>> = {};
  const aaRatios = {
    recalcGeomean: [] as number[],
    retained: [] as number[],
    peak: [] as number[],
    import: [] as number[],
    export: [] as number[],
  };
  for (const version of options.versions) {
    const versionSummary: Record<string, unknown> = {};
    summary[version.label] = versionSummary;
    for (const engine of ENGINES) {
      const pick = (part: string, parity?: number) =>
        samples.filter(
          (sample) =>
            sample.version === version.label &&
            sample.engine === engine &&
            sample.part === part &&
            (parity === undefined || sample.round % 2 === parity),
        );
      const metrics = (parity?: number) => {
        const timing = pick("timing", parity).map(
          (sample) => sample.result as unknown as TimingSample,
        );
        const memory = pick("memory", parity).map(
          (sample) => sample.result as unknown as MemorySample,
        );
        const rowMedians = Object.fromEntries(
          RECALC_ROWS.map((row) => [
            row.id,
            median(timing.map((sample) => median(sample.recalcMs[row.id] ?? []))),
          ]),
        );
        return {
          recalcRowMedianMs: rowMedians,
          recalcGeomeanMs: geomean(Object.values(rowMedians)),
          retainedMiB: median(memory.map((sample) => sample.memory.retainedBytes)) / BYTES_PER_MIB,
          peakMiB: median(memory.map((sample) => sample.memory.peakBytes)) / BYTES_PER_MIB,
          importMs: median(timing.map((sample) => median(sample.importMs))),
          exportMs: median(timing.map((sample) => median(sample.exportMs))),
        };
      };
      const all = metrics();
      const forward = metrics(0);
      const backward = metrics(1);
      aaRatios.recalcGeomean.push(forward.recalcGeomeanMs / backward.recalcGeomeanMs);
      aaRatios.retained.push(forward.retainedMiB / backward.retainedMiB);
      aaRatios.peak.push(forward.peakMiB / backward.peakMiB);
      aaRatios.import.push(forward.importMs / backward.importMs);
      aaRatios.export.push(forward.exportMs / backward.exportMs);
      versionSummary[engine] = all;
    }
  }
  const aaSpreadPercent = Object.fromEntries(
    Object.entries(aaRatios).map(([metric, ratios]) => [
      metric,
      Math.max(...ratios.map((ratio) => Math.abs(ratio - 1))) * 100,
    ]),
  );

  const artifact = {
    protocol: "sheetwrite-version-comparison-v1",
    machine: options.machine,
    measuredAt: new Date().toISOString(),
    host: machineDescription(),
    rounds: options.rounds,
    order:
      "versions ABC in even rounds and CBA in odd rounds, engines default/full then full/default; one fresh process per version, engine and part",
    commits: options.commits,
    method: {
      recalculation: `each row builds its fixture untimed, runs ${WARMUP_EDITS} warm-up edits of A1, then ${RECALC_SAMPLES_PER_PROCESS} samples that repeat the edit until ${MIN_SAMPLE_MS} ms (at least ${MIN_EDITS_PER_SAMPLE} edits) and record the mean per edit; every sample checks the recalculated value`,
      rows: RECALC_ROWS.map(({ id, description }) => ({ id, description })),
      memory: `process RSS around loading ${MEMORY_FORMULAS.toLocaleString("en-US")} formulas =An+1 into a 100,000-row store (in ${PATCHES_PER_TRANSACTION.toLocaleString("en-US")}-formula transactions), with a forced GC before and after; retained = RSS after minus RSS before; peak = the highest RSS during the load (sampled every millisecond on a worker thread, or the kernel max RSS when the load raised it) minus RSS before`,
      xlsx: `${XLSX_ROWS.toLocaleString("en-US")} rows x 6 columns (2 text, 2 number, 2 formula columns, 100,000 formulas). Export: toXlsxWorkbook(store.exportSnapshot()). Import: fromXlsxWorkbook(bytes) plus SheetwriteStore.fromSnapshot, of one file written by ${oldest.label} for every version. 1 warm-up and ${XLSX_SAMPLES_PER_PROCESS} samples per process, process median`,
      sizes: `raw and Brotli quality ${BROTLI_QUALITY} of the engine's .wasm and of the browser entry's JS import closure`,
      aaSpread:
        "largest |1 - median(ABC rounds) / median(CBA rounds)| over versions and engines, per metric",
    },
    importFile: { writtenBy: oldest.label, ...prepared },
    versions: Object.fromEntries(
      options.versions.map((version) => {
        const first = samples.find((sample) => sample.version === version.label)?.result ?? {};
        return [
          version.label,
          {
            packageVersions: first.packageVersions,
            setupCall: first.setupCall,
            sizes: engineSizes(version.dir),
          },
        ];
      }),
    ),
    summary,
    aaSpreadPercent,
    samples,
  };
  writeFileSync(options.output, `${JSON.stringify(artifact, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Report: one Markdown table from the machine artifacts.

interface MachineArtifact {
  machine: string;
  measuredAt: string;
  host: { cpuModel: string; logicalCpus: number; bun: string; platform: string };
  rounds: number;
  commits: Record<string, string>;
  aaSpreadPercent: Record<string, number>;
  versions: Record<
    string,
    {
      sizes: Record<
        EngineName,
        {
          totalBrotliBytes: number;
          wasm: { rawBytes: number; brotliBytes: number };
          js: { rawBytes: number; brotliBytes: number };
        }
      >;
    }
  >;
  summary: Record<
    string,
    Record<
      EngineName,
      {
        recalcGeomeanMs: number;
        retainedMiB: number;
        peakMiB: number;
        importMs: number;
        exportMs: number;
      }
    >
  >;
}

const formatNumber = (value: number, digits: number): string =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function report(inputs: string[], output: string) {
  const artifacts: MachineArtifact[] = inputs.map((file) => JSON.parse(readFileSync(file, "utf8")));
  const labels = Object.keys(artifacts[0]?.summary ?? {});
  const header = artifacts.flatMap((artifact) =>
    labels.map((label) => `${artifact.machine} ${label}`),
  );
  const measures: {
    name: string;
    cell(artifact: MachineArtifact, label: string, engine: EngineName): string;
  }[] = [
    {
      name: "Formula recalculation, geomean time of the shared benchmark rows",
      cell: (a, l, e) => `${formatNumber(a.summary[l]?.[e].recalcGeomeanMs ?? Number.NaN, 3)} ms`,
    },
    {
      name: "Retained memory, 100k formulas",
      cell: (a, l, e) => `${formatNumber(a.summary[l]?.[e].retainedMiB ?? Number.NaN, 1)} MiB`,
    },
    {
      name: "Peak memory, 100k formulas",
      cell: (a, l, e) => `${formatNumber(a.summary[l]?.[e].peakMiB ?? Number.NaN, 1)} MiB`,
    },
    {
      name: "Engine download, Brotli",
      cell: (a, l, e) =>
        `${formatNumber((a.versions[l]?.sizes[e].totalBrotliBytes ?? Number.NaN) / BYTES_PER_KIB, 0)} KiB`,
    },
    {
      name: "XLSX import",
      cell: (a, l, e) => `${formatNumber(a.summary[l]?.[e].importMs ?? Number.NaN, 0)} ms`,
    },
    {
      name: "XLSX export",
      cell: (a, l, e) => `${formatNumber(a.summary[l]?.[e].exportMs ?? Number.NaN, 0)} ms`,
    },
  ];
  const lines = [
    `| Measure | Engine | ${header.join(" | ")} |`,
    `| --- | --- | ${header.map(() => "---:").join(" | ")} |`,
  ];
  for (const measure of measures) {
    for (const engine of ENGINES) {
      const cells = artifacts.flatMap((artifact) =>
        labels.map((label) => measure.cell(artifact, label, engine)),
      );
      lines.push(`| ${measure.name} | ${engine} | ${cells.join(" | ")} |`);
    }
  }
  const machines = artifacts.map(
    (artifact) =>
      `- ${artifact.machine}: ${artifact.host.cpuModel}, ${artifact.host.logicalCpus} logical CPUs, ${artifact.host.platform}, Bun ${artifact.host.bun}; ${artifact.rounds} rounds, measured ${artifact.measuredAt}; commits ${JSON.stringify(artifact.commits)}; A/A spread (%) ${JSON.stringify(Object.fromEntries(Object.entries(artifact.aaSpreadPercent).map(([metric, value]) => [metric, Number(value.toFixed(1))])))}`,
  );
  writeFileSync(output, `${lines.join("\n")}\n\n${machines.join("\n")}\n`);
}

// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: "string" },
    engine: { type: "string" },
    part: { type: "string" },
    "import-file": { type: "string" },
    version: { type: "string", multiple: true },
    commit: { type: "string", multiple: true },
    rounds: { type: "string" },
    machine: { type: "string" },
    output: { type: "string" },
    input: { type: "string", multiple: true },
  },
});

function required(name: keyof typeof values): string {
  const value = values[name];
  if (typeof value !== "string") throw new Error(`--${name} is required`);
  return value;
}

const command = positionals[0];
if (command === "child") {
  const engine = required("engine");
  const part = required("part");
  if (engine !== "default" && engine !== "full") throw new Error("--engine is default or full");
  if (part !== "timing" && part !== "memory" && part !== "prepare-import") {
    throw new Error("--part is timing, memory or prepare-import");
  }
  const result = await child(resolve(required("dir")), engine, part, required("import-file"));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "run") {
  await run({
    versions: (values.version ?? []).map(parseVersion),
    rounds: values.rounds === undefined ? DEFAULT_ROUNDS : Number(values.rounds),
    machine: required("machine"),
    output: resolve(required("output")),
    commits: Object.fromEntries(
      (values.commit ?? []).map((entry) => entry.split("=", 2) as [string, string]),
    ),
  });
} else if (command === "sizes") {
  process.stdout.write(`${JSON.stringify(engineSizes(resolve(required("dir"))), null, 2)}\n`);
} else if (command === "report") {
  report(values.input ?? [], resolve(required("output")));
} else {
  throw new Error("Usage: version-comparison.ts run|report|sizes|child …");
}
