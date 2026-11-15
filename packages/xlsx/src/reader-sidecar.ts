import type {
  CellHyperlink,
  CellStyle,
  ConditionalFormatPredicate,
  ConditionalFormatRule,
  SheetSnapshot,
  SnapshotCell,
  WorkbookSnapshot,
} from "@sheetwrite/core";
import { cellA1, sheetNameKey } from "@sheetwrite/core";

import { META_MARKER, META_STEM } from "./format.js";
import type { ParsedSheet } from "./reader-types.js";
import { emitWarning, validateCodecSnapshot, type XlsxCodecContext } from "./resources.js";

export function uniqueSheetId(name: string, order: number, used: Set<string>): string {
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `sheet-${order + 1}`;
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}-${suffix++}`;
  used.add(id);
  return id;
}

/**
 * The sidecar sheet that holds each worksheet's Sheetwrite metadata, by
 * worksheet order. A worksheet takes the sidecar sheet of the same name
 * first; a worksheet without one then takes the sidecar sheet at its order,
 * if no other worksheet claimed it (a renamed sheet). Each sidecar sheet and
 * each sheet ID is claimed at most once, so a sheet inserted before a known
 * sheet gets a new identity.
 */
export function claimSidecarSheets(
  sources: readonly ParsedSheet[],
  metadata: WorkbookSnapshot | null,
  context: XlsxCodecContext,
): (SheetSnapshot | undefined)[] {
  const claims: (SheetSnapshot | undefined)[] = sources.map(() => undefined);
  if (!metadata) return claims;

  const claimedIds = new Set<string>();
  const claim = (order: number, meta: SheetSnapshot | undefined): boolean => {
    if (!meta || claimedIds.has(meta.id)) return false;
    claimedIds.add(meta.id);
    claims[order] = meta;
    return true;
  };

  sources.forEach((source, order) => {
    const key = sheetNameKey(source.name);
    claim(
      order,
      metadata.sheets.find((candidate) => sheetNameKey(candidate.name) === key),
    );
  });

  sources.forEach((source, order) => {
    if (claims[order]) return;
    const ordinal = metadata.sheets.find((candidate) => candidate.order === order);
    if (!claim(order, ordinal)) return;
    emitWarning(context, {
      code: "invalid-metadata",
      message: `Reconciled renamed worksheet ${source.name} to sidecar identity by stable ordinal`,
      sheet: source.name,
    });
  });

  return claims;
}

export function metadataFromSheet(
  sheet: ParsedSheet,
  context: XlsxCodecContext,
): WorkbookSnapshot | null {
  if (!sheet.name.startsWith(META_STEM)) return null;
  const ordered = sheet.cells
    .filter((cell) => cell.colOffset === 0)
    .sort((left, right) => left.rowOffset - right.rowOffset);
  const marker = ordered[0]?.value;
  if (marker?.kind !== "literal" || marker.value !== META_MARKER) return null;
  let json = "";
  for (const cell of ordered.slice(1)) {
    if (cell.value.kind === "literal" && typeof cell.value.value === "string")
      json += cell.value.value;
  }
  try {
    const checked = validateCodecSnapshot(JSON.parse(json), context);
    if (checked.ok) return checked.value;
  } catch (error) {
    // Malformed or too deeply nested JSON gets the same warning as an invalid
    // snapshot; any other error is a bug and fails the import.
    if (!(error instanceof SyntaxError || error instanceof RangeError)) throw error;
  }
  emitWarning(context, {
    code: "invalid-metadata",
    message: "Ignored unreadable or invalid Sheetwrite metadata",
    sheet: sheet.name,
  });
  return null;
}

/**
 * A dashboard sheet from its Sheetwrite metadata: its items, pivots and
 * charts, with no cells. The worksheet's static values and charts are not
 * read, because the export writes them again from the dashboard.
 */
export function restoredDashboard(
  meta: SheetSnapshot,
  id: string,
  name: string,
  order: number,
  state: string | undefined,
): SheetSnapshot {
  return {
    id,
    name,
    order,
    ...(state === "hidden" || state === "veryHidden" ? { visibility: state } : {}),
    kind: "dashboard",
    ...(meta.dashboard ? { dashboard: structuredClone(meta.dashboard) } : {}),
    rowCount: 0,
    columns: [],
    ...(meta.pivots ? { pivots: structuredClone(meta.pivots) } : {}),
    ...(meta.charts ? { charts: structuredClone(meta.charts) } : {}),
    cells: [],
  };
}

export function restoreSidecarFields(
  snapshot: WorkbookSnapshot,
  claims: readonly (SheetSnapshot | undefined)[],
): void {
  for (const sheet of snapshot.sheets) {
    const meta = claims[sheet.order];
    if (!meta || sheet.cells.length === 0) continue;
    // Index the sidecar, which holds only the cells it restores, so the sheet's
    // cells are scanned once instead of indexed.
    const sidecarCells = new Map<number, SnapshotCell[]>();
    for (const block of meta.cells) {
      for (const sidecar of block.cells) {
        const row = block.startRow + sidecar.rowOffset;
        const col = block.startCol + sidecar.colOffset;
        const offset = row * sheet.columns.length + col;
        const restored = sidecarCells.get(offset);
        if (restored) restored.push(sidecar);
        else sidecarCells.set(offset, [sidecar]);
      }
    }
    if (sidecarCells.size === 0) continue;
    for (const existing of sheet.cells[0]?.cells ?? []) {
      const offset = existing.rowOffset * sheet.columns.length + existing.colOffset;
      for (const sidecar of sidecarCells.get(offset) ?? []) {
        if (sidecar.value.kind === "ref" && existing.value.kind === "formula") {
          const reference = sidecar.value;
          const target = snapshot.sheets.find(
            (candidate) => candidate.id === reference.target.sheet,
          );
          if (!target) continue;
          const expected = `='${target.name.replaceAll("'", "''")}'!${cellA1(reference.target.row, reference.target.col)}`;
          if (existing.value.src === expected) existing.value = structuredClone(reference);
        }
        const sidecarBorder = sidecar.style?.border;
        const hasExactWidth = Object.values(sidecarBorder ?? {}).some(
          (border) => border.width !== undefined && border.width !== 1 && border.width !== 2,
        );
        if (hasExactWidth) {
          existing.style = structuredClone(sidecar.style);
        }
      }
    }
  }
}

function projectedConditionalStyle(style: CellStyle): string {
  const color = (value: string | undefined): string | undefined =>
    value?.replace(/^#/, "").toUpperCase();
  const projected: CellStyle = {
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.strikethrough ? { strikethrough: true } : {}),
    ...(style.fontSize !== undefined ? { fontSize: style.fontSize } : {}),
    ...(style.color ? { color: `#${color(style.color)}` } : {}),
    ...(style.backgroundColor ? { backgroundColor: `#${color(style.backgroundColor)}` } : {}),
    ...(style.align ? { align: style.align } : {}),
    ...(style.wrap ? { wrap: true } : {}),
  };
  const borders: NonNullable<CellStyle["border"]> = {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const value = style.border?.[side] ?? style.border?.all;
    if (!value) continue;
    borders[side] = {
      ...(value.color ? { color: `#${color(value.color)}` } : {}),
      style: value.style === "dashed" ? "dashed" : value.style === "dotted" ? "dotted" : "solid",
      width:
        value.style === "dotted"
          ? 1
          : value.style === "dashed" && (value.width ?? 1) >= 2
            ? 2
            : (value.width ?? 1) >= 2
              ? 2
              : 1,
    };
  }
  if (Object.keys(borders).length > 0) projected.border = borders;
  return JSON.stringify(projected);
}

function conditionalPredicateFingerprint(predicate: ConditionalFormatPredicate): string {
  if (predicate.kind === "contains") {
    return JSON.stringify({
      kind: predicate.kind,
      text: predicate.text,
      matchCase: predicate.matchCase === true,
    });
  }
  if (predicate.kind === "formula") {
    return JSON.stringify({ kind: predicate.kind, source: predicate.source });
  }
  return JSON.stringify({ kind: predicate.kind, value: predicate.value });
}

export function reconcileConditionalFormats(
  nativeRules: readonly ConditionalFormatRule[],
  sidecarRules: readonly ConditionalFormatRule[] | undefined,
): ConditionalFormatRule[] {
  const remaining = new Set(sidecarRules?.map((_, index) => index) ?? []);
  return nativeRules.map((native) => {
    const match = sidecarRules?.findIndex(
      (sidecar, index) =>
        remaining.has(index) &&
        sidecar.range.start.row === native.range.start.row &&
        sidecar.range.start.col === native.range.start.col &&
        sidecar.range.end.row === native.range.end.row &&
        sidecar.range.end.col === native.range.end.col &&
        conditionalPredicateFingerprint(sidecar.when) ===
          conditionalPredicateFingerprint(native.when) &&
        sidecar.stopIfTrue === native.stopIfTrue &&
        projectedConditionalStyle(sidecar.style) === projectedConditionalStyle(native.style),
    );
    const sidecar = match === undefined ? undefined : sidecarRules?.[match];
    if (match === undefined || !sidecar) return structuredClone(native);
    remaining.delete(match);
    return {
      ...structuredClone(native),
      style: structuredClone(sidecar.style),
    };
  });
}

export function reconcileHyperlinks(
  nativeLinks: readonly CellHyperlink[],
  sidecarLinks: readonly CellHyperlink[] | undefined,
): CellHyperlink[] {
  const remaining = new Set(sidecarLinks?.map((_, index) => index) ?? []);
  return nativeLinks.map((native) => {
    const match = sidecarLinks?.findIndex(
      (sidecar, index) =>
        remaining.has(index) &&
        sidecar.range.start.row === native.range.start.row &&
        sidecar.range.start.col === native.range.start.col &&
        sidecar.range.end.row === native.range.end.row &&
        sidecar.range.end.col === native.range.end.col &&
        sidecar.display === native.display &&
        JSON.stringify(sidecar.target) === JSON.stringify(native.target),
    );
    const sidecar = match === undefined ? undefined : sidecarLinks?.[match];
    if (match === undefined || !sidecar) return structuredClone(native);
    remaining.delete(match);
    return structuredClone(sidecar);
  });
}
