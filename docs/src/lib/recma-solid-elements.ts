/**
 * MDX writes every HTML element as `<_components.p>`, so a page's
 * `components` prop can replace any of them. React accepts a tag-name string
 * as a component; Solid's compiler needs a literal tag to build a DOM
 * template. This recma plugin turns `_components.<tag>` back into `<tag>` for
 * every lowercase element (the site replaces none: pages are static, so links
 * are plain anchors), so the page's markup compiles to templates.
 *
 * It also turns the docs pipeline's React attributes into Solid's:
 * - `dangerouslySetInnerHTML={{ __html: x }}`, which the code-popover store
 *   uses (docs/src/lib/dedupe-code-popovers.ts), becomes `innerHTML={x}`;
 * - `suppressHydrationWarning`, which code blocks carry (docs/vite.config.ts),
 *   is dropped: Solid has no such prop and would write it as an attribute;
 * - style objects get CSS property names. MDX's own `css` casing would also
 *   rewrite custom properties (Expressive Code's `--ecMaxLine` would become
 *   `--ec-max-line`), so pages compile with `dom` casing and only standard
 *   properties change here;
 * - `aria-*` and `data-*` attributes set to `true` (written without a value)
 *   get the value "true", as React writes them. Solid would write an empty
 *   value, and `aria-hidden=""` does not hide anything.
 */

import type { CompileOptions } from "@mdx-js/mdx";

interface EstreeNode {
  type: string;
  [key: string]: unknown;
}

function isNode(value: unknown): value is EstreeNode {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}

function intrinsicName(name: unknown): string | undefined {
  if (!isNode(name) || name.type !== "JSXMemberExpression") return undefined;
  const { object, property } = name;
  if (!isNode(object) || object.type !== "JSXIdentifier" || object.name !== "_components") {
    return undefined;
  }
  if (!isNode(property) || typeof property.name !== "string") return undefined;
  const tag = property.name;
  return /^[a-z]/.test(tag) ? tag : undefined;
}

/** `fontSize` → `font-size`, `msTransform` → `-ms-transform`; custom properties stay. */
function cssPropertyName(name: string): string {
  if (name.startsWith("--")) return name;
  const dashed = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return dashed.startsWith("ms-") ? `-${dashed}` : dashed;
}

function cssStyleObject(value: unknown): void {
  if (!isNode(value) || value.type !== "JSXExpressionContainer") return;
  const { expression } = value;
  if (!isNode(expression) || expression.type !== "ObjectExpression") return;
  if (!Array.isArray(expression.properties)) return;
  for (const property of expression.properties) {
    if (!isNode(property) || property.type !== "Property" || property.computed) continue;
    const { key } = property;
    if (!isNode(key)) continue;
    const name = key.type === "Identifier" ? key.name : key.value;
    if (typeof name !== "string") continue;
    const cssName = cssPropertyName(name);
    property.key = { type: "Literal", value: cssName, raw: JSON.stringify(cssName) };
  }
}

/** `dangerouslySetInnerHTML={{ __html: x }}` → `innerHTML={x}`. */
function innerHtmlAttribute(attribute: EstreeNode): void {
  const { value } = attribute;
  if (!isNode(value) || value.type !== "JSXExpressionContainer" || !isNode(value.expression)) {
    throw new Error("dangerouslySetInnerHTML without an { __html } object");
  }
  const properties = value.expression.properties;
  const html = Array.isArray(properties)
    ? properties.find(
        (property): property is EstreeNode =>
          isNode(property) && isNode(property.key) && property.key.name === "__html",
      )
    : undefined;
  if (html === undefined) throw new Error("dangerouslySetInnerHTML without __html");
  attribute.name = { type: "JSXIdentifier", name: "innerHTML" };
  value.expression = html.value;
}

/** Rewrites the element's React attributes in place. */
function solidAttributes(element: EstreeNode): void {
  if (!Array.isArray(element.attributes)) return;
  element.attributes = element.attributes.filter((attribute: unknown) => {
    if (!isNode(attribute) || attribute.type !== "JSXAttribute" || !isNode(attribute.name)) {
      return true;
    }
    switch (attribute.name.name) {
      case "suppressHydrationWarning":
        return false;
      case "dangerouslySetInnerHTML":
        innerHtmlAttribute(attribute);
        return true;
      case "style":
        cssStyleObject(attribute.value);
        return true;
      default:
        if (attribute.value === null && /^(?:aria|data)-/.test(String(attribute.name.name))) {
          attribute.value = { type: "Literal", value: "true", raw: '"true"' };
        }
        return true;
    }
  });
}

function visit(node: EstreeNode): void {
  if (node.type === "JSXOpeningElement" || node.type === "JSXClosingElement") {
    const tag = intrinsicName(node.name);
    if (tag !== undefined) node.name = { type: "JSXIdentifier", name: tag };
  }
  if (node.type === "JSXOpeningElement") solidAttributes(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) visit(child);
    } else if (isNode(value)) {
      visit(value);
    }
  }
}

export function recmaSolidElements() {
  return (tree: EstreeNode): void => visit(tree);
}

/** MDX compile options for pages Solid's compiler turns into DOM templates. */
export const SOLID_MDX_OPTIONS = {
  jsx: true,
  elementAttributeNameCase: "html",
  stylePropertyNameCase: "dom",
  recmaPlugins: [recmaSolidElements],
} satisfies CompileOptions;
