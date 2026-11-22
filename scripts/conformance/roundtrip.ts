import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
} from "../../packages/core/src/document-protocol.js";
import type { WorkbookSnapshot, XlsxSourceGraph } from "../../packages/core/src/types/document.js";
import type { XlsxWorkbookWarning } from "../../packages/core/src/types/xlsx.js";
import { sheetwriteWorkbookBackend } from "../../packages/xlsx/src/workbook.js";
import { canonicalJson } from "./normalize.js";

const MAX_ROUNDTRIP_BYTES = 16 * 1024 * 1024;
const ROUNDTRIP_OUTPUT = "test-results/conformance/libreoffice-workbook-roundtrips.json";
const LIBREOFFICE_FIXTURE = "packages/xlsx/test/fixtures/libreoffice-rich.xlsx";
const LIBREOFFICE_DEFAULT_MAX_CHANGE = 0.0001;

export interface WorkbookRoundtripResaver {
  readonly producer: "libreoffice";
  readonly producerVersion: string;
  resave(bytes: Uint8Array, id: string): Promise<Uint8Array>;
}

export interface WorkbookRoundtripChain {
  readonly id: string;
  readonly direction: "sheetwrite-producer-sheetwrite" | "producer-sheetwrite-producer-sheetwrite";
  readonly inputSha256: string;
  readonly inputBytes: number;
  readonly producerSha256: string;
  readonly producerBytes: number;
  readonly importWarnings: readonly XlsxWorkbookWarning[];
  readonly differences: readonly string[];
  readonly knownProducerDifferences: readonly string[];
  readonly status: "pass" | "divergent";
}

export interface WorkbookRoundtripArtifact {
  readonly protocol: 1;
  readonly producer: "libreoffice";
  readonly producerVersion: string;
  readonly capturedAt: string;
  readonly chains: readonly WorkbookRoundtripChain[];
  readonly blockedChains: readonly string[];
  readonly status: "pass" | "partial";
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bounded(bytes: Uint8Array, label: string): Uint8Array {
  if (bytes.byteLength > MAX_ROUNDTRIP_BYTES) {
    throw new Error(`${label} exceeds ${MAX_ROUNDTRIP_BYTES} bytes`);
  }
  return bytes;
}
function range_key(entry: {
  range: { sheet: string; start: { row: number; col: number }; end: { row: number; col: number } };
}): string {
  const { sheet, start, end } = entry.range;
  return `${sheet}:${start.row}:${start.col}:${end.row}:${end.col}:${JSON.stringify(entry)}`;
}

function sorted_ranges<T extends Parameters<typeof range_key>[0]>(
  entries: readonly T[] | undefined,
): T[] | undefined {
  return entries
    ? [...entries].sort((left, right) => range_key(left).localeCompare(range_key(right)))
    : undefined;
}

/** Normalized semantic state compared independently from ZIP/XML byte identity. */
export function workbookFeatureState(snapshot: WorkbookSnapshot): unknown {
  // Preserved XLSX parts are opaque producer bytes, so a resave by another
  // application changes or adds them by design. Their loss is checked
  // separately by `retainedGraphLosses`, which allows additions.
  const { xlsxSource: _preserved_parts, ...workbook } = snapshot.workbook;
  return {
    schemaVersion: snapshot.schemaVersion,
    documentId: snapshot.documentId,
    version: snapshot.version,
    workbook,
    sheets: [...snapshot.sheets]
      .sort((left, right) => left.order - right.order)
      .map((sheet) => {
        const { cells, ...metadata } = sheet;
        const columns = sheet.columns.map(({ visible, ...column }) =>
          visible === true ? column : { ...column, visible },
        );
        const comparable_cells = cells.flatMap((block) =>
          block.cells.map((cell) => ({
            row: block.startRow + cell.rowOffset,
            col: block.startCol + cell.colOffset,
            value: cell.value,
            ...(cell.style === undefined ? {} : { style: cell.style }),
          })),
        );
        const hyperlinks = sheet.hyperlinks?.map(({ id: _generated_id, style, ...link }) => {
          // Relationship ids are import-local identities, not workbook behavior.
          // LibreOffice stores link presentation in cell fonts instead of link
          // metadata. Compare that presentation, never discard a missing style.
          // WindowReader.mergeHyperlinkStyles gives explicit cell fonts priority
          // over link defaults, so this move preserves the painted result.
          if (style === undefined) return link;
          const r0 = Math.min(link.range.start.row, link.range.end.row);
          const r1 = Math.max(link.range.start.row, link.range.end.row);
          const c0 = Math.min(link.range.start.col, link.range.end.col);
          const c1 = Math.max(link.range.start.col, link.range.end.col);
          let covered = 0;
          for (const cell of comparable_cells) {
            if (cell.row < r0 || cell.row > r1 || cell.col < c0 || cell.col > c1) continue;
            cell.style = { ...cell.style, ...style };
            covered += 1;
          }
          return covered === (r1 - r0 + 1) * (c1 - c0 + 1) ? link : { ...link, style };
        });
        return {
          ...metadata,
          visibility: sheet.visibility ?? "visible",
          columns,
          tables: sorted_ranges(sheet.tables),
          hyperlinks: sorted_ranges(hyperlinks),
          conditionalFormats: sorted_ranges(sheet.conditionalFormats),
          cells: comparable_cells.sort(
            (left, right) => left.row - right.row || left.col - right.col,
          ),
        };
      }),
  };
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) result[key] = normalized(entry);
    }
    return result;
  }
  return value;
}

/** Kind of a retained graph: who links to it and through which relationship. */
function retained_graph_kind(graph: XlsxSourceGraph): string {
  return `${graph.owner}${graph.sheetId === undefined ? "" : `:${graph.sheetId}`} ${graph.type}`;
}

/**
 * Retained graphs (charts, pivots, drawings, …) the round trip lost, as a
 * count per kind. Producers rename parts and add graphs of their own (a
 * theme, document properties), so no graph identity is stable across them;
 * this proves only that no kind lost members. A dropped chart replaced by a
 * different chart on the same owner still passes.
 */
export function retainedGraphLosses(
  expected: WorkbookSnapshot,
  actual: WorkbookSnapshot,
): string[] {
  const remaining = new Map<string, number>();
  for (const graph of expected.workbook.xlsxSource?.graphs ?? []) {
    const kind = retained_graph_kind(graph);
    remaining.set(kind, (remaining.get(kind) ?? 0) + 1);
  }
  for (const graph of actual.workbook.xlsxSource?.graphs ?? []) {
    const kind = retained_graph_kind(graph);
    const count = remaining.get(kind);
    if (count !== undefined) remaining.set(kind, count - 1);
  }

  const losses: string[] = [];
  for (const [kind, count] of remaining) {
    if (count > 0) losses.push(`$workbook.xlsxSource.graphs: ${count} retained ${kind} lost`);
  }
  return losses;
}

export function structuralDifferences(expected: unknown, actual: unknown): string[] {
  const differences: string[] = [];
  const visit = (left: unknown, right: unknown, path: string): void => {
    if (differences.length >= 256) return;
    if (Object.is(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length)
        differences.push(`${path}.length: ${left.length} != ${right.length}`);
      for (let index = 0; index < Math.min(left.length, right.length); index++) {
        visit(left[index], right[index], `${path}[${index}]`);
      }
      return;
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const left_record = left as Record<string, unknown>;
      const right_record = right as Record<string, unknown>;
      const keys = [...new Set([...Object.keys(left_record), ...Object.keys(right_record)])].sort();
      for (const key of keys) visit(left_record[key], right_record[key], `${path}.${key}`);
      return;
    }
    differences.push(`${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
  };
  visit(normalized(expected), normalized(actual), "$workbook");
  return differences;
}

function sheetwrite_workbook(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 5,
        columns: [
          { key: "amount", header: "Amount", width: 100, type: "number" },
          { key: "result", header: "Result", width: 140, type: "text" },
        ],
        tables: [
          {
            id: "sales-table",
            name: "Sales",
            range: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 4, col: 0 } },
            columns: [{ id: "amount-column", name: "Amount", totalsRowLabel: "Total" }],
            headerRow: true,
            totalsRow: true,
            style: { name: "TableStyleMedium2", showRowStripes: true },
          },
        ],
        hyperlinks: [
          {
            id: "report-link",
            range: { sheet: "data", start: { row: 1, col: 0 }, end: { row: 1, col: 0 } },
            target: { kind: "external", url: "https://example.com/report" },
            display: "Report",
            style: { color: "#123456", underline: true },
          },
          {
            id: "summary-link",
            range: { sheet: "data", start: { row: 1, col: 1 }, end: { row: 1, col: 1 } },
            target: {
              kind: "internal",
              range: {
                sheet: "summary",
                start: { row: 0, col: 0 },
                end: { row: 0, col: 0 },
              },
            },
            display: "Summary",
          },
        ],
        conditionalFormats: [
          {
            range: { sheet: "data", start: { row: 0, col: 1 }, end: { row: 4, col: 1 } },
            when: { kind: "formula", source: '=A1<>""' },
            style: { backgroundColor: "#ABCDEF", bold: true },
            stopIfTrue: true,
          },
        ],
        // One chart of each kind, so LibreOffice reads and rewrites every chart part Sheetwrite writes.
        charts: (["column", "bar", "line", "area", "pie", "doughnut", "scatter"] as const).map(
          (kind, index) => ({
            id: `amount-${kind}`,
            kind,
            title: `Amounts (${kind})`,
            ...(kind === "pie" || kind === "doughnut"
              ? {}
              : { axes: { xTitle: "Row", yTitle: "Amount" } }),
            legend: "bottom" as const,
            anchor: { row: index % 5, col: 1, offsetX: 4, offsetY: 2, width: 360, height: 240 },
            series: [
              {
                nameRange: { sheet: "data", start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
                values: { sheet: "data", start: { row: 2, col: 0 }, end: { row: 3, col: 0 } },
                ...(kind === "scatter"
                  ? {
                      categories: {
                        sheet: "data",
                        start: { row: 2, col: 0 },
                        end: { row: 3, col: 0 },
                      },
                    }
                  : {}),
              },
            ],
          }),
        ),
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 5,
            colCount: 2,
            cells: [
              { rowOffset: 0, colOffset: 0, value: { kind: "literal", value: "Amount" } },
              {
                rowOffset: 0,
                colOffset: 1,
                value: { kind: "formula", src: "=SUM(Sales[Amount])" },
              },
              // Excel shows hyperlink text from the cell value; a separate
              // display attribute cannot make numeric 10 display as "Report".
              { rowOffset: 1, colOffset: 0, value: { kind: "literal", value: "Report" } },
              { rowOffset: 1, colOffset: 1, value: { kind: "literal", value: "Summary" } },
              { rowOffset: 2, colOffset: 0, value: { kind: "literal", value: 20 } },
              // Keep both numeric amounts inside the table's data body.
              { rowOffset: 3, colOffset: 0, value: { kind: "literal", value: 10 } },
              { rowOffset: 4, colOffset: 0, value: { kind: "literal", value: "Total" } },
            ],
          },
        ],
      },
      {
        id: "summary",
        name: "Summary",
        order: 1,
        rowCount: 1,
        columns: [{ key: "value", header: "Value", width: 120, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [
              {
                rowOffset: 0,
                colOffset: 0,
                value: { kind: "formula", src: "=SUM(Sales[Amount])" },
              },
            ],
          },
        ],
      },
    ],
  };
}

async function import_workbook(bytes: Uint8Array): Promise<{
  snapshot: WorkbookSnapshot;
  warnings: XlsxWorkbookWarning[];
}> {
  const warnings: XlsxWorkbookWarning[] = [];
  const snapshot = await sheetwriteWorkbookBackend.fromXlsxWorkbook(bytes, {
    onWarning: (warning) => warnings.push(warning),
  });
  return { snapshot, warnings };
}

async function chain(
  id: string,
  direction: WorkbookRoundtripChain["direction"],
  input: Uint8Array,
  expected: WorkbookSnapshot,
  resaver: WorkbookRoundtripResaver,
  initial_warnings: readonly XlsxWorkbookWarning[] = [],
): Promise<WorkbookRoundtripChain> {
  const producer_bytes = bounded(await resaver.resave(input, id), `${id} producer output`);
  const imported = await import_workbook(producer_bytes);
  const differences = [
    ...structuralDifferences(
      workbookFeatureState(expected),
      workbookFeatureState(imported.snapshot),
    ),
    ...retainedGraphLosses(expected, imported.snapshot),
  ];
  // LibreOffice substitutes its own inactive default threshold for Excel's
  // default. Record that exact rewrite; custom limits and enabled iteration
  // remain strict even when the producer would treat them as inactive.
  const original_calculation = expected.workbook.calculation;
  const imported_calculation = imported.snapshot.workbook.calculation;
  const default_iteration_rewrite =
    (original_calculation === undefined ||
      (!original_calculation.iterate &&
        original_calculation.maxIterations === DEFAULT_MAX_ITERATIONS &&
        original_calculation.maxChange === DEFAULT_MAX_CHANGE)) &&
    imported_calculation?.iterate === false &&
    imported_calculation.maxIterations === DEFAULT_MAX_ITERATIONS &&
    imported_calculation.maxChange === LIBREOFFICE_DEFAULT_MAX_CHANGE;
  const known_producer_differences = differences.filter(
    (difference) =>
      /^\$workbook\.sheets\[\d+\]\.conditionalFormats\[\d+\]\.stopIfTrue: true != undefined$/.test(
        difference,
      ) ||
      (default_iteration_rewrite &&
        /^\$workbook\.workbook\.calculation(?:\.(?:maxIterations|maxChange))?:/.test(difference)),
  );
  const unexpected_differences = differences.filter(
    (difference) => !known_producer_differences.includes(difference),
  );
  return {
    id,
    direction,
    inputSha256: sha256(input),
    inputBytes: input.byteLength,
    producerSha256: sha256(producer_bytes),
    producerBytes: producer_bytes.byteLength,
    importWarnings: [...initial_warnings, ...imported.warnings],
    differences: unexpected_differences,
    knownProducerDifferences: known_producer_differences,
    status: unexpected_differences.length === 0 ? "pass" : "divergent",
  };
}

export async function runWorkbookRoundtrips(
  resaver: WorkbookRoundtripResaver,
  options: { capturedAt?: Date; libreOfficeFixture?: Uint8Array } = {},
): Promise<WorkbookRoundtripArtifact> {
  const source = sheetwrite_workbook();
  const source_bytes = bounded(
    await sheetwriteWorkbookBackend.toXlsxWorkbook(source),
    "Sheetwrite workbook",
  );
  const source_import = await import_workbook(source_bytes);
  const first = await chain(
    "sheetwrite-libreoffice-sheetwrite",
    "sheetwrite-producer-sheetwrite",
    source_bytes,
    source_import.snapshot,
    resaver,
    source_import.warnings,
  );

  const fixture_bytes = bounded(
    options.libreOfficeFixture ?? new Uint8Array(await readFile(LIBREOFFICE_FIXTURE)),
    "LibreOffice fixture",
  );
  const fixture_import = await import_workbook(fixture_bytes);
  const sheetwrite_bytes = bounded(
    await sheetwriteWorkbookBackend.toXlsxWorkbook(fixture_import.snapshot),
    "Sheetwrite re-export",
  );
  const second = await chain(
    "libreoffice-sheetwrite-libreoffice-sheetwrite",
    "producer-sheetwrite-producer-sheetwrite",
    sheetwrite_bytes,
    fixture_import.snapshot,
    resaver,
    fixture_import.warnings,
  );
  const chains = [first, second];
  return {
    protocol: 1,
    producer: "libreoffice",
    producerVersion: resaver.producerVersion,
    capturedAt: (options.capturedAt ?? new Date()).toISOString(),
    chains,
    blockedChains: [
      "Excel producer chains require an authenticated current Excel runner",
      "Google Sheets workbook chains require authenticated Drive/Sheets access",
      "Excel-to-Google and Google-to-Excel chains require both authenticated producers",
    ],
    status: chains.every((entry) => entry.status === "pass") ? "pass" : "partial",
  };
}

async function run_process(command: readonly string[]): Promise<string> {
  const process = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => process.kill(), 120_000);
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]).finally(() => clearTimeout(timer));
  if (exit_code !== 0) {
    throw new Error(`${command[0]} exited ${exit_code}: ${(stderr || stdout).trim()}`);
  }
  return stdout.trim();
}

export async function createLibreOfficeResaver(): Promise<
  WorkbookRoundtripResaver & { dispose(): Promise<void> }
> {
  const version = await run_process(["libreoffice", "--version"]);
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-libreoffice-roundtrip-"));
  const profile = join(root, "profile");
  await mkdir(profile, { recursive: true });
  return {
    producer: "libreoffice",
    producerVersion: version.replace(/^LibreOffice\s+/i, ""),
    async resave(bytes, id) {
      bounded(bytes, `${id} input`);
      const input_directory = join(root, `${id}-input`);
      const output_directory = join(root, `${id}-output`);
      await Promise.all([
        mkdir(input_directory, { recursive: true }),
        mkdir(output_directory, { recursive: true }),
      ]);
      const input_path = join(input_directory, `${id}.xlsx`);
      await writeFile(input_path, bytes);
      await run_process([
        "libreoffice",
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        "--headless",
        "--convert-to",
        "xlsx",
        "--outdir",
        output_directory,
        input_path,
      ]);
      const output_path = join(output_directory, basename(input_path));
      const metadata = await stat(output_path);
      if (metadata.size > MAX_ROUNDTRIP_BYTES) {
        throw new Error(`${id} producer output exceeds ${MAX_ROUNDTRIP_BYTES} bytes`);
      }
      return new Uint8Array(await readFile(output_path));
    },
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function captureLibreOfficeWorkbookRoundtrips(
  outputPath = ROUNDTRIP_OUTPUT,
): Promise<WorkbookRoundtripArtifact> {
  const resaver = await createLibreOfficeResaver();
  try {
    const artifact = await runWorkbookRoundtrips(resaver);
    const destination = resolve(outputPath);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await writeFile(destination, `${canonicalJson(artifact)}\n`);
    return artifact;
  } finally {
    await resaver.dispose();
  }
}
