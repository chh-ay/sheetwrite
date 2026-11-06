import type {
  ChartDefinition,
  ChartRange,
  SheetSnapshot,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { colToA1 } from "@sheetwrite/core";

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

function reference_xml(
  tag: string,
  reference: ChartRange,
  snapshot: WorkbookSnapshot,
  numeric: boolean,
): string {
  const type = numeric ? "numRef" : "strRef";
  return `<c:${tag}><c:${type}><c:f>${escapeXml(formula(reference, snapshot))}</c:f></c:${type}></c:${tag}>`;
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

function series_xml(chart: ChartDefinition, snapshot: WorkbookSnapshot, xml: XmlBuffer): void {
  const scatter = chart.kind === "scatter";
  for (const [index, series] of chart.series.entries()) {
    xml.append(`<c:ser><c:idx val="${index}"/><c:order val="${index}"/>`);
    if (series.nameRange !== undefined)
      xml.append(reference_xml("tx", series.nameRange, snapshot, false));
    else if (series.name !== undefined)
      xml.append(`<c:tx><c:v>${chart_text(series.name)}</c:v></c:tx>`);

    if (series.categories !== undefined) {
      xml.append(reference_xml(scatter ? "xVal" : "cat", series.categories, snapshot, scatter));
    } else if (scatter) {
      xml.append(position_literal(point_count(series.values)));
    }
    xml.append(reference_xml(scatter ? "yVal" : "val", series.values, snapshot, true));
    xml.append("</c:ser>");
  }
}

function axis_xml(
  tag: "catAx" | "valAx",
  id: number,
  cross_axis: number,
  position: string,
  title: string | undefined,
): string {
  const category_fields = '<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>';
  const tail = tag === "catAx" ? category_fields : '<c:crossBetween val="between"/>';
  return `<c:${tag}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${position}"/>${rich_title(title)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross_axis}"/><c:crosses val="autoZero"/>${tail}</c:${tag}>`;
}

/** Element order follows CT_ChartSpace, CT_PlotArea and each CT_*Chart sequence. */
function chart_xml(
  chart: ChartDefinition,
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
): Uint8Array {
  const bar = chart.kind === "column" || chart.kind === "bar";
  const circular = chart.kind === "pie" || chart.kind === "doughnut";
  const plot = bar ? "barChart" : `${chart.kind}Chart`;
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${DRAWINGML_NS}" xmlns:r="${RELATIONSHIPS_NS}"><c:chart>`,
  );
  xml.append(
    `${rich_title(chart.title)}<c:autoTitleDeleted val="${chart.title === undefined ? 1 : 0}"/>`,
  );
  xml.append(`<c:plotArea><c:layout/><c:${plot}>`);

  if (bar)
    xml.append(
      `<c:barDir val="${chart.kind === "bar" ? "bar" : "col"}"/><c:grouping val="clustered"/>`,
    );
  else if (chart.kind === "line" || chart.kind === "area")
    xml.append('<c:grouping val="standard"/>');
  else if (chart.kind === "scatter") xml.append('<c:scatterStyle val="lineMarker"/>');
  xml.append(`<c:varyColors val="${circular ? 1 : 0}"/>`);
  series_xml(chart, snapshot, xml);
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
): SheetCharts | undefined {
  if (!sheet.charts?.length) return undefined;

  const parts: ZipPart[] = [];
  const overrides: ContentTypeOverride[] = [];
  const charts: DrawingChart[] = [];
  for (const [index, chart] of sheet.charts.entries()) {
    const part = freePartName(`xl/charts/sheetwrite-chart${sheetNumber}-${index + 1}`, keptParts);
    parts.push({ name: part, data: chart_xml(chart, snapshot, context) });
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
