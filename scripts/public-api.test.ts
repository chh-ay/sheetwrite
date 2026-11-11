import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  baselineFromManifest,
  checkPublicApiBaseline,
  readPublicApiBaseline,
  writePublicApiBaseline,
} from "./public-api-baseline.js";
import { analyzePublicApi } from "./public-api.js";

const roots: string[] = [];

const canonicalDeclarations = `
/** Canonical document operation. */
export type DocumentOp = { op: "set" };
/** Cancellable host datasource contract. */
export interface DataSource { getRows(request: unknown): Promise<unknown>; }
/** Committed grid change payload. */
export interface ChangeEvent {
  /** Committed transaction body. */
  transaction: { patches: DocumentOp[] };
}
/** Low-level transaction store. */
export interface Store {
  /** Applies one transaction. */
  applyTransaction(tx: { patches: DocumentOp[] }): void;
}
/** Optional table export backend. */
export interface XlsxTableExportBackend { toXlsxTable(): Promise<Uint8Array>; }
/** Optional table import backend. */
export interface XlsxTableImportBackend { fromXlsxTable(): Promise<unknown>; }
/** Optional workbook backend. */
export interface XlsxWorkbookBackend { toXlsxWorkbook(): Promise<Uint8Array>; }
/** Exports a table through the registered backend. */
export declare function toXlsxTable(): Promise<Uint8Array>;
/** Imports a table through the registered backend. */
export declare function fromXlsxTable(): Promise<unknown>;
/** Optional package installed by initSheetwrite. */
export interface SheetwriteAddon { name: string; setup(context: unknown): void; }
/** Loads the engine and installs add-ons. */
export declare function initSheetwrite(options?: { addons?: SheetwriteAddon[] }): Promise<void>;
/** Exports a workbook through the registered backend. */
export declare function toXlsxWorkbook(): Promise<Uint8Array>;
/** Imports a workbook through the registered backend. */
export declare function fromXlsxWorkbook(): Promise<unknown>;
/** Generic public fixture type. */
export interface Box<T extends string = string> { value: T; }
`;

async function fixture(
  index = canonicalDeclarations,
  extraFiles?: Record<string, string>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-api-policy-"));
  roots.push(root);
  const packageRoot = join(root, "packages/core");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["packages/*"] }),
  );
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@sheetwrite/core",
      types: "./index.d.ts",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
    }),
  );
  await writeFile(join(packageRoot, "index.d.ts"), index);
  for (const [name, content] of Object.entries(extraFiles ?? {})) {
    const path = join(packageRoot, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("re-export documentation", () => {
  it("keeps interface kind, signature, and member docs through re-exports", async () => {
    const root = await fixture(
      `${canonicalDeclarations}\nexport * from "./generated.js";\n/** Instantiated module exports. */\nexport type { GeneratedOutput } from "./generated.js";\nexport type { ExternalService } from "framework";\n`,
      {
        "generated.d.ts":
          "export interface GeneratedOutput {\n  /** Shared linear memory. */\n  readonly memory: object;\n}\n",
        "node_modules/framework/package.json": JSON.stringify({
          name: "framework",
          types: "./index.d.ts",
        }),
        "node_modules/framework/index.d.ts": [
          "/** Upstream service.",
          " * @see https://example.com/upstream",
          " */",
          "export interface ExternalService {",
          "  /** Upstream property.",
          "   * @see https://example.com/property",
          "   */",
          "  value: string;",
          "}",
        ].join("\n"),
      },
    );
    const { manifest } = await analyzePublicApi(root);
    const entry = manifest.packages[0]?.entryPoints[0];
    const generated = entry?.exports.find((candidate) => candidate.name === "GeneratedOutput");
    expect(generated?.kind).toBe("interface");
    expect(generated?.documentation).toBe("Instantiated module exports.");
    expect(generated?.signature).toContain("readonly memory: object;");
    expect(generated?.memberDocs).toEqual([
      { name: "memory", documentation: "Shared linear memory." },
    ]);
    const external = entry?.exports.find((candidate) => candidate.name === "ExternalService");
    expect(external?.documentation).toBe("Upstream service.");
    expect(external?.memberDocs).toEqual([{ name: "value", documentation: "Upstream property." }]);
  });

  it("preserves example and see tags for symbols and their members", async () => {
    const tagged = [
      "/** A documented service.",
      " * @example",
      " * ```ts",
      " * const service = new Service();",
      " * ```",
      " * @see {@link DataSource | Load data}",
      " * @see DataSource",
      " */",
      "export declare class Service {",
      "  /** Run the service.",
      "   * @example",
      "   * ```ts",
      "   * service.run();",
      "   * ```",
      "   * @see https://example.com/run",
      "   */",
      "  run(): void;",
      "}",
    ].join("\n");
    const { manifest } = await analyzePublicApi(
      await fixture(`${canonicalDeclarations}\n${tagged}`),
    );
    const service = manifest.packages[0]?.entryPoints[0]?.exports.find(
      (candidate) => candidate.name === "Service",
    );
    expect(service?.documentation).toContain(
      "@example\n```ts\nconst service = new Service();\n```",
    );
    expect(service?.documentation).toContain("@see\n{@link DataSource | Load data}");
    expect(service?.documentation).toContain("@see\nDataSource");
    expect(service?.memberDocs).toContainEqual({
      name: "run",
      documentation:
        "Run the service.\n@example\n```ts\nservice.run();\n```\n@see\nhttps://example.com/run",
    });
  });
});
describe("interface heritage flattening", () => {
  it("inlines repository-owned base members and keeps dependency bases as heritage", async () => {
    const root = await fixture(
      `import type { ExternalBase } from "framework";
${canonicalDeclarations}
/** Framework-neutral readiness callbacks shared by adapters. */
export interface OwnedHandlers {
  /** Fires after readiness. */
  onReady?: () => void;
}
/** Advanced adapter props. */
export interface AdapterProps extends OwnedHandlers, ExternalBase {
  /** Local sizing knob. */
  height?: number;
}
`,
      {
        "node_modules/framework/package.json": JSON.stringify({
          name: "framework",
          types: "./index.d.ts",
        }),
        "node_modules/framework/index.d.ts":
          "export interface ExternalBase { tabIndex?: number; hidden?: boolean; }\n",
      },
    );
    const { manifest } = await analyzePublicApi(root);
    const entry = manifest.packages[0]?.entryPoints[0];
    const props = entry?.exports.find((candidate) => candidate.name === "AdapterProps");
    expect(props?.signature).toContain("height?: number;");
    expect(props?.signature).toContain("onReady?: () => void;");
    expect(props?.signature).toContain("extends ExternalBase");
    expect(props?.signature).not.toContain("OwnedHandlers");
    expect(props?.signature).not.toContain("tabIndex");
    expect(props?.signature).not.toContain("hidden");
    expect(props?.memberDocs).toContainEqual({
      name: "onReady",
      documentation: "Fires after readiness.",
    });
  });
});
describe("public API policy", () => {
  it("rejects untyped error payloads, Error subclasses and ambiguous re-exports", async () => {
    const root = await fixture(
      `${canonicalDeclarations}
/** Untyped operational failure. */
export interface OperationalFailure { error: unknown; }
/** Non-canonical public exception. */
export class LegacyFailure extends RangeError {}
export * from "./left.js";
export * from "./right.js";`,
      {
        "left.d.ts": "export interface Duplicate { left: true }\n",
        "right.d.ts": "export interface Duplicate { right: true }\n",
      },
    );
    const { issues } = await analyzePublicApi(root);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unstable-error-contract", symbol: "OperationalFailure" }),
        expect.objectContaining({ code: "unstable-error-contract", symbol: "LegacyFailure" }),
        expect.objectContaining({ code: "duplicate-export" }),
      ]),
    );
  });

  it("writes one export and signature digest per line and reads them back", async () => {
    const root = await fixture();
    const { manifest } = await analyzePublicApi(root);
    await mkdir(join(root, "scripts"), { recursive: true });
    const written = await writePublicApiBaseline(root, manifest);

    expect(written).toEqual(baselineFromManifest(manifest));
    expect(await readPublicApiBaseline(root)).toEqual(written);
    const text = await readFile(join(root, "scripts/public-api-baseline.json"), "utf8");
    for (const name of ["DataSource", "DocumentOp", "toXlsxTable"]) {
      expect(text).toMatch(
        new RegExp(`\\n    "@sheetwrite/core#\\.#${name}": "[0-9a-f]{12}",?\\n`),
      );
    }
  });

  it("rejects malformed baselines and files that are not one export per line", async () => {
    const root = await fixture();
    const path = join(root, "scripts/public-api-baseline.json");
    await mkdir(join(root, "scripts"), { recursive: true });
    const exports = {
      "@sheetwrite/core#.#Box": "0123456789ab",
      "@sheetwrite/core#.#Store": "ba9876543210",
    };
    const baseline = { schemaVersion: 4, manifestFormatVersion: 2, exports };

    await writeFile(path, `${JSON.stringify({ ...baseline, schemaVersion: 3 }, null, 2)}\n`);
    await expect(readPublicApiBaseline(root)).rejects.toThrow(
      "Invalid public API baseline artifact",
    );
    const unsorted = {
      "@sheetwrite/core#.#Store": "ba9876543210",
      "@sheetwrite/core#.#Box": "0123456789ab",
    };
    await writeFile(path, `${JSON.stringify({ ...baseline, exports: unsorted }, null, 2)}\n`);
    await expect(readPublicApiBaseline(root)).rejects.toThrow("not sorted");
    await writeFile(path, `${JSON.stringify(baseline)}\n`);
    await expect(readPublicApiBaseline(root)).rejects.toThrow("not one export per line");
  });

  it("reports unlisted, removed and changed signatures but not documentation edits", async () => {
    const baseline = baselineFromManifest((await analyzePublicApi(await fixture())).manifest);
    const issuesAfter = async (from: string, to: string) =>
      checkPublicApiBaseline(
        (await analyzePublicApi(await fixture(canonicalDeclarations.replace(from, to)))).manifest,
        baseline,
      ).map((issue) => [issue.code, issue.symbol]);

    expect(await issuesAfter("interface DataSource", "interface DataProvider")).toEqual([
      ["unlisted-export", "DataProvider"],
      ["removed-export", "DataSource"],
    ]);
    for (const [from, to, symbol] of [
      ["getRows(request: unknown)", "getRows?(request: unknown)", "DataSource"],
      ['{ op: "set" };', '{ op: "set" } | { op: "clear" };', "DocumentOp"],
      ["Box<T extends string = string>", "Box<T extends string | number = string>", "Box"],
    ] as const) {
      expect(await issuesAfter(from, to)).toContainEqual(["changed-signature", symbol]);
    }
    expect(
      await issuesAfter(
        "/** Canonical document operation. */",
        "/** Changed document operation. */",
      ),
    ).toEqual([]);
  }, 20_000);
});
