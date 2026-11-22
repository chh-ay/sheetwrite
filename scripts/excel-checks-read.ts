/**
 * Reads the copy of excel-checks-0.7.0.xlsx that Excel saved and prints, for
 * each check, Sheetwrite's answer against Excel's.
 *
 *   bun run build && bun scripts/excel-checks-read.ts excel-checks-0.7.0-excel.xlsx
 *
 * Results blocks are read cell by cell. The sort state, the data model, the
 * links, the query and the charts are compared with the parts Sheetwrite
 * writes for the same workbook after the same steps, and the saved file is
 * imported with Sheetwrite where a check says what Sheetwrite must import.
 */
import { readFileSync } from "node:fs";

import type { WorkbookSnapshot } from "../packages/core/dist/index.js";
import {
  childOf,
  childrenOf,
  descendants,
  textOf,
  XlsxPackage,
  type XmlNode,
} from "./excel-checks/ooxml.js";
import {
  a1,
  EXCEL_OFFSET,
  excelChecksWorkbook,
  loadSheetwrite,
  REPAIR_ROW,
  type ResultBlock,
  SHEETWRITE_OFFSET,
} from "./excel-checks/workbook.js";

/** Results blocks longer than this print only their differences. */
const MAX_LISTED_ROWS = 12;

const saved_path = process.argv[2];
if (!saved_path)
  throw new Error("Usage: bun scripts/excel-checks-read.ts <workbook Excel saved>.xlsx");

const sheetwrite = await loadSheetwrite();
const written = await excelChecksWorkbook(sheetwrite, { afterSteps: true });
const saved_bytes = readFileSync(saved_path);
const saved = new XlsxPackage(saved_bytes);
const ours = new XlsxPackage(written.bytes);
const imported = await sheetwrite.core.fromXlsxWorkbook(saved_bytes, {
  powerQuery: sheetwrite.powerQuery,
});

const print = (line = "") => process.stdout.write(`${line}\n`);

/** One compared item: Sheetwrite's answer, Excel's, and whether they are the same. */
function compare(what: string, sheetwrite_answer: string, excel_answer: string): boolean {
  const same = sheetwrite_answer === excel_answer;
  print(`  ${same ? "same  " : "DIFFER"} ${what}`);
  print(`         Sheetwrite: ${sheetwrite_answer}`);
  print(`         Excel:      ${excel_answer}`);
  return same;
}

function report(what: string, answer: string): void {
  print(`  ${what}: ${answer}`);
}

function application(pkg: XlsxPackage): string {
  return (
    textOf(childOf(childOf(pkg.xml("docProps/app.xml"), "Properties"), "Application")) || "unknown"
  );
}

/** A results block: Excel keeps the What and Sheetwrite columns as written and computes Excel shows. */
function results_block(sheet: string, block: ResultBlock): void {
  const cells = saved.cells(sheet);
  const value = (row: number, col: number) => cells.get(a1(row, col))?.value ?? "";
  const rows = Array.from({ length: block.count }, (_, index) => {
    const row = block.row + 1 + index;
    return {
      what: value(row, block.col),
      sheetwriteAnswer: value(row, block.col + SHEETWRITE_OFFSET),
      excelAnswer: value(row, block.col + EXCEL_OFFSET),
    };
  });
  const differing = rows.filter((row) => row.sheetwriteAnswer !== row.excelAnswer);
  const listed = rows.length > MAX_LISTED_ROWS ? differing : rows;
  print(`  ${rows.length - differing.length} of ${rows.length} the same`);
  for (const row of listed) compare(row.what, row.sheetwriteAnswer, row.excelAnswer);
}

// ---------------------------------------------------------------- Structure

const attributes_text = (node: XmlNode | undefined) =>
  node
    ? `${node.name}(${Object.entries(node.attributes)
        .filter(([key]) => key !== "id" && key !== "uid")
        .map(([key, val]) => `${key}=${val}`)
        .join(", ")})`
    : "none";

function table_sort_state(pkg: XlsxPackage, sheet: string, table: string): string {
  const node = pkg.tables(sheet).find((candidate) => candidate.attributes.name === table);
  const state = descendants(node, "sortState")[0];
  return state
    ? [state, ...childrenOf(state, "sortCondition")].map(attributes_text).join(" ")
    : "none";
}

function sheet_sort_state(pkg: XlsxPackage, sheet: string): string {
  const path = pkg.sheetPath(sheet);
  const worksheet = childOf(path ? pkg.xml(path) : undefined, "worksheet");
  const state =
    childOf(worksheet, "sortState") ??
    descendants(childOf(worksheet, "autoFilter"), "sortState")[0];
  return state
    ? [state, ...childrenOf(state, "sortCondition")].map(attributes_text).join(" ")
    : "none";
}

/** Excel's data model relationships, from the workbook's x15:dataModel extension. */
function model_relationships(pkg: XlsxPackage): string {
  const relationships = descendants(pkg.xml("xl/workbook.xml"), "modelRelationship").map(
    ({ attributes }) =>
      `${attributes.fromTable}[${attributes.fromColumn}] → ${attributes.toTable}[${attributes.toColumn}]`,
  );
  return relationships.join("; ") || "none";
}

function imported_relationships(snapshot: WorkbookSnapshot): string {
  const table_names = new Map(
    snapshot.sheets.flatMap((sheet) =>
      (sheet.tables ?? []).map((table) => [table.id, table.name] as const),
    ),
  );
  const name = (id: string) => table_names.get(id) ?? id;
  return (
    (snapshot.workbook.dataModel?.relationships ?? [])
      .map(
        ({ from, to }) => `${name(from.table)}[${from.column}] → ${name(to.table)}[${to.column}]`,
      )
      .sort()
      .join("; ") || "none"
  );
}

function external_links(pkg: XlsxPackage): string {
  return (
    pkg
      .related("xl/workbook.xml", "externalLink")
      .map((link) => {
        const book = pkg.related(link.target, "externalLinkPath")[0]?.target ?? "?";
        const values = descendants(pkg.xml(link.target), "cell").map(
          (cell) => `${cell.attributes.r}=${childOf(cell, "v")?.text ?? ""}`,
        );
        return `${book} [${values.join(", ") || "no values"}]`;
      })
      .join("; ") || "none"
  );
}

function power_query(pkg: XlsxPackage): string {
  const mashup = pkg.paths
    .filter(
      (path) =>
        path.startsWith("customXml/item") && !path.includes("Props") && !path.includes("_rels"),
    )
    .some((path) => pkg.text(path)?.includes("DataMashup"));
  const connections = descendants(pkg.xml("xl/connections.xml"), "connection").map(
    (connection) => connection.attributes.name ?? "?",
  );
  return `DataMashup ${mashup ? "present" : "missing"}; connections: ${connections.join(", ") || "none"}`;
}

const points = (node: XmlNode | undefined) =>
  childrenOf(node, "pt")
    .map((point) => `${point.attributes.idx}:${textOf(point)}`)
    .join(" ");

/** The cells of a range reference such as `'15 Chart levels'!$A$10:$B$13`, row by row. */
function range_values(pkg: XlsxPackage, ref: string): string[][] {
  const match = /^'?(.+?)'?!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(ref);
  if (!match) return [];
  const [, sheet = "", first_col = "", first_row = "", last_col = "", last_row = ""] = match;
  const cells = pkg.cells(sheet);
  const rows: string[][] = [];
  for (let row = Number(first_row); row <= Number(last_row); row++) {
    const values: string[] = [];
    for (let col = column_index(first_col); col <= column_index(last_col); col++) {
      values.push(cells.get(a1(row - 1, col))?.value ?? "");
    }
    rows.push(values);
  }
  return rows;
}

const LETTERS = 26;
const BEFORE_A = "A".charCodeAt(0) - 1;

function column_index(name: string): number {
  let index = 0;
  for (const letter of name) index = index * LETTERS + letter.charCodeAt(0) - BEFORE_A;
  return index - 1;
}

interface ChartSummary {
  /** Kind, title, pivot, ranges and whether labels have levels. */
  readonly shape: string;
  /** The labels and values cached in the chart, as Excel draws them. */
  readonly drawn: string;
  readonly categories?: string;
  readonly values?: string;
}

const drawn_text = (levels: readonly string[], values: readonly string[]) =>
  `labels [${levels.join(" | ")}] values [${values.join(" ")}]`;

function chart_summary(chart_space: XmlNode | undefined): ChartSummary {
  const chart = childOf(chart_space, "chart");
  const plot = childOf(chart, "plotArea");
  const kinds = (plot?.children ?? []).filter((child) => child.name.endsWith("Chart"));
  const bar_direction = (kind: XmlNode) => childOf(kind, "barDir")?.attributes.val;
  const pivot_source = childOf(chart_space, "pivotSource");
  const shape = [
    `kind ${kinds.map((kind) => [kind.name, bar_direction(kind)].filter(Boolean).join("/")).join("+")}`,
    `title "${descendants(childOf(chart, "title"), "t")
      .map((run) => run.text)
      .join("")}"`,
    `pivot ${pivot_source ? textOf(childOf(pivot_source, "name")) || "yes" : "no"}`,
    `noMultiLvlLbl ${childOf(descendants(plot, "catAx")[0], "noMultiLvlLbl")?.attributes.val ?? "absent"}`,
  ];
  const drawn: string[] = [];
  let categories: string | undefined;
  let values: string | undefined;
  for (const series of descendants(plot, "ser")) {
    const cat = childOf(series, "cat");
    const multi = childOf(cat, "multiLvlStrRef");
    const single = childOf(cat, "strRef") ?? childOf(cat, "numRef");
    categories = textOf(childOf(multi ?? single, "f")) || undefined;
    values = textOf(childOf(childOf(childOf(series, "val"), "numRef"), "f")) || undefined;
    shape.push(
      `categories ${categories ?? "no range"} ${multi ? "multi-level" : "one level"}`,
      `values ${values ?? "no range"}`,
    );
    const levels = multi
      ? childrenOf(childOf(multi, "multiLvlStrCache"), "lvl").map(points)
      : [
          points(
            childOf(single, "strCache") ?? childOf(single, "numCache") ?? childOf(cat, "strLit"),
          ),
        ];
    const cached_values = descendants(childOf(series, "val"), "pt").map(textOf);
    if (levels.some(Boolean) || cached_values.length > 0)
      drawn.push(drawn_text(levels, cached_values));
  }
  return {
    shape: shape.join("; "),
    drawn: drawn.join("; "),
    ...(categories ? { categories } : {}),
    ...(values ? { values } : {}),
  };
}

/**
 * What a chart over cells draws, from Sheetwrite's cells: Excel caches the
 * innermost level (the last column) first, and a blank cell continues the
 * label above it.
 */
function drawn_from_cells(pkg: XlsxPackage, summary: ChartSummary): string {
  if (!summary.categories || !summary.values) return "nothing";
  const rows = range_values(pkg, summary.categories);
  const width = rows[0]?.length ?? 0;
  const levels = Array.from({ length: width }, (_, level) =>
    rows
      .map((row, index) => [index, row[width - 1 - level] ?? ""] as const)
      .filter(([, label]) => label !== "")
      .map(([index, label]) => `${index}:${label}`)
      .join(" "),
  );
  return drawn_text(
    levels,
    range_values(pkg, summary.values).map((row) => row[0] ?? ""),
  );
}

/**
 * Compare each chart's shape and what it draws. Sheetwrite caches labels only
 * where no cells hold them (pivot and dashboard charts); a chart over cells
 * draws its cells, so those are what Excel should draw.
 */
function charts(sheet: string): void {
  const our_charts = ours.charts(sheet);
  const saved_charts = saved.charts(sheet);
  const count = Math.max(our_charts.length, saved_charts.length);
  for (let index = 0; index < count; index++) {
    const our_chart = chart_summary(our_charts[index]?.chartSpace);
    const saved_chart = chart_summary(saved_charts[index]?.chartSpace);
    compare(`chart ${index + 1}`, our_chart.shape, saved_chart.shape);
    compare(
      `chart ${index + 1} draws`,
      our_chart.drawn || drawn_from_cells(ours, our_chart),
      saved_chart.drawn || "nothing cached",
    );
  }
}

/** Every cell of a sheet Sheetwrite writes as values, such as a dashboard. */
function sheet_values(sheet: string): void {
  const our_cells = ours.cells(sheet);
  const saved_cells = saved.cells(sheet);
  const refs = new Set([...our_cells.keys(), ...saved_cells.keys()]);
  let same = 0;
  for (const ref of refs) {
    const our_value = our_cells.get(ref)?.value ?? "(blank)";
    const saved_value = saved_cells.get(ref)?.value ?? "(blank)";
    if (our_value === saved_value) same++;
    else compare(ref, our_value, saved_value);
  }
  print(`  ${same} of ${refs.size} cells the same`);
}

function pivot_parts(sheet: string): void {
  compare(
    "PivotTable parts on the sheet",
    ours.sheetRelationshipKinds(sheet).includes("pivotTable") ? "yes" : "no",
    saved.sheetRelationshipKinds(sheet).includes("pivotTable") ? "yes" : "no",
  );
}

const structure: Readonly<Record<string, (sheet: string) => void>> = {
  "4 Table sorted": (sheet) =>
    compare(
      "table Fruit sort state",
      table_sort_state(ours, sheet, "Fruit"),
      table_sort_state(saved, sheet, "Fruit"),
    ),
  "5 Sort range": (sheet) => {
    report("sort state Excel saved", sheet_sort_state(saved, sheet));
    const imported_sheet = imported.sheets.find((candidate) => candidate.name === sheet);
    const view_sort = imported_sheet?.sortKeys?.length
      ? JSON.stringify(imported_sheet.sortKeys)
      : "none";
    compare("view sort after Sheetwrite's import", "none", view_sort);
  },
  "6 Relationship": () => {
    report("Excel's data model", model_relationships(saved));
    // Excel names columns, Sheetwrite's import may use column IDs: compare without case.
    compare(
      "relationships after Sheetwrite's import",
      "orders6[customer] → customers6[id]; orders7[customer] → customers7[id]",
      imported_relationships(imported).toLowerCase(),
    );
  },
  "7 Model pivot": pivot_parts,
  "8 Query refresh": () => {
    compare("Power Query parts", power_query(ours), power_query(saved));
    const query = imported.workbook.queries?.find((candidate) => candidate.name === "People");
    compare(
      "query after Sheetwrite's import",
      "People → table People",
      query ? `${query.name} → table ${query.output?.tableName}` : "missing",
    );
  },
  "10 Links": () => compare("external links", external_links(ours), external_links(saved)),
  "12 Measures pivot": pivot_parts,
  "13 Measures model": () => {
    const measures = (snapshot: WorkbookSnapshot) =>
      (snapshot.workbook.dataModel?.measures ?? [])
        .map((measure) => `${measure.name} ${measure.formula}`)
        .join("; ") || "none";
    const table_name = (snapshot: WorkbookSnapshot) =>
      snapshot.sheets.flatMap((sheet) => sheet.tables ?? []).find((table) => table.id === "orders")
        ?.name ?? "none";
    compare(
      "measures after Sheetwrite's import",
      "Revenue =SUM(Orders[Amount]); Share =[Revenue]/CALCULATE([Revenue], ALL(Orders[Region]))",
      measures(imported),
    );
    compare("home table of the measures", "Orders", table_name(imported));
  },
  "14 Dashboard": (sheet) => {
    sheet_values(sheet);
    charts(sheet);
  },
  "15 Chart levels": charts,
};

// ---------------------------------------------------------------- Report

const start = saved.cells("Start");
print(`Saved by: ${application(saved)} (Sheetwrite wrote it as ${application(ours)})`);
print(`Repair message on open: ${start.get(a1(REPAIR_ROW, 1))?.value || "(not answered)"}`);
const repair_log = start.get(a1(REPAIR_ROW + 1, 1))?.value;
if (repair_log) print(`Repair log: ${repair_log}`);

for (const check of written.checks) {
  print();
  print(`== ${check.check} (${check.issues}), sheet "${check.sheet}"`);
  if (!saved.sheetPath(check.sheet)) {
    print("  The saved file has no such sheet.");
    continue;
  }
  const block = written.results.get(check.sheet);
  if (block) results_block(check.sheet, block);
  structure[check.sheet]?.(check.sheet);
  if (check.sheet === "15 Chart levels") {
    print(`  Sheet "15 Board":`);
    charts("15 Board");
  }
}
