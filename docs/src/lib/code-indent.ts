import { definePlugin, type ExpressiveCodePlugin } from "@expressive-code/core";
import { addClassName } from "@expressive-code/core/hast";

/** How far a wrapped line's continuation hangs past the line's own indent, in characters. */
const HANGING_INDENT = 2;
/** The deepest leading indent with its own class; deeper lines hang from this depth. */
const MAX_INDENT = 40;

/** The class that gives a line of `indent` leading characters its hanging indent. */
const indentClass = (indent: number) => `sw-i${Math.min(indent, MAX_INDENT)}`;

/**
 * Per-line hanging indent for wrapped code, without inline styles. A wrapped
 * line continues under its own indent plus {@link HANGING_INDENT} characters.
 * Expressive Code's `preserveIndent` writes `style="--ecIndent:Nch"` on every
 * line, and the page JavaScript carries each of those styles; this plugin adds
 * a short class instead (`sw-i4`), and its base styles map each class to
 * `--ecIndent`, which Expressive Code's line padding and `text-indent` read.
 * Lines without leading whitespace take the default and carry no class.
 */
export function codeHangingIndent(): ExpressiveCodePlugin {
  const rules = Array.from(
    { length: MAX_INDENT },
    (_, index) =>
      `.ec-line.${indentClass(index + 1)} { --ecIndent: ${index + 1 + HANGING_INDENT}ch; }`,
  );
  return definePlugin({
    name: "Hanging indent",
    baseStyles: `.ec-line { --ecIndent: ${HANGING_INDENT}ch; }\n${rules.join("\n")}`,
    hooks: {
      postprocessRenderedLine: ({ line, renderData }) => {
        const indent = line.text.match(/^\s*/)?.[0].length ?? 0;
        if (indent > 0) addClassName(renderData.lineAst, indentClass(indent));
      },
    },
  });
}
