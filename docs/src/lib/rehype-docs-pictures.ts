// Puts the docs art into compiled pages: each section card's illustration, the
// diagrams replacing older figure images, and a diagram after each heading the
// placement table names (art/docs-pictures.ts). Runs after rehype-slug,
// so headings have their ids. A placement whose heading is missing fails the
// build, so the table can't drift from the pages.
import {
  AFTER_LEAD,
  CARD_ART_NAMES,
  DOCS_PICTURE_PLACEMENTS,
  REPLACED_DIAGRAMS,
} from "../art/docs-pictures.js";

interface HastNode {
  type: string;
  tagName?: string;
  name?: string;
  value?: string;
  properties?: Record<string, unknown>;
  attributes?: { type: string; name: string; value: string }[];
  children?: HastNode[];
  data?: unknown;
}

const CONTENT_ROOT = new URL("../content/docs/", import.meta.url).pathname;
const PICTURE_MODULE = new URL("../art/DocsPicture.tsx", import.meta.url).pathname;
const ART_STYLESHEET = new URL("../art/art.css", import.meta.url).pathname;

/** The docs address of a content file: `start/index.md` is `/docs/start/`. */
function pageAddress(path: string): string | undefined {
  const index = path.indexOf(CONTENT_ROOT);
  if (index < 0) return undefined;
  const page = path
    .slice(index + CONTENT_ROOT.length)
    .replace(/\.(?:md|mdx)$/, "")
    .replace(/(?:^|\/)index$/, "");
  return page.length === 0 ? "/docs/" : `/docs/${page}/`;
}

function picture(attributes: Record<string, string>, flow: boolean): HastNode {
  return {
    type: flow ? "mdxJsxFlowElement" : "mdxJsxTextElement",
    name: "DocsPicture",
    attributes: Object.entries(attributes).map(([name, value]) => ({
      type: "mdxJsxAttribute",
      name,
      value,
    })),
    children: [],
  };
}

/** The `<use href>` target of an `<svg>` that draws one sprite or file symbol. */
function useHref(node: HastNode): string | undefined {
  const use = node.children?.find((child) => child.tagName === "use");
  const href = use?.properties?.href;
  return typeof href === "string" ? href : undefined;
}

function hasClass(node: HastNode, name: string): boolean {
  const className = node.properties?.className;
  return Array.isArray(className) && className.includes(name);
}

/** Swaps card illustrations and replaced figure images; returns whether any changed. */
function replaceImages(node: HastNode): boolean {
  let changed = false;
  node.children = node.children?.map((child) => {
    if (child.tagName === "svg" && hasClass(child, "sw-card__art")) {
      const name = /\/figures\/illustrations\/([\w-]+)\.svg#art$/.exec(useHref(child) ?? "")?.[1];
      if (name !== undefined && CARD_ART_NAMES.has(name)) {
        changed = true;
        return picture({ card: name }, false);
      }
    }
    if (child.tagName === "svg" && hasClass(child, "sw-diagram")) {
      const name = /\/figures\/diagrams\/([\w-]+)\.svg#fig$/.exec(useHref(child) ?? "")?.[1];
      const replacement = name === undefined ? undefined : REPLACED_DIAGRAMS[name];
      if (replacement !== undefined) {
        changed = true;
        return picture({ name: replacement, bare: "true" }, true);
      }
    }
    if (replaceImages(child)) changed = true;
    return child;
  });
  return changed;
}

/** Inserts each placed diagram after its heading, or after the lead paragraph. */
function placeDiagrams(tree: HastNode, address: string): boolean {
  const placements = DOCS_PICTURE_PLACEMENTS[address] ?? [];
  const children = tree.children ?? [];
  for (const { after, picture: name } of placements) {
    const index =
      after === AFTER_LEAD
        ? children.findIndex((child) => child.tagName === "p")
        : children.findIndex(
            (child) => /^h[2-4]$/.test(child.tagName ?? "") && child.properties?.id === after,
          );
    if (index < 0)
      throw new Error(
        `${address}: no ${after === AFTER_LEAD ? "lead paragraph" : `heading #${after}`} for the ${name} diagram`,
      );
    children.splice(index + 1, 0, picture({ name }, true));
  }
  tree.children = children;
  return placements.length > 0;
}

function esm(body: unknown[]): HastNode {
  return {
    type: "mdxjsEsm",
    value: "",
    data: { estree: { type: "Program", sourceType: "module", body } },
  };
}

const literal = (value: string) => ({ type: "Literal", value, raw: JSON.stringify(value) });

/** Imports DocsPicture and adds the art stylesheet to the page's `stylesheets` export. */
function linkArt(tree: HastNode): void {
  const sheet = { type: "Identifier", name: "artStylesheet" };
  const imports = esm([
    {
      type: "ImportDeclaration",
      specifiers: [
        { type: "ImportDefaultSpecifier", local: { type: "Identifier", name: "DocsPicture" } },
      ],
      source: literal(PICTURE_MODULE),
    },
    {
      type: "ImportDeclaration",
      specifiers: [{ type: "ImportDefaultSpecifier", local: sheet }],
      source: literal(`${ART_STYLESHEET}?url`),
    },
  ]);
  const children = tree.children ?? [];
  type Program = {
    body: {
      type: string;
      declaration?: { declarations?: { id: { name: string }; init: { elements: unknown[] } }[] };
    }[];
  };
  const exported = children
    .filter((child) => child.type === "mdxjsEsm")
    .flatMap((child) => (child.data as { estree: Program }).estree.body)
    .flatMap((statement) =>
      statement.type === "ExportNamedDeclaration"
        ? (statement.declaration?.declarations ?? [])
        : [],
    )
    .find((declaration) => declaration.id.name === "stylesheets");
  if (exported !== undefined) {
    exported.init.elements.push(sheet);
    tree.children = [imports, ...children];
    return;
  }
  const exportSheets = esm([
    {
      type: "ExportNamedDeclaration",
      specifiers: [],
      source: null,
      declaration: {
        type: "VariableDeclaration",
        kind: "const",
        declarations: [
          {
            type: "VariableDeclarator",
            id: { type: "Identifier", name: "stylesheets" },
            init: { type: "ArrayExpression", elements: [sheet] },
          },
        ],
      },
    },
  ]);
  tree.children = [imports, exportSheets, ...children];
}

/** The rehype plugin: art in the docs pages that have it. */
export function rehypeDocsPictures() {
  return (tree: HastNode, file: { path?: string }): void => {
    const address = pageAddress(file.path ?? "");
    if (address === undefined) return;
    const replaced = replaceImages(tree);
    const placed = placeDiagrams(tree, address);
    if (replaced || placed) linkArt(tree);
  };
}
