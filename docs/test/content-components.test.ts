import { describe, expect, it } from "bun:test";

import { compile, evaluate } from "@mdx-js/mdx";
import { renderToStaticMarkup } from "react-dom/server";
import * as runtime from "react/jsx-runtime";

import { contentComponents } from "../src/lib/content-components.ts";
import { RELEASES } from "../src/lib/releases.ts";

/** Drops the page's imports and exports, which only the docs build can resolve. */
function without_module_code() {
  return (tree: { children: Array<{ type: string }> }) => {
    tree.children = tree.children.filter((child) => child.type !== "mdxjsEsm");
  };
}

/** An MDX page rendered to HTML with only the content-components plugin. */
async function render(source: string): Promise<string> {
  const { default: Page } = await evaluate(source, {
    ...runtime,
    rehypePlugins: [contentComponents, without_module_code],
  });
  return renderToStaticMarkup(runtime.jsx(Page, {}));
}

describe("content components", () => {
  it("gives every screenshot image a width, a height and alt text", async () => {
    const html = await render(`<Screenshot name="dashboard" alt="A dashboard" size="panel" />`);
    const images = html.match(/<img [^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image).toMatch(/ width="\d+"[^>]* height="\d+"|height="\d+"[^>]* width="\d+"/);
      expect(image).toContain('alt="A dashboard"');
    }
  });

  it("dates an update from the release registry", async () => {
    const html = await render(`<Update version="0.6.1">Faster edits.</Update>`);
    expect(html).toContain(
      '<time class="sw-update__date" dateTime="2026-10-30">Oct 30, 2026</time>',
    );
    // The version is the entry's heading, so the page outline lists versions.
    expect(html).toContain(
      '<h2 class="sw-update__version" id="v0-6-1"><a href="/docs/releases/0.6.1/">0.6.1</a></h2>',
    );
    const next = RELEASES.find((release) => release.unreleased === true);
    if (next !== undefined) {
      const entry = await render(`<Update version="${next.version}">Next.</Update>`);
      expect(entry).toContain('<span class="sw-update__date">Next release</span>');
      expect(entry).toContain(`>${next.version} (next)</a>`);
    }
  });

  it("links the stylesheets of the components a page uses that most pages do not", async () => {
    const module_code = async (source: string) =>
      String(await compile(source, { rehypePlugins: [contentComponents] }));
    const code = await module_code(
      `<Accordion title="Why">Because.</Accordion>\n\n<Note>Plain.</Note>`,
    );
    expect(code).toContain('import stylesheet0 from "/src/styles/content/accordion.css?url";');
    expect(code).toContain("export const stylesheets = [stylesheet0];");
    expect(await module_code("<Note>Only shared styles.</Note>")).not.toContain("stylesheets");
  });
});
