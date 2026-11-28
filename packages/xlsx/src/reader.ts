import type { SheetSnapshot, WorkbookSnapshot } from "@sheetwrite/core";
import { withXlsxFormulaEngine } from "@sheetwrite/core/codec";

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
import { boundedErrorText, validateReadSnapshot, type XlsxCodecContext } from "./resources.js";
import { expandSharedFormulas, type SharedFormulaGroup } from "./shared-formula.js";
import { xmlChild } from "./xml.js";

/** Excel links customXml items from the workbook part; other writers may link them from the root. */
function has_custom_xml(package_file: OpcPackage): boolean {
  return [
    ...package_file.relationships(package_file.officeDocumentPart()),
    ...package_file.relationships(""),
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
async function import_workbook_formulas(
  snapshot: WorkbookSnapshot,
  shared_formulas: readonly SharedFormulaGroup[],
  context: XlsxCodecContext,
): Promise<void> {
  if (shared_formulas.length === 0 && workbookFormulaSources(snapshot).length === 0) return;

  const converted = await withXlsxFormulaEngine((engine) => {
    expandSharedFormulas(engine, shared_formulas, context);
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

async function workbook_data_model(
  loaded: LoadedWorkbookPackage,
  metadata: WorkbookSnapshot | null,
  sheets: readonly SheetSnapshot[],
  context: XlsxCodecContext,
) {
  const {
    packageFile: package_file,
    workbookRoot: workbook_root,
    workbookRelationships: workbook_relationships,
  } = loaded;
  // Sheetwrite's own metadata holds relationships by stable IDs; a file
  // without it may hold Excel's data model relationships.
  let data_model = metadata?.workbook.dataModel;
  if (data_model === undefined && hasExcelDataModel(workbook_root)) {
    const connections_part = workbook_relationships.find(
      (relationship) =>
        relationshipTypeMatches(relationship.type, "connections") && !relationship.external,
    )?.target;
    // A relationship can name a part the package lacks; such a file has no connections to read.
    const readable =
      connections_part !== undefined && package_file.contentType(connections_part) !== undefined;
    if (readable) await package_file.load([connections_part]);
    const connections = readable ? package_file.readXml(connections_part) : undefined;
    if (readable) package_file.release([connections_part]);
    data_model = readExcelDataModel(workbook_root, connections, sheets, context);
  }
  return data_model;
}

async function load_workbook_objects(
  loaded: LoadedWorkbookPackage,
  snapshot: WorkbookSnapshot,
  source_references: readonly WorkbookSheetReference[],
  metadata: WorkbookSnapshot | null,
  context: XlsxCodecContext,
  read_options: { readonly preserveOpaqueParts?: boolean },
): Promise<void> {
  const { packageFile: package_file, styles, externalLinks: external_links } = loaded;
  const sheet_parts = source_references.map((reference) => reference.relationship.target);
  const modelled_pivot_parts = await readPivots(
    package_file,
    {
      snapshot,
      sheetParts: sheet_parts,
      metadata,
      extendSheet,
      numberFormat: (num_fmt_id) => styles.numberFormat(num_fmt_id),
    },
    context,
  );
  const chart_parts = await readCharts(
    package_file,
    { snapshot, sheetParts: sheet_parts, metadata: metadata ?? undefined, extendSheet },
    context,
  );
  if (read_options.preserveOpaqueParts !== false)
    await capturePreserved(
      package_file,
      snapshot,
      context,
      new Set([...modelled_pivot_parts, ...chart_parts.modelled]),
      chart_parts.replacements,
      external_links.parts,
    );
  // The Power Query module loads only for workbooks that can hold queries:
  // saved definitions in the hidden metadata, or a customXml item.
  const sidecar_queries = metadata?.workbook.queries;
  if (sidecar_queries?.length || has_custom_xml(package_file)) {
    const { readPowerQuery: read_power_query } = await import("./power-query.js");
    await read_power_query(package_file, snapshot, sidecar_queries, context);
  }
}

/** Read a preflighted OOXML workbook into Sheetwrite's implementation-neutral snapshot. */
export async function readWorkbook(
  data: Blob | ArrayBuffer | Uint8Array,
  context: XlsxCodecContext,
  readOptions: { readonly preserveOpaqueParts?: boolean } = {},
): Promise<WorkbookSnapshot> {
  const loaded = await loadWorkbookPackage(data, context);
  const { workbookRoot: workbook_root, externalLinks: external_links } = loaded;
  const {
    references,
    sourceReferences: source_references,
    sourceSheets: source_sheets,
    metadata,
  } = await readSourceSheets(loaded, context);

  const {
    sheets,
    sheetIds: sheet_ids,
    resolvedMetadata: resolved_metadata,
  } = buildWorkbookSheets(source_sheets, metadata, loaded.styles, context);
  const active_sheet = workbookActiveSheet(workbook_root, references, source_references, sheets);
  const native_named_ranges = parseNativeDefinedNames(
    workbook_root,
    sheet_ids,
    source_references,
    context,
  );
  const named_ranges = xmlChild(workbook_root, "definedNames")
    ? native_named_ranges
    : metadata?.workbook.namedRanges;
  reconcileDefinedNames(named_ranges, sheets, context);

  const calculation = workbookCalculation(workbook_root);
  const data_model = await workbook_data_model(loaded, metadata, sheets, context);
  const snapshot: WorkbookSnapshot = {
    schemaVersion: 1,
    ...(metadata?.documentId ? { documentId: metadata.documentId } : {}),
    ...(metadata?.version !== undefined ? { version: metadata.version } : {}),
    workbook: {
      activeSheet: active_sheet,
      ...(named_ranges?.length ? { namedRanges: structuredClone(named_ranges) } : {}),
      ...(calculation ? { calculation } : {}),
      // A model with only measures is still a model.
      ...(data_model?.relationships.length || data_model?.measures?.length
        ? { dataModel: structuredClone(data_model) }
        : {}),
      ...(external_links.links.length ? { externalLinks: external_links.links } : {}),
    },
    sheets,
  };

  await import_workbook_formulas(
    snapshot,
    source_sheets.flatMap((source) => source.sharedFormulas),
    context,
  );
  restoreSidecarFields(snapshot, resolved_metadata);

  await load_workbook_objects(loaded, snapshot, source_references, metadata, context, readOptions);

  const checked = validateReadSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      boundedErrorText(
        `Sheetwrite: imported invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
      ),
    );
  }
  return checked.value;
}
