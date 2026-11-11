import { beforeAll, describe, expect, it } from "bun:test";

import type { DataValidationCondition, XlsxWorkbookWarning } from "@sheetwrite/core";
import { fromXlsxWorkbook, initSheetwrite } from "@sheetwrite/core";
import { strFromU8, unzipSync } from "fflate";

import { xlsxAddon } from "../src/index.js";
import { collectWarnings, sheetAt, sheetNamed } from "./workbook-fixtures.js";

interface ExternalFixture {
  file: string;
  path: string;
  sha256: string;
  producer: string;
  appVersion: string;
}
interface GoogleExternalFixture {
  file: string;
  sourcePage: string;
  downloadUrl: string;
  contentSha256: string;
  producer: "Google Sheets";
  redistributed: false;
}

const manifest = (await Bun.file(
  new URL("fixtures/external-corpus.json", import.meta.url),
).json()) as {
  commit: string;
  fixtures: ExternalFixture[];
  googleFixtures: GoogleExternalFixture[];
};
const externalDirectory = process.env.SHEETWRITE_EXTERNAL_XLSX_DIR;
const scheduledIt =
  process.env.SHEETWRITE_EXTERNAL_XLSX === "1" || externalDirectory ? it : it.skip;

function warningCounts(warnings: readonly XlsxWorkbookWarning[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const warning of warnings) counts[warning.message] = (counts[warning.message] ?? 0) + 1;
  return counts;
}

function archiveContentSha256(archive: Record<string, Uint8Array>): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const [name, content] of Object.entries(archive).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hasher.update(name).update("\0").update(content).update("\0");
  }
  return hasher.digest("hex");
}

async function fixtureBytes(fixture: ExternalFixture | GoogleExternalFixture): Promise<Uint8Array> {
  if (externalDirectory) {
    return new Uint8Array(await Bun.file(`${externalDirectory}/${fixture.file}`).arrayBuffer());
  }
  const url =
    "downloadUrl" in fixture
      ? fixture.downloadUrl
      : `https://raw.githubusercontent.com/apache/poi/${manifest.commit}/${fixture.path}`;
  const response = await fetch(url);
  expect(response.ok).toBe(true);
  return new Uint8Array(await response.arrayBuffer());
}

/** The rows of DataValidations-49244.xlsx and their conditions; whole-number rules carry `integer`. */
function validationRows(): { row: number; condition: DataValidationCondition }[] {
  const compare = (operator: string, value: number) => ({ comparison: { operator, value } });
  const outside = (min: number, max: number) => ({
    comparison: { operator: "notBetween", min, max },
  });
  const rows: [number, string, object, boolean?][] = [
    [5, "number", compare("greaterThan", 0), true],
    [7, "number", { min: 2 }, true],
    [9, "number", compare("lessThan", 4), true],
    [10, "number", { max: 6 }, true],
    [11, "number", { min: 8, max: 8 }, true],
    [12, "number", compare("notEqual", 10), true],
    [13, "number", { min: 1, max: 5 }, true],
    [14, "number", outside(1, 5), true],
    [18, "number", compare("greaterThan", 0.05)],
    [19, "number", { min: 2.05 }],
    [20, "number", compare("lessThan", 4.05)],
    [21, "number", { max: 6.05 }],
    [22, "number", { min: 8.01, max: 8.01 }],
    [23, "number", compare("notEqual", 1.01)],
    [24, "number", { min: 1.01, max: 4.99 }],
    [25, "number", outside(1.01, 4.99)],
    [28, "textLength", compare("greaterThan", 0)],
    [29, "textLength", { min: 2 }],
    [30, "textLength", compare("lessThan", 4)],
    [31, "textLength", { max: 6 }],
    [32, "textLength", { min: 8, max: 8 }],
    [33, "textLength", compare("notEqual", 10)],
    [34, "textLength", { min: 1, max: 5 }],
    [35, "textLength", outside(1, 5)],
  ];
  return [
    { row: 1, condition: { kind: "list", values: ["IN", "US", "UK"] } },
    ...rows.map(([row, kind, fields, integer]) => ({
      row,
      condition: { kind, ...fields, ...(integer ? { integer } : {}) } as DataValidationCondition,
    })),
  ];
}

beforeAll(async () => {
  await initSheetwrite({ addons: [xlsxAddon()] });
});

describe("scheduled independent Microsoft Excel corpus", () => {
  for (const fixture of manifest.fixtures) {
    scheduledIt(`imports checksum-locked ${fixture.file}`, async () => {
      const bytes = await fixtureBytes(fixture);
      expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
      const archive = unzipSync(bytes);
      const appXml = strFromU8(archive["docProps/app.xml"] ?? new Uint8Array());
      expect(appXml).toContain(`<Application>${fixture.producer}</Application>`);
      expect(appXml).toContain(`<AppVersion>${fixture.appVersion}</AppVersion>`);

      const { warnings, onWarning } = collectWarnings();
      const snapshot = await fromXlsxWorkbook(bytes, { onWarning });
      const cells = snapshot.sheets.flatMap((sheet) => sheet.cells.flatMap((block) => block.cells));
      const first = sheetAt(snapshot);

      if (fixture.file === "FormulaSheetRange.xlsx") {
        expect(archive["xl/sharedStrings.xml"]).toBeDefined();
        expect(snapshot.workbook.activeSheet).toBe("test");
        expect(snapshot.sheets.map((sheet) => sheet.name)).toEqual([
          "test",
          "Sheet2",
          "Sheet3",
          "Sheet4",
          "Sheet5",
        ]);
        expect(cells[0]?.value).toEqual({ kind: "literal", value: "POI Formulae Test" });
        expect(cells.map((cell) => cell.value).filter((value) => value.kind === "formula")).toEqual(
          [
            { kind: "formula", src: "=SUM(Sheet2:Sheet5!A11)" },
            { kind: "formula", src: "=SUM(Sheet2:Sheet5!A12:C12)" },
          ],
        );
        expect(cells.some((cell) => cell.style?.bold === true)).toBe(true);
        expect(warnings).toEqual([]);
      } else if (fixture.file === "DateFormatTests.xlsx") {
        expect(cells.filter((cell) => cell.value.kind === "formula")).toHaveLength(45);
        expect(snapshot.sheets.slice(0, 2).map((sheet) => sheet.frozenRows)).toEqual([1, 1]);
        expect(sheetAt(snapshot, 1).columns[2]?.numberFormat).toBe(
          "dd\\-mmm\\-yyyy\\ hh:mm:ss.000",
        );
        expect(cells.some((cell) => cell.style?.italic === true)).toBe(true);
        expect(cells.some((cell) => cell.style?.wrap === true)).toBe(true);
        expect(warnings).toEqual([
          {
            code: "rich-text",
            message: "Phonetic guide text was omitted from the displayed shared string",
            part: "xl/sharedStrings.xml",
          },
        ]);
      } else if (fixture.file === "DataValidations-49244.xlsx") {
        expect(first.merges).toHaveLength(3);
        const rules = first.validationRules ?? [];
        expect(rules).toHaveLength(25);
        expect(
          [...rules]
            .sort((left, right) => left.range.start.row - right.range.start.row)
            .map((rule) => ({ row: rule.range.start.row, condition: rule.condition })),
        ).toEqual(validationRows());
        expect(cells.some((cell) => cell.style?.align === "center")).toBe(true);
        expect(warningCounts(warnings)).toEqual({
          "Formula-based Excel validation was dropped": 25,
          "Excel validation type custom was dropped": 1,
          "Excel validation type list was dropped": 1,
          "Distinct Excel validation prompt and error text were reduced to the prompt": 1,
        });
      } else if (fixture.file === "55814.xlsx") {
        expect(snapshot.workbook.activeSheet).toBe("example");
        expect(first.notes).toEqual([
          { addr: { sheet: "example", row: 0, col: 0 }, text: "Comment Here\r\n" },
        ]);
        expect(warnings).toEqual([
          {
            code: "rich-text",
            message: "Comment rich text formatting was flattened",
            part: "xl/comments1.xml",
            cell: "A1",
          },
        ]);
      } else {
        expect(snapshot.workbook.namedRanges).toEqual([
          {
            name: "NonTable",
            range: { sheet: "exceltable", start: { row: 0, col: 0 }, end: { row: 3, col: 2 } },
          },
        ]);
        expect(warningCounts(warnings)).toEqual({
          "Unsupported worksheet relationship table was dropped": 1,
          "Defined name TableAsRangeName was not a single rectangular range": 1,
        });
      }
    });
  }
});

describe("scheduled independent Google Sheets corpus", () => {
  for (const fixture of manifest.googleFixtures) {
    scheduledIt(`imports checksum-locked ${fixture.file}`, async () => {
      expect(fixture.sourcePage).toContain("highviewapps.com");
      expect(fixture.downloadUrl).toContain("docs.google.com/spreadsheets/");
      expect([fixture.producer, fixture.redistributed]).toEqual(["Google Sheets", false]);

      const bytes = await fixtureBytes(fixture);
      const archive = unzipSync(bytes);
      expect(archiveContentSha256(archive)).toBe(fixture.contentSha256);
      expect(archive["xl/sharedStrings.xml"]).toBeDefined();

      const { warnings, onWarning } = collectWarnings();
      const snapshot = await fromXlsxWorkbook(bytes, { onWarning });
      const cells = snapshot.sheets.flatMap((sheet) => sheet.cells.flatMap((block) => block.cells));
      const formulas = cells.flatMap((cell) =>
        cell.value.kind === "formula" ? [cell.value.src] : [],
      );

      expect(snapshot.workbook.activeSheet).toBe("dashboard");
      expect(snapshot.sheets.map((sheet) => sheet.name)).toEqual([
        "Dashboard",
        "Sheet12",
        "Todays Orders",
        "Unfulfilled Orders",
        "Refunds",
        "Customer LTV",
        "Inventory",
        "VIP Customers",
        "Costs",
        "Dtypes Test",
      ]);
      expect(cells).toHaveLength(3_202);
      expect(cells.filter((cell) => cell.style !== undefined)).toHaveLength(3_202);
      expect(formulas).toHaveLength(230);
      expect(formulas[0]).toBe('=COUNTIF(Inventory!F2:F1000, "<=0")');
      expect(sheetNamed(snapshot, "Inventory").frozenRows).toBe(1);
      expect(warningCounts(warnings)).toEqual({
        "Reserved Excel fill 1 had pattern lightGray; it was treated as gray125": 1,
        "Unsupported worksheet relationship drawing was dropped": 10,
      });
    });
  }
});
