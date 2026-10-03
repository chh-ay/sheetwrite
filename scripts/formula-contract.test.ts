import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractAssistSpellings, validateFormulaContractRepository } from "./formula-contract.js";
import { renderFormulaFunctionContract } from "./formula-docs.js";

const ROOT = resolve(import.meta.dir, "..");
const INVENTORY = JSON.parse(
  readFileSync(resolve(ROOT, "test/conformance/formula-contract.inventory.json"), "utf8"),
) as MutableContract;

interface MutableFunction {
  canonical: string;
  aliases: string[];
  family: string;
  contractStatus: string;
  builds: string[];
  signature: string;
  semantics: string;
  dialects: string;
  implementation: string;
  version: number;
  [key: string]: unknown;
}

interface MutableContract {
  version: number;
  parserRules: Record<string, unknown>;
  sources: Record<string, Record<string, unknown>>;
  families: Record<string, Record<string, unknown>>;
  signatureProfiles: Record<string, Record<string, unknown>>;
  semanticsProfiles: Record<string, Record<string, unknown>>;
  dialectProfiles: Record<string, Record<string, unknown>>;
  implementationProfiles: Record<string, Record<string, unknown>>;
  unsupportedCategories: Array<Record<string, unknown>>;
  functions: MutableFunction[];
  [key: string]: unknown;
}

interface MutationCase {
  name: string;
  mutate: (contract: MutableContract) => void;
  expectedIssue: string;
}

const MUTATIONS: MutationCase[] = [
  {
    name: "rejects an unknown top-level field",
    mutate: (contract) => {
      contract.unreviewedCapability = true;
    },
    expectedIssue: "contract.unreviewedCapability: unknown field",
  },
  {
    name: "rejects a version outside the closed protocol",
    mutate: (contract) => {
      contract.version = 2;
    },
    expectedIssue: "contract.version: expected constant 1",
  },
  {
    name: "rejects insecure public source links",
    mutate: (contract) => {
      const source = contract.sources["microsoft-excel-functions"];
      if (source) source.link = "http://example.invalid/functions";
    },
    expectedIssue: "string does not match ^https://",
  },
  {
    name: "pins LET as required-supported",
    mutate: (contract) => {
      const letEntry = contract.functions.find((entry) => entry.canonical === "LET");
      if (letEntry) letEntry.contractStatus = "supported";
    },
    expectedIssue: "LET must remain required-supported",
  },
  {
    name: "rejects repository-escaping evidence paths",
    mutate: (contract) => {
      const profile = contract.implementationProfiles["implemented-assisted"];
      const evidence = profile?.evidence as Record<string, unknown> | undefined;
      if (evidence) evidence.paths = ["../outside"];
    },
    expectedIssue: "string does not match ^(packages|test|scripts)/",
  },
  {
    name: "rejects an unrecognized engine build",
    mutate: (contract) => {
      const formula = contract.functions.find((entry) => entry.canonical === "NORM.DIST");
      if (formula) formula.builds = ["@sheetwrite/unknown"];
    },
    expectedIssue: "value is outside the closed enum",
  },
  {
    name: "rejects moving an optional distribution into the default build",
    mutate: (contract) => {
      const formula = contract.functions.find((entry) => entry.canonical === "NORM.DIST");
      if (formula) formula.builds.push("@sheetwrite/wasm");
    },
    expectedIssue: "parser/inventory drift: missing NORM.DIST",
  },
];

describe("formula capability contract", () => {
  test("validates the checked-in schema, inventory, parser, assist, and evidence paths", async () => {
    const result = await validateFormulaContractRepository(ROOT);
    expect(result.issues).toEqual([]);
    expect(result.summary).toEqual({
      functions: 190,
      requiredSupported: 100,
      unsupportedCategories: 7,
      parserSpellings: 156,
      assistSpellings: 156,
      formulasSpellings: 192,
    });
  });

  test("publishes default and optional package availability in generated function rows", () => {
    const document = renderFormulaFunctionContract(INVENTORY);
    const rows = document.split("\n");
    const defaultRow = rows.find((row) => row.startsWith("| `SUM` |"));
    const optionalRow = rows.find((row) => row.startsWith("| `NORM.DIST` |"));
    expect(defaultRow).toContain("`@sheetwrite/wasm`, `@sheetwrite/formulas`");
    expect(optionalRow).toContain("`@sheetwrite/formulas`");
    expect(optionalRow).not.toContain("@sheetwrite/wasm");
    expect(optionalRow).toContain("optional analysis");
  });

  test("extracts only literal assist registry entries", () => {
    const source = `
      export const FORMULA_FUNCTIONS: readonly string[] = [
        "AVERAGE",
        "MODE.SNGL",
      ];
    `;
    expect(extractAssistSpellings(source)).toEqual(["AVERAGE", "MODE.SNGL"]);
    expect(() =>
      extractAssistSpellings(`
        export const FORMULA_FUNCTIONS: readonly string[] = [
          "SUM",
          injectedName,
        ];
      `),
    ).toThrow("non-literal entries");
  });

  for (const mutation of MUTATIONS) {
    test(mutation.name, async () => {
      const candidate = structuredClone(INVENTORY);
      mutation.mutate(candidate);
      const result = await validateFormulaContractRepository(ROOT, candidate);
      expect(result.issues.some((issue) => issue.includes(mutation.expectedIssue))).toBe(true);
    });
  }

  // Engine selection is process-global; isolation protects both initialization
  // paths from whichever package another test initialized first.
  for (const build of ["@sheetwrite/wasm", "@sheetwrite/formulas"]) {
    test(`evaluates distributions and gates autocomplete with ${build}`, async () => {
      const probe = Bun.spawn(
        [
          process.execPath,
          "--preload",
          resolve(ROOT, "test-setup.ts"),
          resolve(ROOT, "scripts/formula-contract-probe.ts"),
          build,
        ],
        { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(probe.stdout).text(),
        new Response(probe.stderr).text(),
        probe.exited,
      ]);
      expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
      expect(stdout).toContain(`${build}: distribution evaluation and assist contract passed`);
    });
  }
});
