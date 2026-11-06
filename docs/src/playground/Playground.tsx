import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { HighlightedCode } from "../components/HighlightedCode.js";
import { type CodeToken, tokenizeCode } from "../lib/code-tokens.js";
import { EDITOR_HINT, expectedResultHeight } from "./layout.js";
import {
  type ConsoleEntry,
  type ExampleError,
  followSiteTheme,
  frameDocument,
  runExample,
  watchFrameHeight,
} from "./run-example.js";

/**
 * The editor and live result of a runnable example, shown after "Try it"
 * (see components/RunnableCode.tsx). Each run gets a new frame: the code is
 * compiled, the packages it imports load in the frame, and the example's
 * grid, console output and errors show under the code.
 */

/** Props of {@link Playground}. */
interface PlaygroundProps {
  /** The example as the page shows it; Reset returns to it. */
  readonly source: string;
  readonly title: string | undefined;
}

/** One run of the example: a new frame for each. */
interface Run {
  readonly id: number;
  readonly code: string;
}

/** What the current run is doing. */
type RunState =
  | { readonly kind: "running" }
  | { readonly kind: "done"; readonly milliseconds: number }
  | { readonly kind: "failed" };

/** The status line for a run. */
function statusText(state: RunState, entries: number): string {
  if (state.kind === "running") return "Running…";
  if (state.kind === "failed") return "The example stopped with an error.";
  const lines = entries === 1 ? "1 console line" : `${entries} console lines`;
  return `Ran in ${Math.round(state.milliseconds)} ms, ${lines}.`;
}

export function Playground({ source, title }: PlaygroundProps) {
  const [code, setCode] = useState(source);
  const [run, setRun] = useState<Run>({ id: 0, code: source });
  const [state, setState] = useState<RunState>({ kind: "running" });
  const [error, setError] = useState<ExampleError>();
  const [entries, setEntries] = useState<readonly ConsoleEntry[]>([]);
  const editor = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();

  const start = (next: string) => {
    setEntries([]);
    setError(undefined);
    setState({ kind: "running" });
    setRun((previous) => ({ id: previous.id + 1, code: next }));
  };
  const reset = () => {
    setCode(source);
    start(source);
  };
  const showLine = (line: number) => {
    const textarea = editor.current;
    if (textarea === null) return;
    const lines = textarea.value.split("\n");
    const offset = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
    textarea.focus();
    textarea.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
  };

  return (
    <section aria-label={title ?? "Runnable example"} className="sw-playground">
      <div className="sw-playground__bar">
        <span className="sw-playground__title">{title ?? "Example"}</span>
        <button
          className="sw-button"
          data-size="sm"
          data-variant="primary"
          onClick={() => start(code)}
          type="button"
        >
          <svg aria-hidden="true" className="sw-icon" data-size="sm" focusable="false">
            <use href="#sw-icon-play" />
          </svg>
          <span>Run</span>
        </button>
        <button className="sw-button" data-size="sm" onClick={reset} type="button">
          <svg aria-hidden="true" className="sw-icon" data-size="sm" focusable="false">
            <use href="#sw-icon-refresh" />
          </svg>
          <span>Reset</span>
        </button>
      </div>
      <CodeEditor
        describedBy={hintId}
        errorLine={error?.line}
        label={`Code of ${title ?? "the example"}`}
        onChange={setCode}
        onRun={() => start(code)}
        textarea={editor}
        value={code}
      />
      <p className="sw-playground__hint" id={hintId}>
        {EDITOR_HINT}
      </p>
      {error === undefined ? null : (
        <div className="sw-playground__error" role="alert">
          <svg aria-hidden="true" className="sw-icon" data-size="sm" focusable="false">
            <use href="#sw-icon-warning" />
          </svg>
          <p>
            <strong>{error.name}</strong> {error.message}
          </p>
          {error.line === undefined ? null : (
            <button
              className="sw-button"
              data-size="sm"
              data-variant="quiet"
              onClick={() => showLine(error.line ?? 1)}
              type="button"
            >
              Line {error.line}
            </button>
          )}
        </div>
      )}
      <div className="sw-playground__result">
        <p className="sw-playground__label">
          <span>Result</span>
          <span role="status">{statusText(state, entries.length)}</span>
        </p>
        <ExampleFrame
          code={run.code}
          key={run.id}
          onConsole={(entry) => setEntries((previous) => [...previous, entry])}
          onError={(failure) => {
            setError(failure);
            setState({ kind: "failed" });
          }}
          onFinish={(milliseconds) =>
            setState((previous) =>
              previous.kind === "failed" ? previous : { kind: "done", milliseconds },
            )
          }
        />
        {entries.length === 0 ? null : (
          <ol aria-label="Console output" className="sw-playground__console">
            {entries.map((entry, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- console lines repeat; their order is their identity.
              <li data-level={entry.level} key={index}>
                <HighlightedCode code={entry.text} language="typescript" />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/** Props of {@link CodeEditor}. */
interface CodeEditorProps {
  readonly value: string;
  readonly label: string;
  readonly describedBy: string;
  /** The example line an error points at, marked in the editor. */
  readonly errorLine: number | undefined;
  readonly textarea: RefObject<HTMLTextAreaElement | null>;
  onChange(value: string): void;
  onRun(): void;
}

/** The highlighted code, one list of tokens per source line. */
function highlightedLines(code: string): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of tokenizeCode(code, "typescript")) {
    const parts = token.text.split("\n");
    for (const [index, text] of parts.entries()) {
      if (index > 0) lines.push([]);
      if (text.length > 0) lines.at(-1)?.push({ text, role: token.role });
    }
  }
  return lines;
}

/**
 * A text area over the highlighted code, so the code keeps the site's colours
 * while it is edited. Both layers wrap long lines at the same place, as the
 * page's code block does on a phone. The highlighted layer draws each source
 * line as its own block, so the line an error points at is marked whole,
 * however many rows it wraps to. Tab indents; Escape, then Tab, leaves the
 * editor.
 */
function CodeEditor({
  value,
  label,
  describedBy,
  errorLine,
  textarea,
  onChange,
  onRun,
}: CodeEditorProps) {
  const leaving = useRef(false);
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onRun();
      return;
    }
    if (event.key === "Escape") {
      leaving.current = true;
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !leaving.current) {
      event.preventDefault();
      // insertText keeps the browser's undo history; setRangeText is the fallback.
      if (!document.execCommand("insertText", false, "  ")) {
        event.currentTarget.setRangeText(
          "  ",
          event.currentTarget.selectionStart,
          event.currentTarget.selectionEnd,
          "end",
        );
        onChange(event.currentTarget.value);
      }
    }
    leaving.current = false;
  };
  const lines = useMemo(() => highlightedLines(value), [value]);
  return (
    <div className="sw-playground__editor">
      <pre aria-hidden="true">
        <code>
          {lines.map((tokens, line) => (
            <span
              className="sw-playground__line"
              data-error={line + 1 === errorLine ? "" : undefined}
              // oxlint-disable-next-line react/no-array-index-key -- lines repeat; their position is their identity.
              key={line}
            >
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
            </span>
          ))}
        </code>
      </pre>
      <textarea
        aria-describedby={describedBy}
        aria-label={label}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        ref={textarea}
        spellCheck={false}
        value={value}
      />
    </div>
  );
}

/** Props of {@link ExampleFrame}. */
interface ExampleFrameProps {
  readonly code: string;
  onConsole(entry: ConsoleEntry): void;
  onError(error: ExampleError): void;
  onFinish(milliseconds: number): void;
}

/** The frame one run of the example runs in, as tall as what the example draws. */
function ExampleFrame({ code, onConsole, onError, onFinish }: ExampleFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Until the example draws, the frame takes the height the example gives its grid.
  const [height, setHeight] = useState(() => expectedResultHeight(code));
  const frameSource = useMemo(() => frameDocument(), []);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (frame.current !== null) void followSiteTheme(frame.current);
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const start = () => {
    const element = frame.current;
    if (element === null) return;
    watchFrameHeight(element, setHeight);
    const started = performance.now();
    void runExample(element, code, { console: onConsole, error: onError }).then((finished) => {
      if (finished) onFinish(performance.now() - started);
    });
  };

  return (
    <iframe
      className="sw-playground__frame"
      onLoad={start}
      ref={frame}
      // Scripts run so the example can; the frame cannot navigate the page or open windows.
      sandbox="allow-scripts allow-same-origin"
      srcDoc={frameSource}
      style={height === undefined ? undefined : { height }}
      title="Example result"
    />
  );
}
