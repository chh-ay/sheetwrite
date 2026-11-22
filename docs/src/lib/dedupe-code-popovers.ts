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

import { relative } from "node:path";

import { type ElementContent, toHtml } from "@expressive-code/core/hast";

import type { HastNode } from "./build-hast.js";
import { hashIdentifier } from "./hash-identifier.js";

interface VFileLike {
  path?: string;
}

/**
 * The repository root. Panel ids hash a document's path relative to it, so the
 * same sources build the same HTML wherever the checkout is.
 */
const REPOSITORY_ROOT = new URL("../../../", import.meta.url).pathname;

/** The id prefix of one document's shared panels, from its repository path. */
export function popoverIdPrefix(path: string | undefined): string {
  return `sw-popover-${hashIdentifier(path === undefined ? "" : relative(REPOSITORY_ROOT, path))}`;
}

const PANEL_CLASS = "sw-code-popover__panel";
const STORE_CLASS = "sw-code-popover-store";

function has_class(node: HastNode, name: string): boolean {
  const value = node.properties?.className;
  return Array.isArray(value)
    ? value.includes(name)
    : String(value ?? "")
        .split(" ")
        .includes(name);
}

/** Panel identity: its content and attributes, without the per-position id. */
function panel_key(panel: HastNode): string {
  return JSON.stringify(panel, (key, value) =>
    key === "position" || key === "id" ? undefined : value,
  );
}

/**
 * Panels are hast elements built by Expressive Code; `HastNode` is the build
 * plugins' structural view of the same nodes.
 */
function panels_html(panels: HastNode[]): string {
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
function popover_store(html: string): HastNode & Record<string, unknown> {
  const inner_html = {
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
              body: [{ type: "ExpressionStatement", expression: inner_html }],
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
    const shared_id_by_key = new Map<string, string>();
    const store: HastNode[] = [];
    // Several documents can share one page (landing snippets, showcase setup),
    // so shared ids carry a per-document prefix, then the panel's position.
    const prefix = popoverIdPrefix(file.path);

    const collect = (node: HastNode): void => {
      if (!node.children) return;
      node.children = node.children.filter((child) => {
        if (child.type !== "element" || !has_class(child, PANEL_CLASS)) return true;
        const original_id = String(child.properties?.id ?? "");
        const key = panel_key(child);
        let shared_id = shared_id_by_key.get(key);
        if (shared_id === undefined) {
          shared_id = `${prefix}-${shared_id_by_key.size}`;
          shared_id_by_key.set(key, shared_id);
          store.push({
            ...child,
            properties: { ...child.properties, id: shared_id },
          });
        }
        renamed.set(original_id, shared_id);
        return false;
      });
      for (const child of node.children) collect(child);
    };

    const retarget = (node: HastNode): void => {
      const target = node.properties?.dataSwCodePopoverTrigger;
      if (typeof target === "string") {
        const shared_id = renamed.get(target);
        if (shared_id !== undefined) {
          node.properties = {
            ...node.properties,
            ariaDescribedBy: shared_id,
            dataSwCodePopoverTrigger: shared_id,
          };
        }
      }
      for (const child of node.children ?? []) retarget(child);
    };

    collect(tree);
    if (store.length === 0) return;
    retarget(tree);
    tree.children = [...(tree.children ?? []), popover_store(panels_html(store))];
  };
}
