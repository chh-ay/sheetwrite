/**
 * Data › Data Validation: Excel's questions about the selection's rules, the
 * dialog, and the operations that apply its answer as one undoable step. The
 * module and the dialog load on first use.
 */

import { dataValidationDialog } from "./data-validation-dialog.js";
import { type DialogHost, openDialog } from "./dialog.js";
import { rangesIntersect } from "./store/ranges.js";
import type { StyleActionsDeps } from "./style-actions.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { DataValidationRule, DocumentOp } from "./types/document.js";
import {
  clearedValidationPatches,
  subtractRanges,
  validationIdSource,
  type ValidationSettings,
} from "./validation-transfer.js";

/** What the command reads and changes in the grid that runs it. */
export interface DataValidationHost {
  readonly dialogs: DialogHost;
  /** The selection, the sheet and the commit the format commands use. */
  readonly style: StyleActionsDeps;
}

/** Rows a selection may span before its data rows are taken from its corners. */
const MAX_MAPPED_ROWS = 65_536;

/** The selected cells as data ranges; rows a filter or sort view reorders split into runs. */
function selectedAreas(deps: StyleActionsDeps): Range[] {
  const sheet = deps.activeSheet();
  const areas: Range[] = [];
  deps.selection().forEachRect((rect) => {
    const area = (start: number, end: number): Range => ({
      sheet,
      start: { row: start, col: rect.c0 },
      end: { row: end, col: rect.c1 },
    });
    if (rect.r1 - rect.r0 >= MAX_MAPPED_ROWS) {
      areas.push(area(deps.toDataRow(rect.r0), deps.toDataRow(rect.r1)));
      return;
    }
    let runStart = deps.toDataRow(rect.r0);
    let runEnd = runStart;
    for (let row = rect.r0 + 1; row <= rect.r1; row++) {
      const dataRow = deps.toDataRow(row);
      if (dataRow === runEnd + 1) {
        runEnd = dataRow;
        continue;
      }
      areas.push(area(Math.min(runStart, runEnd), Math.max(runStart, runEnd)));
      runStart = runEnd = dataRow;
    }
    areas.push(area(runStart, runEnd));
  });
  return areas;
}

/** A rule's settings as text, so rules with the same settings compare equal. */
function settingsKey(rule: DataValidationRule): string {
  return JSON.stringify({ ...rule, id: "", range: null });
}

/** Ask a Yes or No question in an alert, as Excel's Data Validation does before it opens. */
async function askYesNo(dialogs: DialogHost, message: string): Promise<boolean> {
  const dialog = openDialog(dialogs, {
    title: "Data Validation",
    role: "alertdialog",
    body: message,
    buttons: [
      { label: "Yes", value: "yes", default: true },
      { label: "No", value: "no" },
    ],
    cancel: "no",
  });
  return (await dialog.result) === "yes";
}

/**
 * The operations that give `areas` the `settings` (none to clear them): the
 * cells leave the rules they had, a rule split by them keeps its other cells,
 * and each area gets a new rule. With `everywhere`, `rule` itself changes,
 * over all its cells, as Excel's "Apply these changes to all other cells
 * with the same settings" does.
 */
export function validationPatches(
  sheet: SheetId,
  rules: readonly DataValidationRule[],
  areas: readonly Range[],
  settings: ValidationSettings | null,
  everywhere: DataValidationRule | undefined,
): DocumentOp[] {
  const patches: DocumentOp[] = [];
  const newId = validationIdSource(rules);
  let targets = areas;
  if (everywhere) {
    patches.push(
      settings
        ? {
            op: "setValidationRule",
            sheet,
            rule: { ...settings, id: everywhere.id, range: everywhere.range },
          }
        : { op: "removeValidationRule", sheet, id: everywhere.id },
    );
    targets = areas.flatMap((area) => subtractRanges(area, [everywhere.range]));
  }
  patches.push(
    ...clearedValidationPatches(
      sheet,
      rules.filter((rule) => rule !== everywhere),
      targets,
      newId,
    ),
  );
  if (settings) {
    for (const range of targets) {
      patches.push({ op: "setValidationRule", sheet, rule: { ...settings, id: newId(), range } });
    }
  }
  return patches;
}

/** Run Data › Data Validation for the selection of the grid behind `host`. */
export async function dataValidationCommand(host: DataValidationHost): Promise<void> {
  const deps = host.style;
  if (deps.readOnly() || deps.selection().focusCell === null) return;
  const sheet = deps.activeSheet();
  const areas = selectedAreas(deps);
  const rules = deps.sheet().validationRules ?? [];
  const touching = rules.filter((rule) => areas.some((area) => rangesIntersect(rule.range, area)));

  let rule: DataValidationRule | undefined = touching[0];
  if (new Set(touching.map(settingsKey)).size > 1) {
    const erase = await askYesNo(
      host.dialogs,
      "The selection contains more than one type of validation. Erase current settings and continue?",
    );
    if (!erase) return;
    rule = undefined;
  } else if (
    rule &&
    areas.some((area) => subtractRanges(area, touching.map((item) => item.range)).length > 0)
  ) {
    const extend = await askYesNo(
      host.dialogs,
      "The selection contains some cells without Data Validation settings. Do you want to extend Data Validation to these cells?",
    );
    if (!extend) rule = undefined;
  }

  const canApplyToAll =
    rule !== undefined &&
    touching.length === 1 &&
    subtractRanges(rule.range, areas).length > 0;
  const change = await dataValidationDialog(host.dialogs, {
    settings: rule ?? null,
    canApplyToAll,
  }).result;
  if (!change || deps.readOnly()) return;

  const patches = validationPatches(
    sheet,
    rules,
    areas,
    change.settings,
    change.applyToAll && canApplyToAll ? rule : undefined,
  );
  if (patches.length > 0) deps.commit(patches);
}
