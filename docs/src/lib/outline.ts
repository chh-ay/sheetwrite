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
interface HastElement {
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

function classes_of(node: HastElement): string[] {
  return [node.properties?.className ?? []].flat().map(String);
}

function has_class(node: HastElement, name: string): boolean {
  return classes_of(node).includes(name);
}

function text_of(node: HastElement, skip: (child: HastElement) => boolean = () => false): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? [])
    .filter((child) => !skip(child))
    .map((child) => text_of(child, skip))
    .join("");
}

function find_element(
  node: HastElement,
  test: (element: HastElement) => boolean,
): HastElement | undefined {
  if (node.type === "element" && test(node)) return node;
  for (const child of node.children ?? []) {
    const found = find_element(child, test);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The outline of a page's content, by the same rules the browser applies to
 * the rendered article (`useDocumentOutline`): h2 and h3 headings with ids,
 * and member cards on API pages without their own member index (where the
 * group headings, Properties and Methods, stand in for them); a member's
 * inner headings and search anchors are left out.
 */
function collect_outline(tree: HastElement): OutlineItem[] {
  const lists_members =
    find_element(tree, (node) => has_class(node, "api-member-index")) === undefined;
  const collected: OutlineItem[] = [];
  const visit = (node: HastElement, inside_member: boolean): void => {
    for (const child of node.children ?? []) {
      if (child.type !== "element") continue;
      const id = child.properties?.id;
      const is_member = child.tagName === "article" && has_class(child, "api-member");
      const is_heading = child.tagName === "h2" || child.tagName === "h3";
      const skipped =
        has_class(child, "api-search-anchor") ||
        (lists_members && has_class(child, "api-member-group"));
      if (typeof id === "string" && !skipped) {
        const label = is_member
          ? lists_members
            ? String(child.properties?.dataMember ?? "")
            : ""
          : is_heading && !inside_member
            ? text_of(child, (element) => has_class(element, "api-count")).trim()
            : "";
        const previous = collected.at(-1);
        if (label !== "" && !(previous?.label === label && previous.depth === 1)) {
          collected.push({ id, label, depth: is_member || child.tagName === "h3" ? 1 : 0 });
        }
      }
      visit(child, inside_member || is_member);
    }
  };
  visit(tree, false);
  return collected.length >= MIN_OUTLINE_ENTRIES ? collected : [];
}

/** `key: value` as an estree object property. */
function estree_property(key: string, value: unknown): EstreeNode {
  return {
    type: "Property",
    kind: "init",
    method: false,
    shorthand: false,
    computed: false,
    key: { type: "Identifier", name: key },
    value: estree_value(value),
  };
}

/** A JSON-like value as an estree expression. */
function estree_value(value: unknown): EstreeNode {
  if (Array.isArray(value)) return { type: "ArrayExpression", elements: value.map(estree_value) };
  if (value !== null && typeof value === "object") {
    return {
      type: "ObjectExpression",
      properties: Object.entries(value).map(([key, entry]) => estree_property(key, entry)),
    };
  }
  return { type: "Literal", value };
}

/** The object literal of `export const frontmatter = {…}` in an MDX ESM node. */
function frontmatter_object(program: EstreeNode | undefined): EstreeNode | undefined {
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
      (node) => node.type === "mdxjsEsm" && frontmatter_object(node.data?.estree) !== undefined,
    );
    const object = frontmatter_object(esm?.data?.estree);
    if (object === undefined) return;
    (object.properties as EstreeNode[]).push(estree_property("outline", collect_outline(tree)));
  };
}
