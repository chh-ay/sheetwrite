import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import type { WorkbookSnapshot } from "../packages/core/src/types/document.js";
import { sheetwriteWorkbookBackend } from "../packages/xlsx/src/workbook.js";
import {
  retainedGraphLosses,
  runWorkbookRoundtrips,
  structuralDifferences,
  workbookFeatureState,
  type WorkbookRoundtripResaver,
} from "./conformance/roundtrip.js";

const IDENTITY_RESAVER: WorkbookRoundtripResaver = {
  producer: "libreoffice",
  producerVersion: "test-identity",
  async resave(bytes) {
    return bytes;
  },
};

function linkedSnapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "links" },
    sheets: [
      {
        id: "links",
        name: "Links",
        order: 0,
        rowCount: 1,
        columns: [{ key: "link", header: "Link", width: 100, type: "text" }],
        hyperlinks: [
          {
            id: "original",
            range: { sheet: "links", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
            target: { kind: "external", url: "https://example.com" },
            style: { color: "#123456", underline: true },
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "Report" } }],
          },
        ],
      },
    ],
  };
}

describe("workbook producer roundtrip evidence", () => {
  it("compares generated hyperlink ids and cell-carried presentation semantically", () => {
    const original = linkedSnapshot();
    const rewritten = structuredClone(original);
    const sheet = rewritten.sheets[0];
    const link = sheet?.hyperlinks?.[0];
    const cell = sheet?.cells[0]?.cells[0];
    if (!link || !cell) throw new Error("missing linked cell");

    link.id = "xlsx-hyperlink-1-1";
    cell.style = link.style;
    delete link.style;
    expect(
      structuralDifferences(workbookFeatureState(original), workbookFeatureState(rewritten)),
    ).toEqual([]);

    cell.style = { color: "#0000FF", underline: true };
    expect(
      structuralDifferences(workbookFeatureState(original), workbookFeatureState(rewritten)),
    ).not.toEqual([]);
  });

  it("records LibreOffice dropping stopIfTrue as a known producer difference", async () => {
    const resaver: WorkbookRoundtripResaver = {
      producer: "libreoffice",
      producerVersion: "test-stop-if-true",
      async resave(bytes) {
        const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
        for (const sheet of snapshot.sheets) {
          for (const rule of sheet.conditionalFormats ?? []) delete rule.stopIfTrue;
        }
        return sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot);
      },
    };
    const artifact = await runWorkbookRoundtrips(resaver);
    expect(artifact.chains[0]).toMatchObject({
      status: "pass",
      differences: [],
      knownProducerDifferences: [expect.stringContaining(".stopIfTrue: true != undefined")],
    });
  });

  it("binds both required local chain directions and preserves exact normalized semantics", async () => {
    const artifact = await runWorkbookRoundtrips(IDENTITY_RESAVER, {
      capturedAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    expect(artifact).toMatchObject({
      protocol: 1,
      producer: "libreoffice",
      producerVersion: "test-identity",
      capturedAt: "2026-07-22T12:00:00.000Z",
      status: "pass",
    });
    expect(artifact.chains.map((chain) => [chain.id, chain.direction, chain.status])).toEqual([
      ["sheetwrite-libreoffice-sheetwrite", "sheetwrite-producer-sheetwrite", "pass"],
      [
        "libreoffice-sheetwrite-libreoffice-sheetwrite",
        "producer-sheetwrite-producer-sheetwrite",
        "pass",
      ],
    ]);
    for (const chain of artifact.chains) {
      expect(chain.inputSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(chain.producerSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(chain.inputBytes).toBeGreaterThan(0);
      expect(chain.producerBytes).toBeGreaterThan(0);
      expect(chain.differences).toEqual([]);
    }
    expect(artifact.blockedChains).toHaveLength(3);
  });

  it("reports semantic feature loss instead of treating a valid XLSX resave as a pass", async () => {
    const destructive: WorkbookRoundtripResaver = {
      producer: "libreoffice",
      producerVersion: "test-destructive",
      async resave(bytes, id) {
        if (id !== "sheetwrite-libreoffice-sheetwrite") return bytes;
        const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
        snapshot.sheets[0]!.tables = [];
        snapshot.sheets[0]!.cells[0]!.cells[0]!.value = {
          kind: "literal",
          value: "lost-value",
        };
        return sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot);
      },
    };
    const artifact = await runWorkbookRoundtrips(destructive);
    expect(artifact.status).toBe("partial");
    expect(artifact.chains[0]!.status).toBe("divergent");
    expect(artifact.chains[0]!.differences.some((entry) => entry.includes(".tables"))).toBe(true);
    expect(
      artifact.chains[0]!.differences.some(
        (entry) => entry.includes(".cells[0].value.value") && entry.includes("lost-value"),
      ),
    ).toBe(true);
  });

  describe("retained OOXML graphs", () => {
    // A LibreOffice-written file carries graphs Sheetwrite does not model (its
    // theme, document properties), which import keeps as opaque parts.
    async function importedWithGraphs() {
      const bytes = await readFile("packages/xlsx/test/fixtures/libreoffice-rich.xlsx");
      const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(new Uint8Array(bytes));
      const source = snapshot.workbook.xlsxSource;
      if (source === undefined || source.graphs.length === 0) {
        throw new Error("fixture has no retained graphs");
      }
      return { snapshot, source };
    }

    it("allows a producer to add graphs of its own", async () => {
      const { snapshot: resaved } = await importedWithGraphs();
      const { xlsxSource: _preserved, ...workbook } = resaved.workbook;
      const original = { ...resaved, workbook };

      expect(
        structuralDifferences(workbookFeatureState(original), workbookFeatureState(resaved)),
      ).toEqual([]);
      expect(retainedGraphLosses(original, resaved)).toEqual([]);
    });

    it("reports a graph the round trip dropped", async () => {
      const { snapshot: original, source } = await importedWithGraphs();
      const [dropped, ...kept] = source.graphs;
      const resaved = {
        ...original,
        workbook: { ...original.workbook, xlsxSource: { ...source, graphs: kept } },
      };

      const losses = retainedGraphLosses(original, resaved);
      expect(losses).toHaveLength(1);
      expect(losses[0]).toContain(dropped?.type ?? "");
    });
  });
});
