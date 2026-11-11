import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { NavigationSection } from "../docs/src/lib/navigation.js";
import {
  expectedLlmsFiles,
  inNavigationOrder,
  LLMS_FULL_PATH,
  LLMS_SITE_BASE,
} from "./docs-llms.js";

/** The full-text endpoint built from the given docs pages, keyed by content path. */
async function fullText(pages: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sheetwrite-llms-"));
  try {
    for (const [path, content] of Object.entries(pages)) {
      const file = join(root, "docs/src/content/docs", path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    const files = await expectedLlmsFiles({ formatVersion: 2, packages: [] }, root, []);
    const full = files.find((file) => file.path === join(root, LLMS_FULL_PATH));
    if (full === undefined) throw new Error("Full-text endpoint is missing");
    return full.content;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const page = (title: string, ...body: string[]) =>
  ["---", `title: ${title}`, "---", ...body].join("\n");

describe("llms full text", () => {
  it("orders pages depth-first by the sidebar, then unlisted pages by route", () => {
    const sections = [
      {
        label: "Features",
        tab: "guides",
        items: [
          {
            label: "Grid",
            items: [
              { label: "Search", href: "/docs/features/grid/search/" },
              { label: "Context menu", href: "/docs/features/grid/context-menu/" },
            ],
          },
        ],
      },
      {
        label: "Reference",
        tab: "api",
        items: [{ label: "Events", href: "/docs/reference/events/" }],
      },
    ] satisfies readonly NavigationSection[];
    const routes = [
      "/docs/reference/events/",
      "/docs/zeta/",
      "/docs/features/grid/context-menu/",
      "/docs/alpha/",
      "/docs/features/grid/search/",
    ];
    expect(
      inNavigationOrder(
        routes.map((route) => ({ route })),
        sections,
      ).map((document) => document.route),
    ).toEqual([
      "/docs/features/grid/search/",
      "/docs/features/grid/context-menu/",
      "/docs/reference/events/",
      "/docs/alpha/",
      "/docs/zeta/",
    ]);
  });

  it("formats prose tokens and keeps code, blank lines included, verbatim", async () => {
    const example = '<sw-format value="0.25" code="0%"></sw-format>';
    const code = ["const text = `first", "", "", "last`;"].join("\n");
    const content = await fullText({
      "index.md": page(
        "Format examples",
        `Result: ${example}.`,
        "",
        "~~~html",
        example,
        "~~~",
        "",
        `\`\`\`ts compile\n${code}\n\`\`\``,
      ),
    });

    expect(content).toContain("Result: 25%.");
    expect(content).toContain(`~~~html\n${example}\n~~~`);
    // The compile flag is site tooling, not part of the example.
    expect(content).toContain(`\`\`\`ts\n${code}\n\`\`\``);
  });

  it("gives repeated guide titles their own anchors", async () => {
    const content = await fullText({
      "guides/first.md": page("Same title", "First."),
      "guides/second.md": page("Same title", "Second."),
    });

    const links = [...content.matchAll(/^- \[Same title\]\(#([^)]+)\)$/gm)].map(
      (match) => match[1],
    );
    expect(new Set(links).size).toBe(2);
    for (const anchor of links) expect(content).toContain(`<a id="${anchor}"></a>`);
  });

  it("reads content components as titled text, figures as their alt text", async () => {
    const content = await fullText({
      "index.mdx": page(
        "Components",
        "<Note>Read this first.</Note>",
        "",
        "<Steps>",
        '<Step title="Install the packages">',
        "Add the core package.",
        "</Step>",
        "</Steps>",
        "",
        '<Screenshot name="dashboard" alt="A dashboard with a slicer." />',
        "",
        '<Card title="Dashboards" href="/docs/features/analysis/dashboards/">',
        "Pivots and slicers.",
        "</Card>",
      ),
    });

    expect(content).toContain("Note: Read this first.");
    expect(content).toContain("**Install the packages**\nAdd the core package.");
    expect(content).toContain("(Figure: A dashboard with a slicer.)");
    expect(content).not.toContain('name="dashboard"');
    expect(content).toContain(
      `**[Dashboards](${LLMS_SITE_BASE}/docs/features/analysis/dashboards/)**`,
    );
  });
});
