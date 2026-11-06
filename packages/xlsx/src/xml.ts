import {
  assertResource,
  boundedErrorText,
  checkAbort,
  isAbort,
  type XlsxCodecContext,
} from "./resources.js";

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
   * Called before the streamed parent's children are parsed with the root
   * element built so far. Returning false keeps the children in the tree instead.
   */
  readonly shouldStream?: (root: XmlElement) => boolean;
  /** Receives each direct child instead of retaining it, in document order. */
  readonly child: (element: XmlElement, root: XmlElement) => void;
}

function xml_failure(part: string, message: string, cause?: unknown): never {
  throw new TypeError(
    boundedErrorText(`Sheetwrite: invalid XLSX XML in ${part}: ${message}`),
    cause === undefined ? undefined : { cause },
  );
}

function utf8_length(value: string): number {
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

function decode_xml_entities(value: string, part: string): string {
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
    if (semicolon < 0) return xml_failure(part, "unterminated entity reference");
    // One bound for every parser, so acceptance never depends on where the
    // streaming reader split its chunks (it holds back at most this many units).
    if (semicolon - ampersand >= MAX_HELD_ENTITY_LENGTH) {
      return xml_failure(part, "entity reference is too long");
    }
    const entity = value.slice(ampersand + 1, semicolon);
    if (entity === "amp") output += "&";
    else if (entity === "lt") output += "<";
    else if (entity === "gt") output += ">";
    else if (entity === "quot") output += '"';
    else if (entity === "apos") output += "'";
    else {
      const numeric = /^#(\d+)$/.exec(entity);
      const hexadecimal = /^#x([\da-f]+)$/i.exec(entity);
      if (!numeric && !hexadecimal) return xml_failure(part, `unknown entity &${entity};`);
      const code_point = Number.parseInt(numeric?.[1] ?? hexadecimal![1]!, numeric ? 10 : 16);
      const valid_xml_character =
        code_point === 0x9 ||
        code_point === 0xa ||
        code_point === 0xd ||
        (code_point >= 0x20 && code_point <= 0xd7ff) ||
        (code_point >= 0xe000 && code_point <= 0xfffd) ||
        (code_point >= 0x10000 && code_point <= 0x10ffff);
      if (!valid_xml_character) {
        return xml_failure(part, `invalid character reference &${entity};`);
      }
      output += String.fromCodePoint(code_point);
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
function is_xml_space(code: number): boolean {
  if (code === ASCII_SPACE || (code >= ASCII_TAB && code <= ASCII_CARRIAGE_RETURN)) return true;
  return code > ASCII_MAX && NON_ASCII_SPACE.test(String.fromCharCode(code));
}

/**
 * End offset of the name starting at `start`, or `start` when there is none.
 * Same grammar as `XML_NAME`: `[A-Za-z_][A-Za-z0-9_.:-]*`.
 */
function scan_xml_name(source: string, start: number): number {
  const first = source.charCodeAt(start) | 0x20;
  const first_is_letter = first >= 0x61 && first <= 0x7a;
  if (!first_is_letter && source.charCodeAt(start) !== 0x5f) return start;
  let index = start + 1;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    const lower = code | 0x20;
    const is_name_char =
      (lower >= 0x61 && lower <= 0x7a) ||
      (code >= 0x30 && code <= 0x39) ||
      code === 0x5f ||
      code === 0x2e ||
      code === 0x3a ||
      code === 0x2d;
    if (!is_name_char) break;
    index += 1;
  }
  return index;
}

function find_tag_end(xml: string, start: number, part: string): number {
  let quote = 0;
  for (let index = start; index < xml.length; index++) {
    const code = xml.charCodeAt(index);
    if (quote !== 0) {
      if (code === quote) quote = 0;
    } else if (code === CODE_QUOTE || code === CODE_APOSTROPHE) quote = code;
    else if (code === CODE_GREATER_THAN) return index;
  }
  return xml_failure(part, "unterminated tag");
}

function parse_start_tag(
  source: string,
  part: string,
  context: XlsxCodecContext,
): { name: string; attributes: Record<string, string>; selfClosing: boolean } {
  let offset = 0;
  while (is_xml_space(source.charCodeAt(offset))) offset += 1;
  const name_end = scan_xml_name(source, offset);
  if (name_end === offset) return xml_failure(part, "element name is invalid");
  const name = source.slice(offset, name_end);
  offset = name_end;
  const attributes: Record<string, string> = Object.create(null);
  let attribute_count = 0;
  let self_closing = false;
  while (offset < source.length) {
    while (is_xml_space(source.charCodeAt(offset))) offset += 1;
    if (source.charCodeAt(offset) === CODE_SLASH) {
      self_closing = true;
      offset += 1;
      while (is_xml_space(source.charCodeAt(offset))) offset += 1;
      if (offset !== source.length)
        return xml_failure(part, "unexpected content after self-closing slash");
      break;
    }
    if (offset === source.length) break;
    const attribute_end = scan_xml_name(source, offset);
    if (attribute_end === offset) return xml_failure(part, `attribute on ${name} is invalid`);
    const attribute_name = source.slice(offset, attribute_end);
    offset = attribute_end;
    while (is_xml_space(source.charCodeAt(offset))) offset += 1;
    if (source.charCodeAt(offset) !== CODE_EQUALS) {
      return xml_failure(part, `attribute ${attribute_name} has no value`);
    }
    offset += 1;
    while (is_xml_space(source.charCodeAt(offset))) offset += 1;
    const quote = source.charCodeAt(offset);
    if (quote !== CODE_QUOTE && quote !== CODE_APOSTROPHE)
      return xml_failure(part, `attribute ${attribute_name} is unquoted`);
    const end = source.indexOf(quote === CODE_QUOTE ? '"' : "'", offset + 1);
    if (end < 0) return xml_failure(part, `attribute ${attribute_name} is unterminated`);
    if (Object.hasOwn(attributes, attribute_name))
      return xml_failure(part, `attribute ${attribute_name} is duplicated`);
    attribute_count += 1;
    assertResource(context, "maxXmlAttributesPerElement", attribute_count);
    const attribute_value = decode_xml_entities(source.slice(offset + 1, end), part);
    assertResource(context, "maxXmlTextBytes", utf8_length(attribute_value));
    attributes[attribute_name] = attribute_value;
    offset = end + 1;
  }
  return { name, attributes, selfClosing: self_closing };
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
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return xml_failure(part, "content is not valid UTF-8", error);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return xml_failure(part, "DTDs and entities are forbidden");
  const roots: MutableXmlElement[] = [];
  const stack: MutableXmlElement[] = [];
  const child_stream = stream;
  let element_count = 0;
  let cursor = 0;
  let streamed_parent: MutableXmlElement | undefined;
  let streamed_child: MutableXmlElement | undefined;
  let streamed_parent_seen = false;
  const append_text = (raw: string, cdata = false): void => {
    if (raw.length === 0) return;
    const current = stack.at(-1);
    const decoded = cdata ? raw : decode_xml_entities(raw, part);
    const decoded_bytes = utf8_length(decoded);
    if (!current) {
      if (decoded.trim().length > 0) xml_failure(part, "text exists outside the root element");
      return;
    }
    current.textBytes += decoded_bytes;
    assertResource(context, "maxXmlTextBytes", current.textBytes);
    current.text += decoded;
  };

  const deliver_streamed_child = (element: MutableXmlElement, sink: XmlChildStream): void => {
    const root = roots[0];
    if (root === undefined) xml_failure(part, "expected one root element, found 0");
    sink.child(element, root);
  };

  while (cursor < xml.length) {
    if ((element_count & 4_095) === 0) checkAbort(context);
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      append_text(xml.slice(cursor));
      cursor = xml.length;
      break;
    }
    append_text(xml.slice(cursor, open));
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0) return xml_failure(part, "comment is unterminated");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      if (end < 0) return xml_failure(part, "CDATA is unterminated");
      append_text(xml.slice(open + 9, end), true);
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end < 0) return xml_failure(part, "processing instruction is unterminated");
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("</", open)) {
      const end = xml.indexOf(">", open + 2);
      if (end < 0) return xml_failure(part, "closing tag is unterminated");
      const name = xml.slice(open + 2, end).trim();
      const current = stack.pop();
      if (!current || current.name !== name)
        return xml_failure(part, `closing tag ${name} does not match`);
      if (streamed_child === current) {
        streamed_child = undefined;
        if (child_stream) deliver_streamed_child(current, child_stream);
      }
      if (streamed_parent === current) streamed_parent = undefined;
      cursor = end + 1;
      continue;
    }
    if (xml.startsWith("<!", open)) return xml_failure(part, "unsupported declaration");
    const end = find_tag_end(xml, open + 1, part);
    const parsed = parse_start_tag(xml.slice(open + 1, end), part, context);
    element_count += 1;
    assertResource(context, "maxXmlElements", element_count);
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
      if (streamed_parent === parent) {
        if (parsed.selfClosing) {
          if (child_stream) deliver_streamed_child(element, child_stream);
        } else {
          streamed_child = element;
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
    if (child_stream && !streamed_parent_seen) {
      const expected_depth = child_stream.parentIsRoot ? 1 : 2;
      if (depth === expected_depth && xmlLocalName(element.name) === child_stream.parent) {
        // Only the first matching element streams: it is the one the tree reader
        // would consume, so a later sibling keeps the tree path's behavior.
        streamed_parent_seen = true;
        const root = roots[0];
        if (
          root !== undefined &&
          !parsed.selfClosing &&
          (child_stream.shouldStream?.(root) ?? true)
        ) {
          streamed_parent = element;
        }
      }
    }
    cursor = end + 1;
  }
  const unclosed = stack.at(-1);
  if (unclosed) return xml_failure(part, `element ${unclosed.name} is unclosed`);
  const root = roots[0];
  if (roots.length !== 1 || root === undefined) {
    return xml_failure(part, `expected one root element, found ${roots.length}`);
  }
  return root;
}

const IGNORED_SECTIONS = {
  comment: { terminator: "-->", label: "comment" },
  cdata: { terminator: "]]>", label: "CDATA" },
  instruction: { terminator: "?>", label: "processing instruction" },
} as const;
const MARKUP_PREFIXES = ["<!--", "<![CDATA[", "<?", "</", "<!DOCTYPE", "<!ENTITY"] as const;
const MARKUP_PREFIX_LENGTH = 9;
/**
 * Longest held-back text after a trailing '&'. Every XML 1.0 character
 * reference without padding zeros fits; anything longer is decoded right away
 * so a stray '&' cannot make each new chunk rescan a growing buffer.
 */
const MAX_HELD_ENTITY_LENGTH = 32;

/** A start or closing tag still waiting for its '>' in a later chunk. */
interface OpenTag {
  readonly parts: string[];
  readonly closing: boolean;
  quote: number;
}

/**
 * Parse an inflated part without retaining its bytes or decoded document. Only
 * the current token, open ancestors and one streamed child remain resident.
 * The tree parser above remains the path for the small, non-worksheet parts.
 */
export async function parseXmlChunks(
  chunks: AsyncIterable<Uint8Array>,
  part: string,
  context: XlsxCodecContext,
  stream: Pick<XmlChildStream, "parent" | "parentIsRoot" | "child">,
): Promise<XmlElement> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const roots: MutableXmlElement[] = [];
  const stack: MutableXmlElement[] = [];
  let pending = "";
  let declaration_tail = "";
  let element_count = 0;
  let bytes_read = 0;
  let streamed_parent: MutableXmlElement | undefined;
  let streamed_child: MutableXmlElement | undefined;
  let first_parent: MutableXmlElement | undefined;
  let ignored: keyof typeof IGNORED_SECTIONS | undefined;
  let open_tag: OpenTag | undefined;

  const append_text = (raw: string, cdata = false): void => {
    if (!raw) return;
    const decoded = cdata ? raw : decode_xml_entities(raw, part);
    const current = stack.at(-1);
    if (!current) {
      if (decoded.trim()) xml_failure(part, "text exists outside the root element");
      return;
    }
    current.textBytes += utf8_length(decoded);
    assertResource(context, "maxXmlTextBytes", current.textBytes);
    current.text += decoded;
  };
  const deliver = (element: MutableXmlElement): void => {
    const root = roots[0];
    if (!root) return xml_failure(part, "expected one root element, found 0");
    if (streamed_parent === first_parent) stream.child(element, root);
  };
  const parse_pending = (final: boolean): void => {
    let cursor = 0;
    while (cursor < pending.length) {
      if ((element_count & 4_095) === 0) checkAbort(context);
      if (ignored) {
        const { terminator, label } = IGNORED_SECTIONS[ignored];
        const end = pending.indexOf(terminator, cursor);
        if (end < 0) {
          if (final) xml_failure(part, `${label} is unterminated`);
          // Keep only the suffix that could start the terminator, without
          // splitting a surrogate pair across text appends.
          let retain = Math.max(cursor, pending.length - (terminator.length - 1));
          const lead = pending.charCodeAt(retain - 1);
          if (retain > cursor && lead >= 0xd800 && lead <= 0xdbff) retain -= 1;
          if (ignored === "cdata") append_text(pending.slice(cursor, retain), true);
          cursor = retain;
          break;
        }
        if (ignored === "cdata") append_text(pending.slice(cursor, end), true);
        cursor = end + terminator.length;
        ignored = undefined;
        continue;
      }
      if (pending[cursor] !== "<") {
        const open = pending.indexOf("<", cursor);
        if (open < 0 && !final) {
          // An entity may straddle chunks. Everything before its final '&'
          // can be decoded immediately, so long text nodes need no raw buffer.
          const ampersand = pending.lastIndexOf("&");
          const hold_entity =
            ampersand >= cursor &&
            pending.length - ampersand <= MAX_HELD_ENTITY_LENGTH &&
            pending.indexOf(";", ampersand) < 0;
          const end = hold_entity ? ampersand : pending.length;
          append_text(pending.slice(cursor, end));
          cursor = end;
          break;
        }
        const end = open < 0 ? pending.length : open;
        append_text(pending.slice(cursor, end));
        cursor = end;
        continue;
      }
      if (!final && pending.length - cursor < MARKUP_PREFIX_LENGTH) {
        // A comment, CDATA, instruction, closing tag or forbidden declaration
        // may be cut by the chunk boundary; wait for its distinguishing prefix.
        const remaining = pending.slice(cursor).toUpperCase();
        const ambiguous = MARKUP_PREFIXES.some(
          (prefix) => prefix.length > remaining.length && prefix.startsWith(remaining),
        );
        if (ambiguous) break;
      }
      if (pending.startsWith("<!--", cursor)) {
        ignored = "comment";
        cursor += 4;
        continue;
      }
      if (pending.startsWith("<![CDATA[", cursor)) {
        ignored = "cdata";
        cursor += 9;
        continue;
      }
      if (pending.startsWith("<?", cursor)) {
        ignored = "instruction";
        cursor += 2;
        continue;
      }
      if (pending.startsWith("<!", cursor)) xml_failure(part, "unsupported declaration");
      const closing = pending.startsWith("</", cursor);
      let end = cursor + (closing ? 2 : 1);
      let quote = 0;
      for (; end < pending.length; end++) {
        const code = pending.charCodeAt(end);
        if (quote) {
          if (quote === code) quote = 0;
        } else if (!closing && (code === CODE_QUOTE || code === CODE_APOSTROPHE)) quote = code;
        else if (code === CODE_GREATER_THAN) break;
      }
      if (end === pending.length) {
        if (final) xml_failure(part, closing ? "closing tag is unterminated" : "unterminated tag");
        // Later chunks are scanned only for this tag's '>' and joined once,
        // so one long tag is not rescanned from its start for every chunk.
        open_tag = { parts: [pending.slice(cursor)], closing, quote };
        cursor = pending.length;
        break;
      }
      if (closing) {
        const name = pending.slice(cursor + 2, end).trim();
        const current = stack.pop();
        if (!current || current.name !== name)
          xml_failure(part, `closing tag ${name} does not match`);
        if (streamed_child === current) {
          deliver(current);
          streamed_child = undefined;
        }
        if (streamed_parent === current) streamed_parent = undefined;
      } else {
        const parsed = parse_start_tag(pending.slice(cursor + 1, end), part, context);
        element_count += 1;
        assertResource(context, "maxXmlElements", element_count);
        const element: MutableXmlElement = {
          name: parsed.name,
          attributes: parsed.attributes,
          children: [],
          text: "",
          textBytes: 0,
        };
        const parent = stack.at(-1);
        const depth = stack.length + 1;
        if (parent === streamed_parent && parent !== undefined) {
          if (parsed.selfClosing) deliver(element);
          else streamed_child = element;
        } else if (parent) parent.children.push(element);
        else roots.push(element);
        if (!parsed.selfClosing) {
          stack.push(element);
          assertResource(context, "maxXmlDepth", stack.length);
        }
        const expected_depth = stream.parentIsRoot ? 1 : 2;
        if (depth === expected_depth && xmlLocalName(element.name) === stream.parent) {
          // Later duplicate parents are ignored by semantic readers too, but
          // their rows must still be validated without accumulating a tree.
          first_parent ??= element;
          if (!parsed.selfClosing) streamed_parent = element;
        }
      }
      cursor = end + 1;
    }
    pending = pending.slice(cursor);
  };
  const decode = (bytes?: Uint8Array): string => {
    try {
      return bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode();
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return xml_failure(part, "content is not valid UTF-8", error);
    }
  };
  const accept = (text: string, final: boolean): void => {
    // Match the tree parser's prohibition even inside comments/CDATA and when
    // the forbidden declaration is split between inflater output chunks.
    const declarations = declaration_tail + text;
    if (/<!DOCTYPE|<!ENTITY/i.test(declarations))
      xml_failure(part, "DTDs and entities are forbidden");
    declaration_tail = declarations.slice(-8);
    if (open_tag) {
      let end = 0;
      let quote = open_tag.quote;
      for (; end < text.length; end++) {
        const code = text.charCodeAt(end);
        if (quote) {
          if (quote === code) quote = 0;
        } else if (!open_tag.closing && (code === CODE_QUOTE || code === CODE_APOSTROPHE))
          quote = code;
        else if (code === CODE_GREATER_THAN) break;
      }
      if (end === text.length) {
        if (final)
          xml_failure(part, open_tag.closing ? "closing tag is unterminated" : "unterminated tag");
        open_tag.parts.push(text);
        open_tag.quote = quote;
        return;
      }
      open_tag.parts.push(text);
      pending = open_tag.parts.join("");
      open_tag = undefined;
    } else pending += text;
    parse_pending(final);
  };
  const iterator = chunks[Symbol.asyncIterator]();
  try {
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
      checkAbort(context);
      bytes_read += next.value.byteLength;
      assertResource(context, "maxEntryUncompressedBytes", bytes_read);
      accept(decode(next.value), false);
    }
    accept(decode(), true);
  } catch (error) {
    // An abort stops at once; closing the entry iterator frees its inflater.
    if (isAbort(context, error)) {
      await iterator.return?.();
      throw error;
    }

    // A damaged entry must be reported as damage, not as the XML symptom its
    // corrupt prefix produced: finish inflating so size and CRC checks run.
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
      checkAbort(context);
    }
    throw error;
  }
  if (ignored) xml_failure(part, `${IGNORED_SECTIONS[ignored].label} is unterminated`);
  const unclosed = stack.at(-1);
  if (unclosed) xml_failure(part, `element ${unclosed.name} is unclosed`);
  const root = roots[0];
  if (roots.length !== 1 || !root)
    xml_failure(part, `expected one root element, found ${roots.length}`);
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
  for (let index = 0; index < value.length;) {
    const literal_escape = /^_x005F_(x[\da-f]{4}_)/i.exec(value.slice(index));
    if (literal_escape) {
      output += `_${literal_escape[1]}`;
      index += literal_escape[0].length;
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
    xml_failure(part, `expected ${localName} in an allowed OOXML namespace`);
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

const XML_OUTPUT_CHUNK_BYTES = 64 * 1024;

/** Incrementally bounds generated XML before joining and UTF-8 encoding it. */
export class XmlBuffer {
  readonly #parts: string[] = [];
  #bytes = 0;
  #pending_bytes = 0;

  constructor(private readonly context: XlsxCodecContext) {}

  append(value: string): void {
    const bytes = utf8_length(value);
    this.#bytes += bytes;
    assertResource(this.context, "maxEntryUncompressedBytes", this.#bytes);
    this.#pending_bytes += bytes;
    this.#parts.push(value);
  }

  appendText(value: string): void {
    const encoded = escapeXml(encodeXstring(value));
    assertResource(this.context, "maxXmlTextBytes", utf8_length(encoded));
    this.append(encoded);
  }

  /** Release completed writer fragments without retaining the full XML part. */
  drain(force = false): readonly Uint8Array[] | undefined {
    if (!force && this.#pending_bytes < XML_OUTPUT_CHUNK_BYTES) return;

    const encoded = ENCODER.encode(this.#parts.join(""));
    this.#parts.length = 0;
    this.#pending_bytes = 0;
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < encoded.length; offset += XML_OUTPUT_CHUNK_BYTES) {
      chunks.push(encoded.subarray(offset, offset + XML_OUTPUT_CHUNK_BYTES));
    }
    return chunks;
  }

  finish(): Uint8Array {
    checkAbort(this.context);
    return ENCODER.encode(this.#parts.join(""));
  }
}
