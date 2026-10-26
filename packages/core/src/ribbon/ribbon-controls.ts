// DOM for each ribbon control spec. Controls only render and dispatch: what a
// control does lives in ribbon-model.ts, and the popup rules in
// ribbon-popup.ts.

import { COMMAND_ICONS } from "../command-icons.js";
import type { Grid, GridCommandName, GridCommandState } from "../types/grid.js";
import { STANDARD_COLORS, THEME_COLOR_ROWS } from "./ribbon-colors.js";
import {
  EDIT_STATE_COMMAND,
  focusAddress,
  steppedZoom,
  zoomLabel,
  type RibbonAvailability,
  type RibbonButtonSpec,
  type RibbonColorSpec,
  type RibbonComboSpec,
  type RibbonControlSpec,
  type RibbonFocus,
  type RibbonFormSpec,
  type RibbonIcon,
  type RibbonMenuSpec,
} from "./ribbon-model.js";
import type { RibbonPopup } from "./ribbon-popup.js";

/**
 * Command state lookup: backed by an event's snapshot when one arrived, else
 * by `grid.getCommandState`, which answers one command at a time.
 */
export type RibbonCommandStates = (command: GridCommandName) => GridCommandState;

/**
 * What one refresh shows, computed once for all controls: selection changes
 * refresh every visible control, so per-control reads would repeat the work.
 */
interface RibbonSnapshot {
  readonly state: RibbonCommandStates;
  readonly focus: RibbonFocus;
}

/** What every control needs from the ribbon that owns it. */
export interface RibbonContext {
  readonly grid: Grid;
  readonly popup: RibbonPopup;
  /** The focus cell's style now, for reads outside a refresh (a commit or a revert). */
  readonly focus: () => RibbonFocus;
  /** Hand keyboard focus back to the grid, as Excel does after a pick. */
  readonly focusGrid: () => void;
  /** Run a command once at a time; a failure becomes visible feedback. */
  readonly run: (key: string, command: () => unknown, control?: HTMLButtonElement) => void;
}

export interface RibbonControlView {
  readonly element: HTMLElement;
  refresh(snapshot: RibbonSnapshot): void;
}

/** Mouse presses on ribbon chrome must not take focus or selection from the grid. */
const keepFocus = (event: Event): void => event.preventDefault();

/** A click with `detail` 0 came from the keyboard (Enter or Space). */
const fromKeyboard = (event: MouseEvent): boolean => event.detail === 0;

function isDisabled(availability: RibbonAvailability, states: RibbonCommandStates): boolean {
  if (availability === "view") return false;
  return states(availability === "edit" ? EDIT_STATE_COMMAND : availability).disabled;
}

function icon(name: RibbonIcon): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "sheetwrite-ribbon-icon";
  span.appendChild(COMMAND_ICONS[name]());
  return span;
}

function caret(): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "sheetwrite-ribbon-caret";
  span.setAttribute("aria-hidden", "true");
  return span;
}

function commandButton(label: string, iconName: RibbonIcon, large: boolean): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheetwrite-ribbon-button";
  if (large) button.dataset.large = "";
  button.title = label;
  button.setAttribute("aria-label", label);
  const text = document.createElement("span");
  text.className = "sheetwrite-ribbon-label";
  text.textContent = label;
  button.append(icon(iconName), text);
  button.addEventListener("mousedown", keepFocus);
  return button;
}

function renderButton(spec: RibbonButtonSpec, context: RibbonContext): RibbonControlView {
  const button = commandButton(spec.label, spec.icon, spec.large === true);
  button.addEventListener("click", () =>
    context.run(spec.label, () => spec.run(context.grid), button),
  );

  // Written only on change: every selection move refreshes every toggle.
  let pressed: string | null = null;
  return {
    element: button,
    refresh({ state }) {
      button.disabled = isDisabled(spec.availability, state);
      const pressedBy = spec.toggle ? spec.availability : "view";
      if (pressedBy === "edit" || pressedBy === "view") return;

      const activity = state(pressedBy).activity;
      const next = activity === "mixed" ? "mixed" : String(activity === "active");
      if (next === pressed) return;
      pressed = next;
      button.setAttribute("aria-pressed", next);
    },
  };
}

/** A `role="menu"` surface whose items run once and close the menu. */
function menuSurface(items: RibbonMenuSpec["items"], context: RibbonContext): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "sheetwrite-ribbon-menu";
  for (const entry of items) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sheetwrite-ribbon-menu-item";
    item.setAttribute("role", "menuitem");
    item.tabIndex = -1;
    if (entry.icon !== undefined) item.appendChild(icon(entry.icon));
    item.append(entry.label);
    item.addEventListener("mousedown", keepFocus);
    item.addEventListener("click", (event) => {
      const keyboard = fromKeyboard(event);
      context.popup.closeAll(keyboard);
      context.run(entry.label, () => entry.run(context.grid));
      if (!keyboard) context.focusGrid();
    });
    menu.appendChild(item);
  }
  return menu;
}

function renderMenu(spec: RibbonMenuSpec, context: RibbonContext): RibbonControlView {
  const large = spec.large === true;
  const open = (trigger: HTMLButtonElement, keyboard: boolean): void => {
    if (context.popup.isOpen(trigger)) {
      context.popup.closeFrom(trigger, keyboard);
      return;
    }
    context.popup.open(trigger, menuSurface(spec.items, context), {
      role: "menu",
      label: spec.label,
      focus: keyboard,
    });
  };

  const arrowKeyOpens = (trigger: HTMLButtonElement) => (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    open(trigger, true);
  };

  if (spec.run === undefined) {
    const trigger = commandButton(spec.label, spec.icon, large);
    trigger.appendChild(caret());
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", (event) => open(trigger, fromKeyboard(event)));
    trigger.addEventListener("keydown", arrowKeyOpens(trigger));
    return {
      element: trigger,
      refresh({ state }) {
        trigger.disabled = isDisabled(spec.availability, state);
      },
    };
  }

  // Split button: the face repeats the default command, the arrow opens the list.
  const run = spec.run;
  const split = document.createElement("div");
  split.className = "sheetwrite-ribbon-split";
  if (large) split.dataset.large = "";
  const face = commandButton(spec.label, spec.icon, large);
  face.addEventListener("click", () => context.run(spec.label, () => run(context.grid), face));
  const arrow = document.createElement("button");
  arrow.type = "button";
  arrow.className = "sheetwrite-ribbon-split-arrow";
  arrow.title = `${spec.label} options`;
  arrow.setAttribute("aria-label", `${spec.label} options`);
  arrow.setAttribute("aria-haspopup", "menu");
  arrow.setAttribute("aria-expanded", "false");
  arrow.appendChild(caret());
  arrow.addEventListener("mousedown", keepFocus);
  arrow.addEventListener("click", (event) => open(arrow, fromKeyboard(event)));
  arrow.addEventListener("keydown", arrowKeyOpens(arrow));
  face.addEventListener("keydown", arrowKeyOpens(arrow));
  split.append(face, arrow);
  return {
    element: split,
    refresh({ state }) {
      const disabled = isDisabled(spec.availability, state);
      face.disabled = disabled;
      arrow.disabled = disabled;
    },
  };
}

let comboSerial = 0;

function renderCombo(spec: RibbonComboSpec, context: RibbonContext): RibbonControlView {
  comboSerial += 1;
  const listId = `sheetwrite-ribbon-list-${comboSerial}`;
  const box = document.createElement("div");
  box.className = "sheetwrite-ribbon-combo";
  box.style.width = `${spec.width}px`;

  const input = document.createElement("input");
  input.type = "text";
  input.className = "sheetwrite-ribbon-combo-input";
  input.title = spec.label;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", spec.label);
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", listId);
  input.spellcheck = false;

  const arrow = document.createElement("button");
  arrow.type = "button";
  arrow.className = "sheetwrite-ribbon-combo-arrow";
  arrow.tabIndex = -1;
  arrow.setAttribute("aria-label", `${spec.label} list`);
  arrow.appendChild(caret());
  arrow.addEventListener("mousedown", keepFocus);

  // The box shows what the focus cell has, written only on change.
  const show = (value: string): void => {
    if (input.value !== value) input.value = value;
  };
  const revert = (): void => show(spec.read(context.focus()));
  const commit = (value: string): void => {
    context.popup.closeAll(false);
    if (value !== spec.read(context.focus()) && !spec.apply(context.grid, value)) {
      input.setAttribute("aria-invalid", "true");
    } else {
      input.removeAttribute("aria-invalid");
    }
    revert();
    context.focusGrid();
  };

  const openList = (focus: boolean): void => {
    const list = document.createElement("div");
    list.id = listId;
    list.className = "sheetwrite-ribbon-listbox";
    const current = input.value;
    for (const value of spec.options) {
      const option = document.createElement("div");
      option.className = "sheetwrite-ribbon-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(value === current));
      option.tabIndex = -1;
      option.textContent = value;
      // `inherit` is not valid inside a family list, so fall back to a generic.
      if (spec.previewFont) option.style.fontFamily = `"${value}", system-ui, sans-serif`;
      list.appendChild(option);
    }

    // One set of listeners for the whole list instead of one per option.
    const optionOf = (target: EventTarget | null): HTMLElement | null =>
      target instanceof HTMLElement ? target.closest<HTMLElement>('[role="option"]') : null;
    list.addEventListener("mousedown", keepFocus);
    list.addEventListener("click", (event) => {
      const option = optionOf(event.target);
      if (option?.textContent != null) commit(option.textContent);
    });
    list.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const option = optionOf(event.target);
      if (option?.textContent == null) return;
      event.preventDefault();
      commit(option.textContent);
    });

    context.popup.open(input, list, { role: "listbox", label: spec.label, focus });
    list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };

  arrow.addEventListener("click", () => {
    if (context.popup.isOpen(input)) context.popup.closeFrom(input, false);
    else openList(false);
  });
  input.addEventListener("focus", () => input.select());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(input.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Cancel the typing only; the ribbon's Escape handler, next in the
      // bubble path, returns focus to the grid.
      revert();
    } else if (event.key === "ArrowDown" && event.altKey) {
      event.preventDefault();
      openList(true);
    }
  });
  input.addEventListener("blur", () => {
    if (!context.popup.isOpen(input)) revert();
  });

  box.append(input, arrow);
  return {
    element: box,
    refresh({ state, focus }) {
      const disabled = isDisabled(spec.availability, state);
      input.disabled = disabled;
      arrow.disabled = disabled;
      // Never overwrite what the user is typing.
      if (document.activeElement !== input) show(spec.read(focus));
    },
  };
}

/** Swatches carry their color as data; the palette handles all picks with one listener. */
function swatch(label: string, color: string | null): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  button.title = label;
  button.dataset.color = color ?? "";
  button.setAttribute("role", "menuitem");
  button.setAttribute("aria-label", label);
  if (color === null) {
    button.className = "sheetwrite-ribbon-menu-item";
    button.textContent = label;
  } else {
    button.className = "sheetwrite-ribbon-swatch";
    button.style.backgroundColor = color;
  }
  return button;
}

function renderColor(spec: RibbonColorSpec, context: RibbonContext): RibbonControlView {
  let current = spec.initial;
  const split = document.createElement("div");
  split.className = "sheetwrite-ribbon-split";
  const face = commandButton(spec.label, spec.icon, false);
  // The bar under the icon shows the color the face applies, as in Excel.
  const bar = document.createElement("span");
  bar.className = "sheetwrite-ribbon-color-bar";
  bar.style.backgroundColor = current;
  face.appendChild(bar);

  const apply = (color: string | null): void => {
    context.popup.closeAll(false);
    if (color !== null) {
      current = color;
      bar.style.backgroundColor = color;
    }
    context.run(spec.label, () => spec.apply(context.grid, color));
    context.focusGrid();
  };
  face.addEventListener("click", () =>
    context.run(spec.label, () => spec.apply(context.grid, current), face),
  );

  const arrow = document.createElement("button");
  arrow.type = "button";
  arrow.className = "sheetwrite-ribbon-split-arrow";
  arrow.title = `${spec.label} options`;
  arrow.setAttribute("aria-label", `${spec.label} options`);
  arrow.setAttribute("aria-haspopup", "menu");
  arrow.setAttribute("aria-expanded", "false");
  arrow.appendChild(caret());
  arrow.addEventListener("mousedown", keepFocus);
  arrow.addEventListener("click", (event) => {
    if (context.popup.isOpen(arrow)) {
      context.popup.closeFrom(arrow, false);
      return;
    }
    const palette = document.createElement("div");
    palette.className = "sheetwrite-ribbon-palette";
    palette.appendChild(swatch(spec.clearLabel, null));
    for (const [heading, rows] of [
      ["Theme Colors", THEME_COLOR_ROWS],
      ["Standard Colors", [STANDARD_COLORS]],
    ] as const) {
      const title = document.createElement("div");
      title.className = "sheetwrite-ribbon-palette-heading";
      title.textContent = heading;
      const grid = document.createElement("div");
      grid.className = "sheetwrite-ribbon-palette-grid";
      for (const row of rows) for (const color of row) grid.appendChild(swatch(color, color));
      palette.append(title, grid);
    }

    // One listener for every swatch; an empty color is "Automatic" / "No Fill".
    palette.addEventListener("mousedown", (pressed) => {
      if (pressed.target instanceof HTMLButtonElement) pressed.preventDefault();
    });
    palette.addEventListener("click", (picked) => {
      const button =
        picked.target instanceof HTMLElement
          ? picked.target.closest<HTMLButtonElement>("button[data-color]")
          : null;
      if (button) apply(button.dataset.color || null);
    });
    const more = document.createElement("label");
    more.className = "sheetwrite-ribbon-menu-item";
    more.textContent = "More Colors…";
    const input = document.createElement("input");
    input.type = "color";
    input.value = current;
    input.setAttribute("aria-label", "More colors");
    // `change` fires once when the native picker closes; `input` fires per drag.
    input.addEventListener("change", () => apply(input.value));
    more.appendChild(input);
    palette.appendChild(more);
    context.popup.open(arrow, palette, {
      role: "menu",
      label: spec.label,
      focus: fromKeyboard(event),
    });
  });
  split.append(face, arrow);
  return {
    element: split,
    refresh({ state }) {
      const disabled = isDisabled("edit", state);
      face.disabled = disabled;
      arrow.disabled = disabled;
    },
  };
}

function renderForm(spec: RibbonFormSpec, context: RibbonContext): RibbonControlView {
  const trigger = commandButton(spec.label, spec.icon, true);
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", () => {
    const cell = focusAddress(context.grid);
    if (cell === null) return;
    const form = document.createElement("form");
    form.className = "sheetwrite-ribbon-form";
    const label = document.createElement("label");
    label.textContent = spec.field;
    const field = spec.multiline
      ? document.createElement("textarea")
      : document.createElement("input");
    field.className = "sheetwrite-ribbon-field";
    field.value = spec.read(context.grid, cell);
    const error = document.createElement("p");
    error.className = "sheetwrite-ribbon-form-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "sheetwrite-ribbon-form-button";
    save.textContent = "OK";
    label.appendChild(field);
    form.append(label, error, save);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = spec.submit(context.grid, cell, field.value);
      if (message !== null) {
        error.textContent = message;
        error.hidden = false;
        field.focus();
        return;
      }
      context.popup.closeAll(false);
      context.focusGrid();
    });
    context.popup.open(trigger, form, { role: "dialog", label: spec.label, focus: true });
  });
  return {
    element: trigger,
    refresh({ state }) {
      trigger.disabled = isDisabled("edit", state);
    },
  };
}

function renderZoom(context: RibbonContext): RibbonControlView {
  const zoom = document.createElement("div");
  zoom.className = "sheetwrite-ribbon-zoom";
  const readout = document.createElement("output");
  readout.className = "sheetwrite-ribbon-zoom-readout";
  readout.setAttribute("aria-live", "polite");
  // Written only on change: refreshes follow every selection move.
  const show = (): void => {
    const label = zoomLabel(context.grid.getZoom());
    if (readout.textContent !== label) readout.textContent = label;
  };
  const step = (label: string, iconName: RibbonIcon, direction: 1 | -1): HTMLButtonElement => {
    const button = commandButton(label, iconName, false);
    button.addEventListener("click", () => {
      context.grid.setZoom(steppedZoom(context.grid.getZoom(), direction));
      show();
    });
    return button;
  };
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "sheetwrite-ribbon-button sheetwrite-ribbon-text-button";
  reset.textContent = "100%";
  reset.title = "Zoom to 100%";
  reset.setAttribute("aria-label", "Zoom to 100%");
  reset.addEventListener("mousedown", keepFocus);
  reset.addEventListener("click", () => {
    context.grid.setZoom(1);
    show();
  });
  zoom.append(step("Zoom Out", "zoomOut", -1), readout, step("Zoom In", "zoomIn", 1), reset);
  return { element: zoom, refresh: show };
}

export function renderControl(spec: RibbonControlSpec, context: RibbonContext): RibbonControlView {
  switch (spec.kind) {
    case "button":
      return renderButton(spec, context);
    case "menu":
      return renderMenu(spec, context);
    case "combo":
      return renderCombo(spec, context);
    case "color":
      return renderColor(spec, context);
    case "form":
      return renderForm(spec, context);
    case "zoom":
      return renderZoom(context);
  }
}
