import { describe, expect, it } from "bun:test";

import { popoverIdPrefix } from "../src/lib/dedupe-code-popovers.js";
import { hashIdentifier } from "../src/lib/hash-identifier.js";

const REPOSITORY_ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = "docs/src/content/docs/start/first-grid.mdx";

describe("popoverIdPrefix", () => {
  it("hashes the document's repository path, not where the checkout is", () => {
    expect(popoverIdPrefix(`${REPOSITORY_ROOT}${PAGE}`)).toBe(`sw-popover-${hashIdentifier(PAGE)}`);
  });
});
