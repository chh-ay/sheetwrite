// Builds the Enron sample of the formula assist replay (see README.md in this
// folder) from the corpus archive of Hermans and Murphy-Hill:
//
//   bun packages/formula-assist/bench/enron/build.ts <spreadsheets.7z> <scratch>             dev.json, dev2.json
//   bun packages/formula-assist/bench/enron/build.ts <spreadsheets.7z> <scratch> --held-out  heldout.json
//
// The archive is https://ndownloader.figshare.com/files/3242531 (CC BY 4.0).
// Needs `7z` on the PATH. The same archive gives the same sample: every
// choice comes from a seeded generator. The held-out draw skips every
// spreadsheet the development sets hold.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type CellScalar,
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteError,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { analyzeFormula } from "@sheetwrite/core/functions";
import { xlsxAddon } from "@sheetwrite/xlsx";

/** MD5 of the archive as figshare lists it. */
const ARCHIVE_MD5 = "188ec98d04c83a4725d9205cc75ce5a2";
/** Seed of the development draw (#801); its workbooks alternate between dev.json and dev2.json. */
const DEV_SEED = 801;
const DEV_WORKBOOKS = 100;
/** Seed of the held-out draw, from the spreadsheets the development draw did not take. */
const HELD_OUT_SEED = 802;
const HELD_OUT_WORKBOOKS = 50;
/** A workbook needs this many formulas to be sampled. */
const MIN_FORMULAS = 10;
/** Formulas typed per workbook, at most. */
const TARGETS_PER_WORKBOOK = 20;
/** Files extracted from the archive at a time. */
const EXTRACT_BATCH = 80;

/** Cells kept around each formula: the rows above hold its column's block, the columns to its left its row's inputs. */
const ROWS_ABOVE = 25;
const ROWS_BELOW = 3;
const COLS_LEFT = 6;
const COLS_RIGHT = 2;
/** Rows kept at the top of the sheet and above each referenced range, where headers are. */
const HEADER_ROWS = 3;
/** Cells kept of each range a formula reads, at most this many rows and columns. */
const REFERENCE_ROWS = 60;
const REFERENCE_COLS = 12;
/** Longest text kept; longer text is cut. */
const MAX_TEXT = 40;
/** Column count of a key: row × KEY_COLS + col. Excel's last column is XFD (16,384). */
const KEY_COLS = 16_384;
/** Longest defined-name formula kept; longer ones are left out with their name. */
const MAX_NAME_FORMULA = 200;

/** Mulberry32: small, seeded and the same on every machine. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    const swap = result[index];
    const picked = result[other];
    if (swap === undefined || picked === undefined) continue;
    result[index] = picked;
    result[other] = swap;
  }
  return result;
}

async function run(command: string[]): Promise<string> {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (status !== 0) throw new Error(`${command.join(" ")} failed (${status}): ${stderr}`);
  return stdout;
}

async function checkArchive(path: string): Promise<void> {
  const hasher = new Bun.CryptoHasher("md5");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  const digest = hasher.digest("hex");
  if (digest !== ARCHIVE_MD5) throw new Error(`${path}: MD5 ${digest}, expected ${ARCHIVE_MD5}`);
}

/**
 * One file per distinct spreadsheet. Files are named
 * `<owner>__<message>__<title>`, and the corpus holds many copies of one
 * spreadsheet sent in different messages; keeping one per title stops a
 * spreadsheet from landing in both sets.
 */
async function distinctSpreadsheets(archive: string): Promise<string[]> {
  const listing = await run(["7z", "l", "-slt", archive]);
  const byTitle = new Map<string, string>();
  const paths = listing
    .split("\n")
    .filter((line) => line.startsWith("Path = ") && line.endsWith(".xlsx"))
    .map((line) => line.slice("Path = ".length))
    .sort();
  for (const path of paths) {
    const title = titleOf(path);
    if (!byTitle.has(title)) byTitle.set(title, path);
  }
  return [...byTitle.values()];
}


/** A file's spreadsheet title, which copies of one spreadsheet in several messages share. */
function titleOf(path: string): string {
  return (path.split("__").at(-1) ?? path).toLowerCase();
}
/** A cell of the sample: `[row, col, value]`; a formula is its text with `=`. */
type SampleCell = [number, number, CellScalar];

interface SampleSheet {
  name: string;
  rows: number;
  cols: number;
  cells: SampleCell[];
}

interface SampleWorkbook {
  file: string;
  sheets: SampleSheet[];
  targets: [number, number, number][];
  /** Defined names, so formulas that use them read as names, not as unknown text. */
  names: SampleName[];
}

/** The cells of each sheet by `row × KEY_COLS + col`; formulas as their text. */
function cellMaps(snapshot: WorkbookSnapshot): Map<number, CellScalar>[] {
  return snapshot.sheets.map((sheet) => {
    const cells = new Map<number, CellScalar>();
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        const key = (block.startRow + cell.rowOffset) * KEY_COLS + block.startCol + cell.colOffset;
        if (cell.value.kind === "formula") cells.set(key, cell.value.src);
        // Text that looks like a formula would read back as one.
        else if (cell.value.kind === "literal" && !String(cell.value.value).startsWith("=")) {
          cells.set(key, cell.value.value);
        }
      }
    }
    return cells;
  });
}

/** The cells to keep of one sheet, as keys. */
type KeptCells = Set<number>;

function keepArea(kept: KeptCells, top: number, left: number, bottom: number, right: number): void {
  for (let row = Math.max(0, top); row <= bottom; row++) {
    for (let col = Math.max(0, left); col <= right; col++) kept.add(row * KEY_COLS + col);
  }
}

/** Keep the cells a formula's typist would see and the ranges it reads. */
function keepAround(
  snapshot: WorkbookSnapshot,
  kept: KeptCells[],
  target: { sheet: number; row: number; col: number; formula: string },
): void {
  const own = kept[target.sheet];
  if (own === undefined) return;
  const { row, col } = target;
  keepArea(own, row - ROWS_ABOVE, col - COLS_LEFT, row + ROWS_BELOW, col + COLS_RIGHT);
  keepArea(own, 0, col - COLS_LEFT, HEADER_ROWS - 1, col + COLS_RIGHT);

  for (const reference of analyzeFormula(target.formula, 0, []).references) {
    const sheet =
      reference.sheet === null
        ? target.sheet
        : snapshot.sheets.findIndex(
            (entry) => entry.name.toLowerCase() === reference.sheet?.toLowerCase(),
          );
    const area = kept[sheet];
    if (area === undefined) continue;
    const { start, end } = reference;
    keepArea(
      area,
      start.row - HEADER_ROWS,
      start.col,
      Math.min(end.row, start.row + REFERENCE_ROWS - 1),
      Math.min(end.col, start.col + REFERENCE_COLS - 1),
    );
  }
}

/** A defined name of the sample: its formula, or its range on a sheet given by index. */
type SampleName =
  | { name: string; formula: string }
  | {
      name: string;
      sheet: number;
      start: { row: number; col: number };
      end: { row: number; col: number };
    };

/** The workbook's defined names, the first of each name only (a sheet-scoped copy is dropped). */
function sampleNames(snapshot: WorkbookSnapshot): SampleName[] {
  const seen = new Set<string>();
  const names: SampleName[] = [];
  for (const named of snapshot.workbook.namedRanges ?? []) {
    const key = named.name.toUpperCase();
    if (seen.has(key)) continue;
    if ("range" in named) {
      const sheet = snapshot.sheets.findIndex((entry) => entry.id === named.range.sheet);
      if (sheet < 0) continue;
      names.push({ name: named.name, sheet, start: named.range.start, end: named.range.end });
    } else if (named.formula.length <= MAX_NAME_FORMULA) {
      names.push({ name: named.name, formula: named.formula });
    } else {
      continue;
    }
    seen.add(key);
  }
  return names;
}

function sampledValue(value: CellScalar): CellScalar {
  return typeof value === "string" && !value.startsWith("=") && value.length > MAX_TEXT
    ? value.slice(0, MAX_TEXT)
    : value;
}

/** The sample of one workbook, or null when it has too few formulas. */
function sampleWorkbook(
  file: string,
  snapshot: WorkbookSnapshot,
  random: () => number,
): SampleWorkbook | null {
  const cells = cellMaps(snapshot);
  const formulas = cells.flatMap((map, sheet) =>
    [...map].flatMap(([key, value]) =>
      typeof value === "string" && value.startsWith("=")
        ? [{ sheet, row: Math.floor(key / KEY_COLS), col: key % KEY_COLS, formula: value }]
        : [],
    ),
  );
  if (formulas.length < MIN_FORMULAS) return null;

  const targets = shuffled(formulas, random).slice(0, TARGETS_PER_WORKBOOK);
  const kept: KeptCells[] = cells.map(() => new Set());
  for (const target of targets) keepAround(snapshot, kept, target);

  const sheets = snapshot.sheets.map((sheet, index): SampleSheet => {
    const map = cells[index] ?? new Map<number, CellScalar>();
    const sheetCells: SampleCell[] = [...(kept[index] ?? [])]
      .sort((left, right) => left - right)
      .flatMap((key) => {
        const value = map.get(key);
        if (value === undefined || value === null) return [];
        return [[Math.floor(key / KEY_COLS), key % KEY_COLS, sampledValue(value)]];
      });
    const rows = Math.max(1, ...sheetCells.map(([row]) => row + 1));
    const cols = Math.max(1, ...sheetCells.map(([, col]) => col + 1));
    return { name: sheet.name, rows, cols, cells: sheetCells };
  });
  return {
    file,
    sheets,
    targets: targets.map(({ sheet, row, col }) => [sheet, row, col]),
    names: sampleNames(snapshot),
  };
}

/** One seeded draw of `count` workbooks, skipping the spreadsheet titles in `exclude`. */
async function draw(
  archive: string,
  scratch: string,
  options: { seed: number; count: number; exclude: ReadonlySet<string> },
): Promise<{ sampled: SampleWorkbook[]; refused: number }> {
  const random = seededRandom(options.seed);
  const spreadsheets = await distinctSpreadsheets(archive);
  const candidates = shuffled(
    spreadsheets.filter((path) => !options.exclude.has(titleOf(path))),
    random,
  );
  const sampled: SampleWorkbook[] = [];
  let refused = 0;

  for (
    let start = 0;
    start < candidates.length && sampled.length < options.count;
    start += EXTRACT_BATCH
  ) {
    const batch = candidates.slice(start, start + EXTRACT_BATCH);
    const folder = join(scratch, "batch");
    await rm(folder, { recursive: true, force: true });
    await mkdir(folder, { recursive: true });
    const list = join(scratch, "batch.txt");
    await writeFile(list, `${batch.join("\n")}\n`);
    await run(["7z", "e", "-y", `-o${folder}`, archive, `@${list}`]);

    for (const file of batch) {
      if (sampled.length >= options.count) break;
      let snapshot: WorkbookSnapshot;
      try {
        snapshot = await fromXlsxWorkbook(await readFile(join(folder, file)));
      } catch (error) {
        // The reader refuses some 2014 conversions (limits, broken parts); they are not sampled.
        if (!(error instanceof SheetwriteError)) throw error;
        refused++;
        continue;
      }
      const workbook = sampleWorkbook(file, snapshot, random);
      if (workbook !== null) sampled.push(workbook);
    }
  }
  await rm(join(scratch, "batch"), { recursive: true, force: true });
  return { sampled, refused };
}

async function writeSet(name: string, seed: number, workbooks: SampleWorkbook[]): Promise<void> {
  const path = new URL(`./${name}.json`, import.meta.url);
  await writeFile(path, `${JSON.stringify({ seed, workbooks })}\n`);
}

/** The spreadsheet titles of a written set, so a later draw can stay clear of them. */
async function titlesIn(name: string): Promise<string[]> {
  const text = await readFile(new URL(`./${name}.json`, import.meta.url), "utf8");
  const set: unknown = JSON.parse(text);
  const workbooks = typeof set === "object" && set !== null && "workbooks" in set ? set.workbooks : [];
  if (!Array.isArray(workbooks)) return [];
  return workbooks.flatMap((workbook: unknown) =>
    typeof workbook === "object" && workbook !== null && "file" in workbook && typeof workbook.file === "string"
      ? [titleOf(workbook.file)]
      : [],
  );
}

async function main(): Promise<void> {
  const [archive, scratch, mode] = process.argv.slice(2);
  if (archive === undefined || scratch === undefined) {
    throw new Error("Usage: bun build.ts <spreadsheets.7z> <scratch folder> [--held-out]");
  }
  await checkArchive(archive);
  await initSheetwrite({ addons: [xlsxAddon()] });

  let report: { sampled: SampleWorkbook[]; refused: number };
  if (mode === "--held-out") {
    const exclude = new Set([...(await titlesIn("dev")), ...(await titlesIn("dev2"))]);
    report = await draw(archive, scratch, {
      seed: HELD_OUT_SEED,
      count: HELD_OUT_WORKBOOKS,
      exclude,
    });
    await writeSet("heldout", HELD_OUT_SEED, report.sampled);
  } else {
    report = await draw(archive, scratch, {
      seed: DEV_SEED,
      count: DEV_WORKBOOKS,
      exclude: new Set(),
    });
    // Alternate the drawn order between the two development sets.
    await writeSet("dev", DEV_SEED, report.sampled.filter((_, index) => index % 2 === 0));
    await writeSet("dev2", DEV_SEED, report.sampled.filter((_, index) => index % 2 === 1));
  }

  const formulas = report.sampled.reduce((sum, workbook) => sum + workbook.targets.length, 0);
  process.stdout.write(
    `${report.sampled.length} workbooks, ${formulas} formulas; ${report.refused} files refused by the reader\n`,
  );
}

await main();
