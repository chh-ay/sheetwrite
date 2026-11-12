import { beforeAll, expect, it } from "bun:test";

import {
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxWorkbook,
  withXlsxFormulaEngine,
} from "@sheetwrite/core";

import { xlsxAddon } from "../src/index.js";
import { escapeXml } from "../src/xml.js";
import { rawXlsx, worksheet } from "./raw-opc.js";
import { book, formula, partText, sheet, sheetNamed, valuesOf } from "./workbook-fixtures.js";

const INVENTORY = (await Bun.file(
  new URL("../../../test/conformance/formula-contract.inventory.json", import.meta.url),
).json()) as { functions: { canonical: string; contractStatus: string }[] };

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

const column = (sources: readonly string[]) => sources.map((src) => [formula(src)]);

it("round-trips every required function source and writes Excel's native spellings", async () => {
  // [editor source, native OOXML text]; an empty native text is only checked by the round trip.
  const cases: [string, string][] = [
    ...INVENTORY.functions
      .filter((entry) => entry.contractStatus === "required-supported")
      .map((entry): [string, string] => [`=${entry.canonical}()`, ""]),
    ["={1,2;3,4}", ""],
    ["=SUM({1,2,3})", ""],
    ['={"A1",TRUE,#N/A}', ""],
    ["=LET(x,1,x+1)", "_xlfn.LET(_xlpm.x,1,_xlpm.x+1)"],
    ["=LAMBDA(v,v+1)(2)", "_xlfn.LAMBDA(_xlpm.v,_xlpm.v+1)(2)"],
    ["=XLOOKUP(1,A1:A3,B1:B3)", "_xlfn.XLOOKUP(1,A1:A3,B1:B3)"],
    ["=FILTER(A1:A3,A1:A3>0)", "_xlfn._xlws.FILTER(A1:A3,A1:A3>0)"],
    ["=SORT(A1:A3)", "_xlfn._xlws.SORT(A1:A3)"],
    [
      "=LET(x,'_xlfn.Sheet'!A1,\"_xlfn.LET(_xlpm.x)\"&x)",
      "_xlfn.LET(_xlpm.x,'_xlfn.Sheet'!A1,\"_xlfn.LET(_xlpm.x)\"&_xlpm.x)",
    ],
    // Spill references use Excel's ANCHORARRAY; the quoted text is not a reference and keeps its `#`.
    ["=SUM(A1#)", "SUM(_xlfn.ANCHORARRAY(A1))"],
    ["='My Sheet'!$B$2#", "_xlfn.ANCHORARRAY('My Sheet'!$B$2)"],
    ['=LEN("A1#")&C3#', 'LEN("A1#")&_xlfn.ANCHORARRAY(C3)'],
  ];
  const sources = cases.map(([source]) => source);
  expect(new Set(sources).size).toBe(sources.length);
  const encoded = await toXlsxWorkbook(book([sheet("formula", "Formula Source", column(sources))]));

  const native = partText(encoded, "xl/worksheets/sheet1.xml");
  for (const [, expected] of cases) {
    if (expected) expect(native).toContain(`<f>${escapeXml(expected)}</f>`);
  }
  expect(valuesOf(await fromXlsxWorkbook(encoded))).toEqual(sources.map(formula));
});

// Export skips the engine for a source with no `(` and no `#`, because the
// engine's export spelling only changes calls and spill references.
it("keeps every source without a call or spill reference unchanged in the export spelling", async () => {
  const sources = [
    "=A1+B1",
    "='My Sheet'!$A$1:$B$2*2",
    "=Table1[Amount]",
    "=Rate*-A1%",
    "=_xlpm.x+LET",
    "=A1:A3 B2:B4",
    "=@A1:A3",
    "={1,2;3,4}",
    "=[Budget.xlsx]Annual!C10",
    '="text"&TRUE',
  ];
  expect(await withXlsxFormulaEngine((engine) => engine.convert(sources, "export"))).toEqual(
    sources,
  );
});

it("strips prefixes after expanding shared formulas without shifting local names", async () => {
  const encoded = rawXlsx({
    sheets: [
      {
        xml: worksheet(`<sheetData>
          <row r="1"><c r="B1"><f t="shared" si="0" ref="B1:B2">_xlfn.LET(_xlpm.x,A1,_xlfn.LAMBDA(_xlpm.v,_xlpm.v+_xlpm.x)(2))</f></c></row>
          <row r="2"><c r="B2"><f t="shared" si="0"/></c></row>
        </sheetData>`),
      },
    ],
  });
  expect(valuesOf(await fromXlsxWorkbook(encoded))).toEqual([
    formula("=LET(x,A1,LAMBDA(v,v+x)(2))"),
    formula("=LET(x,A2,LAMBDA(v,v+x)(2))"),
  ]);
});

it("writes reference operators as Excel text and recalculates them after import", async () => {
  const sources = [
    "=SUM(Jan:Mar!A1)",
    "=SUM((Jan!A1,Mar!A1))",
    "=SUM(Jan!A1:A3 Jan!A2:A4)",
    "=INDEX((Jan!A1:A4,Feb!A1),1,1,2)",
    "=SUM('Jan:Q1 Close'!A1)",
  ];
  const encoded = await toXlsxWorkbook(
    book(
      [
        sheet("jan", "Jan", [[1], [2], [3], [4]]),
        sheet("feb", "Feb", [[10]]),
        sheet("mar", "Mar", [[100]]),
        sheet("close", "Q1 Close", [[1000]]),
        sheet("summary", "Summary", column(sources)),
      ],
      { activeSheet: "summary" },
    ),
  );
  const summaryXml = partText(encoded, "xl/worksheets/sheet5.xml");
  for (const source of sources)
    expect(summaryXml).toContain(`<f>${escapeXml(source.slice(1))}</f>`);

  const decoded = await fromXlsxWorkbook(encoded);
  const summary = sheetNamed(decoded, "Summary");
  expect(valuesOf(decoded, decoded.sheets.indexOf(summary))).toEqual(sources.map(formula));
  const store = SheetwriteStore.fromSnapshot(decoded);
  expect(
    sources.map((_, row) => store.getCell({ sheet: summary.id, row, col: 0 }).resolved),
  ).toEqual([111, 101, 5, 10, 1111]);
  store.dispose();
});
