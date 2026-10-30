import type {
  CellStyle,
  Grid,
  Range,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import { fromXlsxWorkbook, toXlsxWorkbook } from "@sheetwrite/core";
import { registerXlsxBackends } from "@sheetwrite/xlsx";

export const FORMATTING_SHEET = "budget";
export const FORMAT_OPTIONS = [
  { label: "General", code: "General" },
  { label: "Number", code: "#,##0.00" },
  { label: "Currency", code: "$#,##0.00" },
  { label: "Accounting", code: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)' },
  { label: "Percentage", code: "0.00%" },
  { label: "Date", code: "yyyy-mm-dd" },
  { label: "Scientific", code: "0.00E+00" },
] as const;

export const FORMATTING_TARGET: Range = {
  sheet: FORMATTING_SHEET,
  start: { row: 2, col: 1 },
  end: { row: 2, col: 2 },
};

export const STYLE_COMMANDS = [
  "Bold",
  "Italic",
  "Underline",
  "Strike",
  "Highlight",
  "Outline",
] as const;
export type StyleCommand = (typeof STYLE_COMMANDS)[number];

const INK = "#17362B";
const FILL = "#DDF2E7";
const LINE = "#719889";
const OUTLINE: CellStyle = {
  border: {
    top: { color: LINE, width: 2, style: "solid" },
    bottom: { color: LINE, width: 2, style: "solid" },
    left: { color: LINE, width: 1, style: "dashed" },
    right: { color: LINE, width: 1, style: "dotted" },
  },
};

function cell(rowOffset: number, colOffset: number, value: string | number, style?: CellStyle) {
  return {
    rowOffset,
    colOffset,
    value: { kind: "literal", value } as const,
    ...(style ? { style } : {}),
  };
}

/** A compact operating budget with a mixed-format assumptions column beside the ledger. */
export function createFormattingSnapshot(): WorkbookSnapshot {
  const budget = [
    ["Subscription revenue", 84250, 89500, "Annual renewals + expansion"],
    ["Services revenue", 18500, 17000, "Consulting and onboarding"],
    ["Cloud infrastructure", -12600, -14150, "Capacity reserved for the launch"],
    ["People & benefits", -46500, -45900, "Eight-person product team"],
    ["Sales & marketing", -8200, -9350, "Campaign spend above plan"],
    ["Office & operations", -4200, -3950, "Includes insurance and equipment"],
    ["Legacy agency retainer", -2400, 0, "Retired: brought in-house"],
  ] as const;
  const mixed: Record<(typeof FORMAT_OPTIONS)[number]["label"], number> = {
    General: 84250.125,
    Number: 84250.125,
    Currency: 84250.125,
    Accounting: -2400,
    Percentage: 0.125,
    Date: 46023,
    Scientific: 1250000,
  };

  return {
    schemaVersion: 1,
    workbook: { activeSheet: FORMATTING_SHEET },
    sheets: [
      {
        id: FORMATTING_SHEET,
        name: "Q1 operating budget",
        order: 0,
        rowCount: 15,
        frozenRows: 2,
        columns: [
          { key: "line", header: "Budget line", width: 235, type: "text" },
          { key: "plan", header: "Plan", width: 135, type: "number", numberFormat: "$#,##0.00" },
          {
            key: "actual",
            header: "Actual",
            width: 135,
            type: "number",
            numberFormat: "$#,##0.00",
          },
          {
            key: "variance",
            header: "Variance",
            width: 125,
            type: "number",
            numberFormat: "$#,##0.00",
          },
          { key: "notes", header: "Planning notes", width: 215, type: "text" },
          { key: "format", header: "Format", width: 125, type: "text" },
          {
            key: "sample",
            header: "Mixed formats",
            width: 175,
            type: "number",
            numberFormat: "$#,##0.00",
          },
        ],
        conditionalFormats: [
          {
            range: { sheet: FORMATTING_SHEET, start: { row: 2, col: 3 }, end: { row: 8, col: 3 } },
            when: { kind: "lessThan", value: 0 },
            style: { backgroundColor: "#FBE1E4", color: "#801F35", bold: true },
          },
        ],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 15,
            colCount: 7,
            cells: [
              cell(0, 0, "NORTHSTAR / FY26", { fontFamily: "Georgia", fontSize: 19, bold: true }),
              cell(0, 4, "Q1 operating budget", { italic: true, align: "right" }),
              ...[
                "Budget line",
                "Plan",
                "Actual",
                "Δ vs plan",
                "Planning notes",
                "Format",
                "Same column",
              ].map((text, col) =>
                cell(1, col, text, {
                  bold: true,
                  backgroundColor: FILL,
                  color: INK,
                  border: { bottom: { color: LINE, width: 2 } },
                }),
              ),
              ...budget.flatMap(([label, plan, actual, note], index) => {
                const row = index + 2;
                return [
                  cell(
                    row,
                    0,
                    label,
                    index === 6
                      ? { strikethrough: true }
                      : { fontFamily: index % 2 ? "Arial" : "Georgia" },
                  ),
                  cell(row, 1, plan),
                  cell(row, 2, actual),
                  {
                    rowOffset: row,
                    colOffset: 3,
                    value: { kind: "formula", src: `=C${row + 1}-B${row + 1}` } as const,
                  },
                  cell(row, 4, note, {
                    wrap: true,
                    verticalAlign: index % 2 ? "bottom" : "top",
                    italic: index === 6,
                  }),
                ];
              }),
              ...FORMAT_OPTIONS.flatMap((format, index) => [
                cell(index + 2, 5, format.label, { fontSize: 12, align: "left" }),
                cell(index + 2, 6, mixed[format.label], {
                  numberFormat: format.code,
                  fontFamily: "Courier New",
                  align: "right",
                }),
              ]),
              cell(10, 0, "Operating profit", { bold: true, fontSize: 16, underline: true }),
              ...[1, 2, 3].map((col) => ({
                rowOffset: 10,
                colOffset: col,
                value: {
                  kind: "formula",
                  src: `=SUM(${String.fromCharCode(65 + col)}3:${String.fromCharCode(65 + col)}9)`,
                } as const,
                style: {
                  ...OUTLINE,
                  backgroundColor: FILL,
                  color: INK,
                  bold: true,
                  verticalAlign: "middle" as const,
                },
              })),
              cell(12, 0, "Review status", { bold: true }),
              cell(12, 1, "APPROVED", { align: "center", underline: true, fontSize: 12 }),
              cell(13, 0, "Theme font fallback", {
                fontFamily: "Northstar Unavailable Font",
                italic: true,
              }),
              cell(13, 4, "Missing families fall back to the grid theme font.", { wrap: true }),
              cell(14, 5, "Column default", { fontSize: 12 }),
              cell(14, 6, 84250.125),
            ],
          },
        ],
      },
    ],
  };
}

export function applyNumberFormat(grid: Grid, code: string): void {
  grid.styleRange(FORMATTING_TARGET, { numberFormat: code });
}

export function applyStyleCommand(grid: Grid, command: StyleCommand): void {
  grid.setSelection({ kind: "range", range: FORMATTING_TARGET });

  switch (command) {
    case "Bold":
      grid.actions.toggleBold();
      break;
    case "Italic":
      grid.actions.toggleItalic();
      break;
    case "Underline":
      grid.actions.toggleUnderline();
      break;
    case "Strike":
      grid.actions.toggleStrikethrough();
      break;
    case "Highlight":
      grid.styleRange(FORMATTING_TARGET, { backgroundColor: FILL, color: INK });
      break;
    case "Outline":
      grid.styleRange(FORMATTING_TARGET, OUTLINE);
      break;
  }
}

function subsetMatches(expected: unknown, actual: unknown): boolean {
  if (typeof expected !== "object" || expected === null) return expected === actual;
  if (typeof actual !== "object" || actual === null) return false;

  return Object.entries(expected).every(([key, value]) =>
    subsetMatches(value, Reflect.get(actual, key)),
  );
}

/** XLSX may move column defaults onto cells and omit false font flags. Compare effective styles. */
function stylesByCell(snapshot: WorkbookSnapshot): Map<string, CellStyle> {
  const result = new Map<string, CellStyle>();
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const entry of block.cells) {
        const col = block.startCol + entry.colOffset;
        const style = entry.style ?? {};
        result.set(`${sheet.name}!${block.startRow + entry.rowOffset}:${col}`, {
          bold: false,
          italic: false,
          underline: false,
          strikethrough: false,
          ...style,
          numberFormat: style.numberFormat ?? sheet.columns[col]?.numberFormat ?? "General",
        });
      }
    }
  }

  return result;
}

/** Compare the actual edited workbook, not a reset seed, against the decoded XLSX bytes. */
export async function roundTripFormatting(grid: Pick<Grid, "exportSnapshot">) {
  registerXlsxBackends();
  const source = grid.exportSnapshot();
  const warnings: XlsxWorkbookWarning[] = [];
  const bytes = await toXlsxWorkbook(source, { onWarning: (warning) => warnings.push(warning) });
  const snapshot = await fromXlsxWorkbook(bytes, {
    onWarning: (warning) => warnings.push(warning),
  });
  const imported = stylesByCell(snapshot);
  const expected = stylesByCell(source);
  const differences: string[] = [];
  for (const [address, style] of expected) {
    if (!subsetMatches(style, imported.get(address))) differences.push(address);
  }
  for (const sheet of source.sheets) {
    const after = snapshot.sheets.find((candidate) => candidate.name === sheet.name);
    if (!subsetMatches(sheet.conditionalFormats ?? [], after?.conditionalFormats ?? []))
      differences.push(`${sheet.name}!conditional formats`);
  }

  return {
    snapshot,
    byteLength: bytes.byteLength,
    checkedCells: expected.size,
    differences,
    warnings,
  };
}
