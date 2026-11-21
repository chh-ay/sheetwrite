import { expect, it } from "bun:test";

import { findPathCaseClashes } from "./check-path-case.js";

it("reports paths and extensionless modules that differ only by case, and nothing else", () => {
  expect(
    findPathCaseClashes([
      "docs/README.md",
      "docs/readme.md",
      "Docs/guide.md",
      "docs/guide.md",
      // `import "./Flight.js"` tries Flight.ts, which a case-insensitive disk answers with flight.ts.
      "docs/src/showcases/performance/Flight.tsx",
      "docs/src/showcases/performance/flight.ts",
      // Distinct names, one module in two module formats, and a module beside its stylesheet.
      "docs/src/art/Art.tsx",
      "docs/src/art/art.css",
      "packages/core/src/grid.ts",
      "packages/core/src/grid.test.ts",
      "packages/core/dist/grid.js",
      "packages/core/dist/grid.d.ts",
      "scripts/build.ts",
      "scripts/build.mjs",
    ]),
  ).toEqual([
    { key: "docs", paths: ["Docs", "docs"] },
    { key: "docs/guide.md", paths: ["Docs/guide.md", "docs/guide.md"] },
    { key: "docs/readme.md", paths: ["docs/README.md", "docs/readme.md"] },
    {
      key: "docs/src/showcases/performance/flight.<module>",
      paths: ["docs/src/showcases/performance/Flight", "docs/src/showcases/performance/flight"],
    },
  ]);
});
