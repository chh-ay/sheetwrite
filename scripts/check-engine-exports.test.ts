import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { auditEngineExports } from "./check-engine-exports.js";

test("engine caller audit resolves aliases, getters and structural callers but rejects dead exports", async () => {
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
    "packages/core/src/external-link.ts": `
    "packages/formulas/pkg/sheetwrite_wasm.d.ts": "export {};",
    "packages/wasm/pkg-history/sheetwrite_history.d.ts": "export {};",
    "packages/queries/pkg/sheetwrite_queries.d.ts": "export {};",
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
    expect(audit.issues).toHaveLength(3);
    expect(audit.issues.join("\n")).toContain("CellStore.unused has no package/test caller");
    expect(audit.issues.join("\n")).toContain("CellStore.missingReason has no package/test caller");
    expect(audit.issues.join("\n")).toContain("UnusedStore.constructor has no package/test caller");
    expect(audit.exports.find((entry) => entry.name === "CellStore.allocatorStats")?.publicReason)
      .toBe("Hosts can query the allocator without a Sheetwrite wrapper.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
