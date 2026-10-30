// DOM helpers shared by the Chart panel and the pivot field list.

import type { ApplyTransactionResult } from "../types/transaction.js";

const NOT_APPLIED = "The grid did not accept this change.";

/**
 * What a panel shows after one grid operation: null when it was applied, else
 * the reason the grid gave (protection, a limit, an invalid definition).
 */
export function rejectionMessage(result: ApplyTransactionResult): string | null {
  if (result.status === "applied") return null;
  if (result.status === "rejected") return result.issues[0]?.message ?? NOT_APPLIED;
  return NOT_APPLIED;
}

let fieldSerial = 0;

/** A `<label>` over one control, with an optional inline error under it. */
export interface PanelField<T extends HTMLElement> {
  readonly element: HTMLElement;
  readonly control: T;
  /** Show `message` under the control and mark it invalid; `null` clears it. */
  setError(message: string | null): void;
}

export function panelField<T extends HTMLInputElement | HTMLSelectElement>(
  label: string,
  control: T,
  focusKey: string,
): PanelField<T> {
  fieldSerial += 1;
  const errorId = `sheetwrite-panel-error-${fieldSerial}`;

  const element = document.createElement("label");
  element.className = "sheetwrite-panel-field";
  const text = document.createElement("span");
  text.className = "sheetwrite-panel-label";
  text.textContent = label;
  control.classList.add("sheetwrite-panel-control");
  control.dataset.focusKey = focusKey;
  const error = document.createElement("span");
  error.className = "sheetwrite-panel-error";
  error.id = errorId;
  error.hidden = true;
  element.append(text, control, error);

  return {
    element,
    control,
    setError(message) {
      error.hidden = message === null;
      error.textContent = message ?? "";
      if (message === null) {
        control.removeAttribute("aria-invalid");
        control.removeAttribute("aria-describedby");
      } else {
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("aria-describedby", errorId);
      }
    },
  };
}

/** A `<select>` with `[value, label]` options. */
export function selectOf(
  options: readonly (readonly [string, string])[],
  value: string,
): HTMLSelectElement {
  const select = document.createElement("select");
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = value;
  return select;
}

/** A text input that commits once per change; `show` updates it from the model. */
export interface CommittingInput {
  readonly input: HTMLInputElement;
  /** Show the model's text, unless the user is typing a draft in this field. */
  show(text: string): void;
}

/**
 * A text input that commits on Enter or on blur, once per change: the panel
 * then runs ONE grid operation. `commit` returns an error message to show, or
 * null when the value was accepted. Escape inside the field restores the last
 * committed text before the panel sees the key.
 */
export function committingInput(
  value: string,
  commit: (text: string) => string | null,
  onError: (message: string | null) => void,
): CommittingInput {
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = value;
  let committed = value;

  const submit = (): void => {
    if (input.value === committed) {
      onError(null);
      return;
    }
    const message = commit(input.value);
    onError(message);
    if (message === null) committed = input.value;
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape" && input.value !== committed) {
      // The first Escape drops the draft; the next one closes the panel.
      event.preventDefault();
      input.value = committed;
      onError(null);
    }
  });
  input.addEventListener("blur", submit);

  return {
    input,
    show(text) {
      const drafting = document.activeElement === input && input.value !== committed;
      committed = text;
      if (!drafting) {
        input.value = text;
        onError(null);
      }
    },
  };
}

/** A titled group of controls inside a panel body. */
export function panelSection(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "sheetwrite-panel-section";
  const heading = document.createElement("h3");
  heading.className = "sheetwrite-panel-heading";
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

/**
 * Rebuild `body` with `build`, then put focus back on the control that had it,
 * found by its `data-focus-key`. Panels rebuild after every committed change
 * and after changes from elsewhere (undo, a collaborator).
 */
export function rebuildPanel(body: HTMLElement, build: (body: HTMLElement) => void): void {
  const active = document.activeElement;
  const key =
    active instanceof HTMLElement && body.contains(active) ? active.dataset.focusKey : undefined;
  body.replaceChildren();
  build(body);
  if (key === undefined) return;
  body.querySelector<HTMLElement>(`[data-focus-key="${key}"]`)?.focus();
}
