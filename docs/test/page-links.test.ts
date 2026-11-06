import { expect, it } from "bun:test";

import { markGeneratedPages } from "../src/lib/generated-content.ts";
import { editUrl, reportProblemUrl } from "../src/lib/page-links.ts";

const CONTENT_ROOT = "/repo/docs/src/content/docs/";

/** The frontmatter a page gets at build time. */
function frontmatterOf(path: string, yaml: string): string {
  const tree = { children: [{ type: "yaml", value: yaml }] };
  markGeneratedPages({ contentRoot: CONTENT_ROOT })(tree, { path });
  return tree.children[0]?.value ?? "";
}

it("opens GitHub's editor on the page's source file", () => {
  expect(editUrl("docs/src/content/docs/start/first-grid.md")).toBe(
    "https://github.com/chh-ay/sheetwrite/edit/develop/docs/src/content/docs/start/first-grid.md",
  );
});

it("opens the documentation form with the page's title and address", () => {
  const url = new URL(reportProblemUrl("Your first grid", "/docs/start/first-grid/"));
  expect(`${url.origin}${url.pathname}`).toBe("https://github.com/chh-ay/sheetwrite/issues/new");
  expect(url.searchParams.get("template")).toBe("documentation.yml");
  expect(url.searchParams.get("pages")).toBe(
    "Your first grid: https://www.sheetwrite.dev/docs/start/first-grid/",
  );
});

it("marks generated pages only, so authored pages carry nothing extra", () => {
  expect(frontmatterOf(`${CONTENT_ROOT}api/core/grid.md`, "title: Grid")).toBe(
    "title: Grid\ngenerated: true",
  );
  expect(frontmatterOf(`${CONTENT_ROOT}start/first-grid.md`, "title: Your first grid")).toBe(
    "title: Your first grid",
  );
  expect(frontmatterOf("/repo/docs/src/showcases/snippets/a.mdx", "title: A")).toBe("title: A");
});
