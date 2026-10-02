import { assertResource, checkAbort, type XlsxCodecContext } from "./resources.js";

const UTF8 = new TextDecoder("utf-8", { fatal: true });
const ENCODER = new TextEncoder();

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  readonly text: string;
}

interface MutableXmlElement {
  name: string;
  attributes: Record<string, string>;
  children: MutableXmlElement[];
  text: string;
  textBytes: number;
}

/**
 * Streams the children of one element instead of retaining them in the tree.
 * Used for the part elements whose child count dominates import memory; every
 * other element keeps the tree reader.
 */
export interface XmlChildStream {
  /** Local name of the element whose children are streamed. */
  readonly parent: string;
  /** Whether the streamed parent is the document root or a direct child of it. */
  readonly parentIsRoot: boolean;
  /**
   * Called before the streamed parent's children are parsed, with the decoded
   * document text, the offset just after its start tag, and the root element
   * built so far. Returning false keeps the children in the tree instead.
   */
  readonly shouldStream?: (xml: string, startOffset: number, root: XmlElement) => boolean;
  /** Receives each direct child instead of retaining it, in document order. */
  readonly child: (element: XmlElement, root: XmlElement) => void;
}

function xmlFailure(part: string, message: string): never {
  throw new TypeError(`Sheetwrite: invalid XLSX XML in ${part}: ${message}`);
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const trail = value.charCodeAt(index + 1);
      if (trail >= 0xdc00 && trail <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

function decodeXmlEntities(value: string, part: string): string {
  if (!value.includes("&")) return value;
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf("&", cursor);
    if (ampersand < 0) {
      output += value.slice(cursor);
      break;
    }
    output += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon < 0) return xmlFailure(part, "unterminated entity reference");
    const entity = value.slice(ampersand + 1, semicolon);
    if (entity === "amp") output += "&";
    else if (entity === "lt") output += "<";
    else if (entity === "gt") output += ">";
    else if (entity === "quot") output += '"';
    else if (entity === "apos") output += "'";
    else {
      const numeric = /^#(\d+)$/.exec(entity);
      const hexadecimal = /^#x([\da-f]+)$/i.exec(entity);
      if (!numeric && !hexadecimal) return xmlFailure(part, `unknown entity &${entity};`);
      const codePoint = Number.parseInt(numeric?.[1] ?? hexadecimal![1]!, numeric ? 10 : 16);
      const validXmlCharacter =
        codePoint === 0x9 ||
        codePoint === 0xa ||
        codePoint === 0xd ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff);
      if (!validXmlCharacter) {
        return xmlFailure(part, `invalid character reference &${entity};`);
      }
      output += String.fromCodePoint(codePoint);
    }
    cursor = semicolon + 1;
  }
  return output;
}

/** Characters matched by `/\s/` beyond the ASCII ones checked inline. */
const NON_ASCII_SPACE = /\s/;
const ASCII_SPACE = 0x20;
const ASCII_TAB = 0x09;
const ASCII_CARRIAGE_RETURN = 0x0d;
const ASCII_MAX = 0x7f;
const CODE_QUOTE = 0x22;
const CODE_APOSTROPHE = 0x27;
const CODE_GREATER_THAN = 0x3e;
const CODE_SLASH = 0x2f;
const CODE_EQUALS = 0x3d;

/** Same set as `/\s/.test(char)`; NaN (past the end) is not space. */
function isXmlSpace(code: number): boolean {
  if (code === ASCII_SPACE || (code >= ASCII_TAB && code <= ASCII_CARRIAGE_RETURN)) return true;
  return code > ASCII_MAX && NON_ASCII_SPACE.test(String.fromCharCode(code));
}

/**
 * End offset of the name starting at `start`, or `start` when there is none.
 * Same grammar as `XML_NAME`: `[A-Za-z_][A-Za-z0-9_.:-]*`.
 */
function scanXmlName(source: string, start: number): number {
  const first = source.charCodeAt(start) | 0x20;
  const firstIsLetter = first >= 0x61 && first <= 0x7a;
  if (!firstIsLetter && source.charCodeAt(start) !== 0x5f) return start;
  let index = start + 1;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    const lower = code | 0x20;
    const isNameChar =
      (lower >= 0x61 && lower <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x5f ||
      code === 0x2e ||
      code === 0x3a ||
      code === 0x2d;
    if (!isNameChar) break;
    index += 1;
  }
  return index;
}

function findTagEnd(xml: string, start: number, part: string): number {
  let quote = 0;
  for (let index = start; index < xml.length; index++) {
    const code = xml.charCodeAt(index);
    if (quote !== 0) {
      if (code === quote) quote = 0;
    } else if (code === CODE_QUOTE || code === CODE_APOSTROPHE) quote = code;
    else if (code === CODE_GREATER_THAN) return index;
  }
  return xmlFailure(part, "unterminated tag");
}

function parseStartTag(
  source: string,
  part: string,
  context: XlsxCodecContext,
): { name: string; attributes: Record<string, string>; selfClosing: boolean } {
  let offset = 0;
  while (isXmlSpace(source.charCodeAt(offset))) offset += 1;
  const nameEnd = scanXmlName(source, offset);
  if (nameEnd === offset) return xmlFailure(part, "element name is invalid");
  const name = source.slice(offset, nameEnd);
  offset = nameEnd;
  const attributes: Record<string, string> = Object.create(null);
  let attributeCount = 0;
  let selfClosing = false;
  while (offset < source.length) {
    while (isXmlSpace(source.charCodeAt(offset))) offset += 1;
    if (source.charCodeAt(offset) === CODE_SLASH) {
      selfClosing = true;
      offset += 1;
      while (isXmlSpace(source.charCodeAt(offset))) offset += 1;
      if (offset !== source.length)
        return xmlFailure(part, "unexpected content after self-closing slash");
      break;
    }
    if (offset === source.length) break;
    const attributeEnd = scanXmlName(source, offset);
    if (attributeEnd === offset) return xmlFailure(part, `attribute on ${name} is invalid`);
    const attributeName = source.slice(offset, attributeEnd);
    offset = attributeEnd;
    while (isXmlSpace(source.charCodeAt(offset))) offset += 1;
    if (source.charCodeAt(offset) !== CODE_EQUALS) {
      return xmlFailure(part, `attribute ${attributeName} has no value`);
    }
    offset += 1;
    while (isXmlSpace(source.charCodeAt(offset))) offset += 1;
    const quote = source.charCodeAt(offset);
    if (quote !== CODE_QUOTE && quote !== CODE_APOSTROPHE)
      return xmlFailure(part, `attribute ${attributeName} is unquoted`);
    const end = source.indexOf(quote === CODE_QUOTE ? '"' : "'", offset + 1);
    if (end < 0) return xmlFailure(part, `attribute ${attributeName} is unterminated`);
    if (Object.hasOwn(attributes, attributeName))
      return xmlFailure(part, `attribute ${attributeName} is duplicated`);
    attributeCount += 1;
    assertResource(context, "maxXmlAttributesPerElement", attributeCount);
    const attributeValue = decodeXmlEntities(source.slice(offset + 1, end), part);
    assertResource(context, "maxXmlTextBytes", utf8Length(attributeValue));
    attributes[attributeName] = attributeValue;
    offset = end + 1;
  }
  return { name, attributes, selfClosing };
}

/** Parse a bounded XML part without DTDs, custom entities, or network-capable constructs. */
export function parseXml(
  bytes: Uint8Array,
  part: string,
  context: XlsxCodecContext,
  stream?: XmlChildStream,
): XmlElement {
  assertResource(context, "maxEntryUncompressedBytes", bytes.byteLength);
  let xml: string;
  try {
    xml = UTF8.decode(bytes);
  } catch {
    return xmlFailure(part, "content is not valid UTF-8");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return xmlFailure(part, "DTDs and entities are forbidden");
  const roots: MutableXmlElement[] = [];
  const stack: MutableXmlElement[] = [];
  const childStream = stream;
  let elementCount = 0;
  let cursor = 0;
  let streamedParent: MutableXmlElement | undefined;
  let streamedChild: MutableXmlElement | undefined;
  let streamedParentSeen = false;
  const appendText = (raw: string, cdata = false): void => {
    if (raw.length === 0) return;
    const current = stack.at(-1);
    const decoded = cdata ? raw : decodeXmlEntities(raw, part);
    const decodedBytes = utf8Length(decoded);
    if (!current) {
      if (decoded.trim().length > 0) xmlFailure(part, "text exists outside the root element");
      return;
    }
    current.textBytes += decodedBytes;
    assertResource(context, "maxXmlTextBytes", current.textBytes);
    current.text += decoded;
  };

  const deliverStreamedChild = (element: MutableXmlElement, sink: XmlChildStream): void => {
    const root = roots[0];
    if (root === undefined) xmlFailure(part, "expected one root element, found 0");
    sink.child(element, root);
  };

  while (cursor < xml.length) {
    if ((elementCount & 4_095) === 0) checkAbort(context);
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      appendText(xml.slice(cursor));
      cursor = xml.length;
      break;
    }
    appendText(xml.slice(cursor, open));
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0) return xmlFailure(part, "comment is unterminated");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      if (end < 0) return xmlFailure(part, "CDATA is unterminated");
      appendText(xml.slice(open + 9, end), true);
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end < 0) return xmlFailure(part, "processing instruction is unterminated");
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("</", open)) {
      const end = xml.indexOf(">", open + 2);
      if (end < 0) return xmlFailure(part, "closing tag is unterminated");
      const name = xml.slice(open + 2, end).trim();
      const current = stack.pop();
      if (!current || current.name !== name)
        return xmlFailure(part, `closing tag ${name} does not match`);
      if (streamedChild === current) {
        streamedChild = undefined;
        if (childStream) deliverStreamedChild(current, childStream);
      }
      if (streamedParent === current) streamedParent = undefined;
      cursor = end + 1;
      continue;
    }
    if (xml.startsWith("<!", open)) return xmlFailure(part, "unsupported declaration");
    const end = findTagEnd(xml, open + 1, part);
    const parsed = parseStartTag(xml.slice(open + 1, end), part, context);
    elementCount += 1;
    assertResource(context, "maxXmlElements", elementCount);
    const element: MutableXmlElement = {
      name: parsed.name,
      attributes: parsed.attributes,
      children: [],
      text: "",
      textBytes: 0,
    };
    const parent = stack.at(-1);
    const depth = stack.length + 1;
    if (parent) {
      if (streamedParent === parent) {
        if (parsed.selfClosing) {
          if (childStream) deliverStreamedChild(element, childStream);
        } else {
          streamedChild = element;
        }
      } else {
        parent.children.push(element);
      }
    } else {
      roots.push(element);
    }
    if (!parsed.selfClosing) {
      stack.push(element);
      assertResource(context, "maxXmlDepth", stack.length);
    }
    if (childStream && !streamedParentSeen) {
      const expectedDepth = childStream.parentIsRoot ? 1 : 2;
      if (depth === expectedDepth && xmlLocalName(element.name) === childStream.parent) {
        // Only the first matching element streams: it is the one the tree reader
        // would consume, so a later sibling keeps the tree path's behavior.
        streamedParentSeen = true;
        const root = roots[0];
        if (
          root !== undefined &&
          !parsed.selfClosing &&
          (childStream.shouldStream?.(xml, end + 1, root) ?? true)
        ) {
          streamedParent = element;
        }
      }
    }
    cursor = end + 1;
  }
  const unclosed = stack.at(-1);
  if (unclosed) return xmlFailure(part, `element ${unclosed.name} is unclosed`);
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) {
    return xmlFailure(part, `expected one root element, found ${roots.length}`);
  }
  return root;
}

export function xmlLocalName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
}

export function xmlChildren(element: XmlElement, localName: string): readonly XmlElement[] {
  return element.children.filter((child) => xmlLocalName(child.name) === localName);
}

export function xmlChild(element: XmlElement, localName: string): XmlElement | undefined {
  return element.children.find((child) => xmlLocalName(child.name) === localName);
}

export function xmlAttribute(element: XmlElement, localName: string): string | undefined {
  // Same first-match order as walking the attribute entries, but without
  // allocating an entry array or slicing each name: cell attributes are read
  // several times per cell.
  for (const name in element.attributes) {
    const colon = name.indexOf(":");
    const matches =
      colon < 0
        ? name === localName
        : name.length - colon - 1 === localName.length && name.startsWith(localName, colon + 1);
    if (matches) return element.attributes[name];
  }
  return undefined;
}

export function xmlBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

/** Decode SpreadsheetML's UTF-16 `_xHHHH_` string escapes. */
export function decodeXstring(value: string): string {
  if (!/_x[\da-f]{4}_/i.test(value)) return value;
  let output = "";
  for (let index = 0; index < value.length; ) {
    const literalEscape = /^_x005F_(x[\da-f]{4}_)/i.exec(value.slice(index));
    if (literalEscape) {
      output += `_${literalEscape[1]}`;
      index += literalEscape[0].length;
      continue;
    }
    const encoded = /^_x([\da-f]{4})_/i.exec(value.slice(index));
    if (encoded) {
      output += String.fromCharCode(Number.parseInt(encoded[1]!, 16));
      index += encoded[0].length;
      continue;
    }
    output += value[index]!;
    index += 1;
  }
  return output;
}

/** Encode XML-forbidden UTF-16 units and literal escape-looking text as ST_Xstring. */
export function encodeXstring(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x5f && /^x[\da-f]{4}_/i.test(value.slice(index + 1))) {
      output += "_x005F_";
    } else if (
      code <= 0x8 ||
      code === 0xb ||
      code === 0xc ||
      (code >= 0xe && code <= 0x1f) ||
      code === 0xfffe ||
      code === 0xffff ||
      (code >= 0xd800 &&
        code <= 0xdfff &&
        !(
          code <= 0xdbff &&
          index + 1 < value.length &&
          value.charCodeAt(index + 1) >= 0xdc00 &&
          value.charCodeAt(index + 1) <= 0xdfff
        ))
    ) {
      output += `_x${code.toString(16).toUpperCase().padStart(4, "0")}_`;
    } else {
      output += value[index]!;
      if (code >= 0xd800 && code <= 0xdbff) output += value[++index]!;
    }
  }
  return output;
}

/** True when the element is the expected OOXML root in an allowed namespace. */
export function xmlRootMatches(
  root: XmlElement,
  localName: string,
  namespaces: readonly string[],
): boolean {
  const colon = root.name.indexOf(":");
  const namespace =
    colon < 0 ? root.attributes.xmlns : root.attributes[`xmlns:${root.name.slice(0, colon)}`];
  return (
    xmlLocalName(root.name) === localName &&
    namespace !== undefined &&
    namespaces.includes(namespace)
  );
}

/** Require an expected OOXML root and one allowed Strict/Transitional namespace. */
export function assertXmlRoot(
  root: XmlElement,
  localName: string,
  namespaces: readonly string[],
  part: string,
): void {
  if (!xmlRootMatches(root, localName, namespaces)) {
    xmlFailure(part, `expected ${localName} in an allowed OOXML namespace`);
  }
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Incrementally bounds generated XML before joining and UTF-8 encoding it. */
export class XmlBuffer {
  readonly #parts: string[] = [];
  #bytes = 0;

  constructor(private readonly context: XlsxCodecContext) {}

  append(value: string): void {
    this.#bytes += utf8Length(value);
    assertResource(this.context, "maxEntryUncompressedBytes", this.#bytes);
    this.#parts.push(value);
  }

  appendText(value: string): void {
    const encoded = escapeXml(encodeXstring(value));
    assertResource(this.context, "maxXmlTextBytes", utf8Length(encoded));
    this.append(encoded);
  }

  finish(): Uint8Array {
    checkAbort(this.context);
    return ENCODER.encode(this.#parts.join(""));
  }
}
