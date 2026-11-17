// Excel's Move or Copy with "Create a copy": the copy keeps the sheet's
// cells, formats, rules, tables, charts and pivots. References to the sheet
// itself refer to the copy, the copy's tables and pivots get new identities,
// and its sheet-scoped names are copied with it.

import { getEngine } from "./engine.js";
import { ENGINE_KINDS, TOKEN_FIELDS } from "./formula-token-kinds.js";
import { formulaNameKey, sheetNameKey } from "./name-key.js";
import type { SheetId } from "./types/coordinates.js";
import type { NamedRangeSnapshot, SheetSnapshot, Workbook } from "./types/document.js";

/** The longest sheet name Excel allows, in UTF-16 code units. */
const MAX_SHEET_NAME = 31;
/** A sheet name that a reference can write without quotes. */
const PLAIN_SHEET_NAME = /^[A-Za-z_][A-Za-z0-9_.]*$/u;
const IDENT = ENGINE_KINDS.indexOf("ident");
const QUOTED = ENGINE_KINDS.indexOf("quoted");
const BANG = ENGINE_KINDS.indexOf("bang");
const COLON = ENGINE_KINDS.indexOf("colon");

/** The copy of a sheet, and the sheet-scoped names that go with it. */
export interface SheetCopy {
  readonly sheet: SheetSnapshot;
  readonly names: NamedRangeSnapshot[];
}

/** Excel's name for a copy of the sheet `name`: `Sales (2)`, or the next free number. */
export function copySheetName(name: string, taken: readonly string[]): string {
  const keys = new Set(taken.map(sheetNameKey));
  for (let number = 2; ; number++) {
    const suffix = ` (${number})`;
    const candidate = `${name.slice(0, MAX_SHEET_NAME - suffix.length)}${suffix}`;
    if (!keys.has(sheetNameKey(candidate))) return candidate;
  }
}

/** How a reference writes a sheet name: plain, or quoted with doubled apostrophes. */
function referenceSheetName(name: string): string {
  return PLAIN_SHEET_NAME.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}

/**
 * Point the references of `text` that name sheet `from` at sheet `to`. A
 * 3-D reference such as `Sheet1:Sheet3!A1` names a span of sheets and stays.
 */
function renameSheetReferences(text: string, from: string, to: string): string {
  const packed = getEngine().formulaTokens(text);
  const fromKey = sheetNameKey(from);
  let out = "";
  let copied = 0;
  for (let at = 0; at + TOKEN_FIELDS <= packed.length; at += TOKEN_FIELDS) {
    const kind = packed[at];
    if ((kind !== IDENT && kind !== QUOTED) || packed[at + TOKEN_FIELDS] !== BANG) continue;
    // `Sheet1:Sheet3!`: the sheet before the colon has no `!` of its own.
    const before = at - TOKEN_FIELDS;
    if (before >= 0 && packed[before] === COLON && packed[before - 2 * TOKEN_FIELDS] !== BANG) {
      continue;
    }

    const start = packed[at + 1]!;
    const end = packed[at + 2]!;
    const written = text.slice(start, end);
    const name = kind === QUOTED ? written.slice(1, -1).replaceAll("''", "'") : written;
    if (sheetNameKey(name) !== fromKey) continue;
    out += text.slice(copied, start) + referenceSheetName(to);
    copied = end;
  }
  return copied === 0 ? text : out + text.slice(copied);
}

/** `base` with the first free number appended: `Sales2`, `Sales3`, ... */
function nextFree(base: string, taken: Set<string>, key: (name: string) => string): string {
  for (let number = 2; ; number++) {
    const candidate = `${base}${number}`;
    if (!taken.has(key(candidate))) {
      taken.add(key(candidate));
      return candidate;
    }
  }
}

/** Replace `sheet: from` with `sheet: to` in every range and address under `value`. */
function moveSheetIds(value: unknown, from: SheetId, to: SheetId): void {
  if (Array.isArray(value)) {
    for (const item of value) moveSheetIds(item, from, to);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (key === "sheet" && child === from) record[key] = to;
    else moveSheetIds(child, from, to);
  }
}

/**
 * Copy `source` as sheet `target` of `workbook`. Formulas, conditional
 * formats and copied names that name the sheet itself name the copy; tables
 * get new names (`Sales` becomes `Sales2`) that the copy's structured
 * references follow, and pivots get new IDs that the copy's charts follow.
 */
export function copySheet(
  source: SheetSnapshot,
  target: { id: SheetId; name: string; order: number },
  workbook: Workbook,
): SheetCopy {
  const { cells, ...rest } = source;
  const sheet: SheetSnapshot = { ...structuredClone(rest), ...target, cells: [] };
  moveSheetIds(sheet, source.id, target.id);

  const nameKeys = new Set(
    [
      ...(workbook.namedRanges ?? []).map((name) => name.name),
      ...workbook.sheets.flatMap((candidate) => candidate.tables ?? []).map((table) => table.name),
    ].map(formulaNameKey),
  );
  const tableIds = new Set(
    workbook.sheets.flatMap((candidate) => candidate.tables ?? []).map((table) => table.id),
  );
  const tableNames: Array<[from: string, to: string]> = [];
  for (const table of sheet.tables ?? []) {
    const name = nextFree(table.name, nameKeys, formulaNameKey);
    tableNames.push([table.name, name]);
    table.name = name;
    table.id = nextFree(`${table.id}-`, tableIds, (id) => id);
  }
  const rewrite = (text: string): string =>
    tableNames.reduce(
      (formula, [from, to]) => getEngine().renameStructuredReference(formula, from, "", to),
      renameSheetReferences(text, source.name, target.name),
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

  const pivotIds = new Set(
    workbook.sheets.flatMap((candidate) => candidate.pivots ?? []).map((pivot) => pivot.id),
  );
  const pivots = new Map<string, string>();
  for (const pivot of sheet.pivots ?? []) {
    const id = nextFree(`${pivot.id}-`, pivotIds, (candidate) => candidate);
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
    moveSheetIds(copy, source.id, target.id);
    copy.scope = target.id;
    if ("formula" in copy && copy.formula !== undefined) copy.formula = rewrite(copy.formula);
    names.push(copy);
  }

  return { sheet, names };
}
