import { expect, test } from "bun:test";

import { selectAll } from "@expressive-code/core/hast";
import { ExpressiveCode } from "expressive-code";

import { sheetwriteCodeHovers } from "../src/lib/sheetwrite-code-hovers.js";

test("hover see-also tags link guide paths and API names", async () => {
  const renderer = new ExpressiveCode({
    plugins: [sheetwriteCodeHovers({ cwd: new URL("../", import.meta.url).pathname })],
  });
  const rendered = await renderer.render({
    language: "ts",
    code: 'import { initSheetwrite } from "@sheetwrite/core";\nawait initSheetwrite();',
  });
  const hrefs = selectAll("a", rendered.renderedGroupAst).map((link) => link.properties.href);
  expect(hrefs).toContain("/docs/guides/formulas/");
  expect(hrefs).toContain("/docs/api/core/create-grid/");
});
