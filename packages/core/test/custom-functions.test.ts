import { beforeAll, describe, expect, it } from "bun:test";

import { functionsAddon, listFunctions } from "../src/functions.js";
import { createGrid, initSheetwrite, isSheetwriteError, SheetwriteStore } from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite({ addons: [functionsAddon()] });
});

describe("host formula functions on the default engine", () => {
  it("refuse a grid with functions because only the full engine has the bridge", async () => {
    const restoreCanvas = installCanvasTestStubs();
    const host = document.createElement("div");
    document.body.append(host);
    const store = new SheetwriteStore(makeWorkbook(2));
    try {
      let failure: unknown;
      try {
        createGrid(host, {
          workbook: makeWorkbook(2),
          addons: {
            functions: [
              {
                metadata: { name: "TAXRATE", description: "", arguments: [], returnKind: "number" },
                implementation: () => 0.2,
              },
            ],
          },
        });
      } catch (error) {
        failure = error;
      }

      expect(isSheetwriteError(failure) && failure.code).toBe("optional-backend-unavailable");
      expect(host.childElementCount).toBe(0);

      // A grid without host functions needs no bridge.
      createGrid(host, { workbook: makeWorkbook(2) }).destroy();

      // Built-in metadata needs no bridge either.
      const names = (await listFunctions(store)).map((entry) => entry.name);
      expect(names).toContain("SUM");
      expect(names).not.toContain("REGEXTEST");
      expect(names).not.toContain("TAXRATE");
    } finally {
      store.dispose();
      host.remove();
      restoreCanvas();
    }
  });
});

it("run on the full engine in their own process", async () => {
  // Engine selection is process-wide, so the full-engine contract runs apart
  // and the default-engine contract above stays independent.
  const probe = Bun.spawn(
    [process.execPath, "test", "./packages/core/test/custom-functions.full-engine.ts"],
    { cwd: new URL("../../..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([probe.exited, new Response(probe.stderr).text()]);

  expect({ exitCode, failures: stderr.match(/^\(fail\).*$/gmu) ?? [] }).toEqual({
    exitCode: 0,
    failures: [],
  });
});
