import { expect, it } from "bun:test";

import { isRunnableMeta, runnableCodeBlocks } from "../src/lib/runnable-code.ts";

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

it("reads `runnable` as a word of the fence meta", () => {
  expect(isRunnableMeta('compile runnable title="A grid"')).toBeTrue();
  expect(isRunnableMeta("runnable")).toBeTrue();
  expect(isRunnableMeta('compile title="A runnable grid"')).toBeFalse();
  expect(isRunnableMeta("compile notrunnable")).toBeFalse();
  expect(isRunnableMeta(undefined)).toBeFalse();
});

it("wraps runnable fences and imports the component once", () => {
  const runnable = fence("compile runnable");
  const plain = fence("compile");
  const nested = fence("runnable");
  const tree: Node = {
    type: "root",
    children: [runnable, plain, { type: "element", tagName: "details", children: [nested] }],
  };
  runnableCodeBlocks()(tree);

  const [esm, wrapper, unchanged, details] = tree.children ?? [];
  expect(esm?.type).toBe("mdxjsEsm");
  expect(esm?.value).toBe('import { RunnableCode } from "/src/islands/content.tsx";');
  expect(esm?.data?.estree).toBeDefined();
  expect(wrapper).toEqual({
    type: "mdxJsxFlowElement",
    name: "RunnableCode",
    attributes: [],
    children: [runnable],
  });
  expect(unchanged).toBe(plain);
  expect(details?.children?.[0]?.name).toBe("RunnableCode");
  expect(tree.children?.filter((child) => child.type === "mdxjsEsm")).toHaveLength(1);
});

it("leaves a page without runnable fences as it is", () => {
  const plain = fence("compile");
  const tree: Node = { type: "root", children: [plain] };
  runnableCodeBlocks()(tree);
  expect(tree.children).toEqual([plain]);
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

it("leaves a disclosure with two code blocks to its fences", () => {
  const runnable = fence("compile runnable");
  const other = fence("compile");
  const tree: Node = {
    type: "root",
    children: [
      { type: "raw", value: "<details>\n<summary>Full setup</summary>" },
      other,
      runnable,
      { type: "raw", value: "</details>" },
    ],
  };
  runnableCodeBlocks()(tree);
  expect(tree.children?.[3]).toEqual({
    type: "mdxJsxFlowElement",
    name: "RunnableCode",
    attributes: [],
    children: [runnable],
  });
});
