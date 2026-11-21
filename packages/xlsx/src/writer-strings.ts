import { MAIN_NS, RELATIONSHIPS_NS } from "./format.js";
import type { XlsxCodecContext } from "./resources.js";
import { encodeXstring, escapeXml, XmlBuffer } from "./xml.js";

export const SHARED_STRINGS_REL = `${RELATIONSHIPS_NS}/sharedStrings`;
export const SHARED_STRINGS_CONTENT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml";

/**
 * The shared string table of one export, as Excel writes text cells. Each distinct text is
 * escaped once and numbered in first-use order. The table holds at most `limit` texts, the
 * import's `maxSharedStrings`, so the file opens again; other new texts stay inline strings.
 */
export class SharedStringTable {
  readonly #indices = new Map<string, number>();
  /** The escaped XML text of each entry, by index. */
  readonly #items: string[] = [];
  #references = 0;

  constructor(private readonly limit: number) {}

  get size(): number {
    return this.#items.length;
  }

  /** The index of `text` in the table, or undefined when the table is full. */
  index(text: string): number | undefined {
    let index = this.#indices.get(text);
    if (index === undefined) {
      if (this.#items.length >= this.limit) return undefined;
      index = this.#items.length;
      this.#indices.set(text, index);
      this.#items.push(escapeXml(encodeXstring(text)));
    }
    this.#references += 1;
    return index;
  }

  /** The `xl/sharedStrings.xml` part, in bounded chunks. */
  *xml(context: XlsxCodecContext): Generator<Uint8Array> {
    const xml = new XmlBuffer(context);
    xml.append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    xml.append(
      `<sst xmlns="${MAIN_NS}" count="${this.#references}" uniqueCount="${this.#items.length}">`,
    );
    for (const item of this.#items) {
      // As the inline strings did, keep leading and trailing spaces.
      xml.append(`<si><t xml:space="preserve">${item}</t></si>`);
      const chunk = xml.drain();
      if (chunk) yield* chunk;
    }
    xml.append("</sst>");
    const chunk = xml.drain(true);
    if (chunk) yield* chunk;
  }
}
