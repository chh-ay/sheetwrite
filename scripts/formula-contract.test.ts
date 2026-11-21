import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validateFormulaContractRepository } from "./formula-contract.js";

const ROOT = resolve(import.meta.dir, "..");
const INVENTORY = JSON.parse(
  readFileSync(resolve(ROOT, "test/conformance/formula-contract.inventory.json"), "utf8"),
) as MutableContract;

/** Every spelling (canonical name and aliases) of the functions in one build. */
function spellingsIn(build: string): Set<string> {
  return new Set(
    INVENTORY.functions
      .filter((entry) => entry.builds.includes(build))
      .flatMap((entry) => [entry.canonical, ...entry.aliases]),
  );
}

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

const MUTATIONS: [string, (contract: MutableContract) => void, string][] = [
  [
    "rejects insecure public source links",
    (contract) => {
      const source = contract.sources["microsoft-excel-functions"];
      if (source) source.link = "http://example.invalid/functions";
    },
    "string does not match ^https://",
  ],
  [
    "pins LET as required-supported",
    (contract) => {
      const letEntry = contract.functions.find((entry) => entry.canonical === "LET");
      if (letEntry) letEntry.contractStatus = "supported";
    },
    "LET must remain required-supported",
  ],
  [
    "rejects repository-escaping evidence paths",
    (contract) => {
      const profile = contract.implementationProfiles["implemented-assisted"];
      const evidence = profile?.evidence as Record<string, unknown> | undefined;
      if (evidence) evidence.paths = ["../outside"];
    },
    "string does not match ^(packages|test|scripts)/",
  ],
  [
    "rejects moving an optional distribution into the default build",
    (contract) => {
      const formula = contract.functions.find((entry) => entry.canonical === "NORM.DIST");
      if (formula) formula.builds.push("@sheetwrite/wasm");
    },
    "parser/inventory drift: missing NORM.DIST",
  ],
  [
    "rejects a built function that formula help would not list",
    (contract) => {
      const formula = contract.functions.find((entry) => entry.canonical === "POW");
      if (formula) formula.implementation = "parser-declared-target";
    },
    "assist/inventory drift: missing POW",
  ],
];

describe("formula capability contract", () => {
  test("validates the checked-in schema, inventory, parser, assist, and evidence paths", async () => {
    const result = await validateFormulaContractRepository(ROOT);
    expect(result.issues).toEqual([]);
    // Counts come from the inventory, so pull requests that add different
    // functions do not edit the same lines here.
    const parserSpellings = spellingsIn("@sheetwrite/wasm");
    const formulasSpellings = spellingsIn("@sheetwrite/formulas");
    expect(result.summary).toEqual({
      functions: INVENTORY.functions.length,
      requiredSupported: 100,
      unsupportedCategories: INVENTORY.unsupportedCategories.length,
      parserSpellings: parserSpellings.size,
      assistSpellings: new Set([...parserSpellings, ...formulasSpellings]).size,
      formulasSpellings: formulasSpellings.size,
    });
  });

  test.each(MUTATIONS)("%s", async (_name, mutate, expectedIssue) => {
    const candidate = structuredClone(INVENTORY);
    mutate(candidate);
    const result = await validateFormulaContractRepository(ROOT, candidate);
    expect(result.issues).toContainEqual(expect.stringContaining(expectedIssue));
  });

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
