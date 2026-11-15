import { expect, test } from "bun:test";

import { compile } from "@mdx-js/mdx";

import { SOLID_MDX_OPTIONS } from "../src/lib/recma-solid-elements.ts";

async function compileForSolid(source: string): Promise<string> {
  return String(await compile(source, SOLID_MDX_OPTIONS));
}

test("HTML elements compile to literal tags, components still come from `components`", async () => {
  const output = await compileForSolid('Some [link](/docs/) and <PackageCommand packages="x" />');
  expect(output).toContain("<p>");
  expect(output).toContain('<a href="/docs/">');
  expect(output).not.toContain("_components.p");
  expect(output).not.toContain("_components.a");
  expect(output).toContain("{PackageCommand} = _components");
  expect(output).toContain('<PackageCommand packages="x" />');
});

test("React's dangerouslySetInnerHTML becomes Solid's innerHTML", async () => {
  const output = await compileForSolid(
    '<template className="store" dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />',
  );
  expect(output).toContain('innerHTML={"<b>x</b>"}');
  expect(output).not.toContain("dangerouslySetInnerHTML");
});

test("dangerouslySetInnerHTML without __html is a build error", async () => {
  await expect(compileForSolid("<div dangerouslySetInnerHTML={{ html: 1 }} />")).rejects.toThrow(
    "without __html",
  );
});

/** Compiles a one-paragraph page whose `<p>` carries `properties`, as the docs' rehype plugins set them. */
async function compileParagraphWith(properties: Record<string, unknown>): Promise<string> {
  const file = await compile("x", {
    ...SOLID_MDX_OPTIONS,
    rehypePlugins: [
      () => (tree: { children: { properties?: Record<string, unknown> }[] }) => {
        Object.assign(tree.children[0]!.properties ?? {}, properties);
      },
    ],
  });
  return String(file);
}

test("style objects get CSS property names; custom properties keep their case", async () => {
  const output = await compileParagraphWith({
    style: "--ecMaxLine:81ch;font-size:2px;-ms-transform:none;-webkit-line-clamp:2",
  });
  expect(output).toContain('"--ecMaxLine": "81ch"');
  expect(output).toContain('"font-size": "2px"');
  expect(output).toContain('"-ms-transform": "none"');
  expect(output).toContain('"-webkit-line-clamp": "2"');
});

test("React's suppressHydrationWarning is dropped", async () => {
  const output = await compileParagraphWith({ suppressHydrationWarning: true });
  expect(output).toContain("<p>");
  expect(output).not.toContain("suppressHydrationWarning");
});

test("aria and data attributes set to true get the value true", async () => {
  const output = await compileParagraphWith({ ariaHidden: true, dataPagefindIgnore: true });
  expect(output).toContain('aria-hidden="true"');
  expect(output).toContain('data-pagefind-ignore="true"');
});
