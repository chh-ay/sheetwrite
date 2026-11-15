import type { CalculationSettings, SheetSnapshot, WorkbookSnapshot } from "@sheetwrite/core";
import {
  colToA1,
  DEFAULT_MAX_CHANGE,
  DEFAULT_MAX_ITERATIONS,
  MAX_ITERATIONS,
  sheetNameKey,
} from "@sheetwrite/core";
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
  const calcPr = xmlChild(workbookRoot, "calcPr");
  if (!calcPr) return undefined;

  const iterate = xmlBoolean(xmlAttribute(calcPr, "iterate"));

  const count = Number(xmlAttribute(calcPr, "iterateCount") ?? DEFAULT_MAX_ITERATIONS);
  const maxIterations = Number.isInteger(count)
    ? Math.min(Math.max(count, 1), MAX_ITERATIONS)
    : DEFAULT_MAX_ITERATIONS;

  const delta = Number(xmlAttribute(calcPr, "iterateDelta") ?? DEFAULT_MAX_CHANGE);
  const maxChange = Number.isFinite(delta) && delta >= 0 ? delta : DEFAULT_MAX_CHANGE;

  if (!iterate && maxIterations === DEFAULT_MAX_ITERATIONS && maxChange === DEFAULT_MAX_CHANGE) {
    return undefined;
  }
  return { iterate, maxIterations, maxChange };
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
    const rawName = xmlAttribute(definition, "name");
    if (!rawName) continue;
    const name = decodeXstring(rawName);
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
    const localSheetId = xmlAttribute(definition, "localSheetId");
    let scope: string | undefined;
    if (localSheetId !== undefined) {
      const scopeIndex = /^\d+$/.test(localSheetId) ? Number(localSheetId) : Number.NaN;
      const scopeSheet =
        Number.isSafeInteger(scopeIndex) && scopeIndex >= 0 ? sheets[scopeIndex] : undefined;
      scope = scopeSheet ? sheetIds.get(sheetNameKey(scopeSheet.name)) : undefined;
      if (!scope) {
        emitWarning(context, {
          code: "unsupported-feature",
          message: `Defined name ${name} had invalid localSheetId ${localSheetId} and was dropped`,
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
    const sheetName = (match[1] ?? match[2] ?? "").replaceAll("''", "'");
    const sheet = sheetIds.get(sheetNameKey(sheetName));
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
      sheet.columns.push({ key, header: colToA1(index), width: 75, type: "text" });
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
  const workbookViews = xmlChildren(
    xmlChild(workbookRoot, "bookViews") ?? workbookRoot,
    "workbookView",
  );
  const activeTab = Number(xmlAttribute(workbookViews.at(-1) ?? workbookRoot, "activeTab") ?? 0);
  const requestedReference =
    Number.isInteger(activeTab) && activeTab >= 0 && activeTab < references.length
      ? references[activeTab]
      : undefined;
  const requestedActive = requestedReference ? sourceReferences.indexOf(requestedReference) : -1;
  const requestedSheet = sourceReferences[requestedActive];
  const activeIndex =
    requestedSheet && requestedSheet.state !== "hidden" && requestedSheet.state !== "veryHidden"
      ? requestedActive
      : sourceReferences.findIndex(
          (reference) => reference.state !== "hidden" && reference.state !== "veryHidden",
        );
  const activeSheet = sheets[activeIndex];
  if (!activeSheet) return readerFailure("workbook requires at least one visible worksheet");
  return activeSheet.id;
}

export function reconcileDefinedNames(
  namedRanges: WorkbookSnapshot["workbook"]["namedRanges"],
  sheets: SheetSnapshot[],
  context: XlsxCodecContext,
): void {
  const definedNameKeys = new Map(
    (namedRanges ?? []).map((named) => [named.name.normalize("NFC").toUpperCase(), named.name]),
  );
  for (const sheet of sheets) {
    const tables = sheet.tables?.filter((table) => {
      const collision = definedNameKeys.get(table.name.normalize("NFC").toUpperCase());
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
  for (const namedRange of namedRanges ?? []) {
    if (namedRange.range === undefined) continue;
    const range = namedRange.range;
    const sheet = sheets.find((candidate) => candidate.id === range.sheet);
    if (sheet) extendSheet(sheet, namedRange.range.end.row, namedRange.range.end.col);
  }
}
