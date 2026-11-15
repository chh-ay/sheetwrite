import { type RuntimeCodeLanguage, tokenizeCode } from "@docs/lib/code-tokens.js";
import { createMemo, For, type JSX, splitProps } from "solid-js";

/** Props of {@link HighlightedCode}. */
type HighlightedCodeProps = Omit<JSX.HTMLAttributes<HTMLElement>, "children"> & {
  readonly code: string;
  readonly language: RuntimeCodeLanguage;
};

/**
 * Code that a page computes at run time (a JSON result, a formula read from a
 * live workbook), coloured with the site's code roles. Wrap it in `<pre>` for
 * a block.
 */
export function HighlightedCode(props: HighlightedCodeProps) {
  const [local, rest] = splitProps(props, ["code", "language"]);
  const tokens = createMemo(() => tokenizeCode(local.code, local.language));
  return (
    <code {...rest}>
      <For each={tokens()}>
        {(token) =>
          token.role === undefined ? (
            token.text
          ) : (
            <span class={`sw-code-${token.role}`}>{token.text}</span>
          )
        }
      </For>
    </code>
  );
}
