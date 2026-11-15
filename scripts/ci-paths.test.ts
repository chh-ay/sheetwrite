import { describe, expect, it } from "bun:test";

import { requiresDocumentationBuild } from "./ci-paths.js";

describe("documentation CI path classification", () => {
  it("takes the expensive lane for mixed, unknown, and empty change sets", () => {
    expect(requiresDocumentationBuild(["README.md", "docs/src/router.tsx"])).toBeTrue();
    expect(requiresDocumentationBuild(["new-subsystem/config.json"])).toBeTrue();
    expect(requiresDocumentationBuild([])).toBeTrue();
  });
});
