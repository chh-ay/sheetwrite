/**
 * Replay formula gate traces against a built WASM engine, the counterpart of
 * the native `bench/native` replay, so both run exactly the same calls.
 *
 *   bun bench/src/formula-trace-replay.ts --engine-root <checkout> [--full]
 *     [--min-ms <ms>] [--filter <text>]... <trace>...
 *
 * Runs under Bun and Node (`node --cpu-prof bench/src/formula-trace-replay.ts`).
 * Each timed run calls a function named `timed_run`, so a CPU profile can keep
 * only the samples inside timed runs. Output matches the native replay: key,
 * timed runs, mean ns per run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

interface TraceCall {
  store: number;
  method: string;
  args: unknown[];
  expected?: { kind: number; num: number; text: string | undefined };
}

type TraceOperation = "new" | TraceCall;

interface TraceWorkload {
  key: string;
  restores: boolean;
  setup: TraceOperation[];
  run: TraceOperation[];
  check: TraceOperation[];
  restore: TraceOperation[];
}

interface CellOut {
  kind: number;
  num: number;
  string: string | undefined;
  free(): void;
}

type Store = Record<string, (...args: unknown[]) => unknown>;

function unescapeText(text: string): string {
  return text.replace(/\\(.)/gu, (_, character: string) =>
    character === "t" ? "\t" : character === "n" ? "\n" : character,
  );
}

function decodeArgument(field: string): unknown {
  const tag = field.slice(0, 2);
  const value = field.slice(2);
  if (tag === "n:") return Number(value);
  if (tag === "s:") return unescapeText(value);
  if (tag === "b:") return value === "1";
  if (tag === "f:") {
    return Float64Array.from(value === "" ? [] : value.split(","), Number);
  }
  throw new Error(`unknown trace argument ${field}`);
}

function parseTrace(text: string): TraceWorkload {
  const workload: TraceWorkload = {
    key: "",
    restores: false,
    setup: [],
    run: [],
    check: [],
    restore: [],
  };
  let phase: TraceOperation[] = workload.setup;
  for (const line of text.split("\n")) {
    if (line === "") continue;
    const fields = line.split("\t");
    switch (fields[0]) {
      case "W":
        workload.key = `workload=${fields[1]};size=${fields[2]}`;
        workload.restores = fields[3] === "1";
        break;
      case "P": {
        const name = fields[1] as "setup" | "run" | "check" | "restore";
        phase = workload[name];
        break;
      }
      case "N":
        phase.push("new");
        break;
      case "C":
        phase.push({
          store: Number(fields[1]),
          method: fields[2] ?? "",
          args: fields.slice(3).map(decodeArgument),
        });
        break;
      case "=": {
        const call = phase.at(-1);
        if (call === undefined || call === "new") throw new Error("getCell result without a call");
        call.expected = {
          kind: Number(fields[1]),
          num: Number(fields[2] ?? ""),
          text: fields[3] === "~" ? undefined : unescapeText(fields[3] ?? ""),
        };
        break;
      }
      default:
        throw new Error(`unknown trace record ${line.slice(0, 40)}`);
    }
  }
  return workload;
}

// Only built-in modules: Node runs this file directly, without the `.js` to
// `.ts` resolution Bun gives the other bench scripts.
const { values: options, positionals: traces } = parseArgs({
  allowPositionals: true,
  options: {
    "engine-root": { type: "string" },
    full: { type: "boolean", default: false },
    "min-ms": { type: "string", default: "300" },
    filter: { type: "string", multiple: true, default: [] },
  },
});
const engineRoot = options["engine-root"];
if (engineRoot === undefined)
  throw new Error("--engine-root <checkout with built engines> is required");
const enginePackage = options.full ? "formulas" : "wasm";
const minimumMs = Number(options["min-ms"]);
const filters = options.filter;

// The engine checkout is chosen at run time, so its loader can only be imported dynamically.
const engine = (await import(
  pathToFileURL(resolve(engineRoot, `packages/${enginePackage}/loader-node.mjs`)).href
)) as { load(): Promise<void>; CellStore: new () => Store };
await engine.load();

function execute(
  stores: (Store | undefined)[],
  operations: TraceOperation[],
  verify: boolean,
): void {
  for (const operation of operations) {
    if (operation === "new") {
      stores.push(new engine.CellStore());
      continue;
    }
    const store = stores[operation.store];
    if (store === undefined) throw new Error(`store ${operation.store} is not live`);
    const method = store[operation.method];
    if (typeof method !== "function") throw new Error(`CellStore.${operation.method} is missing`);
    const result = method.apply(store, operation.args);
    if (operation.method === "free") {
      stores[operation.store] = undefined;
    } else if (operation.method === "getCell") {
      const cell = result as CellOut;
      const expected = operation.expected;
      if (
        verify &&
        expected !== undefined &&
        !(
          cell.kind === expected.kind &&
          (cell.num === expected.num || (Number.isNaN(cell.num) && Number.isNaN(expected.num))) &&
          cell.string === expected.text
        )
      ) {
        throw new Error(`getCell(${operation.args.join(", ")}) differs from the recorded result`);
      }
      cell.free();
    }
  }
}

function freeAll(stores: (Store | undefined)[]): void {
  for (const store of stores) store?.free?.();
  stores.length = 0;
}

/** The profiler keeps samples under this frame only. */
function timed_run(stores: (Store | undefined)[], workload: TraceWorkload): void {
  execute(stores, workload.run, false);
}

process.stdout.write("key\truns\tns_per_run\n");
for (const path of traces) {
  if (filters.length > 0 && !filters.some((filter) => path.includes(filter))) continue;
  const workload = parseTrace(readFileSync(path, "utf8"));
  const stores: (Store | undefined)[] = [];
  const prepare = (first: boolean) => {
    if (workload.restores && !first) {
      execute(stores, workload.restore, false);
      return;
    }
    freeAll(stores);
    execute(stores, workload.setup, false);
  };

  let first = true;
  for (let warmup = 0; warmup < 3; warmup++) {
    prepare(first);
    first = false;
    execute(stores, workload.run, false);
    execute(stores, workload.check, warmup === 0);
  }

  let totalMs = 0;
  let runs = 0;
  while (totalMs < minimumMs) {
    prepare(first);
    first = false;
    const started = performance.now();
    timed_run(stores, workload);
    totalMs += performance.now() - started;
    runs += 1;
  }
  execute(stores, workload.check, true);
  freeAll(stores);
  process.stdout.write(`${workload.key}\t${runs}\t${((totalMs * 1e6) / runs).toFixed(0)}\n`);
}
