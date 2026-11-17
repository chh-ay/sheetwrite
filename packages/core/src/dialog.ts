/**
 * Modal dialogs over the grid: the merge warning, Excel's Insert and Delete
 * choices, and the shell Format Cells uses. The module loads on first use,
 * like the find bar, so a grid that never opens a dialog pays nothing for
 * it.
 */

import { checkStylePart } from "./style-parts.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** One button in a dialog's button row. */
interface DialogButton {
  readonly label: string;
  /** What {@link Dialog.result} resolves to when this button is chosen. */
  readonly value: string;
  /** Enter chooses this button from anywhere in the dialog but another button or a multi-line field. */
  readonly default?: boolean;
}

/** What a dialog shows and how it answers. */
interface DialogOptions {
  /** The dialog's name, shown as its heading. */
  readonly title: string;
  /** `alertdialog` for a warning the user must answer; `dialog` otherwise. */
  readonly role?: "dialog" | "alertdialog";
  /** A message, which also describes the dialog, or the dialog's content. */
  readonly body: string | HTMLElement;
  readonly buttons: readonly DialogButton[];
  /** The value Escape and {@link Dialog.close} resolve to. */
  readonly cancel: string;
  /** The element focused on open; the default button otherwise. */
  readonly initialFocus?: HTMLElement;
  /**
   * Called before a button other than `cancel` closes the dialog; `false`
   * keeps it open, for example while a field is invalid.
   */
  readonly accept?: (value: string) => boolean;
}

/** An open dialog. */
interface Dialog {
  readonly element: HTMLElement;
  /** Resolves once the dialog closes, with the chosen button's value or `cancel`. */
  readonly result: Promise<string>;
  /** Close the dialog with `value` (`cancel` by default); later calls do nothing. */
  close(value?: string): void;
}

/** What a dialog needs from the grid that opens it. */
export interface DialogHost {
  /** The grid root; the backdrop covers it. */
  readonly host: HTMLElement;
  /** The grid's theme, for the widget variables. */
  theme(): Theme;
  /** Give the grid its focus back when the dialog closes. */
  returnFocus(): void;
  /** Keep `close`, which the grid calls when another dialog opens or the grid is destroyed. */
  adopt(close: () => void): void;
}

const FOCUSABLE = "button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

let dialogCount = 0;

/**
 * Open a modal dialog over the grid. A backdrop covers the grid until the
 * dialog closes. Tab and Shift+Tab stay inside the dialog, Escape cancels and
 * Enter chooses the default button. Keys never reach the grid while the
 * dialog has focus. On close the dialog is removed and the grid gets its
 * focus back.
 */
export function openDialog(grid: DialogHost, options: DialogOptions): Dialog {
  const { host } = grid;
  seedWidgetTheme(host, grid.theme());
  const id = `sheetwrite-dialog-${++dialogCount}`;

  const backdrop = document.createElement("div");
  backdrop.className = "sheetwrite-dialog-backdrop";
  // A press on the backdrop keeps focus in the dialog.
  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target === backdrop) event.preventDefault();
  });

  const element = document.createElement("div");
  element.className = "sheetwrite-dialog";
  element.setAttribute("role", options.role ?? "dialog");
  element.setAttribute("aria-modal", "true");
  element.setAttribute("aria-labelledby", `${id}-title`);

  const title = document.createElement("h2");
  title.id = `${id}-title`;
  title.className = "sheetwrite-dialog-title";
  title.textContent = options.title;

  const body = document.createElement("div");
  body.className = "sheetwrite-dialog-body";
  if (typeof options.body === "string") {
    const message = document.createElement("p");
    message.id = `${id}-message`;
    message.className = "sheetwrite-dialog-message";
    message.textContent = options.body;
    body.append(message);
    element.setAttribute("aria-describedby", message.id);
  } else {
    body.append(options.body);
  }

  const { promise: result, resolve } = Promise.withResolvers<string>();
  let open = true;
  const close = (value: string = options.cancel): void => {
    if (!open) return;
    open = false;
    backdrop.remove();
    grid.returnFocus();
    resolve(value);
  };

  const row = document.createElement("div");
  row.className = "sheetwrite-dialog-buttons";
  let defaultButton: HTMLButtonElement | null = null;
  for (const spec of options.buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheetwrite-dialog-button";
    button.textContent = spec.label;
    if (spec.default) {
      button.classList.add("sheetwrite-dialog-default");
      defaultButton = button;
    }
    button.addEventListener("click", () => {
      if (spec.value !== options.cancel && options.accept?.(spec.value) === false) return;
      close(spec.value);
    });
    row.append(button);
  }

  element.addEventListener("keydown", (event) => {
    // The grid listens on its root, the backdrop's parent: its keys stop here.
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      const target = event.target;
      if (target instanceof HTMLButtonElement || target instanceof HTMLTextAreaElement) return;
      if (defaultButton === null) return;
      event.preventDefault();
      defaultButton.click();
    } else if (event.key === "Tab") {
      const focusable = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (candidate) =>
          candidate.tabIndex >= 0 &&
          !(candidate as HTMLButtonElement).disabled &&
          candidate.closest("[hidden]") === null,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      const active = element.ownerDocument.activeElement;
      if (event.shiftKey ? active === first : active === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!(active instanceof Node) || !element.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  element.append(title, body, row);
  backdrop.append(element);
  host.append(backdrop);
  checkStylePart(element, "grid", "The dialog");
  (options.initialFocus ?? defaultButton ?? element.querySelector<HTMLElement>(FOCUSABLE))?.focus();
  grid.adopt(() => close());

  return { element, result, close };
}

/** Labels for {@link confirmDialog}. */
export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  /** The accepting button; "OK" by default. */
  readonly ok?: string;
}

/**
 * Ask the user to confirm, as Excel's OK and Cancel warnings do: an alert
 * dialog with the message, OK (the default) and Cancel. `result` resolves to
 * `true` for OK and to `false` for Cancel, Escape or close.
 */
export function confirmDialog(
  grid: DialogHost,
  options: ConfirmOptions,
): { readonly result: Promise<boolean>; close(): void } {
  const dialog = openDialog(grid, {
    title: options.title,
    role: "alertdialog",
    body: options.message,
    buttons: [
      { label: options.ok ?? "OK", value: "ok", default: true },
      { label: "Cancel", value: "cancel" },
    ],
    cancel: "cancel",
  });
  return { result: dialog.result.then((value) => value === "ok"), close: () => dialog.close() };
}

/** One option of {@link choiceDialog}. */
interface DialogChoice {
  readonly value: string;
  readonly label: string;
  /** Shown but not choosable. */
  readonly disabled?: boolean;
}

/** What {@link choiceDialog} offers. */
interface ChoiceOptions {
  readonly title: string;
  readonly choices: readonly DialogChoice[];
  /** The choice selected on open. */
  readonly initial: string;
}

/**
 * Ask the user to pick one of `choices`, as Excel's Insert and Delete dialogs
 * do: a group of radio buttons, OK (the default) and Cancel. Arrow keys move
 * between the choices. `result` resolves to the chosen value on OK, and to
 * `null` for Cancel, Escape or close.
 */
function choiceDialog(
  grid: DialogHost,
  options: ChoiceOptions,
): { readonly result: Promise<string | null>; close(): void } {
  const group = document.createElement("fieldset");
  group.className = "sheetwrite-dialog-choices";
  const legend = document.createElement("legend");
  legend.className = "sheetwrite-dialog-legend";
  legend.textContent = options.title;
  group.append(legend);
  const name = `sheetwrite-dialog-choice-${++dialogCount}`;
  const radios: HTMLInputElement[] = [];
  for (const choice of options.choices) {
    const label = document.createElement("label");
    label.className = "sheetwrite-dialog-choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = choice.value;
    radio.disabled = choice.disabled === true;
    radio.checked = choice.value === options.initial;
    label.append(radio, choice.label);
    group.append(label);
    radios.push(radio);
  }

  const dialog = openDialog(grid, {
    title: options.title,
    body: group,
    buttons: [
      { label: "OK", value: "ok", default: true },
      { label: "Cancel", value: "cancel" },
    ],
    cancel: "cancel",
    initialFocus: radios.find((radio) => radio.checked),
  });
  return {
    result: dialog.result.then((value) =>
      value === "ok" ? (radios.find((radio) => radio.checked)?.value ?? null) : null,
    ),
    close: () => dialog.close(),
  };
}

/**
 * Excel's Insert (`insert`) or Delete dialog for a range that is neither
 * whole rows nor whole columns: Shift cells right or down (left or up on
 * delete), Entire row and Entire column. Shifting cells needs a move of the
 * cells beside the range that rewrites references, which the grid does not
 * have yet, so those two choices show disabled. Excel's default is Shift
 * cells down for a `wide` range and Shift cells right for a tall one; while
 * those are disabled the dialog starts on Entire row or Entire column, the
 * same way round. `result` resolves to `entireRow`, `entireColumn` or null.
 */
export function insertDeleteDialog(
  grid: DialogHost,
  insert: boolean,
  wide: boolean,
): { readonly result: Promise<string | null>; close(): void } {
  const choices = [
    {
      value: "shiftRight",
      label: insert ? "Shift cells right" : "Shift cells left",
      disabled: true,
    },
    { value: "shiftDown", label: insert ? "Shift cells down" : "Shift cells up", disabled: true },
    { value: "entireRow", label: "Entire row" },
    { value: "entireColumn", label: "Entire column" },
  ];
  const preferred = wide ? "shiftDown" : "shiftRight";
  const initial = choices.some((choice) => choice.value === preferred && !choice.disabled)
    ? preferred
    : wide
      ? "entireRow"
      : "entireColumn";
  return choiceDialog(grid, { title: insert ? "Insert" : "Delete", choices, initial });
}
