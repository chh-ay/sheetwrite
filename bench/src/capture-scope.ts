import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus, release } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import { machineLabel } from "./machine-label.js";
import { RELEASE_SUITE_ARTIFACTS } from "./release-capture.js";

const GIB_BYTES = 1024 ** 3;
const CGROUP_ROOT = "/sys/fs/cgroup";
/** An absolute path, alone or after `NAME=` (environment) or `--option=`. */
const PATH_ARGUMENT = /^((?:[A-Z][A-Z0-9_]*=|--?[A-Za-z][\w-]*=)?)(\/.*)$/u;

interface CaptureArtifact {
  readonly file: string;
  readonly sha256: string;
  readonly modifiedAtMs: number;
}

/** Bind one suite's receipt to the exact files it produced. */
export async function readCaptureArtifacts(
  suite: string,
  directory: string,
): Promise<readonly CaptureArtifact[]> {
  const names = RELEASE_SUITE_ARTIFACTS.get(suite);
  if (names === undefined) throw new Error(`Unknown release suite: ${suite}`);
  const artifacts: CaptureArtifact[] = [];
  for (const name of names) {
    const file = Bun.file(resolve(directory, name));
    if (!(await file.exists())) throw new Error(`${suite} did not write ${name}`);
    artifacts.push({
      file: name,
      sha256: createHash("sha256")
        .update(await file.bytes())
        .digest("hex"),
      modifiedAtMs: file.lastModified,
    });
  }
  return artifacts;
}

function receipt_object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Capture receipt must contain an object");
  }
  return value as Record<string, unknown>;
}

/**
 * Receipts are committed, so their argv must not name this machine's
 * directories. An absolute path inside the repository becomes
 * repository-relative; any other keeps only its last segment, under
 * `<external>`.
 */
export function portableCommand(command: readonly string[], repositoryRoot: string): string[] {
  return command.map((argument) => {
    const match = PATH_ARGUMENT.exec(argument);
    if (match === null) return argument;
    const [, prefix = "", path = ""] = match;
    const inside = relative(repositoryRoot, path);
    if (inside === "") return `${prefix}.`;
    const outside = inside.startsWith("..") || isAbsolute(inside);
    return `${prefix}${outside ? `<external>/${basename(path)}` : inside}`;
  });
}

/**
 * The CPU mask a suite actually ran on. Receipts written before
 * `effectiveCpuAffinity` existed ran on their single reserved slot; a receipt
 * that marks an affinity override must state its mask explicitly.
 */
function capture_affinity(capture: Record<string, unknown>): readonly [string, string] {
  const label = capture.label;
  if (typeof label !== "string") throw new Error("Capture affinity needs a suite label");
  const metadata = receipt_object(capture.metadata);

  const explicit = metadata.effectiveCpuAffinity;
  if (explicit !== undefined) {
    if (typeof explicit !== "string" || !/^\d+(?:[-,]\d+)*$/u.test(explicit)) {
      throw new Error(`Invalid effective CPU affinity for ${label}`);
    }
    return [label, explicit];
  }

  if (metadata.formulaAffinityCorrection !== undefined || metadata.cpuSlotMeaning !== undefined) {
    throw new Error(`Missing effective CPU affinity for overridden capture ${label}`);
  }
  const slot = metadata.cpuSlot;
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
    throw new Error(`Missing legacy CPU affinity for ${label}`);
  }
  return [label, String(slot)];
}

/**
 * Require each suite to use the same CPU mask on both sides. Masks may differ
 * between suites: formula suites run unpinned, the others on one slot.
 */
export function matchingCaptureAffinities(
  baseline: readonly Record<string, unknown>[],
  candidate: readonly Record<string, unknown>[],
): Readonly<Record<string, string>> {
  const candidate_masks = new Map(candidate.map(capture_affinity));
  for (const capture of baseline) {
    const [label, before] = capture_affinity(capture);
    const after = candidate_masks.get(label);
    if (before !== after) {
      throw new Error(
        `Capture CPU affinities differ for ${label}: baseline ${before}, candidate ${after}`,
      );
    }
  }
  return Object.fromEntries(candidate_masks);
}

function command_output(command: readonly string[]): string {
  const result = Bun.spawnSync([...command], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function high_events(cgroup: string): number {
  const match = /^high (\d+)$/m.exec(readFileSync(`${CGROUP_ROOT}${cgroup}/memory.events`, "utf8"));
  if (match?.[1] === undefined) throw new Error(`No high counter in ${cgroup}`);
  return Number(match[1]);
}

function write_record(path: string, record: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(temporary, path);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      label: { type: "string" },
      output: { type: "string" },
      "code-ref": { type: "string", default: "HEAD" },
      // A frozen-harness baseline loads its engine from another checkout; check that one.
      "engine-root": { type: "string" },
      "harness-root": { type: "string" },
      "harness-patch": { type: "string" },
      "results-dir": { type: "string", default: "results" },
      rehearsal: { type: "boolean", default: false },
    },
  });
  if (values.label === undefined || values.output === undefined || positionals.length === 0) {
    throw new Error(
      "Usage: capture-scope.ts --label <suite> --output <record.json> -- <command...>",
    );
  }

  const requested = process.env.BENCH_MEMORY_MAX ?? "6G";
  const requested_gi_b = /^(\d+)G$/.exec(requested)?.[1];
  if (requested_gi_b === undefined)
    throw new Error(`Expected a whole-GiB memory cap, got ${requested}`);
  const expected_memory_max_bytes = Number(requested_gi_b) * GIB_BYTES;
  const process_group = readFileSync("/proc/self/cgroup", "utf8").trim().split("::").at(-1);
  const scope = process_group?.split("/").at(-1);
  if (scope === undefined || !scope.endsWith(".scope")) {
    throw new Error("Capture must run inside bench-run's systemd scope");
  }
  const memory_max_proof = command_output([
    "systemctl",
    "--user",
    "show",
    scope,
    "-p",
    "MemoryMax",
  ]);
  const actual_memory_max_bytes = Number(memory_max_proof.replace(/^MemoryMax=/, ""));
  if (actual_memory_max_bytes !== expected_memory_max_bytes) {
    throw new Error(
      `Wrong capture cap: expected ${expected_memory_max_bytes}, MemoryMax=${actual_memory_max_bytes}`,
    );
  }

  const slice = command_output([
    "systemctl",
    "--user",
    "show",
    "sheetwrite-heavy.slice",
    "-p",
    "ControlGroup",
    "--value",
  ]);
  const before_high = high_events(slice);
  const commit = command_output(["git", "rev-parse", "HEAD"]);
  const dirty =
    command_output([
      "git",
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      ":(top,exclude)bench/results",
    ]) !== "";
  if (dirty) throw new Error("Capture source tree must be clean");
  const engine_root = values["engine-root"] ?? process.cwd();
  const engine_commit = command_output([
    "git",
    "-C",
    engine_root,
    "rev-parse",
    `${values["code-ref"]}^{commit}`,
  ]);
  if (
    command_output([
      "git",
      "-C",
      engine_root,
      "diff",
      "--name-only",
      engine_commit,
      "--",
      ":(top)packages",
    ]) !== ""
  ) {
    throw new Error("Capture code differs from its declared engine/core commit");
  }
  const harness_root = values["harness-root"] ?? process.cwd();
  const harness_commit = command_output(["git", "-C", harness_root, "rev-parse", "HEAD"]);
  if (
    command_output([
      "git",
      "-C",
      harness_root,
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      ":(top,exclude)bench/results",
    ]) !== ""
  ) {
    throw new Error("Capture harness tree must be clean");
  }
  const harness_patch_sha256 =
    values["harness-patch"] === undefined
      ? undefined
      : createHash("sha256").update(readFileSync(values["harness-patch"])).digest("hex");

  const output = resolve(values.output);
  // The benchmark child inherits this process's CPU mask, so record the mask actually in force.
  const affinity_proof = /^Cpus_allowed_list:\s*(\S+)$/mu.exec(
    readFileSync("/proc/self/status", "utf8"),
  );
  if (affinity_proof?.[1] === undefined) throw new Error("No effective CPU affinity proof");

  const metadata = {
    commit,
    dirty,
    engineCommit: engine_commit,
    harnessCommit: harness_commit,
    harnessPatchSha256: harness_patch_sha256,
    purpose: values.rehearsal ? "rehearsal" : "capture",
    timestamp: new Date().toISOString(),
    machine: machineLabel(),
    cpu: cpus()[0]?.model ?? "unknown",
    bun: Bun.version,
    node: command_output(["node", "--version"]),
    npm: command_output(["npm", "--version"]),
    bunNodeCompat: process.version,
    kernel: release(),
    cpuSlot: 4,
    effectiveCpuAffinity: affinity_proof[1],
    affinityProof: affinity_proof[0],
    cpuSlotMeaning: "Reserved entry slot; effectiveCpuAffinity records the actual mask.",
    memoryMax: requested,
    effectiveMemoryMaxBytes: actual_memory_max_bytes,
    memoryMaxProof: memory_max_proof,
    scope,
    slice,
    sliceHighBefore: before_high,
    command: portableCommand(
      positionals,
      command_output(["git", "-C", harness_root, "rev-parse", "--show-toplevel"]),
    ),
  };
  write_record(output, {
    protocol: "sheetwrite-capture-scope-v1",
    label: values.label,
    metadata,
    status: "running",
  });
  process.stderr.write(`${values.label}: ${metadata.memoryMaxProof}; slice high=${before_high}\n`);

  const child = Bun.spawn(positionals, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const exit_code = await child.exited;
  const after_high = high_events(slice);
  const peak_bytes = Number(
    readFileSync(`${CGROUP_ROOT}${process_group}/memory.peak`, "utf8").trim(),
  );
  const was_throttled = after_high > before_high;
  const status = exit_code !== 0 ? "failed" : was_throttled ? "invalid-throttled" : "passed";
  const artifacts =
    status === "passed" && !values.rehearsal
      ? await readCaptureArtifacts(values.label, resolve(values["results-dir"]))
      : [];
  const started_at_ms = Date.parse(metadata.timestamp);
  for (const artifact of artifacts) {
    if (artifact.modifiedAtMs < started_at_ms) {
      throw new Error(`${values.label} left a stale artifact: ${artifact.file}`);
    }
  }
  write_record(output, {
    protocol: "sheetwrite-capture-scope-v1",
    label: values.label,
    metadata,
    status,
    endedAt: new Date().toISOString(),
    exitCode: exit_code,
    sliceHighAfter: after_high,
    memoryPeakBytes: peak_bytes,
    artifacts,
  });
  if (was_throttled) {
    throw new Error(
      `${values.label}: slice high counter rose from ${before_high} to ${after_high}; discard these timings`,
    );
  }
  if (exit_code !== 0) throw new Error(`${values.label}: capture exited ${exit_code}`);
}

if (import.meta.main) await main();
