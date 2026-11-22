// Excel's Move or Copy with "Create a copy": the copy keeps the sheet's
// cells, formats, rules, tables, charts and pivots. References to the sheet
// itself refer to the copy, the copy's tables and pivots get new identities,
// and its sheet-scoped names are copied with it.

import { getEngine } from "./engine.js";
import { formulaTokens } from "./formula-syntax.js";
import { formulaNameKey, sheetNameKey } from "./name-key.js";
import type { SheetId } from "./types/coordinates.js";
import type { DocumentOp, NamedRangeSnapshot, SheetSnapshot, Workbook } from "./types/document.js";
import { mapValidationFormulas } from "./validation-rule.js";

/** The longest sheet name Excel allows, in UTF-16 code units. */
const MAX_SHEET_NAME = 31;
/** A sheet name that a reference can write without quotes. */
const PLAIN_SHEET_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/u;

/** The copy of a sheet, and the sheet-scoped names that go with it. */
interface SheetCopy {
  readonly sheet: SheetSnapshot;
  readonly names: NamedRangeSnapshot[];
}

/**
 * The operations that copy sheet `id` to tab position `index` (default: right
 * after it), named `name` or like `Sales (2)`; null when there is no such sheet.
 */
export function planSheetCopy(
  workbook: Workbook,
  snapshotSheet: (id: SheetId) => SheetSnapshot | null,
  id: SheetId,
  options: { index?: number; name?: string },
): { readonly sheet: SheetId; readonly operations: DocumentOp[] } | null {
  const from = workbook.sheets.findIndex((sheet) => sheet.id === id);
  const source = from < 0 ? null : snapshotSheet(id);
  if (!source) return null;

  const used = new Set(workbook.sheets.map((sheet) => sheet.id));
  let copy_id = `${id}-copy`;
  for (let suffix = 2; used.has(copy_id); suffix++) copy_id = `${id}-copy-${suffix}`;
  const name =
    options.name ??
    copy_sheet_name(
      source.name,
      workbook.sheets.map((sheet) => sheet.name),
    );
  const copy = copy_sheet(
    source,
    { id: copy_id, name, order: options.index ?? from + 1 },
    workbook,
  );
  return {
    sheet: copy_id,
    operations: [
      { op: "addSheet", sheet: copy.sheet },
      ...copy.names.map((named_range) => ({
        op: "setNamedRange" as const,
        namedRange: named_range,
      })),
    ],
  };
}

/** Excel's name for a copy of the sheet `name`: `Sales (2)`, or the next free number. */
function copy_sheet_name(name: string, taken: readonly string[]): string {
  const keys = new Set(taken.map(sheetNameKey));
  for (let number = 2; ; number++) {
    const suffix = ` (${number})`;
    const candidate = `${name.slice(0, MAX_SHEET_NAME - suffix.length)}${suffix}`;
    if (!keys.has(sheetNameKey(candidate))) return candidate;
  }
}

/** How a reference writes a sheet name: plain, or quoted with doubled apostrophes. */
export function referenceSheetName(name: string): string {
  return PLAIN_SHEET_NAME.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}

/**
 * Point the references of `text` that name sheet `from` at sheet `to`. A
 * 3-D reference such as `Sheet1:Sheet3!A1` names a span of sheets and stays.
 */
function rename_sheet_references(text: string, from: string, to: string): string {
  const tokens = formulaTokens(text);
  const from_key = sheetNameKey(from);
  let out = "";
  let copied = 0;
  tokens.forEach(({ kind, from: start, to: end, text: written }, index) => {
    if ((kind !== "ident" && kind !== "quoted") || tokens[index + 1]?.kind !== "bang") return;
    // `Sheet1:Sheet3!`: the sheet before the colon has no `!` of its own.
    if (tokens[index - 1]?.kind === "colon" && tokens[index - 3]?.kind !== "bang") return;
    const name = kind === "quoted" ? written.slice(1, -1).replaceAll("''", "'") : written;
    if (sheetNameKey(name) === from_key) {
      out += text.slice(copied, start) + referenceSheetName(to);
      copied = end;
    }
  });
  return copied === 0 ? text : out + text.slice(copied);
}

/** `base` with the first free number appended: `Sales2`, `Sales3`, ... */
function next_free(base: string, taken: Set<string>, key: (name: string) => string): string {
  for (let number = 2; ; number++) {
    const candidate = `${base}${number}`;
    if (!taken.has(key(candidate))) {
      taken.add(key(candidate));
      return candidate;
    }
  }
}

/** Replace `sheet: from` with `sheet: to` in every range and address under `value`. */
function move_sheet_ids(value: unknown, from: SheetId, to: SheetId): void {
  if (Array.isArray(value)) {
    for (const item of value) move_sheet_ids(item, from, to);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (key === "sheet" && child === from) record[key] = to;
    else move_sheet_ids(child, from, to);
  }
}

/**
 * Copy `source` as sheet `target` of `workbook`. Formulas, conditional
 * formats and copied names that name the sheet itself name the copy; tables
 * get new names (`Sales` becomes `Sales2`) that the copy's structured
 * references follow, and pivots get new IDs that the copy's charts follow.
 */
function copy_sheet(
  source: SheetSnapshot,
  target: { id: SheetId; name: string; order: number },
  workbook: Workbook,
): SheetCopy {
  const { cells, ...rest } = source;
  const sheet: SheetSnapshot = { ...structuredClone(rest), ...target, cells: [] };
  move_sheet_ids(sheet, source.id, target.id);

  const name_keys = new Set(
    [
      ...(workbook.namedRanges ?? []).map((name) => name.name),
      ...workbook.sheets.flatMap((candidate) => candidate.tables ?? []).map((table) => table.name),
    ].map(formulaNameKey),
  );
  const table_ids = new Set(
    workbook.sheets.flatMap((candidate) => candidate.tables ?? []).map((table) => table.id),
  );
  const table_names: Array<[from: string, to: string]> = [];
  for (const table of sheet.tables ?? []) {
    const name = next_free(table.name, name_keys, formulaNameKey);
    table_names.push([table.name, name]);
    table.name = name;
    table.id = next_free(`${table.id}-`, table_ids, (id) => id);
  }
  const rewrite = (text: string): string =>
    table_names.reduce(
      (formula, [from, to]) => getEngine().renameStructuredReference(formula, from, "", to),
      rename_sheet_references(text, source.name, target.name),
    );

  sheet.cells = cells.map((block) => ({
    ...block,
    cells: block.cells.map((cell) => {
      const { value } = cell;
      if (value.kind === "formula")
        return { ...cell, value: { kind: "formula", src: rewrite(value.src) } };
      if (value.kind === "ref" && value.target.sheet === source.id) {
        return { ...cell, value: { kind: "ref", target: { ...value.target, sheet: target.id } } };
      }
      return structuredClone(cell);
    }),
  }));
  for (const rule of sheet.conditionalFormats ?? []) {
    if (rule.when.kind === "formula")
      rule.when = { kind: "formula", source: rewrite(rule.when.source) };
  }
  for (const rule of sheet.validationRules ?? []) {
    rule.condition = mapValidationFormulas(rule.condition, rewrite);
  }

  const pivot_ids = new Set(
    workbook.sheets.flatMap((candidate) => candidate.pivots ?? []).map((pivot) => pivot.id),
  );
  const pivots = new Map<string, string>();
  for (const pivot of sheet.pivots ?? []) {
    const id = next_free(`${pivot.id}-`, pivot_ids, (candidate) => candidate);
    pivots.set(pivot.id, id);
    pivot.id = id;
  }
  for (const chart of sheet.charts ?? []) {
    if (chart.pivot !== undefined) chart.pivot = pivots.get(chart.pivot) ?? chart.pivot;
  }

  const names: NamedRangeSnapshot[] = [];
  for (const name of workbook.namedRanges ?? []) {
    if (name.scope !== source.id) continue;
    const copy = structuredClone(name);
    move_sheet_ids(copy, source.id, target.id);
    copy.scope = target.id;
    if ("formula" in copy && copy.formula !== undefined) copy.formula = rewrite(copy.formula);
    names.push(copy);
  }

  return { sheet, names };
}
