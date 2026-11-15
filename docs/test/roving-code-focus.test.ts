import { describe, expect, it } from "bun:test";

import type { HastNode } from "../src/lib/build-hast.js";
import { rovingCodeFocus } from "../src/lib/roving-code-focus.js";

function symbol(className: string): HastNode {
  return { type: "element", tagName: "span", properties: { className: [className] }, children: [] };
}

describe("roving code focus", () => {
  it("leaves only each block's first code symbol in the tab order", () => {
    const first = symbol("sw-code-popover__trigger");
    const second = symbol("sw-code-ref");
    const other = symbol("sw-code-popover__trigger");
    const tree: HastNode = {
      type: "root",
      children: [
        { type: "element", tagName: "pre", properties: {}, children: [first, second] },
        { type: "element", tagName: "pre", properties: {}, children: [other] },
      ],
    };

    rovingCodeFocus()(tree);

    expect([first, second, other].map((node) => node.properties?.tabIndex)).toEqual([0, -1, 0]);
  });
});
