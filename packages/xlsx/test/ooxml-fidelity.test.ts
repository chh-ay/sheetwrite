import { describe, expect, it } from "bun:test";

import {
  type CalculationSettings,
  type CellValue,
  type DataValidationComparison,
  dateToSerial,
  formatNumber,
} from "@sheetwrite/core";

import { sheetwriteWorkbookBackend as backend } from "../src/workbook.js";
import {
  BASE_STYLES_BODY,
  PACKAGE_REL,
  rawXlsx,
  type RawXlsxOptions,
  stylesXml,
  TRANSITIONAL_MAIN,
  TRANSITIONAL_REL,
  worksheet,
} from "./raw-opc.js";
import {
  book,
  collectWarnings,
  editParts,
  formula,
  partNames,
  partText,
  range,
  sheet,
  sheetAt,
  valuesOf,
} from "./workbook-fixtures.js";

const literal = (value: string | number): CellValue => ({ kind: "literal", value });
const oneSheet = (body: string, options: Omit<RawXlsxOptions, "sheets"> = {}) =>
  rawXlsx({ ...options, sheets: [{ name: "Raw", xml: worksheet(body, options.strict) }] });
const numberSheet = () =>
  sheet("s", "Sheet1", [], {
    rowCount: 2,
    columns: [{ key: "a", header: "A", width: 80, type: "number" }],
  });
const roundTrip = async (bytes: Uint8Array) =>
  backend.fromXlsxWorkbook(await backend.toXlsxWorkbook(await backend.fromXlsxWorkbook(bytes)));

describe("raw spec-authored OOXML fidelity", () => {
  it("keeps scoped formula names and Excel LAMBDA prefixes through native OOXML", async () => {
    const imported = await backend.fromXlsxWorkbook(
      oneSheet("<sheetData/>", {
        workbookExtra:
          '<definedNames><definedName name="MYFN">_xlfn.LAMBDA(_xlpm.value,_xlpm.value+1)</definedName><definedName name="Rate" localSheetId="0">0.2</definedName></definedNames>',
      }),
    );
    expect(imported.workbook.namedRanges).toEqual([
      { name: "MYFN", formula: "=LAMBDA(value,value+1)" },
      { name: "Rate", scope: sheetAt(imported).id, formula: "=0.2" },
    ]);

    const bytes = await backend.toXlsxWorkbook(imported);
    expect(partText(bytes, "xl/workbook.xml")).toContain(
      '<definedName name="MYFN">_xlfn.LAMBDA(_xlpm.value,_xlpm.value+1)</definedName>',
    );
    expect((await backend.fromXlsxWorkbook(bytes)).workbook.namedRanges).toEqual(
      imported.workbook.namedRanges,
    );
  });

  it("accepts Strict namespaces and relationship types", async () => {
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Strict</t></is></c></row></sheetData>',
        {
          strict: true,
        },
      ),
    );
    expect(valuesOf(imported)).toEqual([literal("Strict")]);
  });

  it("uses a shared master despite wrong slave text and infers 28 omitted references", async () => {
    const cells = Array.from({ length: 28 }, (_, col) =>
      col === 0
        ? '<c><f t="shared" si="0" ref="A1:AB1">\'Q1\'!A1&amp;"A1"</f></c>'
        : `<c><f t="shared" si="0">${col === 1 ? "WRONG1" : ""}</f></c>`,
    ).join("");
    const values = valuesOf(
      await backend.fromXlsxWorkbook(
        oneSheet(`<dimension ref="A1:AB1"/><sheetData><row r="1">${cells}</row></sheetData>`),
      ),
    );
    expect(values).toHaveLength(28);
    expect([values[1], values[26], values[27]]).toEqual([
      formula("='Q1'!B1&\"A1\""),
      formula("='Q1'!AA1&\"A1\""),
      formula("='Q1'!AB1&\"A1\""),
    ]);
  });

  it("moves whole columns and rows of a shared master and keeps names past the last column", async () => {
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        '<dimension ref="A1:D4"/><sheetData>' +
          '<row r="1"><c r="C1"><f t="shared" si="0" ref="C1:D1">SUM(A:A)+XYZ1</f></c><c r="D1"><f t="shared" si="0"/></c></row>' +
          '<row r="3"><c r="A3"><f t="shared" si="1" ref="A3:A4">SUM(1:1)*XFD1</f></c></row>' +
          '<row r="4"><c r="A4"><f t="shared" si="1"/></c></row>' +
          "</sheetData>",
      ),
    );
    expect(valuesOf(imported)).toEqual(
      ["=SUM(A:A)+XYZ1", "=SUM(B:B)+XYZ1", "=SUM(1:1)*XFD1", "=SUM(2:2)*XFD2"].map(formula),
    );
  });

  it("warns and keeps a cell's own text or the master's text when a shared master does not lex", async () => {
    const { warnings, onWarning } = collectWarnings();
    // An unterminated string: the engine's lexer cannot read it.
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        '<dimension ref="A1:A3"/><sheetData>' +
          '<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A3">B1&amp;$C$1&amp;"open</f></c></row>' +
          '<row r="2"><c r="A2"><f t="shared" si="0">B2&amp;$C$1&amp;"own</f></c></row>' +
          '<row r="3"><c r="A3"><f t="shared" si="0"/></c></row>' +
          "</sheetData>",
      ),
      { onWarning },
    );
    expect(valuesOf(imported)).toEqual(
      ['=B1&$C$1&"open', '=B2&$C$1&"own', '=B1&$C$1&"open'].map(formula),
    );
    expect(
      warnings
        .filter((warning) => warning.code === "unsupported-feature")
        .map((warning) => warning.cell),
    ).toEqual(["A2", "A3"]);
  });

  it("neutralizes external formulas and external-link workbook graphs", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      oneSheet('<sheetData><row r="1"><c r="A1"><f>\'[1]Data\'!A1</f></c></row></sheetData>', {
        workbookRelationships: `<Relationship Id="rId9" Type="${TRANSITIONAL_REL}/externalLink" Target="externalLinks/externalLink1.xml"/>`,
      }),
      { onWarning },
    );
    expect(valuesOf(imported)).toEqual([literal("='[1]Data'!A1")]);
    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["external-relationship", "external-formula"]),
    );
  });

  describe("external workbook links", () => {
    const LINK_PART = "xl/externalLinks/externalLink1.xml";
    const linkPart = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><externalLink xmlns="${TRANSITIONAL_MAIN}" xmlns:r="${TRANSITIONAL_REL}"><externalBook r:id="rId1"><sheetNames><sheetName val="Annual Plan"/></sheetNames><sheetDataSet><sheetData sheetId="0"><row r="10"><cell r="C10"><v>7</v></cell><cell r="D10" t="str"><v>North</v></cell></row><row r="11"><cell r="C11"><v>5</v></cell><cell r="D11" t="e"><v>#N/A</v></cell></row></sheetData></sheetDataSet></externalBook></externalLink>`;
    const target = "file:///C:\\Reports\\Budget%202024.xlsx";
    const linked = (formulas: readonly string[], part = linkPart) =>
      oneSheet(
        `<sheetData>${formulas.map((source, row) => `<row r="${row + 1}"><c r="A${row + 1}"><f>${source}</f></c></row>`).join("")}</sheetData>`,
        {
          workbookExtra:
            '<externalReferences><externalReference r:id="rId9"/></externalReferences>',
          workbookRelationships: `<Relationship Id="rId9" Type="${TRANSITIONAL_REL}/externalLink" Target="externalLinks/externalLink1.xml"/>`,
          extraOverrides: [
            '<Override PartName="/xl/externalLinks/externalLink1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"/>',
          ],
          extraFiles: {
            [LINK_PART]: part,
            "xl/externalLinks/_rels/externalLink1.xml.rels": `<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${TRANSITIONAL_REL}/externalLinkPath" Target="${target}" TargetMode="External"/></Relationships>`,
          },
        },
      );
    const SHEET_PART = "xl/worksheets/sheet1.xml";

    it("imports the saved values and keeps formulas that read them live", async () => {
      const imported = await backend.fromXlsxWorkbook(
        linked(["SUM('[1]Annual Plan'!C10:C11)", "'[1]Annual Plan'!D11"]),
      );
      expect(imported.workbook.externalLinks).toEqual([
        {
          book: "Budget 2024.xlsx",
          target,
          sheets: [
            {
              name: "Annual Plan",
              cells: [
                { row: 9, col: 2, value: 7 },
                { row: 9, col: 3, value: "North" },
                { row: 10, col: 2, value: 5 },
                { row: 10, col: 3, value: { error: "#N/A" } },
              ],
            },
          ],
        },
      ]);
      expect(valuesOf(imported)).toEqual([
        formula("=SUM('[Budget 2024.xlsx]Annual Plan'!C10:C11)"),
        formula("='[Budget 2024.xlsx]Annual Plan'!D11"),
      ]);
    });

    it("writes an unchanged link back byte for byte and a changed one from its values", async () => {
      const imported = await backend.fromXlsxWorkbook(linked(["SUM('[1]Annual Plan'!C10:C11)"]));
      const kept = await backend.toXlsxWorkbook(imported);
      expect(partText(kept, LINK_PART)).toBe(linkPart);
      expect(partText(kept, "xl/workbook.xml")).toMatch(
        /<\/sheets><externalReferences><externalReference r:id="rId\d+"\/><\/externalReferences>/,
      );
      expect(partText(kept, SHEET_PART)).toContain(
        "<f>SUM(&apos;[1]Annual Plan&apos;!C10:C11)</f>",
      );

      const changed = structuredClone(imported);
      const linkedCell = changed.workbook.externalLinks?.[0]?.sheets[0]?.cells[0];
      if (!linkedCell) throw new Error("the link has no saved cell");
      linkedCell.value = 9;
      const changedSheet = sheetAt(changed);
      changedSheet.rowCount = 2;
      changedSheet.cells.push({
        startRow: 1,
        startCol: 0,
        rowCount: 1,
        colCount: 1,
        cells: [{ rowOffset: 0, colOffset: 0, value: formula("=[Sales.xlsx]Q1!A1") }],
      });
      const written = await backend.toXlsxWorkbook(changed);
      expect(partNames(written)).not.toContain(LINK_PART);
      expect(partText(written, "xl/externalLinks/sheetwriteLink1.xml")).toContain(
        '<cell r="C10"><v>9</v></cell>',
      );
      expect(partText(written, "xl/externalLinks/sheetwriteLink2.xml")).toContain(
        '<sheetName val="Q1"/>',
      );
      expect(partText(written, SHEET_PART)).toContain(
        "<f>SUM(&apos;[1]Annual Plan&apos;!C10:C11)</f>",
      );
      expect(partText(written, SHEET_PART)).toContain("<f>[2]Q1!A1</f>");
      const reimported = await backend.fromXlsxWorkbook(written);
      expect(reimported.workbook.externalLinks?.map((link) => link.book)).toEqual([
        "Budget 2024.xlsx",
        "Sales.xlsx",
      ]);
    });

    // ECMA-376 Part 1, §18.14.5: a link part keeps the defined names of the
    // linked workbook, and `[1]!Total` names one in a formula.
    it("imports, keeps and rewrites the defined names of a link and formulas that use them", async () => {
      const namedPart = linkPart.replace(
        "</sheetNames>",
        '</sheetNames><definedNames><definedName name="Total" refersTo="=\'Annual Plan\'!$C$10"/>' +
          '<definedName name="Local" refersTo="=\'Annual Plan\'!$C$11" sheetId="0"/></definedNames>',
      );
      const imported = await backend.fromXlsxWorkbook(
        linked(["[1]!Total*2", "'[1]Annual Plan'!Local"], namedPart),
      );
      const names = [
        { name: "Total", refersTo: "='Annual Plan'!$C$10" },
        { name: "Local", refersTo: "='Annual Plan'!$C$11", sheet: "Annual Plan" },
      ];
      expect(imported.workbook.externalLinks?.[0]?.names).toEqual(names);
      expect(valuesOf(imported)).toEqual([
        formula("='Budget 2024.xlsx'!Total*2"),
        formula("='[Budget 2024.xlsx]Annual Plan'!Local"),
      ]);

      const kept = await backend.toXlsxWorkbook(imported);
      expect(partText(kept, SHEET_PART)).toContain("<f>[1]!Total*2</f>");
      expect(partText(kept, LINK_PART)).toBe(namedPart);

      const changed = structuredClone(imported);
      const linkedCell = changed.workbook.externalLinks?.[0]?.sheets[0]?.cells[0];
      if (!linkedCell) throw new Error("the link has no saved cell");
      linkedCell.value = 9;
      const written = await backend.toXlsxWorkbook(changed);
      expect(partText(written, "xl/externalLinks/sheetwriteLink1.xml")).toContain(
        '<sheetNames><sheetName val="Annual Plan"/></sheetNames><definedNames>' +
          '<definedName name="Total" refersTo="=&apos;Annual Plan&apos;!$C$10"/>' +
          '<definedName name="Local" refersTo="=&apos;Annual Plan&apos;!$C$11" sheetId="0"/>' +
          "</definedNames><sheetDataSet>",
      );
      expect((await backend.fromXlsxWorkbook(written)).workbook.externalLinks?.[0]?.names).toEqual(
        names,
      );
    });
  });

  it("converts date1904 serials, preserves serial 60, and parses t=d as UTC wall time", async () => {
    const styles = stylesXml(BASE_STYLES_BODY.replace('numFmtId="0"', 'numFmtId="14"'));
    const body =
      '<sheetData><row r="1"><c r="A1" s="0"><v>0</v></c><c r="B1" s="0"><v>60</v></c><c r="C1" t="d"><v>2020-01-02T03:04:05</v></c></row></sheetData>';
    const mac = await backend.fromXlsxWorkbook(
      oneSheet(body, { workbookPr: '<workbookPr date1904="1"/>', styles }),
    );
    expect(valuesOf(mac)).toEqual([
      literal(1462),
      literal(1522),
      literal(dateToSerial(new Date(Date.UTC(2020, 0, 2, 3, 4, 5)))),
    ]);
    expect(valuesOf(await backend.fromXlsxWorkbook(oneSheet(body, { styles })))[1]).toEqual(
      literal(60),
    );

    // The 1904 workbook's serials 0 and 60 import as 1900-system serials 1462 and 1522 and
    // show as real 1904 dates: the 1904 system has no fictional day. Only the 1900
    // workbook's serial 60 shows as 29 February 1900.
    expect(formatNumber(1462, "yyyy-mm-dd dddd")).toBe("1904-01-01 Friday");
    expect(formatNumber(1522, "yyyy-mm-dd dddd")).toBe("1904-03-01 Tuesday");
    expect(formatNumber(1521, "yyyy-mm-dd")).toBe("1904-02-29");
    expect(formatNumber(60, "yyyy-mm-dd dddd")).toBe("1900-02-29 Wednesday");
  });

  it("maps validation defaults, policies, whole semantics, and multiple ranges without broadening", async () => {
    const decimal = (attributes: string, sqref: string) =>
      `<dataValidation type="decimal" operator="between" showErrorMessage="1" ${attributes} sqref="${sqref}"><formula1>0</formula1><formula2>1</formula2></dataValidation>`;
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        `<dimension ref="A1:D2"/><sheetData/><dataValidations count="4"><dataValidation type="whole" operator="between" sqref="A1 A2"><formula1>1</formula1><formula2>3</formula2></dataValidation><dataValidation type="decimal" operator="equal" showErrorMessage="1" errorStyle="stop" sqref="B1"><formula1>2</formula1></dataValidation>${decimal('errorStyle="warning"', "C1")}${decimal(`errorStyle="information" prompt="${"x".repeat(256)}"`, "D1")}</dataValidations>`,
      ),
      { onWarning },
    );
    const rules = sheetAt(imported).validationRules ?? [];
    expect(rules[0]).toMatchObject({
      condition: { kind: "number", min: 1, max: 3, integer: true },
      policy: "allow",
      allowBlank: false,
    });
    expect(rules.map((rule) => rule.policy)).toEqual(["allow", "allow", "reject", "warn", "warn"]);
    expect(rules.at(-1)?.helpText).toBeUndefined();
    expect(warnings).toContainEqual(expect.objectContaining({ code: "validation-loss" }));
  });

  it("maps every native validation comparison operator without broadening", async () => {
    const comparisons: DataValidationComparison[] = [
      { operator: "between", min: 2, max: 4 },
      { operator: "notBetween", min: 2, max: 4 },
      { operator: "equal", value: 2 },
      { operator: "notEqual", value: 2 },
      { operator: "greaterThan", value: 2 },
      { operator: "lessThan", value: 2 },
      { operator: "greaterThanOrEqual", value: 2 },
      { operator: "lessThanOrEqual", value: 2 },
    ];
    // Operators with a range form import as min/max; the others keep their comparison.
    const asRange: Partial<Record<DataValidationComparison["operator"], object>> = {
      between: { min: 2, max: 4 },
      equal: { min: 2, max: 2 },
      greaterThanOrEqual: { min: 2 },
      lessThanOrEqual: { max: 2 },
    };
    const kinds = {
      whole: { kind: "number", integer: true },
      decimal: { kind: "number" },
      date: { kind: "date" },
      textLength: { kind: "textLength" },
    };
    const nativeRules = Object.keys(kinds).flatMap((type) =>
      comparisons.map((comparison) => {
        const formulas =
          "value" in comparison
            ? `<formula1>${comparison.value}</formula1>`
            : `<formula1>${comparison.min}</formula1><formula2>${comparison.max}</formula2>`;
        return `<dataValidation type="${type}" operator="${comparison.operator}" showErrorMessage="1" sqref="A1">${formulas}</dataValidation>`;
      }),
    );
    const { warnings, onWarning } = collectWarnings();
    const imported = await backend.fromXlsxWorkbook(
      oneSheet(
        `<dimension ref="A1"/><sheetData/><dataValidations count="${nativeRules.length}">${nativeRules.join("")}</dataValidations>`,
      ),
      { onWarning },
    );
    expect(warnings).toEqual([]);
    const rules = sheetAt(imported).validationRules ?? [];
    expect(rules).toHaveLength(nativeRules.length);
    expect(rules.map((rule) => rule.condition)).toEqual(
      expect.arrayContaining(
        Object.values(kinds).flatMap((kind) =>
          comparisons.map((comparison) => ({
            ...kind,
            ...(asRange[comparison.operator] ?? { comparison }),
          })),
        ),
      ),
    );

    const source = book([
      {
        ...numberSheet(),
        validationRules: comparisons.map((comparison, index) => ({
          id: `comparison-${index}`,
          range: range("s", 0, 0),
          condition: { kind: "number", comparison },
          policy: "reject",
        })),
      },
    ]);
    const exported = await backend.toXlsxWorkbook(source);
    const xml = partText(exported, "xl/worksheets/sheet1.xml");
    expect(xml).toContain(`<dataValidations count="${comparisons.length}">`);
    for (const comparison of comparisons)
      expect(xml).toContain(`operator="${comparison.operator}"`);
    const roundTripped = await backend.fromXlsxWorkbook(exported);
    expect(sheetAt(roundTripped).validationRules?.map((rule) => rule.condition)).toEqual(
      expect.arrayContaining(
        comparisons
          .filter((comparison) => !asRange[comparison.operator])
          .map((comparison) => ({ kind: "number", comparison })),
      ),
    );
  });

  it("resolves theme tint and indexed colors for font, solid fill, and border zero", async () => {
    const theme = `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Raw"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>`;
    const styles = stylesXml(
      '<fonts count="1"><font><color theme="1"/><sz val="12"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor theme="4" tint="0.4"/></patternFill></fill></fills><borders count="1"><border><left style="thin"><color indexed="2"/></left></border></borders><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="2" borderId="0"/></cellXfs>',
    );
    const imported = await backend.fromXlsxWorkbook(
      oneSheet('<sheetData><row r="1"><c r="A1" s="0"><v>1</v></c></row></sheetData>', {
        styles,
        theme,
      }),
    );
    const style = sheetAt(imported).cells[0]?.cells[0]?.style;
    expect(style).toMatchObject({
      color: "#000000",
      backgroundColor: "#8EA9DB",
      border: { left: { color: "#FF0000", width: 1, style: "solid" } },
    });
    // Font 0 is the workbook default, so its 12pt size is not a per-cell style.
    expect(style?.fontSize).toBeUndefined();
  });

  it("escapes SpreadsheetML control tokens without confusing literal escape text", async () => {
    const text = "\u0001_x0041_😀";
    const bytes = await backend.toXlsxWorkbook(book([sheet("s", "Sheet1", [[text]])]));
    expect(partText(bytes, "xl/worksheets/sheet1.xml")).toContain("_x0001__x005F_x0041_😀");
    expect(valuesOf(await backend.fromXlsxWorkbook(bytes))).toEqual([literal(text)]);
  });

  it("reads calcPr iteration settings, repairs damaged limits, and writes them back", async () => {
    const cases: [calcPr: string, expected: CalculationSettings | undefined][] = [
      [
        '<calcPr calcId="191029" iterate="1" iterateCount="50" iterateDelta="0.01"/>',
        { iterate: true, maxIterations: 50, maxChange: 0.01 },
      ],
      // Limits set while iteration is off survive, so turning it on later keeps them.
      ['<calcPr iterateCount="7"/>', { iterate: false, maxIterations: 7, maxChange: 0.001 }],
      [
        '<calcPr iterate="true" iterateCount="40000" iterateDelta="-1"/>',
        { iterate: true, maxIterations: 32_767, maxChange: 0.001 },
      ],
      ['<calcPr calcId="191029" iterateCount="100" iterateDelta="0.001"/>', undefined],
    ];
    for (const [calcPr, expected] of cases) {
      const bytes = oneSheet("<sheetData/>", { workbookExtra: calcPr });
      expect((await backend.fromXlsxWorkbook(bytes)).workbook.calculation).toEqual(expected);
      expect((await roundTrip(bytes)).workbook.calculation).toEqual(expected);
    }

    const plain = await backend.toXlsxWorkbook(book([numberSheet()]));
    expect(partText(plain, "xl/workbook.xml")).toContain(
      '<calcPr fullCalcOnLoad="1" forceFullCalc="1"/>',
    );
    const iterative = book([numberSheet()], {
      calculation: { iterate: true, maxIterations: 50, maxChange: 0.01 },
    });
    expect(partText(await backend.toXlsxWorkbook(iterative), "xl/workbook.xml")).toContain(
      '<calcPr fullCalcOnLoad="1" iterate="1" iterateCount="50" iterateDelta="0.01" forceFullCalc="1"/>',
    );
  });

  it("writes every canonical conditional predicate and direct whole-sheet sort state natively", async () => {
    const target = range("s", 0, 0, 1, 0);
    const style = {
      bold: true,
      color: "#112233",
      backgroundColor: "#DDEEFF",
      border: { all: { color: "#334455", width: 2, style: "dotted" as const } },
      align: "right" as const,
      wrap: true,
    };
    const source = book([
      {
        ...numberSheet(),
        conditionalFormats: [
          { range: target, when: { kind: "greaterThan", value: 4 }, style },
          { range: target, when: { kind: "lessThan", value: 9 }, style },
          { range: target, when: { kind: "equal", value: true }, style },
          { range: target, when: { kind: "equal", value: null }, style },
          { range: target, when: { kind: "contains", text: "fold" }, style },
          { range: target, when: { kind: "contains", text: "Case", matchCase: true }, style },
        ],
        sortKeys: [{ col: 0, ascending: false }],
      },
    ]);
    const bytes = await backend.toXlsxWorkbook(source);
    const xml = partText(bytes, "xl/worksheets/sheet1.xml");
    for (const type of ["cellIs", "containsBlanks", "containsText", "expression"]) {
      expect(xml).toContain(`type="${type}"`);
    }
    expect(xml).toContain('<sortState ref="A1:A2">');
    const styles = partText(bytes, "xl/styles.xml");
    expect(styles).toContain('<dxfs count="1">');
    expect(styles).toContain('<patternFill><bgColor rgb="FFDDEEFF"/></patternFill>');
    const imported = sheetAt(await backend.fromXlsxWorkbook(bytes));
    expect(imported.conditionalFormats).toEqual(sheetAt(source).conditionalFormats);
    expect(imported.sortKeys).toEqual(sheetAt(source).sortKeys);

    const externallyEdited = await backend.fromXlsxWorkbook(
      editParts(bytes, {
        "xl/worksheets/sheet1.xml": (text) =>
          text.replace("<formula>4</formula>", "<formula>6</formula>"),
        "xl/styles.xml": (text) => text.replace("FFDDEEFF", "FFABCDEF"),
      }),
    );
    expect(sheetAt(externallyEdited).conditionalFormats?.[0]).toMatchObject({
      when: { kind: "greaterThan", value: 6 },
      style: { backgroundColor: "#ABCDEF" },
    });
  });

  it("warns rather than changing header-filter or authorization semantics", async () => {
    const { warnings, onWarning } = collectWarnings();
    const imported = sheetAt(
      await backend.fromXlsxWorkbook(
        oneSheet(
          '<dimension ref="A1:A2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Header</t></is></c></row><row r="2"><c r="A2"><v>1</v></c></row></sheetData><sheetProtection sheet="1"/><autoFilter ref="A1:A2"><filterColumn colId="0"><filters><filter val="1"/></filters></filterColumn></autoFilter><sortState ref="A1:A2"><sortCondition ref="A1:A2" descending="1"/></sortState>',
        ),
        { onWarning },
      ),
    );
    expect([imported.filters, imported.protectedRanges, imported.sortKeys]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(imported.sortState?.attributes.ref).toBe("A1:A2");
    expect(warnings).toEqual([
      expect.objectContaining({ code: "unsupported-feature", sheet: "Raw" }),
      expect.objectContaining({ code: "unsupported-feature", sheet: "Raw" }),
    ]);
  });
});
