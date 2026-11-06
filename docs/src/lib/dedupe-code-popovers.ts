/**
 * Hover popovers are rendered inline, one panel per hovered token. A page that
 * mentions `Grid` forty times would otherwise ship forty identical panels in
 * its HTML, in its hydration chunk, and in its live DOM. This pass keeps one
 * panel per distinct content and points every trigger at the shared panel.
 *
 * The kept panels leave the page tree: they become the HTML of one inert
 * `<template class="sw-code-popover-store">` at the end of the document. The
 * browser parses template content without rendering, styling or hydrating
 * it, and `code-popovers.ts` clones a panel from the store when it opens.
 */

import { type ElementContent, toHtml } from "@expressive-code/core/hast";

import type { HastNode } from "./build-hast.js";
import { hashIdentifier } from "./hash-identifier.js";

interface VFileLike {
  path?: string;
}

const PANEL_CLASS = "sw-code-popover__panel";
const STORE_CLASS = "sw-code-popover-store";

function hasClass(node: HastNode, name: string): boolean {
  const value = node.properties?.className;
  return Array.isArray(value)
    ? value.includes(name)
    : String(value ?? "")
        .split(" ")
        .includes(name);
}

/** Panel identity: its content and attributes, without the per-position id. */
function panelKey(panel: HastNode): string {
  return JSON.stringify(panel, (key, value) =>
    key === "position" || key === "id" ? undefined : value,
  );
}

/**
 * Panels are hast elements built by Expressive Code; `HastNode` is the build
 * plugins' structural view of the same nodes.
 */
function panelsHtml(panels: HastNode[]): string {
  return toHtml({
    type: "root",
    children: panels as unknown as ElementContent[],
  });
}

/**
 * `<template className="sw-code-popover-store" dangerouslySetInnerHTML={{ __html }} />`
 * as an MDX JSX node. React writes the HTML into the template's content on
 * client renders and leaves the prerendered content alone when it hydrates.
 */
function popoverStore(html: string): HastNode & Record<string, unknown> {
  const innerHtml = {
    type: "ObjectExpression",
    properties: [
      {
        type: "Property",
        kind: "init",
        method: false,
        shorthand: false,
        computed: false,
        key: { type: "Identifier", name: "__html" },
        value: { type: "Literal", value: html },
      },
    ],
  };
  return {
    type: "mdxJsxFlowElement",
    name: "template",
    attributes: [
      { type: "mdxJsxAttribute", name: "className", value: STORE_CLASS },
      { type: "mdxJsxAttribute", name: "data-pagefind-ignore", value: "" },
      {
        type: "mdxJsxAttribute",
        name: "dangerouslySetInnerHTML",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: "",
          data: {
            estree: {
              type: "Program",
              sourceType: "module",
              body: [{ type: "ExpressionStatement", expression: innerHtml }],
            },
          },
        },
      },
    ],
    children: [],
  };
}

export function dedupeCodePopovers() {
  return (tree: HastNode, file: VFileLike): void => {
    const renamed = new Map<string, string>();
    const sharedIdByKey = new Map<string, string>();
    const store: HastNode[] = [];
    // Several documents can share one page (landing snippets, showcase setup),
    // so shared ids carry a per-document prefix.
    const prefix = `sw-popover-${hashIdentifier(file.path ?? "")}`;

    const collect = (node: HastNode): void => {
      if (!node.children) return;
      node.children = node.children.filter((child) => {
        if (child.type !== "element" || !hasClass(child, PANEL_CLASS)) return true;
        const originalId = String(child.properties?.id ?? "");
        const key = panelKey(child);
        let sharedId = sharedIdByKey.get(key);
        if (sharedId === undefined) {
          sharedId = `${prefix}-${sharedIdByKey.size}`;
          sharedIdByKey.set(key, sharedId);
          store.push({
            ...child,
            properties: { ...child.properties, id: sharedId },
          });
        }
        renamed.set(originalId, sharedId);
        return false;
      });
      for (const child of node.children) collect(child);
    };

    const retarget = (node: HastNode): void => {
      const target = node.properties?.dataSwCodePopoverTrigger;
      if (typeof target === "string") {
        const sharedId = renamed.get(target);
        if (sharedId !== undefined) {
          node.properties = {
            ...node.properties,
            ariaDescribedBy: sharedId,
            dataSwCodePopoverTrigger: sharedId,
          };
        }
      }
      for (const child of node.children ?? []) retarget(child);
    };

    collect(tree);
    if (store.length === 0) return;
    retarget(tree);
    tree.children = [...(tree.children ?? []), popoverStore(panelsHtml(store))];
  };
}
