import type {
  ChartDefinition,
  ChartRange,
  ChartSeriesView,
  ChartView,
  SheetSnapshot,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { colToA1 } from "@sheetwrite/core/codec";

import { locatePoints, type PivotCells, type PointCells } from "./chart-cells.js";
import {
  CHART_CONTENT,
  CHART_NS,
  CHART_REL,
  DRAWING_CONTENT,
  EMU_PER_PIXEL,
  SPREADSHEET_DRAWING_NS,
} from "./chart-xml.js";
import { DRAWINGML_NS, RELATIONSHIPS_NS } from "./format.js";
import { type ContentTypeOverride, relationshipsPart, relationshipsXml } from "./opc.js";
import type { XlsxCodecContext } from "./resources.js";
import { encodeXstring, escapeXml, XmlBuffer } from "./xml.js";
import type { ZipPart } from "./zip.js";

/** Axis ids are local to one chart part; each axis names the other as its crossing axis. */
const CATEGORY_AXIS_ID = 1;
const VALUE_AXIS_ID = 2;
/** Excel's default doughnut hole, as a percentage of the radius. */
const DOUGHNUT_HOLE_PERCENT = 50;
const LEGEND_CODES = { top: "t", right: "r", bottom: "b", left: "l" } as const;

/** One chart to place in a worksheet drawing. */
export interface DrawingChart {
  /** Absolute target of the chart part, for the drawing's relationship. */
  readonly target: string;
  /** A self-contained anchor element, with its own namespace declarations. */
  anchorXml(objectId: number, relationshipId: string): string;
}

export interface SheetCharts {
  readonly parts: ZipPart[];
  readonly overrides: ContentTypeOverride[];
  readonly charts: readonly DrawingChart[];
}

function chart_text(value: string): string {
  return escapeXml(encodeXstring(value));
}

function formula(reference: ChartRange, snapshot: WorkbookSnapshot): string {
  if (reference === "#REF!") return reference;

  const sheet = snapshot.sheets.find((entry) => entry.id === reference.sheet);
  if (!sheet) return "#REF!";
  const start = `$${colToA1(reference.start.col)}$${reference.start.row + 1}`;
  const end = `$${colToA1(reference.end.col)}$${reference.end.row + 1}`;
  return `'${sheet.name.replaceAll("'", "''")}'!${start}:${end}`;
}

function rich_title(title: string | undefined): string {
  if (title === undefined) return "";
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${chart_text(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

type ReferenceType = "numRef" | "strRef" | "multiLvlStrRef";

function reference_xml(
  tag: string,
  reference: ChartRange,
  snapshot: WorkbookSnapshot,
  type: ReferenceType,
): string {
  return `<c:${tag}><c:${type}><c:f>${escapeXml(formula(reference, snapshot))}</c:f></c:${type}></c:${tag}>`;
}

/**
 * The reference type of a category range: a range of several rows and several
 * columns holds one category level per column (or row), which Excel reads
 * from `c:multiLvlStrRef`. Scatter X values are numbers.
 */
function category_type(reference: ChartRange, scatter: boolean): ReferenceType {
  if (scatter) return "numRef";
  const multi_level =
    reference !== "#REF!" &&
    reference.start.row !== reference.end.row &&
    reference.start.col !== reference.end.col;
  return multi_level ? "multiLvlStrRef" : "strRef";
}

function point_count(reference: ChartRange): number {
  if (reference === "#REF!") return 0;
  return (
    (reference.end.row - reference.start.row + 1) * (reference.end.col - reference.start.col + 1)
  );
}

/** A scatter series needs X values; the renderer plots a series without categories at positions 1..n. */
function position_literal(count: number): string {
  let points = "";
  for (let index = 0; index < count; index++)
    points += `<c:pt idx="${index}"><c:v>${index + 1}</c:v></c:pt>`;
  return `<c:xVal><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${count}"/>${points}</c:numLit></c:xVal>`;
}

/** One chart over a pivot: its resolved view and the written cells that can hold its points. */
export interface PivotChartData {
  readonly view: ChartView;
  readonly cells?: PivotCells;
}

/** Where the points of a chart over a pivot are in the written cells, on sheet `sheet`. */
interface PivotLink {
  readonly sheet: string;
  readonly points: PointCells;
  /** The native PivotTable whose cells hold the points; the chart is then its PivotChart. */
  readonly pivotTable?: string;
}

type ChartValue = string | number | boolean | null;

/** A `c:pt` for each point that has a value; null points are gaps. */
function points_xml(values: readonly ChartValue[], numeric: boolean): string {
  let points = "";
  for (const [index, value] of values.entries()) {
    if (value === null || (numeric && typeof value !== "number")) continue;
    points += `<c:pt idx="${index}"><c:v>${chart_text(String(value))}</c:v></c:pt>`;
  }
  return points;
}

/** One literal point list: `numLit` for numbers, `strLit` for labels. */
function literal_xml(tag: string, values: readonly ChartValue[], numeric: boolean): string {
  const type = numeric ? "numLit" : "strLit";
  const format = numeric ? "<c:formatCode>General</c:formatCode>" : "";
  return `<c:${tag}><c:${type}>${format}<c:ptCount val="${values.length}"/>${points_xml(values, numeric)}</c:${type}></c:${tag}>`;
}

/**
 * The category levels of `series` as a `c:multiLvlStrCache`. The first
 * `c:lvl` is the innermost level; an outer label has a point only where its
 * group starts.
 */
function levels_cache_xml(series: ChartSeriesView): string {
  let levels = `<c:lvl>${points_xml(series.categories, false)}</c:lvl>`;
  for (const level of series.categoryLevels.toReversed()) {
    levels += `<c:lvl>${points_xml(level.labels, false)}</c:lvl>`;
  }
  return `<c:multiLvlStrCache><c:ptCount val="${series.categories.length}"/>${levels}</c:multiLvlStrCache>`;
}

/** The formula of the cells of rows `rows` and columns `cols` of sheet `sheet`. */
function cells_formula(
  snapshot: WorkbookSnapshot,
  sheet: string,
  rows: readonly number[],
  [c0, c1]: readonly [number, number],
): string {
  const start = { row: rows[0] ?? 0, col: c0 };
  const end = { row: rows.at(-1) ?? 0, col: c1 };
  return escapeXml(formula({ sheet, start, end }, snapshot));
}

/**
 * The categories of `series`: references to the cells of `link`, with the
 * labels as their cache, or literal data without written cells. OOXML has no
 * literal form with levels, so literal levels are a `c:multiLvlStrRef` with
 * the formula `#REF!`, as in a chart whose source was deleted: Excel draws
 * the cache.
 */
function pivot_categories_xml(
  series: ChartSeriesView,
  link: PivotLink | null,
  snapshot: WorkbookSnapshot,
): string {
  const levels = series.categoryLevels.length > 0;
  if (link === null) {
    if (!levels) return literal_xml("cat", series.categories, false);
    return `<c:cat><c:multiLvlStrRef><c:f>#REF!</c:f>${levels_cache_xml(series)}</c:multiLvlStrRef></c:cat>`;
  }

  const reference = cells_formula(snapshot, link.sheet, link.points.rows, link.points.labelCols);
  if (levels) {
    return `<c:cat><c:multiLvlStrRef><c:f>${reference}</c:f>${levels_cache_xml(series)}</c:multiLvlStrRef></c:cat>`;
  }
  const cache = `<c:strCache><c:ptCount val="${series.categories.length}"/>${points_xml(series.categories, false)}</c:strCache>`;
  return `<c:cat><c:strRef><c:f>${reference}</c:f>${cache}</c:strRef></c:cat>`;
}

/** The values of series `index`: a reference to its column of `link` with a cache, or literal data. */
function pivot_values_xml(
  tag: "val" | "yVal",
  series: ChartSeriesView,
  index: number,
  link: PivotLink | null,
  snapshot: WorkbookSnapshot,
): string {
  const col = link?.points.valueCols[index];
  if (link === null || col === undefined) return literal_xml(tag, series.values, true);

  const reference = cells_formula(snapshot, link.sheet, link.points.rows, [col, col]);
  const format = escapeXml(series.numberFormats.find((code) => code !== null) ?? "General");
  const cache = `<c:numCache><c:formatCode>${format}</c:formatCode><c:ptCount val="${series.values.length}"/>${points_xml(series.values, true)}</c:numCache>`;
  return `<c:${tag}><c:numRef><c:f>${reference}</c:f>${cache}</c:numRef></c:${tag}>`;
}

/**
 * Series of a chart over a pivot. With `link`, they read the cells that hold
 * the pivot's values, so Select Data in Excel names real ranges; otherwise
 * they hold literal data.
 */
function pivot_series_xml(
  chart: ChartDefinition,
  view: ChartView,
  link: PivotLink | null,
  snapshot: WorkbookSnapshot,
  xml: XmlBuffer,
): void {
  const scatter = chart.kind === "scatter";
  for (const [index, series] of view.series.entries()) {
    xml.append(`<c:ser><c:idx val="${index}"/><c:order val="${index}"/>`);
    xml.append(`<c:tx><c:v>${chart_text(series.name)}</c:v></c:tx>`);
    if (scatter) xml.append(position_literal(series.values.length));
    else xml.append(pivot_categories_xml(series, link, snapshot));
    xml.append(pivot_values_xml(scatter ? "yVal" : "val", series, index, link, snapshot));
    xml.append("</c:ser>");
  }
}

/**
 * Where the points of `data` are in the written cells of sheet `sheet`, or
 * null when the chart keeps literal data. Excel reads cells that hold the
 * points in order. A native PivotTable in compact layout or with subtotals
 * has other rows between them, so only its PivotChart reads them, from the
 * PivotTable; its ranges span the table's rows, as Excel's PivotCharts do.
 */
function pivot_link(data: PivotChartData | undefined, sheet: string): PivotLink | null {
  if (data?.cells === undefined) return null;
  const points = locatePoints(data.view, data.cells);
  const pivot_table = data.cells.pivotTable;
  if (points === null || (!points.contiguous && pivot_table === undefined)) return null;
  return { sheet, points, ...(pivot_table === undefined ? {} : { pivotTable: pivot_table }) };
}

function series_xml(chart: ChartDefinition, snapshot: WorkbookSnapshot, xml: XmlBuffer): void {
  const scatter = chart.kind === "scatter";
  for (const [index, series] of chart.series.entries()) {
    xml.append(`<c:ser><c:idx val="${index}"/><c:order val="${index}"/>`);
    if (series.nameRange !== undefined)
      xml.append(reference_xml("tx", series.nameRange, snapshot, "strRef"));
    else if (series.name !== undefined)
      xml.append(`<c:tx><c:v>${chart_text(series.name)}</c:v></c:tx>`);

    if (series.categories !== undefined) {
      const tag = scatter ? "xVal" : "cat";
      const type = category_type(series.categories, scatter);
      xml.append(reference_xml(tag, series.categories, snapshot, type));
    } else if (scatter) {
      xml.append(position_literal(point_count(series.values)));
    }
    xml.append(reference_xml(scatter ? "yVal" : "val", series.values, snapshot, "numRef"));
    xml.append("</c:ser>");
  }
}

function axis_xml(
  tag: "catAx" | "valAx",
  id: number,
  cross_axis: number,
  position: string,
  title: string | undefined,
  flat_labels = false,
): string {
  // Excel's Format Axis › Multi-level Category Labels, cleared.
  const flat = flat_labels ? '<c:noMultiLvlLbl val="1"/>' : "";
  const category_fields = `<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>${flat}`;
  const tail = tag === "catAx" ? category_fields : '<c:crossBetween val="between"/>';
  return `<c:${tag}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${rich_title(title)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross_axis}"/><c:crosses val="autoZero"/>${tail}</c:${tag}>`;
}

/**
 * Element order follows CT_ChartSpace, CT_PlotArea and each CT_*Chart
 * sequence. A chart over a pivot writes the series of `pivot_chart`; when they
 * read the cells of a native PivotTable, the chart is that table's PivotChart,
 * named `[]Sheet!Table` as EPPlus names it, because the file name is unknown.
 */
function chart_xml(
  chart: ChartDefinition,
  sheet: SheetSnapshot,
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  pivot_chart?: PivotChartData,
): Uint8Array {
  const bar = chart.kind === "column" || chart.kind === "bar";
  const circular = chart.kind === "pie" || chart.kind === "doughnut";
  const plot = bar ? "barChart" : `${chart.kind}Chart`;
  const link = pivot_link(pivot_chart, sheet.id);
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${DRAWINGML_NS}" xmlns:r="${RELATIONSHIPS_NS}">`,
  );
  if (link?.pivotTable !== undefined) {
    const name = chart_text(`[]${sheet.name}!${link.pivotTable}`);
    xml.append(`<c:pivotSource><c:name>${name}</c:name><c:fmtId val="0"/></c:pivotSource>`);
  }
  xml.append(
    `<c:chart>${rich_title(chart.title)}<c:autoTitleDeleted val="${chart.title === undefined ? 1 : 0}"/>`,
  );
  if (link?.pivotTable !== undefined) {
    xml.append('<c:pivotFmts><c:pivotFmt><c:idx val="0"/></c:pivotFmt></c:pivotFmts>');
  }
  xml.append(`<c:plotArea><c:layout/><c:${plot}>`);
  if (bar)
    xml.append(
      `<c:barDir val="${chart.kind === "bar" ? "bar" : "col"}"/><c:grouping val="clustered"/>`,
    );
  else if (chart.kind === "line" || chart.kind === "area")
    xml.append('<c:grouping val="standard"/>');
  else if (chart.kind === "scatter") xml.append('<c:scatterStyle val="lineMarker"/>');
  xml.append(`<c:varyColors val="${circular ? 1 : 0}"/>`);
  if (pivot_chart) pivot_series_xml(chart, pivot_chart.view, link, snapshot, xml);
  else series_xml(chart, snapshot, xml);
  if (chart.kind === "doughnut")
    xml.append(`<c:firstSliceAng val="0"/><c:holeSize val="${DOUGHNUT_HOLE_PERCENT}"/>`);
  if (!circular) xml.append(`<c:axId val="${CATEGORY_AXIS_ID}"/><c:axId val="${VALUE_AXIS_ID}"/>`);
  xml.append(`</c:${plot}>`);

  // The renderer draws `xTitle` under the plot; a bar chart has its category axis at the left.
  if (!circular) {
    const horizontal_bar = chart.kind === "bar";
    const category_title = horizontal_bar ? chart.axes?.yTitle : chart.axes?.xTitle;
    const value_title = horizontal_bar ? chart.axes?.xTitle : chart.axes?.yTitle;
    const category_tag = chart.kind === "scatter" ? "valAx" : "catAx";
    xml.append(
      axis_xml(
        category_tag,
        CATEGORY_AXIS_ID,
        VALUE_AXIS_ID,
        horizontal_bar ? "l" : "b",
        category_title,
        chart.axes?.multiLevelLabels === false,
      ),
    );
    xml.append(
      axis_xml("valAx", VALUE_AXIS_ID, CATEGORY_AXIS_ID, horizontal_bar ? "b" : "l", value_title),
    );
  }
  xml.append("</c:plotArea>");

  if (chart.legend !== "none") {
    xml.append(
      `<c:legend><c:legendPos val="${LEGEND_CODES[chart.legend ?? "right"]}"/><c:overlay val="0"/></c:legend>`,
    );
  }
  xml.append('<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>');
  return xml.finish();
}

function anchor_xml(chart: ChartDefinition, object_id: number, relationship_id: string): string {
  const emu = (pixels: number) => Math.round(pixels * EMU_PER_PIXEL);
  const { anchor } = chart;
  const from = `<xdr:from><xdr:col>${anchor.col}</xdr:col><xdr:colOff>${emu(anchor.offsetX)}</xdr:colOff><xdr:row>${anchor.row}</xdr:row><xdr:rowOff>${emu(anchor.offsetY)}</xdr:rowOff></xdr:from>`;
  const frame = `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${object_id}" name="${chart_text(chart.id)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart r:id="${escapeXml(relationship_id)}"/></a:graphicData></a:graphic></xdr:graphicFrame>`;
  // A one-cell anchor keeps the model's pixel size when rows or columns are resized.
  return `<xdr:oneCellAnchor xmlns:xdr="${SPREADSHEET_DRAWING_NS}" xmlns:a="${DRAWINGML_NS}" xmlns:c="${CHART_NS}" xmlns:r="${RELATIONSHIPS_NS}">${from}<xdr:ext cx="${emu(anchor.width)}" cy="${emu(anchor.height)}"/>${frame}<xdr:clientData/></xdr:oneCellAnchor>`;
}

/** `${stem}.xml`, or `${stem}-2.xml` and so on when a kept part already has the name. */
export function freePartName(stem: string, used: ReadonlySet<string>): string {
  let name = `${stem}.xml`;
  for (let suffix = 2; used.has(name.toLowerCase()); suffix++) name = `${stem}-${suffix}.xml`;
  return name;
}

/** Chart parts of one worksheet, or undefined when it has no charts. */
export function writeCharts(
  snapshot: WorkbookSnapshot,
  sheet: SheetSnapshot,
  sheetNumber: number,
  keptParts: ReadonlySet<string>,
  context: XlsxCodecContext,
  pivotCharts?: ReadonlyMap<string, PivotChartData>,
): SheetCharts | undefined {
  if (!sheet.charts?.length) return undefined;

  const parts: ZipPart[] = [];
  const overrides: ContentTypeOverride[] = [];
  const charts: DrawingChart[] = [];
  for (const [index, chart] of sheet.charts.entries()) {
    const part = freePartName(`xl/charts/sheetwrite-chart${sheetNumber}-${index + 1}`, keptParts);
    parts.push({
      name: part,
      data: chart_xml(chart, sheet, snapshot, context, pivotCharts?.get(chart.id)),
    });
    overrides.push({ part, contentType: CHART_CONTENT });
    charts.push({
      target: `/${part}`,
      anchorXml: (object_id, relationship_id) => anchor_xml(chart, object_id, relationship_id),
    });
  }
  return { parts, overrides, charts };
}

/** A new worksheet drawing that holds only Sheetwrite charts. */
export function chartDrawingParts(
  part: string,
  charts: readonly DrawingChart[],
  context: XlsxCodecContext,
): { parts: ZipPart[]; override: ContentTypeOverride } {
  const xml = new XmlBuffer(context);
  xml.append(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${SPREADSHEET_DRAWING_NS}">`,
  );
  const relationships = charts.map((chart, index) => {
    const id = `rId${index + 1}`;
    xml.append(chart.anchorXml(index + 1, id));
    return { id, type: CHART_REL, target: chart.target };
  });
  xml.append("</xdr:wsDr>");

  return {
    parts: [
      { name: part, data: xml.finish() },
      { name: relationshipsPart(part), data: relationshipsXml(relationships, context) },
    ],
    override: { part, contentType: DRAWING_CONTENT },
  };
}
