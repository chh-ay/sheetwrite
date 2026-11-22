import { describe, expect, it } from "bun:test";

import {
  type CaptureArtifact,
  type ConformanceCorpus,
  captureGoogleWithDependencies,
  type GoogleCaptureDependencies,
  loadCorpus,
} from "./conformance.js";

interface MockGoogle {
  dependencies: GoogleCaptureDependencies;
  calls: string[];
  artifact: () => CaptureArtifact;
}

function json_response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function mock_google(
  options: { failReadBatch?: number; gridValues?: unknown[][] } = {},
): MockGoogle {
  const calls: string[] = [];
  const batch_sizes = new Map<string, number>();
  let create_index = 0;
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
        const id = `batch-${create_index}`;
        const body = JSON.parse(String(init.body)) as { sheets: unknown[] };
        batch_sizes.set(id, body.sheets.length);
        calls.push(`create:${create_index}:${body.sheets.length}`);
        create_index += 1;
        return json_response({
          spreadsheetId: id,
          properties: { locale: "en_US", timeZone: "UTC" },
        });
      }
      const match = /spreadsheets\/(batch-(\d+))/.exec(url);
      if (match && url.includes("values:batchUpdate")) {
        calls.push(`update:${match[2]}`);
        return json_response({});
      }
      if (match && url.includes("includeGridData=true")) {
        const batch_index = Number(match[2]);
        calls.push(`read:${batch_index}`);
        if (options.failReadBatch === batch_index) throw new Error(`read failure ${batch_index}`);
        const size = batch_sizes.get(match[1]!)!;
        const values = options.gridValues ?? [[true]];
        const row_data = values.map((row) => ({
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
          data: [{ rowData: row_data }],
        }));
        return json_response({ sheets });
      }
      const drive_match = /files\/(batch-(\d+))/.exec(url);
      if (drive_match && url.includes("/export?")) {
        calls.push(`export:${drive_match[2]}`);
        return new Response(new Uint8Array([80, 75, Number(drive_match[2])]), { status: 200 });
      }
      if (drive_match && init.method === "DELETE") {
        calls.push(`delete:${drive_match[2]}`);
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

async function formula_corpus(count: number): Promise<ConformanceCorpus> {
  const corpus = await loadCorpus();
  return {
    ...corpus,
    cases: corpus.cases
      .filter((entry) => entry.kind === "formula" && entry.expected.type === "boolean")
      .slice(0, count),
  };
}

async function array_corpus(): Promise<ConformanceCorpus> {
  const corpus = await formula_corpus(1);
  const entry = structuredClone(corpus.cases[0]!);
  entry.id = "google.array-envelope";
  entry.formula = "=SEQUENCE(2,1)";
  entry.target = "A1";
  entry.inputs = [];
  entry.expected = { type: "array", value: [[1], [2]], rows: 2, columns: 1 };
  return { ...corpus, cases: [entry] };
}

describe("bounded Google Sheets capture", () => {
  it("deletes a temporary workbook when a batch read fails", async () => {
    const corpus = await formula_corpus(2);
    const mock = mock_google({ failReadBatch: 0 });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
      "read failure 0",
    );
    expect(mock.calls).toContain("delete:0");
    expect(mock.calls).not.toContain("persist");
  });

  it("rejects a result outside the expected array envelope and cleans up", async () => {
    for (const grid_values of [
      [[1], [2], [3]], // extra row
      [[1, "block"], [2]], // occupied column past the boundary
    ]) {
      const corpus = await array_corpus();
      const mock = mock_google({ gridValues: grid_values });
      await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).rejects.toThrow(
        "array result exceeds expected shape",
      );
      expect(mock.calls).toContain("delete:0");
      expect(mock.calls).not.toContain("persist");
    }
  });

  it("accepts an omitted trailing blank inside the declared array shape", async () => {
    const corpus = await array_corpus();
    const expected = { type: "array", value: [[1], [null]], rows: 2, columns: 1 } as const;
    corpus.cases[0]!.expected = expected;
    const mock = mock_google({ gridValues: [[1]] });
    await expect(captureGoogleWithDependencies(corpus, mock.dependencies)).resolves.toBe(
      "memory://google-capture",
    );
    expect(mock.calls).toContain("delete:0");
    expect(mock.artifact().observations[0]).toMatchObject({ result: expected });
  });
});
