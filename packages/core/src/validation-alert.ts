/**
 * Excel's data-validation error alert: Stop, Warning or Information, with the
 * rule's title and message or Excel's default text. It loads with the dialog
 * shell the first time a typed value fails a rule.
 */

import { type DialogHost, openDialog } from "./dialog.js";
import type { DataValidationRule } from "./types/document.js";
import {
  DEFAULT_VALIDATION_ERROR,
  DEFAULT_VALIDATION_TITLE,
  validationErrorStyle,
} from "./validation-rule.js";

/**
 * The button the user chose. `retry` (Stop) and `no` (Warning) return to the
 * entry; `yes` (Warning) and `ok` (Information) keep the value; `cancel`
 * (every style, Escape too) drops the entry.
 */
export type ValidationAlertAnswer = "retry" | "yes" | "no" | "ok" | "cancel";

/** The glyph each style shows beside its message, as Excel's alert icons. */
const STYLE_GLYPHS = { stop: "\u00d7", warning: "!", information: "i" } as const;

const STYLE_BUTTONS = {
  stop: [
    { label: "Retry", value: "retry", default: true },
    { label: "Cancel", value: "cancel" },
  ],
  // No is the default, as in Excel, so a quick Enter does not keep the value.
  warning: [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no", default: true },
    { label: "Cancel", value: "cancel" },
  ],
  information: [
    { label: "OK", value: "ok", default: true },
    { label: "Cancel", value: "cancel" },
  ],
} as const;

/** Each button value as its answer; Escape and close give `cancel`. */
const ANSWERS: Readonly<Record<string, ValidationAlertAnswer>> = {
  retry: "retry",
  yes: "yes",
  no: "no",
  ok: "ok",
  cancel: "cancel",
};

let alertCount = 0;

/** Show the error alert of `rule` over the grid behind `grid`. */
export function validationAlert(
  grid: DialogHost,
  rule: DataValidationRule,
): { readonly result: Promise<ValidationAlertAnswer>; close(): void } {
  const style = validationErrorStyle(rule);
  const body = document.createElement("div");
  body.className = "sheetwrite-validation-alert";
  const icon = document.createElement("span");
  icon.className = "sheetwrite-validation-alert-icon";
  icon.dataset.style = style;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = STYLE_GLYPHS[style];
  const message = document.createElement("p");
  message.className = "sheetwrite-dialog-message";
  message.textContent = rule.helpText || DEFAULT_VALIDATION_ERROR;
  const text = document.createElement("div");
  text.id = `sheetwrite-validation-alert-${++alertCount}`;
  text.append(message);
  if (style === "warning") {
    const question = document.createElement("p");
    question.className = "sheetwrite-dialog-message";
    question.textContent = "Continue?";
    text.append(question);
  }
  body.append(icon, text);

  const dialog = openDialog(grid, {
    title: rule.errorTitle || DEFAULT_VALIDATION_TITLE,
    role: "alertdialog",
    body,
    buttons: STYLE_BUTTONS[style],
    cancel: "cancel",
  });
  dialog.element.setAttribute("aria-describedby", text.id);
  return {
    result: dialog.result.then((value) => ANSWERS[value] ?? "cancel"),
    close: () => dialog.close(),
  };
}
