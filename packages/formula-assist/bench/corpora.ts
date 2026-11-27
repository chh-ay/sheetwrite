// The formula sets the replay types: the conformance corpus, the formulas of
// the XLSX fixtures, and the Enron sample (see enron/README.md). Each set
// yields workbooks with the formulas to type in them.

import { readdir, readFile } from "node:fs/promises";

import {
  type CellBlock,
  type CellScalar,
  type CellValue,
  type NamedRangeSnapshot,
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
import { openReplayStore, type ReplayTarget, type ReplayWorkbook } from "./replay.js";

/** The sets the replay knows, by name. */
export const REPLAY_SETS = [
  "conformance",
  "fixtures",
  "enron-dev",
  "enron-dev2",
  "enron-dev-large",
  "enron-dev-large-whole",
  "enron-heldout",
  "enron-heldout-whole",
] as const;

/** The sets the repository holds, without the held-out set; the others are built by enron/build.ts. */
export const DEVELOPMENT_SETS: readonly ReplaySetName[] = [
  "conformance",
  "fixtures",
  "enron-dev",
  "enron-dev2",
];

export type ReplaySetName = (typeof REPLAY_SETS)[number];

/** A sheet of `rows` by `cols` with `cells` in one block. */
function sheet_snapshot(
  id: string,
  name: string,
  order: number,
  size: { rows: number; cols: number; hidden?: boolean },
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
    ...(size.hidden === true ? { visibility: "hidden" as const } : {}),
  };
}

function workbook_snapshot(
  sheets: SheetSnapshot[],
  named_ranges: NamedRangeSnapshot[] = [],
): WorkbookSnapshot {
  const first = sheets[0];
  if (first === undefined) throw new Error("A replay workbook needs at least one sheet");
  return {
    schemaVersion: 1,
    workbook: { activeSheet: first.id, namedRanges: named_ranges },
    sheets,
  };
}

const A1_CELL = /^([A-Z]+)([1-9][0-9]*)$/;

function a1_cell(text: string): { row: number; col: number } {
  const match = A1_CELL.exec(text);
  const [, letters, digits] = match ?? [];
  if (letters === undefined || digits === undefined) throw new Error(`Invalid A1 cell ${text}`);
  return { row: Number(digits) - 1, col: labelToCol(letters) };
}

/** The conformance workbook's size, as its adapter builds it (scripts/conformance/adapters/sheetwrite.ts). */
const ORACLE_SIZE = { rows: 256, cols: 32 };

/** Every formula case of the conformance corpus, each in a workbook of its inputs. */
async function* conformance_workbooks(): AsyncGenerator<ReplayWorkbook> {
  const { corpus } = generateConformanceEvidence(await readFormulaInventory());
  for (const entry of corpus.cases) {
    if (entry.formula === undefined || entry.target === undefined) continue;

    const cells = (entry.inputs ?? []).map(({ cell, value }) => {
      const { row, col } = a1_cell(cell);
      const literal: CellValue = { kind: "literal", value };
      return { rowOffset: row, colOffset: col, value: literal };
    });
    const sheet = sheet_snapshot("oracle", "Oracle", 0, ORACLE_SIZE, cells);
    const target = a1_cell(entry.target);
    yield {
      id: entry.id,
      snapshot: workbook_snapshot([sheet]),
      targets: [{ cell: { sheet: "oracle", ...target }, formula: entry.formula }],
    };
  }
}

/** Every formula cell of a snapshot, in sheet and block order. */
function formula_targets(snapshot: WorkbookSnapshot): ReplayTarget[] {
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
async function* fixture_workbooks(): AsyncGenerator<ReplayWorkbook> {
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

      const targets = formula_targets(snapshot);
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
      /** Set on hidden sheets in the whole-workbook sets. */
      readonly hidden?: true;
      readonly cells: readonly (readonly [number, number, CellScalar])[];
    }[];
    readonly targets: readonly (readonly [number, number, number])[];
    readonly names: readonly (
      | { readonly name: string; readonly formula: string }
      | {
          readonly name: string;
          readonly sheet: number;
          readonly start: { readonly row: number; readonly col: number };
          readonly end: { readonly row: number; readonly col: number };
        }
    )[];
  }[];
}

/** Whether `value` has the sample's shape down to its workbooks' fields; the cells are trusted. */
function is_enron_sample(value: unknown): value is EnronSample {
  if (typeof value !== "object" || value === null || !("workbooks" in value)) return false;
  const { workbooks } = value;
  return (
    Array.isArray(workbooks) &&
    workbooks.every(
      (workbook: unknown) =>
        typeof workbook === "object" &&
        workbook !== null &&
        "file" in workbook &&
        typeof workbook.file === "string" &&
        "sheets" in workbook &&
        Array.isArray(workbook.sheets) &&
        "targets" in workbook &&
        Array.isArray(workbook.targets) &&
        "names" in workbook &&
        Array.isArray(workbook.names),
    )
  );
}

function enron_value(value: CellScalar): CellValue {
  return typeof value === "string" && value.startsWith("=")
    ? { kind: "formula", src: value }
    : { kind: "literal", value };
}

/** Causes followed before giving up: snapshot errors wrap the engine's in two or three. */
const MAX_CAUSES = 8;

/** The defined name the engine refused, found along `error`'s causes; null for any other failure. */
function refused_name(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSES && current instanceof Error; depth++) {
    if (current instanceof SheetwriteError && current.message.startsWith("invalid named range")) {
      const name = current.context?.name;
      return typeof name === "string" ? name : null;
    }
    current = current.cause;
  }
  return null;
}

/**
 * `snapshot` without the defined names the engine refuses. The sample keeps
 * only the cells near its formulas, so a name whose definition read cells
 * that are gone can be invalid; it is left out, as the formulas that use it
 * still read the name as text.
 */
function with_accepted_names(snapshot: WorkbookSnapshot): WorkbookSnapshot {
  let names = snapshot.workbook.namedRanges ?? [];
  for (;;) {
    const candidate = { ...snapshot, workbook: { ...snapshot.workbook, namedRanges: names } };
    try {
      openReplayStore(candidate).dispose();
      return candidate;
    } catch (error) {
      const refused = refused_name(error);
      if (refused === null) throw error;
      const remaining = names.filter((named) => named.name !== refused);
      if (remaining.length === names.length) throw error;
      names = remaining;
    }
  }
}

/**
 * One set of the Enron sample: `dev`, `dev2`, `dev-large` and
 * `dev-large-whole` to tune on, `heldout` and `heldout-whole` to measure only
 * (see enron/README.md). The `dev-large` and `-whole` sets are not
 * committed; enron/build.ts builds them.
 */
async function* enron_workbooks(
  set: "dev" | "dev2" | "dev-large" | "dev-large-whole" | "heldout" | "heldout-whole",
): AsyncGenerator<ReplayWorkbook> {
  const path = new URL(`./enron/${set}.json`, import.meta.url);
  if (!(await Bun.file(path).exists())) {
    throw new Error(
      `${path.pathname} is missing: build it with bench/enron/build.ts --${set.replace("heldout", "held-out")} (see enron/README.md)`,
    );
  }
  const sample: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!is_enron_sample(sample)) throw new Error(`${path.pathname} is not an Enron sample file`);

  for (const workbook of sample.workbooks) {
    const sheets = workbook.sheets.map((sheet, index) =>
      sheet_snapshot(
        `s${index}`,
        sheet.name,
        index,
        { rows: sheet.rows, cols: sheet.cols, hidden: sheet.hidden === true },
        sheet.cells.map(([row, col, value]) => ({
          rowOffset: row,
          colOffset: col,
          value: enron_value(value),
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
    // The sample keeps only cells near the formulas, so a name's range is clipped to its sheet.
    const clip = (sheet: number, cell: { row: number; col: number }) => {
      const size = workbook.sheets[sheet];
      return {
        row: Math.min(cell.row, (size?.rows ?? 1) - 1),
        col: Math.min(cell.col, (size?.cols ?? 1) - 1),
      };
    };
    const names: NamedRangeSnapshot[] = workbook.names.map((named) => {
      if ("formula" in named) return { name: named.name, formula: named.formula };
      const range = { start: clip(named.sheet, named.start), end: clip(named.sheet, named.end) };
      return { name: named.name, range: { sheet: `s${named.sheet}`, ...range } };
    });
    const snapshot = with_accepted_names(workbook_snapshot(sheets, names));
    yield { id: workbook.file, snapshot, targets };
  }
}

/** The workbooks of one set. Needs `initSheetwrite` with the XLSX add-on for `fixtures`. */
export function replayWorkbooks(set: ReplaySetName): AsyncGenerator<ReplayWorkbook> {
  switch (set) {
    case "conformance":
      return conformance_workbooks();
    case "fixtures":
      return fixture_workbooks();
    case "enron-dev":
      return enron_workbooks("dev");
    case "enron-heldout":
      return enron_workbooks("heldout");
    case "enron-dev2":
      return enron_workbooks("dev2");
    case "enron-dev-large":
      return enron_workbooks("dev-large");
    case "enron-dev-large-whole":
      return enron_workbooks("dev-large-whole");
    case "enron-heldout-whole":
      return enron_workbooks("heldout-whole");
  }
}
