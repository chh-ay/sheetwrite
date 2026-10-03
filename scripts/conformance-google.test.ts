import { describe, expect, it } from "bun:test";
import {
  type CaptureArtifact,
  type ConformanceCorpus,
  captureGoogleWithDependencies,
  type GoogleCaptureDependencies,
  loadCorpus,
  MAX_GOOGLE_CASES_PER_WORKBOOK,
  validateGoogleCaptureArtifact,
} from "./conformance.js";

interface MockGoogle {
  dependencies: GoogleCaptureDependencies;
  calls: string[];
  artifact: () => CaptureArtifact;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mockGoogle(
  options: { failReadBatch?: number; gridValues?: unknown[][] } = {},
): MockGoogle {
  const calls: string[] = [];
  const batchSizes = new Map<string, number>();
  let createIndex = 0;
  let captured: CaptureArtifact | undefined;
  const dependencies: GoogleCaptureDependencies = {
    producerVersion: "sheets-api-v4-2026-07-22",
    now: () => new Date("2026-07-22T12:00:00.000Z"),
    persist: async (artifact) => {
      captured = structuredClone(artifact);
      calls.push("persist");
      return "memory://google-capture";
    },
    request: async (url, init = {}) => {
      if (url === "https://sheets.googleapis.com/v4/spreadsheets") {
        const id = `batch-${createIndex}`;
        const body = JSON.parse(String(init.body)) as { sheets: unknown[] };
        batchSizes.set(id, body.sheets.length);
        calls.push(`create:${createIndex}:${body.sheets.length}`);
        createIndex += 1;
        return jsonResponse({
          spreadsheetId: id,
          properties: { locale: "en_US", timeZone: "UTC" },
        });
      }
      const match = /spreadsheets\/(batch-(\d+))/.exec(url);
      if (match && url.includes("values:batchUpdate")) {
        calls.push(`update:${match[2]}`);
        return jsonResponse({});
      }
      if (match && url.includes("includeGridData=true")) {
        const batchIndex = Number(match[2]);
        calls.push(`read:${batchIndex}`);
        if (options.failReadBatch === batchIndex) throw new Error(`read failure ${batchIndex}`);
        const size = batchSizes.get(match[1]!)!;
        const values = options.gridValues ?? [[true]];
        const rowData = values.map((row) => ({
          values: row.map((value) => ({
            effectiveValue:
              typeof value === "number"
                ? { numberValue: value }
                : typeof value === "boolean"
                  ? { boolValue: value }
                  : { stringValue: String(value) },
            formattedValue: String(value),
          })),
        }));
        const sheets = Array.from({ length: size }, (_, index) => ({
          properties: { title: `Case${String(index + 1).padStart(4, "0")}` },
          data: [{ rowData }],
        }));
        return jsonResponse({ sheets });
      }
      const driveMatch = /files\/(batch-(\d+))/.exec(url);
      if (driveMatch && url.includes("/export?")) {
        calls.push(`export:${driveMatch[2]}`);
        return new Response(new Uint8Array([80, 75, Number(driveMatch[2])]), { status: 200 });
      }
      if (driveMatch && init.method === "DELETE") {
        calls.push(`delete:${driveMatch[2]}`);
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected Google request: ${init.method ?? "GET"} ${url}`);
    },
  };
  return {
    dependencies,
    calls,
    artifact: () => {
      if (!captured) throw new Error("capture was not persisted");
      return captured;
    },
  };
}

async function formulaCorpus(count: number): Promise<ConformanceCorpus> {
  const corpus = await loadCorpus();
  return {
    ...corpus,
    cases: corpus.cases
      .filter((entry) => entry.kind === "formula" && entry.expected.type === "boolean")
      .slice(0, count),
  };
}

async function arrayCorpus(): Promise<ConformanceCorpus> {
  const corpus = await formulaCorpus(1);
  const entry = structuredClone(corpus.cases[0]!);
  entry.id = "google.array-envelope";
  entry.formula = "=SEQUENCE(2,1)";
  entry.target = "A1";
  entry.inputs = [];
  entry.expected = { type: "array", value: [[1], [2]], rows: 2, columns: 1 };
  return { ...corpus, cases: [entry] };
}

describe("bounded Google Sheets capture", () => {
  it("partitions quota-bounded workbooks and preserves case ordering", async () => {
    const corpus = await formulaCorpus(MAX_GOOGLE_CASES_PER_WORKBOOK + 1);
    const mock = mockGoogle();
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).resolves.toBe(
      "memory://google-capture",
    );
    const artifact = mock.artifact();
    expect(artifact.observations.map((entry) => entry.caseId)).toEqual(
      corpus.cases.map((entry) => entry.id),
    );
    const counts = (artifact.workbooks as Array<{ caseCount: number }>).map(
      (entry) => entry.caseCount,
    );
    expect(counts.length).toBeGreaterThan(1);
    for (const count of counts) expect(count).toBeLessThanOrEqual(MAX_GOOGLE_CASES_PER_WORKBOOK);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(corpus.cases.length);

    // Each workbook is written before it is read and deleted before the capture persists.
    const persisted = mock.calls.indexOf("persist");
    counts.forEach((_, index) => {
      const at = (step: string) => mock.calls.indexOf(`${step}:${index}`);
      expect(at("update")).toBeGreaterThan(-1);
      expect(at("update")).toBeLessThan(at("read"));
      expect(at("delete")).toBeGreaterThan(at("read"));
      expect(at("delete")).toBeLessThan(persisted);
    });
    expect(
      validateGoogleCaptureArtifact(artifact, corpus, mock.dependencies.producerVersion),
    ).toEqual([]);
  });

  it("deletes a temporary workbook when a batch read fails", async () => {
    const corpus = await formulaCorpus(2);
    const mock = mockGoogle({ failReadBatch: 0 });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
      "read failure 0",
    );
    expect(mock.calls).toContain("delete:0");
    expect(mock.calls).not.toContain("persist");
  });

  it("fails closed on observation, producer-version, quota, and workbook binding tamper", async () => {
    const corpus = await formulaCorpus(3);
    const mock = mockGoogle();
    await captureGoogleWithDependencies(corpus, mock.dependencies);
    const artifact = mock.artifact();
    const version = mock.dependencies.producerVersion;
    expect(validateGoogleCaptureArtifact(artifact, corpus, version)).toEqual([]);

    type Tamperable = CaptureArtifact & {
      batchSize: number;
      workbooks: Array<{ workbookSha256: string }>;
    };
    const tampers: Array<[string, (copy: Tamperable) => void, string]> = [
      [
        "reordered observations",
        (copy) => {
          [copy.observations[0], copy.observations[1]] = [
            copy.observations[1]!,
            copy.observations[0]!,
          ];
        },
        version,
      ],
      ["quota", (copy) => (copy.batchSize += 1), version],
      ["workbook digest", (copy) => (copy.workbooks[0]!.workbookSha256 = "0".repeat(64)), version],
      ["producer version", () => {}, "different-version"],
    ];
    for (const [label, tamper, expectedVersion] of tampers) {
      const copy = structuredClone(artifact) as Tamperable;
      tamper(copy);
      expect(
        validateGoogleCaptureArtifact(copy, corpus, expectedVersion).length,
        label,
      ).toBeGreaterThan(0);
    }
  });

  it("rejects a result outside the expected array envelope and cleans up", async () => {
    for (const gridValues of [
      [[1], [2], [3]], // extra row
      [[1, "block"], [2]], // occupied column past the boundary
    ]) {
      const corpus = await arrayCorpus();
      const mock = mockGoogle({ gridValues });
      await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
        "array result exceeds expected shape",
      );
      expect(mock.calls).toContain("delete:0");
      expect(mock.calls).not.toContain("persist");
    }
  });

  it("accepts an omitted trailing blank inside the declared array shape", async () => {
    const corpus = await arrayCorpus();
    const expected = { type: "array", value: [[1], [null]], rows: 2, columns: 1 } as const;
    corpus.cases[0]!.expected = expected;
    const mock = mockGoogle({ gridValues: [[1]] });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).resolves.toBe(
      "memory://google-capture",
    );
    expect(mock.calls).toContain("delete:0");
    expect(mock.artifact().observations[0]).toMatchObject({ result: expected });
  });
});
