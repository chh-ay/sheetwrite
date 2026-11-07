import { For } from "solid-js";

/** One choice of a {@link RadioGroup}. */
export interface RadioOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

/** Props of {@link RadioGroup}. */
export interface RadioGroupProps<Value extends string> {
  readonly label: string;
  readonly options: readonly RadioOption<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly disabled?: boolean;
  readonly class?: string;
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * A segmented single choice, as the WAI-ARIA radio group pattern: Tab reaches
 * the checked option, and the arrow keys check the next or previous one.
 * Styles: styles/showcase.css (`sw-demo-radio-*`).
 */
export function RadioGroup<Value extends string>(props: RadioGroupProps<Value>) {
  let group!: HTMLDivElement;
  const move = (from: number, step: number) => {
    const count = props.options.length;
    const next = props.options[(from + step + count) % count];
    if (next === undefined) return;
    props.onChange(next.value);
    queueMicrotask(() =>
      group.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus(),
    );
  };
  return (
    <div
      aria-label={props.label}
      class={["sw-demo-radio-group", props.class].filter(Boolean).join(" ")}
      ref={group}
      role="radiogroup"
    >
      <For each={props.options}>
        {(option, index) => {
          const checked = () => option.value === props.value;
          return (
            <button
              aria-checked={checked()}
              class="sw-demo-radio-item"
              data-checked={checked() || undefined}
              disabled={props.disabled}
              onClick={() => props.onChange(option.value)}
              onKeyDown={(event) => {
                const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
                if (step === 0) return;
                event.preventDefault();
                move(index(), step);
              }}
              role="radio"
              tabIndex={checked() ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
