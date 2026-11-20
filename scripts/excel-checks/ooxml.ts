/**
 * A small reader for the parts of an XLSX file the Excel checks compare:
 * cell values and formulas, tables, charts, external links and the
 * workbook's data model relationships. It reads what the file says, without
 * Sheetwrite's import, so it shows exactly what Excel saved.
 */
import { inflateRawSync } from "node:zlib";

/** One XML element, with its namespace prefix dropped from its name. */
export interface XmlNode {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlNode[];
  text: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const DECIMAL = 10;
const HEXADECIMAL = 16;

function unescapeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (entity: string, name: string) => {
    if (name.startsWith("#x"))
      return String.fromCodePoint(Number.parseInt(name.slice(2), HEXADECIMAL));
    if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), DECIMAL));
    return ENTITIES[name] ?? entity;
  });
}

const localName = (name: string) => name.slice(name.indexOf(":") + 1);

/** Parse XML into elements; declarations, comments and processing instructions are skipped. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#document", attributes: {}, children: [], text: "" };
  const open: XmlNode[] = [root];
  const token =
    /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const match of xml.matchAll(token)) {
    const [, cdata, closing, name, attributeText, selfClosing, text] = match;
    const parent = open[open.length - 1];
    if (!parent) throw new Error("XML closes more elements than it opens");
    if (cdata !== undefined) parent.text += cdata;
    else if (text !== undefined) parent.text += unescapeXml(text);
    else if (name === undefined) continue;
    else if (closing) open.pop();
    else {
      const attributes: Record<string, string> = {};
      for (const [, key, value] of (attributeText ?? "").matchAll(/([^\s=]+)\s*=\s*"([^"]*)"/g)) {
        if (key !== undefined && value !== undefined)
          attributes[localName(key)] = unescapeXml(value);
      }
      const element: XmlNode = { name: localName(name), attributes, children: [], text: "" };
      parent.children.push(element);
      if (!selfClosing) open.push(element);
    }
  }
  return root;
}

export const childrenOf = (node: XmlNode | undefined, name: string) =>
  node?.children.filter((child) => child.name === name) ?? [];
export const childOf = (node: XmlNode | undefined, name: string) =>
  node?.children.find((child) => child.name === name);

/** Every element named `name` under `node`, in document order. */
export function descendants(node: XmlNode | undefined, name: string): XmlNode[] {
  if (!node) return [];
  return node.children.flatMap((child) => [
    ...(child.name === name ? [child] : []),
    ...descendants(child, name),
  ]);
}

/** The text of an element and everything under it, as Excel's rich text runs join. */
export function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  return node.text + node.children.map(textOf).join("");
}

/** A cell as the file holds it: its value as text, its type and its formula. */
export interface FileCell {
  readonly value: string;
  /** SpreadsheetML cell type: `s`, `str`, `inlineStr`, `b`, `e` or `n`. */
  readonly type: string;
  readonly formula?: string;
}

interface Relationship {
  readonly target: string;
  readonly type: string;
  readonly external: boolean;
}

function joinPath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

// ZIP layout (APPNOTE.TXT 4.3): the end of central directory record points to
// the central directory, whose headers point to each entry's local header.
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

/** The entries of a ZIP file by path. XLSX files need neither ZIP64 nor encryption. */
function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.byteLength - END_RECORD_SIZE;
  const lowest = Math.max(0, end - MAX_COMMENT);
  while (end >= lowest && view.getUint32(end, true) !== END_OF_CENTRAL_DIRECTORY) end--;
  if (end < lowest) throw new Error("Not a ZIP file: no end of central directory record");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const names = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index++) {
    if (view.getUint32(offset, true) !== CENTRAL_HEADER)
      throw new Error("Broken ZIP central directory");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = names.decode(
      bytes.subarray(offset + CENTRAL_HEADER_SIZE, offset + CENTRAL_HEADER_SIZE + nameLength),
    );
    const dataStart =
      local +
      LOCAL_HEADER_SIZE +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === STORED) entries.set(name, data);
    else if (method === DEFLATED) entries.set(name, new Uint8Array(inflateRawSync(data)));
    else throw new Error(`ZIP entry ${name} uses compression method ${method}`);
    offset += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** An XLSX package, read once. */
export class XlsxPackage {
  private readonly files: Map<string, Uint8Array>;
  private sharedStrings: string[] | undefined;

  constructor(bytes: Uint8Array) {
    this.files = unzip(bytes);
  }

  get paths(): string[] {
    return [...this.files.keys()];
  }

  text(path: string): string | undefined {
    const file = this.files.get(path);
    return file ? new TextDecoder().decode(file) : undefined;
  }

  xml(path: string): XmlNode | undefined {
    const text = this.text(path);
    return text === undefined ? undefined : parseXml(text);
  }

  /** The relationships of `path`, by ID, with targets resolved to package paths. */
  relationships(path: string): Map<string, Relationship> {
    const slash = path.lastIndexOf("/");
    const relsPath = `${path.slice(0, slash + 1)}_rels/${path.slice(slash + 1)}.rels`;
    const map = new Map<string, Relationship>();
    for (const rel of descendants(this.xml(relsPath), "Relationship")) {
      const { Id: id, Target: target = "", Type: type = "", TargetMode: mode } = rel.attributes;
      if (id === undefined) continue;
      const external = mode === "External";
      map.set(id, { target: external ? target : joinPath(path, target), type, external });
    }
    return map;
  }

  /** Parts that `path` relates to with a relationship type ending in `/kind`. */
  related(path: string, kind: string): Relationship[] {
    return [...this.relationships(path).values()].filter((rel) => rel.type.endsWith(`/${kind}`));
  }

  /** Worksheet part of the sheet named `name`. */
  sheetPath(name: string): string | undefined {
    const workbook = this.xml("xl/workbook.xml");
    const rels = this.relationships("xl/workbook.xml");
    const sheet = descendants(workbook, "sheet").find(
      (candidate) => candidate.attributes.name === name,
    );
    const id = sheet?.attributes.id;
    return id === undefined ? undefined : rels.get(id)?.target;
  }

  private strings(): string[] {
    // A string item is one <t>, or rich text runs <r><t>; phonetic runs <rPh> are not shown.
    this.sharedStrings ??= childrenOf(childOf(this.xml("xl/sharedStrings.xml"), "sst"), "si").map(
      (item) =>
        item.children
          .map((part) =>
            part.name === "t"
              ? part.text
              : part.name === "r"
                ? (childOf(part, "t")?.text ?? "")
                : "",
          )
          .join(""),
    );
    return this.sharedStrings;
  }

  /** The cells of sheet `name` by A1 reference. */
  cells(name: string): Map<string, FileCell> {
    const path = this.sheetPath(name);
    const cells = new Map<string, FileCell>();
    if (!path) return cells;
    for (const cell of descendants(this.xml(path), "c")) {
      const ref = cell.attributes.r;
      if (ref === undefined) continue;
      const type = cell.attributes.t ?? "n";
      const raw = childOf(cell, "v")?.text ?? "";
      const value =
        type === "s"
          ? (this.strings()[Number(raw)] ?? "")
          : type === "inlineStr"
            ? descendants(childOf(cell, "is"), "t")
                .map((run) => run.text)
                .join("")
            : type === "b"
              ? raw === "1"
                ? "TRUE"
                : "FALSE"
              : raw;
      const formula = childOf(cell, "f")?.text;
      cells.set(ref, { value, type, ...(formula ? { formula } : {}) });
    }
    return cells;
  }

  /** Table parts of sheet `name`. */
  tables(name: string): XmlNode[] {
    const path = this.sheetPath(name);
    if (!path) return [];
    return this.related(path, "table").flatMap((rel) => childrenOf(this.xml(rel.target), "table"));
  }

  /** Chart parts drawn on sheet `name`, in drawing order. */
  charts(name: string): { path: string; chartSpace: XmlNode | undefined }[] {
    const path = this.sheetPath(name);
    if (!path) return [];
    return this.related(path, "drawing").flatMap((drawing) =>
      this.related(drawing.target, "chart").map((chart) => ({
        path: chart.target,
        chartSpace: childOf(this.xml(chart.target), "chartSpace"),
      })),
    );
  }

  /** Relationship types from sheet `name`, such as `pivotTable`. */
  sheetRelationshipKinds(name: string): string[] {
    const path = this.sheetPath(name);
    if (!path) return [];
    return [...this.relationships(path).values()].map((rel) =>
      rel.type.slice(rel.type.lastIndexOf("/") + 1),
    );
  }
}
