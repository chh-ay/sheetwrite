import { describe, expect, it } from "bun:test";

import { compile, evaluate } from "@mdx-js/mdx";
import { renderToStaticMarkup } from "react-dom/server";
import * as runtime from "react/jsx-runtime";

import { contentComponents } from "../src/lib/content-components.ts";

/** Drops the page's imports and exports, which only the docs build can resolve. */
function withoutModuleCode() {
  return (tree: { children: Array<{ type: string }> }) => {
    tree.children = tree.children.filter((child) => child.type !== "mdxjsEsm");
  };
}

/** An MDX page rendered to HTML with only the content-components plugin. */
async function render(source: string): Promise<string> {
  const { default: Page } = await evaluate(source, {
    ...runtime,
    rehypePlugins: [contentComponents, withoutModuleCode],
  });
  return renderToStaticMarkup(runtime.jsx(Page, {}));
}

describe("content components", () => {
  it("renders a screenshot in both themes, lazily, with its size", async () => {
    const html = await render(`<Screenshot name="dashboard" alt="A dashboard" size="panel" />`);
    expect(html).toContain('src="/figures/shots/dashboard-light-1x.avif"');
    expect(html).toContain(
      'srcSet="/figures/shots/dashboard-dark-1x.avif 720w, /figures/shots/dashboard-dark-2x.avif 1440w"',
    );
    expect(html).toContain('width="720" height="480" loading="lazy"');
    // The hidden theme's image is display: none, so assistive technology reads the shown one.
    expect(html.match(/alt="A dashboard"/g)).toHaveLength(2);
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
    const next = await render(`<Update version="0.7.0">Next.</Update>`);
    expect(next).toContain('<span class="sw-update__date">Next release</span>');
    expect(next).toContain(">0.7.0 (next)</a>");
  });

  it("links the stylesheets of the components a page uses that most pages do not", async () => {
    const moduleCode = async (source: string) =>
      String(await compile(source, { rehypePlugins: [contentComponents] }));
    const code = await moduleCode(
      `<Accordion title="Why">Because.</Accordion>\n\n<Note>Plain.</Note>`,
    );
    expect(code).toContain('import stylesheet0 from "/src/styles/content/accordion.css?url";');
    expect(code).toContain("export const stylesheets = [stylesheet0];");
    expect(await moduleCode("<Note>Only shared styles.</Note>")).not.toContain("stylesheets");
  });
});
