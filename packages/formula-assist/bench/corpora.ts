// The formula sets the replay types: the conformance corpus, the formulas of
// the XLSX fixtures, and the Enron sample (see enron/README.md). Each set
// yields workbooks with the formulas to type in them.

import { readdir, readFile } from "node:fs/promises";

import {
  type CellBlock,
  type CellScalar,
  type CellValue,
  type Column,
  fromXlsxWorkbook,
  labelToCol,
  SheetwriteError,
  type SheetSnapshot,
  type WorkbookSnapshot,
} from "@sheetwrite/core";

import {
  generateConformanceEvidence,
  readFormulaInventory,
} from "../../../scripts/conformance/generate.js";
import type { ReplayTarget, ReplayWorkbook } from "./replay.js";

/** The sets the replay knows, by name. */
export const REPLAY_SETS = ["conformance", "fixtures", "enron-dev", "enron-heldout"] as const;

/** One replay set's name. */
export type ReplaySetName = (typeof REPLAY_SETS)[number];

/** A sheet of `rows` by `cols` with `cells` in one block. */
function sheetSnapshot(
  id: string,
  name: string,
  order: number,
  size: { rows: number; cols: number },
  cells: CellBlock["cells"],
): SheetSnapshot {
  const columns: Column[] = Array.from({ length: size.cols }, (_, index) => ({
    key: `c${index}`,
    header: `Column ${index + 1}`,
    width: 100,
    type: "text",
  }));
  return {
    id,
    name,
    order,
    rowCount: size.rows,
    columns,
    cells: [{ startRow: 0, startCol: 0, rowCount: size.rows, colCount: size.cols, cells }],
  };
}

function workbookSnapshot(sheets: SheetSnapshot[]): WorkbookSnapshot {
  const first = sheets[0];
  if (first === undefined) throw new Error("A replay workbook needs at least one sheet");
  return { schemaVersion: 1, workbook: { activeSheet: first.id }, sheets };
}

const A1_CELL = /^([A-Z]+)([1-9][0-9]*)$/;

function a1Cell(text: string): { row: number; col: number } {
  const match = A1_CELL.exec(text);
  const [, letters, digits] = match ?? [];
  if (letters === undefined || digits === undefined) throw new Error(`Invalid A1 cell ${text}`);
  return { row: Number(digits) - 1, col: labelToCol(letters) };
}

/** The conformance workbook's size, as its adapter builds it (scripts/conformance/adapters/sheetwrite.ts). */
const ORACLE_SIZE = { rows: 256, cols: 32 };

/** Every formula case of the conformance corpus, each in a workbook of its inputs. */
async function* conformanceWorkbooks(): AsyncGenerator<ReplayWorkbook> {
  const { corpus } = generateConformanceEvidence(await readFormulaInventory());
  for (const entry of corpus.cases) {
    if (entry.formula === undefined || entry.target === undefined) continue;

    const cells = (entry.inputs ?? []).map(({ cell, value }) => {
      const { row, col } = a1Cell(cell);
      const literal: CellValue = { kind: "literal", value };
      return { rowOffset: row, colOffset: col, value: literal };
    });
    const sheet = sheetSnapshot("oracle", "Oracle", 0, ORACLE_SIZE, cells);
    const target = a1Cell(entry.target);
    yield {
      id: entry.id,
      snapshot: workbookSnapshot([sheet]),
      targets: [{ cell: { sheet: "oracle", ...target }, formula: entry.formula }],
    };
  }
}

/** Every formula cell of a snapshot, in sheet and block order. */
function formulaTargets(snapshot: WorkbookSnapshot): ReplayTarget[] {
  const targets: ReplayTarget[] = [];
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if (cell.value.kind !== "formula") continue;
        targets.push({
          cell: {
            sheet: sheet.id,
            row: block.startRow + cell.rowOffset,
            col: block.startCol + cell.colOffset,
          },
          formula: cell.value.src,
        });
      }
    }
  }
  return targets;
}

/** The folders of XLSX fixtures whose formulas the replay types. */
const FIXTURE_FOLDERS = [
  new URL("../../xlsx/test/fixtures/", import.meta.url),
  new URL("../../../test/fixtures/excel-checks/", import.meta.url),
];

/** Each XLSX fixture that holds formulas. Files the reader refuses on purpose (corrupt, unsafe) are not workbooks to type in. */
async function* fixtureWorkbooks(): AsyncGenerator<ReplayWorkbook> {
  for (const folder of FIXTURE_FOLDERS) {
    const names = (await readdir(folder)).filter((name) => name.endsWith(".xlsx")).sort();
    for (const name of names) {
      const bytes = await readFile(new URL(name, folder));
      let snapshot: WorkbookSnapshot;
      try {
        snapshot = await fromXlsxWorkbook(bytes);
      } catch (error) {
        if (error instanceof SheetwriteError) continue;
        throw error;
      }

      const targets = formulaTargets(snapshot);
      if (targets.length > 0) yield { id: name, snapshot, targets };
    }
  }
}

/**
 * The Enron sample's file format. Cells are `[row, col, value]`, where a
 * string starting with `=` is a formula; targets are `[sheet, row, col]` of
 * formula cells, `sheet` an index into `sheets`.
 */
interface EnronSample {
  readonly workbooks: readonly {
    readonly file: string;
    readonly sheets: readonly {
      readonly name: string;
      readonly rows: number;
      readonly cols: number;
      readonly cells: readonly (readonly [number, number, CellScalar])[];
    }[];
    readonly targets: readonly (readonly [number, number, number])[];
  }[];
}

function enronValue(value: CellScalar): CellValue {
  return typeof value === "string" && value.startsWith("=")
    ? { kind: "formula", src: value }
    : { kind: "literal", value };
}

/** One half of the Enron sample: `dev` to tune on, `heldout` for the gate only. */
async function* enronWorkbooks(half: "dev" | "heldout"): AsyncGenerator<ReplayWorkbook> {
  const path = new URL(`./enron/${half}.json`, import.meta.url);
  // The file is written by enron/build.ts in this folder; it is not outside input.
  const sample = JSON.parse(await readFile(path, "utf8")) as EnronSample;
  for (const workbook of sample.workbooks) {
    const sheets = workbook.sheets.map((sheet, index) =>
      sheetSnapshot(
        `s${index}`,
        sheet.name,
        index,
        { rows: sheet.rows, cols: sheet.cols },
        sheet.cells.map(([row, col, value]) => ({
          rowOffset: row,
          colOffset: col,
          value: enronValue(value),
        })),
      ),
    );
    const formulas = new Map(
      sheets.flatMap((sheet) =>
        sheet.cells.flatMap((block) =>
          block.cells.flatMap((cell) =>
            cell.value.kind === "formula"
              ? [[`${sheet.id}:${cell.rowOffset}:${cell.colOffset}`, cell.value.src] as const]
              : [],
          ),
        ),
      ),
    );
    const targets = workbook.targets.map(([sheet, row, col]) => {
      const formula = formulas.get(`s${sheet}:${row}:${col}`);
      if (formula === undefined) {
        throw new Error(`${workbook.file}: target ${sheet}:${row}:${col} is not a formula cell`);
      }
      return { cell: { sheet: `s${sheet}`, row, col }, formula };
    });
    yield { id: workbook.file, snapshot: workbookSnapshot(sheets), targets };
  }
}

/** The workbooks of one set. Needs `initSheetwrite` with the XLSX add-on for `fixtures`. */
export function replayWorkbooks(set: ReplaySetName): AsyncGenerator<ReplayWorkbook> {
  switch (set) {
    case "conformance":
      return conformanceWorkbooks();
    case "fixtures":
      return fixtureWorkbooks();
    case "enron-dev":
      return enronWorkbooks("dev");
    case "enron-heldout":
      return enronWorkbooks("heldout");
  }
}
