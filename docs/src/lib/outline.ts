/**
 * The page outline ("On this page"): its entries, and the build step that
 * collects them from a page's headings so the server render can show the
 * outline before any script runs.
 */

/** One outline entry: a heading or member row and its anchor. */
export interface OutlineItem {
  id: string;
  label: string;
  /** 0 for an h2, 1 for an h3 or a member row. */
  depth: number;
}

/** Fewer than two entries is not an outline worth a navigation surface. */
export const MIN_OUTLINE_ENTRIES = 2;

/** The hast node shape the outline reads. */
export interface HastElement {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastElement[];
  data?: { estree?: EstreeNode };
}

interface EstreeNode {
  type: string;
  [key: string]: unknown;
}

function classesOf(node: HastElement): string[] {
  return [node.properties?.className ?? []].flat().map(String);
}

function hasClass(node: HastElement, name: string): boolean {
  return classesOf(node).includes(name);
}

function textOf(node: HastElement, skip: (child: HastElement) => boolean = () => false): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? [])
    .filter((child) => !skip(child))
    .map((child) => textOf(child, skip))
    .join("");
}

function findElement(
  node: HastElement,
  test: (element: HastElement) => boolean,
): HastElement | undefined {
  if (node.type === "element" && test(node)) return node;
  for (const child of node.children ?? []) {
    const found = findElement(child, test);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The outline of a page's content, by the same rules the browser applies to
 * the rendered article (`useDocumentOutline`): h2 and h3 headings with ids,
 * and member rows on API pages without their own member index; a member's
 * inner headings and search anchors are left out.
 */
export function collectOutline(tree: HastElement): OutlineItem[] {
  const listsMembers =
    findElement(tree, (node) => hasClass(node, "api-member-index")) === undefined;
  const collected: OutlineItem[] = [];
  const visit = (node: HastElement, insideMember: boolean): void => {
    for (const child of node.children ?? []) {
      if (child.type !== "element") continue;
      const id = child.properties?.id;
      const isMember = child.tagName === "details" && hasClass(child, "api-member");
      const isHeading = child.tagName === "h2" || child.tagName === "h3";
      if (typeof id === "string" && !hasClass(child, "api-search-anchor")) {
        const label = isMember
          ? listsMembers
            ? textOf(
                findElement(child, (element) => element.tagName === "summary")?.children?.find(
                  (element) => element.tagName === "code",
                ) ?? { type: "root" },
              ).trim()
            : ""
          : isHeading && !insideMember
            ? textOf(child, (element) => hasClass(element, "api-count")).trim()
            : "";
        const previous = collected.at(-1);
        if (label !== "" && !(previous?.label === label && previous.depth === 1)) {
          collected.push({ id, label, depth: isMember || child.tagName === "h3" ? 1 : 0 });
        }
      }
      visit(child, insideMember || isMember);
    }
  };
  visit(tree, false);
  return collected.length >= MIN_OUTLINE_ENTRIES ? collected : [];
}

/** `key: value` as an estree object property. */
function estreeProperty(key: string, value: unknown): EstreeNode {
  return {
    type: "Property",
    kind: "init",
    method: false,
    shorthand: false,
    computed: false,
    key: { type: "Identifier", name: key },
    value: estreeValue(value),
  };
}

/** A JSON-like value as an estree expression. */
function estreeValue(value: unknown): EstreeNode {
  if (Array.isArray(value)) return { type: "ArrayExpression", elements: value.map(estreeValue) };
  if (value !== null && typeof value === "object") {
    return {
      type: "ObjectExpression",
      properties: Object.entries(value).map(([key, entry]) => estreeProperty(key, entry)),
    };
  }
  return { type: "Literal", value };
}

/** The object literal of `export const frontmatter = {…}` in an MDX ESM node. */
function frontmatterObject(program: EstreeNode | undefined): EstreeNode | undefined {
  for (const statement of (program?.body as EstreeNode[] | undefined) ?? []) {
    const declaration = statement.declaration as EstreeNode | undefined;
    for (const declarator of (declaration?.declarations as EstreeNode[] | undefined) ?? []) {
      const id = declarator.id as EstreeNode | undefined;
      const init = declarator.init as EstreeNode | undefined;
      if (id?.name === "frontmatter" && init?.type === "ObjectExpression") return init;
    }
  }
  return undefined;
}

/**
 * Rehype plugin, after heading ids are set: adds the page's outline to its
 * exported frontmatter, so the route loader has it for the server render.
 */
export function exportOutline() {
  return (tree: HastElement): void => {
    const esm = tree.children?.find(
      (node) => node.type === "mdxjsEsm" && frontmatterObject(node.data?.estree) !== undefined,
    );
    const object = frontmatterObject(esm?.data?.estree);
    if (object === undefined) return;
    (object.properties as EstreeNode[]).push(estreeProperty("outline", collectOutline(tree)));
  };
}
