import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { auditEngineExports } from "./check-engine-exports.js";

test("engine caller audit resolves aliases, getters and structural callers but rejects dead or misnamed exports", async () => {
  const root = mkdtempSync(join(tmpdir(), "sheetwrite-engine-exports-"));
  const binding = "packages/wasm/pkg/sheetwrite_wasm.d.ts";
  const files = {
    [binding]: `
      export class CellStore {
        constructor();
        free(): void;
        write(): void;
        aliasWrite(): void;
        bracketWrite(): void;
        benchOnly(): void;
        setNumber(value: number): void;
        readonly rows: number;
        unused(): void;
        /** @enginePublic Hosts can query the allocator without a Sheetwrite wrapper. */
        allocatorStats(): void;
        /** @enginePublic */
        missingReason(): void;
      }
      export class UnusedStore { constructor(); }
      export class ReturnedBuffer { private constructor(); free(): void; }
      export function convert(): string;
      export function initSync(): void;
      export default function __wbg_init(): void;
    `,
    "packages/formulas/pkg/sheetwrite_wasm.d.ts": "export {};",
    "packages/wasm/pkg-history/sheetwrite_history.d.ts": "export {};",
    "packages/queries/pkg/sheetwrite_queries.d.ts": "export {};",
    "packages/wasm/src/lib.rs": `
      #[wasm_bindgen(js_name = convert)]
      pub fn convert() -> String { String::new() }
      #[wasm_bindgen]
      pub fn missing_name() {}
      #[wasm_bindgen]
      impl Store {
          #[wasm_bindgen(constructor)]
          pub fn new() -> Self { Self }
          /// A doc comment can sit between the attribute and function.
          #[wasm_bindgen(getter, js_name = rows)]
          #[must_use]
          pub fn rows(&self) -> u32 { let marker = "{"; 0 }
          #[allow(
              clippy::too_many_arguments,
              reason = "a multi-line attribute"
          )]
          #[wasm_bindgen(js_name = take_rows)]
          pub fn take_rows(&mut self) -> Vec<u32> { Vec::new() }
          pub(crate) fn private_helper(&self) {}
      }
    `,
    "packages/core/src/external-link.ts": `
      export interface ExternalLinkEngine { setNumber(value: number): void; }
      export function installLink(engine: ExternalLinkEngine) { engine.setNumber(12); }
    `,
    "packages/wasm/loader.d.ts": `export { CellStore, convert } from "./pkg/sheetwrite_wasm.js";`,
    "packages/client/src/caller.ts": `
      import { convert as convertFormula } from "../../wasm/loader.js";
      // Exercise the destructured lazy-loading boundary used by version history.
      const { CellStore } = await import("../../wasm/loader.js");
      const engine = new CellStore();
      engine.write();
      const { aliasWrite: writeAlias } = engine;
      writeAlias();
      engine["bracketWrite"]();
      const { rows } = engine;
      convertFormula();
      // engine.unused();
      const documentation = "engine.unused()";
      const unrelated = { unused() {} };
      unrelated.unused();
    `,
    "bench/src/caller.ts": `
      import { CellStore } from "../../packages/wasm/loader.js";
      new CellStore().benchOnly();
    `,
    "packages/client/dist/generated.js": "engine.unused(); engine.missingReason();",
    "test/contract.d.ts": "declare const ignored: { unused(): void };",
  };
  try {
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    const audit = await auditEngineExports(root);
    expect(audit.issues).toHaveLength(5);
    expect(audit.issues.join("\n")).toContain("CellStore.unused has no package/test/bench caller");
    expect(audit.issues.join("\n")).toContain(
      "CellStore.missingReason has no package/test/bench caller",
    );
    expect(audit.issues.join("\n")).toContain(
      "UnusedStore.constructor has no package/test/bench caller",
    );
    expect(audit.issues.join("\n")).toContain(
      "packages/wasm/src/lib.rs:5: exported Rust function needs a camelCase js_name",
    );
    expect(audit.issues.join("\n")).toContain(
      "packages/wasm/src/lib.rs:19: exported Rust function needs a camelCase js_name",
    );
    expect(
      audit.exports.find((entry) => entry.name === "CellStore.allocatorStats")?.publicReason,
    ).toBe("Hosts can query the allocator without a Sheetwrite wrapper.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
