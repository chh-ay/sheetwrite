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
/** Vite resolves a leading `/` from the docs root, in the client and the server build. */
const COMPONENT_MODULE = "/src/components/RunnableCode.tsx";

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

/**
 * Wraps each runnable fence in `<RunnableCode>`. Runs before Expressive Code,
 * which still renders the fence inside the wrapper.
 */
export function runnableCodeBlocks() {
  return (tree: RunnableHastNode): void => {
    let found = false;
    const visit = (node: RunnableHastNode): void => {
      if (node.children === undefined) return;
      node.children = node.children.map((child) => {
        const code = child.tagName === "pre" ? child.children?.[0] : undefined;
        if (code?.tagName !== "code" || !isRunnableMeta(code.data?.meta)) {
          visit(child);
          return child;
        }
        found = true;
        return { type: "mdxJsxFlowElement", name: COMPONENT, attributes: [], children: [child] };
      });
    };
    visit(tree);
    if (found) tree.children?.unshift(componentImport());
  };
}
