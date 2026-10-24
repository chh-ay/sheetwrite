import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { brotliDecompressSync } from "node:zlib";

import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  CARGO_AUDIT_VERSION,
  CARGO_LLVM_COV_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

const root = resolve(import.meta.dir, "..");
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  readonly engines?: Readonly<Record<string, string>>;
};
const rustToolchain = readFileSync(resolve(root, "rust-toolchain.toml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
const nodeVersion = readFileSync(resolve(root, ".node-version"), "utf8").trim();
const WORKFLOW_NODE_VERSION = "$" + "{{ env.NODE_VERSION }}";
const sizeReport = JSON.parse(readFileSync(resolve(root, "scripts/size-report.json"), "utf8")) as {
  readonly toolchain?: Readonly<Record<string, string>>;
};

describe("contributor and CI toolchain contract", () => {
  it("pins Node and npm as exact release inputs", () => {
    expect(nodeVersion).toBe(NODE_VERSION);
    // Consumer engines and the exact CI/dev runtime are separate contracts.
    expect(packageManifest.engines?.node).toBe("24.22.1");
    expect(workflow).toContain(`NODE_VERSION: "${NODE_VERSION}"`);
    expect(workflow).toContain(`NPM_VERSION: "${NPM_VERSION}"`);
    expect(workflow).toContain(`node-version: ${WORKFLOW_NODE_VERSION}`);
    expect(workflow).toContain('npm install --global "npm@$NPM_VERSION"');
    expect(workflow).toContain('test "$(node --version)" = "v$NODE_VERSION"');
    expect(workflow).toContain('test "$(npm --version)" = "$NPM_VERSION"');
    expect(sizeReport.toolchain?.node).toBe(NODE_VERSION);
    expect(sizeReport.toolchain?.npm).toBe(NPM_VERSION);
  });

  it("rejects the invalid Brotli block switch from CVE-2026-111497", () => {
    // Public Node/Bun regression input; the vulnerable decoder reports -9.
    const invalid = Buffer.from("200010414141fcffff07002228f00b60f7f41f000000", "hex");
    expect(() => brotliDecompressSync(invalid)).toThrow(
      expect.objectContaining({ code: "ERR__ERROR_FORMAT_BLOCK_SWITCH", errno: -17 }),
    );
  });

  it("pins Rust, its WASM target, wasm-pack, cargo-audit, and coverage tooling", () => {
    expect(rustToolchain).toContain(`channel = "${RUST_VERSION}"`);
    expect(rustToolchain).toContain('components = ["clippy", "llvm-tools-preview"]');
    expect(rustToolchain).toContain(`targets = ["${WASM_TARGET}"]`);
    expect(workflow).toContain(`RUST_VERSION: "${RUST_VERSION}"`);
    expect(workflow).toContain(`WASM_TARGET: "${WASM_TARGET}"`);
    expect(workflow).toContain(`WASM_PACK_VERSION: "${WASM_PACK_VERSION}"`);
    expect(workflow).toContain(`CARGO_AUDIT_VERSION: "${CARGO_AUDIT_VERSION}"`);
    expect(workflow).toContain(`CARGO_LLVM_COV_VERSION: "${CARGO_LLVM_COV_VERSION}"`);
    expect(workflow).toContain(
      'cargo install cargo-llvm-cov --version "$CARGO_LLVM_COV_VERSION" --locked',
    );
    expect(workflow).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/);
    expect(workflow).not.toMatch(
      /(?:bun-version|NODE_VERSION|NPM_VERSION|RUST_VERSION|WASM_PACK_VERSION):\s*(?:latest|stable)\b/,
    );
  });

  it("runs browser smoke in the Playwright image of the locked test runner", () => {
    // A mismatched image ships browser builds the test runner cannot launch.
    const locked = /"@playwright\/test@(\d+\.\d+\.\d+)"/.exec(
      readFileSync(resolve(root, "bun.lock"), "utf8"),
    )?.[1];
    const images = [
      ...workflow.matchAll(/mcr\.microsoft\.com\/playwright:v([\d.]+)-noble@sha256:/g),
    ];
    expect(locked).toBeDefined();
    expect(images.map((match) => match[1])).toEqual([locked]);
  });

  it("versions the engine crate with the npm engine packages", () => {
    // Changesets edits only package.json; changeset:version copies the version into the crate.
    const versionOf = (name: string): string =>
      (
        JSON.parse(readFileSync(resolve(root, `packages/${name}/package.json`), "utf8")) as {
          version: string;
        }
      ).version;
    const crateEntry = `name = "sheetwrite-wasm"\nversion = "${versionOf("wasm")}"`;
    expect(versionOf("formulas")).toBe(versionOf("wasm"));
    expect(readFileSync(resolve(root, "packages/wasm/Cargo.toml"), "utf8")).toContain(crateEntry);
    expect(readFileSync(resolve(root, "packages/wasm/Cargo.lock"), "utf8")).toContain(crateEntry);
  });
});
