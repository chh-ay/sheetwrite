// Builds the Enron sample of the formula assist replay (see README.md in this
// folder) from the corpus archive of Hermans and Murphy-Hill:
//
//   bun packages/formula-assist/bench/enron/build.ts <spreadsheets.7z> <scratch>                     dev.json, dev2.json
//   bun packages/formula-assist/bench/enron/build.ts <spreadsheets.7z> <scratch> --held-out          heldout.json
//   bun packages/formula-assist/bench/enron/build.ts <spreadsheets.7z> <scratch> --dev-large         dev-large.json
//   bun packages/formula-assist/bench/enron/build.ts <spreadsheets.7z> <scratch> --dev-large-whole   dev-large-whole.json
//   bun packages/formula-assist/bench/enron/build.ts <spreadsheets.7z> <scratch> --held-out-whole    heldout-whole.json
//
// The archive is https://ndownloader.figshare.com/files/3242531 (CC BY 4.0);
// the script downloads it to <spreadsheets.7z> when that file is missing, and
// checks its MD5. Needs `7z` on the PATH. The same archive gives the same
// sample: every choice comes from a seeded generator. The held-out draw skips every
// spreadsheet the development sets hold, and every spreadsheet of the burned
// held-out draw, which is not committed: the script draws it again from its
// seed to know them. The large development draw skips every spreadsheet any
// earlier draw took. It is too large to commit (12 MB), so it is not: this
// script builds it, and checks the result against its recorded SHA-256, so
// every machine measures the same set.
//
// The `-whole` sets keep every cell of each workbook instead of the cells near
// its formulas, and mark hidden sheets, so signals that read the whole
// workbook are measured on all of it. `--dev-large-whole` is the seed-804
// draw again, with the same workbooks and formulas; `--held-out-whole` draws
// seed 805 from the spreadsheets no earlier draw took. Neither is committed.

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

/** Where figshare serves the archive. */
const ARCHIVE_URL = "https://ndownloader.figshare.com/files/3242531";
/** MD5 of the archive as figshare lists it. */
const ARCHIVE_MD5 = "188ec98d04c83a4725d9205cc75ce5a2";
/** Seed of the development draw; its workbooks alternate between dev.json and dev2.json. */
const DEV_SEED = 801;
const DEV_WORKBOOKS = 100;
/**
 * Seed of the burned held-out draw (see README.md), from the spreadsheets the
 * development draw did not take. It is drawn again only to keep its
 * spreadsheets out of the held-out draw.
 */
const BURNED_HELD_OUT_SEED = 802;
/**
 * Seed of the held-out draw, from the spreadsheets neither the development
 * draw nor the burned draw took.
 */
const HELD_OUT_SEED = 803;
const HELD_OUT_WORKBOOKS = 50;
/** Seed of the large development draw, from the spreadsheets no earlier draw took. */
const DEV_LARGE_SEED = 804;
const DEV_LARGE_WORKBOOKS = 500;
/** Seed of the whole-workbook held-out draw, from the spreadsheets no earlier draw took. */
const HELD_OUT_WHOLE_SEED = 805;
/**
 * SHA-256 of dev-large.json as the draw writes it. A different hash means the
 * sample changed (the reader reads the workbooks differently, or a sampling
 * rule moved): check why, then record the new hash, so numbers measured on
 * the old set are not compared with the new one.
 */
const DEV_LARGE_SHA256 = "7d8c865d88238fe5495f881d6b950b8ab2a7edb0a8ebca12d192c320d2a4ad20";
/** SHA-256 of dev-large-whole.json and heldout-whole.json as the draws write them. */
const DEV_LARGE_WHOLE_SHA256 = "86cacd713713ca22871558d84c31a9d64a08b7533fcb6c53da3438ea230b3b84";
const HELD_OUT_WHOLE_SHA256 = "266b79ed7a3a17313c164d85b9dfc34c0130d718ba19f03f02cb82091d75f132";
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
function seeded_random(seed: number): () => number {
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

/** Download the archive to `path` unless it is there already. */
async function ensure_archive(path: string): Promise<void> {
  if (await Bun.file(path).exists()) return;
  process.stdout.write(`Downloading ${ARCHIVE_URL} to ${path} (1 GB)\n`);
  const response = await fetch(ARCHIVE_URL);
  if (!response.ok) throw new Error(`${ARCHIVE_URL}: HTTP ${response.status}`);
  await Bun.write(path, response);
}

async function check_archive(path: string): Promise<void> {
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
async function distinct_spreadsheets(archive: string): Promise<string[]> {
  const listing = await run(["7z", "l", "-slt", archive]);
  const by_title = new Map<string, string>();
  const paths = listing
    .split("\n")
    .filter((line) => line.startsWith("Path = ") && line.endsWith(".xlsx"))
    .map((line) => line.slice("Path = ".length))
    .sort();
  for (const path of paths) {
    const title = title_of(path);
    if (!by_title.has(title)) by_title.set(title, path);
  }
  return [...by_title.values()];
}

/** A file's spreadsheet title, which copies of one spreadsheet in several messages share. */
function title_of(path: string): string {
  return (path.split("__").at(-1) ?? path).toLowerCase();
}
/** A cell of the sample: `[row, col, value]`; a formula is its text with `=`. */
type SampleCell = [number, number, CellScalar];

interface SampleSheet {
  name: string;
  rows: number;
  cols: number;
  cells: SampleCell[];
  /** Set on hidden and very hidden sheets of the whole-workbook sets. */
  hidden?: true;
}

interface SampleWorkbook {
  file: string;
  sheets: SampleSheet[];
  targets: [number, number, number][];
  /** Defined names, so formulas that use them read as names, not as unknown text. */
  names: SampleName[];
}

/** The cells of each sheet by `row × KEY_COLS + col`; formulas as their text. */
function cell_maps(snapshot: WorkbookSnapshot): Map<number, CellScalar>[] {
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

function keep_area(
  kept: KeptCells,
  top: number,
  left: number,
  bottom: number,
  right: number,
): void {
  for (let row = Math.max(0, top); row <= bottom; row++) {
    for (let col = Math.max(0, left); col <= right; col++) kept.add(row * KEY_COLS + col);
  }
}

/** Keep the cells a formula's typist would see and the ranges it reads. */
function keep_around(
  snapshot: WorkbookSnapshot,
  kept: KeptCells[],
  target: { sheet: number; row: number; col: number; formula: string },
): void {
  const own = kept[target.sheet];
  if (own === undefined) return;
  const { row, col } = target;
  keep_area(own, row - ROWS_ABOVE, col - COLS_LEFT, row + ROWS_BELOW, col + COLS_RIGHT);
  keep_area(own, 0, col - COLS_LEFT, HEADER_ROWS - 1, col + COLS_RIGHT);

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
    keep_area(
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
function sample_names(snapshot: WorkbookSnapshot): SampleName[] {
  const seen = new Set<string>();
  const names: SampleName[] = [];
  for (const named of snapshot.workbook.namedRanges ?? []) {
    const key = named.name.toUpperCase();
    if (seen.has(key)) continue;
    if (named.range !== undefined) {
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

function sampled_value(value: CellScalar): CellScalar {
  return typeof value === "string" && !value.startsWith("=") && value.length > MAX_TEXT
    ? value.slice(0, MAX_TEXT)
    : value;
}

/**
 * The sample of one workbook, or null when it has too few formulas. With
 * `whole`, it keeps every cell and marks hidden sheets.
 */
function sample_workbook(
  file: string,
  snapshot: WorkbookSnapshot,
  random: () => number,
  whole: boolean,
): SampleWorkbook | null {
  const cells = cell_maps(snapshot);
  const formulas = cells.flatMap((map, sheet) =>
    [...map].flatMap(([key, value]) =>
      typeof value === "string" && value.startsWith("=")
        ? [{ sheet, row: Math.floor(key / KEY_COLS), col: key % KEY_COLS, formula: value }]
        : [],
    ),
  );
  if (formulas.length < MIN_FORMULAS) return null;

  const targets = shuffled(formulas, random).slice(0, TARGETS_PER_WORKBOOK);
  const kept: KeptCells[] = cells.map((map) => (whole ? new Set(map.keys()) : new Set()));
  if (!whole) for (const target of targets) keep_around(snapshot, kept, target);

  const sheets = snapshot.sheets.map((sheet, index): SampleSheet => {
    const map = cells[index] ?? new Map<number, CellScalar>();
    const sheet_cells: SampleCell[] = [...(kept[index] ?? [])]
      .sort((left, right) => left - right)
      .flatMap((key) => {
        const value = map.get(key);
        if (value === undefined || value === null) return [];
        return [[Math.floor(key / KEY_COLS), key % KEY_COLS, sampled_value(value)]];
      });
    // A loop, not Math.max(...cells): a whole sheet can hold more cells than a call takes arguments.
    let rows = 1;
    let cols = 1;
    for (const [row, col] of sheet_cells) {
      rows = Math.max(rows, row + 1);
      cols = Math.max(cols, col + 1);
    }
    const hidden = whole && (sheet.visibility ?? "visible") !== "visible";
    return {
      name: sheet.name,
      rows,
      cols,
      cells: sheet_cells,
      ...(hidden ? { hidden: true } : {}),
    };
  });
  return {
    file,
    sheets,
    targets: targets.map(({ sheet, row, col }) => [sheet, row, col]),
    names: sample_names(snapshot),
  };
}

/** One seeded draw of `count` workbooks, skipping the spreadsheet titles in `exclude`. */
async function draw(
  archive: string,
  scratch: string,
  options: { seed: number; count: number; exclude: ReadonlySet<string>; whole?: boolean },
): Promise<{ sampled: SampleWorkbook[]; refused: number }> {
  const random = seeded_random(options.seed);
  const spreadsheets = await distinct_spreadsheets(archive);
  const candidates = shuffled(
    spreadsheets.filter((path) => !options.exclude.has(title_of(path))),
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
      const workbook = sample_workbook(file, snapshot, random, options.whole ?? false);
      if (workbook !== null) sampled.push(workbook);
    }
  }
  await rm(join(scratch, "batch"), { recursive: true, force: true });
  return { sampled, refused };
}

async function write_set(name: string, seed: number, workbooks: SampleWorkbook[]): Promise<URL> {
  const path = new URL(`./${name}.json`, import.meta.url);
  await writeFile(path, `${JSON.stringify({ seed, workbooks })}\n`);
  return path;
}

/** The spreadsheet titles of a written set, so a later draw can stay clear of them. */
async function titles_in(name: string): Promise<string[]> {
  const text = await readFile(new URL(`./${name}.json`, import.meta.url), "utf8");
  const set: unknown = JSON.parse(text);
  const workbooks =
    typeof set === "object" && set !== null && "workbooks" in set ? set.workbooks : [];
  if (!Array.isArray(workbooks)) return [];
  return workbooks.flatMap((workbook: unknown) =>
    typeof workbook === "object" &&
    workbook !== null &&
    "file" in workbook &&
    typeof workbook.file === "string"
      ? [title_of(workbook.file)]
      : [],
  );
}

/** Write a set that isn't committed, and check it against its recorded SHA-256. */
async function write_checked(
  name: string,
  seed: number,
  workbooks: SampleWorkbook[],
  sha256: string,
): Promise<void> {
  const written = await write_set(name, seed, workbooks);
  const digest = new Bun.CryptoHasher("sha256").update(await readFile(written)).digest("hex");
  if (digest !== sha256) throw new Error(`${name}.json: SHA-256 ${digest}, recorded ${sha256}`);
}

const MODES = ["--held-out", "--dev-large", "--dev-large-whole", "--held-out-whole"];

async function main(): Promise<void> {
  const [archive, scratch, mode] = process.argv.slice(2);
  if (
    archive === undefined ||
    scratch === undefined ||
    (mode !== undefined && !MODES.includes(mode))
  ) {
    throw new Error(
      `Usage: bun build.ts <spreadsheets.7z> <scratch folder> [${MODES.join(" | ")}]`,
    );
  }
  await ensure_archive(archive);
  await check_archive(archive);
  await initSheetwrite({ addons: [xlsxAddon()] });

  let report: { sampled: SampleWorkbook[]; refused: number };
  if (mode !== undefined) {
    const exclude = new Set([...(await titles_in("dev")), ...(await titles_in("dev2"))]);
    const burned = await draw(archive, scratch, {
      seed: BURNED_HELD_OUT_SEED,
      count: HELD_OUT_WORKBOOKS,
      exclude,
    });
    process.stdout.write(`Burned draw (seed ${BURNED_HELD_OUT_SEED}): ${summary(burned)}\n`);
    for (const workbook of burned.sampled) exclude.add(title_of(workbook.file));
    if (mode === "--held-out") {
      report = await draw(archive, scratch, {
        seed: HELD_OUT_SEED,
        count: HELD_OUT_WORKBOOKS,
        exclude,
      });
      await write_set("heldout", HELD_OUT_SEED, report.sampled);
    } else if (mode === "--held-out-whole") {
      for (const title of await titles_in("heldout")) exclude.add(title);
      for (const title of await titles_in("dev-large")) exclude.add(title);
      report = await draw(archive, scratch, {
        seed: HELD_OUT_WHOLE_SEED,
        count: HELD_OUT_WORKBOOKS,
        exclude,
        whole: true,
      });
      await write_checked(
        "heldout-whole",
        HELD_OUT_WHOLE_SEED,
        report.sampled,
        HELD_OUT_WHOLE_SHA256,
      );
    } else {
      for (const title of await titles_in("heldout")) exclude.add(title);
      const whole = mode === "--dev-large-whole";
      report = await draw(archive, scratch, {
        seed: DEV_LARGE_SEED,
        count: DEV_LARGE_WORKBOOKS,
        exclude,
        whole,
      });
      await write_checked(
        whole ? "dev-large-whole" : "dev-large",
        DEV_LARGE_SEED,
        report.sampled,
        whole ? DEV_LARGE_WHOLE_SHA256 : DEV_LARGE_SHA256,
      );
    }
  } else {
    report = await draw(archive, scratch, {
      seed: DEV_SEED,
      count: DEV_WORKBOOKS,
      exclude: new Set(),
    });
    // Alternate the drawn order between the two development sets.
    await write_set(
      "dev",
      DEV_SEED,
      report.sampled.filter((_, index) => index % 2 === 0),
    );
    await write_set(
      "dev2",
      DEV_SEED,
      report.sampled.filter((_, index) => index % 2 === 1),
    );
  }

  process.stdout.write(`${summary(report)}\n`);
}

/** A draw's size: workbooks, formulas, and the files the reader refused. */
function summary(report: { sampled: SampleWorkbook[]; refused: number }): string {
  const formulas = report.sampled.reduce((sum, workbook) => sum + workbook.targets.length, 0);
  return `${report.sampled.length} workbooks, ${formulas} formulas; ${report.refused} files refused by the reader`;
}

await main();
