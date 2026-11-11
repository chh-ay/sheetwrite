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
const rustToolchain = Bun.TOML.parse(readFileSync(resolve(root, "rust-toolchain.toml"), "utf8")) as {
  readonly toolchain?: Readonly<Record<string, unknown>>;
};
const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
const workflowEnv = parseWorkflowContract(workflow, "CI workflow").env ?? {};
const nodeVersion = readFileSync(resolve(root, ".node-version"), "utf8").trim();
const sizeReport = JSON.parse(readFileSync(resolve(root, "scripts/size-report.json"), "utf8")) as {
  readonly toolchain?: Readonly<Record<string, string>>;
};

describe("contributor and CI toolchain contract", () => {
  it("pins Node and npm as exact release inputs", () => {
    expect(nodeVersion).toBe(NODE_VERSION);
    expect(workflowEnv.NODE_VERSION).toBe(NODE_VERSION);
    expect(workflowEnv.NPM_VERSION).toBe(NPM_VERSION);
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
    expect(rustToolchain.toolchain).toMatchObject({
      channel: RUST_VERSION,
      components: expect.arrayContaining(["clippy", "rustfmt", "llvm-tools-preview"]),
      targets: [WASM_TARGET],
    });
    expect(workflowEnv).toMatchObject({
      RUST_VERSION,
      WASM_TARGET,
      WASM_PACK_VERSION,
      CARGO_AUDIT_VERSION,
      CARGO_LLVM_COV_VERSION,
    });
    // CI installs no tool by piping a download into a shell.
    expect(workflow).not.toMatch(/curl[^\n]*\|\s*(?:ba)?sh/);
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
