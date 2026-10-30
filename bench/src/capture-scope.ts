import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus, hostname, release } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

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

function receiptObject(value: unknown): Record<string, unknown> {
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
function captureAffinity(capture: Record<string, unknown>): readonly [string, string] {
  const label = capture.label;
  if (typeof label !== "string") throw new Error("Capture affinity needs a suite label");
  const metadata = receiptObject(capture.metadata);

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
  const candidateMasks = new Map(candidate.map(captureAffinity));
  for (const capture of baseline) {
    const [label, before] = captureAffinity(capture);
    const after = candidateMasks.get(label);
    if (before !== after) {
      throw new Error(
        `Capture CPU affinities differ for ${label}: baseline ${before}, candidate ${after}`,
      );
    }
  }
  return Object.fromEntries(candidateMasks);
}

function commandOutput(command: readonly string[]): string {
  const result = Bun.spawnSync([...command], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function highEvents(cgroup: string): number {
  const match = /^high (\d+)$/m.exec(readFileSync(`${CGROUP_ROOT}${cgroup}/memory.events`, "utf8"));
  if (match?.[1] === undefined) throw new Error(`No high counter in ${cgroup}`);
  return Number(match[1]);
}

function writeRecord(path: string, record: unknown): void {
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
  const requestedGiB = /^(\d+)G$/.exec(requested)?.[1];
  if (requestedGiB === undefined)
    throw new Error(`Expected a whole-GiB memory cap, got ${requested}`);
  const expectedMemoryMaxBytes = Number(requestedGiB) * GIB_BYTES;
  const processGroup = readFileSync("/proc/self/cgroup", "utf8").trim().split("::").at(-1);
  const scope = processGroup?.split("/").at(-1);
  if (scope === undefined || !scope.endsWith(".scope")) {
    throw new Error("Capture must run inside bench-run's systemd scope");
  }
  const memoryMaxProof = commandOutput(["systemctl", "--user", "show", scope, "-p", "MemoryMax"]);
  const actualMemoryMaxBytes = Number(memoryMaxProof.replace(/^MemoryMax=/, ""));
  if (actualMemoryMaxBytes !== expectedMemoryMaxBytes) {
    throw new Error(
      `Wrong capture cap: expected ${expectedMemoryMaxBytes}, MemoryMax=${actualMemoryMaxBytes}`,
    );
  }

  const slice = commandOutput([
    "systemctl",
    "--user",
    "show",
    "sheetwrite-heavy.slice",
    "-p",
    "ControlGroup",
    "--value",
  ]);
  const beforeHigh = highEvents(slice);
  const commit = commandOutput(["git", "rev-parse", "HEAD"]);
  const dirty =
    commandOutput([
      "git",
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      ":(top,exclude)bench/results",
    ]) !== "";
  if (dirty) throw new Error("Capture source tree must be clean");
  const engineRoot = values["engine-root"] ?? process.cwd();
  const engineCommit = commandOutput([
    "git",
    "-C",
    engineRoot,
    "rev-parse",
    `${values["code-ref"]}^{commit}`,
  ]);
  if (
    commandOutput([
      "git",
      "-C",
      engineRoot,
      "diff",
      "--name-only",
      engineCommit,
      "--",
      ":(top)packages",
    ]) !== ""
  ) {
    throw new Error("Capture code differs from its declared engine/core commit");
  }
  const harnessRoot = values["harness-root"] ?? process.cwd();
  const harnessCommit = commandOutput(["git", "-C", harnessRoot, "rev-parse", "HEAD"]);
  if (
    commandOutput([
      "git",
      "-C",
      harnessRoot,
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      ":(top,exclude)bench/results",
    ]) !== ""
  ) {
    throw new Error("Capture harness tree must be clean");
  }
  const harnessPatchSha256 =
    values["harness-patch"] === undefined
      ? undefined
      : createHash("sha256").update(readFileSync(values["harness-patch"])).digest("hex");

  const output = resolve(values.output);
  // The benchmark child inherits this process's CPU mask, so record the mask actually in force.
  const affinityProof = /^Cpus_allowed_list:\s*(\S+)$/mu.exec(
    readFileSync("/proc/self/status", "utf8"),
  );
  if (affinityProof?.[1] === undefined) throw new Error("No effective CPU affinity proof");

  const metadata = {
    commit,
    dirty,
    engineCommit,
    harnessCommit,
    harnessPatchSha256,
    purpose: values.rehearsal ? "rehearsal" : "capture",
    timestamp: new Date().toISOString(),
    machine: hostname(),
    cpu: cpus()[0]?.model ?? "unknown",
    bun: Bun.version,
    node: commandOutput(["node", "--version"]),
    npm: commandOutput(["npm", "--version"]),
    bunNodeCompat: process.version,
    kernel: release(),
    cpuSlot: 4,
    effectiveCpuAffinity: affinityProof[1],
    affinityProof: affinityProof[0],
    cpuSlotMeaning: "Reserved entry slot; effectiveCpuAffinity records the actual mask.",
    memoryMax: requested,
    effectiveMemoryMaxBytes: actualMemoryMaxBytes,
    memoryMaxProof,
    scope,
    slice,
    sliceHighBefore: beforeHigh,
    command: portableCommand(
      positionals,
      commandOutput(["git", "-C", harnessRoot, "rev-parse", "--show-toplevel"]),
    ),
  };
  writeRecord(output, {
    protocol: "sheetwrite-capture-scope-v1",
    label: values.label,
    metadata,
    status: "running",
  });
  process.stderr.write(`${values.label}: ${metadata.memoryMaxProof}; slice high=${beforeHigh}\n`);

  const child = Bun.spawn(positionals, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  const afterHigh = highEvents(slice);
  const peakBytes = Number(
    readFileSync(`${CGROUP_ROOT}${processGroup}/memory.peak`, "utf8").trim(),
  );
  const wasThrottled = afterHigh > beforeHigh;
  const status = exitCode !== 0 ? "failed" : wasThrottled ? "invalid-throttled" : "passed";
  const artifacts =
    status === "passed" && !values.rehearsal
      ? await readCaptureArtifacts(values.label, resolve(values["results-dir"]))
      : [];
  const startedAtMs = Date.parse(metadata.timestamp);
  for (const artifact of artifacts) {
    if (artifact.modifiedAtMs < startedAtMs) {
      throw new Error(`${values.label} left a stale artifact: ${artifact.file}`);
    }
  }
  writeRecord(output, {
    protocol: "sheetwrite-capture-scope-v1",
    label: values.label,
    metadata,
    status,
    endedAt: new Date().toISOString(),
    exitCode,
    sliceHighAfter: afterHigh,
    memoryPeakBytes: peakBytes,
    artifacts,
  });
  if (wasThrottled) {
    throw new Error(
      `${values.label}: slice high counter rose from ${beforeHigh} to ${afterHigh}; discard these timings`,
    );
  }
  if (exitCode !== 0) throw new Error(`${values.label}: capture exited ${exitCode}`);
}

if (import.meta.main) await main();
