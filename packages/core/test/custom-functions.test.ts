import { beforeAll, describe, expect, it } from "bun:test";

import { listFunctions, registerFunction } from "../src/functions.js";
import { initSheetwrite, isSheetwriteError, SheetwriteStore } from "../src/index.js";
import { makeWorkbook } from "./fixtures.js";

beforeAll(async () => {
  await initSheetwrite();
});

describe("host formula functions on the default engine", () => {
  it("refuse registration because only the full engine has the bridge", async () => {
    const store = new SheetwriteStore(makeWorkbook(2));
    try {
      let failure: unknown;
      try {
        registerFunction(
          store,
          { name: "TAXRATE", description: "", arguments: [], returnKind: "number" },
          () => 0.2,
        );
      } catch (error) {
        failure = error;
      }

      expect(isSheetwriteError(failure) && failure.code).toBe("optional-backend-unavailable");
      store.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: "s1", row: 0, col: 0 },
            value: { kind: "formula", src: "=TAXRATE()" },
          },
        ],
      });
      expect(store.getCell({ sheet: "s1", row: 0, col: 0 }).resolved).toBe("#NAME?");

      // Built-in metadata needs no bridge, and the refused name is not listed.
      const names = (await listFunctions(store)).map((entry) => entry.name);
      expect(names).toContain("SUM");
      expect(names).not.toContain("REGEXTEST");
      expect(names).not.toContain("TAXRATE");
    } finally {
      store.dispose();
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
