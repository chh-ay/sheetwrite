/**
 * Turns a TypeScript 7.1 language-server hover (Markdown) back into the
 * quick-info shape the TypeScript 5.9 language service returned: the
 * signature, the JSDoc summary, and JSDoc tags as `[name, text]` pairs.
 *
 * The server writes hovers in hover.go (`getDocumentationFromDeclaration`):
 *
 *     ```typescript
 *     <signature>
 *     ```
 *     <summary>
 *
 *     *@tag* `name` — text
 *
 * `@example` bodies follow on the next line inside a ```tsx fence unless the
 * comment was already fenced. Links to declarations are written as Markdown
 * links to `file://` URIs; they become `{@link Name}` again, which the popover
 * renderer already understands.
 */

export interface NativeQuickInfo {
  text: string;
  docs: string;
  tags: [name: string, text: string | undefined][];
}

/** Hovers on positions with several projections are joined by this rule. */
const PROJECTION_SEPARATOR = "\n\n---\n\n";
/** Before a projection rule, the closing fence ends the text. */
const SIGNATURE_FENCE = /^(`{3,})typescript\n([\s\S]*?)\n\1(?:\n|$)/;
const TAG_START = /\n\n\*@([^*\s]+)\*/g;
const DASH_PREFIX = /^ — /;
const QUOTED_NAME = /^ `([^`]+)`/;
const DECLARATION_LINK = /\[(`?)([^\]]*?)\1\]\(file:\/\/[^)\s]*\)/g;

function declarationLinks(text: string): string {
  return text.replace(DECLARATION_LINK, (_, quote: string, label: string) =>
    quote ? `{@linkcode ${label}}` : `{@link ${label}}`,
  );
}

/** Undo `writeCode(b, "tsx", text)`, which fences an unfenced `@example`. */
function exampleText(body: string): string {
  const text = body.replace(/^\n/, "").replace(/\n$/, "");
  const fence = /^(`{3,})tsx\n([\s\S]*)\n\1$/.exec(text);
  return fence?.[2] ?? text;
}

function tagText(name: string, body: string): string | undefined {
  if (name === "example") return exampleText(body) || undefined;
  let rest = body;
  let prefix = "";
  const quoted = QUOTED_NAME.exec(rest);
  if (quoted) {
    prefix = quoted[1] ?? "";
    rest = rest.slice(quoted[0].length);
  }
  rest = rest.replace(DASH_PREFIX, "").replace(/^ /, "");
  const text = declarationLinks([prefix, rest].filter(Boolean).join(" "));
  return text || undefined;
}

/**
 * The projections of one hover. A position in a content-mapped file can map to several
 * places in the mapper's TypeScript; the server then answers one projection per place.
 */
export function nativeHoverProjections(markdown: string): string[] {
  return markdown.split(PROJECTION_SEPARATOR);
}
export function parseNativeHover(markdown: string): NativeQuickInfo | undefined {
  const [first = ""] = markdown.split(PROJECTION_SEPARATOR);
  const signature = SIGNATURE_FENCE.exec(first);
  if (!signature) return undefined;
  const documentation = first.slice(signature[0].length);

  const starts = [...documentation.matchAll(TAG_START)];
  const summaryEnd = starts[0]?.index ?? documentation.length;
  const tags = starts.map((match, index): [string, string | undefined] => {
    const name = match[1] ?? "";
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = starts[index + 1]?.index ?? documentation.length;
    return [name, tagText(name, documentation.slice(bodyStart, bodyEnd))];
  });
  return {
    text: signature[2] ?? "",
    docs: declarationLinks(documentation.slice(0, summaryEnd)),
    tags,
  };
}
