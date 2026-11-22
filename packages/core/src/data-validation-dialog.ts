/**
 * Excel's Data Validation dialog (Data › Data Validation): Settings, Input
 * Message and Error Alert tabs over one rule's fields. It loads on first
 * use with its command (`data-validation-command.ts`).
 */

import { parseDateInput } from "./date-serial.js";
import { type DialogHost, openDialog } from "./dialog.js";
import { formatNumber } from "./number-format.js";
import type {
  DataValidationComparison,
  DataValidationCondition,
  DataValidationOperand,
  ValidationErrorStyle,
} from "./types/document.js";
import { validationErrorStyle } from "./validation-rule.js";
import type { ValidationSettings } from "./validation-transfer.js";

/** What the dialog starts from. */
export interface DataValidationInput {
  /** The settings of the selection's rule; null for cells without one. */
  readonly settings: ValidationSettings | null;
  /** Whether the rule covers cells outside the selection, which "Apply these changes" reaches. */
  readonly canApplyToAll: boolean;
}

/** What OK changes. */
export interface DataValidationChange {
  /** The new settings; null removes the rule, as Clear All then OK does. */
  readonly settings: ValidationSettings | null;
  /** "Apply these changes to all other cells with the same settings". */
  readonly applyToAll: boolean;
}

/** Excel's Allow choices, in its order. */
const ALLOW = [
  ["any", "Any value"],
  ["whole", "Whole number"],
  ["decimal", "Decimal"],
  ["list", "List"],
  ["date", "Date"],
  ["time", "Time"],
  ["textLength", "Text length"],
  ["custom", "Custom"],
] as const;
type Allow = (typeof ALLOW)[number][0];

/** Excel's Data choices, in its order. */
const OPERATORS = [
  ["between", "between"],
  ["notBetween", "not between"],
  ["equal", "equal to"],
  ["notEqual", "not equal to"],
  ["greaterThan", "greater than"],
  ["lessThan", "less than"],
  ["greaterThanOrEqual", "greater than or equal to"],
  ["lessThanOrEqual", "less than or equal to"],
] as const;
type Operator = DataValidationComparison["operator"];

const STYLES = [
  ["stop", "Stop"],
  ["warning", "Warning"],
  ["information", "Information"],
] as const;

/** The longest title and message Excel takes. */
const MAX_TITLE = 32;
const MAX_MESSAGE = 255;
const MINUTES_PER_DAY = 24 * 60;
const SECONDS_PER_DAY = MINUTES_PER_DAY * 60;

/** A Minimum or Maximum box's label for each kind, as Excel names them. */
function bound_labels(allow: Allow): { min: string; max: string; value: string } {
  if (allow === "date") return { min: "Start date", max: "End date", value: "Date" };
  if (allow === "time") return { min: "Start time", max: "End time", value: "Time" };
  if (allow === "textLength") return { min: "Minimum", max: "Maximum", value: "Length" };
  return { min: "Minimum", max: "Maximum", value: "Value" };
}

/** `h:mm`, `h:mm:ss` or either with AM/PM as a fraction of a day. */
function parse_time_text(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(text.trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  const half = match[4]?.toUpperCase();
  if (half !== undefined && (hours < 1 || hours > 12)) return null;
  if (half === "PM" && hours < 12) hours += 12;
  if (half === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return (hours * 3600 + minutes * 60 + seconds) / SECONDS_PER_DAY;
}

function time_text(fraction: number): string {
  const total = Math.round(fraction * SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const half = hours < 12 ? "AM" : "PM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${twelve}:${pad(minutes)}:${pad(seconds)} ${half}`;
}

/** An operand as its box shows it: a formula as written, a date or time as Excel shows it. */
function operand_text(operand: DataValidationOperand | undefined, allow: Allow): string {
  if (operand === undefined) return "";
  if (typeof operand === "string") return operand;
  if (allow === "date") return formatNumber(operand, "m/d/yyyy");
  if (allow === "time") return time_text(operand);
  return String(operand);
}

/** A box's text as an operand of `allow`; undefined when Excel would refuse it. */
function parse_operand(text: string, allow: Allow): DataValidationOperand | undefined {
  const trimmed = text.trim();
  if (trimmed.length > 1 && trimmed.startsWith("=")) return trimmed;
  if (trimmed === "") return undefined;
  if (allow === "date") return parseDateInput(trimmed) ?? undefined;
  if (allow === "time") {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : (parse_time_text(trimmed) ?? undefined);
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return undefined;
  if ((allow === "whole" || allow === "textLength") && !Number.isInteger(number)) return undefined;
  if (allow === "textLength" && number < 0) return undefined;
  return number;
}

/** The Allow choice of `condition`. */
function allow_of(condition: DataValidationCondition | undefined): Allow {
  if (!condition) return "any";
  switch (condition.kind) {
    case "number":
      return condition.integer ? "whole" : "decimal";
    case "checkbox":
      return "list";
    default:
      return condition.kind;
  }
}

/** A condition's bounds as one comparison, as the Data box shows them. */
function comparison_of(condition: DataValidationCondition | undefined): DataValidationComparison {
  if (
    !condition ||
    (condition.kind !== "number" &&
      condition.kind !== "date" &&
      condition.kind !== "time" &&
      condition.kind !== "textLength")
  ) {
    return { operator: "between", min: 0, max: 0 };
  }
  if (condition.comparison) return condition.comparison;
  const { min, max } = condition;
  if (min !== undefined && max !== undefined) {
    return min === max ? { operator: "equal", value: min } : { operator: "between", min, max };
  }
  if (min !== undefined) return { operator: "greaterThanOrEqual", value: min };
  return { operator: "lessThanOrEqual", value: max ?? 0 };
}

/** A list's Source box: its typed values joined with commas, or its formula. */
function source_text(condition: DataValidationCondition | undefined): string {
  if (condition?.kind !== "list") return "";
  if ("source" in condition) return condition.source;
  return condition.values
    .map((value) => (typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value ?? "")))
    .join(",");
}

let dialog_count = 0;

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "sheetwrite-dialog-field";
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function select(options: readonly (readonly [string, string])[], value: string): HTMLSelectElement {
  const element = document.createElement("select");
  element.className = "sheetwrite-dialog-control";
  for (const [option_value, label] of options) {
    const option = document.createElement("option");
    option.value = option_value;
    option.textContent = label;
    element.append(option);
  }
  element.value = value;
  return element;
}

function text_box(
  value: string,
  max_length: number,
  multiline = false,
): HTMLInputElement | HTMLTextAreaElement {
  const element = document.createElement(multiline ? "textarea" : "input");
  element.className = "sheetwrite-dialog-control";
  element.maxLength = max_length;
  element.value = value;
  return element;
}

function checkbox(
  label: string,
  checked: boolean,
): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = document.createElement("label");
  wrapper.className = "sheetwrite-dialog-choice";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  wrapper.append(input, label);
  return { wrapper, input };
}

/**
 * Open Data Validation over `grid`. `result` resolves to the change on OK,
 * or to null on Cancel, Escape or close. The tabs follow the ARIA tabs
 * pattern, as in Format Cells.
 */
export function dataValidationDialog(
  grid: DialogHost,
  input: DataValidationInput,
): { readonly result: Promise<DataValidationChange | null>; close(): void } {
  const id = `sheetwrite-data-validation-${++dialog_count}`;
  const start = input.settings;
  const body = document.createElement("div");
  body.className = "sheetwrite-data-validation";

  const tab_list = document.createElement("div");
  tab_list.setAttribute("role", "tablist");
  tab_list.setAttribute("aria-label", "Data Validation");
  tab_list.className = "sheetwrite-data-validation-tabs";
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLDivElement[] = [];
  const show_tab = (index: number, focus = false): void => {
    for (const [at, tab] of tabs.entries()) {
      const selected = at === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = panels[at];
      if (panel) panel.hidden = !selected;
    }
    if (focus) tabs[index]?.focus();
  };
  const add_tab = (label: string): HTMLDivElement => {
    const index = tabs.length;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `${id}-tab-${index}`;
    tab.className = "sheetwrite-data-validation-tab";
    tab.setAttribute("role", "tab");
    tab.textContent = label;
    const panel = document.createElement("div");
    panel.id = `${id}-panel-${index}`;
    panel.className = "sheetwrite-data-validation-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", () => show_tab(index));
    tabs.push(tab);
    panels.push(panel);
    tab_list.append(tab);
    return panel;
  };
  tab_list.addEventListener("keydown", (event) => {
    const current = tabs.findIndex((tab) => tab === event.target);
    if (current < 0) return;
    const last = tabs.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: current === last ? 0 : current + 1,
      ArrowLeft: current === 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    show_tab(next, true);
  });

  // Settings.
  const settings_panel = add_tab("Settings");
  const allow = select(ALLOW, allow_of(start?.condition));
  const blank = checkbox("Ignore blank", start?.allowBlank ?? true);
  const start_comparison = comparison_of(start?.condition);
  const operator = select(OPERATORS, start_comparison.operator);
  const start_allow = allow_of(start?.condition);
  const min = text_box(
    "value" in start_comparison ? "" : operand_text(start_comparison.min, start_allow),
    MAX_MESSAGE,
  );
  const max = text_box(
    "value" in start_comparison ? "" : operand_text(start_comparison.max, start_allow),
    MAX_MESSAGE,
  );
  const value = text_box(
    "value" in start_comparison ? operand_text(start_comparison.value, start_allow) : "",
    MAX_MESSAGE,
  );
  const source = text_box(source_text(start?.condition), MAX_MESSAGE);
  const dropdown = checkbox("In-cell dropdown", start?.inCellDropdown ?? true);
  const formula = text_box(
    start?.condition.kind === "custom" ? start.condition.formula : "",
    MAX_MESSAGE,
  );
  const apply_to_all = checkbox(
    "Apply these changes to all other cells with the same settings",
    false,
  );
  apply_to_all.input.disabled = !input.canApplyToAll;
  const operator_field = field("Data", operator);
  const min_field = field("Minimum", min);
  const max_field = field("Maximum", max);
  const value_field = field("Value", value);
  const source_field = field("Source", source);
  const formula_field = field("Formula", formula);
  const label_of = (wrapper: HTMLLabelElement): HTMLElement | null => wrapper.querySelector("span");
  const sync_settings = (): void => {
    const kind = allow.value as Allow;
    const bounded = kind !== "any" && kind !== "list" && kind !== "custom";
    const interval = operator.value === "between" || operator.value === "notBetween";
    const labels = bound_labels(kind);
    operator_field.hidden = !bounded;
    min_field.hidden = max_field.hidden = !bounded || !interval;
    value_field.hidden = !bounded || interval;
    const min_label = label_of(min_field);
    const max_label = label_of(max_field);
    const value_label = label_of(value_field);
    if (min_label) min_label.textContent = labels.min;
    if (max_label) max_label.textContent = labels.max;
    if (value_label) value_label.textContent = labels.value;
    source_field.hidden = dropdown.wrapper.hidden = kind !== "list";
    formula_field.hidden = kind !== "custom";
    blank.wrapper.hidden = kind === "any";
  };
  allow.addEventListener("change", sync_settings);
  operator.addEventListener("change", sync_settings);
  settings_panel.append(
    field("Allow", allow),
    blank.wrapper,
    operator_field,
    min_field,
    max_field,
    value_field,
    source_field,
    dropdown.wrapper,
    formula_field,
    apply_to_all.wrapper,
  );

  // Input Message.
  const input_panel = add_tab("Input Message");
  const show_input = checkbox(
    "Show input message when cell is selected",
    start?.showInputMessage ?? true,
  );
  const input_title = text_box(start?.inputTitle ?? "", MAX_TITLE);
  const input_message = text_box(start?.inputMessage ?? "", MAX_MESSAGE, true);
  input_panel.append(
    show_input.wrapper,
    field("Title", input_title),
    field("Input message", input_message),
  );

  // Error Alert.
  const error_panel = add_tab("Error Alert");
  const show_error = checkbox(
    "Show error alert after invalid data is entered",
    start ? start.policy !== "allow" : true,
  );
  const style = select(STYLES, start ? validationErrorStyle(start) : "stop");
  const error_title = text_box(start?.errorTitle ?? "", MAX_TITLE);
  const error_message = text_box(start?.helpText ?? "", MAX_MESSAGE, true);
  error_panel.append(
    show_error.wrapper,
    field("Style", style),
    field("Title", error_title),
    field("Error message", error_message),
  );

  const status = document.createElement("p");
  status.className = "sheetwrite-dialog-message";
  status.setAttribute("role", "alert");
  body.append(tab_list, ...panels, status);
  show_tab(0);
  sync_settings();

  // Clear All: the fields of a cell without a rule.
  const clear_all = (): void => {
    allow.value = "any";
    blank.input.checked = true;
    operator.value = "between";
    for (const box of [min, max, value, source, formula, input_title, input_message, error_title]) {
      box.value = "";
    }
    error_message.value = "";
    dropdown.input.checked = true;
    show_input.input.checked = true;
    show_error.input.checked = true;
    style.value = "stop";
    status.textContent = "";
    sync_settings();
  };

  /** The condition the Settings tab describes, or the message Excel shows for a box it refuses. */
  const condition = (): DataValidationCondition | string => {
    const kind = allow.value as Allow;
    if (kind === "any") return { kind: "any" };
    if (kind === "custom") {
      const text = formula.value.trim();
      if (text === "") return "You must enter a value in the Formula box.";
      return { kind: "custom", formula: text.startsWith("=") ? text : `=${text}` };
    }
    if (kind === "list") {
      const text = source.value.trim();
      if (text === "") return "You must enter a value in the Source box.";
      if (text.startsWith("=")) return { kind: "list", source: text };
      return { kind: "list", values: source.value.split(",") };
    }
    const op = operator.value as Operator;
    const labels = bound_labels(kind);
    const refusal = (label: string): string => `The ${label} you entered is not valid.`;
    let comparison: DataValidationComparison;
    if (op === "between" || op === "notBetween") {
      const low = parse_operand(min.value, kind);
      if (low === undefined) return refusal(labels.min);
      const high = parse_operand(max.value, kind);
      if (high === undefined) return refusal(labels.max);
      if (typeof low === "number" && typeof high === "number" && low > high) {
        return `The ${labels.max} must be greater than or equal to the ${labels.min}.`;
      }
      comparison = { operator: op, min: low, max: high };
    } else {
      const bound = parse_operand(value.value, kind);
      if (bound === undefined) return refusal(labels.value);
      comparison = { operator: op, value: bound };
    }
    if (kind === "whole") return { kind: "number", integer: true, comparison };
    if (kind === "decimal") return { kind: "number", comparison };
    return { kind, comparison };
  };

  const settings = (): ValidationSettings | null | string => {
    const built = condition();
    if (typeof built === "string") return built;
    const error_style = style.value as ValidationErrorStyle;
    const policy = !show_error.input.checked ? "allow" : error_style === "stop" ? "reject" : "warn";
    const result: ValidationSettings = {
      condition: built,
      policy,
      ...(blank.input.checked ? {} : { allowBlank: false }),
      ...(built.kind === "list" && !dropdown.input.checked ? { inCellDropdown: false } : {}),
      // The style the policy implies stays unwritten, as XLSX import leaves it.
      ...(error_style === (policy === "warn" ? "warning" : "stop")
        ? {}
        : { errorStyle: error_style }),
      ...(error_title.value ? { errorTitle: error_title.value } : {}),
      ...(error_message.value ? { helpText: error_message.value } : {}),
      ...(show_input.input.checked ? {} : { showInputMessage: false }),
      ...(input_title.value ? { inputTitle: input_title.value } : {}),
      ...(input_message.value ? { inputMessage: input_message.value } : {}),
    };
    // Any value with no input message is no rule at all, as in Excel.
    const empty = built.kind === "any" && !input_title.value && !input_message.value;
    return empty ? null : result;
  };

  let accepted: ValidationSettings | null = null;
  const dialog = openDialog(grid, {
    title: "Data Validation",
    body,
    buttons: [
      { label: "Clear All", value: "clear" },
      { label: "OK", value: "ok", default: true },
      { label: "Cancel", value: "cancel" },
    ],
    cancel: "cancel",
    initialFocus: allow,
    accept: (choice) => {
      if (choice === "clear") {
        clear_all();
        return false;
      }
      const built = settings();
      if (typeof built === "string") {
        status.textContent = built;
        show_tab(0);
        return false;
      }
      accepted = built;
      return true;
    },
  });
  dialog.element.classList.add("sheetwrite-data-validation-dialog");
  return {
    result: dialog.result.then((choice) =>
      choice === "ok" ? { settings: accepted, applyToAll: apply_to_all.input.checked } : null,
    ),
    close: () => dialog.close(),
  };
}
