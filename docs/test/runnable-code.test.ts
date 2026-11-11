import { expect, it } from "bun:test";

import { runnableCodeBlocks } from "../src/lib/runnable-code.ts";

interface Node {
  type: string;
  tagName?: string;
  name?: string;
  value?: string;
  attributes?: unknown[];
  children?: Node[];
  data?: { meta?: string; estree?: unknown };
}

const fence = (meta: string): Node => ({
  type: "element",
  tagName: "pre",
  children: [
    { type: "element", tagName: "code", data: { meta }, children: [{ type: "text", value: "x" }] },
  ],
});

it("wraps a fence in a disclosure together with the disclosure and its notes", () => {
  const runnable = fence("compile runnable");
  const opener: Node = { type: "raw", value: "<details>\n<summary>Full setup</summary>" };
  const closer: Node = { type: "raw", value: "</details>" };
  const before: Node = { type: "element", tagName: "p", children: [] };
  const note: Node = { type: "element", tagName: "p", children: [] };
  const tree: Node = {
    type: "root",
    children: [
      before,
      { type: "text", value: "\n" },
      opener,
      { type: "text", value: "\n" },
      runnable,
      { type: "text", value: "\n" },
      note,
      closer,
    ],
  };
  runnableCodeBlocks()(tree);

  // The component import leads the tree.
  const [, kept, , wrapper] = tree.children ?? [];
  expect(kept).toBe(before);
  expect(wrapper).toEqual({
    type: "mdxJsxFlowElement",
    name: "RunnableCode",
    attributes: [{ type: "mdxJsxAttribute", name: "disclosed", value: null }],
    children: [
      opener,
      { type: "text", value: "\n" },
      runnable,
      { type: "text", value: "\n" },
      note,
      closer,
    ],
  });
  expect(tree.children).toHaveLength(4);
});
