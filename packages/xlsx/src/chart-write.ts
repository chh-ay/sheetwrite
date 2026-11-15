import type {
  ChartDefinition,
  ChartRange,
  ChartSeriesView,
  ChartView,
  SheetSnapshot,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { colToA1 } from "@sheetwrite/core";

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

function chartText(value: string): string {
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

function richTitle(title: string | undefined): string {
  if (title === undefined) return "";
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${chartText(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

type ReferenceType = "numRef" | "strRef" | "multiLvlStrRef";

function referenceXml(
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
function categoryType(reference: ChartRange, scatter: boolean): ReferenceType {
  if (scatter) return "numRef";
  const multiLevel =
    reference !== "#REF!" &&
    reference.start.row !== reference.end.row &&
    reference.start.col !== reference.end.col;
  return multiLevel ? "multiLvlStrRef" : "strRef";
}

function pointCount(reference: ChartRange): number {
  if (reference === "#REF!") return 0;
  return (
    (reference.end.row - reference.start.row + 1) * (reference.end.col - reference.start.col + 1)
  );
}

/** A scatter series needs X values; the renderer plots a series without categories at positions 1..n. */
function positionLiteral(count: number): string {
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
function pointsXml(values: readonly ChartValue[], numeric: boolean): string {
  let points = "";
  for (const [index, value] of values.entries()) {
    if (value === null || (numeric && typeof value !== "number")) continue;
    points += `<c:pt idx="${index}"><c:v>${chartText(String(value))}</c:v></c:pt>`;
  }
  return points;
}

/** One literal point list: `numLit` for numbers, `strLit` for labels. */
function literalXml(tag: string, values: readonly ChartValue[], numeric: boolean): string {
  const type = numeric ? "numLit" : "strLit";
  const format = numeric ? "<c:formatCode>General</c:formatCode>" : "";
  return `<c:${tag}><c:${type}>${format}<c:ptCount val="${values.length}"/>${pointsXml(values, numeric)}</c:${type}></c:${tag}>`;
}

/**
 * The category levels of `series` as a `c:multiLvlStrCache`. The first
 * `c:lvl` is the innermost level; an outer label has a point only where its
 * group starts.
 */
function levelsCacheXml(series: ChartSeriesView): string {
  let levels = `<c:lvl>${pointsXml(series.categories, false)}</c:lvl>`;
  for (const level of series.categoryLevels.toReversed()) {
    levels += `<c:lvl>${pointsXml(level.labels, false)}</c:lvl>`;
  }
  return `<c:multiLvlStrCache><c:ptCount val="${series.categories.length}"/>${levels}</c:multiLvlStrCache>`;
}

/** The formula of the cells of rows `rows` and columns `cols` of sheet `sheet`. */
function cellsFormula(
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
function pivotCategoriesXml(
  series: ChartSeriesView,
  link: PivotLink | null,
  snapshot: WorkbookSnapshot,
): string {
  const levels = series.categoryLevels.length > 0;
  if (link === null) {
    if (!levels) return literalXml("cat", series.categories, false);
    return `<c:cat><c:multiLvlStrRef><c:f>#REF!</c:f>${levelsCacheXml(series)}</c:multiLvlStrRef></c:cat>`;
  }

  const reference = cellsFormula(snapshot, link.sheet, link.points.rows, link.points.labelCols);
  if (levels) {
    return `<c:cat><c:multiLvlStrRef><c:f>${reference}</c:f>${levelsCacheXml(series)}</c:multiLvlStrRef></c:cat>`;
  }
  const cache = `<c:strCache><c:ptCount val="${series.categories.length}"/>${pointsXml(series.categories, false)}</c:strCache>`;
  return `<c:cat><c:strRef><c:f>${reference}</c:f>${cache}</c:strRef></c:cat>`;
}

/** The values of series `index`: a reference to its column of `link` with a cache, or literal data. */
function pivotValuesXml(
  tag: "val" | "yVal",
  series: ChartSeriesView,
  index: number,
  link: PivotLink | null,
  snapshot: WorkbookSnapshot,
): string {
  const col = link?.points.valueCols[index];
  if (link === null || col === undefined) return literalXml(tag, series.values, true);

  const reference = cellsFormula(snapshot, link.sheet, link.points.rows, [col, col]);
  const format = escapeXml(series.numberFormats.find((code) => code !== null) ?? "General");
  const cache = `<c:numCache><c:formatCode>${format}</c:formatCode><c:ptCount val="${series.values.length}"/>${pointsXml(series.values, true)}</c:numCache>`;
  return `<c:${tag}><c:numRef><c:f>${reference}</c:f>${cache}</c:numRef></c:${tag}>`;
}

/**
 * Series of a chart over a pivot. With `link`, they read the cells that hold
 * the pivot's values, so Select Data in Excel names real ranges; otherwise
 * they hold literal data.
 */
function pivotSeriesXml(
  chart: ChartDefinition,
  view: ChartView,
  link: PivotLink | null,
  snapshot: WorkbookSnapshot,
  xml: XmlBuffer,
): void {
  const scatter = chart.kind === "scatter";
  for (const [index, series] of view.series.entries()) {
    xml.append(`<c:ser><c:idx val="${index}"/><c:order val="${index}"/>`);
    xml.append(`<c:tx><c:v>${chartText(series.name)}</c:v></c:tx>`);
    if (scatter) xml.append(positionLiteral(series.values.length));
    else xml.append(pivotCategoriesXml(series, link, snapshot));
    xml.append(pivotValuesXml(scatter ? "yVal" : "val", series, index, link, snapshot));
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
function pivotLink(data: PivotChartData | undefined, sheet: string): PivotLink | null {
  if (data?.cells === undefined) return null;
  const points = locatePoints(data.view, data.cells);
  const pivotTable = data.cells.pivotTable;
  if (points === null || (!points.contiguous && pivotTable === undefined)) return null;
  return { sheet, points, ...(pivotTable === undefined ? {} : { pivotTable }) };
}

function seriesXml(chart: ChartDefinition, snapshot: WorkbookSnapshot, xml: XmlBuffer): void {
  const scatter = chart.kind === "scatter";
  for (const [index, series] of chart.series.entries()) {
    xml.append(`<c:ser><c:idx val="${index}"/><c:order val="${index}"/>`);
    if (series.nameRange !== undefined)
      xml.append(referenceXml("tx", series.nameRange, snapshot, "strRef"));
    else if (series.name !== undefined)
      xml.append(`<c:tx><c:v>${chartText(series.name)}</c:v></c:tx>`);

    if (series.categories !== undefined) {
      const tag = scatter ? "xVal" : "cat";
      const type = categoryType(series.categories, scatter);
      xml.append(referenceXml(tag, series.categories, snapshot, type));
    } else if (scatter) {
      xml.append(positionLiteral(pointCount(series.values)));
    }
    xml.append(referenceXml(scatter ? "yVal" : "val", series.values, snapshot, "numRef"));
    xml.append("</c:ser>");
  }
}

function axisXml(
  tag: "catAx" | "valAx",
  id: number,
  crossAxis: number,
  position: string,
  title: string | undefined,
  flatLabels = false,
): string {
  // Excel's Format Axis › Multi-level Category Labels, cleared.
  const flat = flatLabels ? '<c:noMultiLvlLbl val="1"/>' : "";
  const categoryFields = `<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>${flat}`;
  const tail = tag === "catAx" ? categoryFields : '<c:crossBetween val="between"/>';
  return `<c:${tag}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${richTitle(title)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${crossAxis}"/><c:crosses val="autoZero"/>${tail}</c:${tag}>`;
}

/**
 * Element order follows CT_ChartSpace, CT_PlotArea and each CT_*Chart
 * sequence. A chart over a pivot writes the series of `pivotChart`; when they
 * read the cells of a native PivotTable, the chart is that table's PivotChart,
 * named `[]Sheet!Table` as EPPlus names it, because the file name is unknown.
 */
function chartXml(
  chart: ChartDefinition,
  sheet: SheetSnapshot,
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  pivotChart?: PivotChartData,
): Uint8Array {
  const bar = chart.kind === "column" || chart.kind === "bar";
  const circular = chart.kind === "pie" || chart.kind === "doughnut";
  const plot = bar ? "barChart" : `${chart.kind}Chart`;
  const link = pivotLink(pivotChart, sheet.id);
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${DRAWINGML_NS}" xmlns:r="${RELATIONSHIPS_NS}">`,
  );
  if (link?.pivotTable !== undefined) {
    const name = chartText(`[]${sheet.name}!${link.pivotTable}`);
    xml.append(`<c:pivotSource><c:name>${name}</c:name><c:fmtId val="0"/></c:pivotSource>`);
  }
  xml.append(
    `<c:chart>${richTitle(chart.title)}<c:autoTitleDeleted val="${chart.title === undefined ? 1 : 0}"/>`,
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
  if (pivotChart) pivotSeriesXml(chart, pivotChart.view, link, snapshot, xml);
  else seriesXml(chart, snapshot, xml);
  if (chart.kind === "doughnut")
    xml.append(`<c:firstSliceAng val="0"/><c:holeSize val="${DOUGHNUT_HOLE_PERCENT}"/>`);
  if (!circular) xml.append(`<c:axId val="${CATEGORY_AXIS_ID}"/><c:axId val="${VALUE_AXIS_ID}"/>`);
  xml.append(`</c:${plot}>`);

  // The renderer draws `xTitle` under the plot; a bar chart has its category axis at the left.
  if (!circular) {
    const horizontalBar = chart.kind === "bar";
    const categoryTitle = horizontalBar ? chart.axes?.yTitle : chart.axes?.xTitle;
    const valueTitle = horizontalBar ? chart.axes?.xTitle : chart.axes?.yTitle;
    const categoryTag = chart.kind === "scatter" ? "valAx" : "catAx";
    xml.append(
      axisXml(
        categoryTag,
        CATEGORY_AXIS_ID,
        VALUE_AXIS_ID,
        horizontalBar ? "l" : "b",
        categoryTitle,
        chart.axes?.multiLevelLabels === false,
      ),
    );
    xml.append(
      axisXml("valAx", VALUE_AXIS_ID, CATEGORY_AXIS_ID, horizontalBar ? "b" : "l", valueTitle),
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

function anchorXml(chart: ChartDefinition, objectId: number, relationshipId: string): string {
  const emu = (pixels: number) => Math.round(pixels * EMU_PER_PIXEL);
  const { anchor } = chart;
  const from = `<xdr:from><xdr:col>${anchor.col}</xdr:col><xdr:colOff>${emu(anchor.offsetX)}</xdr:colOff><xdr:row>${anchor.row}</xdr:row><xdr:rowOff>${emu(anchor.offsetY)}</xdr:rowOff></xdr:from>`;
  const frame = `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${objectId}" name="${chartText(chart.id)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart r:id="${escapeXml(relationshipId)}"/></a:graphicData></a:graphic></xdr:graphicFrame>`;
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
      data: chartXml(chart, sheet, snapshot, context, pivotCharts?.get(chart.id)),
    });
    overrides.push({ part, contentType: CHART_CONTENT });
    charts.push({
      target: `/${part}`,
      anchorXml: (objectId, relationshipId) => anchorXml(chart, objectId, relationshipId),
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
