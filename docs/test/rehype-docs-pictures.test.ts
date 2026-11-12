import { expect, test } from "bun:test";

import { compile } from "@mdx-js/mdx";

import { SOLID_MDX_OPTIONS } from "../src/lib/recma-solid-elements.ts";
import { rehypeDocsPictures } from "../src/lib/rehype-docs-pictures.ts";

interface Heading {
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: { value?: string }[];
}

/** Gives each h2 the id rehype-slug would: its lowercased words joined by hyphens. */
const slugHeadings = () => (tree: { children: Heading[] }) => {
  for (const node of tree.children) {
    if (node.tagName !== "h2") continue;
    const text = (node.children ?? []).map((child) => child.value ?? "").join("");
    node.properties = { ...node.properties, id: text.toLowerCase().replaceAll(" ", "-") };
  }
};

/** Compiles `source` as the docs page at `page` (a path under docs/src/content/docs/). */
async function compilePage(page: string, source: string): Promise<string> {
  const file = await compile(
    { value: source, path: `/repo/docs/src/content/docs/${page}` },
    { ...SOLID_MDX_OPTIONS, rehypePlugins: [slugHeadings, rehypeDocsPictures] },
  );
  return String(file);
}

test("a placed diagram follows its heading, and the page imports the picture and its stylesheet", async () => {
  const output = await compilePage(
    "concepts/calculation-engine.md",
    [
      "Lead.",
      "## What happens on an edit",
      "## Spills",
      "Text.",
      "## Paged data and loading",
      "## Errors are values",
      "## Volatile functions",
    ].join("\n\n"),
  );
  expect(output).toContain('<h2 id="spills">{"Spills"}</h2><DocsPicture name="spills" />');
  expect(output).toContain('<DocsPicture name="loading" />');
  expect(output).toMatch(/import DocsPicture from ".*\/art\/DocsPicture\.tsx"/);
  expect(output).toMatch(/import artStylesheet from ".*\/art\/art\.css\?url"/);
  expect(output).toContain("export const stylesheets = [artStylesheet]");
});

test("a lead placement follows the first paragraph", async () => {
  const output = await compilePage("start/first-grid.mdx", "Lead.\n\nMore.");
  expect(output).toContain('<p>{"Lead."}</p><DocsPicture name="first-grid" />');
});

test("a placement whose heading is gone fails the build", async () => {
  await expect(compilePage("concepts/error-handling.md", "## Something else")).rejects.toThrow(
    "/docs/concepts/error-handling/: no heading #recovery-by-boundary for the recovery diagram",
  );
});

test("a page without art compiles unchanged", async () => {
  const output = await compilePage("features/grid/search.md", "## Options and result");
  expect(output).not.toContain("DocsPicture");
  expect(output).not.toContain("artStylesheet");
});
