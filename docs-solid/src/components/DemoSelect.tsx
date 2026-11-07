import { Select } from "@kobalte/core/select";
import { createSignal } from "solid-js";

import { Icon } from "./Icon.js";

/*
 * The site's select, ported from docs/src/showcases/ui/DemoSelect.tsx. Kobalte
 * brings the listbox behaviour (arrow keys, typeahead, Escape, focus return,
 * positioning); the markup keeps the React version's classes, so
 * styles/demo-select.css applies unchanged.
 */

export interface DemoSelectOption {
  readonly label: string;
  readonly value: string;
}

interface DemoSelectProps {
  readonly label: string;
  readonly value: string;
  readonly options: readonly DemoSelectOption[];
  readonly onValueChange: (value: string) => void;
  readonly class?: string;
  readonly disabled?: boolean;
}

/** Gap between the field and its list, as the React version's `sideOffset`. */
const LIST_OFFSET_PX = 4;

export function DemoSelect(props: DemoSelectProps) {
  const [open, setOpen] = createSignal(false);
  const selected = () => props.options.find((option) => option.value === props.value);
  return (
    <div class={["sw-demo-select", props.class].filter(Boolean).join(" ")}>
      <Select<DemoSelectOption>
        disabled={props.disabled}
        // Open below the field like a menu, never over it.
        gutter={LIST_OFFSET_PX}
        itemComponent={(item) => (
          <Select.Item class="sw-demo-select__item" item={item.item}>
            <Select.ItemIndicator class="sw-demo-select__indicator">
              <Icon name="check" />
            </Select.ItemIndicator>
            <Select.ItemLabel>{item.item.rawValue.label}</Select.ItemLabel>
          </Select.Item>
        )}
        onChange={(option) => {
          if (option !== null) props.onValueChange(option.value);
        }}
        onOpenChange={setOpen}
        optionTextValue="label"
        optionValue="value"
        options={[...props.options]}
        placement="bottom-start"
        value={selected() ?? null}
      >
        <Select.Label class="sw-demo-select__label">{props.label}</Select.Label>
        {/*
          A select-only combobox, as the React version's trigger is: Kobalte
          renders a plain button with a listbox popup, which screen readers
          announce as a button. The stylesheet marks an open field the way the
          React version's popup does.
        */}
        <Select.Trigger
          class="sw-demo-select__trigger"
          data-popup-open={open() ? "" : undefined}
          role="combobox"
        >
          <Select.Value<DemoSelectOption>>{(state) => state.selectedOption()?.label}</Select.Value>
          <Select.Icon class="sw-demo-select__icon">
            <Icon name="chevron-down" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content class="sw-demo-select__positioner">
            <div class="sw-demo-select__popup">
              <Select.Listbox class="sw-demo-select__list" />
            </div>
          </Select.Content>
        </Select.Portal>
      </Select>
    </div>
  );
}
