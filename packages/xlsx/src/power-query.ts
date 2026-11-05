import type {
  PowerQueryCodec,
  SavedQuery,
  WorkbookSnapshot,
  WorkbookTable,
} from "@sheetwrite/core";
import { validateWorkbookSnapshot } from "@sheetwrite/core";
import { inflateSync, unzipSync, zipSync } from "fflate";

import { type OpcPackage, relationshipTypeMatches } from "./opc.js";
import { queriesDigest, queryWarning, textDigest } from "./query-digest.js";
import type { QueryTableBinding } from "./query-table.js";
import type { XlsxCodecContext } from "./resources.js";
import type { WorkbookWriteHook } from "./writer.js";
import { escapeXml, parseXml, xmlAttribute, xmlChild, xmlChildren } from "./xml.js";
import type { ZipPart } from "./zip.js";

/*
 * Power Query parts ([MS-QDEFF], https://learn.microsoft.com/openspecs/office_file_formats/ms-qdeff/):
 * a customXml item holds `<DataMashup>` with a base64 binary stream (2.2) of
 * length-prefixed Package Parts (an OPC package with Formulas/Section1.m),
 * Permissions, Metadata and Permission Bindings. Output tables bind to their
 * query through `xl/connections.xml` and a queryTable part (ECMA-376 Part 1,
 * 18.13 and 18.12). M text comes only from the Power Query codec, and import
 * reads it as text: nothing in a workbook is evaluated or fetched.
 */

const DATA_MASHUP_NS = "http://schemas.microsoft.com/DataMashup";
const CUSTOM_XML_PROPS_NS = "http://schemas.openxmlformats.org/officeDocument/2006/customXml";
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CUSTOM_XML_REL = `${OFFICE_REL}/customXml`;
const CUSTOM_XML_PROPS_REL = `${OFFICE_REL}/customXmlProps`;
const CONNECTIONS_REL = `${OFFICE_REL}/connections`;
const CUSTOM_XML_PROPS_CONTENT =
  "application/vnd.openxmlformats-officedocument.customXmlProperties+xml";
const CONNECTIONS_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml";
const XML_CONTENT = "application/xml";
const RELATIONSHIPS_CONTENT = "application/vnd.openxmlformats-package.relationships+xml";

/** The connection string Excel writes for a workbook query, followed by the query name. */
const MASHUP_PROVIDER = "Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=";
/** ECMA-376 `ST_ConnectionType`: 5 is an OLE DB data source. */
const OLE_DB_CONNECTION = 5;
/** Metadata entry that records which Section1.m text Sheetwrite wrote with the hidden workbook metadata. */
const SECTION_DIGEST_ENTRY = "SheetwriteSectionDigest";

const UINT32_BYTES = 4;
const BINARY_VERSION = 0;
/** Bounds the decoded mashup; a workbook's queries are small text. */
const MAX_MASHUP_BYTES = 16 * 1024 * 1024;
const MAX_SECTION_BYTES = 4 * 1024 * 1024;
const UTF16_LE_BOM = [0xff, 0xfe] as const;
const UTF16_BE_BOM = [0xfe, 0xff] as const;

const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// --- Reading -----------------------------------------------------------------

/** Per-query metadata from the mashup's Metadata XML ([MS-QDEFF] 2.5.1). */
interface MemberMetadata {
  readonly fillEnabled: boolean;
  readonly fillTarget?: string;
}

interface Mashup {
  readonly section: string;
  readonly members: ReadonlyMap<string, MemberMetadata>;
  readonly digest?: string;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

/** Excel writes the item as UTF-16; the XML reader takes UTF-8 without a declaration. */
function itemXml(bytes: Uint8Array): Uint8Array {
  let text: string;
  if (startsWith(bytes, UTF16_LE_BOM)) text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (startsWith(bytes, UTF16_BE_BOM))
    text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else return bytes;

  return utf8.encode(text.replace(/^<\?xml[^>]*\?>/u, ""));
}

function uint32(view: DataView, offset: number): number {
  if (offset + UINT32_BYTES > view.byteLength) throw new RangeError("Truncated DataMashup stream");

  return view.getUint32(offset, true);
}

/** The four length-prefixed streams after the version ([MS-QDEFF] 2.2). */
function streams(binary: Uint8Array): Uint8Array[] {
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  if (uint32(view, 0) !== BINARY_VERSION) throw new RangeError("Unsupported DataMashup version");

  const output: Uint8Array[] = [];
  let offset = UINT32_BYTES;
  for (let index = 0; index < 4; index++) {
    const length = uint32(view, offset);
    offset += UINT32_BYTES;
    if (offset + length > binary.byteLength) throw new RangeError("Truncated DataMashup stream");

    output.push(binary.subarray(offset, offset + length));
    offset += length;
  }

  return output;
}

function decodeBase64(text: string): Uint8Array {
  const compact = text.replace(/\s+/gu, "");
  if ((compact.length * 3) / 4 > MAX_MASHUP_BYTES) throw new RangeError("DataMashup is too large");

  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

function readMetadata(
  stream: Uint8Array,
  context: XlsxCodecContext,
): { members: Map<string, MemberMetadata>; digest?: string } {
  const members = new Map<string, MemberMetadata>();
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const length = uint32(view, UINT32_BYTES);
  const xml = stream.subarray(2 * UINT32_BYTES, 2 * UINT32_BYTES + length);
  const root = parseXml(
    utf8.encode(stripBom(utf8Decoder.decode(xml))),
    "DataMashup metadata",
    context,
  );
  let digest: string | undefined;

  for (const item of xmlChildren(xmlChild(root, "Items") ?? root, "Item")) {
    const location = xmlChild(item, "ItemLocation");
    const type = location ? xmlChild(location, "ItemType")?.text : undefined;
    const path = location ? (xmlChild(location, "ItemPath")?.text ?? "") : "";
    const entries = new Map<string, string>();
    for (const entry of xmlChildren(xmlChild(item, "StableEntries") ?? item, "Entry")) {
      const name = xmlAttribute(entry, "Type");
      const value = xmlAttribute(entry, "Value");
      if (name !== undefined && value !== undefined) entries.set(name, value);
    }

    if (type === "AllFormulas") {
      const recorded = entries.get(SECTION_DIGEST_ENTRY);
      if (recorded?.startsWith("s")) digest = recorded.slice(1);
      continue;
    }

    // Only query items `Section1/<name>` describe a query; step items have a longer path.
    const parts = path.split("/");
    if (type !== "Formula" || parts.length !== 2 || parts[0] !== "Section1") continue;

    const target = entries.get("FillTarget");
    members.set(parts[1] ?? "", {
      fillEnabled: entries.get("FillEnabled") === "l1",
      ...(target?.startsWith("s") ? { fillTarget: target.slice(1) } : {}),
    });
  }

  return { members, ...(digest ? { digest } : {}) };
}

function parseMashup(
  item: Uint8Array,
  part: string,
  context: XlsxCodecContext,
): Mashup | undefined {
  const root = parseXml(itemXml(item), part, context);
  if (root.name.split(":").pop() !== "DataMashup") return undefined;

  const [packageParts, , metadata] = streams(decodeBase64(root.text));
  if (!packageParts || !metadata) throw new RangeError("Truncated DataMashup stream");

  let tooLarge = false;
  const files = unzipSync(packageParts, {
    filter: (file) => {
      if (file.name !== "Formulas/Section1.m") return false;
      tooLarge = file.originalSize > MAX_SECTION_BYTES;
      return !tooLarge;
    },
  });
  const sectionBytes = files["Formulas/Section1.m"];
  if (tooLarge || !sectionBytes) throw new RangeError("DataMashup has no readable Section1.m");

  return {
    section: stripBom(utf8Decoder.decode(sectionBytes)),
    ...readMetadata(metadata, context),
  };
}

function workbookTables(
  snapshot: WorkbookSnapshot,
): Array<{ sheet: string; table: WorkbookTable }> {
  return snapshot.sheets.flatMap((sheet) =>
    (sheet.tables ?? []).map((table) => ({ sheet: sheet.id, table })),
  );
}

/** Imported queries must pass the same admission as saved ones; others are reported, not saved. */
function admissible(snapshot: WorkbookSnapshot, queries: SavedQuery[]): boolean {
  const probe: WorkbookSnapshot = {
    schemaVersion: 1,
    workbook: { activeSheet: snapshot.workbook.activeSheet, queries },
    sheets: [],
  };
  const result = validateWorkbookSnapshot(probe);

  return result.ok || result.errors.every((error) => !error.path.startsWith("workbook.queries"));
}

/**
 * Reads Power Query parts after the retained graphs are captured. Queries come
 * from the hidden Sheetwrite metadata when it was written with this exact
 * Section1.m, else from the codec; the mashup and connection graphs are tagged
 * with the resulting query digest.
 */
export async function readPowerQuery(
  packageFile: OpcPackage,
  snapshot: WorkbookSnapshot,
  sidecarQueries: readonly SavedQuery[] | undefined,
  context: XlsxCodecContext,
): Promise<void> {
  // Excel links the item from the workbook part; other writers may link it from the package root.
  const relationships = [
    ...packageFile.relationships(packageFile.officeDocumentPart()),
    ...packageFile.relationships(""),
  ];
  let mashup: Mashup | undefined;
  let mashupPart: string | undefined;

  for (const relationship of relationships) {
    if (relationship.external || !relationshipTypeMatches(relationship.type, "customXml")) continue;

    try {
      const parsed = parseMashup(
        await packageFile.readBytes(relationship.target),
        relationship.target,
        context,
      );
      if (parsed) {
        mashup = parsed;
        mashupPart = relationship.target;
        break;
      }
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      queryWarning(
        context,
        `Power Query definitions in ${relationship.target} could not be read`,
        relationship.target,
      );
    }
  }

  if (!mashup || !mashupPart) {
    // Without M parts, the hidden Sheetwrite metadata is the only copy of the definitions.
    if (sidecarQueries?.length && admissible(snapshot, [...sidecarQueries])) {
      snapshot.workbook.queries = structuredClone([...sidecarQueries]);
    }
    return;
  }

  let queries: SavedQuery[] | undefined;
  if (sidecarQueries?.length && mashup.digest === textDigest(mashup.section)) {
    queries = structuredClone([...sidecarQueries]);
  } else if (context.options?.powerQuery) {
    try {
      const imported = context.options.powerQuery.decode(mashup.section);
      const tables = workbookTables(snapshot);
      queries = imported.queries.map((query) => {
        const metadata = mashup.members.get(query.name);
        const bound = metadata?.fillEnabled
          ? tables.find((entry) => entry.table.name === metadata.fillTarget)
          : undefined;
        if (!bound) return query;

        return {
          ...query,
          output: {
            table: bound.table.id,
            tableName: bound.table.name,
            anchor: {
              sheet: bound.sheet,
              row: bound.table.range.start.row,
              col: bound.table.range.start.col,
            },
          },
        };
      });

      for (const member of imported.unsupported) {
        queryWarning(
          context,
          `Power Query member ${member.member} was kept as M text and does not refresh in Sheetwrite (${member.reason}${member.detail ? `: ${member.detail}` : ""})`,
          mashupPart,
        );
      }
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      queryWarning(
        context,
        `Power Query section in ${mashupPart} is not a supported M document`,
        mashupPart,
      );
    }
  }

  if (queries?.length) {
    if (admissible(snapshot, queries)) snapshot.workbook.queries = queries;
    else
      queryWarning(
        context,
        "Imported Power Query definitions conflict with each other and were not saved",
        mashupPart,
      );
  }

  // Retained query parts are written back only while the saved queries are unchanged.
  const digest = queriesDigest(snapshot.workbook.queries);
  const source = snapshot.workbook.xlsxSource;
  if (!source) return;

  snapshot.workbook.xlsxSource = {
    ...source,
    graphs: source.graphs.map((graph) =>
      graph.target === mashupPart || relationshipTypeMatches(graph.type, "connections")
        ? { ...graph, queries: digest }
        : graph,
    ),
  };
}

// --- Writing -----------------------------------------------------------------

function uint32Bytes(value: number): Uint8Array {
  const bytes = new Uint8Array(UINT32_BYTES);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function lengthPrefixed(stream: Uint8Array): Uint8Array {
  return concat([uint32Bytes(stream.length), stream]);
}

function encodeBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  const pieces: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + chunk)));
  }
  return btoa(pieces.join(""));
}

interface MemberEntry {
  readonly member: string;
  readonly tableName?: string;
}

function metadataXml(members: readonly MemberEntry[], digest: string): string {
  const entry = (type: string, value: string): string =>
    `<Entry Type="${escapeXml(type)}" Value="${escapeXml(value)}"/>`;
  const items = members.map(({ member, tableName }) => {
    const entries = [
      entry("IsPrivate", "l0"),
      entry("ResultType", "sTable"),
      entry("FillEnabled", tableName ? "l1" : "l0"),
      entry("FillToDataModelEnabled", "l0"),
      entry("AddedToDataModel", "l0"),
      ...(tableName
        ? [entry("FillTarget", `s${tableName}`), entry("FillStatus", "sComplete")]
        : []),
    ];
    return `<Item><ItemLocation><ItemType>Formula</ItemType><ItemPath>${escapeXml(`Section1/${member}`)}</ItemPath></ItemLocation><StableEntries>${entries.join("")}</StableEntries></Item>`;
  });

  return `<?xml version="1.0" encoding="utf-8"?><LocalPackageMetadataFile xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Items><Item><ItemLocation><ItemType>AllFormulas</ItemType><ItemPath/></ItemLocation><StableEntries>${entry(SECTION_DIGEST_ENTRY, `s${digest}`)}</StableEntries></Item>${items.join("")}</Items></LocalPackageMetadataFile>`;
}

/** The DataMashup binary stream for one section ([MS-QDEFF] 2.2 to 2.6). */
function mashupBinary(section: string, members: readonly MemberEntry[]): Uint8Array {
  const packageParts = zipSync({
    "[Content_Types].xml": utf8.encode(
      '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml"/><Default Extension="m" ContentType="text/plain"/></Types>',
    ),
    "Config/Package.xml": utf8.encode(
      '<?xml version="1.0" encoding="utf-8"?><Package xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Version>2.21.0.0</Version><MinVersion>2.21.0.0</MinVersion><Culture>en-US</Culture></Package>',
    ),
    "Formulas/Section1.m": utf8.encode(section),
  });
  // The defaults of 2.6: privacy levels apply and nothing is pre-approved.
  const permissions = utf8.encode(
    '<?xml version="1.0" encoding="utf-8"?><PermissionList xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><CanEvaluateFuturePackages>false</CanEvaluateFuturePackages><FirewallEnabled>true</FirewallEnabled><WorkbookGroupType xsi:nil="true"/></PermissionList>',
  );
  const metadata = concat([
    uint32Bytes(BINARY_VERSION),
    lengthPrefixed(utf8.encode(metadataXml(members, textDigest(section)))),
    uint32Bytes(0),
  ]);
  // 2.6 allows a one-byte null binding instead of a DPAPI checksum; readers then use default permissions.
  const bindings = Uint8Array.of(0);

  return concat([
    uint32Bytes(BINARY_VERSION),
    lengthPrefixed(packageParts),
    lengthPrefixed(permissions),
    lengthPrefixed(metadata),
    lengthPrefixed(bindings),
  ]);
}

function guid(): string {
  return `{${crypto.randomUUID().toUpperCase()}}`;
}

interface PowerQueryParts {
  readonly workbookRelationships: ReadonlyArray<{ type: string; target: string }>;
  readonly contentTypeOverrides: ReadonlyArray<{ part: string; contentType: string }>;
  readonly parts: readonly ZipPart[];
  readonly tables: ReadonlyMap<string, QueryTableBinding>;
}

/**
 * Parts to write for the saved queries, or undefined when retained parts are
 * still valid, there are no queries, or no codec is given. Differences
 * between M and the engine are reported as warnings.
 */
function preparePowerQuery(
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
): PowerQueryParts | undefined {
  const queries = snapshot.workbook.queries ?? [];
  const source = snapshot.workbook.xlsxSource;
  const digest = queriesDigest(queries);
  const codec = context.options?.powerQuery;
  const retained = source?.graphs.find(
    (graph) => graph.queries === digest && relationshipTypeMatches(graph.type, "connections"),
  );
  if (source?.graphs.some((graph) => graph.queries === digest)) {
    // Unchanged retained parts keep their M byte-for-byte; tables still bind to their connections.
    return retained && codec && queries.length > 0
      ? {
          workbookRelationships: [],
          contentTypeOverrides: [],
          parts: [],
          tables: retainedBindings(source, retained.target, queries, codec),
        }
      : undefined;
  }
  if (queries.length === 0) return undefined;

  if (!codec) {
    queryWarning(
      context,
      "Saved queries were written as table values only; no Power Query codec was given",
    );
    return undefined;
  }

  const exported = codec.encode(queries);
  for (const loss of exported.losses) {
    queryWarning(
      context,
      `Query ${loss.query}${loss.step === null ? "" : ` step ${loss.step + 1}`} differs in Excel: ${loss.code}`,
    );
  }

  const used = new Set((source?.parts ?? []).map((part) => part.name.toLowerCase()));
  let number = 1;
  while (used.has(`customxml/item${number}.xml`) || used.has(`customxml/itemprops${number}.xml`))
    number += 1;

  const tables = new Map<string, QueryTableBinding>();
  const tableNames = new Map(
    workbookTables(snapshot).map((entry) => [entry.table.id, entry.table.name]),
  );
  const members: MemberEntry[] = queries.map((query, index) => {
    const tableName = query.output ? tableNames.get(query.output.table) : undefined;
    return { member: exported.members[index] ?? query.name, ...(tableName ? { tableName } : {}) };
  });

  const itemPart = `customXml/item${number}.xml`;
  const propsPart = `customXml/itemProps${number}.xml`;
  const item = `<?xml version="1.0" encoding="utf-8"?><DataMashup xmlns="${DATA_MASHUP_NS}">${encodeBase64(mashupBinary(exported.section, members))}</DataMashup>`;
  const props = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><ds:datastoreItem ds:itemID="${guid()}" xmlns:ds="${CUSTOM_XML_PROPS_NS}"><ds:schemaRefs><ds:schemaRef ds:uri="${DATA_MASHUP_NS}"/></ds:schemaRefs></ds:datastoreItem>`;
  const itemRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELATIONSHIPS_NS}"><Relationship Id="rId1" Type="${CUSTOM_XML_PROPS_REL}" Target="itemProps${number}.xml"/></Relationships>`;
  const parts: ZipPart[] = [
    { name: itemPart, data: utf8.encode(item) },
    { name: propsPart, data: utf8.encode(props) },
    { name: `customXml/_rels/item${number}.xml.rels`, data: utf8.encode(itemRels) },
  ];
  const overrides = [
    { part: itemPart, contentType: XML_CONTENT },
    { part: propsPart, contentType: CUSTOM_XML_PROPS_CONTENT },
    { part: `customXml/_rels/item${number}.xml.rels`, contentType: RELATIONSHIPS_CONTENT },
  ];
  const relationships = [{ type: CUSTOM_XML_REL, target: `../${itemPart}` }];

  // A workbook has one connections part; a retained one keeps its other connections.
  const retainedConnections = source?.graphs.some(
    (graph) => graph.queries === undefined && relationshipTypeMatches(graph.type, "connections"),
  );
  const bound = members.filter((member) => member.tableName !== undefined);
  if (retainedConnections) {
    if (bound.length > 0) {
      queryWarning(
        context,
        "Output tables were not bound to their queries because the workbook keeps other data connections",
      );
    }
  } else if (bound.length > 0) {
    const connections = bound.map((member, index) => {
      const id = index + 1;
      const table = queries.find((_query, position) => members[position] === member)?.output?.table;
      if (table) tables.set(table, { connectionId: id });

      return `<connection id="${id}" keepAlive="1" name="${escapeXml(`Query - ${member.member}`)}" description="${escapeXml(`Connection to the '${member.member}' query in the workbook.`)}" type="${OLE_DB_CONNECTION}" refreshedVersion="8" background="1" saveData="1"><dbPr connection="${escapeXml(`${MASHUP_PROVIDER}${member.member};Extended Properties=""`)}" command="${escapeXml(`SELECT * FROM [${member.member}]`)}"/></connection>`;
    });
    parts.push({
      name: "xl/connections.xml",
      data: utf8.encode(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><connections xmlns="${MAIN_NS}">${connections.join("")}</connections>`,
      ),
    });
    overrides.push({ part: "xl/connections.xml", contentType: CONNECTIONS_CONTENT });
    relationships.push({ type: CONNECTIONS_REL, target: "connections.xml" });
  }

  return { workbookRelationships: relationships, contentTypeOverrides: overrides, parts, tables };
}

/** Connection ids in a retained connections part, by the query each one names. */
function retainedBindings(
  source: NonNullable<WorkbookSnapshot["workbook"]["xlsxSource"]>,
  target: string,
  queries: readonly SavedQuery[],
  codec: PowerQueryCodec,
): Map<string, QueryTableBinding> {
  const bindings = new Map<string, QueryTableBinding>();
  const part = source.parts.find((candidate) => candidate.name === target);
  if (!part) return bindings;

  const compressed = Uint8Array.from(atob(part.data), (character) => character.charCodeAt(0));
  const bytes =
    part.method === 0
      ? compressed
      : inflateSync(compressed, { out: new Uint8Array(part.uncompressedSize) });
  const text = utf8Decoder.decode(bytes);
  const members = codec.encode(queries).members;

  queries.forEach((query, index) => {
    const member = members[index];
    if (!query.output || member === undefined) return;

    // The connection Excel writes names its query after `Location=`.
    const location = escapeXml(`Location=${member};`);
    for (const match of text.matchAll(
      /<connection\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/connection>/gu,
    )) {
      if (match[2]?.includes(location)) {
        bindings.set(query.output.table, { connectionId: Number(match[1]) });
        break;
      }
    }
  });

  return bindings;
}

/**
 * Adds the query parts to the retained-part hook. The query hook only adds
 * workbook relationships, parts and table bindings, so the retained hook's
 * relationship ids for pivot caches stay first and unchanged.
 */
export function withPowerQuery(
  preserved: WorkbookWriteHook | undefined,
  snapshot: WorkbookSnapshot,
  context: XlsxCodecContext,
): WorkbookWriteHook | undefined {
  const query = preparePowerQuery(snapshot, context);
  if (!query) return preserved;

  const workbookXml = preserved?.workbookXml;
  const ownCount = preserved?.workbookRelationships?.length ?? 0;
  return {
    ...preserved,
    workbookRelationships: [
      ...(preserved?.workbookRelationships ?? []),
      ...query.workbookRelationships,
    ],
    contentTypeOverrides: [
      ...(preserved?.contentTypeOverrides ?? []),
      ...query.contentTypeOverrides,
    ],
    ...(workbookXml
      ? { workbookXml: (ids: readonly string[]) => workbookXml(ids.slice(0, ownCount)) }
      : {}),
    *parts() {
      yield* preserved?.parts?.() ?? [];
      yield* query.parts;
    },
    queryTable: (table) => query.tables.get(table.id),
  };
}
