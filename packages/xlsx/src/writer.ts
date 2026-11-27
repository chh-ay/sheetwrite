import type {
  CellStyle,
  ChartView,
  DashboardExport,
  SheetId,
  PivotDefinition,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
  WorkbookTable,
} from "@sheetwrite/core";
import {
  colToA1,
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
  sheetNameKey,
  validateSheetName,
} from "@sheetwrite/core";

import { type DrawingChart, type PivotChartData } from "./chart-write.js";
import { staticDashboard, warnStaticDashboards } from "./dashboard.js";
import {
  DYNAMIC_ARRAY_METADATA,
  SHEET_METADATA_CONTENT,
  SHEET_METADATA_REL,
} from "./dynamic-array.js";
import {
  EXTERNAL_LINK_CONTENT,
  EXTERNAL_LINK_REL,
  ExternalLinkExport,
  externalLinkPartXml,
} from "./external-links.js";
import { MAIN_NS, META_MARKER, META_STEM, RELATIONSHIPS_NS } from "./format.js";
import { exportWorkbookFormulas } from "./formula.js";
import { type ContentTypeOverride, contentTypesXml, relationshipsXml } from "./opc.js";
import { preparePivots } from "./pivot.js";
import { QUERY_TABLE_CONTENT, type QueryTableBinding } from "./query-table.js";
import {
  assertResource,
  boundedErrorText,
  checkAbort,
  emitWarning,
  validateCodecSnapshot,
  type XlsxCodecContext,
} from "./resources.js";
import { StylesRegistry } from "./styles.js";
import { quotedSheet, type SpillOutput } from "./writer-cells.js";
import { writeSheet, type SheetWriteResult } from "./writer-sheet.js";
import { encodeXstring, escapeXml, XmlBuffer } from "./xml.js";
import { writeZip, zipChunks, type ZipPart } from "./zip.js";

const TEXT_ENCODER = new TextEncoder();
const OFFICE_DOCUMENT_REL = `${RELATIONSHIPS_NS}/officeDocument`;
const WORKSHEET_REL = `${RELATIONSHIPS_NS}/worksheet`;
const STYLES_REL = `${RELATIONSHIPS_NS}/styles`;
const WORKBOOK_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const WORKSHEET_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const STYLES_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml";
const COMMENTS_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml";
const VML_CONTENT = "application/vnd.openxmlformats-officedocument.vmlDrawing";
const TABLE_CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml";
const META_CHUNK = 30_000;

export interface AbsoluteCell {
  readonly row: number;
  readonly col: number;
  readonly source: SnapshotCell;
}

export type ExtraRelationship = {
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
};

export type WorkbookWriteHookResolver = (
  validated: WorkbookSnapshot,
) => WorkbookWriteHook | undefined;

export interface WorkbookWriteHook {
  readonly rootRelationships?: readonly ExtraRelationship[];
  readonly workbookRelationships?: readonly ExtraRelationship[];
  readonly contentTypeOverrides?: readonly ContentTypeOverride[];
  readonly contentTypeDefaults?: readonly { extension: string; contentType: string }[];
  /** Books of the kept external link parts, in the order formulas number them. */
  readonly externalBooks?: readonly string[];
  /**
   * `<pivotCache>` and `<externalReference>` elements for `workbookRelationships`;
   * the writer wraps them in `<pivotCaches>` and `<externalReferences>`.
   */
  workbookXml?(ids: readonly string[]): {
    pivotCaches?: readonly string[];
    externalReferences?: readonly string[];
  };
  sheet?(
    sheet: SheetSnapshot,
    part: { sheetNumber: number; name: string },
  ):
    | {
        relationships?: readonly ExtraRelationship[];
        beforeLegacyDrawing?(ids: readonly string[]): string;
      }
    | undefined;
  /** Rows are sorted, unique, and consumed only once; used by store-backed table export. */
  cellRows?(sheet: SheetSnapshot): Iterable<{ row: number; cells: readonly AbsoluteCell[] }>;
  /**
   * Add charts to the sheet's kept drawing and return true. A worksheet has at
   * most one `<drawing>`, so charts join a kept drawing instead of a new one.
   */
  appendCharts?(sheet: SheetSnapshot, charts: readonly DrawingChart[]): boolean;
  parts?(): Iterable<ZipPart>;
  /** Connection of the saved query that fills `table`, if it is written as a query table. */
  queryTable?(table: WorkbookTable): QueryTableBinding | undefined;
}

function canonical_json_value(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical_json_value);
  if (value === null || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    output[key] = canonical_json_value(Reflect.get(value, key));
  }
  return output;
}

function has_exact_border_width(style: CellStyle | undefined): boolean {
  return Object.values(style?.border ?? {}).some(
    (border) => border.width !== undefined && border.width !== 1 && border.width !== 2,
  );
}

/** See `PivotWrite.keptOutputs`. */
type KeptOutputs = ReadonlyMap<string, NonNullable<PivotDefinition["savedOutput"]>>;

/**
 * Workbook metadata for the hidden sheet. The saved output of a native pivot
 * is left out: the worksheet holds it as the pivot's rendered cells.
 */
function metadata_snapshot(
  snapshot: WorkbookSnapshot,
  native_pivots: ReadonlySet<string>,
  kept_outputs: KeptOutputs,
): WorkbookSnapshot {
  const { xlsxSource: _source, ...workbook } = snapshot.workbook;
  return {
    ...snapshot,
    workbook,
    sheets: snapshot.sheets.map((sheet) => ({
      ...sheet,
      columns: sheet.columns.map((column) => ({ ...column })),
      ...(sheet.pivots
        ? {
            pivots: sheet.pivots.map((pivot) => {
              // The cells written for a kept pivot are its saved output, so
              // the reader can tell them from user values.
              const kept = kept_outputs.get(pivot.id);
              if (kept) return { ...pivot, savedOutput: kept };
              if (!pivot.savedOutput || !native_pivots.has(pivot.id)) return pivot;
              const { savedOutput: _saved, ...definition } = pivot;
              return definition;
            }),
          }
        : {}),
      cells: sheet.cells.flatMap((block) => {
        const preserved = block.cells
          .filter((cell) => cell.value.kind === "ref" || has_exact_border_width(cell.style))
          .map((cell) => ({
            rowOffset: cell.rowOffset,
            colOffset: cell.colOffset,
            value:
              cell.value.kind === "ref"
                ? structuredClone(cell.value)
                : ({ kind: "literal", value: null } as const),
            ...(has_exact_border_width(cell.style) ? { style: structuredClone(cell.style) } : {}),
          }));
        return preserved.length > 0 ? [{ ...block, cells: preserved }] : [];
      }),
    })),
  };
}

function metadata_sheet_name(snapshot: WorkbookSnapshot): string {
  const names = new Set(snapshot.sheets.map((sheet) => sheetNameKey(sheet.name)));
  let name = META_STEM;
  let suffix = 2;
  while (names.has(sheetNameKey(name))) {
    name = `${META_STEM.slice(0, 27)}_${suffix++}`;
  }
  return name;
}

function validate_names(snapshot: WorkbookSnapshot): void {
  const names: string[] = [];
  for (const sheet of snapshot.sheets) {
    const validated = validateSheetName(sheet.name, names);
    // A History sheet came from a file or an added sheet; only a rename refuses the name.
    if (!validated.ok && validated.code !== "reserved") {
      const prefix =
        validated.code === "duplicate"
          ? "duplicate case-insensitive XLSX sheet name"
          : "invalid XLSX sheet name";
      throw new RangeError(
        boundedErrorText(`Sheetwrite: ${prefix}: ${sheet.name} (${validated.code})`),
      );
    }
    if (validated.name !== sheet.name) {
      throw new RangeError(
        boundedErrorText(`Sheetwrite: non-canonical NFC XLSX sheet name: ${sheet.name}`),
      );
    }
    names.push(validated.name);
  }
  if (
    snapshot.sheets.every(
      (sheet) => sheet.visibility === "hidden" || sheet.visibility === "veryHidden",
    )
  ) {
    throw new RangeError("Sheetwrite: XLSX export requires at least one visible worksheet");
  }
}

function preflight_snapshot(snapshot: WorkbookSnapshot, context: XlsxCodecContext): void {
  assertResource(context, "maxSheets", snapshot.sheets.length);
  let cells = 0;
  let merges = 0;
  for (const sheet of snapshot.sheets) {
    assertResource(context, "maxRowsPerSheet", sheet.rowCount);
    assertResource(context, "maxColumnsPerSheet", sheet.columns.length);
    merges += sheet.merges?.length ?? 0;
    assertResource(context, "maxMerges", merges);
    for (const block of sheet.cells) {
      cells += block.cells.length;
      assertResource(context, "maxCells", cells);
    }
  }
}

function metadata_sheet_xml(
  snapshot: WorkbookSnapshot,
  native_pivots: ReadonlySet<string>,
  kept_outputs: KeptOutputs,
  context: XlsxCodecContext,
): Uint8Array {
  const json = JSON.stringify(
    canonical_json_value(metadata_snapshot(snapshot, native_pivots, kept_outputs)),
  );
  const chunks = [META_MARKER];
  let chunk_parts: string[] = [];
  let chunk_bytes = 0;
  for (const character of json) {
    const encoded = encodeXstring(character);
    const code_unit = character.charCodeAt(0);
    const bytes =
      encoded.length !== character.length
        ? encoded.length
        : character.length === 2
          ? 4
          : code_unit <= 0x7f
            ? 1
            : code_unit <= 0x7ff
              ? 2
              : 3;
    if (chunk_bytes + bytes > META_CHUNK && chunk_parts.length > 0) {
      chunks.push(chunk_parts.join(""));
      chunk_parts = [];
      chunk_bytes = 0;
    }
    chunk_parts.push(character);
    chunk_bytes += bytes;
  }
  if (chunk_parts.length > 0) chunks.push(chunk_parts.join(""));
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<worksheet xmlns="${MAIN_NS}"><dimension ref="A1:A${chunks.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>`,
  );
  for (const [index, chunk] of chunks.entries()) {
    xml.append(
      `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t xml:space="preserve">`,
    );
    xml.appendText(chunk);
    xml.append("</t></is></c></row>");
  }
  xml.append("</sheetData></worksheet>");
  return xml.finish();
}

function workbook_xml(
  snapshot: WorkbookSnapshot,
  ordered: readonly SheetSnapshot[],
  metadata_name: string,
  context: XlsxCodecContext,
  pivot_caches: readonly string[],
  external_references: readonly string[],
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  const requested_active = ordered.findIndex((sheet) => sheet.id === snapshot.workbook.activeSheet);
  const active_sheet = ordered[requested_active];
  const active_tab =
    active_sheet?.visibility === "hidden" || active_sheet?.visibility === "veryHidden"
      ? ordered.findIndex(
          (sheet) => sheet.visibility !== "hidden" && sheet.visibility !== "veryHidden",
        )
      : Math.max(0, requested_active);
  if (active_tab !== requested_active) {
    emitWarning(context, {
      code: "unsupported-feature",
      message:
        "A hidden active sheet was preserved, but native Excel activation moved to the first visible sheet",
      sheet: active_sheet?.name,
    });
  }
  xml.append(
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIPS_NS}"><bookViews><workbookView activeTab="${active_tab}"/></bookViews><sheets>`,
  );
  for (const [index, sheet] of ordered.entries()) {
    const state =
      sheet.visibility === "hidden" || sheet.visibility === "veryHidden"
        ? ` state="${sheet.visibility}"`
        : "";
    xml.append(
      `<sheet name="${escapeXml(encodeXstring(sheet.name))}" sheetId="${index + 1}"${state} r:id="rId${index + 1}"/>`,
    );
  }
  xml.append(
    `<sheet name="${escapeXml(encodeXstring(metadata_name))}" sheetId="${ordered.length + 1}" state="veryHidden" r:id="rId${ordered.length + 1}"/></sheets>`,
  );
  // CT_Workbook places `<externalReferences>` after `<sheets>`, before `<definedNames>`.
  if (external_references.length > 0) {
    xml.append(`<externalReferences>${external_references.join("")}</externalReferences>`);
  }
  if (snapshot.workbook.namedRanges?.length || ordered.some((sheet) => sheet.autoFilter)) {
    xml.append("<definedNames>");
    for (const named of snapshot.workbook.namedRanges ?? []) {
      const scope_index =
        named.scope === undefined
          ? undefined
          : ordered.findIndex((candidate) => candidate.id === named.scope);
      let source: string;
      if (named.range === undefined) {
        const converted = context.formulas?.get(named.formula);
        if (converted === undefined) throw new Error("Defined-name formula was not converted");
        source = converted.replace(/^=/, "");
        source = context.externalFormula?.(source) ?? source;
      } else {
        const range = named.range;
        const sheet = snapshot.sheets.find((candidate) => candidate.id === range.sheet);
        if (sheet === undefined) continue;
        source = `${quotedSheet(sheet.name)}!$${colToA1(range.start.col)}$${range.start.row + 1}:$${colToA1(range.end.col)}$${range.end.row + 1}`;
      }
      xml.append(
        `<definedName name="${escapeXml(encodeXstring(named.name))}"${scope_index !== undefined && scope_index >= 0 ? ` localSheetId="${scope_index}"` : ""}>${escapeXml(encodeXstring(source))}</definedName>`,
      );
    }
    // Excel names each worksheet AutoFilter's range `_xlnm._FilterDatabase`.
    for (const [index, sheet] of ordered.entries()) {
      const range = sheet.autoFilter?.range;
      if (!range) continue;
      const source = `${quotedSheet(sheet.name)}!$${colToA1(range.start.col)}$${range.start.row + 1}:$${colToA1(range.end.col)}$${range.end.row + 1}`;
      xml.append(
        `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${escapeXml(encodeXstring(source))}</definedName>`,
      );
    }
    xml.append("</definedNames>");
  }
  xml.append(`<calcPr fullCalcOnLoad="1"${iteration_attributes(snapshot)} forceFullCalc="1"/>`);
  // CT_Workbook places `<pivotCaches>` directly after `<calcPr>`.
  if (pivot_caches.length > 0) xml.append(`<pivotCaches>${pivot_caches.join("")}</pivotCaches>`);
  xml.append("</workbook>");
  return xml.finish();
}

/**
 * `<calcPr>` iteration attributes. Limits are written even while iteration is
 * off so a later "Enable iterative calculation" in Excel keeps them; default
 * workbooks write none, which Excel reads as the same defaults.
 */
function iteration_attributes(snapshot: WorkbookSnapshot): string {
  const calculation = snapshot.workbook.calculation;
  if (
    !calculation ||
    (!calculation.iterate &&
      calculation.maxIterations === DEFAULT_MAX_ITERATIONS &&
      calculation.maxChange === DEFAULT_MAX_CHANGE)
  ) {
    return "";
  }
  return `${calculation.iterate ? ' iterate="1"' : ""} iterateCount="${calculation.maxIterations}" iterateDelta="${calculation.maxChange}"`;
}

/** What only core's engine computes for an export: values that Excel shows as cells and charts. */
export interface EngineContent {
  /** Static content of each dashboard sheet. */
  readonly dashboards?: readonly DashboardExport[];
  /** Current output of each worksheet pivot, by sheet; item IDs are pivot IDs. */
  readonly pivotOutputs?: readonly DashboardExport[];
  /** The resolved view of each worksheet chart over a pivot, by sheet and chart ID. */
  readonly pivotCharts?: ReadonlyMap<SheetId, ReadonlyMap<string, ChartView>>;
  /** The rows each worksheet AutoFilter hides, by sheet; Excel stores them hidden. */
  readonly filteredRows?: ReadonlyMap<SheetId, readonly number[]>;
  /** The installed spills of each worksheet, by sheet; Excel keeps their values in the covered cells. */
  readonly spills?: ReadonlyMap<SheetId, readonly SpillOutput[]>;
}

/**
 * The charts over pivots of worksheet `sheet`, each with the output of its
 * pivot at the pivot's anchor: the cells written for a pivot kept in
 * metadata, or the cells Excel lays out when it refreshes a native pivot.
 */
function worksheet_pivot_charts(
  sheet: SheetSnapshot,
  content: EngineContent,
  native_ids: ReadonlySet<string> | undefined,
): ReadonlyMap<string, PivotChartData> | undefined {
  const views = content.pivotCharts?.get(sheet.id);
  if (views === undefined) return undefined;

  const outputs = content.pivotOutputs?.find((entry) => entry.sheet === sheet.id)?.items ?? [];
  const charts = new Map<string, PivotChartData>();
  for (const [id, view] of views) {
    const pivot = sheet.pivots?.find((candidate) => candidate.id === view.chart.pivot);
    const output = outputs.find((item) => item.id === pivot?.id);
    if (pivot === undefined || output === undefined) {
      charts.set(id, { view });
      continue;
    }

    const native = native_ids?.has(pivot.id) === true;
    const cells = {
      cells: output.cells,
      origin: pivot.anchor,
      ...(native ? { pivotTable: pivot.name } : {}),
    };
    charts.set(id, { view, cells });
  }
  return charts;
}

/** Yield worksheet data before constructing later parts, bounded by the XML/ZIP chunk windows. */
function* write_workbook_parts(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  resolve_hook?: WorkbookWriteHookResolver,
  content: EngineContent = {},
): Generator<ZipPart> {
  const dashboards = content.dashboards ?? [];
  preflight_snapshot(snapshot, context);
  if (snapshot.sheets.length === 0)
    throw new RangeError("Sheetwrite: XLSX export requires at least one sheet");
  validate_names(snapshot);
  const checked = validateCodecSnapshot(snapshot, context);
  if (!checked.ok) {
    throw new TypeError(
      boundedErrorText(
        `Sheetwrite: invalid workbook snapshot: ${checked.errors[0]?.message ?? "unknown error"}`,
      ),
    );
  }
  snapshot = checked.value;
  const hook = resolve_hook?.(snapshot);
  const links = new ExternalLinkExport(
    snapshot.workbook.externalLinks ?? [],
    hook?.externalBooks ?? [],
  );
  context.externalFormula = (formula) => links.fileFormula(formula);
  const ordered = [...snapshot.sheets].sort((left, right) => left.order - right.order);
  if (ordered.some((sheet) => sheet.kind === "dashboard")) warnStaticDashboards(context);
  const styles = new StylesRegistry(context);
  const pivots = preparePivots(snapshot, ordered, styles, context, content.pivotOutputs);
  const metadata_name = metadata_sheet_name(snapshot);
  const overrides: ContentTypeOverride[] = [
    { part: "xl/workbook.xml", contentType: WORKBOOK_CONTENT },
    { part: "xl/styles.xml", contentType: STYLES_CONTENT },
  ];
  const workbook_relationships = [];
  let next_table_id = 1;
  let dynamic_arrays = false;
  for (const [index, sheet] of ordered.entries()) {
    checkAbort(context);
    const number = index + 1;
    const part = `xl/worksheets/sheet${number}.xml`;
    let result: SheetWriteResult | undefined;
    const sheet_table_id = next_table_id;
    // Excel has no dashboard sheet: it gets a worksheet of the dashboard's current values.
    const dashboard =
      sheet.kind === "dashboard"
        ? staticDashboard(
            sheet,
            dashboards.find((entry) => entry.sheet === sheet.id),
            context,
          )
        : undefined;
    function* chunks(export_sheet: SheetSnapshot): Generator<Uint8Array> {
      result = yield* writeSheet(
        snapshot,
        export_sheet,
        styles,
        context,
        number,
        sheet_table_id,
        hook,
        pivots?.sheetRelationships(export_sheet.id),
        dashboard?.charts ?? worksheet_pivot_charts(sheet, content, pivots?.nativeIds),
        content.filteredRows?.get(sheet.id),
        content.spills?.get(sheet.id),
      );
    }
    const export_sheet = dashboard?.sheet ?? (pivots ? pivots.withSavedOutput(sheet) : sheet);
    yield { name: part, data: chunks(export_sheet) };
    if (!result) throw new Error(`Sheetwrite: worksheet ${part} was not consumed before advancing`);
    dynamic_arrays ||= result.dynamicArrays;
    overrides.push({ part, contentType: WORKSHEET_CONTENT });
    workbook_relationships.push({
      id: `rId${number}`,
      type: WORKSHEET_REL,
      target: `worksheets/sheet${number}.xml`,
    });
    if (result.relationships) {
      yield { name: `xl/worksheets/_rels/sheet${number}.xml.rels`, data: result.relationships };
    }
    if (result.comments && result.vml) {
      yield { name: `xl/comments${number}.xml`, data: result.comments };
      yield { name: `xl/drawings/vmlDrawing${number}.vml`, data: result.vml };
      overrides.push({ part: `xl/comments${number}.xml`, contentType: COMMENTS_CONTENT });
      overrides.push({ part: `xl/drawings/vmlDrawing${number}.vml`, contentType: VML_CONTENT });
    }
    for (const table of result.tables) {
      yield { name: table.part, data: table.xml };
      overrides.push({ part: table.part, contentType: TABLE_CONTENT });
      if (table.queryTable) {
        const rels = table.part.replace(/^xl\/tables\//u, "xl/tables/_rels/") + ".rels";
        yield { name: rels, data: table.queryTable.rels };
        yield { name: table.queryTable.part, data: table.queryTable.xml };
        overrides.push({ part: table.queryTable.part, contentType: QUERY_TABLE_CONTENT });
      }
    }
    next_table_id += result.tables.length;
    for (const part of result.chartParts ?? []) yield part;
    overrides.push(...(result.chartOverrides ?? []));
  }
  for (const part of pivots?.parts ?? []) yield part;
  overrides.push(...(pivots?.overrides ?? []));
  const metadata_number = ordered.length + 1;
  const metadata_part = `xl/worksheets/sheet${metadata_number}.xml`;
  yield {
    name: metadata_part,
    data: metadata_sheet_xml(
      snapshot,
      pivots?.nativeIds ?? new Set(),
      pivots?.keptOutputs ?? new Map(),
      context,
    ),
  };
  overrides.push({ part: metadata_part, contentType: WORKSHEET_CONTENT });
  workbook_relationships.push({
    id: `rId${metadata_number}`,
    type: WORKSHEET_REL,
    target: `worksheets/sheet${metadata_number}.xml`,
  });
  workbook_relationships.push({
    id: `rId${metadata_number + 1}`,
    type: STYLES_REL,
    target: "styles.xml",
  });
  const extra_ids = (hook?.workbookRelationships ?? []).map((relationship, index) => {
    const id = `rId${metadata_number + 2 + index}`;
    workbook_relationships.push({ ...relationship, id });
    return id;
  });
  const pivot_ids = (pivots?.workbookRelationships ?? []).map((relationship, index) => {
    const id = `rId${metadata_number + 2 + extra_ids.length + index}`;
    workbook_relationships.push({ ...relationship, id });
    return id;
  });
  // A defined name can name a book that no cell names, so its link is known before the parts.
  for (const named of snapshot.workbook.namedRanges ?? []) {
    if (named.range === undefined) links.fileFormula(context.formulas?.get(named.formula) ?? "");
  }
  const external_references = [...(hook?.workbookXml?.(extra_ids).externalReferences ?? [])];
  for (const [index, link] of links.written.entries()) {
    const id = `rId${metadata_number + 2 + extra_ids.length + pivot_ids.length + index}`;
    const name = `externalLinks/sheetwriteLink${index + 1}.xml`;
    const xml = externalLinkPartXml(link);
    yield { name: `xl/${name}`, data: TEXT_ENCODER.encode(xml.part) };
    yield {
      name: `xl/externalLinks/_rels/sheetwriteLink${index + 1}.xml.rels`,
      data: TEXT_ENCODER.encode(xml.relationships),
    };
    overrides.push({ part: `xl/${name}`, contentType: EXTERNAL_LINK_CONTENT });
    workbook_relationships.push({ id, type: EXTERNAL_LINK_REL, target: name });
    external_references.push(`<externalReference r:id="${id}"/>`);
  }
  const pivot_caches = [
    ...(hook?.workbookXml?.(extra_ids).pivotCaches ?? []),
    ...(pivots?.pivotCaches(pivot_ids) ?? []),
  ];
  if (dynamic_arrays) {
    yield { name: "xl/metadata.xml", data: TEXT_ENCODER.encode(DYNAMIC_ARRAY_METADATA) };
    overrides.push({ part: "xl/metadata.xml", contentType: SHEET_METADATA_CONTENT });
    workbook_relationships.push({
      id: `rId${workbook_relationships.length + 1}`,
      type: SHEET_METADATA_REL,
      target: "metadata.xml",
    });
  }
  yield { name: "xl/styles.xml", data: styles.toXml() };
  yield {
    name: "xl/workbook.xml",
    data: workbook_xml(
      snapshot,
      ordered,
      metadata_name,
      context,
      pivot_caches,
      external_references,
    ),
  };
  yield {
    name: "xl/_rels/workbook.xml.rels",
    data: relationshipsXml(workbook_relationships, context),
  };
  yield {
    name: "_rels/.rels",
    data: relationshipsXml(
      [
        { id: "rId1", type: OFFICE_DOCUMENT_REL, target: "xl/workbook.xml" },
        ...(hook?.rootRelationships ?? []).map((relationship, index) => ({
          ...relationship,
          id: `rId${index + 2}`,
        })),
      ],
      context,
    ),
  };
  const override_map = new Map(overrides.map((override) => [override.part, override]));
  for (const override of hook?.contentTypeOverrides ?? [])
    override_map.set(override.part, override);
  yield {
    name: "[Content_Types].xml",
    data: contentTypesXml([...override_map.values()], context, hook?.contentTypeDefaults),
  };
  yield* hook?.parts?.() ?? [];
}

export async function writeWorkbook(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  hook?: WorkbookWriteHookResolver,
  content?: EngineContent,
): Promise<Uint8Array> {
  const { formulas, arrayFormulas: array_formulas } = await exportWorkbookFormulas(snapshot);
  return writeZip(
    write_workbook_parts(
      snapshot,
      { ...context, formulas, arrayFormulas: array_formulas },
      hook,
      content,
    ),
    context,
  );
}

export async function* streamWorkbook(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  hook?: WorkbookWriteHookResolver,
  content?: EngineContent,
): AsyncGenerator<Uint8Array> {
  const { formulas, arrayFormulas: array_formulas } = await exportWorkbookFormulas(snapshot);
  yield* zipChunks(
    write_workbook_parts(
      snapshot,
      { ...context, formulas, arrayFormulas: array_formulas },
      hook,
      content,
    ),
    context,
  );
}
