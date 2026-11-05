import { type ComponentProps, useMemo } from "react";

import { type RuntimeCodeLanguage, tokenizeCode } from "../lib/code-tokens.js";

/** Props of {@link HighlightedCode}. */
type HighlightedCodeProps = Omit<ComponentProps<"code">, "children"> & {
  readonly code: string;
  readonly language: RuntimeCodeLanguage;
};

/**
 * Code that a page computes at run time (a JSON result, a formula read from a
 * live workbook), coloured with the site's code roles. Wrap it in `<pre>` for
 * a block.
 */
export function HighlightedCode({ code, language, ...props }: HighlightedCodeProps) {
  const tokens = useMemo(() => tokenizeCode(code, language), [code, language]);
  return (
    <code {...props}>
      {tokens.map((token, index) =>
        token.role === undefined ? (
          token.text
        ) : (
          // oxlint-disable-next-line react/no-array-index-key -- tokens repeat; their position is their identity.
          <span className={`sw-code-${token.role}`} key={index}>
            {token.text}
          </span>
        ),
      )}
    </code>
  );
}
