// Excel's dynamic-array marking ([MS-XLSX] 2.4.87 dynamicArrayProperties).
// A formula cell's `cm` attribute names a cell metadata block of
// `xl/metadata.xml`; a block whose XLDAPR record sets `fDynamic` makes the
// formula a dynamic array, which spills. Without it, Excel reads the formula
// as a legacy one and adds implicit intersection, showing `=@SEQUENCE(3)` and
// one value.

import { MAIN_NS, RELATIONSHIPS_NS } from "./format.js";
import { type XmlElement, xmlAttribute, xmlBoolean, xmlChild, xmlChildren } from "./xml.js";

export const SHEET_METADATA_REL = `${RELATIONSHIPS_NS}/sheetMetadata`;
export const SHEET_METADATA_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml";
const DYNAMIC_ARRAY_NS = "http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray";
const DYNAMIC_ARRAY_EXTENSION = "{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}";
const DYNAMIC_ARRAY_TYPE = "XLDAPR";

/** The `cm` value of the one cell metadata block that `DYNAMIC_ARRAY_METADATA` holds. */
export const DYNAMIC_ARRAY_CELL_METADATA = "1";

/** `xl/metadata.xml` as Excel 365 writes it for a workbook with dynamic arrays. */
export const DYNAMIC_ARRAY_METADATA =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  `<metadata xmlns="${MAIN_NS}" xmlns:xda="${DYNAMIC_ARRAY_NS}">` +
  `<metadataTypes count="1"><metadataType name="${DYNAMIC_ARRAY_TYPE}" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes>` +
  `<futureMetadata name="${DYNAMIC_ARRAY_TYPE}" count="1"><bk><extLst><ext uri="${DYNAMIC_ARRAY_EXTENSION}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>` +
  '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata></metadata>';

/** Whether a future metadata block holds dynamic-array properties with `fDynamic` set. */
function isDynamicBlock(block: XmlElement): boolean {
  const extensions = xmlChild(block, "extLst");
  return (extensions ? xmlChildren(extensions, "ext") : []).some((extension) => {
    if (xmlAttribute(extension, "uri") !== DYNAMIC_ARRAY_EXTENSION) return false;
    const properties = xmlChild(extension, "dynamicArrayProperties");
    return properties !== undefined && xmlBoolean(xmlAttribute(properties, "fDynamic"));
  });
}

/**
 * The `cm` values that mark a formula cell as a dynamic array in the metadata
 * part `root`: each is the 1-based number of a cell metadata block with a
 * record of the XLDAPR type whose future metadata block sets `fDynamic`.
 */
export function dynamicArrayCellMetadata(root: XmlElement): ReadonlySet<string> {
  const types = xmlChild(root, "metadataTypes");
  const typeNames = (types ? xmlChildren(types, "metadataType") : []).map((type) =>
    xmlAttribute(type, "name"),
  );
  const future = xmlChildren(root, "futureMetadata").find(
    (element) => xmlAttribute(element, "name") === DYNAMIC_ARRAY_TYPE,
  );
  const dynamicBlocks = (future ? xmlChildren(future, "bk") : []).map(isDynamicBlock);
  const cellMetadata = xmlChild(root, "cellMetadata");
  const marked = new Set<string>();
  for (const [index, block] of (cellMetadata ? xmlChildren(cellMetadata, "bk") : []).entries()) {
    const dynamic = xmlChildren(block, "rc").some(
      (record) =>
        typeNames[Number(xmlAttribute(record, "t")) - 1] === DYNAMIC_ARRAY_TYPE &&
        dynamicBlocks[Number(xmlAttribute(record, "v"))] === true,
    );
    if (dynamic) marked.add(String(index + 1));
  }
  return marked;
}
