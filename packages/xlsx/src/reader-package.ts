import type { WorkbookSnapshot } from "@sheetwrite/core";
import { DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS, validateSheetName } from "@sheetwrite/core";

import { dynamicArrayCellMetadata } from "./dynamic-array.js";
import { readExternalLinks, type ImportedExternalLinks } from "./external-links.js";
import { MAIN_NAMESPACES, META_STEM } from "./format.js";
import { OpcPackage, type OpcRelationship, relationshipTypeMatches } from "./opc.js";
import { isRetainedRelationship } from "./preservation.js";
import { parseSheet } from "./reader-sheet.js";
import { metadataFromSheet } from "./reader-sidecar.js";
import type { ParsedSheet, WorkbookSheetReference, ReaderResourceUsage } from "./reader-types.js";
import { readerFailure, parseSharedStrings } from "./reader-values.js";
import { assertResource, checkAbort, emitWarning, type XlsxCodecContext } from "./resources.js";
import { ParsedStyles } from "./styles.js";
import {
  assertXmlRoot,
  decodeXstring,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
} from "./xml.js";

/** Package-level data needed while worksheet parts are streamed. */
export interface LoadedWorkbookPackage {
  readonly packageFile: OpcPackage;
  readonly workbookPart: string;
  readonly workbookRoot: XmlElement;
  readonly date1904: boolean;
  readonly workbookRelationships: readonly OpcRelationship[];
  readonly externalLinks: ImportedExternalLinks;
  readonly styles: ParsedStyles;
  readonly sharedStrings: readonly string[];
}

export async function loadWorkbookPackage(
  data: Blob | ArrayBuffer | Uint8Array,
  context: XlsxCodecContext,
): Promise<LoadedWorkbookPackage> {
  const package_file = await OpcPackage.open(data, context);
  const workbook_part = package_file.officeDocumentPart();
  await package_file.load([workbook_part]);
  const workbook_root = package_file.readXml(workbook_part);
  package_file.release([workbook_part]);
  assertXmlRoot(workbook_root, "workbook", MAIN_NAMESPACES, workbook_part);
  const date1904 = xmlBoolean(
    xmlAttribute(xmlChild(workbook_root, "workbookPr") ?? workbook_root, "date1904"),
  );
  const workbook_relationships = package_file.relationships(workbook_part);

  const styles_part = workbook_relationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "styles") && !relationship.external,
  )?.target;
  const shared_strings_part = workbook_relationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "sharedStrings") && !relationship.external,
  )?.target;
  const theme_part = workbook_relationships.find(
    (relationship) => relationshipTypeMatches(relationship.type, "theme") && !relationship.external,
  )?.target;
  const metadata_part = workbook_relationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "sheetMetadata") && !relationship.external,
  )?.target;

  // Before the sheets, whose formulas name the links by index.
  const external_links = await readExternalLinks(
    package_file,
    workbook_root,
    workbook_relationships,
    context,
  );
  context.externalBooks = external_links.books;
  const read_link_parts = new Set(external_links.parts.values());
  for (const relationship of workbook_relationships) {
    const external_link = relationshipTypeMatches(relationship.type, "externalLink");
    if (
      relationship.external ||
      ["worksheet", "styles", "sharedStrings", "theme", "sheetMetadata"].some((kind) =>
        relationshipTypeMatches(relationship.type, kind),
      ) ||
      (isRetainedRelationship("workbook", relationship.type) &&
        (!external_link || read_link_parts.has(relationship.target)))
    ) {
      continue;
    }
    emitWarning(context, {
      code: external_link ? "external-relationship" : "unsupported-feature",
      message: external_link
        ? "External-link workbook graph was dropped"
        : `Unsupported workbook relationship ${relationship.type.slice(relationship.type.lastIndexOf("/") + 1)} was dropped`,
      part: relationship.target,
    });
  }

  const style_parts = [styles_part, theme_part].filter(
    (part): part is string => part !== undefined,
  );
  await package_file.load(style_parts);
  const styles = new ParsedStyles(
    styles_part ? package_file.readXml(styles_part) : undefined,
    context,
    theme_part ? package_file.readXml(theme_part) : undefined,
    styles_part ?? "xl/styles.xml",
    theme_part ?? "xl/theme/theme1.xml",
  );
  package_file.release(style_parts);

  if (shared_strings_part) await package_file.load([shared_strings_part]);
  const shared_strings = parseSharedStrings(package_file, shared_strings_part, context);
  if (shared_strings_part) package_file.release([shared_strings_part]);

  // Excel's dynamic arrays are formula cells whose `cm` names this part's metadata.
  if (metadata_part) {
    await package_file.load([metadata_part]);
    const metadata_root = package_file.readXml(metadata_part);
    package_file.release([metadata_part]);
    assertXmlRoot(metadata_root, "metadata", MAIN_NAMESPACES, metadata_part);
    context.dynamicArrayMetadata = dynamicArrayCellMetadata(metadata_root);
  }
  return {
    packageFile: package_file,
    workbookPart: workbook_part,
    workbookRoot: workbook_root,
    date1904,
    workbookRelationships: workbook_relationships,
    externalLinks: external_links,
    styles,
    sharedStrings: shared_strings,
  };
}

function discover_worksheets(
  package_file: OpcPackage,
  workbook_part: string,
  workbook_root: XmlElement,
  context: XlsxCodecContext,
) {
  const sheet_collection = xmlChild(workbook_root, "sheets");
  if (!sheet_collection) return readerFailure("workbook has no sheet collection");
  const references: WorkbookSheetReference[] = [];
  const sheet_names: string[] = [];
  for (const element of xmlChildren(sheet_collection, "sheet")) {
    const raw_name = xmlAttribute(element, "name");
    const relationship_id = xmlAttribute(element, "id");
    if (raw_name === undefined || !relationship_id) {
      return readerFailure("worksheet declaration is incomplete");
    }
    const validated_name = validateSheetName(decodeXstring(raw_name), sheet_names);
    // Excel refuses to rename a sheet to History, but a file from another
    // program can hold one, and it opens.
    if (!validated_name.ok && validated_name.code !== "reserved") {
      return readerFailure(
        `worksheet name ${JSON.stringify(validated_name.name)} is unsafe or duplicated (${validated_name.code})`,
      );
    }
    const name = validated_name.name;
    sheet_names.push(name);
    const relationship = package_file.relationship(workbook_part, relationship_id);
    if (!relationshipTypeMatches(relationship.type, "worksheet")) {
      return readerFailure(`relationship ${relationship_id} is not a worksheet`);
    }
    const state = xmlAttribute(element, "state");
    if (
      state !== undefined &&
      state !== "visible" &&
      state !== "hidden" &&
      state !== "veryHidden"
    ) {
      return readerFailure(`worksheet ${name} has invalid visibility state ${state}`);
    }
    references.push({ name, state, relationship });
  }

  const metadata_candidates = references.filter((reference) =>
    reference.name.startsWith(META_STEM),
  ).length;
  assertResource(context, "maxSheets", references.length - Math.min(1, metadata_candidates));
  return references;
}

export async function readSourceSheets(loaded: LoadedWorkbookPackage, context: XlsxCodecContext) {
  const {
    packageFile: package_file,
    workbookPart: workbook_part,
    workbookRoot: workbook_root,
    styles,
    sharedStrings: shared_strings,
    date1904,
  } = loaded;
  const references = discover_worksheets(package_file, workbook_part, workbook_root, context);

  const usage: ReaderResourceUsage = { cells: 0, merges: 0 };
  const parsed_sheets: ParsedSheet[] = [];
  for (const reference of references) {
    checkAbort(context);
    const worksheet_part = reference.relationship.target;
    // The worksheet itself is streamed by parseSheet; only its small parts are loaded.
    const parts = package_file
      .relationships(worksheet_part)
      .filter(
        (relationship) =>
          !relationship.external &&
          ["comments", "table"].some((kind) => relationshipTypeMatches(relationship.type, kind)),
      )
      .map((relationship) => relationship.target);
    await package_file.load(parts);
    try {
      parsed_sheets.push(
        await parseSheet(package_file, reference, styles, shared_strings, context, usage, date1904),
      );
    } finally {
      package_file.release(parts);
    }
  }

  let metadata: WorkbookSnapshot | null = null;
  let metadata_index = -1;
  for (const [index, sheet] of parsed_sheets.entries()) {
    const parsed = metadataFromSheet(sheet, context);
    if (parsed) {
      metadata = parsed;
      metadata_index = index;
      break;
    }
  }

  const source_sheets = parsed_sheets.filter((_sheet, index) => index !== metadata_index);
  const source_references = references.filter((_sheet, index) => index !== metadata_index);
  assertResource(context, "maxSheets", source_sheets.length);
  if (source_sheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX workbook has no worksheets");
  if (
    source_references.every(
      (reference) => reference.state === "hidden" || reference.state === "veryHidden",
    )
  ) {
    return readerFailure("workbook requires at least one visible worksheet");
  }

  let source_cell_count = 0;
  let source_table_count = 0;
  for (const source of source_sheets) {
    source_cell_count += source.cells.length;
    source_table_count += source.tables.length;
    assertResource(context, "maxCells", source_cell_count);
    if (source_table_count > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables) {
      return readerFailure(
        `workbook exceeds the table limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables}`,
      );
    }
  }
  return { references, sourceReferences: source_references, sourceSheets: source_sheets, metadata };
}
