import { lazy, type ReactNode, Suspense, useRef, useState } from "react";

/**
 * A runnable example: the code block as the page renders it, with a "Try it"
 * button. The editor, the compiler and the engine load only after the click,
 * so the page ships just this component. A build step wraps each fence marked
 * `runnable` in it (see lib/runnable-code.ts).
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

export function RunnableCode({ children }: Readonly<{ children: ReactNode }>) {
  const block = useRef<HTMLDivElement>(null);
  const [example, setExample] = useState<Example>();

  const tryIt = () => {
    if (block.current !== null) setExample(readExample(block.current));
  };
  const actions = (loading: boolean) => (
    <div className="sw-runnable__actions">
      <button
        className="sw-button"
        data-size="sm"
        data-variant="primary"
        disabled={loading}
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
        <span>{loading ? "Loading…" : "Try it"}</span>
      </button>
      <span>Run and edit this example on the page.</span>
    </div>
  );

  return (
    <div className="sw-runnable" ref={block}>
      {example === undefined ? (
        <>
          {children}
          {actions(false)}
        </>
      ) : (
        <Suspense
          fallback={
            <>
              {children}
              {actions(true)}
            </>
          }
        >
          <Playground source={example.source} title={example.title} />
        </Suspense>
      )}
    </div>
  );
}
