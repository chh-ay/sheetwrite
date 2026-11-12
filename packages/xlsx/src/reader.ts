import type { SheetSnapshot, WorkbookSnapshot } from "@sheetwrite/core";
import { withXlsxFormulaEngine } from "@sheetwrite/core";

import { readCharts } from "./chart-read.js";
import { hasExcelDataModel, readExcelDataModel } from "./data-model.js";
import { convertFormulaSources, workbookFormulaSources } from "./formula.js";
import { OpcPackage, relationshipTypeMatches } from "./opc.js";
import { readPivots } from "./pivot.js";
import { capturePreserved } from "./preservation.js";
import { buildWorkbookSheets } from "./reader-assembly.js";
import {
  loadWorkbookPackage,
  readSourceSheets,
  type LoadedWorkbookPackage,
} from "./reader-package.js";
import { restoreSidecarFields } from "./reader-sidecar.js";
import type { WorkbookSheetReference } from "./reader-types.js";
import {
  workbookActiveSheet,
  parseNativeDefinedNames,
  reconcileDefinedNames,
  workbookCalculation,
  extendSheet,
} from "./reader-workbook.js";
import { boundedErrorText, validateCodecSnapshot, type XlsxCodecContext } from "./resources.js";
import { expandSharedFormulas, type SharedFormulaGroup } from "./shared-formula.js";
import { xmlChild } from "./xml.js";

/** Excel links customXml items from the workbook part; other writers may link them from the root. */
function hasCustomXml(packageFile: OpcPackage): boolean {
  return [
    ...packageFile.relationships(packageFile.officeDocumentPart()),
    ...packageFile.relationships(""),
  ].some(
    (relationship) =>
      !relationship.external && relationshipTypeMatches(relationship.type, "customXml"),
  );
}

/**
 * Expand shared formulas, then convert every formula source to editor
 * spelling, in one engine session. A workbook without formulas leaves the
 * engine unloaded.
 */
async function importWorkbookFormulas(
  snapshot: WorkbookSnapshot,
  sharedFormulas: readonly SharedFormulaGroup[],
  context: XlsxCodecContext,
): Promise<void> {
  if (sharedFormulas.length === 0 && workbookFormulaSources(snapshot).length === 0) return;

  const converted = await withXlsxFormulaEngine((engine) => {
    expandSharedFormulas(engine, sharedFormulas, context);
    return convertFormulaSources(engine, workbookFormulaSources(snapshot), "import");
  });
  for (const sheet of snapshot.sheets) {
    for (const block of sheet.cells) {
      for (const cell of block.cells) {
        if (cell.value.kind !== "formula") continue;
        const source = converted.get(cell.value.src);
        if (source === undefined) throw new Error("Missing imported cell formula");
        cell.value.src = source;
      }
    }
  }
  for (const named of snapshot.workbook.namedRanges ?? []) {
    if (named.formula === undefined) continue;
    const source = converted.get(named.formula);
    if (source === undefined) throw new Error("Missing imported defined-name formula");
    named.formula = source;
  }
}

async function workbookDataModel(
  loaded: LoadedWorkbookPackage,
  metadata: WorkbookSnapshot | null,
  sheets: readonly SheetSnapshot[],
  context: XlsxCodecContext,
) {
  const { packageFile, workbookRoot, workbookRelationships } = loaded;
  // Sheetwrite's own metadata holds relationships by stable IDs; a file
  // without it may hold Excel's data model relationships.
  let dataModel = metadata?.workbook.dataModel;
  if (dataModel === undefined && hasExcelDataModel(workbookRoot)) {
    const connectionsPart = workbookRelationships.find(
      (relationship) =>
        relationshipTypeMatches(relationship.type, "connections") && !relationship.external,
    )?.target;
    // A relationship can name a part the package lacks; such a file has no connections to read.
    const readable =
      connectionsPart !== undefined && packageFile.contentType(connectionsPart) !== undefined;
    if (readable) await packageFile.load([connectionsPart]);
    const connections = readable ? packageFile.readXml(connectionsPart) : undefined;
    if (readable) packageFile.release([connectionsPart]);
    dataModel = readExcelDataModel(workbookRoot, connections, sheets, context);
  }
  return dataModel;
}

async function loadWorkbookObjects(
  loaded: LoadedWorkbookPackage,
  snapshot: WorkbookSnapshot,
  sourceReferences: readonly WorkbookSheetReference[],
  metadata: WorkbookSnapshot | null,
  context: XlsxCodecContext,
  readOptions: { readonly preserveOpaqueParts?: boolean },
): Promise<void> {
  const { packageFile, styles, externalLinks } = loaded;
  const sheetParts = sourceReferences.map((reference) => reference.relationship.target);
  const modelledPivotParts = await readPivots(
    packageFile,
    {
      snapshot,
      sheetParts,
      metadata,
      extendSheet,
      numberFormat: (numFmtId) => styles.numberFormat(numFmtId),
    },
    context,
  );
  const chartParts = await readCharts(
    packageFile,
    { snapshot, sheetParts, metadata: metadata ?? undefined, extendSheet },
    context,
  );
  if (readOptions.preserveOpaqueParts !== false)
    await capturePreserved(
      packageFile,
      snapshot,
      context,
      new Set([...modelledPivotParts, ...chartParts.modelled]),
      chartParts.replacements,
      externalLinks.parts,
    );
  // The Power Query module loads only for workbooks that can hold queries:
  // saved definitions in the hidden metadata, or a customXml item.
  const sidecarQueries = metadata?.workbook.queries;
  if (sidecarQueries?.length || hasCustomXml(packageFile)) {
    const { readPowerQuery } = await import("./power-query.js");
    await readPowerQuery(packageFile, snapshot, sidecarQueries, context);
  }
}

/** Read a preflighted OOXML workbook into Sheetwrite's implementation-neutral snapshot. */
export async function readWorkbook(
  data: Blob | ArrayBuffer | Uint8Array,
  context: XlsxCodecContext,
  readOptions: { readonly preserveOpaqueParts?: boolean } = {},
): Promise<WorkbookSnapshot> {
  const loaded = await loadWorkbookPackage(data, context);
  const { workbookRoot, externalLinks } = loaded;
  const { references, sourceReferences, sourceSheets, metadata } = await readSourceSheets(
    loaded,
    context,
  );

  const { sheets, sheetIds, resolvedMetadata } = buildWorkbookSheets(
    sourceSheets,
    metadata,
    loaded.styles,
    context,
  );
  const activeSheet = workbookActiveSheet(workbookRoot, references, sourceReferences, sheets);
  const nativeNamedRanges = parseNativeDefinedNames(
    workbookRoot,
    sheetIds,
    sourceReferences,
    context,
  );
  const namedRanges = xmlChild(workbookRoot, "definedNames")
    ? nativeNamedRanges
    : metadata?.workbook.namedRanges;
  reconcileDefinedNames(namedRanges, sheets, context);

  const calculation = workbookCalculation(workbookRoot);
  const dataModel = await workbookDataModel(loaded, metadata, sheets, context);
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    ...(metadata?.documentId ? { documentId: metadata.documentId } : {}),
    ...(metadata?.version !== undefined ? { version: metadata.version } : {}),
    workbook: {
      activeSheet,
      ...(namedRanges?.length ? { namedRanges: structuredClone(namedRanges) } : {}),
      ...(calculation ? { calculation } : {}),
      // A model with only measures is still a model.
      ...(dataModel?.relationships.length || dataModel?.measures?.length
        ? { dataModel: structuredClone(dataModel) }
        : {}),
      ...(externalLinks.links.length ? { externalLinks: externalLinks.links } : {}),
    },
    sheets,
  };

  await importWorkbookFormulas(
    snapshot,
    sourceSheets.flatMap((source) => source.sharedFormulas),
    context,
  );
  restoreSidecarFields(snapshot, resolvedMetadata);

  await loadWorkbookObjects(loaded, snapshot, sourceReferences, metadata, context, readOptions);

  const checked = validateCodecSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      boundedErrorText(
        `Sheetwrite: imported invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
      ),
    );
  }
  return checked.value;
}
