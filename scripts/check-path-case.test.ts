import { expect, it } from "bun:test";

import { findPathCaseClashes } from "./check-path-case.js";

it("reports files and directories that differ only by case", () => {
  expect(
    findPathCaseClashes(["docs/README.md", "docs/readme.md", "Docs/guide.md", "docs/guide.md"]),
  ).toEqual([
    { key: "docs", paths: ["Docs", "docs"] },
    { key: "docs/guide.md", paths: ["Docs/guide.md", "docs/guide.md"] },
    { key: "docs/readme.md", paths: ["docs/README.md", "docs/readme.md"] },
  ]);
});

it("reports modules whose names differ only by case once the extension is dropped", () => {
  // `import "./Flight.js"` tries Flight.ts, which a case-insensitive disk answers with flight.ts.
  expect(
    findPathCaseClashes([
      "docs/src/showcases/performance/Flight.tsx",
      "docs/src/showcases/performance/flight.ts",
    ]),
  ).toEqual([
    {
      key: "docs/src/showcases/performance/flight.<module>",
      paths: ["docs/src/showcases/performance/Flight", "docs/src/showcases/performance/flight"],
    },
  ]);
});

it("accepts distinct names, one module in two module formats, and a module beside its stylesheet", () => {
  expect(
    findPathCaseClashes([
      "docs/src/art/Art.tsx",
      "docs/src/art/art.css",
      "packages/core/src/grid.ts",
      "packages/core/src/grid.test.ts",
      "packages/core/dist/grid.js",
      "packages/core/dist/grid.d.ts",
      "scripts/build.ts",
      "scripts/build.mjs",
    ]),
  ).toEqual([]);
});
