import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { selectAll } from "@expressive-code/core/hast";
import { ExpressiveCode } from "expressive-code";

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
