import { describe, expect, it } from "bun:test";

import { collectOutline, type HastElement } from "../src/lib/outline.js";

const text = (value: string): HastElement => ({ type: "text", value });
const element = (
  tagName: string,
  properties: Record<string, unknown>,
  children: HastElement[] = [],
): HastElement => ({
  type: "element",
  tagName,
  properties,
  children,
});

describe("build-time outline", () => {
  it("lists h2 and h3 headings without count chips, skipping member headings and search anchors", () => {
    const tree = {
      type: "root",
      children: [
        element("h2", { id: "examples" }, [text("Examples")]),
        element("h3", { id: "classes" }, [
          text("Classes "),
          element("span", { className: ["api-count"] }, [text("16")]),
        ]),
        element("h3", { id: "grid", className: ["api-search-anchor"] }, [text("grid")]),
        element("details", { id: "store", className: ["api-member"] }, [
          element("summary", {}, [element("code", {}, [text("store")])]),
          element("h3", { id: "store-examples" }, [text("Examples")]),
        ]),
      ],
    };
    expect(collectOutline(tree)).toEqual([
      { id: "examples", label: "Examples", depth: 0 },
      { id: "classes", label: "Classes", depth: 1 },
      { id: "store", label: "store", depth: 1 },
    ]);
  });

  it("leaves member rows to a page's own member index", () => {
    const tree = {
      type: "root",
      children: [
        element("h2", { id: "members" }, [text("Members")]),
        element("details", { className: ["api-member-index"] }, []),
        element("details", { id: "store", className: ["api-member"] }, [
          element("summary", {}, [element("code", {}, [text("store")])]),
        ]),
        element("h2", { id: "declaration" }, [text("Declaration")]),
      ],
    };
    expect(collectOutline(tree).map((item) => item.id)).toEqual(["members", "declaration"]);
  });

  it("is empty below two entries", () => {
    expect(
      collectOutline({ type: "root", children: [element("h2", { id: "a" }, [text("A")])] }),
    ).toEqual([]);
  });
});
