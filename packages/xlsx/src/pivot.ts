import type {
  CellBlock,
  CellScalar,
  CellValue,
  PivotAggregation,
  PivotDefinition,
  PivotFilter,
  PivotSort,
  PivotValueField,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { cellA1, sheetNameKey } from "@sheetwrite/core";

import { type CellRect, parseCellRect, rectA1 } from "./cell-reference.js";
import { isoDateSerial, MAIN_NS, RELATIONSHIPS_NS } from "./format.js";
import {
  type ContentTypeOverride,
  type OpcPackage,
  relationshipsXml,
  relationshipTypeMatches,
} from "./opc.js";
import { checkAbort, emitWarning, isAbort, type XlsxCodecContext } from "./resources.js";
import type { StylesRegistry } from "./styles.js";
import {
  decodeXstring,
  encodeXstring,
  escapeXml,
  parseXml,
  XmlBuffer,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
  xmlLocalName,
} from "./xml.js";
import type { ZipPart } from "./zip.js";

/*
 * Pivot tables (ECMA-376 Part 1, 18.10):
 * - A pivotTableDefinition part hangs off its sheet and names fields by cache
 *   field index; its pivotCacheDefinition part names the source range or table.
 * - The reader maps a pivot to a PivotDefinition only when every feature it
 *   uses maps exactly. Other pivots stay opaque parts (preservation.ts) and
 *   the reader warns.
 * - The writer emits a cache with refreshOnLoad and no records, so Excel and
 *   LibreOffice rebuild the output from the source cells when they open the
 *   file. Pivots that OOXML cannot express stay only in Sheetwrite metadata.
 */

const PIVOT_TABLE_REL = `${RELATIONSHIPS_NS}/pivotTable`;
const PIVOT_CACHE_REL = `${RELATIONSHIPS_NS}/pivotCacheDefinition`;
const PIVOT_TABLE_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml";
const PIVOT_CACHE_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml";
/** The field index OOXML uses for the values pseudo-field on an axis. */
const VALUES_FIELD = -2;
/** Shared strings longer than this need `longText` on their cache field. */
const SHORT_TEXT_LIMIT = 255;
/** Excel 2007 format version: the oldest that refreshes a cache on load. */
const PIVOT_FORMAT_VERSION = 3;
/** Excel puts one blank row between the page filters and the pivot body. */
const PAGE_FILTER_GAP_ROWS = 1;
/** Most rendered cells kept as one pivot's saved output; core's output bound. */
const MAX_SAVED_OUTPUT_CELLS = 1_000_000;
/** Each page filter column is a label cell, a value cell and a blank separator. */
const PAGE_FILTER_COLUMN_WIDTH = 3;
const PAGE_FILTER_SEPARATOR = 1;

/** OOXML `ST_DataConsolidateFunction` values that have an exact Sheetwrite aggregation. */
const AGGREGATION_BY_SUBTOTAL: ReadonlyMap<string, PivotAggregation> = new Map([
  ["sum", "SUM"],
  // OOXML `count` counts non-empty cells and `countNums` counts numbers.
  ["count", "COUNTA"],
  ["countNums", "COUNT"],
  ["average", "AVERAGE"],
  ["min", "MIN"],
  ["max", "MAX"],
]);
const SUBTOTAL_BY_AGGREGATION: ReadonlyMap<PivotAggregation, string> = new Map(
  [...AGGREGATION_BY_SUBTOTAL].map(([subtotal, aggregation]) => [aggregation, subtotal]),
);
/** Per-function subtotal flags of `CT_PivotField`; Sheetwrite has only the default subtotal. */
const CUSTOM_SUBTOTAL_FLAGS = [
  "sumSubtotal",
  "countASubtotal",
  "avgSubtotal",
  "maxSubtotal",
  "minSubtotal",
  "productSubtotal",
  "countSubtotal",
  "stdDevSubtotal",
  "stdDevPSubtotal",
  "varSubtotal",
  "varPSubtotal",
] as const;

/** Defined and table names compare case-insensitively after NFC normalization. */
function name_key(name: string): string {
  return name.normalize("NFC").toUpperCase();
}

/** Excel's pivot item order: numbers, text, logical values, then blanks. */
function scalar_rank(value: CellScalar): number {
  if (typeof value === "number") return 0;
  if (typeof value === "string") return 1;
  if (typeof value === "boolean") return 2;
  return 3;
}

function compare_scalars(left: CellScalar, right: CellScalar): number {
  const rank = scalar_rank(left) - scalar_rank(right);
  if (rank !== 0) return rank;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "string" && typeof right === "string") {
    const folded = left.toLowerCase().localeCompare(right.toLowerCase());
    return folded !== 0 ? folded : left.localeCompare(right);
  }
  return Number(left) - Number(right);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Value of one `sharedItems` child, or undefined for errors and unreadable items. */
function shared_item_value(item: XmlElement): CellScalar | undefined {
  const text = xmlAttribute(item, "v");
  switch (xmlLocalName(item.name)) {
    case "s":
      return decodeXstring(text ?? "");
    case "n": {
      const number = Number(text);
      return text !== undefined && Number.isFinite(number) ? number : undefined;
    }
    case "b":
      return xmlBoolean(text);
    case "m":
      return null;
    case "d":
      // Cells hold 1900-system serials (the reader shifts 1904 dates), and so do filters.
      return isoDateSerial(text ?? "");
    default:
      return undefined;
  }
}

interface ResolvedReadSource {
  readonly source: PivotDefinition["source"];
  readonly width: number;
}

function read_source(cache: XmlElement, snapshot: WorkbookSnapshot): ResolvedReadSource | string {
  const cache_source = xmlChild(cache, "cacheSource");
  const type = cache_source ? xmlAttribute(cache_source, "type") : undefined;
  const worksheet = cache_source ? xmlChild(cache_source, "worksheetSource") : undefined;
  if (type !== "worksheet" || !worksheet) return "its data source is not a worksheet range";
  if (xmlAttribute(worksheet, "id") !== undefined) return "it reads another workbook";

  const name = xmlAttribute(worksheet, "name");
  if (name !== undefined) {
    const key = name_key(decodeXstring(name));
    for (const sheet of snapshot.sheets) {
      const table = sheet.tables?.find((candidate) => name_key(candidate.name) === key);
      if (table) return { source: { table: table.id }, width: table.columns.length };
    }
    const named = snapshot.workbook.namedRanges?.find(
      (candidate) => candidate.scope === undefined && name_key(candidate.name) === key,
    );
    if (named?.range === undefined)
      return "its source name is neither a table nor a workbook range";
    return {
      source: { range: structuredClone(named.range) },
      width: Math.abs(named.range.end.col - named.range.start.col) + 1,
    };
  }

  const rect = parseCellRect(xmlAttribute(worksheet, "ref") ?? "");
  const sheet_name = xmlAttribute(worksheet, "sheet");
  if (!rect || sheet_name === undefined) return "its source range is incomplete";
  const key = sheetNameKey(decodeXstring(sheet_name));
  const sheet = snapshot.sheets.find((candidate) => sheetNameKey(candidate.name) === key);
  if (!sheet) return "its source sheet is missing";
  return {
    source: {
      range: {
        sheet: sheet.id,
        start: { row: rect.r0, col: rect.c0 },
        end: { row: rect.r1, col: rect.c1 },
      },
    },
    width: rect.c1 - rect.c0 + 1,
  };
}

function field_list(table: XmlElement, collection: string, element: string, attribute: string) {
  return xmlChildren(xmlChild(table, collection) ?? table, element).map((field) =>
    Number(xmlAttribute(field, attribute)),
  );
}

/** `defaultSubtotal`, `compact` and `outline` default to true on a pivot field. */
function field_flag(field: XmlElement, name: string): boolean {
  const value = xmlAttribute(field, name);
  return value === undefined || xmlBoolean(value);
}

interface ReadPivot {
  readonly pivot: PivotDefinition;
  /** The pivot body from its anchor, as the producing application rendered it. */
  readonly body: CellRect;
  /** Cells the producing application rendered; Sheetwrite's engine owns them now. */
  readonly output: readonly CellRect[];
}

/**
 * Map one pivot table and its cache to a definition, or return why it cannot
 * be mapped exactly. The caller assigns the id.
 */
function pivot_from_xml(
  table: XmlElement,
  cache: XmlElement,
  snapshot: WorkbookSnapshot,
  number_format: (numFmtId: number) => string | undefined,
): ReadPivot | string {
  const name = decodeXstring(xmlAttribute(table, "name") ?? "");
  if (!name) return "it has no name";
  const resolved = read_source(cache, snapshot);
  if (typeof resolved === "string") return resolved;
  const { source, width } = resolved;

  const cache_fields = xmlChildren(xmlChild(cache, "cacheFields") ?? cache, "cacheField");
  if (
    cache_fields.some(
      (field) =>
        xmlAttribute(field, "formula") !== undefined ||
        xmlAttribute(field, "databaseField") === "0" ||
        xmlChild(field, "fieldGroup") !== undefined,
    )
  ) {
    return "it uses calculated or grouped fields";
  }
  const pivot_fields = xmlChildren(xmlChild(table, "pivotFields") ?? table, "pivotField");
  if (cache_fields.length !== width || pivot_fields.length !== width) {
    return "its fields do not match its source";
  }
  if (xmlBoolean(xmlAttribute(table, "dataOnRows"))) return "it shows values on rows";
  if (xmlChildren(xmlChild(table, "filters") ?? table, "filter").length > 0) {
    return "it uses label or value filters";
  }

  const rows = field_list(table, "rowFields", "field", "x");
  if (rows.includes(VALUES_FIELD)) return "it shows values on rows";
  const column_fields = field_list(table, "colFields", "field", "x");
  // Sheetwrite places several values innermost on the columns, as Excel does by default.
  const values_at = column_fields.indexOf(VALUES_FIELD);
  if (values_at >= 0 && values_at !== column_fields.length - 1) {
    return "it places values outside the innermost column field";
  }
  const columns = column_fields.filter((field) => field !== VALUES_FIELD);
  const page_elements = xmlChildren(xmlChild(table, "pageFields") ?? table, "pageField");
  const pages = page_elements.map((page) => Number(xmlAttribute(page, "fld")));
  const data_elements = xmlChildren(xmlChild(table, "dataFields") ?? table, "dataField");
  const value_fields = data_elements.map((data) => Number(xmlAttribute(data, "fld")));
  const field_at = (field: number): XmlElement | undefined =>
    Number.isInteger(field) ? pivot_fields[field] : undefined;
  if ([...rows, ...columns, ...pages, ...value_fields].some((field) => !field_at(field))) {
    return "it names a field outside its source";
  }

  const values: PivotValueField[] = [];
  for (const [index, data] of data_elements.entries()) {
    const show_as = xmlAttribute(data, "showDataAs");
    if (show_as !== undefined && show_as !== "normal") return `it shows values as ${show_as}`;
    const subtotal = xmlAttribute(data, "subtotal") ?? "sum";
    const aggregation = AGGREGATION_BY_SUBTOTAL.get(subtotal);
    if (!aggregation) return `it uses the ${subtotal} summary`;
    const caption = xmlAttribute(data, "name");
    const format_id = xmlAttribute(data, "numFmtId");
    const format = format_id === undefined ? undefined : number_format(Number(format_id));
    values.push({
      field: value_fields[index] ?? 0,
      aggregation,
      ...(caption !== undefined ? { name: decodeXstring(caption) } : {}),
      ...(format !== undefined ? { numberFormat: format } : {}),
    });
  }

  const axis_fields = [...rows, ...columns];
  for (const field of [...axis_fields, ...pages]) {
    const pivot_field = field_at(field);
    // showAll defaults to true and keeps cache items with no source data.
    // Definitions group only current source rows and cannot retain those items.
    if (pivot_field && field_flag(pivot_field, "showAll")) {
      return "it shows items with no source data";
    }
  }
  for (const field of axis_fields) {
    const pivot_field = field_at(field);
    if (
      pivot_field &&
      CUSTOM_SUBTOTAL_FLAGS.some((flag) => xmlBoolean(xmlAttribute(pivot_field, flag)))
    ) {
      return "it uses custom subtotals";
    }
  }

  const filters: PivotFilter[] = [];
  const selected_page_items = new Map(
    page_elements.map((page, index) => [pages[index], xmlAttribute(page, "item")] as const),
  );
  for (const field of [...new Set([...axis_fields, ...pages])].sort(
    (left, right) => left - right,
  )) {
    const pivot_field = field_at(field);
    const cache_field = cache_fields[field];
    if (!pivot_field || !cache_field) return "it names a field outside its source";
    const items = xmlChildren(xmlChild(pivot_field, "items") ?? pivot_field, "item");
    if (items.some((item) => (xmlAttribute(item, "t") ?? "default") !== "default")) {
      return "it uses custom subtotals";
    }
    const selected = selected_page_items.get(field);
    let kept: XmlElement[];
    if (selected !== undefined) {
      const item = items[Number(selected)];
      if (!item || xmlAttribute(item, "t") !== undefined)
        return "its page filter names a missing item";
      kept = [item];
    } else {
      const data_items = items.filter((item) => xmlAttribute(item, "t") === undefined);
      if (!data_items.some((item) => xmlBoolean(xmlAttribute(item, "h")))) continue;
      kept = data_items.filter((item) => !xmlBoolean(xmlAttribute(item, "h")));
    }
    const shared = xmlChild(cache_field, "sharedItems")?.children ?? [];
    const keep: CellScalar[] = [];
    for (const item of kept) {
      const shared_item = shared[Number(xmlAttribute(item, "x"))];
      const value = shared_item ? shared_item_value(shared_item) : undefined;
      if (value === undefined) return "its filter keeps an item Sheetwrite cannot represent";
      keep.push(value);
    }
    if (keep.length === 0) return "it filters out every value";
    filters.push({ field, values: keep.sort(compare_scalars) });
  }

  const sort: PivotSort[] = [];
  for (const [axis, fields] of [
    ["rows", rows],
    ["columns", columns],
  ] as const) {
    for (const field of fields) {
      const pivot_field = field_at(field);
      if (!pivot_field) continue;
      if (xmlChild(pivot_field, "autoSortScope")) return "it sorts by values";
      const sort_type = xmlAttribute(pivot_field, "sortType");
      if (sort_type === "descending") {
        sort.push({ axis, field, descending: true });
      } else if (sort_type === undefined || sort_type === "manual") {
        // A definition cannot keep a custom item order. Only accept Excel's
        // manual order when it already agrees with the ascending default.
        const cache_field = cache_fields[field];
        const shared = cache_field ? xmlChild(cache_field, "sharedItems")?.children : undefined;
        const items = xmlChildren(xmlChild(pivot_field, "items") ?? pivot_field, "item").filter(
          (item) => xmlAttribute(item, "t") === undefined,
        );
        let previous: CellScalar | undefined;
        for (const item of items) {
          const cached = shared?.[Number(xmlAttribute(item, "x"))];
          const current = cached ? shared_item_value(cached) : undefined;
          if (
            current === undefined ||
            (previous !== undefined && compare_scalars(previous, current) > 0)
          ) {
            return "it uses a manual item order";
          }
          previous = current;
        }
      }
    }
  }

  // Subtotals of an axis's innermost field never show, so only outer fields decide.
  const outer_fields = [...rows.slice(0, -1), ...columns.slice(0, -1)];
  const subtotal_fields = outer_fields.length > 0 ? outer_fields : axis_fields;
  const hidden_subtotals = subtotal_fields.filter((field) => {
    const pivot_field = field_at(field);
    return pivot_field !== undefined && !field_flag(pivot_field, "defaultSubtotal");
  }).length;
  if (hidden_subtotals > 0 && hidden_subtotals < subtotal_fields.length) {
    return "it shows subtotals for only some fields";
  }

  let tabular_rows = 0;
  for (const field of rows) {
    const pivot_field = field_at(field);
    if (!pivot_field) continue;
    const compact = field_flag(pivot_field, "compact");
    const outline = field_flag(pivot_field, "outline");
    if (compact !== outline) return "it uses the outline layout";
    if (!compact) tabular_rows += 1;
  }
  if (tabular_rows > 0 && tabular_rows < rows.length) return "it mixes row layouts";

  const location = xmlChild(table, "location");
  const body = location ? parseCellRect(xmlAttribute(location, "ref") ?? "") : undefined;
  if (!location || !body) return "its location is missing";
  const output: CellRect[] = [body];
  // Sheetwrite writes a one-cell location and no page filter cells; only a
  // rendered pivot (a larger location) owns the page filter area above it.
  const page_rows = Number(xmlAttribute(location, "rowPageCount") ?? 0);
  const page_columns = Number(xmlAttribute(location, "colPageCount") ?? 1);
  const rendered = body.r1 > body.r0 || body.c1 > body.c0;
  if (rendered && pages.length > 0 && Number.isSafeInteger(page_rows) && page_rows > 0) {
    const r1 = body.r0 - PAGE_FILTER_GAP_ROWS - 1;
    if (r1 >= 0 && Number.isSafeInteger(page_columns) && page_columns > 0) {
      output.push({
        r0: Math.max(0, r1 - page_rows + 1),
        c0: body.c0,
        r1,
        c1: body.c0 + PAGE_FILTER_COLUMN_WIDTH * page_columns - PAGE_FILTER_SEPARATOR - 1,
      });
    }
  }

  const row_grand_totals = xmlAttribute(table, "rowGrandTotals");
  const col_grand_totals = xmlAttribute(table, "colGrandTotals");
  return {
    pivot: {
      id: "",
      name,
      source,
      anchor: { row: body.r0, col: body.c0 },
      rows,
      columns,
      values,
      ...(filters.length > 0 ? { filters } : {}),
      ...(sort.length > 0 ? { sort } : {}),
      // OOXML colGrandTotals is the bottom total row; rowGrandTotals the right total column.
      ...(col_grand_totals !== undefined && !xmlBoolean(col_grand_totals)
        ? { rowTotals: false }
        : {}),
      ...(row_grand_totals !== undefined && !xmlBoolean(row_grand_totals)
        ? { columnTotals: false }
        : {}),
      ...(hidden_subtotals > 0 ? { subtotals: false } : {}),
      ...(tabular_rows > 0 ? { layout: "tabular" as const } : {}),
    },
    body,
    output,
  };
}

/** Parse a pivot part, or return undefined when it is missing or malformed. */
async function read_pivot_xml(
  package_file: OpcPackage,
  part: string,
  root: string,
  context: XlsxCodecContext,
): Promise<XmlElement | undefined> {
  if (!package_file.archive.has(part)) return undefined;
  let parsed: XmlElement;
  try {
    parsed = parseXml(await package_file.readBytes(part), part, context);
  } catch (error) {
    // A malformed pivot part only stops that pivot from being modelled; the
    // caller reports it. Resource limits and aborts still fail the import.
    if (error instanceof TypeError && !isAbort(context, error)) return undefined;
    throw error;
  }
  return xmlLocalName(parsed.name) === root ? parsed : undefined;
}

function drop_output_cells(sheet: SheetSnapshot, rects: readonly CellRect[]): void {
  for (const block of sheet.cells) {
    block.cells = block.cells.filter((cell) => {
      const row = block.startRow + cell.rowOffset;
      const col = block.startCol + cell.colOffset;
      return !rects.some(
        (rect) => row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1,
      );
    });
  }
}

/**
 * The literal values the producing application rendered in `body`, row-major,
 * as `savedOutput`. Undefined when the body holds no value (a one-cell
 * location that only names the anchor) or more cells than a pivot may hold.
 */
function rendered_output(
  sheet: SheetSnapshot,
  body: CellRect,
): PivotDefinition["savedOutput"] | undefined {
  const rows = body.r1 - body.r0 + 1;
  const cols = body.c1 - body.c0 + 1;
  if (rows * cols > MAX_SAVED_OUTPUT_CELLS) return undefined;

  let cells: CellScalar[] | undefined;
  for (const block of sheet.cells) {
    for (const cell of block.cells) {
      const row = block.startRow + cell.rowOffset;
      const col = block.startCol + cell.colOffset;
      if (row < body.r0 || row > body.r1 || col < body.c0 || col > body.c1) continue;
      if (cell.value.kind !== "literal" || cell.value.value === null) continue;
      cells ??= Array.from({ length: rows * cols }, (): CellScalar => null);
      cells[(row - body.r0) * cols + col - body.c0] = cell.value.value;
    }
  }
  return cells ? { rows, cols, cells } : undefined;
}

function source_exists(snapshot: WorkbookSnapshot, pivot: PivotDefinition): boolean {
  const source = pivot.source;
  if ("model" in source) {
    return snapshot.sheets.some((sheet) =>
      sheet.tables?.some((table) => table.id === source.model.table),
    );
  }
  if ("table" in source) {
    return snapshot.sheets.some((sheet) =>
      sheet.tables?.some((table) => table.id === source.table),
    );
  }
  return snapshot.sheets.some((sheet) => sheet.id === source.range.sheet);
}

/** What the reader knows about the imported workbook when it maps pivots. */
export interface PivotReadInput {
  readonly snapshot: WorkbookSnapshot;
  /** `sheetParts[i]` is the worksheet part of `snapshot.sheets[i]`. */
  readonly sheetParts: readonly string[];
  readonly metadata: WorkbookSnapshot | null;
  /** Grows a sheet so a reference past its last cell stays inside it. */
  extendSheet(sheet: SheetSnapshot, row: number, col: number): void;
  /** The format code of a `numFmtId` in `styles.xml`, or undefined for General. */
  numberFormat(numFmtId: number): string | undefined;
}

/**
 * Map the native pivot tables of each sheet onto `sheet.pivots` and return the
 * pivot parts the snapshot now models, which opaque preservation must skip.
 * Sidecar metadata restores ids, and pivots the writer could not emit natively.
 */
export async function readPivots(
  packageFile: OpcPackage,
  { snapshot, sheetParts, metadata, extendSheet, numberFormat }: PivotReadInput,
  context: XlsxCodecContext,
): Promise<ReadonlySet<string>> {
  const modelled = new Set<string>();
  const caches = new Map<string, XmlElement | undefined>();
  const cache_users = new Map<string, { tables: number; modelled: number }>();
  const used_ids = new Set<string>();

  for (const [order, sheet] of snapshot.sheets.entries()) {
    const sheet_part = sheetParts[order];
    const meta_pivots =
      metadata?.sheets.find((candidate) => candidate.id === sheet.id)?.pivots ?? [];
    if (sheet_part === undefined) continue;
    const matched = new Set<PivotDefinition>();
    const pivots: PivotDefinition[] = [];
    const output: CellRect[] = [];

    for (const relationship of packageFile.relationships(sheet_part)) {
      if (relationship.external || !relationshipTypeMatches(relationship.type, "pivotTable")) {
        continue;
      }
      checkAbort(context);
      const table_part = relationship.target;
      const cache_part = packageFile
        .relationships(table_part)
        .find(
          (candidate) =>
            !candidate.external && relationshipTypeMatches(candidate.type, "pivotCacheDefinition"),
        )?.target;
      let read: ReadPivot | string = "its pivot cache is missing";
      if (cache_part !== undefined) {
        const users = cache_users.get(cache_part) ?? { tables: 0, modelled: 0 };
        users.tables += 1;
        cache_users.set(cache_part, users);
        if (!caches.has(cache_part)) {
          caches.set(
            cache_part,
            await read_pivot_xml(packageFile, cache_part, "pivotCacheDefinition", context),
          );
        }
        const cache = caches.get(cache_part);
        const table = await read_pivot_xml(
          packageFile,
          table_part,
          "pivotTableDefinition",
          context,
        );
        read =
          table && cache
            ? pivot_from_xml(table, cache, snapshot, numberFormat)
            : "its XML could not be read";
        if (typeof read !== "string") users.modelled += 1;
      }
      if (typeof read === "string") {
        emitWarning(context, {
          code: "unsupported-feature",
          message: `Pivot table ${table_part} was not imported as a pivot definition because ${read}; it is kept as an opaque part until an edit changes cell values`,
          sheet: sheet.name,
          part: table_part,
        });
        continue;
      }
      modelled.add(table_part);
      const meta = meta_pivots.find(
        (candidate) => !matched.has(candidate) && candidate.name === read.pivot.name,
      );
      if (meta) matched.add(meta);
      // The writer keeps saved output in metadata only when a source blocked
      // it; the native location then names just the anchor. A larger location
      // means another application rendered fresh output, which wins.
      const is_anchor_only = read.body.r0 === read.body.r1 && read.body.c0 === read.body.c1;
      const kept_output = is_anchor_only ? meta?.savedOutput : undefined;
      const saved_output = kept_output ?? rendered_output(sheet, read.body);
      if (saved_output) {
        extendSheet(
          sheet,
          read.pivot.anchor.row + saved_output.rows - 1,
          read.pivot.anchor.col + saved_output.cols - 1,
        );
      }
      pivots.push({
        ...read.pivot,
        id: meta?.id ?? `xlsx-pivot-${order + 1}-${pivots.length + 1}`,
        ...(saved_output ? { savedOutput: saved_output } : {}),
      });
      // Kept output is blocked by the anchor cell, which is user data.
      if (!kept_output) output.push(...read.output);
    }

    // A natively writable pivot missing from the file was deleted in another
    // application; only pivots the writer kept in metadata come back from it.
    for (const meta of meta_pivots) {
      if (matched.has(meta) || native_write_blocker(snapshot, meta, context) === undefined)
        continue;
      const restored = structuredClone(meta);
      if (!source_exists(snapshot, restored))
        restored.source = { ...restored.source, invalid: true };
      pivots.push(restored);
    }

    for (const pivot of pivots) {
      let id = pivot.id;
      for (let suffix = 2; used_ids.has(id); suffix++) id = `${pivot.id}-${suffix}`;
      pivot.id = id;
      used_ids.add(id);

      // Validation requires the anchor and a live range source inside their sheets.
      extendSheet(sheet, pivot.anchor.row, pivot.anchor.col);
      const source = pivot.source;
      if ("range" in source && !source.invalid) {
        const source_sheet = snapshot.sheets.find(
          (candidate) => candidate.id === source.range.sheet,
        );
        if (source_sheet) extendSheet(source_sheet, source.range.end.row, source.range.end.col);
      }
    }
    if (pivots.length > 0) sheet.pivots = pivots;
    if (output.length > 0) drop_output_cells(sheet, output);
  }

  // A cache stays opaque while any pivot table that shares it stays opaque.
  for (const [cache_part, users] of cache_users) {
    if (users.modelled === users.tables) modelled.add(cache_part);
  }
  return modelled;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

interface WriteSource {
  readonly sheet: SheetSnapshot;
  /** Header row of a range source; table sources name fields by their columns. */
  readonly headerRow: number | undefined;
  readonly tableColumns: readonly string[] | undefined;
  readonly firstRow: number;
  readonly lastRow: number;
  readonly firstCol: number;
  readonly width: number;
  /** Attributes of `<worksheetSource>`. */
  readonly reference: string;
}

function resolve_write_source(
  snapshot: WorkbookSnapshot,
  pivot: PivotDefinition,
): WriteSource | string {
  const source = pivot.source;
  if (source.invalid) return "its source was deleted";
  if ("model" in source) return "a model pivot needs an Excel data-model binary";
  if ("table" in source) {
    for (const sheet of snapshot.sheets) {
      const table = sheet.tables?.find((candidate) => candidate.id === source.table);
      if (!table) continue;
      return {
        sheet,
        headerRow: undefined,
        tableColumns: table.columns.map((column) => column.name),
        firstRow: table.range.start.row + (table.headerRow ? 1 : 0),
        lastRow: table.range.end.row - (table.totalsRow ? 1 : 0),
        firstCol: table.range.start.col,
        width: table.columns.length,
        reference: `name="${escapeXml(encodeXstring(table.name))}"`,
      };
    }
    return "its source table is missing";
  }
  const { range } = source;
  const sheet = snapshot.sheets.find((candidate) => candidate.id === range.sheet);
  if (!sheet) return "its source sheet is missing";
  const rect = {
    r0: Math.min(range.start.row, range.end.row),
    c0: Math.min(range.start.col, range.end.col),
    r1: Math.max(range.start.row, range.end.row),
    c1: Math.max(range.start.col, range.end.col),
  };
  return {
    sheet,
    headerRow: rect.r0,
    tableColumns: undefined,
    firstRow: rect.r0 + 1,
    lastRow: rect.r1,
    firstCol: rect.c0,
    width: rect.c1 - rect.c0 + 1,
    reference: `ref="${rectA1(rect)}" sheet="${escapeXml(encodeXstring(sheet.name))}"`,
  };
}

/** Why the definition alone has no OOXML form, or undefined. */
function definition_blocker(pivot: PivotDefinition, width: number): string | undefined {
  const values = implicit_values(pivot);
  const fields = [
    ...pivot.rows,
    ...pivot.columns,
    ...values.map((value) => value.field),
    ...(pivot.filters ?? []).map((filter) => filter.field),
    ...(pivot.sort ?? []).map((sort) => sort.field),
  ];
  if (fields.some((field) => !Number.isInteger(field) || field < 0 || field >= width)) {
    return "it names a field outside its source";
  }
  const axis_fields = [...pivot.rows, ...pivot.columns];
  if (new Set(axis_fields).size !== axis_fields.length) {
    return "it uses one field more than once on its axes";
  }
  if (values.some((value) => !SUBTOTAL_BY_AGGREGATION.has(value.aggregation))) {
    return "Excel pivot caches have no distinct count";
  }
  if (pivot.filters?.some((filter) => filter.values.length === 0)) {
    return "it filters out every value";
  }
  return undefined;
}

/** Value fields that aggregate a source field; measures have no pivot-cache form. */
function implicit_values(pivot: PivotDefinition) {
  return pivot.values.filter((value) => "field" in value);
}

/** Type and item statistics of one source field's data cells. */
class FieldStats {
  hasString = false;
  hasNumber = false;
  hasBoolean = false;
  hasBlank = false;
  hasFormula = false;
  hasLongText = false;
  isInteger = true;
  min = Number.POSITIVE_INFINITY;
  max = Number.NEGATIVE_INFINITY;
  /** Non-blank cells, formulas included; fewer than the data rows means blanks. */
  filled = 0;
  /** Distinct values in first-seen order, kept only for axis and filter fields. */
  readonly items: CellScalar[] | undefined;
  readonly #item_index: Map<CellScalar, number> | undefined;

  constructor(itemized: boolean) {
    this.items = itemized ? [] : undefined;
    this.#item_index = itemized ? new Map() : undefined;
  }

  noteCell(value: CellValue): void {
    if (value.kind !== "literal") {
      this.hasFormula = true;
      this.filled += 1;
      return;
    }
    if (value.value === null) return;
    this.filled += 1;
    this.noteValue(value.value);
  }

  noteValue(value: CellScalar): void {
    if (value === null) this.hasBlank = true;
    else if (typeof value === "string") {
      this.hasString = true;
      if (value.length > SHORT_TEXT_LIMIT) this.hasLongText = true;
    } else if (typeof value === "boolean") this.hasBoolean = true;
    else {
      this.hasNumber = true;
      if (!Number.isInteger(value)) this.isInteger = false;
      this.min = Math.min(this.min, value);
      this.max = Math.max(this.max, value);
    }
    if (this.#item_index && this.items && !this.#item_index.has(value)) {
      this.#item_index.set(value, this.items.length);
      this.items.push(value);
    }
  }

  /** `CT_SharedItems` attributes; each default is written only when it is false. */
  attributes(): string {
    const kinds = Number(this.hasString) + Number(this.hasNumber) + Number(this.hasBoolean);
    const attributes: string[] = [];
    if (!this.hasString && !this.hasBlank && !this.hasBoolean && !this.hasFormula) {
      attributes.push('containsSemiMixedTypes="0"');
    }
    if (!this.hasString && !this.hasFormula) attributes.push('containsString="0"');
    if (this.hasBlank) attributes.push('containsBlank="1"');
    if (kinds > 1) attributes.push('containsMixedTypes="1"');
    if (this.hasNumber) {
      attributes.push('containsNumber="1"');
      if (this.isInteger) attributes.push('containsInteger="1"');
      attributes.push(`minValue="${this.min}" maxValue="${this.max}"`);
    }
    if (this.hasLongText) attributes.push('longText="1"');
    return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
  }
}

interface WritePlan {
  readonly owner: SheetSnapshot;
  readonly pivot: PivotDefinition;
  readonly source: WriteSource;
  readonly headers: (CellValue | undefined)[];
  readonly fields: FieldStats[];
}

function new_plan(
  owner: SheetSnapshot,
  pivot: PivotDefinition,
  source: WriteSource,
  with_fields: boolean,
): WritePlan {
  const itemized = new Set([
    ...pivot.rows,
    ...pivot.columns,
    ...(pivot.filters ?? []).map((filter) => filter.field),
  ]);
  return {
    owner,
    pivot,
    source,
    headers: [],
    fields: with_fields
      ? Array.from({ length: source.width }, (_, field) => new FieldStats(itemized.has(field)))
      : [],
  };
}

/**
 * Read every plan's header and data cells in one pass over each source sheet.
 * Blocks outside every source are skipped, so the cost is the source cells
 * plus one bounds check per other block.
 */
function scan_sources(plans: readonly WritePlan[], context: XlsxCodecContext): void {
  const by_sheet = new Map<SheetSnapshot, WritePlan[]>();
  for (const plan of plans) {
    const sheet_plans = by_sheet.get(plan.source.sheet) ?? [];
    sheet_plans.push(plan);
    by_sheet.set(plan.source.sheet, sheet_plans);
  }
  for (const [sheet, sheet_plans] of by_sheet) {
    for (const block of sheet.cells) {
      checkAbort(context);
      const touching = sheet_plans.filter(
        ({ source }) =>
          block.startRow <= source.lastRow &&
          block.startRow + block.rowCount > (source.headerRow ?? source.firstRow) &&
          block.startCol < source.firstCol + source.width &&
          block.startCol + block.colCount > source.firstCol,
      );
      if (touching.length === 0) continue;
      for (const cell of block.cells) {
        const row = block.startRow + cell.rowOffset;
        const col = block.startCol + cell.colOffset;
        for (const { source, headers, fields } of touching) {
          const field = col - source.firstCol;
          if (field < 0 || field >= source.width) continue;
          if (row === source.headerRow) headers[field] = cell.value;
          else if (row >= source.firstRow && row <= source.lastRow)
            fields[field]?.noteCell(cell.value);
        }
      }
    }
  }
}

/** Cache field names, or why the source header row cannot name the fields. */
function field_names(plan: WritePlan): string[] | string {
  const { source, headers } = plan;
  let names: string[];
  if (source.tableColumns) names = [...source.tableColumns];
  else {
    names = [];
    for (let field = 0; field < source.width; field++) {
      const header = headers[field];
      if (header === undefined || (header.kind === "literal" && header.value === null)) {
        return "its source header row has a blank cell";
      }
      if (header.kind !== "literal") return "its source header row has a formula";
      const value = header.value;
      names.push(typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value));
    }
  }
  if (names.some((name) => name.length === 0)) return "its source header row has a blank cell";

  // Excel numbers repeated headers ("Region", "Region2") to keep cache field names unique.
  const seen = new Set<string>();
  return names.map((header) => {
    let name = header;
    for (let suffix = 2; seen.has(name_key(name)); suffix++) name = `${header}${suffix}`;
    seen.add(name_key(name));
    return name;
  });
}

/** Why `pivot` cannot be written as native OOXML, or undefined when it can. */
function native_write_blocker(
  snapshot: WorkbookSnapshot,
  pivot: PivotDefinition,
  context: XlsxCodecContext,
): string | undefined {
  const source = resolve_write_source(snapshot, pivot);
  if (typeof source === "string") return source;
  const blocker = definition_blocker(pivot, source.width);
  if (blocker !== undefined) return blocker;
  const plan = new_plan(source.sheet, pivot, source, false);
  scan_sources([plan], context);
  const names = field_names(plan);
  return typeof names === "string" ? names : undefined;
}

function shared_item_xml(value: CellScalar): string {
  if (value === null) return "<m/>";
  if (typeof value === "string") return `<s v="${escapeXml(encodeXstring(value))}"/>`;
  if (typeof value === "boolean") return `<b v="${value ? 1 : 0}"/>`;
  return `<n v="${value}"/>`;
}

function cache_definition_xml(
  plan: WritePlan,
  names: readonly string[],
  context: XlsxCodecContext,
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  // saveData="0" declares that no records part exists; refreshOnLoad makes
  // the reading application rebuild the cache and the output from the source.
  xml.append(
    `<pivotCacheDefinition xmlns="${MAIN_NS}" saveData="0" refreshOnLoad="1" createdVersion="${PIVOT_FORMAT_VERSION}" refreshedVersion="${PIVOT_FORMAT_VERSION}" minRefreshableVersion="${PIVOT_FORMAT_VERSION}">`,
  );
  xml.append(
    `<cacheSource type="worksheet"><worksheetSource ${plan.source.reference}/></cacheSource>`,
  );
  xml.append(`<cacheFields count="${names.length}">`);
  for (const [field, name] of names.entries()) {
    const stats = plan.fields[field];
    xml.append(`<cacheField name="${escapeXml(encodeXstring(name))}" numFmtId="0">`);
    if (stats?.items) {
      xml.append(`<sharedItems${stats.attributes()} count="${stats.items.length}">`);
      for (const value of stats.items) xml.append(shared_item_xml(value));
      xml.append("</sharedItems>");
    } else xml.append(`<sharedItems${stats?.attributes() ?? ""}/>`);
    xml.append("</cacheField>");
  }
  xml.append("</cacheFields></pivotCacheDefinition>");
  return xml.finish();
}

/**
 * The rectangle that `pivot.savedOutput` fills, when the writer can store
 * those values as the pivot's rendered cells: inside the sheet, with no other
 * cell in it. A cell there is a user value that blocks the output, and it
 * must survive the save.
 */
function saved_output_rect(sheet: SheetSnapshot, pivot: PivotDefinition): CellRect | undefined {
  const saved = pivot.savedOutput;
  if (!saved) return undefined;
  const rect = {
    r0: pivot.anchor.row,
    c0: pivot.anchor.col,
    r1: pivot.anchor.row + saved.rows - 1,
    c1: pivot.anchor.col + saved.cols - 1,
  };
  if (rect.r1 >= sheet.rowCount || rect.c1 >= sheet.columns.length) return undefined;

  for (const block of sheet.cells) {
    if (
      block.startRow > rect.r1 ||
      block.startRow + block.rowCount <= rect.r0 ||
      block.startCol > rect.c1 ||
      block.startCol + block.colCount <= rect.c0
    ) {
      continue;
    }
    for (const cell of block.cells) {
      const row = block.startRow + cell.rowOffset;
      const col = block.startCol + cell.colOffset;
      if (row >= rect.r0 && row <= rect.r1 && col >= rect.c0 && col <= rect.c1) return undefined;
    }
  }
  return rect;
}

/** The saved output as one cell block; blank values write no cell. */
function saved_output_block(
  saved: NonNullable<PivotDefinition["savedOutput"]>,
  rect: CellRect,
): CellBlock {
  const cells: SnapshotCell[] = [];
  saved.cells.forEach((value, offset) => {
    if (value === null) return;
    cells.push({
      rowOffset: Math.floor(offset / saved.cols),
      colOffset: offset % saved.cols,
      value: { kind: "literal", value },
    });
  });
  return {
    startRow: rect.r0,
    startCol: rect.c0,
    rowCount: saved.rows,
    colCount: saved.cols,
    cells,
  };
}

function pivot_table_xml(
  plan: WritePlan,
  cache_id: number,
  saved_rect: CellRect | undefined,
  styles: StylesRegistry,
  context: XlsxCodecContext,
): Uint8Array {
  const { pivot } = plan;
  const tabular = pivot.layout === "tabular";
  const subtotals = pivot.subtotals !== false;
  const rows = new Set(pivot.rows);
  const columns = new Set(pivot.columns);
  const data_fields = implicit_values(pivot);
  const values = new Set(data_fields.map((value) => value.field));
  const filters = new Map((pivot.filters ?? []).map((filter) => [filter.field, filter]));
  const pages = [...filters.keys()].filter((field) => !rows.has(field) && !columns.has(field));
  const page_set = new Set(pages);
  const descending = new Set(
    (pivot.sort ?? [])
      .filter((sort) => sort.descending && (sort.axis === "rows" ? rows : columns).has(sort.field))
      .map((sort) => sort.field),
  );

  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(
    `<pivotTableDefinition xmlns="${MAIN_NS}" name="${escapeXml(encodeXstring(pivot.name))}" cacheId="${cache_id}" dataCaption="Values" createdVersion="${PIVOT_FORMAT_VERSION}" updatedVersion="${PIVOT_FORMAT_VERSION}" minRefreshableVersion="${PIVOT_FORMAT_VERSION}" useAutoFormatting="1" itemPrintTitles="1" indent="0" outline="1" outlineData="1"${tabular ? ' compact="0" compactData="0"' : ""}${pivot.columnTotals === false ? ' rowGrandTotals="0"' : ""}${pivot.rowTotals === false ? ' colGrandTotals="0"' : ""}>`,
  );
  // Saved output is written as the rendered cells, so the location covers
  // them; otherwise a one-cell location, and the reading application lays the
  // output out on refresh.
  const anchor = saved_rect ? rectA1(saved_rect) : cellA1(pivot.anchor.row, pivot.anchor.col);
  xml.append(
    `<location ref="${anchor}" firstHeaderRow="1" firstDataRow="1" firstDataCol="1"${pages.length > 0 ? ` rowPageCount="${pages.length}" colPageCount="1"` : ""}/>`,
  );

  xml.append(`<pivotFields count="${plan.source.width}">`);
  for (let field = 0; field < plan.source.width; field++) {
    const on_axis = rows.has(field) || columns.has(field);
    const axis = rows.has(field)
      ? ' axis="axisRow"'
      : columns.has(field)
        ? ' axis="axisCol"'
        : page_set.has(field)
          ? ' axis="axisPage"'
          : "";
    const filter = filters.get(field);
    const attributes = [
      axis,
      values.has(field) ? ' dataField="1"' : "",
      tabular ? ' compact="0" outline="0"' : "",
      page_set.has(field) && filter ? ' multipleItemSelectionAllowed="1"' : "",
      ' showAll="0"',
      on_axis ? ` sortType="${descending.has(field) ? "descending" : "ascending"}"` : "",
      on_axis && !subtotals ? ' defaultSubtotal="0"' : "",
    ].join("");
    const items = axis ? plan.fields[field]?.items : undefined;
    if (!items) {
      xml.append(`<pivotField${attributes}/>`);
      continue;
    }
    const keep = filter ? new Set(filter.values) : undefined;
    const order = items.map((_, index) => index);
    order.sort((left, right) => compare_scalars(items[left] ?? null, items[right] ?? null));
    const with_default = subtotals || page_set.has(field);
    xml.append(`<pivotField${attributes}><items count="${items.length + Number(with_default)}">`);
    for (const index of order) {
      const hidden = keep !== undefined && !keep.has(items[index] ?? null);
      xml.append(`<item x="${index}"${hidden ? ' h="1"' : ""}/>`);
    }
    if (with_default) xml.append('<item t="default"/>');
    xml.append("</items></pivotField>");
  }
  xml.append("</pivotFields>");

  if (pivot.rows.length > 0) {
    xml.append(`<rowFields count="${pivot.rows.length}">`);
    for (const field of pivot.rows) xml.append(`<field x="${field}"/>`);
    xml.append("</rowFields>");
  }
  // Several values become one more column field, as Excel's default places them.
  const column_fields = [...pivot.columns, ...(pivot.values.length > 1 ? [VALUES_FIELD] : [])];
  if (column_fields.length > 0) {
    xml.append(`<colFields count="${column_fields.length}">`);
    for (const field of column_fields) xml.append(`<field x="${field}"/>`);
    xml.append("</colFields>");
  }
  if (pages.length > 0) {
    xml.append(`<pageFields count="${pages.length}">`);
    for (const field of pages) xml.append(`<pageField fld="${field}" hier="-1"/>`);
    xml.append("</pageFields>");
  }
  if (data_fields.length > 0) {
    xml.append(`<dataFields count="${data_fields.length}">`);
    for (const value of data_fields) {
      const subtotal = SUBTOTAL_BY_AGGREGATION.get(value.aggregation) ?? "sum";
      xml.append(
        `<dataField${value.name !== undefined ? ` name="${escapeXml(encodeXstring(value.name))}"` : ""} fld="${value.field}"${subtotal === "sum" ? "" : ` subtotal="${subtotal}"`} baseField="0" baseItem="0"${value.numberFormat ? ` numFmtId="${styles.numberFormatId(value.numberFormat)}"` : ""}/>`,
      );
    }
    xml.append("</dataFields>");
  }
  xml.append(
    '<pivotTableStyleInfo name="PivotStyleLight16" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>',
  );
  xml.append("</pivotTableDefinition>");
  return xml.finish();
}

interface Relationship {
  readonly type: string;
  readonly target: string;
}

/** Native pivot parts of one save, and the places that must reference them. */
export interface PivotWrite {
  /** Pivot table relationships of a worksheet; pivots have no worksheet element. */
  sheetRelationships(sheetId: string): readonly Relationship[];
  readonly workbookRelationships: readonly Relationship[];
  /** `<pivotCache>` elements for the workbook relationship ids of `workbookRelationships`. */
  pivotCaches(ids: readonly string[]): string[];
  readonly overrides: readonly ContentTypeOverride[];
  readonly parts: readonly ZipPart[];
  /**
   * `sheet` with the saved output of its native pivots added as their
   * rendered cells, so applications that do not refresh still show values.
   */
  withSavedOutput(sheet: SheetSnapshot): SheetSnapshot;
  /**
   * Ids of the pivots written as native parts with their rendered cells. The
   * reader takes their saved output from those cells, so metadata need not
   * repeat it. A pivot whose saved output a cell blocks is native too, but
   * is not listed: metadata keeps its saved output.
   */
  readonly nativeIds: ReadonlySet<string>;
}

/**
 * Build the native parts of every writable pivot. Returns undefined without
 * pivots, so a workbook without pivots pays one check per sheet. Each pivot
 * reads its source cells once to name its fields and list their items.
 */
export function preparePivots(
  snapshot: WorkbookSnapshot,
  ordered: readonly SheetSnapshot[],
  styles: StylesRegistry,
  context: XlsxCodecContext,
): PivotWrite | undefined {
  if (!ordered.some((sheet) => (sheet.pivots?.length ?? 0) > 0)) return undefined;

  const plans: WritePlan[] = [];
  const keep_in_metadata = (sheet: SheetSnapshot, pivot: PivotDefinition, reason: string) => {
    emitWarning(context, {
      code: "unsupported-feature",
      message: `Pivot table ${pivot.name} was not written as a native pivot because ${reason}; it remains in Sheetwrite metadata`,
      sheet: sheet.name,
    });
  };
  for (const sheet of ordered) {
    for (const pivot of sheet.pivots ?? []) {
      const source = resolve_write_source(snapshot, pivot);
      const blocker = typeof source === "string" ? source : definition_blocker(pivot, source.width);
      if (blocker !== undefined || typeof source === "string") {
        keep_in_metadata(sheet, pivot, blocker ?? "its source is missing");
        continue;
      }
      plans.push(new_plan(sheet, pivot, source, true));
    }
  }
  scan_sources(plans, context);

  // Preserved opaque pivots keep their part names and cache ids; new ones avoid them.
  const taken_parts = new Set(
    (snapshot.workbook.xlsxSource?.parts ?? []).map((part) => part.name.toLowerCase()),
  );
  const taken_cache_ids = new Set(
    (snapshot.workbook.xlsxSource?.graphs ?? []).map((graph) => graph.cacheId),
  );
  let table_number = 0;
  let cache_number = 0;
  let cache_id = 0;
  const sheet_relationships = new Map<string, Relationship[]>();
  const workbook_relationships: Relationship[] = [];
  const cache_ids: number[] = [];
  const overrides: ContentTypeOverride[] = [];
  const parts: ZipPart[] = [];
  const saved_blocks = new Map<string, CellBlock[]>();
  const native_ids = new Set<string>();
  for (const plan of plans) {
    checkAbort(context);
    const names = field_names(plan);
    if (typeof names === "string") {
      keep_in_metadata(plan.owner, plan.pivot, names);
      continue;
    }
    for (const filter of plan.pivot.filters ?? []) {
      const stats = plan.fields[filter.field];
      if (!stats) continue;
      // Kept values become items, so the saved filter lists every one of them.
      for (const value of filter.values) stats.noteValue(value);
      if (stats.hasFormula) {
        emitWarning(context, {
          code: "unsupported-feature",
          message: `Pivot table ${plan.pivot.name} filters a field whose source has formulas; Excel shows new formula results that the filter does not list`,
          sheet: plan.owner.name,
        });
      }
    }
    for (const stats of plan.fields) {
      const data_rows = Math.max(0, plan.source.lastRow - plan.source.firstRow + 1);
      if (stats.items && stats.filled < data_rows) stats.noteValue(null);
    }

    do table_number += 1;
    while (taken_parts.has(`xl/pivottables/pivottable${table_number}.xml`));
    do cache_number += 1;
    while (taken_parts.has(`xl/pivotcache/pivotcachedefinition${cache_number}.xml`));
    while (taken_cache_ids.has(String(cache_id))) cache_id += 1;

    const table_part = `xl/pivotTables/pivotTable${table_number}.xml`;
    const cache_part = `xl/pivotCache/pivotCacheDefinition${cache_number}.xml`;
    const saved_rect = saved_output_rect(plan.owner, plan.pivot);
    const saved = plan.pivot.savedOutput;
    if (saved_rect && saved) {
      const blocks = saved_blocks.get(plan.owner.id) ?? [];
      blocks.push(saved_output_block(saved, saved_rect));
      saved_blocks.set(plan.owner.id, blocks);
    }
    if (!saved || saved_rect) native_ids.add(plan.pivot.id);
    parts.push(
      { name: cache_part, data: cache_definition_xml(plan, names, context) },
      { name: table_part, data: pivot_table_xml(plan, cache_id, saved_rect, styles, context) },
      {
        name: `xl/pivotTables/_rels/pivotTable${table_number}.xml.rels`,
        data: relationshipsXml(
          [
            {
              id: "rId1",
              type: PIVOT_CACHE_REL,
              target: `../pivotCache/pivotCacheDefinition${cache_number}.xml`,
            },
          ],
          context,
        ),
      },
    );
    overrides.push(
      { part: cache_part, contentType: PIVOT_CACHE_CONTENT },
      { part: table_part, contentType: PIVOT_TABLE_CONTENT },
    );
    const owned = sheet_relationships.get(plan.owner.id) ?? [];
    owned.push({ type: PIVOT_TABLE_REL, target: `../pivotTables/pivotTable${table_number}.xml` });
    sheet_relationships.set(plan.owner.id, owned);
    workbook_relationships.push({
      type: PIVOT_CACHE_REL,
      target: `pivotCache/pivotCacheDefinition${cache_number}.xml`,
    });
    cache_ids.push(cache_id);
    cache_id += 1;
  }
  if (parts.length === 0) return undefined;

  return {
    sheetRelationships: (sheet_id) => sheet_relationships.get(sheet_id) ?? [],
    workbookRelationships: workbook_relationships,
    pivotCaches: (ids) =>
      cache_ids.map(
        (id, index) => `<pivotCache cacheId="${id}" r:id="${escapeXml(ids[index] ?? "")}"/>`,
      ),
    overrides,
    parts,
    withSavedOutput: (sheet) => {
      const blocks = saved_blocks.get(sheet.id);
      return blocks ? { ...sheet, cells: [...sheet.cells, ...blocks] } : sheet;
    },
    nativeIds: native_ids,
  };
}
