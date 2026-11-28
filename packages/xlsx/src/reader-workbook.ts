import type { CalculationSettings, SheetSnapshot, WorkbookSnapshot } from "@sheetwrite/core";
import {
  colToA1,
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
  MAX_ITERATIONS,
  sheetNameKey,
  workbookTableNameKey,
} from "@sheetwrite/core/codec";
import { formulaContainsExternalReference } from "@sheetwrite/core/external-links";

import type { WorkbookSheetReference } from "./reader-types.js";
import { readerFailure, parseRange } from "./reader-values.js";
import { assertResource, emitWarning, type XlsxCodecContext } from "./resources.js";
import {
  decodeXstring,
  type XmlElement,
  xmlAttribute,
  xmlBoolean,
  xmlChild,
  xmlChildren,
} from "./xml.js";

/**
 * Iterative calculation options from `<calcPr>`, or `undefined` when they are
 * the ECMA defaults. Unreadable counts and deltas fall back to the defaults, and
 * counts beyond Excel's range are clamped into it, so a damaged attribute never
 * rejects the file.
 */
export function workbookCalculation(workbookRoot: XmlElement): CalculationSettings | undefined {
  const calc_pr = xmlChild(workbookRoot, "calcPr");
  if (!calc_pr) return undefined;

  const iterate = xmlBoolean(xmlAttribute(calc_pr, "iterate"));

  const count = Number(xmlAttribute(calc_pr, "iterateCount") ?? DEFAULT_MAX_ITERATIONS);
  const max_iterations = Number.isInteger(count)
    ? Math.min(Math.max(count, 1), MAX_ITERATIONS)
    : DEFAULT_MAX_ITERATIONS;

  const delta = Number(xmlAttribute(calc_pr, "iterateDelta") ?? DEFAULT_MAX_CHANGE);
  const max_change = Number.isFinite(delta) && delta >= 0 ? delta : DEFAULT_MAX_CHANGE;

  if (!iterate && max_iterations === DEFAULT_MAX_ITERATIONS && max_change === DEFAULT_MAX_CHANGE) {
    return undefined;
  }
  return { iterate, maxIterations: max_iterations, maxChange: max_change };
}

export function parseNativeDefinedNames(
  workbookRoot: XmlElement,
  sheetIds: ReadonlyMap<string, string>,
  sheets: readonly WorkbookSheetReference[],
  context: XlsxCodecContext,
): WorkbookSnapshot["workbook"]["namedRanges"] {
  const definitions = xmlChild(workbookRoot, "definedNames");
  if (!definitions) return undefined;
  const ranges: NonNullable<WorkbookSnapshot["workbook"]["namedRanges"]> = [];
  for (const definition of xmlChildren(definitions, "definedName")) {
    const raw_name = xmlAttribute(definition, "name");
    if (!raw_name) continue;
    const name = decodeXstring(raw_name);
    if (name.startsWith("_xlnm.")) {
      emitWarning(context, {
        code: "unsupported-feature",
        message: `Reserved Excel defined name ${name} was dropped`,
      });
      continue;
    }
    if (formulaContainsExternalReference(definition.text)) {
      emitWarning(context, {
        code: "external-formula",
        message: `External defined name ${name} was dropped`,
      });
      continue;
    }
    const local_sheet_id = xmlAttribute(definition, "localSheetId");
    let scope: string | undefined;
    if (local_sheet_id !== undefined) {
      const scope_index = /^\d+$/.test(local_sheet_id) ? Number(local_sheet_id) : Number.NaN;
      const scope_sheet =
        Number.isSafeInteger(scope_index) && scope_index >= 0 ? sheets[scope_index] : undefined;
      scope = scope_sheet ? sheetIds.get(sheetNameKey(scope_sheet.name)) : undefined;
      if (!scope) {
        emitWarning(context, {
          code: "unsupported-feature",
          message: `Defined name ${name} had invalid localSheetId ${local_sheet_id} and was dropped`,
        });
        continue;
      }
    }
    const source = decodeXstring(definition.text);
    const match =
      /^(?:'((?:[^']|'')+)'|([^!]+))!(\$[A-Z]{1,3}\$[1-9]\d*(?::\$[A-Z]{1,3}\$[1-9]\d*)?)$/i.exec(
        source,
      );
    const reference = match?.[3];
    if (match === null || reference === undefined) {
      ranges.push({ name, ...(scope ? { scope } : {}), formula: `=${source.replace(/^=/, "")}` });
      continue;
    }
    const sheet_name = (match[1] ?? match[2] ?? "").replaceAll("''", "'");
    const sheet = sheetIds.get(sheetNameKey(sheet_name));
    if (sheet === undefined) {
      ranges.push({ name, ...(scope ? { scope } : {}), formula: `=${source.replace(/^=/, "")}` });
      continue;
    }
    const parsed = parseRange(reference);
    assertResource(context, "maxRowsPerSheet", parsed.r1 + 1);
    assertResource(context, "maxColumnsPerSheet", parsed.c1 + 1);
    ranges.push({
      name,
      ...(scope ? { scope } : {}),
      range: {
        sheet,
        start: { row: parsed.r0, col: parsed.c0 },
        end: { row: parsed.r1, col: parsed.c1 },
      },
    });
  }
  return ranges.length > 0 ? ranges : undefined;
}

/** The first of `stem`, `stem_2`, `stem_3`… that `keys` does not hold, added to `keys`. */
export function claimColumnKey(stem: string, keys: Set<string>): string {
  let key = stem;
  let suffix = 2;
  while (keys.has(key)) key = `${stem}_${suffix++}`;
  keys.add(key);
  return key;
}

/** Grow `sheet` so that `row` and `col` lie inside it; references may point past the cells. */
export function extendSheet(sheet: SheetSnapshot, row: number, col: number): void {
  sheet.rowCount = Math.max(sheet.rowCount, row + 1);
  if (sheet.columns.length <= col) {
    const keys = new Set(sheet.columns.map((column) => column.key));
    while (sheet.columns.length <= col) {
      const index = sheet.columns.length;
      const key = claimColumnKey(`column${index + 1}`, keys);
      sheet.columns.push({ key, header: colToA1(index), width: 75, type: "general" });
    }
  }
  const block = sheet.cells[0];
  if (block) {
    block.rowCount = Math.max(block.rowCount, sheet.rowCount);
    block.colCount = Math.max(block.colCount, sheet.columns.length);
  }
}

export function workbookActiveSheet(
  workbookRoot: XmlElement,
  references: readonly WorkbookSheetReference[],
  sourceReferences: readonly WorkbookSheetReference[],
  sheets: readonly SheetSnapshot[],
): string {
  const workbook_views = xmlChildren(
    xmlChild(workbookRoot, "bookViews") ?? workbookRoot,
    "workbookView",
  );
  const active_tab = Number(xmlAttribute(workbook_views.at(-1) ?? workbookRoot, "activeTab") ?? 0);
  const requested_reference =
    Number.isInteger(active_tab) && active_tab >= 0 && active_tab < references.length
      ? references[active_tab]
      : undefined;
  const requested_active = requested_reference ? sourceReferences.indexOf(requested_reference) : -1;
  const requested_sheet = sourceReferences[requested_active];
  const active_index =
    requested_sheet && requested_sheet.state !== "hidden" && requested_sheet.state !== "veryHidden"
      ? requested_active
      : sourceReferences.findIndex(
          (reference) => reference.state !== "hidden" && reference.state !== "veryHidden",
        );
  const active_sheet = sheets[active_index];
  if (!active_sheet) return readerFailure("workbook requires at least one visible worksheet");
  return active_sheet.id;
}

export function reconcileDefinedNames(
  namedRanges: WorkbookSnapshot["workbook"]["namedRanges"],
  sheets: SheetSnapshot[],
  context: XlsxCodecContext,
): void {
  const defined_name_keys = new Map(
    (namedRanges ?? []).map((named) => [workbookTableNameKey(named.name), named.name]),
  );
  for (const sheet of sheets) {
    const tables = sheet.tables?.filter((table) => {
      const collision = defined_name_keys.get(workbookTableNameKey(table.name));
      if (collision === undefined) return true;
      emitWarning(context, {
        code: "invalid-metadata",
        message: `Excel table ${table.name} was dropped because its name conflicts case-insensitively with workbook defined name ${collision}; the defined name was retained to keep formula resolution unambiguous`,
        sheet: sheet.name,
      });
      return false;
    });
    if (tables?.length) sheet.tables = tables;
    else delete sheet.tables;
  }
  for (const named_range of namedRanges ?? []) {
    if (named_range.range === undefined) continue;
    const range = named_range.range;
    const sheet = sheets.find((candidate) => candidate.id === range.sheet);
    if (sheet) extendSheet(sheet, named_range.range.end.row, named_range.range.end.col);
  }
}
