/**
 * MDX writes every HTML element as `<_components.p>`, so a page's
 * `components` prop can replace any of them. React accepts a tag-name string
 * as a component; Solid's compiler needs a literal tag to build a DOM
 * template. This recma plugin turns `_components.<tag>` back into `<tag>` for
 * every lowercase element the site does not replace (all but `a`, which
 * ContentLink renders), so the page's static markup compiles to templates.
 * It also turns React's `dangerouslySetInnerHTML={{ __html: x }}`, which the
 * code-popover store uses (lib/dedupe-code-popovers.ts), into Solid's
 * `innerHTML={x}`.
 */

interface EstreeNode {
 type: string;
 [key: string]: unknown;
}

/** The element the docs pass as a component (ContentLink); it keeps the `_components.` lookup. */
const REPLACED_ELEMENT = "a";

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
 return /^[a-z]/.test(tag) && tag !== REPLACED_ELEMENT ? tag : undefined;
}

/** `dangerouslySetInnerHTML={{ __html: x }}` → `innerHTML={x}`; other attributes stay. */
function solidAttribute(attribute: EstreeNode): void {
 const { name, value } = attribute;
 if (!isNode(name) || name.name !== "dangerouslySetInnerHTML") return;
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
function visit(node: EstreeNode): void {
 if (node.type === "JSXOpeningElement" || node.type === "JSXClosingElement") {
  const tag = intrinsicName(node.name);
  if (tag !== undefined) node.name = { type: "JSXIdentifier", name: tag };
 }
 if (node.type === "JSXAttribute") solidAttribute(node);
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
