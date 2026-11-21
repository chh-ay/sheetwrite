import { describe, expect, it } from "bun:test";

import { XlsxResourceError } from "@sheetwrite/core";

import { createCodecContext } from "../src/resources.js";
import { encodeXstring, escapeXml, XmlBuffer } from "../src/xml.js";

describe("XML text encoding", () => {
  it("encodes forbidden units and literal escape text as ST_Xstring", () => {
    const cases: [input: string, expected: string][] = [
      ["Customer 42", "Customer 42"],
      ["\u0001_x0041_😀", "_x0001__x005F_x0041_😀"],
      ["_X00aF_", "_x005F_X00aF_"],
      ["__x0000_", "__x005F_x0000_"],
      ["a_x004", "a_x004"],
      ["\t\n\r\u000b\u001f", "\t\n\r_x000B__x001F_"],
      ["\ufffe\uffff", "_xFFFE__xFFFF_"],
      ["\ud800", "_xD800_"],
      ["\udc00x", "_xDC00_x"],
      ["\ud800\ud83d\ude00", "_xD800_😀"],
    ];
    for (const [input, expected] of cases) expect(encodeXstring(input)).toBe(expected);
  });

  it("escapes markup characters for text and attributes", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
    expect(escapeXml("&&")).toBe("&amp;&amp;");
    expect(escapeXml("IF(C1>500,1)")).toBe("IF(C1&gt;500,1)");
    expect(escapeXml("plain text")).toBe("plain text");
  });
});

describe("XmlBuffer", () => {
  it("counts UTF-8 bytes against maxEntryUncompressedBytes at each fragment", () => {
    const context = createCodecContext("export", {
      resourceLimits: { maxEntryUncompressedBytes: 10 },
    });
    const xml = new XmlBuffer(context);
    xml.append("ab");
    xml.append("é😀");
    xml.append("cd");
    let error: unknown;
    try {
      xml.append("€");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(XlsxResourceError);
    expect(error).toMatchObject({ resource: "maxEntryUncompressedBytes", limit: 10, actual: 13 });
  });
});
