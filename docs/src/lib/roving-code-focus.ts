/**
 * One Tab stop per code block. A code block can hold dozens of focusable
 * symbols (hover triggers and API links); each used to be its own Tab stop,
 * so leaving a block took one press per symbol. This build pass leaves the
 * block's first symbol in the tab order and takes the rest out; at runtime
 * `code-enhancements.ts` moves the stop with the arrow keys (a roving
 * tabindex), so Tab always leaves the block in one press.
 */

import type { HastNode } from "./build-hast.js";

/** Class names of the focusable symbols inside rendered code. */
export const CODE_SYMBOL_CLASSES = ["sw-code-popover__trigger", "sw-code-ref"] as const;

function classNames(node: HastNode): readonly string[] {
  const value = node.properties?.className;
  return Array.isArray(value) ? value.map(String) : String(value ?? "").split(" ");
}

function isCodeSymbol(node: HastNode): boolean {
  const names = classNames(node);
  return CODE_SYMBOL_CLASSES.some((name) => names.includes(name));
}

function collectSymbols(node: HastNode, symbols: HastNode[]): void {
  for (const child of node.children ?? []) {
    if (child.type !== "element") continue;
    if (isCodeSymbol(child)) symbols.push(child);
    collectSymbols(child, symbols);
  }
}

function setTabIndex(node: HastNode, tabIndex: number): void {
  node.properties = { ...node.properties, tabIndex };
}

/** Rehype plugin: within every `<pre>`, only the first code symbol is a Tab stop. */
export function rovingCodeFocus() {
  return (tree: HastNode): void => {
    const visit = (node: HastNode): void => {
      if (node.type === "element" && node.tagName === "pre") {
        const symbols: HastNode[] = [];
        collectSymbols(node, symbols);
        symbols.forEach((symbol, index) => setTabIndex(symbol, index === 0 ? 0 : -1));
        return;
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
