import { describe, expect, it } from "bun:test";

import {
  type WorkbookSnapshot,
  XlsxResourceError,
  type XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { sheetwriteWorkbookBackend } from "../src/workbook.js";
import {
  BASE_STYLES_BODY,
  FIXED_ZIP_TIME,
  PACKAGE_REL,
  rawXlsx,
  rawZip,
  stylesXml,
  TRANSITIONAL_MAIN,
  TRANSITIONAL_REL,
  worksheet,
} from "./raw-opc.js";

function row_values(snapshot: WorkbookSnapshot, sheet = 0): unknown[] {
  return snapshot.sheets[sheet]!.cells.flatMap((block) => block.cells)
    .sort((left, right) => left.rowOffset - right.rowOffset || left.colOffset - right.colOffset)
    .map((cell) => cell.value);
}

function warnings_for(): {
  warnings: XlsxWorkbookWarning[];
  onWarning: (warning: XlsxWorkbookWarning) => void;
} {
  const warnings: XlsxWorkbookWarning[] = [];
  return { warnings, onWarning: (warning) => warnings.push(warning) };
}

function minimal_snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "s" },
    sheets: [
      {
        id: "s",
        name: "Sheet1",
        order: 0,
        rowCount: 1,
        columns: [{ key: "a", header: "A", width: 80, type: "text" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "x" } }],
          },
        ],
      },
    ],
  };
}

describe("pinned external XLSX behavioral vectors", () => {
  it("ports cases 1-9: preserves typed, inline, shared, rich, phonetic, and whitespace values", async () => {
    const styles = stylesXml(
      '<fonts count="2"><font/><font><b/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/></cellXfs>',
    );
    const shared_strings = `<?xml version="1.0"?><sst xmlns="${TRANSITIONAL_MAIN}" count="4" uniqueCount="4"><si><r><rPr><b/></rPr><t>Bold,</t></r><r><rPr><i/></rPr><t>text</t></r></si><si><t>Hello, World!</t><rPh sb="0" eb="5"><t>phonetic</t></rPh></si><si><t>漢字</t><rPh sb="0" eb="2"><t>かんじ</t></rPh></si><si><t xml:space="preserve">Hello,\nWorld!</t></si></sst>`;
    const body =
      '<dimension ref="A1:I1"/><sheetData><row r="1">' +
      '<c r="A1" t="e"><v>#N/A</v></c>' +
      '<c r="B1" t="str"><v>6E1000</v></c>' +
      '<c r="C1" s="1"/>' +
      '<c r="D1" t="inlineStr"><is><t>Foo</t></is></c>' +
      '<c r="E1" t="inlineStr"><is><r><rPr><color rgb="FFFF0000"/></rPr><t>red</t></r><r><rPr><color rgb="FF00FF00"/></rPr><t>green</t></r></is></c>' +
      '<c r="F1" t="s"><v>0</v></c><c r="G1" t="s"><v>1</v></c>' +
      '<c r="H1" t="s"><v>2</v></c><c r="I1" t="s"><v>3</v></c>' +
      "</row></sheetData>";
    const capture = warnings_for();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({ sheets: [{ xml: worksheet(body) }], styles, sharedStrings: shared_strings }),
      { onWarning: capture.onWarning },
    );

    expect(row_values(imported)).toEqual([
      { kind: "literal", value: "#N/A" },
      { kind: "literal", value: "6E1000" },
      { kind: "literal", value: null },
      { kind: "literal", value: "Foo" },
      { kind: "literal", value: "redgreen" },
      { kind: "literal", value: "Bold,text" },
      { kind: "literal", value: "Hello, World!" },
      { kind: "literal", value: "漢字" },
      { kind: "literal", value: "Hello,\nWorld!" },
    ]);
    expect(imported.sheets[0]?.cells[0]?.cells[2]?.style).toEqual({
      bold: true,
      verticalAlign: "bottom",
    });
    expect(capture.warnings).toEqual([
      expect.objectContaining({ code: "rich-text", part: "xl/sharedStrings.xml" }),
      expect.objectContaining({ code: "rich-text" }),
      expect.objectContaining({ code: "unsupported-cell-value", sheet: "Raw1", cell: "A1" }),
      expect.objectContaining({ code: "rich-text", sheet: "Raw1", cell: "E1" }),
    ]);
  });

  it("ports case 15: neutralizes array and data-table formulas with exact warnings", async () => {
    const capture = warnings_for();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:B1"/><sheetData><row r="1"><c r="A1"><f t="array" ref="A1:B1">A2</f></c><c r="B1"><f t="dataTable" ref="B1:B2">B2</f></c></row></sheetData>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(row_values(imported)).toEqual([
      { kind: "literal", value: "=A2" },
      { kind: "literal", value: "=B2" },
    ]);
    expect(capture.warnings).toEqual([
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
    const num_fmts = vectors
      .map(
        ([format], index) =>
          `<numFmt numFmtId="${164 + index}" formatCode="${format.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")}"/>`,
      )
      .join("");
    const xfs = vectors
      .map(
        (_, index) =>
          `<xf numFmtId="${164 + index}" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>`,
      )
      .join("");
    const styles = stylesXml(
      `<numFmts count="${vectors.length}">${num_fmts}</numFmts><fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="${vectors.length}">${xfs}</cellXfs>`,
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        styles,
        sheets: [
          {
            xml: worksheet(
              `<dimension ref="A1:I1"/><sheetData><row r="1">${vectors
                .map(
                  (_, index) =>
                    `<c r="${String.fromCharCode(65 + index)}1" s="${index}"><v>1</v></c>`,
                )
                .join("")}</row></sheetData>`,
            ),
          },
        ],
      }),
    );
    expect(imported.sheets[0]!.columns.map((column) => [column.numberFormat, column.type])).toEqual(
      vectors.map(([format, type]) => [format, type]),
    );
  });

  it("ports cases 23-25 and 45: preserves dimensions, outlines, and row-over-column style precedence", async () => {
    const styles = stylesXml(
      '<fonts count="3"><font/><font><b/></font><font><i/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0"/></cellXfs>',
    );
    const capture = warnings_for();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        styles,
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:B3"/><cols><col min="1" max="2" width="12" customWidth="1" bestFit="1" hidden="1" outlineLevel="1" collapsed="1" style="1"/></cols><sheetData><row r="1" ht="24" customHeight="1" hidden="1" outlineLevel="1"><c r="A1"><v>1</v></c></row><row r="2" s="2" customFormat="1" outlineLevel="1" collapsed="1"><c r="A2"><v>2</v></c></row><row r="3" s="2"><c r="A3"><v>3</v></c></row></sheetData>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(
      imported.sheets[0]!.columns.map((column) => ({
        width: column.width,
        visible: column.visible,
        cellStyle: column.cellStyle,
      })),
    ).toEqual([
      { width: 84, visible: false, cellStyle: { bold: true, verticalAlign: "bottom" } },
      { width: 84, visible: false, cellStyle: { bold: true, verticalAlign: "bottom" } },
    ]);
    expect(imported.sheets[0]!.rowMeta).toEqual([[0, { height: 32, hidden: true }]]);
    expect(imported.sheets[0]!.rowGroups).toEqual([{ start: 0, end: 1, collapsed: true }]);
    expect(imported.sheets[0]!.cells[0]!.cells.map((cell) => cell.style)).toEqual([
      { bold: true, verticalAlign: "bottom" },
      { italic: true, verticalAlign: "bottom" },
      { bold: true, verticalAlign: "bottom" },
    ]);
    expect(capture.warnings).toEqual([expect.objectContaining({ code: "unsupported-feature" })]);
  });

  it("ports cases 32 and 34: maps inline and multi-range lists and warns on validation-policy loss", async () => {
    const capture = warnings_for();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1:C2"/><sheetData/><dataValidations count="3"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="stop" prompt="Pick a duck" error="Bad duck" sqref="A1"><formula1>"Ducks"</formula1></dataValidation><dataValidation type="list" allowBlank="0" sqref="B1 B2"><formula1>"A,B"</formula1></dataValidation><dataValidation type="custom" showErrorMessage="1" sqref="C1:C2"><formula1>ISNUMBER(C1)</formula1></dataValidation></dataValidations>',
            ),
          },
        ],
      }),
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.validationRules).toEqual([
      expect.objectContaining({
        range: expect.objectContaining({
          start: { row: 0, col: 0 },
          end: { row: 0, col: 0 },
        }),
        condition: { kind: "list", values: ["Ducks"] },
        policy: "reject",
        allowBlank: true,
        helpText: "Pick a duck",
      }),
      expect.objectContaining({
        range: expect.objectContaining({
          start: { row: 0, col: 1 },
          end: { row: 0, col: 1 },
        }),
        condition: { kind: "list", values: ["A", "B"] },
      }),
      expect.objectContaining({
        range: expect.objectContaining({
          start: { row: 1, col: 1 },
          end: { row: 1, col: 1 },
        }),
        condition: { kind: "list", values: ["A", "B"] },
      }),
    ]);
    expect(capture.warnings.map((warning) => warning.code)).toEqual([
      "validation-loss",
      "validation-loss",
    ]);
  });

  it("ports case 39: never fetches external targets and resolves internal parent targets within OPC root", async () => {
    const capture = warnings_for();
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1"/><sheetData/><hyperlinks><hyperlink ref="A1" r:id="rIdExternal"/></hyperlinks>',
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
      { onWarning: capture.onWarning },
    );
    expect(imported.sheets[0]!.notes?.[0]?.text).toBe("resolved parent");
    expect(imported.sheets[0]!.hyperlinks).toEqual([
      {
        id: "xlsx-hyperlink-1-1",
        range: {
          sheet: imported.sheets[0]!.id,
          start: { row: 0, col: 0 },
          end: { row: 0, col: 0 },
        },
        target: { kind: "external", url: "https://invalid.example/never-fetch" },
      },
    ]);
    expect(capture.warnings).toEqual([]);
  });

  it("ports cases 40-41: rejects malformed or missing XML and ignores declared unknown extensions", async () => {
    const valid = unzipSync(
      rawXlsx({
        sheets: [{ xml: worksheet('<dimension ref="A1"/><sheetData/>') }],
      }),
    );
    const malformed = { ...valid, "xl/worksheets/sheet1.xml": strToU8("<worksheet><sheetData>") };
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        zipSync(malformed, { level: 6, mtime: FIXED_ZIP_TIME }),
      ),
    ).rejects.toMatchObject({ code: "xlsx-import-failed", message: expect.stringMatching(/XML/) });

    const missing = { ...valid };
    delete missing["xl/workbook.xml"];
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        zipSync(missing, { level: 6, mtime: FIXED_ZIP_TIME }),
      ),
    ).rejects.toMatchObject({
      code: "xlsx-import-failed",
      message: expect.stringMatching(/xl\/workbook\.xml/),
    });

    const forward = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      rawXlsx({
        sheets: [
          {
            xml: worksheet(
              '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>kept</t></is></c></row></sheetData><extLst><ext uri="{test}"><future:payload xmlns:future="urn:example:future"><future:value>ignored</future:value></future:payload></ext></extLst>',
            ),
          },
        ],
      }),
    );
    expect(row_values(forward)).toEqual([{ kind: "literal", value: "kept" }]);
  });

  it("ports cases 42-44: enforces per-entry, entry-count, row, and column resource boundaries", async () => {
    try {
      await sheetwriteWorkbookBackend.fromXlsxWorkbook(rawZip({ "huge.bin": "x".repeat(32) }, 0), {
        resourceLimits: { maxEntryUncompressedBytes: 16 },
      });
      throw new Error("expected maxEntryUncompressedBytes rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxResourceError);
      expect((error as XlsxResourceError).resource).toBe("maxEntryUncompressedBytes");
    }

    const ten_by_ten = rawXlsx({
      sheets: [{ xml: worksheet('<dimension ref="A1:J10"/><sheetData/>') }],
    });
    try {
      await sheetwriteWorkbookBackend.fromXlsxWorkbook(ten_by_ten, {
        resourceLimits: { maxArchiveEntries: 4 },
      });
      throw new Error("expected maxArchiveEntries rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxResourceError);
      expect((error as XlsxResourceError).resource).toBe("maxArchiveEntries");
    }
    const at_boundary = await sheetwriteWorkbookBackend.fromXlsxWorkbook(ten_by_ten, {
      resourceLimits: { maxRowsPerSheet: 10, maxColumnsPerSheet: 10 },
    });
    expect([at_boundary.sheets[0]!.rowCount, at_boundary.sheets[0]!.columns.length]).toEqual([
      10, 10,
    ]);

    for (const [resource, xml] of [
      [
        "maxRowsPerSheet",
        worksheet('<dimension ref="A1:A11"/><sheetData><row r="11"/></sheetData>'),
      ],
      [
        "maxColumnsPerSheet",
        worksheet('<cols><col min="1" max="11" style="0"/></cols><sheetData/>'),
      ],
      [
        "maxColumnsPerSheet",
        worksheet('<dimension ref="A1:K1"/><sheetData><row r="1"><c r="K1"/></row></sheetData>'),
      ],
    ] as const) {
      try {
        await sheetwriteWorkbookBackend.fromXlsxWorkbook(rawXlsx({ sheets: [{ xml }] }), {
          resourceLimits: { [resource]: 10 },
        });
        throw new Error(`expected ${resource} rejection`);
      } catch (error) {
        expect(error).toBeInstanceOf(XlsxResourceError);
        expect((error as XlsxResourceError).resource).toBe(resource);
      }
    }
  });
});

describe("local deterministic and adversarial XLSX gates", () => {
  it("is insertion-order invariant with canonical ZIP entries, relationships, styles, and timestamps", async () => {
    const first = minimal_snapshot();
    first.sheets[0]!.rowCount = 2;
    first.sheets[0]!.columns.push({
      key: "b",
      header: "B",
      width: 90,
      type: "number",
      cellStyle: { bold: true, color: "#112233" },
    });
    first.sheets[0]!.cells = [
      {
        startRow: 1,
        startCol: 1,
        rowCount: 1,
        colCount: 1,
        cells: [
          {
            rowOffset: 0,
            colOffset: 0,
            value: { kind: "literal", value: 2 },
            style: { italic: true, backgroundColor: "#AABBCC" },
          },
        ],
      },
      ...first.sheets[0]!.cells,
    ];
    const second = structuredClone(first);
    second.sheets[0]!.cells.reverse();
    second.sheets[0]!.columns[1]!.cellStyle = { color: "#112233", bold: true };
    second.sheets[0]!.cells.find(
      (block) => block.startRow === 1 && block.startCol === 1,
    )!.cells[0]!.style = {
      backgroundColor: "#AABBCC",
      italic: true,
    };

    const [left, right] = await Promise.all([
      sheetwriteWorkbookBackend.toXlsxWorkbook(first),
      sheetwriteWorkbookBackend.toXlsxWorkbook(second),
    ]);
    expect(right).toEqual(left);
    const entries = Object.keys(unzipSync(left));
    expect(entries).toEqual([...entries].sort((a, b) => a.localeCompare(b)));
    const view = new DataView(left.buffer, left.byteOffset, left.byteLength);
    for (let offset = 0; offset + 30 < left.byteLength; offset++) {
      if (view.getUint32(offset, true) !== 0x04034b50) continue;
      expect(view.getUint16(offset + 10, true)).toBe(0);
      expect(view.getUint16(offset + 12, true)).toBe(33);
    }
  });

  it("rejects with the exact abort reason across codec stages", async () => {
    const central_reason = new Error("abort during central directory");
    let central_checks = 0;
    const central_signal = {
      get aborted() {
        central_checks += 1;
        return central_checks >= 3;
      },
      get reason() {
        return central_reason;
      },
    } as AbortSignal;
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({ sheets: [{ xml: worksheet("<sheetData/>") }] }),
        { signal: central_signal },
      ),
    ).rejects.toBe(central_reason);

    const shared_reason = new Error("abort during shared strings");
    let shared_checks = 0;
    const shared_signal = {
      get aborted() {
        shared_checks += 1;
        return shared_checks >= 16;
      },
      get reason() {
        return shared_reason;
      },
    } as AbortSignal;
    const shared_warnings: XlsxWorkbookWarning[] = [];
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(
        rawXlsx({
          sharedStrings: `<?xml version="1.0"?><sst xmlns="${TRANSITIONAL_MAIN}" count="5000" uniqueCount="5000">${Array.from({ length: 5_000 }, (_, index) => `<si><t>${index}</t></si>`).join("")}</sst>`,
          sheets: [
            {
              xml: worksheet(
                '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData>',
              ),
            },
          ],
        }),
        { signal: shared_signal, onWarning: (warning) => shared_warnings.push(warning) },
      ),
    ).rejects.toBe(shared_reason);
    expect(shared_warnings).toEqual([]);

    const export_reason = new Error("abort during export part");
    let export_checks = 0;
    const export_signal = {
      get aborted() {
        export_checks += 1;
        return export_checks >= 3;
      },
      get reason() {
        return export_reason;
      },
    } as AbortSignal;
    const export_warnings: XlsxWorkbookWarning[] = [];
    await expect(
      sheetwriteWorkbookBackend.toXlsxWorkbook(minimal_snapshot(), {
        signal: export_signal,
        onWarning: (warning) => export_warnings.push(warning),
      }),
    ).rejects.toBe(export_reason);
    expect(export_warnings).toEqual([]);
  });

  it("rejects ZIP local/central disagreements and duplicate raw or normalized logical entries", async () => {
    const valid = rawXlsx({ sheets: [{ xml: worksheet("<sheetData/>") }] });
    let eocd = -1;
    const valid_view = new DataView(valid.buffer, valid.byteOffset, valid.byteLength);
    for (let offset = valid.byteLength - 22; offset >= 0; offset--) {
      if (valid_view.getUint32(offset, true) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    expect(eocd).toBeGreaterThan(0);
    const central = valid_view.getUint32(eocd + 16, true);
    const local = valid_view.getUint32(central + 42, true);

    const filename_mismatch = valid.slice();
    filename_mismatch[local + 30] = filename_mismatch[local + 30]! ^ 1;
    await expect(
      sheetwriteWorkbookBackend.fromXlsxWorkbook(filename_mismatch),
    ).rejects.toMatchObject({
      code: "xlsx-import-failed",
      message: expect.stringMatching(/filename/i),
    });

    const crc_mismatch = valid.slice();
    new DataView(crc_mismatch.buffer, crc_mismatch.byteOffset, crc_mismatch.byteLength).setUint32(
      local + 14,
      0,
      true,
    );
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(crc_mismatch)).rejects.toMatchObject({
      code: "xlsx-import-failed",
      message: expect.stringMatching(/CRC/),
    });
    const size_mismatch = valid.slice();
    const size_view = new DataView(
      size_mismatch.buffer,
      size_mismatch.byteOffset,
      size_mismatch.byteLength,
    );
    size_view.setUint32(local + 22, size_view.getUint32(local + 22, true) + 1, true);
    await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(size_mismatch)).rejects.toMatchObject({
      code: "xlsx-import-failed",
      message: expect.stringMatching(/sizes/i),
    });

    const exact_duplicate = rawZip({ "a.xml": "a", "b.xml": "b" }, 0);
    const duplicate_view = new DataView(
      exact_duplicate.buffer,
      exact_duplicate.byteOffset,
      exact_duplicate.byteLength,
    );
    let duplicate_eocd = -1;
    for (let offset = exact_duplicate.byteLength - 22; offset >= 0; offset--) {
      if (duplicate_view.getUint32(offset, true) === 0x06054b50) {
        duplicate_eocd = offset;
        break;
      }
    }
    const first_central = duplicate_view.getUint32(duplicate_eocd + 16, true);
    const second_central =
      first_central +
      46 +
      duplicate_view.getUint16(first_central + 28, true) +
      duplicate_view.getUint16(first_central + 30, true) +
      duplicate_view.getUint16(first_central + 32, true);
    const second_local = duplicate_view.getUint32(second_central + 42, true);
    exact_duplicate[second_central + 46] = "a".charCodeAt(0);
    exact_duplicate[second_local + 30] = "a".charCodeAt(0);

    for (const duplicate of [
      exact_duplicate,
      rawZip({ "A.xml": "a", "a.xml": "b" }),
      rawZip({ "a.xml": "a", "%61.xml": "b" }),
    ]) {
      await expect(sheetwriteWorkbookBackend.fromXlsxWorkbook(duplicate)).rejects.toMatchObject({
        code: "xlsx-import-failed",
        message: expect.stringMatching(/duplicate/i),
      });
    }
  });

  it("rejects wrong roots or namespaces while tolerating extensions only under valid roots", async () => {
    const comments = `<?xml version="1.0"?><comments xmlns="${TRANSITIONAL_MAIN}"><authors/><commentList/></comments>`;
    const base = unzipSync(
      rawXlsx({
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
        extraFiles: { "xl/comments1.xml": comments },
      }),
    );
    const mutations: Array<[string, string, string]> = [
      ["xl/workbook.xml", TRANSITIONAL_MAIN, "urn:wrong:workbook"],
      ["xl/worksheets/sheet1.xml", TRANSITIONAL_MAIN, "urn:wrong:worksheet"],
      ["xl/styles.xml", TRANSITIONAL_MAIN, "urn:wrong:styles"],
      ["xl/comments1.xml", TRANSITIONAL_MAIN, "urn:wrong:comments"],
      ["_rels/.rels", PACKAGE_REL, "urn:wrong:relationships"],
    ];
    for (const [part, expected_namespace, wrong_namespace] of mutations) {
      const files = { ...base };
      files[part] = strToU8(strFromU8(files[part]!).replace(expected_namespace, wrong_namespace));
      await expect(
        sheetwriteWorkbookBackend.fromXlsxWorkbook(
          zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME }),
        ),
      ).rejects.toMatchObject({
        code: "xlsx-import-failed",
        message: expect.stringMatching(/namespace/i),
      });
    }
  });

  it("makes native external edits win over stale value, style, name, note, and view sidecar data", async () => {
    const source = minimal_snapshot();
    source.workbook.namedRanges = [
      {
        name: "OldName",
        range: { sheet: "s", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
      },
    ];
    source.sheets[0]!.frozenRows = 1;
    source.sheets[0]!.cells[0]!.cells[0]!.style = { bold: true };
    source.sheets[0]!.notes = [{ addr: { sheet: "s", row: 0, col: 0 }, text: "old note" }];
    const files = unzipSync(await sheetwriteWorkbookBackend.toXlsxWorkbook(source));
    files["xl/worksheets/sheet1.xml"] = strToU8(
      strFromU8(files["xl/worksheets/sheet1.xml"]!)
        .replace(">x</t>", ">native</t>")
        .replace(
          '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
          '<pane xSplit="1" topLeftCell="B1" activePane="topRight" state="frozen"/>',
        ),
    );
    files["xl/styles.xml"] = strToU8(strFromU8(files["xl/styles.xml"]!).replace("<b/>", "<i/>"));
    files["xl/workbook.xml"] = strToU8(
      strFromU8(files["xl/workbook.xml"]!).replace('name="OldName"', 'name="NewName"'),
    );
    files["xl/comments1.xml"] = strToU8(
      strFromU8(files["xl/comments1.xml"]!).replace("old note", "new note"),
    );
    const imported = await sheetwriteWorkbookBackend.fromXlsxWorkbook(
      zipSync(files, { level: 6, mtime: FIXED_ZIP_TIME }),
    );
    expect(row_values(imported)).toEqual([{ kind: "literal", value: "native" }]);
    expect(imported.sheets[0]!.cells[0]!.cells[0]!.style).toEqual({ italic: true });
    expect(imported.workbook.namedRanges?.[0]?.name).toBe("NewName");
    expect(imported.sheets[0]!.notes?.[0]?.text).toBe("new note");
    expect(imported.sheets[0]!.frozenRows).toBeUndefined();
    expect(imported.sheets[0]!.frozenCols).toBe(1);
  });

  it("accounts UTF-8 bytes incrementally for CJK, emoji, and escaped output", async () => {
    const ascii = minimal_snapshot();
    const unicode = minimal_snapshot();
    ascii.sheets[0]!.cells[0]!.cells[0]!.value = {
      kind: "literal",
      value: "a&<>".repeat(256),
    };
    unicode.sheets[0]!.cells[0]!.cells[0]!.value = {
      kind: "literal",
      value: "漢😀&<>".repeat(256),
    };
    const ascii_output = await sheetwriteWorkbookBackend.toXlsxWorkbook(ascii);
    const unicode_output = await sheetwriteWorkbookBackend.toXlsxWorkbook(unicode);
    const ascii_parts = unzipSync(ascii_output);
    const unicode_parts = unzipSync(unicode_output);
    const ascii_accounted =
      Object.values(ascii_parts).reduce((total, part) => total + part.byteLength, 0) +
      Object.keys(ascii_parts).length * 256;
    const unicode_accounted =
      Object.values(unicode_parts).reduce((total, part) => total + part.byteLength, 0) +
      Object.keys(unicode_parts).length * 256;
    expect(unicode_accounted).toBeGreaterThan(ascii_accounted);
    await expect(
      sheetwriteWorkbookBackend.toXlsxWorkbook(ascii, {
        resourceLimits: { maxOutputBytes: ascii_accounted },
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
    try {
      await sheetwriteWorkbookBackend.toXlsxWorkbook(unicode, {
        resourceLimits: { maxOutputBytes: ascii_accounted },
      });
      throw new Error("expected UTF-8 maxOutputBytes rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxResourceError);
      expect((error as XlsxResourceError).resource).toBe("maxOutputBytes");
      expect((error as XlsxResourceError).actual).toBeGreaterThan(ascii_accounted);
    }
  });
});
