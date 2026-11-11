import { beforeAll, describe, expect, it } from "bun:test";

import {
  formatNumber,
  fromXlsxTable,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxTable,
  toXlsxWorkbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import { BASE_STYLES_BODY, rawXlsx, stylesXml, worksheet } from "./raw-opc.js";
import {
  block,
  book,
  collectWarnings,
  fixture,
  formula,
  partText,
  range,
  sheet,
  sheetAt,
  styleAt,
  valuesOf,
} from "./workbook-fixtures.js";

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

/** Two sheets with every workbook feature the codec writes natively. */
function roundTripWorkbook(): WorkbookSnapshot {
  const amounts = range("inputs", 0, 1, 1, 1);
  const inputs = block([[45_000, 4], [45_001.5, 6], ["Merged note"]]);
  const styledCell = inputs.cells[1];
  if (styledCell) {
    styledCell.style = {
      bold: true,
      color: "#112233",
      backgroundColor: "#DDEEFF",
      align: "right",
      wrap: true,
      border: { all: { color: "#334455", width: 2, style: "dashed" } },
    };
  }
  return {
    ...book(
      [
        sheet("inputs", "Inputs", [], {
          rowCount: 3,
          columns: [
            {
              key: "when",
              header: "When",
              width: 111,
              type: "date",
              numberFormat: "mmm d, yyyy h:mm AM/PM",
              numberLocale: "en-US",
              headerStyle: { bold: true, backgroundColor: "#EEEEEE" },
              cellStyle: { align: "center" },
            },
            {
              key: "amount",
              header: "Amount",
              width: 88,
              type: "currency",
              numberFormat: '$#,##0.00;[Red]($#,##0.00);"-"',
            },
          ],
          frozenRows: 1,
          frozenCols: 1,
          rowMeta: [[1, { height: 31, hidden: true }]],
          merges: [{ r0: 2, c0: 0, r1: 2, c1: 1 }],
          conditionalFormats: [
            {
              range: amounts,
              when: { kind: "greaterThan", value: 5 },
              style: { backgroundColor: "#FFEEAA" },
            },
          ],
          rowGroups: [{ start: 0, end: 1, collapsed: false }],
          validationRules: [
            {
              id: "amount-range",
              range: amounts,
              condition: { kind: "number", min: 0, max: 10 },
              policy: "reject",
              helpText: "Enter an amount from 0 to 10",
            },
          ],
          protectedRanges: [{ id: "locked-date", range: range("inputs", 0, 0, 1, 0) }],
          notes: [{ addr: { sheet: "inputs", row: 1, col: 0 }, text: "Imported source date" }],
          sortKeys: [{ col: 1, ascending: false }],
          filters: [[1, { kind: "compare", op: "gte", value: 1 }]],
          cells: [inputs],
        }),
        sheet(
          "calc",
          "Calc",
          [
            [formula("=SUM(Inputs!B1:B2)")],
            [{ kind: "ref", target: { sheet: "inputs", row: 0, col: 1 } }],
          ],
          {
            columns: [
              { key: "result", header: "Result", width: 100, type: "number", numberFormat: "0.00" },
            ],
          },
        ),
      ],
      { activeSheet: "calc", namedRanges: [{ name: "InputAmounts", range: amounts }] },
    ),
    documentId: "xlsx-round-trip",
    version: 7,
  };
}

describe("independent XLSX corpus", () => {
  it("imports LibreOffice-native formulas, styles, validations, comments, merges, and views", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await fromXlsxWorkbook(await fixture("libreoffice-rich.xlsx"), { onWarning });
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "rich-text",
        cell: "C2",
        message: expect.stringContaining("Comment rich text"),
      }),
    );
    expect(imported.workbook.activeSheet).toBe("calc");
    expect(imported.workbook.namedRanges).toEqual([
      { name: "InputAmounts", range: range("inputs", 1, 0, 3, 0) },
    ]);
    expect(imported.sheets.map(({ id, name, visibility }) => [id, name, visibility])).toEqual([
      ["inputs", "Inputs", undefined],
      ["calc", "Calc", undefined],
      ["hidden", "Hidden", "hidden"],
    ]);
    const inputs = sheetAt(imported);
    expect([inputs.frozenRows, inputs.frozenCols]).toEqual([1, 1]);
    expect(inputs.merges).toContainEqual({ r0: 1, c0: 3, r1: 1, c1: 4 });
    const currency = inputs.columns[1];
    expect(currency?.type).toBe("currency");
    expect(currency?.numberFormat).toContain("$#,##0.00");
    expect(formatNumber(2, currency?.numberFormat ?? "")).toBe("$2.00");
    expect(inputs.columns[4]?.visible).toBe(false);
    expect(inputs.validationRules?.[0]).toMatchObject({
      range: range("inputs", 1, 0, 3, 0),
      condition: { kind: "number", min: 0, max: 10 },
    });
    expect(inputs.notes).toEqual([
      { addr: { sheet: "inputs", row: 1, col: 2 }, text: "LibreOffice-authored note" },
    ]);
    const dotted = { color: "#334455", style: "dotted" };
    expect(styleAt(imported, 1, 2)).toMatchObject({
      bold: true,
      color: "#112233",
      backgroundColor: "#DDEEFF",
      align: "center",
      border: { top: dotted, right: dotted, bottom: dotted, left: dotted },
    });
    expect(valuesOf(imported, 1)).toEqual([
      formula("=SUM(Inputs!A2:A4)"),
      formula("=Inputs!B2+Inputs!B3"),
    ]);
  });
});

describe("table XLSX interchange", () => {
  it("round-trips values, empty cells, and reserved or duplicate headers", async () => {
    const store = new SheetwriteStore({
      activeSheet: "s",
      sheets: [
        {
          id: "s",
          name: "S",
          rowCount: 3,
          columns: [
            { key: "a", header: "__proto__", width: 80, type: "text" },
            { key: "b", header: "__proto__", width: 80, type: "number" },
            { key: "c", header: "constructor", width: 80, type: "text" },
          ],
        },
      ],
    });
    store.applyTransaction({
      patches: [
        [0, 0, "first"],
        [0, 1, 42.5],
        [2, 2, "third"],
      ].map(([row, col, value]) => ({
        op: "set" as const,
        addr: { sheet: "s", row: Number(row), col: Number(col) },
        value: { kind: "literal" as const, value },
      })),
    });
    const data = await fromXlsxTable(await toXlsxTable(store.getWorkbook(), store));
    expect(Object.getPrototypeOf(data.columns)).toBeNull();
    expect(Object.keys(data.columns)).toEqual(["__proto__", "__proto___2", "constructor"]);
    expect(Reflect.get(data.columns, "__proto__")).toEqual(["first", null, null]);
    expect(data.columns.__proto___2).toEqual([42.5, null, null]);
    expect(Reflect.get(data.columns, "constructor")).toEqual([null, null, "third"]);
    store.dispose();
  });
});

describe("workbook OOXML fidelity", () => {
  it("is byte-deterministic and preserves supported workbook semantics", async () => {
    const source = roundTripWorkbook();
    const { warnings, onWarning } = collectWarnings();
    const first = await toXlsxWorkbook(source, { onWarning });
    expect(first).toEqual(await toXlsxWorkbook(source));
    expect(warnings.map((warning) => warning.code)).toEqual([
      "unsupported-feature",
      "unsupported-feature",
    ]);
    const workbookXml = partText(first, "xl/workbook.xml");
    expect(workbookXml).toContain('fullCalcOnLoad="1"');
    expect(workbookXml).toContain('name="InputAmounts"');
    const inputsXml = partText(first, "xl/worksheets/sheet1.xml");
    for (const fragment of [
      '<mergeCell ref="A3:B3"/>',
      'state="frozen"',
      'type="decimal"',
      "<conditionalFormatting",
    ]) {
      expect(inputsXml).toContain(fragment);
    }
    expect(partText(first, "xl/styles.xml")).toContain("<dxfs count=");
    expect(partText(first, "xl/comments1.xml")).toContain("Imported source date");
    expect(partText(first, "xl/worksheets/sheet2.xml")).toContain("SUM(Inputs!B1:B2)");

    const imported = await fromXlsxWorkbook(first);
    expect([imported.documentId, imported.version]).toEqual(["xlsx-round-trip", 7]);
    expect(imported.workbook).toEqual(source.workbook);
    expect(imported.sheets.map(({ id, name }) => [id, name])).toEqual([
      ["inputs", "Inputs"],
      ["calc", "Calc"],
    ]);
    // Every sheet field the source sets, other than its cells, comes back exactly.
    const { cells: _cells, ...expected } = sheetAt(source);
    const inputs = sheetAt(imported);
    expect(
      Object.fromEntries(Object.keys(expected).map((key) => [key, Reflect.get(inputs, key)])),
    ).toEqual(expected);
    const dashed = { color: "#334455", width: 2, style: "dashed" };
    expect(styleAt(imported, 0, 1)).toMatchObject({
      bold: true,
      color: "#112233",
      backgroundColor: "#DDEEFF",
      align: "right",
      wrap: true,
      border: { top: dashed, right: dashed, bottom: dashed, left: dashed },
    });
    expect(valuesOf(imported, 1)).toEqual(valuesOf(source, 1));
  });

  it("expands independently authored shared formula slaves", async () => {
    const imported = await fromXlsxWorkbook(await fixture("shared-formula.xlsx"));
    expect(valuesOf(imported)).toEqual([
      { kind: "literal", value: 1 },
      formula("=A1*2"),
      { kind: "literal", value: 2 },
      formula("=A2*2"),
      { kind: "literal", value: 3 },
      formula("=A3*2"),
    ]);
  });

  it("applies column styles declared after the sheet data", async () => {
    const styles = stylesXml(
      BASE_STYLES_BODY.replace(
        '<fonts count="1"><font/></fonts>',
        '<fonts count="2"><font/><font><b/></font></fonts>',
      ).replace(
        /<cellXfs[\s\S]*<\/cellXfs>/,
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/></cellXfs>',
      ),
    );
    const { warnings, onWarning } = collectWarnings();
    const imported = await fromXlsxWorkbook(
      rawXlsx({
        styles,
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1"/><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1" t="e"><v>#N/A</v></c></row></sheetData><cols><col min="1" max="1" style="1"/></cols>',
            ),
          },
        ],
      }),
      { onWarning },
    );
    expect(styleAt(imported, 0, 0)).toEqual({ bold: true, verticalAlign: "bottom" });
    // Rows read before the late styles are styled again without reporting their warnings twice.
    expect(warnings.map((warning) => warning.code)).toEqual(["unsupported-cell-value"]);
  });
});

describe("bounded and corrupt XLSX inputs", () => {
  it("rejects adversarial corpus entries at typed, deterministic boundaries", async () => {
    // One shared code covers every import failure, so the reason proves the right guard fired.
    for (const [file, reason] of [
      ["traversal.xlsx", /unsafe part name/i],
      ["doctype.xlsx", /DTD/],
      ["corrupt-deflate.xlsx", /corrupt|CRC/i],
    ] as const) {
      await expect(fromXlsxWorkbook(await fixture(file)), file).rejects.toMatchObject({
        code: "xlsx-import-failed",
        message: expect.stringMatching(reason),
      });
    }
    for (const [file, resource] of [
      ["deep-xml.xlsx", "maxXmlDepth"],
      ["compression-ratio.xlsx", "maxCompressionRatio"],
    ] as const) {
      await expect(fromXlsxWorkbook(await fixture(file)), file).rejects.toMatchObject({
        code: "xlsx-resource-limit",
        resource,
        operation: "xlsx-import",
      });
    }
  });

  it("validates the shared table/workbook resource contract before codec allocation", async () => {
    const positive = await fixture("sheetwrite-libreoffice-positive.xlsx");
    const tooLarge = {
      code: "xlsx-resource-limit",
      resource: "maxInputBytes",
      actual: positive.byteLength,
      limit: 16,
    };
    const inputLimit = { resourceLimits: { maxInputBytes: 16 } };
    await expect(fromXlsxWorkbook(positive, inputLimit)).rejects.toMatchObject(tooLarge);
    await expect(fromXlsxTable(positive, inputLimit)).rejects.toMatchObject(tooLarge);
    for (const [resource, options] of [
      ["maxCells", { maxCells: 0 }],
      ["maxXmlDepth", { resourceLimits: { maxXmlDepth: 1.5 } }],
      ["maxRowsPerSheet", { resourceLimits: { maxRowsPerSheet: Number.MAX_SAFE_INTEGER + 1 } }],
    ] as const) {
      await expect(fromXlsxWorkbook(positive, options)).rejects.toMatchObject({
        code: "xlsx-invalid-options",
        context: { resource },
      });
    }
    await expect(
      fromXlsxWorkbook(positive, { resourceLimits: { maxXmlTextBytes: 4 } }),
    ).rejects.toMatchObject({ code: "xlsx-resource-limit" });
    await expect(
      fromXlsxWorkbook(
        rawXlsx({ sheets: [{ xml: worksheet('<dimension ref="A1:B2:C3"/><sheetData/>') }] }),
      ),
    ).rejects.toMatchObject({
      code: "xlsx-import-failed",
      message: expect.stringMatching(/A1:B2:C3/),
    });
    await expect(toXlsxWorkbook(roundTripWorkbook(), { maxCells: 1 })).rejects.toMatchObject({
      code: "xlsx-resource-limit",
    });
    const controller = new AbortController();
    controller.abort(new Error("cancelled workbook import"));
    await expect(fromXlsxWorkbook(positive, { signal: controller.signal })).rejects.toThrow(
      "cancelled workbook import",
    );
  });
});
