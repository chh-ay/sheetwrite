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
import {
  CHART_REL,
  elementXml,
  PACKAGE_RELATIONSHIPS_NS,
  relationshipsPartOf,
} from "./chart-xml.js";
import {
  type OpcPackage,
  type OpcRelationship,
  relationshipTypeMatches,
  resolveRelationshipTarget,
} from "./opc.js";
import { checkAbort, emitWarning, type XlsxCodecContext } from "./resources.js";
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
  return RETAINED_KINDS[owner].has(relationshipKind(type));
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
const verifiedParts = new WeakSet<XlsxSourcePart>();
const relationshipTargetCache = new WeakMap<XlsxSourcePart, readonly string[]>();

function relationshipKind(type: string): string {
  return type.slice(type.lastIndexOf("/") + 1);
}

function sourcePartOfRelationships(part: string): string {
  const match = /^(.*\/)?_rels\/([^/]+)\.rels$/.exec(part);
  if (!match) throw new TypeError(`Sheetwrite: ${part} is not a relationships part`);
  return `${match[1] ?? ""}${match[2] ?? ""}`;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_BYTES))));
  }
  return chunks.join("");
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Reused per digest so hashing a number allocates nothing. */
const numberScratch = new Float64Array(1);
const numberWords = new Uint32Array(numberScratch.buffer);

/**
 * Order-independent 64-bit fingerprint of a sheet's shape and source values.
 * Each cell is hashed with two FNV-1a lanes and the lanes are summed, so block
 * and cell order do not matter and nothing is sorted or serialized. It guards
 * against stale charts in snapshots edited outside a Store, not against
 * deliberate collisions: whoever can craft a collision can also edit the parts.
 */
function sheetDigest(sheet: SheetSnapshot, scope: "layout" | "values" = "values"): string {
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
        numberScratch[0] = value.value;
        mix(numberWords[0] ?? 0);
        mix(numberWords[1] ?? 0);
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

function dropWarning(context: XlsxCodecContext, part: string, reason: string): void {
  emitWarning(context, {
    code: "unsupported-feature",
    message: `Preserved XLSX part graph ${part} was dropped: ${reason}`,
    part,
  });
}

function graphRoots(
  packageFile: OpcPackage,
  workbookPart: string,
  workbookXml: Uint8Array,
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
): GraphRoot[] {
  const roots: GraphRoot[] = [];
  for (const relationship of packageFile.relationships("")) {
    if (!relationship.external && isRetainedRelationship("root", relationship.type)) {
      roots.push({ owner: "root", relationship });
    }
  }

  const workbookRoot = parseXml(workbookXml, workbookPart, context);
  const pivotCaches = xmlChildren(
    xmlChild(workbookRoot, "pivotCaches") ?? workbookRoot,
    "pivotCache",
  );
  for (const relationship of packageFile.relationships(workbookPart)) {
    const kind = relationshipKind(relationship.type);
    if (relationship.external || !isRetainedRelationship("workbook", relationship.type)) continue;
    if (kind !== "pivotCacheDefinition") {
      roots.push({ owner: "workbook", relationship });
      continue;
    }
    const cacheId = xmlAttribute(
      pivotCaches.find((cache) => xmlAttribute(cache, "id") === relationship.id) ?? workbookRoot,
      "cacheId",
    );
    if (cacheId === undefined || !/^\d{1,10}$/.test(cacheId)) {
      dropWarning(context, relationship.target, "its pivot cache id is missing");
    } else roots.push({ owner: "workbook", relationship, cacheId });
  }

  const sheetsByName = new Map(snapshot.sheets.map((sheet) => [sheet.name, sheet.id]));
  for (const declaration of xmlChildren(
    xmlChild(workbookRoot, "sheets") ?? workbookRoot,
    "sheet",
  )) {
    const sheetId = sheetsByName.get(decodeXstring(xmlAttribute(declaration, "name") ?? ""));
    const relationshipId = xmlAttribute(declaration, "id");
    if (sheetId === undefined || relationshipId === undefined) continue;
    const sheetPart = packageFile.relationship(workbookPart, relationshipId).target;
    for (const relationship of packageFile.relationships(sheetPart)) {
      if (!relationship.external && isRetainedRelationship("sheet", relationship.type)) {
        roots.push({ owner: "sheet", sheetId, relationship });
      }
    }
  }
  return roots;
}

/** Internal parts reachable from `target`, or undefined when one is missing or rewritten. */
function reachableParts(
  packageFile: OpcPackage,
  target: string,
  modelled: ReadonlySet<string>,
): string[] | undefined {
  const members = new Set<string>();
  const pending = [target];
  for (let part = pending.pop(); part !== undefined; part = pending.pop()) {
    if (members.has(part)) continue;
    if (!packageFile.archive.has(part) || REWRITTEN_PART.test(part)) return undefined;
    members.add(part);
    const relationshipsPart = relationshipsPartOf(part);
    if (packageFile.archive.has(relationshipsPart)) members.add(relationshipsPart);
    for (const relationship of packageFile.relationships(part)) {
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
  const workbookPart = packageFile.officeDocumentPart();
  const roots = graphRoots(
    packageFile,
    workbookPart,
    await packageFile.readBytes(workbookPart),
    snapshot,
    context,
  );
  const graphs: XlsxSourceGraph[] = [];
  let digests: Map<string, string> | undefined;
  const allSheetDependencies = (): XlsxSourceDependency[] => {
    digests ??= new Map(snapshot.sheets.map((sheet) => [sheet.id, sheetDigest(sheet)]));
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
    const parts = reachableParts(packageFile, root.relationship.target, modelled);
    if (!parts) {
      dropWarning(context, root.relationship.target, "it points at a missing or rewritten part");
      continue;
    }
    const kind = relationshipKind(root.relationship.type);
    const readsCells =
      kind.startsWith("pivot") ||
      parts.some((part) => CHART_CONTENT.test(packageFile.contentType(part) ?? ""));
    const owner =
      root.sheetId === undefined
        ? undefined
        : snapshot.sheets.find((sheet) => sheet.id === root.sheetId);
    let dependencies: XlsxSourceDependency[] = [];
    if (readsCells) dependencies = allSheetDependencies();
    else if (owner) {
      dependencies = [
        {
          sheetId: owner.id,
          name: owner.name,
          scope: "layout",
          digest: sheetDigest(owner, "layout"),
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
  const units = sharedPartUnits(graphs);
  const kept: XlsxSourceGraph[] = [];
  const retained = new Map<string, XlsxSourcePart>();
  const compressedSizes = new Map<string, number>();
  for (const [name, entry] of packageFile.archive.entries) {
    compressedSizes.set(name.toLowerCase(), entry.compressedSize);
  }
  let retainedBytes = 0;
  for (const unit of units) {
    const unitParts = [...new Set(unit.flatMap((graph) => graph.parts))].filter(
      (part) => !retained.has(part),
    );
    const unitBytes = unitParts.reduce(
      (total, part) => total + (compressedSizes.get(part.toLowerCase()) ?? 0),
      0,
    );
    if (retainedBytes + unitBytes > context.limits.maxPreservedBytes) {
      for (const graph of unit) {
        dropWarning(
          context,
          graph.target,
          `retained parts would exceed maxPreservedBytes (${context.limits.maxPreservedBytes})`,
        );
      }
      continue;
    }
    retainedBytes += unitBytes;
    for (const part of unitParts) {
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
          data: encodeBase64(entry.data),
        }),
      );
    }
    kept.push(...unit);
  }

  if (kept.length === 0) return;
  snapshot.workbook.xlsxSource = { parts: [...retained.values()], graphs: kept };
  snapshot.workbook.xlsxSource = admitPreserved(snapshot, context, true);
}

function sharedPartUnits(graphs: readonly XlsxSourceGraph[]): XlsxSourceGraph[][] {
  const units: XlsxSourceGraph[][] = [];
  const unitOfPart = new Map<string, XlsxSourceGraph[]>();
  for (const graph of graphs) {
    let unit: XlsxSourceGraph[] | undefined;
    for (const part of graph.parts) {
      const other = unitOfPart.get(part);
      if (!other || other === unit) continue;
      if (!unit) unit = other;
      else {
        unit.push(...other);
        for (const moved of other)
          for (const movedPart of moved.parts) unitOfPart.set(movedPart, unit);
        units.splice(units.indexOf(other), 1);
      }
    }
    if (!unit) {
      unit = [];
      units.push(unit);
    }
    unit.push(graph);
    for (const part of graph.parts) unitOfPart.set(part, unit);
  }
  return units;
}

function storedEntry(part: XlsxSourcePart): StoredZipEntry {
  const data = decodeBase64(part.data);
  return {
    method: part.method,
    crc32: part.crc32,
    compressedSize: data.byteLength,
    uncompressedSize: part.uncompressedSize,
    data,
  };
}

function partBytes(part: XlsxSourcePart): Uint8Array {
  const entry = storedEntry(part);
  return entry.method === 0
    ? entry.data
    : inflateSync(entry.data, { out: new Uint8Array(entry.uncompressedSize) });
}

/** Largest `cNvPr` id; drawing object ids must stay unique within one drawing part. */
function maxObjectId(element: XmlElement): number {
  let maximum =
    xmlLocalName(element.name) === "cNvPr" ? Number(xmlAttribute(element, "id")) || 0 : 0;
  for (const child of element.children) maximum = Math.max(maximum, maxObjectId(child));
  return maximum;
}

/**
 * Rewrite a kept drawing and its relationships so they also hold `charts`.
 * The kept anchors stay as parsed; new relationship ids skip the kept ones.
 */
function appendChartsToDrawing(
  drawing: XlsxSourcePart,
  relationships: XlsxSourcePart | undefined,
  charts: readonly DrawingChart[],
  context: XlsxCodecContext,
): Map<string, Uint8Array> {
  const relationshipsName = relationshipsPartOf(drawing.name);
  const root = parseXml(partBytes(drawing), drawing.name, context);
  const relationshipsRoot = relationships
    ? parseXml(partBytes(relationships), relationshipsName, context)
    : undefined;
  const usedIds = new Set(
    (relationshipsRoot?.children ?? []).map((entry) => xmlAttribute(entry, "Id")),
  );

  let objectId = maxObjectId(root);
  let nextId = 1;
  let anchors = "";
  let added = "";
  for (const chart of charts) {
    while (usedIds.has(`rId${nextId}`)) nextId += 1;
    const id = `rId${nextId++}`;
    anchors += chart.anchorXml(++objectId, id);
    added += `<Relationship Id="${id}" Type="${CHART_REL}" Target="${escapeXml(chart.target)}"/>`;
  }

  const relationshipsXml = relationshipsRoot
    ? elementXml(relationshipsRoot, added)
    : `<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NS}">${added}</Relationships>`;
  const encoder = new TextEncoder();
  return new Map([
    [drawing.name, encoder.encode(elementXml(root, anchors))],
    [relationshipsName, encoder.encode(relationshipsXml)],
  ]);
}

/** Internal targets of a `.rels` part; parsed once per frozen part. */
function relationshipTargets(
  name: string,
  part: XlsxSourcePart,
  context: XlsxCodecContext,
): readonly string[] {
  const cached = relationshipTargetCache.get(part);
  if (cached) return cached;
  const bytes = partBytes(part);
  const sourcePart = sourcePartOfRelationships(name);
  const targets = xmlChildren(parseXml(bytes, name, context), "Relationship").flatMap(
    (relationship) =>
      xmlAttribute(relationship, "TargetMode") === "External"
        ? []
        : [resolveRelationshipTarget(sourcePart, xmlAttribute(relationship, "Target") ?? "")],
  );
  if (Object.isFrozen(part)) relationshipTargetCache.set(part, targets);
  return targets;
}

/**
 * Check a graph from a possibly untrusted snapshot: payload CRCs and sizes, and
 * that its relationships stay inside the graph. Results are cached per frozen
 * part, whose bytes cannot change, so saving the same workbook again is free.
 */
function verifyGraph(
  graph: XlsxSourceGraph,
  partsByName: ReadonlyMap<string, XlsxSourcePart>,
  context: XlsxCodecContext,
): string | undefined {
  const members = new Set(graph.parts);
  for (const name of graph.parts) {
    if (REWRITTEN_PART.test(name)) return `${name} is a part Sheetwrite rewrites`;
    const part = partsByName.get(name);
    if (!part) return `${name} is missing`;
    if (!verifiedParts.has(part)) {
      try {
        validateStoredEntry(storedEntry(part), context);
      } catch (error) {
        // Corrupt or over-limit payloads drop only their graph, so a persisted
        // workbook still opens; abort errors still fail the whole operation.
        if (error instanceof TypeError || error instanceof XlsxResourceError) return error.message;
        throw error;
      }
      if (Object.isFrozen(part)) verifiedParts.add(part);
    }
    if (!name.endsWith(".rels")) continue;
    const outside = relationshipTargets(name, part, context).find((target) => !members.has(target));
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
    dropWarning(context, target, "an edit changed data it depends on");
  }

  const sheets = new Map(snapshot.sheets.map((sheet) => [sheet.id, sheet]));
  const digests = new Map<string, string>();
  const partsByName = new Map(source.parts.map((part) => [part.name, part]));
  const valid = new Set<XlsxSourceGraph>();
  for (const graph of source.graphs) {
    checkAbort(context);
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
          digest = sheetDigest(sheet, dependency.scope);
          digests.set(key, digest);
        }
        if (digest !== dependency.digest) reason = "an edit changed data it depends on";
      }
    }
    reason ??= verifyGraph(graph, partsByName, context);
    if (reason) dropWarning(context, graph.target, reason);
    else valid.add(graph);
  }

  // Graphs that share a part (a pivot table and its cache) are kept or dropped
  // together, and whole units are dropped once the retained-byte cap is reached.
  const graphs: XlsxSourceGraph[] = [];
  const counted = new Set<string>();
  let retainedBytes = 0;
  for (const unit of sharedPartUnits(source.graphs)) {
    if (!unit.every((graph) => valid.has(graph))) {
      for (const graph of unit) {
        if (valid.has(graph))
          dropWarning(context, graph.target, "a graph sharing its parts was dropped");
      }
      continue;
    }
    const unitParts = new Set(
      unit.flatMap((graph) => graph.parts).filter((name) => !counted.has(name)),
    );
    let unitBytes = 0;
    for (const name of unitParts) unitBytes += ((partsByName.get(name)?.data.length ?? 0) * 3) / 4;
    if (retainedBytes + unitBytes > context.limits.maxPreservedBytes) {
      for (const graph of unit) {
        dropWarning(
          context,
          graph.target,
          `retained parts would exceed maxPreservedBytes (${context.limits.maxPreservedBytes})`,
        );
      }
      continue;
    }
    retainedBytes += unitBytes;
    for (const name of unitParts) counted.add(name);
    graphs.push(...unit);
  }
  if (graphs.length === 0) return undefined;

  const parts = source.parts.filter((part) => counted.has(part.name));
  const workbookGraphs = graphs.filter((graph) => graph.owner === "workbook");
  const absolute = (graph: XlsxSourceGraph) => ({ type: graph.type, target: `/${graph.target}` });
  const rewritten = new Map<string, Uint8Array>();
  return {
    rootRelationships: graphs.filter((graph) => graph.owner === "root").map(absolute),
    workbookRelationships: workbookGraphs.map(absolute),
    workbookXml(ids) {
      const pivotCaches = workbookGraphs.flatMap((graph, index) =>
        graph.cacheId === undefined
          ? []
          : [
              `<pivotCache cacheId="${escapeXml(graph.cacheId)}" r:id="${escapeXml(ids[index] ?? "")}"/>`,
            ],
      );
      return { pivotCaches };
    },
    appendCharts(sheet, charts) {
      const graph = graphs.find(
        (entry) => entry.sheetId === sheet.id && relationshipTypeMatches(entry.type, "drawing"),
      );
      const drawing = graph && partsByName.get(graph.target);
      if (!drawing) return false;

      const relationshipsPart = partsByName.get(relationshipsPartOf(drawing.name));
      for (const [name, bytes] of appendChartsToDrawing(
        drawing,
        relationshipsPart,
        charts,
        context,
      )) {
        rewritten.set(name, bytes);
      }
      return true;
    },
    sheet(sheet) {
      const sheetGraphs = graphs.filter(
        (graph) => graph.owner === "sheet" && graph.sheetId === sheet.id,
      );
      if (sheetGraphs.length === 0) return undefined;
      return {
        relationships: sheetGraphs.map(absolute),
        beforeLegacyDrawing(ids) {
          const drawing = sheetGraphs.findIndex((graph) =>
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
      ...(workbookGraphs.some((graph) => relationshipKind(graph.type) === "vbaProject")
        ? [{ part: "xl/workbook.xml", contentType: MACRO_WORKBOOK_CONTENT }]
        : []),
    ],
    *parts() {
      for (const [name, bytes] of rewritten) yield { name, data: bytes };
      for (const part of parts) {
        if (rewritten.has(part.name)) continue;
        const stored = storedEntry(part);
        // verifyGraph checked these exact bytes; spare the writer a second inflate.
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
