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
 * `@example` bodies follow on the next line. An unfenced comment is wrapped in
 * a ```tsx fence, which cannot be told apart from a comment fenced as tsx, so
 * the body is kept as written; the popover strips fences either way. Links to
 * declarations are Markdown links to `file://` URIs: in the summary they become
 * `{@link Name}` again, in `@see` the bare name, as 5.9 returned them.
 */

export interface NativeQuickInfo {
  text: string;
  docs: string;
  tags: [name: string, text: string | undefined][];
}

/** Hovers on positions with several projections are joined by this rule. */
const PROJECTION_SEPARATOR = "\n\n---\n\n";
const SIGNATURE_FENCE = /^(`{3,})typescript\n([\s\S]*?)\n\1\n/;
const TAG_START = /\n\n\*@([^*\s]+)\*/g;
const DASH_PREFIX = /^ — /;
const QUOTED_NAME = /^ `([^`]+)`/;
const DECLARATION_LINK = /\[(`?)([^\]]*?)\1\]\(file:\/\/[^)\s]*\)/g;
const URL_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]*)\)/g;

function declarationLinks(text: string, format: "link" | "name"): string {
  return text.replace(DECLARATION_LINK, (_, quote: string, label: string) => {
    if (format === "name") return label;
    return quote ? `{@linkcode ${label}}` : `{@link ${label}}`;
  });
}

function tagText(name: string, body: string): string | undefined {
  if (name === "example") return body.replace(/^\n/, "").replace(/\n$/, "") || undefined;
  let rest = body;
  let prefix = "";
  const quoted = QUOTED_NAME.exec(rest);
  if (quoted) {
    prefix = quoted[1] ?? "";
    rest = rest.slice(quoted[0].length);
  }
  rest = rest.replace(DASH_PREFIX, "").replace(/^ /, "");
  const text = [prefix, rest].filter(Boolean).join(" ");
  if (name !== "see") return declarationLinks(text, "link") || undefined;
  // `@see {@link https://…}` keeps its tag syntax in 5.9; prose links only occur in summaries.
  const urls = text.replace(URL_LINK, (_, label: string, url: string) =>
    label === url ? `{@link ${url}}` : `{@link ${url} ${label}}`,
  );
  return declarationLinks(urls, "name") || undefined;
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
    docs: declarationLinks(documentation.slice(0, summaryEnd), "link"),
    tags,
  };
}
