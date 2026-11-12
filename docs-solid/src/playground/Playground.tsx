import { type CodeToken, tokenizeCode } from "@docs/lib/code-tokens.js";
import type { ExampleError } from "@docs/playground/example-error.js";
import { EDITOR_HINT, expectedResultHeight } from "@docs/playground/layout.js";
import {
  type ConsoleEntry,
  followSiteTheme,
  frameDocument,
  runExample,
  watchFrameHeight,
} from "@docs/playground/run-example.js";
import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import { HighlightedCode } from "../components/HighlightedCode.js";

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

export function Playground(props: PlaygroundProps) {
  const [code, setCode] = createSignal(props.source);
  const [run, setRun] = createSignal<Run>({ id: 0, code: props.source });
  const [state, setState] = createSignal<RunState>({ kind: "running" });
  const [error, setError] = createSignal<ExampleError>();
  const [entries, setEntries] = createSignal<readonly ConsoleEntry[]>([]);
  let editor: HTMLTextAreaElement | undefined;
  const hintId = createUniqueId();
  const title = () => props.title;

  const start = (next: string) => {
    setEntries([]);
    setError(undefined);
    setState({ kind: "running" });
    setRun((previous) => ({ id: previous.id + 1, code: next }));
  };
  const reset = () => {
    setCode(props.source);
    start(props.source);
  };
  const showLine = (line: number) => {
    const textarea = editor;
    if (textarea === undefined) return;
    const lines = textarea.value.split("\n");
    const offset = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
    textarea.focus();
    textarea.setSelectionRange(offset, offset + (lines[line - 1]?.length ?? 0));
  };

  return (
    <section aria-label={title() ?? "Runnable example"} class="sw-playground">
      <div class="sw-playground__bar">
        <span class="sw-playground__title">{title() ?? "Example"}</span>
        <button
          class="sw-button"
          data-size="sm"
          data-variant="primary"
          onClick={() => start(code())}
          type="button"
        >
          <svg aria-hidden="true" class="sw-icon" data-size="sm" focusable="false">
            <use href="#sw-icon-play" />
          </svg>
          <span>Run</span>
        </button>
        <button class="sw-button" data-size="sm" onClick={reset} type="button">
          <svg aria-hidden="true" class="sw-icon" data-size="sm" focusable="false">
            <use href="#sw-icon-refresh" />
          </svg>
          <span>Reset</span>
        </button>
      </div>
      <CodeEditor
        describedBy={hintId}
        errorLine={error()?.line}
        label={`Code of ${title() ?? "the example"}`}
        onChange={setCode}
        onRun={() => start(code())}
        textarea={(element) => {
          editor = element;
        }}
        value={code()}
      />
      <p class="sw-playground__hint" id={hintId}>
        {EDITOR_HINT}
      </p>
      <Show when={error()}>
        {(failure) => (
          <div class="sw-playground__error" role="alert">
            <svg aria-hidden="true" class="sw-icon" data-size="sm" focusable="false">
              <use href="#sw-icon-warning" />
            </svg>
            <p>
              <strong>{failure().name}</strong> {failure().message}
            </p>
            <Show when={failure().line !== undefined}>
              <button
                class="sw-button"
                data-size="sm"
                data-variant="quiet"
                onClick={() => showLine(failure().line ?? 1)}
                type="button"
              >
                Line {failure().line}
              </button>
            </Show>
          </div>
        )}
      </Show>
      <div class="sw-playground__result">
        <p class="sw-playground__label">
          <span>Result</span>
          <span role="status">{statusText(state(), entries().length)}</span>
        </p>
        {/* Keyed on the run: each run replaces the frame with a new one. */}
        <Show keyed when={run()}>
          {(current) => (
            <ExampleFrame
              code={current.code}
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
          )}
        </Show>
        <Show when={entries().length > 0}>
          <ol aria-label="Console output" class="sw-playground__console">
            <For each={entries()}>
              {(entry) => (
                <li data-level={entry.level}>
                  <HighlightedCode code={entry.text} language="typescript" />
                </li>
              )}
            </For>
          </ol>
        </Show>
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
  /** Receives the text area, so the playground can select an error's line. */
  readonly textarea: (element: HTMLTextAreaElement) => void;
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
function CodeEditor(props: CodeEditorProps) {
  let leaving = false;
  const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      props.onRun();
      return;
    }
    if (event.key === "Escape") {
      leaving = true;
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !leaving) {
      event.preventDefault();
      // insertText keeps the browser's undo history; setRangeText is the fallback.
      if (!document.execCommand("insertText", false, "  ")) {
        event.currentTarget.setRangeText(
          "  ",
          event.currentTarget.selectionStart,
          event.currentTarget.selectionEnd,
          "end",
        );
        props.onChange(event.currentTarget.value);
      }
    }
    leaving = false;
  };
  const lines = createMemo(() => highlightedLines(props.value));
  return (
    <div class="sw-playground__editor">
      <pre aria-hidden="true">
        <code>
          {/* Lines by position: lines repeat; their position is their identity. */}
          <Index each={lines()}>
            {(tokens, line) => (
              <span
                class="sw-playground__line"
                data-error={line + 1 === props.errorLine ? "" : undefined}
              >
                <For each={tokens()}>
                  {(token) =>
                    token.role === undefined ? (
                      token.text
                    ) : (
                      <span class={`sw-code-${token.role}`}>{token.text}</span>
                    )
                  }
                </For>
              </span>
            )}
          </Index>
        </code>
      </pre>
      <textarea
        aria-describedby={props.describedBy}
        aria-label={props.label}
        autocapitalize="off"
        autocomplete="off"
        autocorrect="off"
        onInput={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        ref={props.textarea}
        spellcheck={false}
        value={props.value}
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
function ExampleFrame(props: ExampleFrameProps) {
  let frame!: HTMLIFrameElement;
  // Until the example draws, the frame takes the height the example gives its grid.
  const [height, setHeight] = createSignal<number | undefined>(expectedResultHeight(props.code));
  const frameSource = frameDocument();

  onMount(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => void followSiteTheme(frame));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    onCleanup(() => observer.disconnect());
  });

  const start = () => {
    watchFrameHeight(frame, (next) => setHeight(next));
    const started = performance.now();
    void runExample(frame, props.code, { console: props.onConsole, error: props.onError }).then(
      (finished) => {
        if (finished) props.onFinish(performance.now() - started);
      },
    );
  };

  return (
    <iframe
      class="sw-playground__frame"
      onLoad={start}
      ref={(element) => {
        frame = element;
      }}
      // Scripts run so the example can; the frame cannot navigate the page or open windows.
      sandbox="allow-scripts allow-same-origin"
      srcdoc={frameSource}
      style={height() === undefined ? undefined : { height: `${height()}px` }}
      title="Example result"
    />
  );
}
