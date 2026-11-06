import type {
  SheetSnapshot,
  WorkbookSnapshot,
  XlsxSourceDependency,
  XlsxSourceGraph,
  XlsxSourcePart,
  XlsxSourceSnapshot,
} from "@sheetwrite/core";
import { XlsxResourceError } from "@sheetwrite/core";
import { inflateSync } from "fflate";

import type { DrawingChart } from "./chart-write.js";
import { CHART_REL, elementXml } from "./chart-xml.js";
import { PACKAGE_RELATIONSHIPS_NS } from "./format.js";
import {
  type OpcPackage,
  type OpcRelationship,
  relationshipSourcePart,
  relationshipsPart,
  relationshipTypeMatches,
  resolveRelationshipTarget,
} from "./opc.js";
import { queriesDigest, queryWarning } from "./query-digest.js";
import { checkAbort, emitWarning, isAbort, type XlsxCodecContext } from "./resources.js";
import type { WorkbookWriteHook } from "./writer.js";
import {
  decodeXstring,
  escapeXml,
  parseXml,
  type XmlElement,
  xmlAttribute,
  xmlChild,
  xmlChildren,
  xmlLocalName,
} from "./xml.js";
import {
  asciiFold,
  markStoredEntryVerified,
  storedEntryFromBytes,
  type StoredZipEntry,
  validateStoredEntry,
} from "./zip.js";

/*
 * Preservation contract (documented in docs/src/content/docs/import-export/kept-parts-and-round-trips.md):
 * - Parts Sheetwrite does not model are kept as their original compressed ZIP
 *   payloads and written back byte-for-byte; nothing is inflated or recompressed.
 *   One exception: a drawing that also holds modelled charts is kept without
 *   their anchors (chart-read.ts), and export adds Sheetwrite charts to a
 *   kept drawing, because a worksheet has only one drawing.
 * - VBA, customXml and themes do not read cells and survive every edit.
 * - Images (drawings without charts) follow their sheet's row/column layout.
 * - Charts and pivots read cell values, so any edit to any sheet drops them.
 *   Charts and pivots the reader maps to definitions (chart-read.ts,
 *   pivot.ts) are not retained here.
 * - Parts that point into worksheets, tables, styles or the workbook part,
 *   whose bytes Sheetwrite rewrites, are dropped with a warning.
 */

type RootOwner = XlsxSourceGraph["owner"];

interface GraphRoot {
  readonly owner: RootOwner;
  readonly sheetId?: string;
  readonly relationship: OpcRelationship;
  readonly cacheId?: string;
}

/** Relationship kinds (the last segment of the OPC type URI) whose part graphs are retained. */
const RETAINED_KINDS: Readonly<Record<XlsxSourceGraph["owner"], ReadonlySet<string>>> = {
  root: new Set(["customXml", "core-properties", "custom-properties"]),
  workbook: new Set([
    "vbaProject",
    "customXml",
    "xmlMaps",
    "connections",
    "pivotCacheDefinition",
    "theme",
  ]),
  // Pivot tables have no element in the worksheet XML; Excel finds them through relationships.
  sheet: new Set(["drawing", "pivotTable", "tableSingleCells"]),
};

/** Whether an internal relationship from `owner` starts a graph this module keeps on save. */
export function isRetainedRelationship(owner: XlsxSourceGraph["owner"], type: string): boolean {
  return RETAINED_KINDS[owner].has(relationship_kind(type));
}

const MACRO_WORKBOOK_CONTENT = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";
const RELATIONSHIPS_CONTENT = "application/vnd.openxmlformats-package.relationships+xml";
/** The writer owns these names; a retained part with one of them would collide or go stale. */
const REWRITTEN_PART =
  /^(?:\[content_types\]\.xml|_rels\/\.rels|xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/styles\.xml|xl\/sharedstrings\.xml|xl\/worksheets\/|xl\/tables\/table\d+\.xml|xl\/comments\d*\.xml|xl\/drawings\/vmldrawing\d*\.vml|xl\/drawings\/_rels\/vmldrawing)/i;
const CHART_CONTENT = /drawingml\.chart/i;
/** Below the engine's argument-count limit for `String.fromCharCode(...chunk)`. */
const BASE64_CHUNK_BYTES = 24 * 1024;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SECOND_LANE_SEED = 0x9e3779b9;
const HEX_DIGITS_PER_LANE = 8;
const HEX_RADIX = 16;

/** Frozen parts whose payload CRC and size passed verification in this process. */
const verified_parts = new WeakSet<XlsxSourcePart>();
const relationship_target_cache = new WeakMap<XlsxSourcePart, readonly string[]>();

function relationship_kind(type: string): string {
  return type.slice(type.lastIndexOf("/") + 1);
}

function encode_base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES))));
  }
  return chunks.join("");
}

function decode_base64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Reused per digest so hashing a number allocates nothing. */
const number_scratch = new Float64Array(1);
const number_words = new Uint32Array(number_scratch.buffer);

/**
 * Order-independent 64-bit fingerprint of a sheet's shape and source values.
 * Each cell is hashed with two FNV-1a lanes and the lanes are summed, so block
 * and cell order do not matter and nothing is sorted or serialized. It guards
 * against stale charts in snapshots edited outside a Store, not against
 * deliberate collisions: whoever can craft a collision can also edit the parts.
 */
function sheet_digest(sheet: SheetSnapshot, scope: "layout" | "values" = "values"): string {
  let low = Math.imul(FNV_OFFSET ^ sheet.rowCount, FNV_PRIME) >>> 0;
  let high = Math.imul(SECOND_LANE_SEED ^ sheet.columns.length, FNV_PRIME) >>> 0;
  const shape = JSON.stringify([
    sheet.columns.map((column) => [column.header, column.width, column.visible]),
    sheet.rowMeta,
    sheet.merges,
  ]);
  for (let index = 0; index < shape.length; index++) {
    low = Math.imul(low ^ shape.charCodeAt(index), FNV_PRIME) >>> 0;
    high = Math.imul(high ^ shape.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  let first = FNV_OFFSET;
  let second = SECOND_LANE_SEED;
  const mix = (word: number): void => {
    first = Math.imul(first ^ word, FNV_PRIME);
    second = Math.imul(second ^ word, FNV_PRIME) ^ (second >>> 15);
  };
  for (const block of scope === "values" ? sheet.cells : []) {
    for (const cell of block.cells) {
      const value = cell.value;
      if (value.kind === "literal" && value.value === null) continue;
      first = FNV_OFFSET;
      second = SECOND_LANE_SEED;
      mix(block.startRow + cell.rowOffset);
      mix(block.startCol + cell.colOffset);
      let text: string | undefined;
      if (value.kind === "formula") text = value.src;
      else if (value.kind === "ref") {
        text = value.target.sheet;
        mix(value.target.row);
        mix(value.target.col);
      } else if (typeof value.value === "string") text = value.value;
      else if (typeof value.value === "number") {
        number_scratch[0] = value.value;
        mix(number_words[0] ?? 0);
        mix(number_words[1] ?? 0);
      } else mix(value.value ? 2 : 3);
      // Kind length is not a tag: "literal" and "formula" have the same length.
      const tag =
        value.kind === "formula"
          ? 1
          : value.kind === "ref"
            ? 2
            : typeof value.value === "string"
              ? 3
              : typeof value.value === "number"
                ? 4
                : 5;
      mix(tag);
      if (text !== undefined) {
        mix(text.length);
        for (let index = 0; index < text.length; index++) mix(text.charCodeAt(index));
      }
      low = (low + (first >>> 0)) >>> 0;
      high = (high + (second >>> 0)) >>> 0;
    }
  }
  return (
    high.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_LANE, "0") +
    low.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_LANE, "0")
  );
}

function drop_warning(context: XlsxCodecContext, part: string, reason: string): void {
  emitWarning(context, {
    code: "unsupported-feature",
    message: `Preserved XLSX part graph ${part} was dropped: ${reason}`,
    part,
  });
}

function graph_roots(
  package_file: OpcPackage,
  workbook_part: string,
  workbook_xml: Uint8Array,
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
): GraphRoot[] {
  const roots: GraphRoot[] = [];
  for (const relationship of package_file.relationships("")) {
    if (!relationship.external && isRetainedRelationship("root", relationship.type)) {
      roots.push({ owner: "root", relationship });
    }
  }

  const workbook_root = parseXml(workbook_xml, workbook_part, context);
  const pivot_caches = xmlChildren(
    xmlChild(workbook_root, "pivotCaches") ?? workbook_root,
    "pivotCache",
  );
  for (const relationship of package_file.relationships(workbook_part)) {
    const kind = relationship_kind(relationship.type);
    if (relationship.external || !isRetainedRelationship("workbook", relationship.type)) continue;
    if (kind !== "pivotCacheDefinition") {
      roots.push({ owner: "workbook", relationship });
      continue;
    }
    const cache_id = xmlAttribute(
      pivot_caches.find((cache) => xmlAttribute(cache, "id") === relationship.id) ?? workbook_root,
      "cacheId",
    );
    if (cache_id === undefined || !/^\d{1,10}$/.test(cache_id)) {
      drop_warning(context, relationship.target, "its pivot cache id is missing");
    } else roots.push({ owner: "workbook", relationship, cacheId: cache_id });
  }

  const sheets_by_name = new Map(snapshot.sheets.map((sheet) => [sheet.name, sheet.id]));
  for (const declaration of xmlChildren(
    xmlChild(workbook_root, "sheets") ?? workbook_root,
    "sheet",
  )) {
    const sheet_id = sheets_by_name.get(decodeXstring(xmlAttribute(declaration, "name") ?? ""));
    const relationship_id = xmlAttribute(declaration, "id");
    if (sheet_id === undefined || relationship_id === undefined) continue;
    const sheet_part = package_file.relationship(workbook_part, relationship_id).target;
    for (const relationship of package_file.relationships(sheet_part)) {
      if (!relationship.external && isRetainedRelationship("sheet", relationship.type)) {
        roots.push({ owner: "sheet", sheetId: sheet_id, relationship });
      }
    }
  }
  return roots;
}

/** Internal parts reachable from `target`, or undefined when one is missing or rewritten. */
function reachable_parts(
  package_file: OpcPackage,
  target: string,
  modelled: ReadonlySet<string>,
): string[] | undefined {
  const members = new Set<string>();
  const pending = [target];
  for (let part = pending.pop(); part !== undefined; part = pending.pop()) {
    if (members.has(part)) continue;
    if (!package_file.archive.has(part) || REWRITTEN_PART.test(part)) return undefined;
    members.add(part);
    const relationships = relationshipsPart(part);
    if (package_file.archive.has(relationships)) members.add(relationships);
    for (const relationship of package_file.relationships(part)) {
      if (!relationship.external && !modelled.has(relationship.target))
        pending.push(relationship.target);
    }
  }
  return [...members];
}

/**
 * Record the parts Sheetwrite does not model on an imported snapshot. Only
 * their compressed payloads are copied; worksheet and other modelled parts,
 * including the `modelled` pivot parts, are never retained.
 */
export async function capturePreserved(
  packageFile: OpcPackage,
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  modelled: ReadonlySet<string>,
  replacements: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<void> {
  const workbook_part = packageFile.officeDocumentPart();
  const roots = graph_roots(
    packageFile,
    workbook_part,
    await packageFile.readBytes(workbook_part),
    snapshot,
    context,
  );
  const graphs: XlsxSourceGraph[] = [];
  let digests: Map<string, string> | undefined;
  const all_sheet_dependencies = (): XlsxSourceDependency[] => {
    digests ??= new Map(snapshot.sheets.map((sheet) => [sheet.id, sheet_digest(sheet)]));
    const known = digests;
    return snapshot.sheets.map((sheet) => ({
      sheetId: sheet.id,
      name: sheet.name,
      scope: "values",
      digest: known.get(sheet.id) ?? "",
    }));
  };

  for (const root of roots) {
    checkAbort(context);
    if (modelled.has(root.relationship.target)) continue;
    const parts = reachable_parts(packageFile, root.relationship.target, modelled);
    if (!parts) {
      drop_warning(context, root.relationship.target, "it points at a missing or rewritten part");
      continue;
    }
    const kind = relationship_kind(root.relationship.type);
    const reads_cells =
      kind.startsWith("pivot") ||
      parts.some((part) => CHART_CONTENT.test(packageFile.contentType(part) ?? ""));
    const owner =
      root.sheetId === undefined
        ? undefined
        : snapshot.sheets.find((sheet) => sheet.id === root.sheetId);
    let dependencies: XlsxSourceDependency[] = [];
    if (reads_cells) dependencies = all_sheet_dependencies();
    else if (owner) {
      dependencies = [
        {
          sheetId: owner.id,
          name: owner.name,
          scope: "layout",
          digest: sheet_digest(owner, "layout"),
        },
      ];
    }
    graphs.push({
      owner: root.owner,
      ...(root.sheetId === undefined ? {} : { sheetId: root.sheetId }),
      type: root.relationship.type,
      target: root.relationship.target,
      ...(root.cacheId === undefined ? {} : { cacheId: root.cacheId }),
      parts,
      dependencies,
    });
  }

  // Graphs that share a part (a pivot table and its cache) are kept or dropped together.
  const units = shared_part_units(graphs);
  const kept: XlsxSourceGraph[] = [];
  const retained = new Map<string, XlsxSourcePart>();
  const compressed_sizes = new Map<string, number>();
  for (const [name, entry] of packageFile.archive.entries) {
    compressed_sizes.set(asciiFold(name), entry.compressedSize);
  }
  let retained_bytes = 0;
  for (const unit of units) {
    const unit_parts = [...new Set(unit.flatMap((graph) => graph.parts))].filter(
      (part) => !retained.has(part),
    );
    const unit_bytes = unit_parts.reduce(
      (total, part) => total + (compressed_sizes.get(asciiFold(part)) ?? 0),
      0,
    );
    if (retained_bytes + unit_bytes > context.limits.maxPreservedBytes) {
      for (const graph of unit) {
        drop_warning(
          context,
          graph.target,
          `retained parts would exceed maxPreservedBytes (${context.limits.maxPreservedBytes})`,
        );
      }
      continue;
    }
    retained_bytes += unit_bytes;
    for (const part of unit_parts) {
      const replacement = replacements.get(part);
      const entry = replacement
        ? storedEntryFromBytes(replacement)
        : await packageFile.archive.stored(part);
      // Frozen so stores share the part and its verification result instead of copying it.
      retained.set(
        part,
        Object.freeze({
          name: part,
          contentType: part.endsWith(".rels")
            ? RELATIONSHIPS_CONTENT
            : (packageFile.contentType(part) ?? "application/octet-stream"),
          method: entry.method,
          crc32: entry.crc32,
          uncompressedSize: entry.uncompressedSize,
          data: encode_base64(entry.data),
        }),
      );
    }
    kept.push(...unit);
  }

  if (kept.length === 0) return;
  snapshot.workbook.xlsxSource = { parts: [...retained.values()], graphs: kept };
  snapshot.workbook.xlsxSource = admitPreserved(snapshot, context, true);
}

function shared_part_units(graphs: readonly XlsxSourceGraph[]): XlsxSourceGraph[][] {
  const units: XlsxSourceGraph[][] = [];
  const unit_of_part = new Map<string, XlsxSourceGraph[]>();
  for (const graph of graphs) {
    let unit: XlsxSourceGraph[] | undefined;
    for (const part of graph.parts) {
      const other = unit_of_part.get(part);
      if (!other || other === unit) continue;
      if (!unit) unit = other;
      else {
        unit.push(...other);
        for (const moved of other)
          for (const moved_part of moved.parts) unit_of_part.set(moved_part, unit);
        units.splice(units.indexOf(other), 1);
      }
    }
    if (!unit) {
      unit = [];
      units.push(unit);
    }
    unit.push(graph);
    for (const part of graph.parts) unit_of_part.set(part, unit);
  }
  return units;
}

function stored_entry(part: XlsxSourcePart): StoredZipEntry {
  const data = decode_base64(part.data);
  return {
    method: part.method,
    crc32: part.crc32,
    compressedSize: data.byteLength,
    uncompressedSize: part.uncompressedSize,
    data,
  };
}

function part_bytes(part: XlsxSourcePart): Uint8Array {
  const entry = stored_entry(part);
  return entry.method === 0
    ? entry.data
    : inflateSync(entry.data, { out: new Uint8Array(entry.uncompressedSize) });
}

/** Largest `cNvPr` id; drawing object ids must stay unique within one drawing part. */
function max_object_id(element: XmlElement): number {
  let maximum =
    xmlLocalName(element.name) === "cNvPr" ? Number(xmlAttribute(element, "id")) || 0 : 0;
  for (const child of element.children) maximum = Math.max(maximum, max_object_id(child));
  return maximum;
}

/**
 * Rewrite a kept drawing and its relationships so they also hold `charts`.
 * The kept anchors stay as parsed; new relationship ids skip the kept ones.
 */
function append_charts_to_drawing(
  drawing: XlsxSourcePart,
  relationships: XlsxSourcePart | undefined,
  charts: readonly DrawingChart[],
  context: XlsxCodecContext,
): Map<string, Uint8Array> {
  const relationships_name = relationshipsPart(drawing.name);
  const root = parseXml(part_bytes(drawing), drawing.name, context);
  const relationships_root = relationships
    ? parseXml(part_bytes(relationships), relationships_name, context)
    : undefined;
  const used_ids = new Set(
    (relationships_root?.children ?? []).map((entry) => xmlAttribute(entry, "Id")),
  );

  let object_id = max_object_id(root);
  let next_id = 1;
  let anchors = "";
  let added = "";
  for (const chart of charts) {
    while (used_ids.has(`rId${next_id}`)) next_id += 1;
    const id = `rId${next_id++}`;
    anchors += chart.anchorXml(++object_id, id);
    added += `<Relationship Id="${id}" Type="${CHART_REL}" Target="${escapeXml(chart.target)}"/>`;
  }

  const relationships_xml = relationships_root
    ? elementXml(relationships_root, added)
    : `<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NS}">${added}</Relationships>`;
  const encoder = new TextEncoder();
  return new Map([
    [drawing.name, encoder.encode(elementXml(root, anchors))],
    [relationships_name, encoder.encode(relationships_xml)],
  ]);
}

/** Internal targets of a `.rels` part; parsed once per frozen part. */
function relationship_targets(
  name: string,
  part: XlsxSourcePart,
  context: XlsxCodecContext,
): readonly string[] {
  const cached = relationship_target_cache.get(part);
  if (cached) return cached;
  const bytes = part_bytes(part);
  const source_part = relationshipSourcePart(name);
  const targets = xmlChildren(parseXml(bytes, name, context), "Relationship").flatMap(
    (relationship) =>
      xmlAttribute(relationship, "TargetMode") === "External"
        ? []
        : [resolveRelationshipTarget(source_part, xmlAttribute(relationship, "Target") ?? "")],
  );
  if (Object.isFrozen(part)) relationship_target_cache.set(part, targets);
  return targets;
}

/**
 * Check a graph from a possibly untrusted snapshot: payload CRCs and sizes, and
 * that its relationships parse and stay inside the graph. Returns why the
 * graph is dropped, or undefined to keep it.
 */
function verify_graph(
  graph: XlsxSourceGraph,
  parts_by_name: ReadonlyMap<string, XlsxSourcePart>,
  context: XlsxCodecContext,
): string | undefined {
  try {
    return graph_problem(graph, parts_by_name, context);
  } catch (error) {
    // Corrupt, over-limit or malformed parts drop only their graph, so a
    // persisted workbook still opens; abort errors still fail the whole operation.
    if (isAbort(context, error)) throw error;
    if (error instanceof TypeError || error instanceof XlsxResourceError) return error.message;
    throw error;
  }
}

/**
 * The first problem of a graph, or undefined. Payload and relationship results
 * are cached per frozen part, whose bytes cannot change, so saving the same
 * workbook again is free.
 */
function graph_problem(
  graph: XlsxSourceGraph,
  parts_by_name: ReadonlyMap<string, XlsxSourcePart>,
  context: XlsxCodecContext,
): string | undefined {
  const members = new Set(graph.parts);
  for (const name of graph.parts) {
    if (REWRITTEN_PART.test(name)) return `${name} is a part Sheetwrite rewrites`;
    const part = parts_by_name.get(name);
    if (!part) return `${name} is missing`;
    if (!verified_parts.has(part)) {
      validateStoredEntry(stored_entry(part), context);
      if (Object.isFrozen(part)) verified_parts.add(part);
    }
    if (!name.endsWith(".rels")) continue;
    const outside = relationship_targets(name, part, context).find(
      (target) => !members.has(target),
    );
    if (outside !== undefined) return `${name} points outside its graph at ${outside}`;
  }
  return undefined;
}

/**
 * Decide, after snapshot validation, which retained graphs a save writes back.
 * `tracked` is true only when core built the snapshot from a live Store for this
 * call: the Store already dropped graphs on each commit, so no cell is read.
 * Other snapshots are compared with the import fingerprints, O(cells).
 */
export function preparePreserved(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  tracked: boolean,
): WorkbookWriteHook | undefined {
  const source: XlsxSourceSnapshot | undefined = snapshot.workbook.xlsxSource;
  if (!source) return undefined;
  for (const target of source.dropped ?? []) {
    drop_warning(context, target, "an edit changed data it depends on");
  }

  const sheets = new Map(snapshot.sheets.map((sheet) => [sheet.id, sheet]));
  const digests = new Map<string, string>();
  const saved_queries = queriesDigest(snapshot.workbook.queries);
  const parts_by_name = new Map(source.parts.map((part) => [part.name, part]));
  const valid = new Set<XlsxSourceGraph>();
  for (const graph of source.graphs) {
    checkAbort(context);
    // Query definitions changed since import, so the retained Power Query parts are stale.
    if (graph.queries !== undefined && graph.queries !== saved_queries) {
      queryWarning(
        context,
        `Retained Power Query part ${graph.target} was dropped because the saved queries changed; output tables are written as values`,
        graph.target,
      );
      continue;
    }

    let reason: string | undefined;
    if (graph.sheetId !== undefined && !sheets.has(graph.sheetId)) reason = "its sheet was removed";
    for (const dependency of graph.dependencies) {
      if (reason) break;
      const sheet = sheets.get(dependency.sheetId);
      if (!sheet) reason = "a sheet it reads was removed";
      else if (dependency.scope === "values" && sheet.name !== dependency.name)
        reason = "a sheet it reads was renamed";
      else if (!tracked) {
        const key = `${sheet.id}:${dependency.scope}`;
        let digest = digests.get(key);
        if (digest === undefined) {
          digest = sheet_digest(sheet, dependency.scope);
          digests.set(key, digest);
        }
        if (digest !== dependency.digest) reason = "an edit changed data it depends on";
      }
    }
    reason ??= verify_graph(graph, parts_by_name, context);
    if (reason) drop_warning(context, graph.target, reason);
    else valid.add(graph);
  }

  // Graphs that share a part (a pivot table and its cache) are kept or dropped
  // together, and whole units are dropped once the retained-byte cap is reached.
  const graphs: XlsxSourceGraph[] = [];
  const counted = new Set<string>();
  let retained_bytes = 0;
  for (const unit of shared_part_units(source.graphs)) {
    if (!unit.every((graph) => valid.has(graph))) {
      for (const graph of unit) {
        if (valid.has(graph))
          drop_warning(context, graph.target, "a graph sharing its parts was dropped");
      }
      continue;
    }
    const unit_parts = new Set(
      unit.flatMap((graph) => graph.parts).filter((name) => !counted.has(name)),
    );
    let unit_bytes = 0;
    for (const name of unit_parts)
      unit_bytes += ((parts_by_name.get(name)?.data.length ?? 0) * 3) / 4;
    if (retained_bytes + unit_bytes > context.limits.maxPreservedBytes) {
      for (const graph of unit) {
        drop_warning(
          context,
          graph.target,
          `retained parts would exceed maxPreservedBytes (${context.limits.maxPreservedBytes})`,
        );
      }
      continue;
    }
    retained_bytes += unit_bytes;
    for (const name of unit_parts) counted.add(name);
    graphs.push(...unit);
  }
  if (graphs.length === 0) return undefined;

  const parts = source.parts.filter((part) => counted.has(part.name));
  const workbook_graphs = graphs.filter((graph) => graph.owner === "workbook");
  const absolute = (graph: XlsxSourceGraph) => ({ type: graph.type, target: `/${graph.target}` });
  const rewritten = new Map<string, Uint8Array>();
  return {
    rootRelationships: graphs.filter((graph) => graph.owner === "root").map(absolute),
    workbookRelationships: workbook_graphs.map(absolute),
    workbookXml(ids) {
      const pivot_caches = workbook_graphs.flatMap((graph, index) =>
        graph.cacheId === undefined
          ? []
          : [
              `<pivotCache cacheId="${escapeXml(graph.cacheId)}" r:id="${escapeXml(ids[index] ?? "")}"/>`,
            ],
      );
      return { pivotCaches: pivot_caches };
    },
    appendCharts(sheet, charts) {
      const graph = graphs.find(
        (entry) => entry.sheetId === sheet.id && relationshipTypeMatches(entry.type, "drawing"),
      );
      const drawing = graph && parts_by_name.get(graph.target);
      if (!drawing) return false;

      const drawing_relationships = parts_by_name.get(relationshipsPart(drawing.name));
      for (const [name, bytes] of append_charts_to_drawing(
        drawing,
        drawing_relationships,
        charts,
        context,
      )) {
        rewritten.set(name, bytes);
      }
      return true;
    },
    sheet(sheet) {
      const sheet_graphs = graphs.filter(
        (graph) => graph.owner === "sheet" && graph.sheetId === sheet.id,
      );
      if (sheet_graphs.length === 0) return undefined;
      return {
        relationships: sheet_graphs.map(absolute),
        beforeLegacyDrawing(ids) {
          const drawing = sheet_graphs.findIndex((graph) =>
            relationshipTypeMatches(graph.type, "drawing"),
          );
          return drawing < 0 ? "" : `<drawing r:id="${escapeXml(ids[drawing] ?? "")}"/>`;
        },
      };
    },
    contentTypeOverrides: [
      ...parts
        .filter((part) => !part.name.endsWith(".rels"))
        .map((part) => ({ part: part.name, contentType: part.contentType })),
      // The VBA relationship lives in a Microsoft namespace, not the OOXML one.
      ...(workbook_graphs.some((graph) => relationship_kind(graph.type) === "vbaProject")
        ? [{ part: "xl/workbook.xml", contentType: MACRO_WORKBOOK_CONTENT }]
        : []),
    ],
    *parts() {
      for (const [name, bytes] of rewritten) yield { name, data: bytes };
      for (const part of parts) {
        if (rewritten.has(part.name)) continue;
        const stored = stored_entry(part);
        // verify_graph checked these exact bytes; spare the writer a second inflate.
        markStoredEntryVerified(stored);
        yield { name: part.name, stored };
      }
    },
  };
}

/** Validate external values and payloads before a store relies on edit-time pruning. */
export function admitPreserved(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
  tracked = false,
): XlsxSourceSnapshot | undefined {
  const source = snapshot.workbook.xlsxSource;
  if (!source) return undefined;
  const hook = preparePreserved(snapshot, context, tracked);
  const retained = new Set(hook?.contentTypeOverrides?.map((part) => part.part));
  const graphs = source.graphs.filter((graph) => retained.has(graph.target));
  const members = new Set(graphs.flatMap((graph) => graph.parts));
  const dropped = new Set(source.dropped);
  for (const graph of source.graphs) if (!retained.has(graph.target)) dropped.add(graph.target);
  return {
    parts: source.parts.filter((part) => members.has(part.name)),
    graphs,
    ...(dropped.size ? { dropped: [...dropped] } : {}),
  };
}
