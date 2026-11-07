/**
 * Runnable examples. A fence whose meta has the word `runnable` gets a "Try it"
 * button that runs the example in an editor and a live grid on the page (see
 * components/RunnableCode.tsx). This build step wraps such a fence in
 * `<RunnableCode>` and imports that component into the page, so only pages
 * with a runnable example ship its code.
 *
 * Only complete examples can run: `docs:check` accepts `runnable` on a
 * compile-checked `ts` fence without `partial` that imports only
 * {@link RUNNABLE_IMPORTS} (scripts/docs-content-checks.ts).
 */

/** The packages a runnable example may import; the playground loads each of them. */
export const RUNNABLE_IMPORTS = [
  "@sheetwrite/core",
  "@sheetwrite/core/styles.css",
  "@sheetwrite/formulas",
  "@sheetwrite/charts",
] as const;

/** One import a runnable example may use. */
export type RunnableImport = (typeof RUNNABLE_IMPORTS)[number];

/** A hast node as this step reads and writes it, MDX nodes included. */
interface RunnableHastNode {
  type: string;
  tagName?: string;
  name?: string;
  value?: string;
  properties?: Record<string, unknown>;
  attributes?: unknown[];
  children?: RunnableHastNode[];
  data?: { meta?: string | null; estree?: unknown };
}

const RUNNABLE_META = /(?:^|\s)runnable(?:\s|$)/;
const COMPONENT = "RunnableCode";
/**
 * Vite resolves a leading `/` from the docs root, in the client and the server
 * build. The islands module renders it as an island on static docs pages.
 */
const COMPONENT_MODULE = "/src/islands/content.tsx";

/** Whether a fence asks for a "Try it" button. */
export function isRunnableMeta(meta: string | null | undefined): boolean {
  // A quoted value, such as a title, is not a flag.
  return RUNNABLE_META.test((meta ?? "").replace(/"[^"]*"|'[^']*'/g, ""));
}

/** `import { RunnableCode } from "…"` as an MDX ESM node, with the tree MDX compiles. */
function componentImport(): RunnableHastNode {
  const identifier = { type: "Identifier", name: COMPONENT };
  return {
    type: "mdxjsEsm",
    value: `import { ${COMPONENT} } from ${JSON.stringify(COMPONENT_MODULE)};`,
    data: {
      estree: {
        type: "Program",
        sourceType: "module",
        body: [
          {
            type: "ImportDeclaration",
            specifiers: [{ type: "ImportSpecifier", imported: identifier, local: identifier }],
            source: {
              type: "Literal",
              value: COMPONENT_MODULE,
              raw: JSON.stringify(COMPONENT_MODULE),
            },
            attributes: [],
          },
        ],
      },
    },
  };
}

/** Whether a node is a raw HTML block that opens or closes a `<details>` disclosure. */
function detailsTag(node: RunnableHastNode): "open" | "close" | "both" | undefined {
  if (node.type !== "raw") return undefined;
  const value = node.value ?? "";
  const opens = /<details[\s>]/.test(value);
  const closes = value.includes("</details>");
  if (opens && closes) return "both";
  if (opens) return /^<details[\s>]/.test(value.trim()) ? "open" : "both";
  return closes ? (value.trim() === "</details>" ? "close" : "both") : undefined;
}

/**
 * The sibling range of a runnable fence in a `<details>` disclosure ("Full
 * setup") that holds no other code block. Markdown keeps the disclosure's
 * tags as raw HTML blocks among its content until a later step parses them.
 */
function disclosureAround(
  siblings: readonly RunnableHastNode[],
  index: number,
): [number, number] | undefined {
  const find = (step: -1 | 1, wanted: "open" | "close"): number | undefined => {
    for (let at = index + step; at >= 0 && at < siblings.length; at += step) {
      const sibling = siblings[at] as RunnableHastNode;
      if (sibling.tagName === "pre") return undefined;
      const tag = detailsTag(sibling);
      if (tag !== undefined) return tag === wanted ? at : undefined;
    }
    return undefined;
  };
  const open = find(-1, "open");
  const close = find(1, "close");
  return open === undefined || close === undefined ? undefined : [open, close];
}

/**
 * Wraps each runnable fence in `<RunnableCode>`. A fence alone in a
 * collapsed disclosure is wrapped with its disclosure, so the Try it button
 * shows under the closed disclosure, not inside it. Runs before Expressive
 * Code, which still renders the fence inside the wrapper.
 */
export function runnableCodeBlocks() {
  return (tree: RunnableHastNode): void => {
    let found = false;
    const visit = (node: RunnableHastNode): void => {
      const children = node.children;
      if (children === undefined) return;
      const output: RunnableHastNode[] = [];
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index] as RunnableHastNode;
        const code = child.tagName === "pre" ? child.children?.[0] : undefined;
        if (code?.tagName !== "code" || !isRunnableMeta(code.data?.meta)) {
          visit(child);
          output.push(child);
          continue;
        }
        found = true;
        const disclosure = disclosureAround(children, index);
        if (disclosure === undefined) {
          output.push({
            type: "mdxJsxFlowElement",
            name: COMPONENT,
            attributes: [],
            children: [child],
          });
          continue;
        }
        const [open, close] = disclosure;
        // The opener and the content before the fence are already in the output.
        output.splice(output.length - (index - open));
        output.push({
          type: "mdxJsxFlowElement",
          name: COMPONENT,
          attributes: [{ type: "mdxJsxAttribute", name: "disclosed", value: null }],
          children: children.slice(open, close + 1),
        });
        index = close;
      }
      node.children = output;
    };
    visit(tree);
    if (found) tree.children?.unshift(componentImport());
  };
}
