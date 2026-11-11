import { describe, expect, it } from "bun:test";

import type { WorkbookSnapshot } from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import { rawXlsx, TRANSITIONAL_REL, worksheet } from "./raw-opc.js";
import { book, collectWarnings, partText, range, sheet, sheetAt } from "./workbook-fixtures.js";

/** A source sheet with A1 "Report" and the extra worksheet parts, beside an empty destination sheet. */
function authoredVector(
  options: { worksheetExtra?: string; target?: string; external?: boolean } = {},
): Uint8Array {
  return rawXlsx({
    sheets: [
      {
        name: "Source",
        xml: worksheet(
          `<dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Report</t></is></c></row></sheetData>${options.worksheetExtra ?? ""}`,
        ),
        ...(options.target
          ? {
              relationships: `<Relationship Id="rId1" Type="${TRANSITIONAL_REL}/hyperlink" Target="${options.target}"${options.external === false ? "" : ' TargetMode="External"'}/>`,
            }
          : {}),
      },
      { name: "Destination Sheet", xml: worksheet('<dimension ref="A1:B2"/><sheetData/>') },
    ],
  });
}

function sourceSnapshot(): WorkbookSnapshot {
  return book([
    sheet(
      "source",
      "Source",
      [
        ["Report", null],
        ["Destination", null],
      ],
      {
        rowCount: 2,
        hyperlinks: [
          {
            id: "external-link",
            range: range("source", 0, 0),
            target: { kind: "external", url: "https://example.com/report?q=1" },
            display: "Report",
            style: { color: "#123456", underline: true },
          },
          {
            id: "internal-link",
            range: range("source", 1, 0),
            target: { kind: "internal", range: range("destination", 1, 1) },
            display: "Destination",
          },
        ],
        conditionalFormats: [
          {
            range: range("source", 0, 1, 1, 1),
            when: { kind: "formula", source: '=A1<>""' },
            style: { backgroundColor: "#ABCDEF", bold: true },
            stopIfTrue: true,
          },
        ],
      },
    ),
    sheet("destination", "Destination Sheet", [[null, null], []]),
  ]);
}

describe("XLSX hyperlink and conditional-format fidelity", () => {
  it.each([
    ['ref="A1" r:id="rId1"', "Report"],
    ['ref="A1" location="&apos;Destination Sheet&apos;!A1"', "Report"],
    ['ref="A1" r:id="rId1" display="Explicit"', "Explicit"],
    ['ref="A1" r:id="rId1" display=""', ""],
  ])("uses cell text only when hyperlink display is omitted: %s", async (attributes, display) => {
    const imported = await backend.fromXlsxWorkbook(
      authoredVector({
        worksheetExtra: `<hyperlinks><hyperlink ${attributes}/></hyperlinks>`,
        target: "https://example.com/report",
      }),
    );
    expect(sheetAt(imported).hyperlinks?.[0]?.display).toBe(display);
    const reimported = await backend.fromXlsxWorkbook(await backend.toXlsxWorkbook(imported));
    expect(sheetAt(reimported).hyperlinks?.[0]?.display).toBe(display);
  });

  it("round-trips external relationships, stable internal targets, display/style, formula, and stop", async () => {
    const source = sourceSnapshot();
    const bytes = await backend.toXlsxWorkbook(source);
    const sheetXml = partText(bytes, "xl/worksheets/sheet1.xml");
    expect(sheetXml).toContain('<hyperlink ref="A1" r:id="rId1" display="Report"/>');
    expect(sheetXml).toContain('location="&apos;Destination Sheet&apos;!B2"');
    expect(sheetXml).toContain('type="expression"');
    expect(sheetXml).toContain('stopIfTrue="1"');
    expect(partText(bytes, "xl/worksheets/_rels/sheet1.xml.rels")).toContain(
      'Target="https://example.com/report?q=1" TargetMode="External"',
    );

    const imported = sheetAt(await backend.fromXlsxWorkbook(bytes));
    expect(imported.hyperlinks).toEqual(sheetAt(source).hyperlinks);
    expect(imported.conditionalFormats).toEqual(sheetAt(source).conditionalFormats);
  });

  it("drops unsafe external schemes with a warning and rejects traversing internal targets", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      authoredVector({
        worksheetExtra:
          '<hyperlinks><hyperlink ref="A1" r:id="rId1" display="Unsafe"/></hyperlinks>',
        target: "javascript:alert(1)",
      }),
      { onWarning },
    );
    expect(sheetAt(imported).hyperlinks ?? []).toEqual([]);
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: "hyperlink", sheet: "Source", cell: "A1" }),
    );

    const traversal = authoredVector({
      worksheetExtra: '<hyperlinks><hyperlink ref="A1" r:id="rId1"/></hyperlinks>',
      target: "../../../escape.xml",
      external: false,
    });
    await expect(backend.fromXlsxWorkbook(traversal)).rejects.toMatchObject({
      operation: "xlsx-import",
    });
  });

  it("emits exact per-kind warnings and keeps only the bounded 32-rule prefix", async () => {
    const { warnings, onWarning } = collectWarnings();
    const rules = Array.from(
      { length: 33 },
      (_, index) =>
        `<conditionalFormatting sqref="A1"><cfRule type="expression" priority="${index + 10}"><formula>TRUE</formula></cfRule></conditionalFormatting>`,
    ).join("");
    const imported = await backend.fromXlsxWorkbook(
      authoredVector({
        worksheetExtra: `<conditionalFormatting sqref="A1"><cfRule type="colorScale" priority="2"><colorScale/></cfRule></conditionalFormatting><conditionalFormatting sqref="A1"><cfRule type="dataBar" priority="3"><dataBar/></cfRule></conditionalFormatting>${rules}`,
      }),
      { onWarning },
    );
    expect(sheetAt(imported).conditionalFormats).toHaveLength(32);
    expect(
      warnings.filter((warning) => warning.code === "format-loss").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("drops malformed, unsafe, and over-budget conditional rules independently", async () => {
    const { warnings, onWarning } = collectWarnings();
    const rules = [
      '<cfRule type="cellIs" priority="-1" operator="equal"><formula>1</formula></cfRule>',
      '<cfRule type="cellIs" priority="2" operator="between"><formula>1</formula></cfRule>',
      `<cfRule type="expression" priority="3"><formula>=${"A".repeat(8_192)}</formula></cfRule>`,
      '<cfRule type="expression" priority="4"><formula>[1]Sheet1!A1</formula></cfRule>',
      '<cfRule type="containsBlanks" priority="5" dxfId="bad"/>',
      '<cfRule type="containsBlanks" priority="6" dxfId="999"/>',
    ].join("");
    const imported = await backend.fromXlsxWorkbook(
      authoredVector({
        worksheetExtra: `<conditionalFormatting sqref="A1">${rules}</conditionalFormatting>`,
      }),
      { onWarning },
    );
    expect(sheetAt(imported).conditionalFormats).toBeUndefined();
    expect(
      warnings.filter((warning) => warning.code === "format-loss").length,
    ).toBeGreaterThanOrEqual(6);
  });
});
