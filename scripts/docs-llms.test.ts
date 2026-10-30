import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expectedLlmsFiles, inNavigationOrder, LLMS_FULL_PATH } from "./docs-llms.js";

describe("llms reading order", () => {
  it("orders pages depth-first by the sidebar, then unlisted pages by route", () => {
    const sections = [
      {
        label: "Features",
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
      { label: "Reference", items: [{ label: "Events", href: "/docs/reference/events/" }] },
    ];
    const documents = [
      { route: "/docs/reference/events/" },
      { route: "/docs/zeta/" },
      { route: "/docs/features/grid/context-menu/" },
      { route: "/docs/alpha/" },
      { route: "/docs/features/grid/search/" },
    ];
    expect(inNavigationOrder(documents, sections).map((document) => document.route)).toEqual([
      "/docs/features/grid/search/",
      "/docs/features/grid/context-menu/",
      "/docs/reference/events/",
      "/docs/alpha/",
      "/docs/zeta/",
    ]);
  });
});

describe("llms document text", () => {
  it("formats prose tokens while preserving fenced examples verbatim", async () => {
    const root = await mkdtemp(join(tmpdir(), "sheetwrite-llms-"));
    const contentRoot = join(root, "docs/src/content/docs");
    const example = '<sw-format value="0.25" code="0%"></sw-format>';
    try {
      await mkdir(contentRoot, { recursive: true });
      await writeFile(
        join(contentRoot, "index.md"),
        [
          "---",
          "title: Format examples",
          "---",
          `Result: ${example}.`,
          "",
          "```html compile",
          example,
          '<sw-format code="0.00"></sw-format>',
          "```",
          "",
          "~~~html",
          example,
          "~~~",
        ].join("\n"),
      );

      const files = await expectedLlmsFiles({ formatVersion: 2, packages: [] }, root, []);
      const full = files.find((file) => file.path === join(root, LLMS_FULL_PATH));
      if (full === undefined) throw new Error("Full-text endpoint is missing");

      expect(full.content).toContain("Result: 25%.");
      expect(full.content).toContain(
        `\`\`\`html\n${example}\n<sw-format code="0.00"></sw-format>\n\`\`\``,
      );
      expect(full.content).toContain(`~~~html\n${example}\n~~~`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
