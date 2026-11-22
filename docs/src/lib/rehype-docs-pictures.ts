// Puts the docs art into compiled pages: each section card's illustration, the
// diagrams replacing older figure images, and a diagram after each heading the
// placement table names (art/docs-pictures.ts). Runs after rehype-slug,
// so headings have their ids. A placement whose heading is missing fails the
// build, so the table can't drift from the pages.
import {
  AFTER_LEAD,
  AT_START,
  CARD_ART_NAMES,
  DOCS_PICTURE_PLACEMENTS,
  REPLACED_DIAGRAMS,
} from "../art/docs-pictures.js";
import { FIGURES_STYLESHEET, framedShot } from "./content-components.js";

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

/** Content files sit under docs/src/content/docs/; a file path holds this once. */
const CONTENT_ROOT = "/src/content/docs/";
const PICTURE_MODULE = new URL("../art/DocsPicture.tsx", import.meta.url).pathname;
const ART_STYLESHEET = new URL("../art/art.css", import.meta.url).pathname;

/** The docs address of a content file: `start/index.md` is `/docs/start/`. */
function page_address(path: string): string | undefined {
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
function use_href(node: HastNode): string | undefined {
  const use = node.children?.find((child) => child.tagName === "use");
  const href = use?.properties?.href;
  return typeof href === "string" ? href : undefined;
}

function has_class(node: HastNode, name: string): boolean {
  const class_name = node.properties?.className;
  return Array.isArray(class_name) && class_name.includes(name);
}

/** Swaps card illustrations and replaced figure images; returns whether any changed. */
function replace_images(node: HastNode): boolean {
  let changed = false;
  node.children = node.children?.map((child) => {
    if (child.tagName === "svg" && has_class(child, "sw-card__art")) {
      const name = /\/figures\/illustrations\/([\w-]+)\.svg#art$/.exec(use_href(child) ?? "")?.[1];
      if (name !== undefined && CARD_ART_NAMES.has(name)) {
        changed = true;
        return picture({ card: name }, false);
      }
    }
    if (child.tagName === "svg" && has_class(child, "sw-diagram")) {
      const name = /\/figures\/diagrams\/([\w-]+)\.svg#fig$/.exec(use_href(child) ?? "")?.[1];
      const replacement = name === undefined ? undefined : REPLACED_DIAGRAMS[name];
      if (replacement !== undefined) {
        changed = true;
        return picture({ name: replacement, bare: "true" }, true);
      }
    }
    if (replace_images(child)) changed = true;
    return child;
  });
  return changed;
}

/** What a page's placements put in: drawn diagrams, screenshots, or both. */
interface Placed {
  readonly diagrams: boolean;
  readonly shots: boolean;
}

/** Where a placement goes in the body's children: the index to insert at, or -1 when its anchor is missing. */
function insertion_index(children: readonly HastNode[], after: string): number {
  if (after === AT_START) return children.findIndex((child) => child.type === "element");
  const anchor =
    after === AFTER_LEAD
      ? children.findIndex((child) => child.tagName === "p")
      : children.findIndex(
          (child) => /^h[2-4]$/.test(child.tagName ?? "") && child.properties?.id === after,
        );
  return anchor < 0 ? -1 : anchor + 1;
}

/** Inserts each placed diagram or screenshot at the top, after its heading, or after the lead paragraph. */
function place_pictures(tree: HastNode, address: string): Placed {
  const placements = DOCS_PICTURE_PLACEMENTS[address] ?? [];
  const children = tree.children ?? [];
  for (const placement of placements) {
    const { after } = placement;
    const index = insertion_index(children, after);
    const what =
      "picture" in placement ? `${placement.picture} diagram` : `${placement.shot.name} screenshot`;
    if (index < 0) {
      const anchor =
        after === AT_START ? "body" : after === AFTER_LEAD ? "lead paragraph" : `heading #${after}`;
      throw new Error(`${address}: no ${anchor} for the ${what}`);
    }
    const node =
      "picture" in placement
        ? picture({ name: placement.picture }, true)
        : framedShot(placement.shot);
    children.splice(index, 0, node);
  }
  tree.children = children;
  return {
    diagrams: placements.some((placement) => "picture" in placement),
    shots: placements.some((placement) => "shot" in placement),
  };
}

function esm(body: unknown[]): HastNode {
  return {
    type: "mdxjsEsm",
    value: "",
    data: { estree: { type: "Program", sourceType: "module", body } },
  };
}

const literal = (value: string) => ({ type: "Literal", value, raw: JSON.stringify(value) });

/** `import <name> from "<sheet>?url"`, as an import declaration. */
function stylesheet_import(name: string, sheet: string) {
  return {
    type: "ImportDeclaration",
    specifiers: [{ type: "ImportDefaultSpecifier", local: { type: "Identifier", name } }],
    source: literal(`${sheet}?url`),
  };
}

/**
 * Imports DocsPicture and the art stylesheet when the page draws art, and the
 * figures stylesheet when it places screenshots, and adds those stylesheets to
 * the page's `stylesheets` export.
 */
function link_pictures(
  tree: HastNode,
  { art, shots }: Readonly<{ art: boolean; shots: boolean }>,
): void {
  const declarations: unknown[] = [];
  const sheets: { type: string; name: string }[] = [];
  if (art) {
    declarations.push(
      {
        type: "ImportDeclaration",
        specifiers: [
          { type: "ImportDefaultSpecifier", local: { type: "Identifier", name: "DocsPicture" } },
        ],
        source: literal(PICTURE_MODULE),
      },
      stylesheet_import("artStylesheet", ART_STYLESHEET),
    );
    sheets.push({ type: "Identifier", name: "artStylesheet" });
  }
  if (shots) {
    declarations.push(stylesheet_import("shotStylesheet", FIGURES_STYLESHEET));
    sheets.push({ type: "Identifier", name: "shotStylesheet" });
  }
  const imports = esm(declarations);
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
    exported.init.elements.push(...sheets);
    tree.children = [imports, ...children];
    return;
  }
  const export_sheets = esm([
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
            init: { type: "ArrayExpression", elements: sheets },
          },
        ],
      },
    },
  ]);
  tree.children = [imports, export_sheets, ...children];
}

/** The rehype plugin: art and screenshots in the docs pages that have them. */
export function rehypeDocsPictures() {
  return (tree: HastNode, file: { path?: string }): void => {
    const address = page_address(file.path ?? "");
    if (address === undefined) return;
    const replaced = replace_images(tree);
    const placed = place_pictures(tree, address);
    if (replaced || placed.diagrams || placed.shots)
      link_pictures(tree, { art: replaced || placed.diagrams, shots: placed.shots });
  };
}
