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
function boundLabels(allow: Allow): { min: string; max: string; value: string } {
  if (allow === "date") return { min: "Start date", max: "End date", value: "Date" };
  if (allow === "time") return { min: "Start time", max: "End time", value: "Time" };
  if (allow === "textLength") return { min: "Minimum", max: "Maximum", value: "Length" };
  return { min: "Minimum", max: "Maximum", value: "Value" };
}

/** `h:mm`, `h:mm:ss` or either with AM/PM as a fraction of a day. */
function parseTimeText(text: string): number | null {
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

function timeText(fraction: number): string {
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
function operandText(operand: DataValidationOperand | undefined, allow: Allow): string {
  if (operand === undefined) return "";
  if (typeof operand === "string") return operand;
  if (allow === "date") return formatNumber(operand, "m/d/yyyy");
  if (allow === "time") return timeText(operand);
  return String(operand);
}

/** A box's text as an operand of `allow`; undefined when Excel would refuse it. */
function parseOperand(text: string, allow: Allow): DataValidationOperand | undefined {
  const trimmed = text.trim();
  if (trimmed.length > 1 && trimmed.startsWith("=")) return trimmed;
  if (trimmed === "") return undefined;
  if (allow === "date") return parseDateInput(trimmed) ?? undefined;
  if (allow === "time") {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : (parseTimeText(trimmed) ?? undefined);
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number)) return undefined;
  if ((allow === "whole" || allow === "textLength") && !Number.isInteger(number)) return undefined;
  if (allow === "textLength" && number < 0) return undefined;
  return number;
}

/** The Allow choice of `condition`. */
function allowOf(condition: DataValidationCondition | undefined): Allow {
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
function comparisonOf(condition: DataValidationCondition | undefined): DataValidationComparison {
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
function sourceText(condition: DataValidationCondition | undefined): string {
  if (condition?.kind !== "list") return "";
  if ("source" in condition) return condition.source;
  return condition.values
    .map((value) => (typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : String(value ?? "")))
    .join(",");
}

let dialogCount = 0;

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
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    element.append(option);
  }
  element.value = value;
  return element;
}

function textBox(
  value: string,
  maxLength: number,
  multiline = false,
): HTMLInputElement | HTMLTextAreaElement {
  const element = document.createElement(multiline ? "textarea" : "input");
  element.className = "sheetwrite-dialog-control";
  element.maxLength = maxLength;
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
  const id = `sheetwrite-data-validation-${++dialogCount}`;
  const start = input.settings;
  const body = document.createElement("div");
  body.className = "sheetwrite-format-cells";

  const tabList = document.createElement("div");
  tabList.setAttribute("role", "tablist");
  tabList.setAttribute("aria-label", "Data Validation");
  tabList.className = "sheetwrite-format-cells-tabs";
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLDivElement[] = [];
  const showTab = (index: number, focus = false): void => {
    for (const [at, tab] of tabs.entries()) {
      const selected = at === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = panels[at];
      if (panel) panel.hidden = !selected;
    }
    if (focus) tabs[index]?.focus();
  };
  const addTab = (label: string): HTMLDivElement => {
    const index = tabs.length;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `${id}-tab-${index}`;
    tab.className = "sheetwrite-format-cells-tab";
    tab.setAttribute("role", "tab");
    tab.textContent = label;
    const panel = document.createElement("div");
    panel.id = `${id}-panel-${index}`;
    panel.className = "sheetwrite-format-cells-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", () => showTab(index));
    tabs.push(tab);
    panels.push(panel);
    tabList.append(tab);
    return panel;
  };
  tabList.addEventListener("keydown", (event) => {
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
    showTab(next, true);
  });

  // Settings.
  const settingsPanel = addTab("Settings");
  const allow = select(ALLOW, allowOf(start?.condition));
  const blank = checkbox("Ignore blank", start?.allowBlank ?? true);
  const startComparison = comparisonOf(start?.condition);
  const operator = select(OPERATORS, startComparison.operator);
  const startAllow = allowOf(start?.condition);
  const min = textBox(
    "value" in startComparison ? "" : operandText(startComparison.min, startAllow),
    MAX_MESSAGE,
  );
  const max = textBox(
    "value" in startComparison ? "" : operandText(startComparison.max, startAllow),
    MAX_MESSAGE,
  );
  const value = textBox(
    "value" in startComparison ? operandText(startComparison.value, startAllow) : "",
    MAX_MESSAGE,
  );
  const source = textBox(sourceText(start?.condition), MAX_MESSAGE);
  const dropdown = checkbox("In-cell dropdown", start?.inCellDropdown ?? true);
  const formula = textBox(
    start?.condition.kind === "custom" ? start.condition.formula : "",
    MAX_MESSAGE,
  );
  const applyToAll = checkbox(
    "Apply these changes to all other cells with the same settings",
    false,
  );
  applyToAll.input.disabled = !input.canApplyToAll;
  const operatorField = field("Data", operator);
  const minField = field("Minimum", min);
  const maxField = field("Maximum", max);
  const valueField = field("Value", value);
  const sourceField = field("Source", source);
  const formulaField = field("Formula", formula);
  const labelOf = (wrapper: HTMLLabelElement): HTMLElement | null => wrapper.querySelector("span");
  const syncSettings = (): void => {
    const kind = allow.value as Allow;
    const bounded = kind !== "any" && kind !== "list" && kind !== "custom";
    const interval = operator.value === "between" || operator.value === "notBetween";
    const labels = boundLabels(kind);
    operatorField.hidden = !bounded;
    minField.hidden = maxField.hidden = !bounded || !interval;
    valueField.hidden = !bounded || interval;
    const minLabel = labelOf(minField);
    const maxLabel = labelOf(maxField);
    const valueLabel = labelOf(valueField);
    if (minLabel) minLabel.textContent = labels.min;
    if (maxLabel) maxLabel.textContent = labels.max;
    if (valueLabel) valueLabel.textContent = labels.value;
    sourceField.hidden = dropdown.wrapper.hidden = kind !== "list";
    formulaField.hidden = kind !== "custom";
    blank.wrapper.hidden = kind === "any";
  };
  allow.addEventListener("change", syncSettings);
  operator.addEventListener("change", syncSettings);
  settingsPanel.append(
    field("Allow", allow),
    blank.wrapper,
    operatorField,
    minField,
    maxField,
    valueField,
    sourceField,
    dropdown.wrapper,
    formulaField,
    applyToAll.wrapper,
  );

  // Input Message.
  const inputPanel = addTab("Input Message");
  const showInput = checkbox(
    "Show input message when cell is selected",
    start?.showInputMessage ?? true,
  );
  const inputTitle = textBox(start?.inputTitle ?? "", MAX_TITLE);
  const inputMessage = textBox(start?.inputMessage ?? "", MAX_MESSAGE, true);
  inputPanel.append(
    showInput.wrapper,
    field("Title", inputTitle),
    field("Input message", inputMessage),
  );

  // Error Alert.
  const errorPanel = addTab("Error Alert");
  const showError = checkbox(
    "Show error alert after invalid data is entered",
    start ? start.policy !== "allow" : true,
  );
  const style = select(STYLES, start ? validationErrorStyle(start) : "stop");
  const errorTitle = textBox(start?.errorTitle ?? "", MAX_TITLE);
  const errorMessage = textBox(start?.helpText ?? "", MAX_MESSAGE, true);
  errorPanel.append(
    showError.wrapper,
    field("Style", style),
    field("Title", errorTitle),
    field("Error message", errorMessage),
  );

  const status = document.createElement("p");
  status.className = "sheetwrite-dialog-message";
  status.setAttribute("role", "alert");
  body.append(tabList, ...panels, status);
  showTab(0);
  syncSettings();

  // Clear All: the fields of a cell without a rule.
  const clearAll = (): void => {
    allow.value = "any";
    blank.input.checked = true;
    operator.value = "between";
    for (const box of [min, max, value, source, formula, inputTitle, inputMessage, errorTitle]) {
      box.value = "";
    }
    errorMessage.value = "";
    dropdown.input.checked = true;
    showInput.input.checked = true;
    showError.input.checked = true;
    style.value = "stop";
    status.textContent = "";
    syncSettings();
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
    const labels = boundLabels(kind);
    const refusal = (label: string): string => `The ${label} you entered is not valid.`;
    let comparison: DataValidationComparison;
    if (op === "between" || op === "notBetween") {
      const low = parseOperand(min.value, kind);
      if (low === undefined) return refusal(labels.min);
      const high = parseOperand(max.value, kind);
      if (high === undefined) return refusal(labels.max);
      if (typeof low === "number" && typeof high === "number" && low > high) {
        return `The ${labels.max} must be greater than or equal to the ${labels.min}.`;
      }
      comparison = { operator: op, min: low, max: high };
    } else {
      const bound = parseOperand(value.value, kind);
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
    const errorStyle = style.value as ValidationErrorStyle;
    const policy = !showError.input.checked ? "allow" : errorStyle === "stop" ? "reject" : "warn";
    const result: ValidationSettings = {
      condition: built,
      policy,
      ...(blank.input.checked ? {} : { allowBlank: false }),
      ...(built.kind === "list" && !dropdown.input.checked ? { inCellDropdown: false } : {}),
      // The style the policy implies stays unwritten, as XLSX import leaves it.
      ...(errorStyle === (policy === "warn" ? "warning" : "stop") ? {} : { errorStyle }),
      ...(errorTitle.value ? { errorTitle: errorTitle.value } : {}),
      ...(errorMessage.value ? { helpText: errorMessage.value } : {}),
      ...(showInput.input.checked ? {} : { showInputMessage: false }),
      ...(inputTitle.value ? { inputTitle: inputTitle.value } : {}),
      ...(inputMessage.value ? { inputMessage: inputMessage.value } : {}),
    };
    // Any value with no input message is no rule at all, as in Excel.
    const empty = built.kind === "any" && !inputTitle.value && !inputMessage.value;
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
        clearAll();
        return false;
      }
      const built = settings();
      if (typeof built === "string") {
        status.textContent = built;
        showTab(0);
        return false;
      }
      accepted = built;
      return true;
    },
  });
  dialog.element.classList.add("sheetwrite-format-cells-dialog");
  return {
    result: dialog.result.then((choice) =>
      choice === "ok" ? { settings: accepted, applyToAll: applyToAll.input.checked } : null,
    ),
    close: () => dialog.close(),
  };
}
