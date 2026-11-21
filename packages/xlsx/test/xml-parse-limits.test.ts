import { describe, expect, it } from "bun:test";

import { createCodecContext } from "../src/resources.js";
import { parseXml, parseXmlChunks, type XmlElement } from "../src/xml.js";

const ENCODER = new TextEncoder();
const PART = "xl/test.xml";

type Parser = (xml: string, maxXmlTextBytes?: number) => Promise<XmlElement>;

function context(maxXmlTextBytes?: number) {
  return createCodecContext(
    "import",
    maxXmlTextBytes === undefined ? undefined : { resourceLimits: { maxXmlTextBytes } },
  );
}

/** One byte per chunk, so chunk ends fall inside characters, entities and tags. */
async function* byteChunks(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  for (let index = 0; index < bytes.length; index++) yield bytes.subarray(index, index + 1);
}

const parsers: [name: string, parse: Parser][] = [
  ["parseXml", async (xml, limit) => parseXml(ENCODER.encode(xml), PART, context(limit))],
  [
    "parseXmlChunks",
    (xml, limit) =>
      parseXmlChunks(byteChunks(ENCODER.encode(xml)), PART, context(limit), {
        parent: "none",
        parentIsRoot: true,
        child: () => {},
      }),
  ],
];

describe.each(parsers)("%s limits and entities", (_name, parse) => {
  it("accepts text of exactly maxXmlTextBytes UTF-8 bytes and rejects one byte more", async () => {
    // "a&é😀b": 1 + 1 + 2 + 4 + 1 = 9 bytes in three text pieces.
    const xml = "<r>a&amp;é<![CDATA[😀]]>b</r>";
    expect((await parse(xml, 9)).text).toBe("a&é😀b");
    await expect(parse(xml, 8)).rejects.toMatchObject({
      resource: "maxXmlTextBytes",
      limit: 8,
      actual: 9,
    });
    // Three bytes per UTF-16 unit: the most a unit takes.
    expect((await parse("<r>€€€</r>", 9)).text).toBe("€€€");
    await expect(parse("<r>€€€</r>", 8)).rejects.toMatchObject({
      resource: "maxXmlTextBytes",
      limit: 8,
      actual: 9,
    });
  });

  it("counts the text once it can pass the limit, across many pieces", async () => {
    const text = "é".repeat(40);
    const xml = `<r>${"&amp;é".repeat(40)}</r>`;
    expect((await parse(xml, 120)).text).toBe("&é".repeat(40));
    await expect(parse(xml, 119)).rejects.toMatchObject({
      resource: "maxXmlTextBytes",
      actual: 120,
    });
    expect((await parse(`<r>${text}</r>`, 80)).text).toBe(text);
  });

  it("accepts an attribute value of exactly maxXmlTextBytes bytes and rejects one byte more", async () => {
    const xml = '<r v="é😀"/>';
    expect((await parse(xml, 6)).attributes.v).toBe("é😀");
    await expect(parse(xml, 5)).rejects.toMatchObject({
      resource: "maxXmlTextBytes",
      limit: 5,
      actual: 6,
    });
    await expect(parse('<r v="ab"/>', 1)).rejects.toMatchObject({ actual: 2 });
    expect((await parse('<r v="€€"/>', 6)).attributes.v).toBe("€€");
    await expect(parse('<r v="€€"/>', 5)).rejects.toMatchObject({
      resource: "maxXmlTextBytes",
      limit: 5,
      actual: 6,
    });
  });

  it("decodes each entity once, left to right", async () => {
    const root = await parse(
      `<r a="&amp;lt;" b="&lt;&amp;&gt;&quot;&apos;" c="&amp;&#65;&#x42;">&amp;lt;&amp;amp;&lt;&amp;&gt;&quot;&apos;</r>`,
    );
    expect(root.attributes).toEqual({ a: "&lt;", b: `<&>"'`, c: "&AB" });
    expect(root.text).toBe(`&lt;&amp;<&>"'`);
  });

  it("rejects unknown and unterminated entities", async () => {
    await expect(parse("<r>&amp;&foo;</r>")).rejects.toThrow("unknown entity &foo;");
    await expect(parse('<r a="&lt;&nbsp;"/>')).rejects.toThrow("unknown entity &nbsp;");
    await expect(parse('<r a="&amp;&lt"/>')).rejects.toThrow("unterminated entity reference");
  });

  it("skips comments and instructions and matches closing tags with spaces", async () => {
    const root = await parse(
      '<?xml version="1.0"?><r><!-- c --><?pi x?><x:a k="1"></x:a ><b/>t<![CDATA[<d>]]></r>',
    );
    expect(root.children.map((child) => child.name)).toEqual(["x:a", "b"]);
    expect(root.text).toBe("t<d>");
    await expect(parse("<r><a></ab></r>")).rejects.toThrow("closing tag ab does not match");
    await expect(parse("<r><ab></a></r>")).rejects.toThrow("closing tag a does not match");
    await expect(parse("<r></r ></x>")).rejects.toThrow("closing tag x does not match");
    await expect(parse("<r><!FOO></r>")).rejects.toThrow("unsupported declaration");
  });
});
