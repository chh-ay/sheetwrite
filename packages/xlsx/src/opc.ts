import {
  CONTENT_TYPES_NS,
  PACKAGE_RELATIONSHIPS_NS,
  RELATIONSHIPS_NS,
  STRICT_RELATIONSHIPS_NS,
} from "./format.js";
import { boundedErrorText, emitWarning, type XlsxCodecContext } from "./resources.js";
import {
  assertXmlRoot,
  escapeXml,
  parseXml,
  XmlBuffer,
  type XmlElement,
  xmlAttribute,
  xmlChildren,
  xmlLocalName,
} from "./xml.js";
import { asciiFold, normalizeDecodedPartName, normalizePartName, ZipReader } from "./zip.js";

export function relationshipTypeMatches(type: string, kind: string): boolean {
  return type === `${RELATIONSHIPS_NS}/${kind}` || type === `${STRICT_RELATIONSHIPS_NS}/${kind}`;
}

export interface OpcRelationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external: boolean;
}

function opc_failure(message: string, cause?: unknown): never {
  throw new TypeError(
    boundedErrorText(`Sheetwrite: invalid XLSX OPC package: ${message}`),
    cause === undefined ? undefined : { cause },
  );
}

/** The relationships part of `sourcePart`; the package's own is `_rels/.rels`. */
export function relationshipsPart(sourcePart: string): string {
  if (sourcePart === "") return "_rels/.rels";
  const slash = sourcePart.lastIndexOf("/");
  const directory = slash < 0 ? "" : sourcePart.slice(0, slash + 1);
  const filename = sourcePart.slice(slash + 1);
  return `${directory}_rels/${filename}.rels`;
}

/** The part whose relationships `part` holds; `""` for the package's own. */
export function relationshipSourcePart(part: string): string {
  if (part.toLowerCase() === "_rels/.rels") return "";
  const match = /^(.*\/)?_rels\/([^/]+)\.rels$/i.exec(part);
  if (!match) return opc_failure(`relationship part name ${part} is invalid`);
  return `${match[1] ?? ""}${match[2]}`;
}

export function resolveRelationshipTarget(sourcePart: string, rawTarget: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawTarget);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    return opc_failure(`relationship target ${rawTarget} has invalid escaping`, error);
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.includes("?") ||
    decoded.includes("#")
  ) {
    return opc_failure(`relationship target ${rawTarget} is unsafe`);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded))
    return opc_failure(`internal relationship target ${rawTarget} has a URI scheme`);
  const output = decoded.startsWith("/")
    ? []
    : sourcePart
        .slice(0, Math.max(0, sourcePart.lastIndexOf("/") + 1))
        .split("/")
        .filter(Boolean);
  for (const segment of decoded.replace(/^\/+/, "").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (output.length === 0)
        return opc_failure(`relationship target ${rawTarget} escapes the package`);
      output.pop();
    } else output.push(segment);
  }
  return normalizeDecodedPartName(output.join("/"), rawTarget);
}

function parse_relationships(
  root: XmlElement,
  source_part: string,
  context: XlsxCodecContext,
): OpcRelationship[] {
  assertXmlRoot(root, "Relationships", [PACKAGE_RELATIONSHIPS_NS], relationshipsPart(source_part));
  const relationships: OpcRelationship[] = [];
  const ids = new Set<string>();
  for (const element of xmlChildren(root, "Relationship")) {
    const id = xmlAttribute(element, "Id");
    const type = xmlAttribute(element, "Type");
    const raw_target = xmlAttribute(element, "Target");
    if (!id || !type || !raw_target)
      return opc_failure(`relationship in ${relationshipsPart(source_part)} is incomplete`);
    if (ids.has(id))
      return opc_failure(`duplicate relationship id ${id} in ${relationshipsPart(source_part)}`);
    ids.add(id);
    const external = xmlAttribute(element, "TargetMode") === "External";
    if (external && !relationshipTypeMatches(type, "hyperlink")) {
      emitWarning(context, {
        code: "external-relationship",
        message: `External relationship ${id} was not followed`,
        part: source_part || "/",
      });
    }
    relationships.push({
      id,
      type,
      target: external ? raw_target : resolveRelationshipTarget(source_part, raw_target),
      external,
    });
  }
  return relationships;
}

export class OpcPackage {
  readonly archive: ZipReader;
  readonly contentTypes = new Map<string, string>();
  readonly defaultContentTypes = new Map<string, string>();
  readonly #context: XlsxCodecContext;
  readonly #relationship_cache = new Map<string, readonly OpcRelationship[]>();
  readonly #resident = new Map<string, Uint8Array>();

  private constructor(archive: ZipReader, context: XlsxCodecContext) {
    this.#context = context;
    this.archive = archive;
  }

  static async open(
    input: Blob | ArrayBuffer | Uint8Array,
    context: XlsxCodecContext,
  ): Promise<OpcPackage> {
    const archive = await ZipReader.open(input, context);
    const package_file = new OpcPackage(archive, context);
    package_file.#initialize_types(
      parseXml(await archive.read("[Content_Types].xml"), "[Content_Types].xml", context),
    );
    for (const part of archive.entries.keys()) {
      if (!part.toLowerCase().endsWith(".rels")) continue;
      const source = relationshipSourcePart(part);
      package_file.#relationship_cache.set(
        asciiFold(source),
        parse_relationships(parseXml(await archive.read(part), part, context), source, context),
      );
    }
    return package_file;
  }

  #initialize_types(root: XmlElement): void {
    const context = this.#context;
    assertXmlRoot(root, "Types", [CONTENT_TYPES_NS], "[Content_Types].xml");
    for (const item of root.children) {
      const local = xmlLocalName(item.name);
      const content_type = xmlAttribute(item, "ContentType");
      if (!content_type) opc_failure("content type declaration is incomplete");
      if (local === "Default") {
        const extension = xmlAttribute(item, "Extension")?.toLowerCase();
        if (!extension) opc_failure("default content type has no extension");
        this.defaultContentTypes.set(extension, content_type);
      } else if (local === "Override") {
        const raw_name = xmlAttribute(item, "PartName");
        if (!raw_name?.startsWith("/")) opc_failure("override part name must be absolute");
        const name = normalizePartName(raw_name.slice(1));
        const folded_name = asciiFold(name);
        if (!this.archive.has(name)) {
          emitWarning(context, {
            code: "unsupported-feature",
            message: `Ignored content type for missing part ${name}`,
            part: name,
          });
          continue;
        }
        this.contentTypes.set(folded_name, content_type);
      }
    }
  }

  read(part: string): Uint8Array {
    const name = normalizePartName(part);
    const bytes = this.#resident.get(asciiFold(name));
    if (!bytes)
      throw new Error(`Sheetwrite: XLSX part ${name} must be loaded before synchronous parsing`);
    return bytes;
  }

  readXml(part: string): XmlElement {
    const name = normalizePartName(part);
    return parseXml(this.read(name), name, this.#context);
  }

  async readBytes(part: string): Promise<Uint8Array> {
    return this.archive.read(normalizePartName(part));
  }

  async load(parts: readonly string[]): Promise<void> {
    for (const part of parts)
      this.#resident.set(asciiFold(normalizePartName(part)), await this.readBytes(part));
  }

  release(parts: readonly string[]): void {
    for (const part of parts) this.#resident.delete(asciiFold(normalizePartName(part)));
  }

  relationships(sourcePart: string): readonly OpcRelationship[] {
    const normalized_source = sourcePart === "" ? "" : normalizePartName(sourcePart);
    const key = normalized_source === "" ? "" : asciiFold(normalized_source);
    const cached = this.#relationship_cache.get(key);
    if (cached) return cached;
    return [];
  }

  relationship(sourcePart: string, id: string): OpcRelationship {
    const relationship = this.relationships(sourcePart).find((candidate) => candidate.id === id);
    if (!relationship || relationship.external)
      return opc_failure(`relationship ${id} from ${sourcePart || "/"} is unavailable`);
    return relationship;
  }

  officeDocumentPart(): string {
    const relationship = this.relationships("").find(
      (candidate) =>
        relationshipTypeMatches(candidate.type, "officeDocument") && !candidate.external,
    );
    if (!relationship) return opc_failure("office document relationship is missing");
    return relationship.target;
  }

  contentType(part: string): string | undefined {
    const normalized = normalizePartName(part);
    const exact = this.contentTypes.get(asciiFold(normalized));
    if (exact) return exact;
    const dot = normalized.lastIndexOf(".");
    return dot < 0
      ? undefined
      : this.defaultContentTypes.get(normalized.slice(dot + 1).toLowerCase());
  }
}

export interface ContentTypeOverride {
  readonly part: string;
  readonly contentType: string;
}

export function contentTypesXml(
  overrides: readonly ContentTypeOverride[],
  context: XlsxCodecContext,
  defaults: readonly { extension: string; contentType: string }[] = [],
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(`<Types xmlns="${CONTENT_TYPES_NS}">`);
  xml.append(
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  );
  xml.append('<Default Extension="xml" ContentType="application/xml"/>');
  for (const entry of defaults) {
    if (entry.extension === "rels" || entry.extension === "xml") continue;
    xml.append(
      `<Default Extension="${escapeXml(entry.extension)}" ContentType="${escapeXml(entry.contentType)}"/>`,
    );
  }
  for (const override of [...overrides].sort((left, right) =>
    left.part.localeCompare(right.part),
  )) {
    xml.append(
      `<Override PartName="/${escapeXml(normalizePartName(override.part))}" ContentType="${escapeXml(override.contentType)}"/>`,
    );
  }
  xml.append("</Types>");
  return xml.finish();
}

export function relationshipsXml(
  relationships: readonly (Pick<OpcRelationship, "id" | "type" | "target"> & {
    readonly external?: boolean;
  })[],
  context: XlsxCodecContext,
): Uint8Array {
  const xml = new XmlBuffer(context);
  xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  xml.append(`<Relationships xmlns="${PACKAGE_RELATIONSHIPS_NS}">`);
  for (const relationship of relationships) {
    xml.append(
      `<Relationship Id="${escapeXml(relationship.id)}" Type="${escapeXml(relationship.type)}" Target="${escapeXml(relationship.target)}"${relationship.external ? ' TargetMode="External"' : ""}/>`,
    );
  }
  xml.append("</Relationships>");
  return xml.finish();
}
