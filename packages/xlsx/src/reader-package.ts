import type { WorkbookSnapshot } from "@sheetwrite/core";
import { DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS, validateSheetName } from "@sheetwrite/core";

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
  const packageFile = await OpcPackage.open(data, context);
  const workbookPart = packageFile.officeDocumentPart();
  await packageFile.load([workbookPart]);
  const workbookRoot = packageFile.readXml(workbookPart);
  packageFile.release([workbookPart]);
  assertXmlRoot(workbookRoot, "workbook", MAIN_NAMESPACES, workbookPart);
  const date1904 = xmlBoolean(
    xmlAttribute(xmlChild(workbookRoot, "workbookPr") ?? workbookRoot, "date1904"),
  );
  const workbookRelationships = packageFile.relationships(workbookPart);

  const stylesPart = workbookRelationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "styles") && !relationship.external,
  )?.target;
  const sharedStringsPart = workbookRelationships.find(
    (relationship) =>
      relationshipTypeMatches(relationship.type, "sharedStrings") && !relationship.external,
  )?.target;
  const themePart = workbookRelationships.find(
    (relationship) => relationshipTypeMatches(relationship.type, "theme") && !relationship.external,
  )?.target;

  // Before the sheets, whose formulas name the links by index.
  const externalLinks = await readExternalLinks(
    packageFile,
    workbookRoot,
    workbookRelationships,
    context,
  );
  context.externalBooks = externalLinks.books;
  const readLinkParts = new Set(externalLinks.parts.values());
  for (const relationship of workbookRelationships) {
    const externalLink = relationshipTypeMatches(relationship.type, "externalLink");
    if (
      relationship.external ||
      ["worksheet", "styles", "sharedStrings", "theme"].some((kind) =>
        relationshipTypeMatches(relationship.type, kind),
      ) ||
      (isRetainedRelationship("workbook", relationship.type) &&
        (!externalLink || readLinkParts.has(relationship.target)))
    ) {
      continue;
    }
    emitWarning(context, {
      code: externalLink ? "external-relationship" : "unsupported-feature",
      message: externalLink
        ? "External-link workbook graph was dropped"
        : `Unsupported workbook relationship ${relationship.type.slice(relationship.type.lastIndexOf("/") + 1)} was dropped`,
      part: relationship.target,
    });
  }

  const styleParts = [stylesPart, themePart].filter((part): part is string => part !== undefined);
  await packageFile.load(styleParts);
  const styles = new ParsedStyles(
    stylesPart ? packageFile.readXml(stylesPart) : undefined,
    context,
    themePart ? packageFile.readXml(themePart) : undefined,
    stylesPart ?? "xl/styles.xml",
    themePart ?? "xl/theme/theme1.xml",
  );
  packageFile.release(styleParts);

  if (sharedStringsPart) await packageFile.load([sharedStringsPart]);
  const sharedStrings = parseSharedStrings(packageFile, sharedStringsPart, context);
  if (sharedStringsPart) packageFile.release([sharedStringsPart]);
  return {
    packageFile,
    workbookPart,
    workbookRoot,
    date1904,
    workbookRelationships,
    externalLinks,
    styles,
    sharedStrings,
  };
}

function discoverWorksheets(
  packageFile: OpcPackage,
  workbookPart: string,
  workbookRoot: XmlElement,
  context: XlsxCodecContext,
) {
  const sheetCollection = xmlChild(workbookRoot, "sheets");
  if (!sheetCollection) return readerFailure("workbook has no sheet collection");
  const references: WorkbookSheetReference[] = [];
  const sheetNames: string[] = [];
  for (const element of xmlChildren(sheetCollection, "sheet")) {
    const rawName = xmlAttribute(element, "name");
    const relationshipId = xmlAttribute(element, "id");
    if (rawName === undefined || !relationshipId) {
      return readerFailure("worksheet declaration is incomplete");
    }
    const validatedName = validateSheetName(decodeXstring(rawName), sheetNames);
    if (!validatedName.ok) {
      return readerFailure(
        `worksheet name ${JSON.stringify(validatedName.name)} is unsafe or duplicated (${validatedName.code})`,
      );
    }
    const name = validatedName.name;
    sheetNames.push(name);
    const relationship = packageFile.relationship(workbookPart, relationshipId);
    if (!relationshipTypeMatches(relationship.type, "worksheet")) {
      return readerFailure(`relationship ${relationshipId} is not a worksheet`);
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

  const metadataCandidates = references.filter((reference) =>
    reference.name.startsWith(META_STEM),
  ).length;
  assertResource(context, "maxSheets", references.length - Math.min(1, metadataCandidates));
  return references;
}

export async function readSourceSheets(loaded: LoadedWorkbookPackage, context: XlsxCodecContext) {
  const { packageFile, workbookPart, workbookRoot, styles, sharedStrings, date1904 } = loaded;
  const references = discoverWorksheets(packageFile, workbookPart, workbookRoot, context);

  const usage: ReaderResourceUsage = { cells: 0, merges: 0 };
  const parsedSheets: ParsedSheet[] = [];
  for (const reference of references) {
    checkAbort(context);
    const worksheetPart = reference.relationship.target;
    // The worksheet itself is streamed by parseSheet; only its small parts are loaded.
    const parts = packageFile
      .relationships(worksheetPart)
      .filter(
        (relationship) =>
          !relationship.external &&
          ["comments", "table"].some((kind) => relationshipTypeMatches(relationship.type, kind)),
      )
      .map((relationship) => relationship.target);
    await packageFile.load(parts);
    try {
      parsedSheets.push(
        await parseSheet(packageFile, reference, styles, sharedStrings, context, usage, date1904),
      );
    } finally {
      packageFile.release(parts);
    }
  }

  let metadata: WorkbookSnapshot | null = null;
  let metadataIndex = -1;
  for (const [index, sheet] of parsedSheets.entries()) {
    const parsed = metadataFromSheet(sheet, context);
    if (parsed) {
      metadata = parsed;
      metadataIndex = index;
      break;
    }
  }

  const sourceSheets = parsedSheets.filter((_sheet, index) => index !== metadataIndex);
  const sourceReferences = references.filter((_sheet, index) => index !== metadataIndex);
  assertResource(context, "maxSheets", sourceSheets.length);
  if (sourceSheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX workbook has no worksheets");
  if (
    sourceReferences.every(
      (reference) => reference.state === "hidden" || reference.state === "veryHidden",
    )
  ) {
    return readerFailure("workbook requires at least one visible worksheet");
  }

  let sourceCellCount = 0;
  let sourceTableCount = 0;
  for (const source of sourceSheets) {
    sourceCellCount += source.cells.length;
    sourceTableCount += source.tables.length;
    assertResource(context, "maxCells", sourceCellCount);
    if (sourceTableCount > DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables) {
      return readerFailure(
        `workbook exceeds the table limit ${DEFAULT_WORKBOOK_TABLE_RESOURCE_LIMITS.maxTables}`,
      );
    }
  }
  return { references, sourceReferences, sourceSheets, metadata };
}
