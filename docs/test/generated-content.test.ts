import { expect, it } from "bun:test";

import { markGeneratedPages } from "../src/lib/generated-content.ts";

const CONTENT_ROOT = "/repo/docs/src/content/docs/";

/** The frontmatter a page gets at build time. */
function frontmatterOf(path: string, yaml: string): string {
  const tree = { children: [{ type: "yaml", value: yaml }] };
  markGeneratedPages({ contentRoot: CONTENT_ROOT })(tree, { path });
  return tree.children[0]?.value ?? "";
}

it("marks generated pages only, so authored pages carry nothing extra", () => {
  expect(frontmatterOf(`${CONTENT_ROOT}api/core/grid.md`, "title: Grid")).toBe(
    "title: Grid\ngenerated: true",
  );
  expect(frontmatterOf(`${CONTENT_ROOT}start/first-grid.md`, "title: Your first grid")).toBe(
    "title: Your first grid",
  );
  expect(frontmatterOf("/repo/docs/src/showcases/snippets/a.mdx", "title: A")).toBe("title: A");
});
