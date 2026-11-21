import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import type { WorkbookSnapshot } from "../packages/core/src/types/document.js";
import { sheetwriteWorkbookBackend } from "../packages/xlsx/src/workbook.js";
import {
  retainedGraphLosses,
  runWorkbookRoundtrips,
  type WorkbookRoundtripResaver,
} from "./conformance/roundtrip.js";

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
  it("records inactive iteration-limit rewrites without accepting enabled iteration changes", async () => {
    const customOff = linkedSnapshot();
    customOff.workbook.calculation = { iterate: false, maxIterations: 50, maxChange: 0.02 };
    const libreOfficeFixture = await sheetwriteWorkbookBackend.toXlsxWorkbook(customOff);
    for (const iterate of [false, true]) {
      const resaver: WorkbookRoundtripResaver = {
        producer: "libreoffice",
        producerVersion: "test-iteration-limits",
        async resave(bytes) {
          const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes);
          snapshot.workbook.calculation = { iterate, maxIterations: 100, maxChange: 0.0001 };
          return sheetwriteWorkbookBackend.toXlsxWorkbook(snapshot);
        },
      };
      const artifact = await runWorkbookRoundtrips(resaver, { libreOfficeFixture });
      const first = artifact.chains[0];
      if (!first) throw new Error("missing Sheetwrite producer chain");
      const customOffChain = artifact.chains[1];
      if (!customOffChain) throw new Error("missing custom iteration-limit chain");
      expect(customOffChain.status).toBe("divergent");
      expect(
        customOffChain.differences.some((difference) => difference.includes(".calculation")),
      ).toBe(true);

      if (iterate) {
        expect(first.status).toBe("divergent");
        expect(first.differences.some((difference) => difference.includes(".calculation:"))).toBe(
          true,
        );
      } else {
        expect(first.status).toBe("pass");
        expect(first.knownProducerDifferences).toContainEqual(
          expect.stringContaining("$workbook.workbook.calculation:"),
        );
      }
    }
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
