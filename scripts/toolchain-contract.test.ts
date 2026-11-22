import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";

import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import { parseWorkflowContract } from "./workflow-contract.js";
import {
  CARGO_AUDIT_VERSION,
  CARGO_LLVM_COV_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

const root = resolve(import.meta.dir, "..");
const package_manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  readonly engines?: Readonly<Record<string, string>>;
};
const rust_toolchain = readFileSync(resolve(root, "rust-toolchain.toml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
const workflow_env = parseWorkflowContract(workflow, "CI workflow").env ?? {};
const node_version = readFileSync(resolve(root, ".node-version"), "utf8").trim();
const size_report = JSON.parse(readFileSync(resolve(root, "scripts/size-report.json"), "utf8")) as {
  readonly toolchain?: Readonly<Record<string, string>>;
};

describe("contributor and CI toolchain contract", () => {
  it("pins Node and npm as exact release inputs", () => {
    expect(node_version).toBe(NODE_VERSION);
    // Consumer engines and the exact CI/dev runtime are separate contracts.
    expect(package_manifest.engines?.node).toBe("24.22.1");
    expect(workflow_env.NODE_VERSION).toBe(NODE_VERSION);
    expect(workflow_env.NPM_VERSION).toBe(NPM_VERSION);
    expect(size_report.toolchain?.node).toBe(NODE_VERSION);
    expect(size_report.toolchain?.npm).toBe(NPM_VERSION);
  });

  it("rejects the invalid Brotli block switch from CVE-2026-111497", () => {
    // Public Node/Bun regression input; the vulnerable decoder reports -9.
    const invalid = Buffer.from("200010414141fcffff07002228f00b60f7f41f000000", "hex");
    expect(() => brotliDecompressSync(invalid)).toThrow(
      expect.objectContaining({ code: "ERR__ERROR_FORMAT_BLOCK_SWITCH", errno: -17 }),
    );
  });

  it("pins Rust, its WASM target, wasm-pack, cargo-audit, and coverage tooling", () => {
    expect(rust_toolchain).toContain(`channel = "${RUST_VERSION}"`);
    expect(rust_toolchain).toContain('components = ["clippy", "rustfmt", "llvm-tools-preview"]');
    expect(rust_toolchain).toContain(`targets = ["${WASM_TARGET}"]`);
    expect(workflow_env).toMatchObject({
      RUST_VERSION,
      WASM_TARGET,
      WASM_PACK_VERSION,
      CARGO_AUDIT_VERSION,
      CARGO_LLVM_COV_VERSION,
    });
    // CI installs no tool by piping a download into a shell.
    expect(workflow).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/);
  });

  it("versions the engine crate with the npm engine packages", () => {
    // Changesets edits only package.json; changeset:version copies the version into the crate.
    const version_of = (name: string): string =>
      (
        JSON.parse(readFileSync(resolve(root, `packages/${name}/package.json`), "utf8")) as {
          version: string;
        }
      ).version;
    const crate_entry = `name = "sheetwrite-wasm"\nversion = "${version_of("wasm")}"`;
    expect(version_of("formulas")).toBe(version_of("wasm"));
    expect(readFileSync(resolve(root, "packages/wasm/Cargo.toml"), "utf8")).toContain(crate_entry);
    expect(readFileSync(resolve(root, "packages/wasm/Cargo.lock"), "utf8")).toContain(crate_entry);
  });
});
