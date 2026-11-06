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

/** The compiled page module, with the imports and exports the plugin adds. */
async function moduleCode(source: string): Promise<string> {
  return String(await compile(source, { rehypePlugins: [contentComponents] }));
}

describe("content components", () => {
  it("numbers steps and gives each title a heading", async () => {
    const html = await render(`
<Steps>
  <Step title="Install">Add the package.</Step>
  <Step title="Create a grid" titleSize="h2">Call createGrid.</Step>
</Steps>`);
    expect(html).toContain('<ol class="sw-steps">');
    expect(html).toContain('<h3 class="sw-step__title">Install</h3>');
    expect(html).toContain('<h2 class="sw-step__title">Create a grid</h2>');
  });

  it("links a whole card and draws its sprite icon or illustration", async () => {
    const html = await render(`
<CardGroup cols={3}>
  <Card title="Dashboards" icon="dashboard" href="/docs/features/analysis/dashboards/" cta="Read">Pivots and slicers.</Card>
  <Card title="Formulas" illustration="formulas">More than 500 functions.</Card>
</CardGroup>`);
    expect(html).toContain('<div class="sw-card-group" data-cols="3">');
    expect(html).toContain('<a class="sw-doc-card" href="/docs/features/analysis/dashboards/">');
    expect(html).toContain('<use href="#sw-icon-dashboard">');
    expect(html).toContain('<use href="/figures/illustrations/formulas.svg#art">');
    expect(html).toContain('<span class="sw-card__cta">Read');
  });

  it("draws callouts with the tone's icon and an optional title", async () => {
    const html = await render(
      `<Warning title="Before you upgrade">Remove the old imports.</Warning>`,
    );
    expect(html).toContain(
      '<aside class="sw-callout" data-tone="warning" aria-label="Before you upgrade">',
    );
    expect(html).toContain('<use href="#sw-icon-warning">');
    expect(html).toContain('<p class="sw-callout__title">Before you upgrade</p>');
    expect(await render("<Note>Plain note.</Note>")).not.toContain("sw-callout__title");
  });

  it("makes an accordion a native disclosure", async () => {
    const html = await render(`<Accordion title="Do I need a server?" defaultOpen>No.</Accordion>`);
    expect(html).toContain('<details class="sw-accordion" id="do-i-need-a-server" open="">');
    expect(html).toContain('<span class="sw-accordion__title">Do I need a server?</span>');
  });

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

  it("references a diagram file that follows the page theme", async () => {
    const html = await render(
      `<Diagram name="engines" alt="Two engines" width="640" height="320" caption="The engines." />`,
    );
    expect(html).toContain('<svg class="sw-diagram" viewBox="0 0 640 320" role="img"');
    expect(html).toContain('<use href="/figures/diagrams/engines.svg#fig">');
    expect(html).toContain("<figcaption>The engines.</figcaption>");
  });

  it("labels the two sides of a comparison", async () => {
    const html = await render(`
<Compare before="0.6" after="0.7">

\`\`\`ts
grid.sortBy(2, true);
\`\`\`

\`\`\`ts
grid.setViewSort([{ col: 2, ascending: true }]);
\`\`\`

</Compare>`);
    expect(html).toContain(
      '<div class="sw-compare__pane" data-side="before"><p class="sw-compare__label">0.6</p>',
    );
    expect(html).toContain(
      '<div class="sw-compare__pane" data-side="after"><p class="sw-compare__label">0.7</p>',
    );
  });

  it("maps badge colours to design-system tones", async () => {
    const html = await render(`New <Badge color="green">0.7</Badge>`);
    expect(html).toContain('<span class="sw-badge" data-tone="accent" data-size="md">0.7</span>');
  });

  it("dates an update from the release registry", async () => {
    const html = await render(`<Update version="0.6.1">Faster edits.</Update>`);
    expect(html).toContain(
      '<time class="sw-update__date" dateTime="2026-10-30">Oct 30, 2026</time>',
    );
    expect(html).toContain('<a class="sw-update__version" href="/docs/releases/0.6.1/">0.6.1</a>');
    const next = await render(`<Update version="0.7.0">Next.</Update>`);
    expect(next).toContain('<span class="sw-update__date">Next release</span>');
    expect(next).toContain(">0.7.0 (next)</a>");
  });

  it("refuses a component without its required props", async () => {
    await expect(render("<Card>No title</Card>")).rejects.toThrow(
      '<Card> needs a "title" attribute',
    );
    await expect(render(`<Badge color="pink">x</Badge>`)).rejects.toThrow("<Badge color>");
  });

  it("links the stylesheets of the components a page uses that most pages do not", async () => {
    const code = await moduleCode(
      `<Accordion title="Why">Because.</Accordion>\n\n<Note>Plain.</Note>`,
    );
    expect(code).toContain('import stylesheet0 from "/src/styles/content/accordion.css?url";');
    expect(code).toContain("export const stylesheets = [stylesheet0];");
    expect(await moduleCode("<Note>Only shared styles.</Note>")).not.toContain("stylesheets");
  });
});
