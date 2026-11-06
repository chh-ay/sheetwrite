import { lazy, type ReactNode, Suspense, useRef, useState } from "react";

import { EDITOR_HINT, expectedResultHeight } from "../playground/layout.js";

/**
 * A runnable example: the code block as the page renders it, with a "Try it"
 * button. The editor, the compiler and the engine load only after the click,
 * so the page ships just this component. A build step wraps each fence marked
 * `runnable` in it (see lib/runnable-code.ts); a fence in a collapsed "Full
 * setup" disclosure is wrapped with the disclosure (`disclosed`), so the
 * button shows under the closed disclosure.
 */

const loadPlayground = () => import("../playground/Playground.js");
const Playground = lazy(() => loadPlayground().then((module) => ({ default: module.Playground })));

/** Expressive Code's copy button keeps the fence text with U+007F between lines. */
const COPY_LINE_SEPARATOR = "\u007f";

/** The example the page shows, read from its code block when the reader asks to run it. */
interface Example {
  readonly source: string;
  readonly title: string | undefined;
}

/** Reads the example's text and title from the rendered code block. */
function readExample(block: HTMLElement): Example {
  const code = block.querySelector<HTMLElement>(".copy button[data-code]")?.dataset.code;
  if (code === undefined) throw new Error("A runnable example has no code to run");
  return {
    source: code.replaceAll(COPY_LINE_SEPARATOR, "\n"),
    title: block.querySelector("figcaption .title")?.textContent?.trim() || undefined,
  };
}

/** Props of {@link RunnableCode}. */
interface RunnableCodeProps {
  readonly children: ReactNode;
  /** The code is inside a collapsed disclosure; the button runs it without opening it. */
  readonly disclosed?: boolean;
}

/**
 * The playground's frame while its code loads: the page's code block in the
 * editor's place, and the bar, hint and result space at their final sizes,
 * so nothing below moves when the editor arrives.
 */
function PendingPlayground({
  children,
  example,
}: Readonly<{ children: ReactNode; example: Example }>) {
  const { title } = example;
  const height = expectedResultHeight(example.source);
  return (
    <section aria-busy="true" aria-label={title ?? "Runnable example"} className="sw-playground">
      <div className="sw-playground__bar">
        <span className="sw-playground__title">{title ?? "Example"}</span>
      </div>
      <div className="sw-playground__pending">{children}</div>
      <p className="sw-playground__hint">{EDITOR_HINT}</p>
      <div className="sw-playground__result">
        <p className="sw-playground__label">
          <span>Result</span>
          <span role="status">Loading…</span>
        </p>
        <div
          className="sw-playground__frame"
          style={height === undefined ? undefined : { height }}
        />
      </div>
    </section>
  );
}

export function RunnableCode({ children, disclosed = false }: RunnableCodeProps) {
  const block = useRef<HTMLDivElement>(null);
  const [example, setExample] = useState<Example>();

  const tryIt = () => {
    if (block.current !== null) setExample(readExample(block.current));
  };

  return (
    <div className="sw-runnable" ref={block}>
      {example === undefined ? (
        <>
          {children}
          <div className="sw-runnable__actions">
            <button
              className="sw-button"
              data-size="sm"
              data-variant="primary"
              onClick={tryIt}
              // Start the download while the pointer is on its way to a click.
              onFocus={() => void loadPlayground()}
              onPointerEnter={() => void loadPlayground()}
              type="button"
            >
              {/* The page's icon sprite; importing Icon here would split it out of the shared chunk. */}
              <svg aria-hidden="true" className="sw-icon" data-size="sm" focusable="false">
                <use href="#sw-icon-play" />
              </svg>
              <span>Try it</span>
            </button>
            <span>
              {disclosed
                ? "Run and edit the full setup on the page, without opening it first."
                : "Run and edit this example on the page."}
            </span>
          </div>
        </>
      ) : (
        <Suspense fallback={<PendingPlayground example={example}>{children}</PendingPlayground>}>
          <Playground source={example.source} title={example.title} />
        </Suspense>
      )}
    </div>
  );
}
