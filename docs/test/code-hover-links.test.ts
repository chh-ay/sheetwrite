import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { selectAll } from "@expressive-code/core/hast";
import { ExpressiveCode } from "expressive-code";

import { splitDocumentation } from "../src/lib/api-reference-routes.js";
import { sheetwriteCodeHovers } from "../src/lib/sheetwrite-code-hovers.js";

/** The one public export the hover below links to, as docs generation lists it. */
const MANIFEST = {
  packages: [
    {
      name: "@sheetwrite/core",
      entryPoints: [
        { subpath: ".", classification: "supported", exports: [{ name: "createGrid" }] },
      ],
    },
  ],
};

test("hover see-also tags link guide paths and API names", async () => {
  // A working directory inside docs/ resolves @sheetwrite/core as the site
  // does, and holds its own API manifest, so the test does not need the
  // generated docs data.
  const cwd = await mkdtemp(join(new URL("./", import.meta.url).pathname, ".hover-"));
  try {
    await mkdir(join(cwd, "src/generated"), { recursive: true });
    await writeFile(join(cwd, "src/generated/public-api.json"), JSON.stringify(MANIFEST));
    const renderer = new ExpressiveCode({ plugins: [sheetwriteCodeHovers({ cwd })] });

    const rendered = await renderer.render({
      language: "ts",
      code: 'import { initSheetwrite } from "@sheetwrite/core";\nawait initSheetwrite();',
    });

    const hrefs = selectAll("a", rendered.renderedGroupAst).map((link) => link.properties.href);
    expect(hrefs).toContain("/docs/start/choose-an-engine/");
    expect(hrefs).toContain("/docs/api/core/create-grid/");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
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
