import { escapeXml, type XmlElement } from "./xml.js";

export const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
export const CHART_NAMESPACES = [CHART_NS, "http://purl.oclc.org/ooxml/drawingml/chart"] as const;
export const SPREADSHEET_DRAWING_NS =
  "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
export const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
export const RELATIONSHIPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const PACKAGE_RELATIONSHIPS_NS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
export const CHART_REL = `${RELATIONSHIPS_NS}/chart`;
export const DRAWING_REL = `${RELATIONSHIPS_NS}/drawing`;
export const CHART_CONTENT = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
export const DRAWING_CONTENT = "application/vnd.openxmlformats-officedocument.drawing+xml";
/** DrawingML measures in English Metric Units; one CSS pixel is 9525 EMU at 96 DPI. */
export const EMU_PER_PIXEL = 9525;
/** Excel's default column width (8.43 characters) and row height (15 points) in pixels. */
export const DEFAULT_COLUMN_PIXELS = 64;
export const DEFAULT_ROW_PIXELS = 20;

/**
 * Serialize a parsed element. Drawing and relationship XML have no mixed
 * content, so text before children keeps the document. Namespace declarations
 * are attributes and survive. `extraChildren` is XML appended after the
 * element's own children.
 */
export function elementXml(element: XmlElement, extraChildren = ""): string {
  let attributes = "";
  for (const [name, value] of Object.entries(element.attributes)) {
    attributes += ` ${name}="${escapeXml(value)}"`;
  }

  const children = element.children.map((child) => elementXml(child)).join("");
  const content = `${escapeXml(element.text)}${children}${extraChildren}`;
  if (content === "") return `<${element.name}${attributes}/>`;
  return `<${element.name}${attributes}>${content}</${element.name}>`;
}

/** OPC relationship part of `part`, for example `xl/drawings/_rels/drawing1.xml.rels`. */
export function relationshipsPartOf(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}
