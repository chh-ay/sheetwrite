import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type ConformanceCorpus,
  type ConformanceManifest,
  canonicalJson,
  compareResults,
  compatibilityCheckSummary,
  type FormulaInventory,
  generatedConformanceEvidence,
  loadCorpus,
  readFormulaInventory,
  runOffline,
  runSheetwriteCase,
  sha256,
  sha256Bytes,
  validateCorpus,
  validateExcelCapture,
  validateResult,
  verifyCaptureArtifacts,
} from "./conformance.js";

const [{ manifest: CHECKED_MANIFEST }, CHECKED_INVENTORY, CORPUS] = await Promise.all([
  generatedConformanceEvidence(),
  readFormulaInventory(),
  loadCorpus(),
]);
const NO_ARTIFACTS = new Set<string>();

function clone(corpus: ConformanceCorpus): ConformanceCorpus {
  return structuredClone(corpus);
}

function expectIssue(issues: readonly string[], text: string): void {
  expect(issues).toContainEqual(expect.stringContaining(text));
}

function validateCorpusChecked(
  corpus: ConformanceCorpus,
  verifiedArtifacts: ReadonlySet<string> = NO_ARTIFACTS,
  manifest: ConformanceManifest = CHECKED_MANIFEST,
  inventory: FormulaInventory = CHECKED_INVENTORY,
): string[] {
  return validateCorpus(corpus, manifest, inventory, verifiedArtifacts);
}

describe("neutral conformance corpus", () => {
  it("rejects formula padding and proves the direct category result path", async () => {
    const corpus = clone(CORPUS);
    const direct = corpus.cases.find(
      (entry) =>
        entry.id === "formula.function.abs.empty.1" && entry.formula?.includes("ABS(C1)=0"),
    );
    const alternate = corpus.cases.find((entry) => entry.id === "formula.function.abs.empty.2");
    expect(direct).toBeDefined();
    expect(alternate).toBeDefined();

    const missingConsumption = clone(corpus);
    const missing = missingConsumption.cases.find((entry) => entry.id === direct!.id)!;
    missing.formula = missing.formula!.replace("ABS(C1)=0", "ABS(0)=0");
    expectIssue(validateCorpusChecked(missingConsumption), "category input is not consumed");

    const duplicate = clone(corpus);
    const duplicateAlternate = duplicate.cases.find((entry) => entry.id === alternate!.id)!;
    duplicateAlternate.formula = direct!.formula;
    expectIssue(validateCorpusChecked(duplicate), "duplicate canonical subject/category formula");

    expect(compareResults(direct!.expected, await runSheetwriteCase(direct!))).toEqual([]);
    const wrongResultPath = structuredClone(direct!);
    wrongResultPath.formula = wrongResultPath.formula!.replace("ABS(C1)=0", "ABS(C1)=1");
    expect(
      compareResults(wrongResultPath.expected, await runSheetwriteCase(wrongResultPath)),
    ).not.toEqual([]);
    const representativeSubjects = new Map<string, (typeof corpus.cases)[number]>();
    for (const entry of corpus.cases) {
      if (
        entry.category === "normal" &&
        entry.localCanary !== true &&
        entry.subject &&
        !representativeSubjects.has(`${entry.subject.kind}:${entry.subject.name}`)
      ) {
        representativeSubjects.set(`${entry.subject.kind}:${entry.subject.name}`, entry);
      }
    }
    expect(representativeSubjects.size).toBe(
      CHECKED_INVENTORY.functions.length + CHECKED_INVENTORY.operators.length,
    );
    const falsePasses: string[] = [];
    for (const entry of representativeSubjects.values()) {
      const altered = structuredClone(entry);
      altered.formula =
        entry.subject!.kind === "function"
          ? altered.formula!.replace(
              `${entry.subject!.name}(`,
              entry.subject!.name === "NA" ? "TRUE(" : "NA(",
            )
          : "=NA()";
      if (compareResults(altered.expected, await runSheetwriteCase(altered)).length === 0) {
        falsePasses.push(entry.id);
      }
    }
    expect(falsePasses).toEqual([]);
  });

  it("rejects missing producer versions, artifact checksums, and secret-like content", async () => {
    const corpus = clone(CORPUS);
    const observation = clone(corpus);
    observation.cases[0]!.observations.push({
      producer: "excel-web",
      producerVersion: "",
      capturedAt: "2026-07-22T00:00:00.000Z",
      status: "reviewed",
      result: { type: "number", value: 2 },
    });
    const observationIssues = validateCorpusChecked(observation);
    expectIssue(observationIssues, "producerVersion");
    expectIssue(observationIssues, "artifactSha256");

    const secret = clone(corpus) as ConformanceCorpus & { clientSecret?: string };
    secret.clientSecret = "not-committable";
    expectIssue(validateCorpusChecked(secret), "secret-like field name");
  });

  it("binds reviewed observations to exact immutable capture bytes", async () => {
    const corpus = clone(CORPUS);
    const capturedAt = "2026-07-22T00:00:00.000Z";
    const artifact = {
      protocol: 1,
      producer: "excel-web",
      producerVersion: "16.0.19029.20136",
      capturedAt,
      observations: [{ caseId: corpus.cases[0]!.id, result: corpus.cases[0]!.expected }],
    };
    const bytes = new TextEncoder().encode(`${canonicalJson(artifact)}\n`);
    const hash = sha256Bytes(bytes);
    corpus.cases[0]!.observations.push({
      producer: "excel-web",
      producerVersion: artifact.producerVersion,
      capturedAt,
      status: "reviewed",
      result: corpus.cases[0]!.expected,
      artifactSha256: hash,
    });
    expectIssue(validateCorpusChecked(corpus), "no verified immutable capture binding");

    const directory = await mkdtemp(join(tmpdir(), "sheetwrite-capture-"));
    try {
      await writeFile(join(directory, `${hash}.json`), bytes);
      const verified = await verifyCaptureArtifacts(corpus, directory);
      expect(verified.issues).toEqual([]);
      const verifiedIssues = validateCorpusChecked(corpus, verified.verified);
      expect(verifiedIssues).not.toContainEqual(
        expect.stringContaining("no verified immutable capture binding"),
      );
      expectIssue(verifiedIssues, "deterministic generator output drift");

      // Different bytes stored under the bound hash name are not verified.
      const tampered = new TextEncoder().encode(
        `${canonicalJson({ ...artifact, producerVersion: "16.0.0.0" })}\n`,
      );
      await writeFile(join(directory, `${hash}.json`), tampered);
      const forged = await verifyCaptureArtifacts(corpus, directory);
      expect(forged.issues.length).toBeGreaterThan(0);
      expect(forged.verified.size).toBe(0);
      await writeFile(join(directory, `${hash}.json`), bytes);

      corpus.cases[0]!.observations[0]!.result = { type: "number", value: 3 };
      const drifted = await verifyCaptureArtifacts(corpus, directory);
      expectIssue(drifted.issues, "does not bind reviewed observation");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects fake producer observations, checksum and denominator drift", async () => {
    const corpus = clone(CORPUS);
    const altered = clone(corpus);
    altered.cases[0]!.expected = { type: "number", value: 3 };
    const forgedManifest = structuredClone(CHECKED_MANIFEST);
    forgedManifest.corpusSha256 = sha256(altered);
    forgedManifest.caseSha256[0] = sha256(altered.cases[0]!);
    const alteredIssues = validateCorpusChecked(altered, NO_ARTIFACTS, forgedManifest);
    expectIssue(alteredIssues, "deterministic generator output drift");
    expectIssue(alteredIssues, "deterministic generator binding drift");

    const checksumDrift = structuredClone(CHECKED_MANIFEST);
    checksumDrift.caseSha256[0] = "0".repeat(64);
    expectIssue(
      validateCorpusChecked(corpus, NO_ARTIFACTS, checksumDrift),
      "altered record or unstable checksum",
    );

    const fake = clone(corpus);
    const fakeHash = "a".repeat(64);
    fake.cases[0]!.source.authorship = "producer-observation";
    fake.cases[0]!.evidence = {
      kind: "pinned-observation",
      basis: "producer-observation",
      oracle: "Unverified local claim",
    };
    fake.cases[0]!.observations.push({
      producer: "sheetwrite",
      producerVersion: "local",
      capturedAt: "2026-07-22T00:00:00.000Z",
      status: "reviewed",
      result: fake.cases[0]!.expected,
      artifactSha256: fakeHash,
    });
    expectIssue(
      validateCorpusChecked(fake, new Set([fakeHash])),
      "requires a verified reviewed external capture",
    );

    const denominatorDrift = structuredClone(CHECKED_MANIFEST);
    Object.assign(denominatorDrift.minimums, { formula: 1999 });
    Object.assign(denominatorDrift.counts, { mutation: 249 });
    const denominatorIssues = validateCorpusChecked(corpus, NO_ARTIFACTS, denominatorDrift);
    expectIssue(denominatorIssues, "required denominator is 2000");
    expectIssue(denominatorIssues, "counts.mutation: denominator drift");
  });
});

describe("captures and the offline run", () => {
  it("reports type, error, tolerance, spill shape, formula, and displayed-text differences", () => {
    const fields = (differences: readonly string[]) =>
      differences.map((difference) => difference.slice(0, difference.indexOf(":"))).sort();
    const tolerant = {
      type: "number",
      value: 1,
      tolerance: { kind: "absolute", value: 0.01 },
    } as const;
    const array = {
      type: "array",
      value: [[1, 2]],
      rows: 1,
      columns: 2,
      formula: "=A1:B1",
    } as const;
    const text = { type: "string", value: "2", displayedText: "2.00" } as const;

    // Equal results, and a number inside its tolerance, have no differences.
    for (const [expected, received] of [
      [
        { type: "error", error: "#N/A" },
        { type: "error", error: "#N/A" },
      ],
      [tolerant, { type: "number", value: 1.005 }],
      [array, structuredClone(array)],
      [text, { ...text }],
    ] as const) {
      expect(compareResults(expected, received)).toEqual([]);
    }

    expect(
      fields(compareResults({ type: "number", value: 2 }, { type: "string", value: "2" })),
    ).toEqual(["type"]);
    expect(
      fields(compareResults({ type: "error", error: "#N/A" }, { type: "error", error: "#REF!" })),
    ).toEqual(["error"]);
    expect(fields(compareResults(tolerant, { type: "number", value: 1.02 }))).toEqual(["value"]);
    expect(
      fields(
        compareResults(array, {
          type: "array",
          value: [[1], [2]],
          rows: 2,
          columns: 1,
          formula: "=A1:A2",
        }),
      ),
    ).toEqual(["columns", "formula", "rows", "value"]);
    expect(fields(compareResults(text, { ...text, displayedText: "2" }))).toEqual([
      "displayedText",
    ]);
  });

  it("counts ULPs across zero within 64 bits", () => {
    const ulps = (value: number) =>
      ({ type: "number", value: 0, tolerance: { kind: "ulp", value } }) as const;

    expect(compareResults(ulps(0), { type: "number", value: -0 })).toEqual([]);
    expect(compareResults(ulps(1), { type: "number", value: -Number.MIN_VALUE })).toEqual([]);
    expect(compareResults(ulps(1), { type: "number", value: Number.MIN_VALUE })).toEqual([]);
    expect(compareResults(ulps(1), { type: "number", value: -2 * Number.MIN_VALUE })).not.toEqual(
      [],
    );
    expect(
      compareResults(
        { type: "number", value: -Number.MIN_VALUE, tolerance: { kind: "ulp", value: 2 } },
        { type: "number", value: Number.MIN_VALUE },
      ),
    ).toEqual([]);
  });

  it("rejects incomplete or drifted Excel Office Script captures", async () => {
    const corpus = clone(CORPUS);
    const capture = {
      protocol: 1,
      producer: "excel-web",
      producerVersion: "16.0.19029.20136",
      capturedAt: "2026-07-22T00:00:00.000Z",
      scriptSha256: "runner-sha",
      calculation: "fullRebuild",
      observations: corpus.cases
        .filter((entry) => entry.kind === "formula")
        .map((entry) => ({ caseId: entry.id, result: entry.expected })),
    };
    expect(validateExcelCapture(capture, corpus, capture.producerVersion, "runner-sha")).toEqual(
      [],
    );
    capture.scriptSha256 = "drifted";
    capture.observations.pop();
    const issues = validateExcelCapture(capture, corpus, capture.producerVersion, "runner-sha");
    expectIssue(issues, "runner drift");
    expectIssue(issues, "missing, extra, or reordered");
  });

  it("rejects an array result whose matrix does not match its shape", () => {
    const issuesOf = (value: unknown) => {
      const issues: string[] = [];
      validateResult(value, "result", issues);
      return issues;
    };

    expect(issuesOf({ type: "array", value: [[1, 2]], rows: 1, columns: 2 })).toEqual([]);
    expect(issuesOf({ type: "array", value: [[1]], rows: 1, columns: 2 })).not.toEqual([]);
    expect(issuesOf({ type: "array", value: [[1, 2], [3]], rows: 2, columns: 2 })).not.toEqual([]);
    expect(issuesOf({ type: "array", value: [[1, 2]], rows: 2, columns: 2 })).not.toEqual([]);
  });

  it("reports every engine error as an error result", async () => {
    const corpus = clone(CORPUS);
    const template = corpus.cases.find(
      (entry) => entry.kind === "formula" && !entry.unsupported && !entry.calculation,
    );
    if (!template) throw new Error("The corpus has no plain formula case");
    const run = (formula: string) =>
      runSheetwriteCase({ ...structuredClone(template), inputs: [], formula, target: "A1" });

    expect(await run("=A1")).toMatchObject({ type: "error", error: "#CYCLE!" });
    expect(await run("=NOSUCHFUNCTION(1)")).toMatchObject({ type: "error", error: "#NAME?" });
    expect(await run('="#literal"')).toMatchObject({ type: "string", value: "#literal" });
  });

  it("runs every supported case and reports the release check as blocked", async () => {
    const corpus = clone(CORPUS);
    const result = await runOffline(corpus);
    const unsupported = corpus.cases.filter((entry) => entry.unsupported === true);
    expect(result.checked).toBe(corpus.cases.length);
    expect(result.localCanaries).toBe(corpus.cases.filter((entry) => entry.localCanary).length);
    expect(result.unsupported).toEqual(unsupported.map((entry) => entry.id));
    expect(result.deferred).toBe(corpus.cases.length - unsupported.length);
    expect(result.status).toBe("blocked");
    expect(() => compatibilityCheckSummary(result)).toThrow("Compatibility release check BLOCKED");
    expect(compatibilityCheckSummary(result, true)).toContain(
      "Excel and Google Sheets compatibility remains unclaimed",
    );
  });
});
