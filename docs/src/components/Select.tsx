import { createEffect, createSignal, For, onCleanup } from "solid-js";

// The select brings its own stylesheet: islands load it with their code.
import "../styles/select.css";
import { Icon } from "./Icon.js";

/*
 * The site's select: the WAI-ARIA "select-only combobox" pattern. Focus stays
 * on the combobox; the open list marks its active option through
 * aria-activedescendant. One look in every browser (styles/select.css).
 */

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

interface SelectProps {
  /** Prefix of the control's element ids; unique on the page. */
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (value: string) => void;
  readonly class?: string;
}

/** Typed characters within this long of each other search as one string. */
const TYPEAHEAD_MS = 500;
/** PageUp and PageDown move this many options. */
const PAGE_STEP = 10;
/** Gap between the field and its list, in px (styles/select.css uses the same). */
const LIST_GAP_PX = 4;

export function Select(props: SelectProps) {
  const [open, set_open] = createSignal(false);
  const [active, set_active] = createSignal(0);
  const [above, set_above] = createSignal(false);
  let root: HTMLDivElement | undefined;
  let combobox: HTMLDivElement | undefined;
  let list: HTMLDivElement | undefined;
  let typed = "";
  let typed_at = 0;

  const selected_index = () =>
    Math.max(
      0,
      props.options.findIndex((option) => option.value === props.value),
    );
  const option_id = (index: number) => `${props.id}-option-${index}`;
  const last = () => props.options.length - 1;

  const show = (index: number): void => {
    set_active(Math.min(Math.max(index, 0), last()));
    if (open()) return;
    set_open(true);
    // Below the field unless only the space above holds the list.
    if (combobox && list) {
      const field = combobox.getBoundingClientRect();
      const needed = list.offsetHeight + LIST_GAP_PX;
      const below = window.innerHeight - field.bottom;
      set_above(below < needed && field.top > below);
    }
  };
  const close = (): void => {
    set_open(false);
  };
  const choose = (index: number): void => {
    const option = props.options[index];
    close();
    if (option !== undefined && option.value !== props.value) props.onChange(option.value);
  };

  /** The next option whose label starts with what the reader typed, from the active one on. */
  const typeahead = (character: string): number | undefined => {
    const now = Date.now();
    typed = now - typed_at > TYPEAHEAD_MS ? character : typed + character;
    typed_at = now;
    const labels = props.options.map((option) => option.label.toLowerCase());
    // Repeating one letter cycles through the options that start with it.
    const repeated = typed.length > 1 && [...typed].every((letter) => letter === typed[0]);
    const search = repeated ? typed[0]! : typed;
    const start = open() ? active() + (typed.length === 1 || repeated ? 1 : 0) : selected_index();
    for (let step = 0; step < labels.length; step++) {
      const index = (start + step) % labels.length;
      if (labels[index]!.startsWith(search.toLowerCase())) return index;
    }
    return undefined;
  };

  const on_key_down = (event: KeyboardEvent): void => {
    const is_character = event.key.length === 1 && !event.ctrlKey && !event.metaKey;
    // A space continues a typeahead search instead of choosing.
    const continuing = typed !== "" && Date.now() - typed_at < TYPEAHEAD_MS;
    const searching = is_character && (event.key !== " " || continuing);
    if (searching && !event.altKey) {
      event.preventDefault();
      const match = typeahead(event.key);
      if (match !== undefined) show(match);
      else if (!open()) show(selected_index());
      return;
    }
    // Any other key ends the search.
    typed = "";
    if (!open()) {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case " ":
          event.preventDefault();
          show(selected_index());
          return;
        case "Home":
          event.preventDefault();
          show(0);
          return;
        case "End":
          event.preventDefault();
          show(last());
          return;
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        show(active() + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (event.altKey) choose(active());
        else show(active() - 1);
        return;
      case "Home":
        event.preventDefault();
        show(0);
        return;
      case "End":
        event.preventDefault();
        show(last());
        return;
      case "PageDown":
        event.preventDefault();
        show(active() + PAGE_STEP);
        return;
      case "PageUp":
        event.preventDefault();
        show(active() - PAGE_STEP);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active());
        return;
      case "Escape":
        event.preventDefault();
        close();
        return;
      case "Tab":
        // Tab keeps its default: it picks the active option and moves focus on.
        choose(active());
        return;
    }
  };

  // The active option stays in view while the reader moves through a long list.
  createEffect(() => {
    if (!open()) return;
    document.getElementById(option_id(active()))?.scrollIntoView({ block: "nearest" });
  });

  // A press outside the control closes the list without choosing.
  const on_outside_pointer = (event: PointerEvent): void => {
    if (open() && root && !root.contains(event.target as Node)) close();
  };
  createEffect(() => {
    if (!open()) return;
    document.addEventListener("pointerdown", on_outside_pointer, true);
    onCleanup(() => document.removeEventListener("pointerdown", on_outside_pointer, true));
  });

  return (
    <div
      class={["sw-select", props.class].filter(Boolean).join(" ")}
      ref={(element) => {
        root = element;
      }}
    >
      <span class="sw-select__label" id={`${props.id}-label`}>
        {props.label}
      </span>
      <div class="sw-select__anchor">
        <div
          aria-activedescendant={open() ? option_id(active()) : undefined}
          aria-controls={`${props.id}-listbox`}
          aria-expanded={open() ? "true" : "false"}
          aria-haspopup="listbox"
          aria-labelledby={`${props.id}-label`}
          class="sw-select__trigger"
          id={`${props.id}-combobox`}
          onClick={() => {
            // A replayed click (islands/client.tsx) arrives without the press that focuses.
            combobox?.focus();
            if (open()) close();
            else show(selected_index());
          }}
          onFocusOut={(event) => {
            if (!root?.contains(event.relatedTarget as Node | null)) close();
          }}
          onKeyDown={on_key_down}
          ref={(element) => {
            combobox = element;
          }}
          role="combobox"
          tabIndex={0}
        >
          <span class="sw-select__value">{props.options[selected_index()]?.label}</span>
          <Icon class="sw-select__icon" name="chevron-down" />
        </div>
        {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- a select-only combobox keeps focus on the field; the list's active option is aria-activedescendant. */}
        <div
          aria-labelledby={`${props.id}-label`}
          class="sw-select__list"
          data-placement={above() ? "above" : "below"}
          hidden={!open()}
          id={`${props.id}-listbox`}
          // Choosing with the pointer must not take focus from the combobox. The
          // mouse press moves focus; cancelling the pointer press would also
          // cancel a touch's click.
          onMouseDown={(event) => event.preventDefault()}
          ref={(element) => {
            list = element;
          }}
          role="listbox"
        >
          <For each={props.options}>
            {(option, index) => (
              // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- options are chosen with keys on the focused field (Enter, Space); a click is the pointer path.
              <div
                aria-selected={index() === selected_index() ? "true" : "false"}
                class="sw-select__option"
                data-active={open() && index() === active() ? "" : undefined}
                id={option_id(index())}
                // A listener on the option itself, not Solid's delegated one on
                // the document: WebKit turns a tap into a click only on an
                // element that listens for clicks (or takes focus).
                on:click={() => choose(index())}
                onPointerMove={() => set_active(index())}
                role="option"
              >
                <Icon class="sw-select__check" name="check" />
                {option.label}
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
