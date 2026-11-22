export const WASM_PROFILE_MATRIX_SCHEMA_VERSION = 1 as const;
export const WASM_PROFILE_MATRIX_PROTOCOL = "wasm-post-link-profile-matrix-v1" as const;
export const WASM_OPT_PROFILES = ["-O3", "-Os", "-Oz"] as const;
export type WasmOptProfile = (typeof WASM_OPT_PROFILES)[number];

const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const STORE_ONLY_COMMAND = [
  "cargo",
  "check",
  "--target",
  "wasm32-unknown-unknown",
  "--no-default-features",
  "--message-format=json",
] as const;
const BLOCKER_IDS = ["formula-entry-ast", "dependency-index"] as const;

type GateStatus = "passed" | "failed";

export interface MatrixGateEvidence {
  readonly status: GateStatus;
  readonly commands: readonly (readonly string[])[];
  readonly exitCode: number;
  readonly artifactPath: string;
  readonly evidenceSha256: string;
  readonly wasmSha256: string;
  readonly commit: string;
  readonly runnerFingerprint: string;
}

export interface WasmProfileVariant {
  readonly wasmOpt: WasmOptProfile;
  readonly inputWasmSha256: string;
  readonly artifact: {
    readonly rawBytes: number;
    readonly gzipBytes: number;
    readonly brotliBytes: number;
    readonly sha256: string;
  };
  readonly formulaGate: MatrixGateEvidence;
  readonly renderGate: MatrixGateEvidence;
}

export interface StoreOnlyBlocker {
  readonly id: (typeof BLOCKER_IDS)[number];
  readonly kind: "dependency-cycle";
  readonly owner: string;
  readonly dependency: string;
  readonly reason: string;
}

export interface StoreOnlyProbe {
  readonly provenance: {
    readonly commit: string;
    readonly dirty: false;
    readonly timestamp: string;
  };
  readonly command: readonly string[];
  readonly outcome: "compiled" | "blocked" | "failed";
  readonly exitCode: number;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly blockers: readonly StoreOnlyBlocker[];
}

export interface WasmProfileMatrixEvidence {
  readonly schemaVersion: typeof WASM_PROFILE_MATRIX_SCHEMA_VERSION;
  readonly protocol: typeof WASM_PROFILE_MATRIX_PROTOCOL;
  readonly provenance: {
    readonly commit: string;
    readonly dirty: false;
    readonly timestamp: string;
    readonly host: string;
    readonly rustc: string;
    readonly cargo: string;
    readonly wasmPack: string;
    readonly wasmOptVersion: string;
    readonly wasmOptSha256: string;
    readonly bun: string;
  };
  readonly rustProfile: {
    readonly optLevel: 3;
    readonly lto: "fat";
    readonly codegenUnits: 1;
  };
  readonly postLink: {
    readonly inputWasmSha256: string;
    readonly compression: {
      readonly gzipLevel: 9;
      readonly brotliQuality: 11;
      readonly brotliMode: "generic";
    };
  };
  readonly decisionPolicy: {
    readonly sizeMetric: "brotliBytes";
    readonly requireFormulaGate: true;
    readonly requireRenderGate: true;
  };
  readonly captureOrder: {
    readonly formula: readonly WasmOptProfile[];
    readonly render: readonly WasmOptProfile[];
  };
  readonly variants: readonly WasmProfileVariant[];
  readonly storeOnlyProbe: StoreOnlyProbe;
}

export type WasmProfileDecision =
  | {
      readonly status: "recommended";
      readonly wasmOpt: WasmOptProfile;
      readonly baseline: "-O3";
      readonly savedBytes: { readonly raw: number; readonly gzip: number; readonly brotli: number };
    }
  | { readonly status: "blocked"; readonly failures: readonly string[] };

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a string`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return value as number;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  return expected;
}

function hash(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!SHA256.test(parsed)) throw new Error(`${label} must be a lowercase SHA-256`);
  return parsed;
}

function commit(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!COMMIT.test(parsed)) throw new Error(`${label} must be a full lowercase commit hash`);
  return parsed;
}

function string_array(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${label} must be a non-empty array`);
  return value.map((entry, index) => string(entry, `${label}[${index}]`));
}

function canonical_timestamp(value: unknown, label: string): string {
  const parsed = string(value, label);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== parsed) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return parsed;
}

export function assertCleanMatrixCapture(status: string): void {
  if (status.trim().length > 0) {
    throw new Error("controlled matrix capture requires a completely clean tree");
  }
}

function profile(value: unknown, label: string): WasmOptProfile {
  if (!WASM_OPT_PROFILES.includes(value as WasmOptProfile)) {
    throw new Error(`${label} must be one of ${WASM_OPT_PROFILES.join(", ")}`);
  }
  return value as WasmOptProfile;
}

function exact_profiles(value: unknown, label: string): WasmOptProfile[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const parsed = value.map((entry, index) => profile(entry, `${label}[${index}]`));
  if (
    parsed.length !== WASM_OPT_PROFILES.length ||
    new Set(parsed).size !== WASM_OPT_PROFILES.length
  ) {
    throw new Error(`${label} must contain -O3, -Os, and -Oz exactly once`);
  }
  return parsed;
}

function command_list(value: unknown, label: string): string[][] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`);
  }
  return value.map((entry, index) => string_array(entry, `${label}[${index}]`));
}

function parse_gate(
  value: unknown,
  label: string,
  kind: "formula" | "render",
  expected_commit: string,
  expected_wasm_sha256: string,
): MatrixGateEvidence {
  const gate = record(value, label);
  const status = gate.status;
  if (status !== "passed" && status !== "failed") {
    throw new Error(`${label}.status must be passed or failed`);
  }
  const exit_code = integer(gate.exitCode, `${label}.exitCode`);
  if ((status === "passed") !== (exit_code === 0)) {
    throw new Error(`${label} status and exitCode disagree`);
  }
  const parsed: MatrixGateEvidence = {
    status,
    commands: command_list(gate.commands, `${label}.commands`),
    exitCode: exit_code,
    artifactPath: string(gate.artifactPath, `${label}.artifactPath`),
    evidenceSha256: hash(gate.evidenceSha256, `${label}.evidenceSha256`),
    wasmSha256: hash(gate.wasmSha256, `${label}.wasmSha256`),
    commit: commit(gate.commit, `${label}.commit`),
    runnerFingerprint: hash(gate.runnerFingerprint, `${label}.runnerFingerprint`),
  };
  const runs_formula = parsed.commands.some(
    (command) =>
      command.includes("bench:formula") ||
      command.some((token) => token.endsWith("/formula-bench.ts") || token === "formula-bench.ts"),
  );
  const runs_render = parsed.commands.some(
    (command) =>
      command.includes("bench:render") ||
      command.some((token) => token.endsWith("/render-driver.ts") || token === "render-driver.ts"),
  );
  const runs_render_check = parsed.commands.some(
    (command) =>
      command.includes("bench:check") ||
      command.some((token) => token.endsWith("/check.ts") || token === "check.ts"),
  );
  const command_lines = parsed.commands.map((command) => command.join(" "));
  if (kind === "formula") {
    if (
      !runs_formula ||
      command_lines.some((command) =>
        /(?:--preliminary|--smoke|bench:formula:smoke)/u.test(command),
      )
    ) {
      throw new Error(`${label} must run the gating formula benchmark`);
    }
  } else if (
    !runs_render ||
    !runs_render_check ||
    command_lines.some((command) =>
      /(?:--report-only|--smoke|--scenario-set\s+diagnostic|bench:render:(?:smoke|diagnostic))/u.test(
        command,
      ),
    )
  ) {
    throw new Error(`${label} must run the render capture and fail-closed check`);
  }
  if (parsed.commit !== expected_commit) throw new Error(`${label} commit is incomparable`);
  if (parsed.wasmSha256 !== expected_wasm_sha256) {
    throw new Error(`${label} was not run against its variant artifact`);
  }
  return parsed;
}

function parse_store_only_probe(value: unknown, expected_commit: string): StoreOnlyProbe {
  const probe = record(value, "storeOnlyProbe");
  const provenance_raw = record(probe.provenance, "storeOnlyProbe.provenance");
  const provenance = {
    commit: commit(provenance_raw.commit, "storeOnlyProbe.provenance.commit"),
    dirty: literal(provenance_raw.dirty, false, "storeOnlyProbe.provenance.dirty"),
    timestamp: canonical_timestamp(provenance_raw.timestamp, "storeOnlyProbe.provenance.timestamp"),
  } as const;
  if (provenance.commit !== expected_commit) {
    throw new Error("storeOnlyProbe commit does not match matrix provenance");
  }
  const command = string_array(probe.command, "storeOnlyProbe.command");
  if (JSON.stringify(command) !== JSON.stringify(STORE_ONLY_COMMAND)) {
    throw new Error("storeOnlyProbe.command must be the controlled --no-default-features check");
  }
  const outcome = probe.outcome;
  if (outcome !== "compiled" && outcome !== "blocked" && outcome !== "failed") {
    throw new Error("storeOnlyProbe.outcome must be compiled, blocked, or failed");
  }
  const exit_code = integer(probe.exitCode, "storeOnlyProbe.exitCode");
  if ((outcome === "compiled") !== (exit_code === 0)) {
    throw new Error("storeOnlyProbe outcome and exitCode disagree");
  }
  if (!Array.isArray(probe.blockers)) throw new Error("storeOnlyProbe.blockers must be an array");
  const blockers = probe.blockers.map((raw, index): StoreOnlyBlocker => {
    const blocker = record(raw, `storeOnlyProbe.blockers[${index}]`);
    const id = blocker.id;
    if (!BLOCKER_IDS.includes(id as StoreOnlyBlocker["id"])) {
      throw new Error(`storeOnlyProbe.blockers[${index}].id is unknown`);
    }
    return {
      id: id as StoreOnlyBlocker["id"],
      kind: literal(blocker.kind, "dependency-cycle", `storeOnlyProbe.blockers[${index}].kind`),
      owner: string(blocker.owner, `storeOnlyProbe.blockers[${index}].owner`),
      dependency: string(blocker.dependency, `storeOnlyProbe.blockers[${index}].dependency`),
      reason: string(blocker.reason, `storeOnlyProbe.blockers[${index}].reason`),
    };
  });
  if (outcome === "blocked") {
    if (
      blockers.length !== BLOCKER_IDS.length ||
      new Set(blockers.map(({ id }) => id)).size !== BLOCKER_IDS.length
    ) {
      throw new Error("blocked store-only probe must report both dependency-cycle blockers");
    }
  } else if (blockers.length > 0) {
    throw new Error(`${outcome} store-only probe cannot claim dependency-cycle blockers`);
  }
  return {
    provenance,
    command,
    outcome,
    exitCode: exit_code,
    stdoutSha256: hash(probe.stdoutSha256, "storeOnlyProbe.stdoutSha256"),
    stderrSha256: hash(probe.stderrSha256, "storeOnlyProbe.stderrSha256"),
    blockers,
  };
}

export function parseWasmProfileMatrix(value: unknown): WasmProfileMatrixEvidence {
  const root = record(value, "matrix");
  literal(root.schemaVersion, WASM_PROFILE_MATRIX_SCHEMA_VERSION, "schemaVersion");
  literal(root.protocol, WASM_PROFILE_MATRIX_PROTOCOL, "protocol");
  const provenance_raw = record(root.provenance, "provenance");
  const provenance = {
    commit: commit(provenance_raw.commit, "provenance.commit"),
    dirty: literal(provenance_raw.dirty, false, "provenance.dirty"),
    timestamp: string(provenance_raw.timestamp, "provenance.timestamp"),
    host: string(provenance_raw.host, "provenance.host"),
    rustc: string(provenance_raw.rustc, "provenance.rustc"),
    cargo: string(provenance_raw.cargo, "provenance.cargo"),
    wasmPack: string(provenance_raw.wasmPack, "provenance.wasmPack"),
    wasmOptVersion: string(provenance_raw.wasmOptVersion, "provenance.wasmOptVersion"),
    wasmOptSha256: hash(provenance_raw.wasmOptSha256, "provenance.wasmOptSha256"),
    bun: string(provenance_raw.bun, "provenance.bun"),
  } as const;
  const provenance_timestamp = canonical_timestamp(provenance.timestamp, "provenance.timestamp");
  const normalized_provenance = { ...provenance, timestamp: provenance_timestamp };
  const rust_raw = record(root.rustProfile, "rustProfile");
  const rust_profile = {
    optLevel: literal(rust_raw.optLevel, 3, "rustProfile.optLevel"),
    lto: literal(rust_raw.lto, "fat", "rustProfile.lto"),
    codegenUnits: literal(rust_raw.codegenUnits, 1, "rustProfile.codegenUnits"),
  } as const;
  const post_link_raw = record(root.postLink, "postLink");
  const compression_raw = record(post_link_raw.compression, "postLink.compression");
  const post_link = {
    inputWasmSha256: hash(post_link_raw.inputWasmSha256, "postLink.inputWasmSha256"),
    compression: {
      gzipLevel: literal(compression_raw.gzipLevel, 9, "postLink.compression.gzipLevel"),
      brotliQuality: literal(
        compression_raw.brotliQuality,
        11,
        "postLink.compression.brotliQuality",
      ),
      brotliMode: literal(compression_raw.brotliMode, "generic", "postLink.compression.brotliMode"),
    },
  } as const;
  const policy_raw = record(root.decisionPolicy, "decisionPolicy");
  const decision_policy = {
    sizeMetric: literal(policy_raw.sizeMetric, "brotliBytes", "decisionPolicy.sizeMetric"),
    requireFormulaGate: literal(
      policy_raw.requireFormulaGate,
      true,
      "decisionPolicy.requireFormulaGate",
    ),
    requireRenderGate: literal(
      policy_raw.requireRenderGate,
      true,
      "decisionPolicy.requireRenderGate",
    ),
  } as const;
  const order_raw = record(root.captureOrder, "captureOrder");
  const capture_order = {
    formula: exact_profiles(order_raw.formula, "captureOrder.formula"),
    render: exact_profiles(order_raw.render, "captureOrder.render"),
  };

  if (!Array.isArray(root.variants)) throw new Error("variants must be an array");
  const modes = new Set<WasmOptProfile>();
  const variants = root.variants.map((raw, index): WasmProfileVariant => {
    const variant = record(raw, `variants[${index}]`);
    const wasm_opt = profile(variant.wasmOpt, `variants[${index}].wasmOpt`);
    if (modes.has(wasm_opt)) throw new Error(`duplicate ${wasm_opt} variant`);
    modes.add(wasm_opt);
    const input_wasm_sha256 = hash(variant.inputWasmSha256, `variants[${index}].inputWasmSha256`);
    if (input_wasm_sha256 !== post_link.inputWasmSha256) {
      throw new Error(`${wasm_opt} did not use the shared pre-post-link artifact`);
    }
    const artifact_raw = record(variant.artifact, `variants[${index}].artifact`);
    const artifact = {
      rawBytes: integer(artifact_raw.rawBytes, `variants[${index}].artifact.rawBytes`, 1),
      gzipBytes: integer(artifact_raw.gzipBytes, `variants[${index}].artifact.gzipBytes`, 1),
      brotliBytes: integer(artifact_raw.brotliBytes, `variants[${index}].artifact.brotliBytes`, 1),
      sha256: hash(artifact_raw.sha256, `variants[${index}].artifact.sha256`),
    };
    if (artifact.gzipBytes >= artifact.rawBytes || artifact.brotliBytes >= artifact.rawBytes) {
      throw new Error(`${wasm_opt} compressed sizes must be smaller than raw size`);
    }
    return {
      wasmOpt: wasm_opt,
      inputWasmSha256: input_wasm_sha256,
      artifact,
      formulaGate: parse_gate(
        variant.formulaGate,
        `variants[${index}].formulaGate`,
        "formula",
        provenance.commit,
        artifact.sha256,
      ),
      renderGate: parse_gate(
        variant.renderGate,
        `variants[${index}].renderGate`,
        "render",
        provenance.commit,
        artifact.sha256,
      ),
    };
  });
  if (variants.length !== WASM_OPT_PROFILES.length || modes.size !== WASM_OPT_PROFILES.length) {
    throw new Error("variants must contain -O3, -Os, and -Oz exactly once");
  }
  for (const gate of ["formulaGate", "renderGate"] as const) {
    const fingerprints = new Set(variants.map((variant) => variant[gate].runnerFingerprint));
    const evidence_hashes = new Set(variants.map((variant) => variant[gate].evidenceSha256));
    const artifact_paths = new Set(variants.map((variant) => variant[gate].artifactPath));
    if (evidence_hashes.size !== variants.length || artifact_paths.size !== variants.length) {
      throw new Error(`${gate} evidence was reused across variants`);
    }
    if (fingerprints.size !== 1) throw new Error(`${gate} runner provenance is incomparable`);
  }

  return {
    schemaVersion: WASM_PROFILE_MATRIX_SCHEMA_VERSION,
    protocol: WASM_PROFILE_MATRIX_PROTOCOL,
    provenance: normalized_provenance,
    rustProfile: rust_profile,
    postLink: post_link,
    decisionPolicy: decision_policy,
    captureOrder: capture_order,
    variants,
    storeOnlyProbe: parse_store_only_probe(root.storeOnlyProbe, normalized_provenance.commit),
  };
}

export function decideWasmProfile(value: unknown): WasmProfileDecision {
  const evidence = parseWasmProfileMatrix(value);
  const failures: string[] = [];
  for (const variant of evidence.variants) {
    if (variant.formulaGate.status !== "passed")
      failures.push(`${variant.wasmOpt} formula gate failed`);
    if (variant.renderGate.status !== "passed")
      failures.push(`${variant.wasmOpt} render gate failed`);
  }
  if (evidence.storeOnlyProbe.outcome === "failed") {
    failures.push("store-only compile probe failed without a classified outcome");
  }
  if (failures.length > 0) return { status: "blocked", failures };

  const baseline = evidence.variants.find(({ wasmOpt: wasm_opt }) => wasm_opt === "-O3")!;
  const selected = evidence.variants.reduce((best, candidate) =>
    candidate.artifact.brotliBytes < best.artifact.brotliBytes ? candidate : best,
  );
  return {
    status: "recommended",
    wasmOpt: selected.wasmOpt,
    baseline: "-O3",
    savedBytes: {
      raw: baseline.artifact.rawBytes - selected.artifact.rawBytes,
      gzip: baseline.artifact.gzipBytes - selected.artifact.gzipBytes,
      brotli: baseline.artifact.brotliBytes - selected.artifact.brotliBytes,
    },
  };
}
