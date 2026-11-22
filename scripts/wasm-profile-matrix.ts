import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { brotliCompressSync, gzipSync, constants as zlibConstants } from "node:zlib";

import { optionValue, requiredOption } from "../bench/src/cli-options.js";
import {
  assertCleanMatrixCapture,
  decideWasmProfile,
  type MatrixGateEvidence,
  parseWasmProfileMatrix,
  type StoreOnlyProbe,
  WASM_OPT_PROFILES,
  type WasmOptProfile,
} from "../bench/src/wasm-profile-matrix.js";

const ROOT = resolve(import.meta.dir, "..");
const WASM_CRATE = resolve(ROOT, "packages/wasm");
const STORE_ONLY_COMMAND = [
  "cargo",
  "check",
  "--target",
  "wasm32-unknown-unknown",
  "--no-default-features",
  "--message-format=json",
] as const;
const STORE_ONLY_SENTINEL = "SHEETWRITE_STORE_ONLY_BLOCKED";

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

interface BuildVariant {
  readonly wasmOpt: WasmOptProfile;
  readonly inputWasmSha256: string;
  readonly artifactPath: string;
  readonly artifact: {
    readonly rawBytes: number;
    readonly gzipBytes: number;
    readonly brotliBytes: number;
    readonly sha256: string;
  };
}

interface BuildCapture {
  readonly schemaVersion: number;
  readonly protocol: string;
  readonly provenance: { readonly commit: string; readonly dirty: false };
  readonly rustProfile: unknown;
  readonly postLink: unknown;
  readonly variants: readonly BuildVariant[];
}

interface GateCapture extends MatrixGateEvidence {
  readonly wasmOpt: WasmOptProfile;
}

interface GateCaptureManifest {
  readonly schemaVersion: number;
  readonly protocol: string;
  readonly gate: "formula" | "render";
  readonly captures: readonly GateCapture[];
}

function gate_evidence(capture: GateCapture): MatrixGateEvidence {
  return {
    status: capture.status,
    commands: capture.commands,
    exitCode: capture.exitCode,
    artifactPath: capture.artifactPath,
    evidenceSha256: capture.evidenceSha256,
    wasmSha256: capture.wasmSha256,
    commit: capture.commit,
    runnerFingerprint: capture.runnerFingerprint,
  };
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function run(command: readonly string[], cwd = ROOT): CommandResult {
  const result = Bun.spawnSync([...command], { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function successful_output(command: readonly string[], cwd = ROOT): string {
  const result = run(command, cwd);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed: ${Buffer.from(result.stderr).toString("utf8").trim()}`,
    );
  }
  return Buffer.from(result.stdout).toString("utf8").trim();
}

function write_json(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assert_controlled_cargo_profile(): void {
  const cargo = readFileSync(resolve(WASM_CRATE, "Cargo.toml"), "utf8");
  const release = cargo.match(/\[profile\.release\]([\s\S]*?)(?=\n\[|$)/u)?.[1] ?? "";
  if (
    !/^opt-level\s*=\s*3\s*$/mu.test(release) ||
    !/^lto\s*=\s*"fat"\s*$/mu.test(release) ||
    !/^codegen-units\s*=\s*1\s*$/mu.test(release)
  ) {
    throw new Error("Cargo release profile must remain opt-level=3, lto=fat, codegen-units=1");
  }
}

function assert_clean_tree(): string {
  const commit = successful_output(["git", "rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error("git returned a non-full commit hash");
  assertCleanMatrixCapture(
    successful_output(["git", "status", "--porcelain", "--untracked-files=all"]),
  );
  return commit;
}

function compressed_sizes(data: Uint8Array): {
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
} {
  return {
    rawBytes: data.byteLength,
    gzipBytes: gzipSync(data, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(data, {
      params: {
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_GENERIC,
        [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.byteLength,
      },
    }).byteLength,
  };
}

function post_link(
  wasm_opt_path: string,
  input_path: string,
  output_directory: string,
  output_root: string,
): BuildVariant[] {
  const input = readFileSync(input_path);
  const input_wasm_sha256 = sha256(input);
  const variants: BuildVariant[] = [];
  for (const wasm_opt of WASM_OPT_PROFILES) {
    const label = wasm_opt.slice(1).toLowerCase();
    const temporary_output = resolve(output_directory, `sheetwrite-${label}.wasm`);
    const result = run([wasm_opt_path, input_path, wasm_opt, "-o", temporary_output]);
    if (result.exitCode !== 0) {
      throw new Error(`${wasm_opt} failed: ${Buffer.from(result.stderr).toString("utf8").trim()}`);
    }
    const artifact = readFileSync(temporary_output);
    const artifact_path = resolve(output_root, "artifacts", `sheetwrite-${label}.wasm`);
    mkdirSync(dirname(artifact_path), { recursive: true });
    copyFileSync(temporary_output, artifact_path);
    variants.push({
      wasmOpt: wasm_opt,
      inputWasmSha256: input_wasm_sha256,
      artifactPath: artifact_path,
      artifact: {
        ...compressed_sizes(artifact),
        sha256: sha256(artifact),
      },
    });
  }
  return variants;
}

function capture_build(args: readonly string[]): void {
  assert_controlled_cargo_profile();
  const commit = assert_clean_tree();
  const wasm_opt_path = resolve(requiredOption(args, "--wasm-opt"));
  const output = resolve(requiredOption(args, "--output"));
  const output_root = dirname(output);
  const temporary = mkdtempSync(join(tmpdir(), "sheetwrite-wasm-profile-"));
  try {
    const build_directory = resolve(temporary, "unoptimized");
    const build = run(
      [
        "wasm-pack",
        "build",
        "--target",
        "web",
        "--release",
        "--no-opt",
        "--out-dir",
        build_directory,
      ],
      WASM_CRATE,
    );
    if (build.exitCode !== 0) {
      throw new Error(
        `wasm-pack build failed: ${Buffer.from(build.stderr).toString("utf8").trim()}`,
      );
    }
    const input_path = resolve(build_directory, "sheetwrite_wasm_bg.wasm");
    const variants = post_link(wasm_opt_path, input_path, temporary, output_root);
    const wasm_opt_bytes = readFileSync(wasm_opt_path);
    const capture = {
      schemaVersion: 1,
      protocol: "wasm-post-link-build-capture-v1",
      provenance: {
        commit,
        dirty: false,
        timestamp: new Date().toISOString(),
        host: hostname(),
        rustc: successful_output(["rustc", "--version"]),
        cargo: successful_output(["cargo", "--version"]),
        wasmPack: successful_output(["wasm-pack", "--version"]),
        wasmOptVersion: successful_output([wasm_opt_path, "--version"]),
        wasmOptSha256: sha256(wasm_opt_bytes),
        bun: Bun.version,
      },
      rustProfile: { optLevel: 3, lto: "fat", codegenUnits: 1 },
      postLink: {
        inputWasmSha256: variants[0]!.inputWasmSha256,
        compression: { gzipLevel: 9, brotliQuality: 11, brotliMode: "generic" },
      },
      variants,
      completion: {
        status: "gates-required",
        required: ["formulaGate", "renderGate", "storeOnlyProbe"],
      },
    };
    write_json(output, capture);
    process.stdout.write(`${output}\n`);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function capture_store_only_probe(args: readonly string[]): void {
  const commit = assert_clean_tree();
  const output = resolve(requiredOption(args, "--output"));
  const result = run(STORE_ONLY_COMMAND, WASM_CRATE);
  const stdout_text = Buffer.from(result.stdout).toString("utf8");
  const stderr_text = Buffer.from(result.stderr).toString("utf8");
  const recognized_block =
    result.exitCode !== 0 && `${stdout_text}\n${stderr_text}`.includes(STORE_ONLY_SENTINEL);
  const outcome: StoreOnlyProbe["outcome"] =
    result.exitCode === 0 ? "compiled" : recognized_block ? "blocked" : "failed";
  const blockers: StoreOnlyProbe["blockers"] = recognized_block
    ? [
        {
          id: "formula-entry-ast",
          kind: "dependency-cycle",
          owner: "types::FormulaEntry::ast",
          dependency: "calc::Ast",
          reason: "stored formula syntax is owned by the data-store type graph",
        },
        {
          id: "dependency-index",
          kind: "dependency-cycle",
          owner: "graph::FormulaGraph::index",
          dependency: "eval::DepIndex",
          reason: "recalculation dependency state is owned by the store's formula graph",
        },
      ]
    : [];
  const probe: StoreOnlyProbe = {
    provenance: {
      commit,
      dirty: false,
      timestamp: new Date().toISOString(),
    },
    command: STORE_ONLY_COMMAND,
    outcome,
    exitCode: result.exitCode,
    stdoutSha256: sha256(result.stdout),
    stderrSha256: sha256(result.stderr),
    blockers,
  };
  write_json(output, probe);
  process.stdout.write(`${output}: ${outcome}\n`);
  if (outcome === "failed") process.exitCode = 1;
}

function read_gate_manifest(
  path: string,
  expected_gate: "formula" | "render",
): GateCaptureManifest {
  const manifest = JSON.parse(readFileSync(path, "utf8")) as GateCaptureManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.protocol !== "wasm-post-link-gate-capture-v1" ||
    manifest.gate !== expected_gate ||
    !Array.isArray(manifest.captures)
  ) {
    throw new Error(`${expected_gate} gate manifest has the wrong protocol or gate kind`);
  }
  const modes = manifest.captures.map(({ wasmOpt: wasm_opt }) => wasm_opt);
  if (
    modes.length !== WASM_OPT_PROFILES.length ||
    new Set(modes).size !== WASM_OPT_PROFILES.length ||
    !WASM_OPT_PROFILES.every((profile) => modes.includes(profile))
  ) {
    throw new Error(`${expected_gate} gate manifest must capture -O3, -Os, and -Oz exactly once`);
  }
  return manifest;
}

function assert_capture_files(
  build: BuildCapture,
  manifests: readonly GateCaptureManifest[],
): void {
  for (const variant of build.variants) {
    const actual = sha256(readFileSync(resolve(ROOT, variant.artifactPath)));
    if (actual !== variant.artifact.sha256) {
      throw new Error(`${variant.wasmOpt} build artifact hash no longer matches its capture`);
    }
  }
  for (const manifest of manifests) {
    for (const capture of manifest.captures) {
      const actual = sha256(readFileSync(resolve(ROOT, capture.artifactPath)));
      if (actual !== capture.evidenceSha256) {
        throw new Error(
          `${manifest.gate}/${capture.wasmOpt} evidence hash does not match its file`,
        );
      }
    }
  }
}

function assemble(args: readonly string[]): void {
  const build = JSON.parse(
    readFileSync(resolve(requiredOption(args, "--build")), "utf8"),
  ) as BuildCapture;
  if (
    build.schemaVersion !== 1 ||
    build.protocol !== "wasm-post-link-build-capture-v1" ||
    !Array.isArray(build.variants)
  ) {
    throw new Error("build input is not a WASM post-link build capture");
  }
  const formula = read_gate_manifest(resolve(requiredOption(args, "--formula-gates")), "formula");
  const render = read_gate_manifest(resolve(requiredOption(args, "--render-gates")), "render");
  const store_only_probe = JSON.parse(
    readFileSync(resolve(requiredOption(args, "--store-probe")), "utf8"),
  ) as StoreOnlyProbe;
  if (
    store_only_probe.provenance.dirty !== false ||
    store_only_probe.provenance.commit !== build.provenance.commit
  ) {
    throw new Error("store-only probe must come from the clean build capture commit");
  }
  assert_capture_files(build, [formula, render]);
  const formula_by_profile = new Map(formula.captures.map((capture) => [capture.wasmOpt, capture]));
  const render_by_profile = new Map(render.captures.map((capture) => [capture.wasmOpt, capture]));
  const matrix = {
    schemaVersion: 1,
    protocol: "wasm-post-link-profile-matrix-v1",
    provenance: build.provenance,
    rustProfile: build.rustProfile,
    postLink: build.postLink,
    decisionPolicy: {
      sizeMetric: "brotliBytes",
      requireFormulaGate: true,
      requireRenderGate: true,
    },
    captureOrder: {
      formula: formula.captures.map(({ wasmOpt: wasm_opt }) => wasm_opt),
      render: render.captures.map(({ wasmOpt: wasm_opt }) => wasm_opt),
    },
    variants: build.variants.map((variant) => {
      const formula_capture = formula_by_profile.get(variant.wasmOpt);
      const render_capture = render_by_profile.get(variant.wasmOpt);
      if (!formula_capture || !render_capture) {
        throw new Error(`${variant.wasmOpt} is missing gate evidence`);
      }
      const formula_gate = gate_evidence(formula_capture);
      const render_gate = gate_evidence(render_capture);
      return {
        wasmOpt: variant.wasmOpt,
        inputWasmSha256: variant.inputWasmSha256,
        artifact: variant.artifact,
        formulaGate: formula_gate,
        renderGate: render_gate,
      };
    }),
    storeOnlyProbe: store_only_probe,
  };
  const parsed = parseWasmProfileMatrix(matrix);
  const output = resolve(requiredOption(args, "--output"));
  write_json(output, parsed);
  const decision = decideWasmProfile(parsed);
  process.stdout.write(`${output}\n${JSON.stringify(decision, null, 2)}\n`);
  if (decision.status === "blocked") process.exitCode = 1;
}

function decide(args: readonly string[]): void {
  const input = resolve(requiredOption(args, "--input"));
  const raw = JSON.parse(readFileSync(input, "utf8")) as unknown;
  const evidence = parseWasmProfileMatrix(raw);
  const decision = decideWasmProfile(evidence);
  const output = optionValue(args, "--output");
  if (output) write_json(resolve(output), decision);
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
  if (decision.status === "blocked") process.exitCode = 1;
}

const [command, ...args] = process.argv.slice(2);
if (command === "build") capture_build(args);
else if (command === "probe-store") capture_store_only_probe(args);
else if (command === "assemble") assemble(args);
else if (command === "decide") decide(args);
else {
  throw new Error(
    `usage:\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} build --wasm-opt PATH --output PATH\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} probe-store --output PATH\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} assemble --build PATH --formula-gates PATH --render-gates PATH --store-probe PATH --output PATH\n  ${basename(process.argv[1] ?? "wasm-profile-matrix.ts")} decide --input PATH [--output PATH]`,
  );
}
