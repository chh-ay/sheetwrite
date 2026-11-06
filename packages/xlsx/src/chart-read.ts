import type {
  ChartAnchor,
  ChartDefinition,
  ChartKind,
  ChartRange,
  ChartSeries,
  DocumentValidationResult,
  SheetSnapshot,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { labelToCol, sheetNameKey } from "@sheetwrite/core";

import {
  CHART_NAMESPACES,
  DEFAULT_COLUMN_PIXELS,
  DEFAULT_ROW_PIXELS,
  EMU_PER_PIXEL,
  elementXml,
} from "./chart-xml.js";
import {
  type OpcPackage,
  type OpcRelationship,
  relationshipsPart,
  relationshipsXml,
  relationshipTypeMatches,
} from "./opc.js";
import {
  checkAbort,
  emitWarning,
  validateCodecSnapshot,
  type XlsxCodecContext,
} from "./resources.js";
import {
  decodeXstring,
  parseXml,
  type XmlElement,
  xmlAttribute,
  xmlChild,
  xmlChildren,
  xmlLocalName,
  xmlRootMatches,
} from "./xml.js";

/** Excel's last row and column; references past them are not cell ranges. */
const MAX_ROWS = 1_048_576;
const MAX_COLUMNS = 16_384;
const A1_RANGE =
  /^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Z]{1,3})\$?([1-9]\d*)(?::\$?([A-Z]{1,3})\$?([1-9]\d*))?$/i;
const LEGEND_POSITIONS = { t: "top", r: "right", b: "bottom", l: "left" } as const;
/** Excel draws a legend on the right when `c:legendPos` is omitted. */
const DEFAULT_LEGEND = "right";
/** The bar groupings the chart model draws; stacked charts stay preserved. */
const MODELLED_GROUPINGS: Readonly<Record<string, true>> = { standard: true, clustered: true };

export interface ChartReadResult {
  /** Chart and drawing parts now owned by `Sheet.charts`, so preservation skips them. */
  readonly modelled: ReadonlySet<string>;
  /** Drawing parts reduced to the anchors of charts the model cannot hold. */
  readonly replacements: ReadonlyMap<string, Uint8Array>;
}

export interface ChartReadInput {
  readonly snapshot: WorkbookSnapshot;
  readonly sheetParts: readonly string[];
  readonly metadata: WorkbookSnapshot | undefined;
  readonly extendSheet: (sheet: SheetSnapshot, row: number, col: number) => void;
}

function value_of(element: XmlElement | undefined, name: string): string | undefined {
  const node = element && xmlChild(element, name);
  return node && xmlAttribute(node, "val");
}

function descendants(element: XmlElement, name: string): XmlElement[] {
  return element.children.flatMap((node) =>
    xmlLocalName(node.name) === name ? [node] : descendants(node, name),
  );
}

/** Rich text joins its runs; a literal `c:v` holds plain series text. */
function chart_text(element: XmlElement | undefined): string | undefined {
  if (!element) return undefined;

  const runs = descendants(element, "t");
  const text =
    runs.length > 0 ? runs.map((run) => run.text).join("") : descendants(element, "v")[0]?.text;
  return text === undefined ? undefined : decodeXstring(text);
}

function parse_range(formula: string, snapshot: WorkbookSnapshot): ChartRange | undefined {
  if (formula === "#REF!") return formula;

  const match = A1_RANGE.exec(formula.trim());
  if (!match) return undefined;

  const name = match[1]?.replaceAll("''", "'") ?? match[2] ?? "";
  const sheet = snapshot.sheets.find(
    (candidate) => sheetNameKey(candidate.name) === sheetNameKey(name),
  );
  const start_column = match[3];
  const start_row = match[4];
  if (!sheet || start_column === undefined || start_row === undefined) return undefined;

  // The pattern is case-insensitive, but column labels convert from upper case only.
  const first_column = start_column.toUpperCase();
  const last_column = (match[5] ?? start_column).toUpperCase();
  const start = { row: Number(start_row) - 1, col: labelToCol(first_column) };
  const end = { row: Number(match[6] ?? start_row) - 1, col: labelToCol(last_column) };
  if (end.row < start.row || end.col < start.col || end.row >= MAX_ROWS || end.col >= MAX_COLUMNS) {
    return undefined;
  }
  return { sheet: sheet.id, start, end };
}

/**
 * A cell-range source of `c:tx`, `c:cat`, `c:val`, `c:xVal` or `c:yVal`.
 * `null` means the source exists but is not one range (literal data, unions,
 * names), which the model cannot hold.
 */
function source_range(
  element: XmlElement | undefined,
  snapshot: WorkbookSnapshot,
): ChartRange | null | undefined {
  if (!element) return undefined;

  const formula = descendants(element, "f")[0]?.text;
  if (formula === undefined) return null;
  return parse_range(formula, snapshot) ?? null;
}

/** Sheetwrite writes a missing scatter X source as the literal positions 1..n. */
function is_position_literal(element: XmlElement | undefined): boolean {
  const literal = element && xmlChild(element, "numLit");
  if (!literal) return false;

  return xmlChildren(literal, "pt").every(
    (point, index) =>
      xmlAttribute(point, "idx") === String(index) &&
      xmlChild(point, "v")?.text === String(index + 1),
  );
}

function read_series(
  entry: XmlElement,
  kind: ChartKind,
  snapshot: WorkbookSnapshot,
): ChartSeries | undefined {
  const scatter = kind === "scatter";
  const values = source_range(xmlChild(entry, scatter ? "yVal" : "val"), snapshot);
  const categories_node = xmlChild(entry, scatter ? "xVal" : "cat");
  const categories =
    scatter && is_position_literal(categories_node)
      ? undefined
      : source_range(categories_node, snapshot);
  const tx = xmlChild(entry, "tx");
  const name_range = tx && xmlChild(tx, "strRef") ? source_range(tx, snapshot) : undefined;
  const name = name_range === undefined ? chart_text(tx) : undefined;
  if (!values || categories === null || name_range === null) return undefined;

  return {
    values,
    ...(categories === undefined ? {} : { categories }),
    ...(name_range === undefined ? {} : { nameRange: name_range }),
    ...(name === undefined ? {} : { name }),
  };
}

function chart_kind(plot: XmlElement): ChartKind | undefined {
  const grouping = value_of(plot, "grouping");
  if (grouping !== undefined && !MODELLED_GROUPINGS[grouping]) return undefined;

  switch (xmlLocalName(plot.name)) {
    case "barChart":
      return value_of(plot, "barDir") === "bar" ? "bar" : "column";
    case "lineChart":
      return "line";
    case "areaChart":
      return "area";
    case "pieChart":
      return "pie";
    case "doughnutChart":
      return "doughnut";
    case "scatterChart":
      return "scatter";
    default:
      return undefined;
  }
}

/**
 * Axis titles by axis role. The plot lists the category (or scatter X) axis
 * first. A bar chart draws that axis on the left, where the renderer draws
 * `yTitle`. Producers disagree on `c:axPos` for bar charts, so it is not read.
 */
function axis_titles(
  plot_area: XmlElement,
  plot: XmlElement,
  kind: ChartKind,
): ChartDefinition["axes"] {
  const title_of = (axis_id: XmlElement | undefined) => {
    const id = axis_id && xmlAttribute(axis_id, "val");
    const axis = plot_area.children.find(
      (entry) =>
        ["catAx", "dateAx", "valAx"].includes(xmlLocalName(entry.name)) &&
        value_of(entry, "axId") === id,
    );
    return chart_text(axis && xmlChild(axis, "title"));
  };

  const [first, second] = xmlChildren(plot, "axId");
  const category_title = title_of(first);
  const value_title = title_of(second);
  const x_title = kind === "bar" ? value_title : category_title;
  const y_title = kind === "bar" ? category_title : value_title;
  if (x_title === undefined && y_title === undefined) return undefined;
  return {
    ...(x_title === undefined ? {} : { xTitle: x_title }),
    ...(y_title === undefined ? {} : { yTitle: y_title }),
  };
}

/** The chart before model validation, or undefined when its DrawingML has no model equivalent. */
function read_definition(
  root: XmlElement,
  anchor: ChartAnchor,
  id: string,
  snapshot: WorkbookSnapshot,
): ChartDefinition | undefined {
  const chart = xmlChild(root, "chart");
  const plot_area = chart && xmlChild(chart, "plotArea");
  if (!chart || !plot_area || xmlChild(root, "pivotSource")) return undefined;

  // Combination charts hold several plots; the model has one kind per chart.
  const plots = plot_area.children.filter((node) => xmlLocalName(node.name).endsWith("Chart"));
  const plot = plots[0];
  const kind = plots.length === 1 && plot ? chart_kind(plot) : undefined;
  if (!plot || !kind) return undefined;

  const series: ChartSeries[] = [];
  for (const entry of xmlChildren(plot, "ser")) {
    const read = read_series(entry, kind, snapshot);
    if (!read) return undefined;
    series.push(read);
  }

  const title = chart_text(xmlChild(chart, "title"));
  const legend_node = xmlChild(chart, "legend");
  const position = value_of(legend_node, "legendPos");
  const legend: ChartDefinition["legend"] = legend_node
    ? (Object.entries(LEGEND_POSITIONS).find(([code]) => code === position)?.[1] ?? DEFAULT_LEGEND)
    : "none";
  const axes = axis_titles(plot_area, plot, kind);
  return {
    id,
    kind,
    anchor,
    series,
    legend,
    ...(title === undefined ? {} : { title }),
    ...(axes ? { axes } : {}),
  };
}

function anchor_number(element: XmlElement | undefined, name: string): number {
  const node = element && xmlChild(element, name);
  return Number(node?.text ?? Number.NaN);
}

/** Pixel anchor of a one- or two-cell anchor; absolute anchors have no cell and stay preserved. */
function read_anchor(element: XmlElement, sheet: SheetSnapshot): ChartAnchor | undefined {
  const from = xmlChild(element, "from");
  if (!from) return undefined;

  const row = anchor_number(from, "row");
  const col = anchor_number(from, "col");
  // Bounded before the sheet grows to hold the anchor cell.
  const inside_sheet = (value: number, limit: number) =>
    Number.isSafeInteger(value) && value >= 0 && value < limit;
  if (!inside_sheet(row, MAX_ROWS) || !inside_sheet(col, MAX_COLUMNS)) return undefined;
  const offset_x = anchor_number(from, "colOff") / EMU_PER_PIXEL;
  const offset_y = anchor_number(from, "rowOff") / EMU_PER_PIXEL;
  // One-cell anchors carry `xdr:ext`. A two-cell anchor from LibreOffice also
  // gives the frame size in `a:ext`; Excel writes zero there.
  const frame = descendants(element, "xfrm")[0];
  const frame_extent = frame && xmlChild(frame, "ext");
  const extents = [xmlChild(element, "ext"), frame_extent].map((extent) => ({
    width: Number(extent && xmlAttribute(extent, "cx")) / EMU_PER_PIXEL,
    height: Number(extent && xmlAttribute(extent, "cy")) / EMU_PER_PIXEL,
  }));
  const extent = extents.find(({ width, height }) => width > 0 && height > 0);
  if (extent) return { row, col, offsetX: offset_x, offsetY: offset_y, ...extent };

  // Otherwise the size follows the widths and heights of the spanned columns and rows.
  const to = xmlChild(element, "to");
  let width = anchor_number(to, "colOff") / EMU_PER_PIXEL - offset_x;
  let height = anchor_number(to, "rowOff") / EMU_PER_PIXEL - offset_y;
  const last_col = anchor_number(to, "col");
  const last_row = anchor_number(to, "row");
  if (!inside_sheet(last_col, MAX_COLUMNS) || !inside_sheet(last_row, MAX_ROWS)) return undefined;
  // Only stored columns and rows can differ from the default dimensions.
  // Full-sheet spans must not walk all the implicit cells.
  width += (last_col - col) * DEFAULT_COLUMN_PIXELS;
  for (let index = col; index < Math.min(last_col, sheet.columns.length); index++) {
    const column_width = sheet.columns[index]?.width;
    if (column_width !== undefined) width += column_width - DEFAULT_COLUMN_PIXELS;
  }

  height += (last_row - row) * DEFAULT_ROW_PIXELS;
  for (const [index, meta] of sheet.rowMeta ?? []) {
    if (index >= row && index < last_row && meta.height !== undefined) {
      height += meta.height - DEFAULT_ROW_PIXELS;
    }
  }

  return { row, col, offsetX: offset_x, offsetY: offset_y, width, height };
}

/**
 * Validate one candidate against the model, with the charts already read for
 * its sheet so the per-sheet chart limit applies too. Only sheet bounds and
 * charts are checked, so no cell or other metadata is validated again.
 */
function admit_chart(
  candidate: ChartDefinition | undefined,
  sheet: SheetSnapshot,
  imported: readonly ChartDefinition[],
  { snapshot, extendSheet: extend_sheet }: ChartReadInput,
  context: XlsxCodecContext,
): { chart?: ChartDefinition; atLimit: boolean } {
  if (candidate === undefined) return { atLimit: false };

  const { anchor, series } = candidate;
  extend_sheet(sheet, anchor.row, anchor.col);
  for (const entry of series) {
    for (const reference of [entry.values, entry.categories, entry.nameRange]) {
      if (!reference || reference === "#REF!") continue;
      const owner = snapshot.sheets.find((target) => target.id === reference.sheet);
      if (owner) extend_sheet(owner, reference.end.row, reference.end.col);
    }
  }

  const candidates = [...imported, candidate];
  const probe = {
    schemaVersion: 1,
    workbook: { activeSheet: sheet.id },
    sheets: snapshot.sheets.map((entry) => ({
      id: entry.id,
      name: entry.name,
      order: entry.order,
      rowCount: entry.rowCount,
      columns: entry.columns,
      cells: [],
      ...(entry === sheet ? { charts: candidates } : {}),
    })),
  };

  // Core keeps the per-sheet chart limit private, so its validation result is
  // the signal. A probe with one more chart reports the array-level
  // resource error when this sheet is full; its repeated ID is irrelevant.
  const is_full = (result: DocumentValidationResult) =>
    !result.ok &&
    result.errors.some(
      (error) => error.code === "resource-limit" && error.path.endsWith(".charts"),
    );
  const checked = validateCodecSnapshot(probe, context);
  if (!checked.ok) return { atLimit: is_full(checked) };

  candidates.push(candidate);
  const chart = checked.value.sheets.find((entry) => entry.id === sheet.id)?.charts?.at(-1);
  return { ...(chart ? { chart } : {}), atLimit: is_full(validateCodecSnapshot(probe, context)) };
}

function chart_relationship(
  anchor: XmlElement,
  relationships: readonly OpcRelationship[],
): OpcRelationship | undefined {
  const chart = descendants(anchor, "chart").find((node) => xmlAttribute(node, "id") !== undefined);
  const id = chart && xmlAttribute(chart, "id");
  return relationships.find(
    (entry) => entry.id === id && !entry.external && relationshipTypeMatches(entry.type, "chart"),
  );
}

interface DrawingRead {
  readonly charts: ChartDefinition[];
  readonly retained: XmlElement[];
}

/** Native anchors may differ from the authored pixels by DrawingML rounding (LibreOffice uses 1/100 mm). */
const ANCHOR_ROUNDING_PIXELS = 0.5;

/**
 * Restore what DrawingML cannot hold from the chart Sheetwrite wrote: its
 * omitted legend default, and its subpixel anchor while the native anchor
 * still matches it. Native content wins everywhere else.
 */
function reconcile_authored(chart: ChartDefinition, authored: ChartDefinition): void {
  if (authored.legend === undefined && chart.legend === DEFAULT_LEGEND) delete chart.legend;

  const { anchor } = chart;
  const close = (left: number, right: number) => Math.abs(left - right) <= ANCHOR_ROUNDING_PIXELS;
  if (
    anchor.row === authored.anchor.row &&
    anchor.col === authored.anchor.col &&
    close(anchor.offsetX, authored.anchor.offsetX) &&
    close(anchor.offsetY, authored.anchor.offsetY) &&
    close(anchor.width, authored.anchor.width) &&
    close(anchor.height, authored.anchor.height)
  ) {
    chart.anchor = { ...authored.anchor };
  }
}

interface DrawingReader {
  readonly packageFile: OpcPackage;
  readonly input: ChartReadInput;
  readonly context: XlsxCodecContext;
  /** Receives every chart part that became a Sheetwrite chart. */
  readonly modelled: Set<string>;
}

async function read_drawing(
  { packageFile: package_file, input, context, modelled }: DrawingReader,
  drawing_part: string,
  sheet: SheetSnapshot,
  sheet_number: number,
): Promise<DrawingRead & { root: XmlElement; relationships: readonly OpcRelationship[] }> {
  const relationships = package_file.relationships(drawing_part);
  const root = parseXml(await package_file.readBytes(drawing_part), drawing_part, context);
  const charts: ChartDefinition[] = [...(sheet.charts ?? [])];
  const retained: XmlElement[] = [];
  const read_targets = new Set<string>();
  const retained_targets = new Set<string>();
  let at_limit = false;
  // Sheetwrite names each chart frame with its chart ID, so the sidecar matches by name.
  const sidecar = new Map(
    (input.metadata?.sheets.find((entry) => entry.id === sheet.id)?.charts ?? []).map((chart) => [
      chart.id,
      chart,
    ]),
  );

  for (const anchor_node of root.children) {
    checkAbort(context);
    const relationship = chart_relationship(anchor_node, relationships);
    let chart: ChartDefinition | undefined;
    if (relationship && !read_targets.has(relationship.target) && !at_limit) {
      read_targets.add(relationship.target);
      const anchor = read_anchor(anchor_node, sheet);
      const chart_root = parseXml(
        await package_file.readBytes(relationship.target),
        relationship.target,
        context,
      );
      const frame = descendants(anchor_node, "cNvPr")[0];
      const authored = sidecar.get((frame && xmlAttribute(frame, "name")) ?? "");
      const id = authored?.id ?? `xlsx-chart-${sheet_number}-${charts.length + 1}`;
      const candidate =
        anchor && xmlRootMatches(chart_root, "chartSpace", CHART_NAMESPACES)
          ? read_definition(chart_root, anchor, id, input.snapshot)
          : undefined;
      if (candidate && authored) reconcile_authored(candidate, authored);
      const admitted = admit_chart(candidate, sheet, charts, input, context);
      chart = admitted.chart;
      at_limit = admitted.atLimit;
    }
    if (!chart || !relationship) {
      retained.push(anchor_node);
      // One warning per chart part: repeated frames must not flood the host.
      if (relationship && !retained_targets.has(relationship.target)) {
        retained_targets.add(relationship.target);
        emitWarning(context, {
          code: "unsupported-feature",
          message:
            "Chart has no Sheetwrite chart equivalent, so it is not editable; opaque-part preservation keeps its original parts",
          part: relationship.target,
          sheet: sheet.name,
        });
      }
      continue;
    }

    // One authored chart maps to one frame, so a copied frame name gets a new ID.
    sidecar.delete(chart.id);
    charts.push(chart);
    modelled.add(relationship.target);
  }
  // A repeated frame still points at the original part, even when its first
  // frame became editable. Keep that part and relationship for the opaque frame.
  for (const target of retained_targets) modelled.delete(target);
  return { charts, retained, root, relationships };
}

/**
 * Map native chart parts to `Sheet.charts`. Only sheets with a drawing that
 * points at a chart parse any drawing XML, so workbooks without charts pay
 * one relationship scan per sheet.
 */
export async function readCharts(
  packageFile: OpcPackage,
  input: ChartReadInput,
  context: XlsxCodecContext,
): Promise<ChartReadResult> {
  const reader: DrawingReader = { packageFile, input, context, modelled: new Set() };
  const { modelled } = reader;
  const replacements = new Map<string, Uint8Array>();

  for (const [index, sheet] of input.snapshot.sheets.entries()) {
    const sheet_part = input.sheetParts[index];
    if (sheet_part === undefined) continue;

    const drawings = packageFile
      .relationships(sheet_part)
      .filter((entry) => !entry.external && relationshipTypeMatches(entry.type, "drawing"));
    for (const drawing of drawings) {
      if (
        !packageFile
          .relationships(drawing.target)
          .some((entry) => relationshipTypeMatches(entry.type, "chart"))
      )
        continue;

      const read = await read_drawing(reader, drawing.target, sheet, index + 1);
      // Earlier drawings may already fill `Sheet.charts`; untouched drawings keep their bytes.
      if (read.charts.length === (sheet.charts?.length ?? 0)) continue;
      sheet.charts = read.charts;
      if (read.retained.length === 0) {
        modelled.add(drawing.target);
        continue;
      }

      // Kept anchors still need their own drawing; the modelled charts leave it.
      replacements.set(
        drawing.target,
        new TextEncoder().encode(elementXml({ ...read.root, children: read.retained })),
      );
      const kept = read.relationships
        .filter((entry) => !modelled.has(entry.target))
        .map((entry) => ({ ...entry, target: entry.external ? entry.target : `/${entry.target}` }));
      replacements.set(relationshipsPart(drawing.target), relationshipsXml(kept, context));
    }
  }
  return { modelled, replacements };
}
