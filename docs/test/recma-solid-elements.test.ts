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

test("rehype properties become Solid attributes: CSS style names, true aria and data values, no React-only props", async () => {
  const properties = {
    style: "--ecMaxLine:81ch;font-size:2px;-ms-transform:none;-webkit-line-clamp:2",
    suppressHydrationWarning: true,
    ariaHidden: true,
    dataPagefindIgnore: true,
  };
  const output = String(
    await compile("x", {
      ...SOLID_MDX_OPTIONS,
      // Sets the paragraph's properties as the docs' rehype plugins do.
      rehypePlugins: [
        () => (tree: { children: { properties?: Record<string, unknown> }[] }) => {
          Object.assign(tree.children[0]?.properties ?? {}, properties);
        },
      ],
    }),
  );
  // Custom properties keep their case.
  expect(output).toContain('"--ecMaxLine": "81ch"');
  expect(output).toContain('"font-size": "2px"');
  expect(output).toContain('"-ms-transform": "none"');
  expect(output).toContain('"-webkit-line-clamp": "2"');
  expect(output).not.toContain("suppressHydrationWarning");
  expect(output).toContain('aria-hidden="true"');
  expect(output).toContain('data-pagefind-ignore="true"');
});
