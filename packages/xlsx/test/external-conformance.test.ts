import { describe, expect, it } from "bun:test";

import { type CellValue, type WorkbookSnapshot, XlsxResourceError } from "@sheetwrite/core";
import { strToU8, unzipSync } from "fflate";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import {
  BASE_STYLES_BODY,
  PACKAGE_REL,
  rawXlsx,
  type RawXlsxOptions,
  rawZip,
  stylesXml,
  TRANSITIONAL_MAIN,
  TRANSITIONAL_REL,
  worksheet,
} from "./raw-opc.js";
import {
  block,
  book,
  collectWarnings,
  editParts,
  patchEntries,
  sheet,
  sheetAt,
  valuesOf,
} from "./workbook-fixtures.js";

const literal = (value: string | number | null): CellValue => ({ kind: "literal", value });
const oneSheet = (body: string, options: Omit<RawXlsxOptions, "sheets"> = {}) =>
  rawXlsx({ ...options, sheets: [{ xml: worksheet(body) }] });
const resourceLimit = (resource: string) => ({ code: "xlsx-resource-limit", resource });
const importFailure = (message: RegExp) => ({
  code: "xlsx-import-failed",
  message: expect.stringMatching(message),
});

describe("pinned external XLSX behavioral vectors", () => {
  it("ports cases 1-9: preserves typed, inline, shared, rich, phonetic, and whitespace values", async () => {
    const styles = stylesXml(
      '<fonts count="2"><font/><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/></cellXfs>',
    );
    const sharedStrings = `<?xml version="1.0"?><sst xmlns="${TRANSITIONAL_MAIN}" count="4" uniqueCount="4"><si><r><rPr><b/></rPr><t>Bold,</t></r><r><rPr><i/></rPr><t>text</t></r></si><si><t>Hello, World!</t><rPh sb="0" eb="5"><t>phonetic</t></rPh></si><si><t>漢字</t><rPh sb="0" eb="2"><t>かんじ</t></rPh></si><si><t xml:space="preserve">Hello,\nWorld!</t></si></sst>`;
    const body =
      '<dimension ref="A1:I1"/><sheetData><row r="1">' +
      '<c r="A1" t="e"><v>#N/A</v></c><c r="B1" t="str"><v>6E1000</v></c><c r="C1" s="1"/>' +
      '<c r="D1" t="inlineStr"><is><t>Foo</t></is></c>' +
      '<c r="E1" t="inlineStr"><is><r><rPr><color rgb="FFFF0000"/></rPr><t>red</t></r><r><rPr><color rgb="FF00FF00"/></rPr><t>green</t></r></is></c>' +
      '<c r="F1" t="s"><v>0</v></c><c r="G1" t="s"><v>1</v></c><c r="H1" t="s"><v>2</v></c><c r="I1" t="s"><v>3</v></c>' +
      "</row></sheetData>";
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(oneSheet(body, { styles, sharedStrings }), {
      onWarning,
    });

    expect(valuesOf(imported)).toEqual(
      [
        "#N/A",
        "6E1000",
        null,
        "Foo",
        "redgreen",
        "Bold,text",
        "Hello, World!",
        "漢字",
        "Hello,\nWorld!",
      ].map(literal),
    );
    expect(sheetAt(imported).cells[0]?.cells[2]?.style).toEqual({
      bold: true,
      verticalAlign: "bottom",
    });
    expect(warnings).toEqual([
      expect.objectContaining({ code: "rich-text", part: "xl/sharedStrings.xml" }),
      expect.objectContaining({ code: "rich-text" }),
      expect.objectContaining({ code: "unsupported-cell-value", sheet: "Raw1", cell: "A1" }),
      expect.objectContaining({ code: "rich-text", sheet: "Raw1", cell: "E1" }),
    ]);
  });

  it("ports case 15: neutralizes array and data-table formulas with exact warnings", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        '<sheetData><row r="1"><c r="A1"><f t="array" ref="A1:B1">A2</f></c><c r="B1"><f t="dataTable" ref="B1:B2">B2</f></c></row></sheetData>',
      ),
      { onWarning },
    );
    expect(valuesOf(imported)).toEqual([literal("=A2"), literal("=B2")]);
    expect(warnings).toEqual([
      expect.objectContaining({ code: "unsupported-feature", cell: "A1" }),
      expect.objectContaining({ code: "unsupported-feature", cell: "B1" }),
    ]);
  });

  it("ports cases 21-22: preserves custom formats and classifies quoted and elapsed-time vectors", async () => {
    const vectors = [
      ["DD/MM/YY", "date"],
      ["H:MM:SS;@", "date"],
      ['m"M"d"D";@', "date"],
      ["[h]:mm:ss", "date"],
      ["[ss]", "date"],
      ["[s].000", "date"],
      ["#,##0\\ [$₽-46D]", "currency"],
      ['"Y: "0.00"m";"Y: "-0.00"m";"Y: <num>m";@', "number"],
      ["[Red][<=100]0.00", "number"],
    ] as const;
    const escaped = (format: string) =>
      format.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    const numFmts = vectors.map(
      ([format], index) => `<numFmt numFmtId="${164 + index}" formatCode="${escaped(format)}"/>`,
    );
    const xfs = vectors.map(
      (_, index) =>
        `<xf numFmtId="${164 + index}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`,
    );
    const styles = stylesXml(
      `<numFmts count="${vectors.length}">${numFmts.join("")}</numFmts>` +
        BASE_STYLES_BODY.replace(
          /<cellXfs[\s\S]*<\/cellXfs>/,
          `<cellXfs count="${vectors.length}">${xfs.join("")}</cellXfs>`,
        ),
    );
    const cells = vectors.map(
      (_, index) => `<c r="${String.fromCharCode(65 + index)}1" s="${index}"><v>1</v></c>`,
    );
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(`<sheetData><row r="1">${cells.join("")}</row></sheetData>`, { styles }),
    );
    expect(sheetAt(imported).columns.map((column) => [column.numberFormat, column.type])).toEqual(
      vectors.map(([format, type]) => [format, type]),
    );
  });

  it("ports cases 23-25 and 45: preserves dimensions, outlines, and row-over-column style precedence", async () => {
    const styles = stylesXml(
      '<fonts count="3"><font/><font><b/></font><font><i/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0"/></cellXfs>',
    );
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        '<dimension ref="A1:B3"/><cols><col min="1" max="2" width="12" customWidth="1" bestFit="1" hidden="1" outlineLevel="1" collapsed="1" style="1"/></cols><sheetData><row r="1" ht="24" customHeight="1" hidden="1" outlineLevel="1"><c r="A1"><v>1</v></c></row><row r="2" s="2" customFormat="1" outlineLevel="1" collapsed="1"><c r="A2"><v>2</v></c></row><row r="3" s="2"><c r="A3"><v>3</v></c></row></sheetData>',
        { styles },
      ),
      { onWarning },
    );
    const bold = { bold: true, verticalAlign: "bottom" as const };
    const importedSheet = sheetAt(imported);
    expect(
      importedSheet.columns.map(({ width, visible, cellStyle }) => ({ width, visible, cellStyle })),
    ).toEqual([
      { width: 84, visible: false, cellStyle: bold },
      { width: 84, visible: false, cellStyle: bold },
    ]);
    expect(importedSheet.rowMeta).toEqual([[0, { height: 32, hidden: true }]]);
    expect(importedSheet.rowGroups).toEqual([{ start: 0, end: 1, collapsed: true }]);
    expect(importedSheet.cells[0]?.cells.map((cell) => cell.style)).toEqual([
      bold,
      { italic: true, verticalAlign: "bottom" },
      bold,
    ]);
    expect(warnings).toEqual([expect.objectContaining({ code: "unsupported-feature" })]);
  });

  it("ports cases 32 and 34: maps inline and multi-range lists and warns on validation-policy loss", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        '<dimension ref="A1:C2"/><sheetData/><dataValidations count="3"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="stop" prompt="Pick a duck" error="Bad duck" sqref="A1"><formula1>"Ducks"</formula1></dataValidation><dataValidation type="list" allowBlank="0" sqref="B1 B2"><formula1>"A,B"</formula1></dataValidation><dataValidation type="custom" showErrorMessage="1" sqref="C1:C2"><formula1>ISNUMBER(C1)</formula1></dataValidation></dataValidations>',
      ),
      { onWarning },
    );
    const at = (row: number, col: number) =>
      expect.objectContaining({ start: { row, col }, end: { row, col } });
    expect(sheetAt(imported).validationRules).toEqual([
      expect.objectContaining({
        range: at(0, 0),
        condition: { kind: "list", values: ["Ducks"] },
        policy: "reject",
        allowBlank: true,
        helpText: "Pick a duck",
      }),
      expect.objectContaining({ range: at(0, 1), condition: { kind: "list", values: ["A", "B"] } }),
      expect.objectContaining({ range: at(1, 1), condition: { kind: "list", values: ["A", "B"] } }),
    ]);
    expect(warnings.map((warning) => warning.code)).toEqual(["validation-loss", "validation-loss"]);
  });

  it("ports case 39: never fetches external targets and resolves internal parent targets within OPC root", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<sheetData/><hyperlinks><hyperlink ref="A1" r:id="rIdExternal"/></hyperlinks>',
            ),
            relationships: `<Relationship Id="rIdExternal" Type="${TRANSITIONAL_REL}/hyperlink" Target="https://invalid.example/never-fetch" TargetMode="External"/><Relationship Id="rIdComments" Type="${TRANSITIONAL_REL}/comments" Target="../comments1.xml"/>`,
          },
        ],
        extraOverrides: [
          '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
        ],
        extraFiles: {
          "xl/comments1.xml": `<?xml version="1.0"?><comments xmlns="${TRANSITIONAL_MAIN}"><authors><author>A</author></authors><commentList><comment ref="A1" authorId="0"><text><t>resolved parent</t></text></comment></commentList></comments>`,
        },
      }),
      { onWarning },
    );
    const importedSheet = sheetAt(imported);
    expect(importedSheet.notes?.[0]?.text).toBe("resolved parent");
    expect(importedSheet.hyperlinks).toEqual([
      {
        id: "xlsx-hyperlink-1-1",
        range: { sheet: importedSheet.id, start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
        target: { kind: "external", url: "https://invalid.example/never-fetch" },
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("ports cases 40-41: rejects malformed or missing XML and ignores declared unknown extensions", async () => {
    const valid = oneSheet("<sheetData/>");
    const malformed = editParts(valid, { "xl/worksheets/sheet1.xml": "<worksheet><sheetData>" });
    await expect(backend.fromXlsxWorkbook(malformed)).rejects.toMatchObject(importFailure(/XML/));
    const missing = editParts(valid, { "xl/workbook.xml": null });
    await expect(backend.fromXlsxWorkbook(missing)).rejects.toMatchObject(
      importFailure(/xl\/workbook\.xml/),
    );

    const forward = await backend.fromXlsxWorkbook(
      oneSheet(
        '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>kept</t></is></c></row></sheetData><extLst><ext uri="{test}"><future:payload xmlns:future="urn:example:future"><future:value>ignored</future:value></future:payload></ext></extLst>',
      ),
    );
    expect(valuesOf(forward)).toEqual([literal("kept")]);
  });

  it("ports cases 42-44: enforces per-entry, entry-count, row, and column resource boundaries", async () => {
    await expect(
      backend.fromXlsxWorkbook(rawZip({ "huge.bin": "x".repeat(32) }, 0), {
        resourceLimits: { maxEntryUncompressedBytes: 16 },
      }),
    ).rejects.toMatchObject(resourceLimit("maxEntryUncompressedBytes"));

    const tenByTen = oneSheet('<dimension ref="A1:J10"/><sheetData/>');
    await expect(
      backend.fromXlsxWorkbook(tenByTen, { resourceLimits: { maxArchiveEntries: 4 } }),
    ).rejects.toMatchObject(resourceLimit("maxArchiveEntries"));
    const atBoundary = sheetAt(
      await backend.fromXlsxWorkbook(tenByTen, {
        resourceLimits: { maxRowsPerSheet: 10, maxColumnsPerSheet: 10 },
      }),
    );
    expect([atBoundary.rowCount, atBoundary.columns.length]).toEqual([10, 10]);

    for (const [resource, body] of [
      ["maxRowsPerSheet", '<dimension ref="A1:A11"/><sheetData><row r="11"/></sheetData>'],
      ["maxColumnsPerSheet", '<cols><col min="1" max="11" style="0"/></cols><sheetData/>'],
      [
        "maxColumnsPerSheet",
        '<dimension ref="A1:K1"/><sheetData><row r="1"><c r="K1"/></row></sheetData>',
      ],
    ] as const) {
      await expect(
        backend.fromXlsxWorkbook(oneSheet(body), { resourceLimits: { [resource]: 10 } }),
      ).rejects.toMatchObject(resourceLimit(resource));
    }
  });
});

describe("local deterministic and adversarial XLSX gates", () => {
  it("rejects with the exact abort reason while reading shared strings, without warnings", async () => {
    // abort.test.ts aborts at every check of written workbooks, which hold no shared strings.
    const reason = new Error("abort during shared strings");
    let checks = 0;
    const signal = {
      get aborted() {
        checks += 1;
        return checks >= 16;
      },
      reason,
    } as AbortSignal;
    const strings = Array.from({ length: 5_000 }, (_, index) => `<si><t>${index}</t></si>`);
    const { warnings, onWarning } = collectWarnings();
    await expect(
      backend.fromXlsxWorkbook(
        oneSheet('<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData>', {
          sharedStrings: `<?xml version="1.0"?><sst xmlns="${TRANSITIONAL_MAIN}" count="5000" uniqueCount="5000">${strings.join("")}</sst>`,
        }),
        { signal, onWarning },
      ),
    ).rejects.toBe(reason);
    expect(warnings).toEqual([]);
  });

  it("rejects ZIP local/central disagreements, duplicate logical entries, and encoded traversal", async () => {
    const valid = oneSheet("<sheetData/>");
    const mismatches: [RegExp, (view: DataView, local: number) => void][] = [
      [/filename/i, (view, local) => view.setUint8(local + 30, view.getUint8(local + 30) ^ 1)],
      [/CRC/, (view, local) => view.setUint32(local + 14, 0, true)],
      [
        /sizes/i,
        (view, local) => view.setUint32(local + 22, view.getUint32(local + 22, true) + 1, true),
      ],
    ];
    for (const [message, patch] of mismatches) {
      const patched = patchEntries(valid, ({ view, local, index }) => {
        if (index === 0) patch(view, local);
      });
      await expect(backend.fromXlsxWorkbook(patched)).rejects.toMatchObject(importFailure(message));
    }

    const exactDuplicate = patchEntries(
      rawZip({ "a.xml": "a", "b.xml": "b" }, 0),
      ({ view, central, local, index }) => {
        if (index !== 1) return;
        view.setUint8(central + 46, "a".charCodeAt(0));
        view.setUint8(local + 30, "a".charCodeAt(0));
      },
    );
    const files = unzipSync(valid);
    for (const duplicate of [
      exactDuplicate,
      rawZip({ "A.xml": "a", "a.xml": "b" }),
      rawZip({ "a.xml": "a", "%61.xml": "b" }),
      rawZip({ ...files, "XL/%77orkbook.xml": files["xl/workbook.xml"] ?? "" }),
    ]) {
      await expect(backend.fromXlsxWorkbook(duplicate)).rejects.toMatchObject(
        importFailure(/duplicate/i),
      );
    }
    await expect(
      backend.fromXlsxWorkbook(rawZip({ ...files, "xl/%2e%2e/evil.xml": strToU8("<evil/>") })),
    ).rejects.toMatchObject(importFailure(/unsafe part name/i));
  });

  it("rejects wrong roots or namespaces while tolerating extensions only under valid roots", async () => {
    const base = rawXlsx({
      styles: stylesXml(BASE_STYLES_BODY),
      sheets: [
        {
          xml: worksheet("<sheetData/>"),
          relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/comments" Target="../comments1.xml"/>`,
        },
      ],
      extraOverrides: [
        '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>',
      ],
      extraFiles: {
        "xl/comments1.xml": `<?xml version="1.0"?><comments xmlns="${TRANSITIONAL_MAIN}"><authors/><commentList/></comments>`,
      },
    });
    for (const [part, namespace] of [
      ["xl/workbook.xml", TRANSITIONAL_MAIN],
      ["xl/worksheets/sheet1.xml", TRANSITIONAL_MAIN],
      ["xl/styles.xml", TRANSITIONAL_MAIN],
      ["xl/comments1.xml", TRANSITIONAL_MAIN],
      ["_rels/.rels", PACKAGE_REL],
    ] as const) {
      const wrong = editParts(base, { [part]: (xml) => xml.replace(namespace, "urn:wrong") });
      await expect(backend.fromXlsxWorkbook(wrong)).rejects.toMatchObject(
        importFailure(/namespace/i),
      );
    }
  });

  it("makes native external edits win over stale value, style, name, note, and view sidecar data", async () => {
    const styled = block([["x"]]);
    const [cell] = styled.cells;
    if (!cell) throw new Error("the block has no cell");
    cell.style = { bold: true };
    const source = book(
      [
        sheet("s", "Sheet1", [], {
          cells: [styled],
          frozenRows: 1,
          notes: [{ addr: { sheet: "s", row: 0, col: 0 }, text: "old note" }],
        }),
      ],
      {
        namedRanges: [
          {
            name: "OldName",
            range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
          },
        ],
      },
    );
    const imported = await backend.fromXlsxWorkbook(
      editParts(await backend.toXlsxWorkbook(source), {
        "xl/worksheets/sheet1.xml": (xml) =>
          xml
            .replace(">x</t>", ">native</t>")
            .replace(
              '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
              '<pane xSplit="1" topLeftCell="B1" activePane="topRight" state="frozen"/>',
            ),
        "xl/styles.xml": (xml) => xml.replace("<b/>", "<i/>"),
        "xl/workbook.xml": (xml) => xml.replace('name="OldName"', 'name="NewName"'),
        "xl/comments1.xml": (xml) => xml.replace("old note", "new note"),
      }),
    );
    const importedSheet = sheetAt(imported);
    expect(valuesOf(imported)).toEqual([literal("native")]);
    expect(importedSheet.cells[0]?.cells[0]?.style).toEqual({ italic: true });
    expect(imported.workbook.namedRanges?.[0]?.name).toBe("NewName");
    expect(importedSheet.notes?.[0]?.text).toBe("new note");
    expect([importedSheet.frozenRows, importedSheet.frozenCols]).toEqual([undefined, 1]);
  });

  it("accounts UTF-8 bytes incrementally for CJK, emoji, and escaped output", async () => {
    const ascii = book([sheet("s", "Sheet1", [["a&<>".repeat(256)]])]);
    const unicode = book([sheet("s", "Sheet1", [["漢😀&<>".repeat(256)]])]);
    // Every part's bytes plus 256 bytes of ZIP headers per entry, an upper bound for ASCII output.
    const accounted = async (snapshot: WorkbookSnapshot) =>
      Object.values(unzipSync(await backend.toXlsxWorkbook(snapshot))).reduce(
        (total, part) => total + part.byteLength + 256,
        0,
      );
    const limit = await accounted(ascii);
    expect(await accounted(unicode)).toBeGreaterThan(limit);
    const resourceLimits = { maxOutputBytes: limit };
    await expect(backend.toXlsxWorkbook(ascii, { resourceLimits })).resolves.toBeInstanceOf(
      Uint8Array,
    );
    const failure = await backend.toXlsxWorkbook(unicode, { resourceLimits }).then(
      () => undefined,
      (error: unknown) => error,
    );
    if (!(failure instanceof XlsxResourceError)) throw new Error("expected a resource error");
    expect(failure.resource).toBe("maxOutputBytes");
    expect(failure.actual).toBeGreaterThan(limit);
  });
});
