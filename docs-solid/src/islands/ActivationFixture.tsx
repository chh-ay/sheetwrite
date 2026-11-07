import { createSignal, Match, onMount, Switch } from "solid-js";

/** The control a fixture island holds, as the first thing a reader uses on it. */
export type ActivationControl = "button" | "link" | "checkbox" | "text";

/**
 * One control in an interaction island, for test/browser/island-activation.spec.ts:
 * its output shows that the island's code saw the reader's first input.
 */
export function ActivationFixture(props: {
  readonly control: ActivationControl;
  /** Names the fixture in its output's test id. */
  readonly name: string;
}) {
  let field: HTMLInputElement | undefined;
  const [presses, setPresses] = createSignal(0);
  const [checked, setChecked] = createSignal(false);
  const [text, setText] = createSignal("");
  // Text typed before the island hydrated is in the field already.
  onMount(() => setText(field?.value ?? ""));
  return (
    <div class="sw-activation-fixture" data-control={props.control}>
      <Switch>
        <Match when={props.control === "button"}>
          <button onClick={() => setPresses((count) => count + 1)} type="button">
            Press
          </button>
        </Match>
        <Match when={props.control === "link"}>
          <a href="#followed" onClick={() => setPresses((count) => count + 1)}>
            Follow
          </a>
        </Match>
        <Match when={props.control === "checkbox"}>
          <label>
            <input
              checked={checked()}
              onChange={(event) => setChecked(event.currentTarget.checked)}
              type="checkbox"
            />
            Check
          </label>
        </Match>
        <Match when={props.control === "text"}>
          <input
            aria-label="Type"
            onInput={(event) => setText(event.currentTarget.value)}
            ref={field}
            type="text"
          />
        </Match>
      </Switch>
      <output data-testid={`activation-${props.name}`}>
        {props.control === "checkbox"
          ? `checked: ${checked()}`
          : props.control === "text"
            ? `text: ${text()}`
            : `presses: ${presses()}`}
      </output>
    </div>
  );
}
