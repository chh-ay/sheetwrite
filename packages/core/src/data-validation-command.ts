/**
 * Data › Data Validation: Excel's questions about the selection's rules, the
 * dialog, and the operations that apply its answer as one undoable step. The
 * module and the dialog load on first use.
 */

import { dataValidationDialog, type ValidationSettings } from "./data-validation-dialog.js";
import { type DialogHost, openDialog } from "./dialog.js";
import { normalizedRange, rangesIntersect } from "./store/ranges.js";
import type { StyleActionsDeps } from "./style-actions.js";
import type { Range, SheetId } from "./types/coordinates.js";
import type { DataValidationRule, DocumentOp } from "./types/document.js";

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

/** `range` without the cells of `cut`: up to four rectangles around it. */
function subtract(range: Range, cut: Range): Range[] {
  const outer = normalizedRange(range);
  if (!rangesIntersect(outer, cut)) return [outer];
  const inner = normalizedRange(cut);
  const top = Math.max(outer.start.row, inner.start.row);
  const bottom = Math.min(outer.end.row, inner.end.row);
  const pieces: Range[] = [];
  const piece = (r0: number, c0: number, r1: number, c1: number): void => {
    if (r0 <= r1 && c0 <= c1) {
      pieces.push({ sheet: outer.sheet, start: { row: r0, col: c0 }, end: { row: r1, col: c1 } });
    }
  };
  piece(outer.start.row, outer.start.col, inner.start.row - 1, outer.end.col);
  piece(inner.end.row + 1, outer.start.col, outer.end.row, outer.end.col);
  piece(top, outer.start.col, bottom, inner.start.col - 1);
  piece(top, inner.end.col + 1, bottom, outer.end.col);
  return pieces;
}

function subtractAll(range: Range, cuts: readonly Range[]): Range[] {
  let pieces = [normalizedRange(range)];
  for (const cut of cuts) pieces = pieces.flatMap((piece) => subtract(piece, cut));
  return pieces;
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
  const ids = new Set(rules.map((rule) => rule.id));
  let next = 1;
  const newId = (): string => {
    while (ids.has(`validation-${next}`)) next++;
    const id = `validation-${next}`;
    ids.add(id);
    return id;
  };

  let targets = areas;
  if (everywhere) {
    patches.push(
      settings
        ? { op: "setValidationRule", sheet, rule: { ...settings, id: everywhere.id, range: everywhere.range } }
        : { op: "removeValidationRule", sheet, id: everywhere.id },
    );
    targets = areas.flatMap((area) => subtract(area, everywhere.range));
  }

  for (const rule of rules) {
    if (rule === everywhere || !targets.some((area) => rangesIntersect(rule.range, area))) continue;
    const [kept, ...split] = subtractAll(rule.range, targets);
    patches.push(
      kept
        ? { op: "setValidationRule", sheet, rule: { ...rule, range: kept } }
        : { op: "removeValidationRule", sheet, id: rule.id },
    );
    for (const range of split) {
      patches.push({ op: "setValidationRule", sheet, rule: { ...rule, id: newId(), range } });
    }
  }

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
    areas.some((area) => subtractAll(area, touching.map((item) => item.range)).length > 0)
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
    subtractAll(rule.range, areas).length > 0;
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
