import { readFileSync, writeFileSync } from "node:fs";

type Phase = "parse" | "dependency" | "dirty" | "evaluation" | "range" | "writes" | "other";
interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url?: string };
  children?: number[];
}
interface CpuProfile { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }
interface Timing { id: string; size: number; totalMs: number; iterations: number }
interface Attribution { marker?: string; phase?: Phase; allocation: boolean }
interface Row {
  samples: number;
  sampleMicros: number;
  counts: Record<Phase, number>;
  micros: Record<Phase, number>;
  allocatorSamples: number;
  leaves: Record<string, number>;
  perIterationMs?: number;
  phaseMs?: Record<Phase, number>;
}
const PHASES: Phase[] = ["parse", "dependency", "dirty", "evaluation", "range", "writes", "other"];
const profilePath = process.argv[2];
const timingPath = process.argv[3];
if (!profilePath || !timingPath) throw new Error("Pass a CPU profile and workload JSONL path");
const profile = JSON.parse(readFileSync(profilePath, "utf8")) as CpuProfile;
const timings = readFileSync(timingPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Timing);
const markerOf = (row: { id: string; size: number }) => `profile_${row.id.replaceAll("-", "_")}_${row.size}`;
const timingByMarker = new Map(timings.map((row) => [markerOf(row), row]));
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parents = new Map<number, number>();
for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
function phaseOf(name: string, parentPhase?: Phase): Phase | undefined {
  name = name.replace(/^sheetwrite_wasm\.wasm\.wasm-function\[/u, "");
  // A type argument is not the function's owner. HashMap<DependencyNode>,
  // for example, inherits its caller's phase instead of becoming evaluation.
  const isEngineOwner = name.startsWith("sheetwrite_wasm[") || name.startsWith("<sheetwrite_wasm[");
  if (!isEngineOwner) return undefined;
  if (["parse_formula_entry", "resolve_formula_ast", "::calc::"].some((part) => name.includes(part))) return "parse";
  if (["FormulaGraph", "build_dep_index", "ensure_index", "patch_dep"].some((part) => name.includes(part))) return "dependency";
  if (["collect_affected_formulas", "collect_matching_range_groups", "collect_interval_matches", "seed_depth_errors", "DependencyDepthWalk", "ComponentWalk", "seed_dependency_depth", "seed_additional_depth", "add_dirty_rect", "mark_dirty", "mark_all_dirty"].some((part) => name.includes(part))) return "dirty";
  if (["store_formula_result", "install_spill_result", "::spill::", "set_derived"].some((part) => name.includes(part))) return "writes";
  if (["RangeReader", "eval_sum_range", "eval_range_matrix", "push_range_values", "eval_range_values", "range_is_reusable"].some((part) => name.includes(part))) return "range";
  // Literal decoding belongs to the surrounding read. A formula reached by
  // that read switches back to evaluation at eval_formula_cell.
  if (parentPhase === "range" && name.includes(">::eval_at")) return undefined;
  if ([">::eval_", ">::evaluate_pass", "finish_runtime_formula", "settle_circular", "_family"].some((part) => name.includes(part))) return "evaluation";
  return undefined;
}
const cache = new Map<number, Attribution>();
function attribute(id: number): Attribution {
  const cached = cache.get(id);
  if (cached) return cached;
  const node = nodes.get(id);
  if (!node) throw new Error(`Missing profile node ${id}`);
  const parentId = parents.get(id);
  const parent: Attribution = parentId === undefined ? { allocation: false } : attribute(parentId);
  const name = node.callFrame.functionName;
  const result = {
    marker: name.startsWith("profile_") ? name : parent.marker,
    phase: phaseOf(name, parent.phase) ?? parent.phase,
    allocation: parent.allocation || ["dlmalloc", "__rdl_alloc", "__rdl_dealloc", "__rust_alloc", "__rust_dealloc", "reserve_rehash", "RawVec", "fallible_with_capacity"].some((part) => name.includes(part)),
  };
  cache.set(id, result);
  return result;
}
const emptyPhases = () => Object.fromEntries(PHASES.map((phase) => [phase, 0])) as Record<Phase, number>;
const rows = new Map<string, Row>();
for (const [index, sample] of profile.samples.entries()) {
  const { marker, phase, allocation } = attribute(sample);
  if (!marker) continue;
  const row = rows.get(marker) ?? { samples: 0, sampleMicros: 0, counts: emptyPhases(), micros: emptyPhases(), allocatorSamples: 0, leaves: {} };
  const elapsed = profile.timeDeltas[index];
  const leaf = nodes.get(sample)?.callFrame.functionName;
  if (elapsed === undefined || leaf === undefined) throw new Error("Incomplete sampling record");
  row.samples++;
  row.sampleMicros += elapsed;
  row.counts[phase ?? "other"]++;
  row.micros[phase ?? "other"] += elapsed;
  row.allocatorSamples += Number(allocation);
  row.leaves[leaf] = (row.leaves[leaf] ?? 0) + 1;
  rows.set(marker, row);
}
for (const [marker, row] of rows) {
  const timing = timingByMarker.get(marker);
  if (!timing) throw new Error(`Missing timing for ${marker}`);
  const perIterationMs = timing.totalMs / timing.iterations;
  row.perIterationMs = perIterationMs;
  row.phaseMs = Object.fromEntries(PHASES.map((phase) => [phase, perIterationMs * row.micros[phase] / row.sampleMicros])) as Record<Phase, number>;
}
if (rows.size !== timings.length) throw new Error("A workload has no measured-window samples");
const result = { totalSamples: profile.samples.length, attributedSamples: [...rows.values()].reduce((total, row) => total + row.samples, 0), workloadCount: rows.size, rows: Object.fromEntries(rows) };
writeFileSync(`${profilePath}.summary.json`, JSON.stringify(result, null, 2));
process.stdout.write(`${JSON.stringify(result)}\n`);
