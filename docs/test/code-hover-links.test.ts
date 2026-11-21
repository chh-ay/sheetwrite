import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { selectAll } from "@expressive-code/core/hast";
import { ExpressiveCode } from "expressive-code";

import { splitDocumentation } from "../src/lib/api-reference-routes.js";
import { sheetwriteCodeHovers } from "../src/lib/sheetwrite-code-hovers.js";

/** The link targets in `code` rendered with hovers from a manifest of `exports` in @sheetwrite/core. */
async function hoverLinks(exports: readonly object[], code: string): Promise<string[]> {
  // A working directory inside docs/ resolves @sheetwrite/core as the site
  // does, and holds its own API manifest, so the test does not need the
  // generated docs data.
  const cwd = await mkdtemp(join(new URL("./", import.meta.url).pathname, ".hover-"));
  try {
    await mkdir(join(cwd, "src/generated"), { recursive: true });
    const entryPoints = [{ subpath: ".", classification: "supported", exports }];
    await writeFile(
      join(cwd, "src/generated/public-api.json"),
      JSON.stringify({ packages: [{ name: "@sheetwrite/core", entryPoints }] }),
    );
    const renderer = new ExpressiveCode({ plugins: [sheetwriteCodeHovers({ cwd })] });
    const rendered = await renderer.render({ language: "ts", code });
    return selectAll("a", rendered.renderedGroupAst).map((link) => String(link.properties.href));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("hover see-also tags link guide paths and API names", async () => {
  const hrefs = await hoverLinks(
    [{ name: "createGrid" }],
    'import { initSheetwrite } from "@sheetwrite/core";\nawait initSheetwrite();',
  );
  expect(hrefs).toContain("/docs/start/choose-an-engine/");
  expect(hrefs).toContain("/docs/api/core/create-grid/");
});

test("a name the sample declares links no API member that shares it", async () => {
  const hrefs = await hoverLinks(
    [
      { name: "GridCommandState" },
      {
        name: "Grid",
        memberDocs: [
          {
            name: "undo",
            documentation: "Undo the last recorded cell edit.\n@example\ngrid.undo();",
          },
        ],
      },
      {
        name: "IndexedDbHistoryStorage",
        memberDocs: [{ name: "list", documentation: "The saved versions, newest first." }],
      },
    ],
    [
      'import type { GridCommandState } from "@sheetwrite/core";',
      "const update = (undo: GridCommandState) => undo.disabled;",
      'const list = document.createElement("ul");',
      "list.remove();",
    ].join("\n"),
  );
  expect(hrefs.filter((href) => href.includes("#grid-undo"))).toEqual([]);
  expect(hrefs.filter((href) => href.includes("indexed-db-history-storage"))).toEqual([]);
  // The parameter's type still links, but its page holds no example of `undo`.
  expect(hrefs.filter((href) => href.endsWith("#examples"))).toEqual([]);
});

test("manifest docs split into the hover summary and its tags", () => {
  expect(
    splitDocumentation(
      "Export a workbook.\n@param workbook - The workbook.\n@returns The file's bytes.\n@throws `TypeError` when it is closed.\n@example\nawait toXlsxWorkbook(workbook);",
    ),
  ).toEqual({
    docs: "Export a workbook.",
    tags: [
      ["param", "workbook The workbook."],
      ["returns", "The file's bytes."],
      ["throws", "`TypeError` when it is closed."],
      ["example", "await toXlsxWorkbook(workbook);"],
    ],
  });
  expect(splitDocumentation("@returns Only a tag.")).toEqual({
    tags: [["returns", "Only a tag."]],
  });
});
