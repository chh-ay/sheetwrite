// Pure dashboard rules shared by the protocol, the store and the history:
// shape checks, layout checks and copies of dashboard items. Nothing
// here reads cells or computes item values. The store and the protocol load
// this module at first paint, so each check reports one short message.

import type { DataModelIssue, DataModelIssueSink } from "./data-model.js";
import { isPivotScalar, MAX_PIVOT_FILTER_VALUES } from "./pivot.js";
import { isPlainRecord, ownValue, type PlainRecord } from "./plain-data.js";
import type { Dashboard, DashboardBox, DashboardItem } from "./types/dashboard.js";
import type { DocumentOp } from "./types/document.js";
import type { PivotDefinition } from "./types/pivot.js";

/** Columns of the dashboard grid. */
const DASHBOARD_COLUMNS = 12;
const MAX_DASHBOARD_ITEMS = 64;
/** Tallest item, in grid rows. */
const MAX_ITEM_HEIGHT = 64;
/** Rows a full dashboard of the tallest items needs; bounds every box. */
const MAX_DASHBOARD_ROWS = MAX_DASHBOARD_ITEMS * MAX_ITEM_HEIGHT;
/** Longest item ID, table or column ID, pivot ID or title. */
const MAX_TEXT_LENGTH = 255;

/** A dashboard sheet takes only these operations, because it has no cells, rows or columns. */
const DASHBOARD_OPERATIONS: readonly DocumentOp["op"][] = [
  "addSheet",
  "removeSheet",
  "renameSheet",
  "moveSheet",
  "setSheetVisibility",
  "setPivot",
  "removePivot",
  "setChart",
  "removeChart",
  "setDashboardItem",
  "removeDashboardItem",
];

/** The kind and items of a sheet, as live sheets and snapshots hold them. */
interface DashboardSheet {
  kind?: string;
  dashboard?: Dashboard;
}

function invalid(issues: DataModelIssueSink, path: string, message: string): void {
  issues.push({ path, code: "invalid-value", message });
}

function is_text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function is_integer_in(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function isDashboard(sheet: { kind?: string } | null | undefined): boolean {
  return sheet?.kind === "dashboard";
}

/** Whether a dashboard sheet takes `op`. A worksheet takes every operation. */
export function dashboardTakes(op: DocumentOp["op"]): boolean {
  return DASHBOARD_OPERATIONS.includes(op);
}

/** Whether `value` is a box inside the grid. */
function is_box(value: unknown): boolean {
  if (!isPlainRecord(value)) return false;
  const x = ownValue(value, "x");
  const y = ownValue(value, "y");
  const w = ownValue(value, "w");
  const h = ownValue(value, "h");
  return (
    is_integer_in(x, 0, DASHBOARD_COLUMNS - 1) &&
    is_integer_in(w, 1, DASHBOARD_COLUMNS - x) &&
    is_integer_in(h, 1, MAX_ITEM_HEIGHT) &&
    is_integer_in(y, 0, MAX_DASHBOARD_ROWS - h)
  );
}

/** Whether `value` names a table and one of its columns. */
function is_column_ref(value: unknown): boolean {
  return (
    isPlainRecord(value) && is_text(ownValue(value, "table")) && is_text(ownValue(value, "column"))
  );
}

/** Whether the kind-specific fields of an item are valid. */
function is_item_body(item: PlainRecord): boolean {
  const kind = ownValue(item, "kind");
  if (kind === "pivot") return is_text(ownValue(item, "pivot"));
  if (kind === "chart") return is_text(ownValue(item, "chart"));
  if (kind === "kpi") {
    const title = ownValue(item, "title");
    const number_format = ownValue(item, "numberFormat");
    return (
      is_text(ownValue(item, "measure")) &&
      (title === undefined || is_text(title)) &&
      (number_format === undefined || is_text(number_format))
    );
  }
  if (kind !== "slicer") return false;

  const title = ownValue(item, "title");
  const selected = ownValue(item, "selected");
  const no_data = ownValue(item, "itemsWithNoData");
  return (
    (no_data === undefined || no_data === "dim" || no_data === "hide" || no_data === "show") &&
    is_column_ref(ownValue(item, "field")) &&
    (title === undefined || is_text(title)) &&
    (selected === undefined ||
      (Array.isArray(selected) &&
        selected.length <= MAX_PIVOT_FILTER_VALUES &&
        selected.every(isPivotScalar)))
  );
}

/** Shape checks for one untrusted dashboard item. */
export function validateDashboardItemShape(
  value: unknown,
  path: string,
  issues: DataModelIssueSink,
): void {
  const valid =
    isPlainRecord(value) &&
    is_text(ownValue(value, "id")) &&
    is_box(ownValue(value, "box")) &&
    is_item_body(value);
  if (!valid) invalid(issues, path, "Dashboard item is invalid; see DashboardItem");
}

/** Whether two boxes share a grid cell. */
export function boxesOverlap(left: DashboardBox, right: DashboardBox): boolean {
  return (
    left.x < right.x + right.w &&
    right.x < left.x + left.w &&
    left.y < right.y + right.h &&
    right.y < left.y + left.h
  );
}

/**
 * Layout checks for shape-valid items: the item limit, unique IDs, and boxes
 * that do not overlap. A pivot item may name a pivot that is not there: it
 * shows `#REF!`, so removing a pivot and undoing it do not depend on order.
 */
function validate_items(
  items: readonly DashboardItem[],
  path: string,
  issues: DataModelIssueSink,
): void {
  // At most 64 items, so a check of every pair costs less than an index.
  const clash = items.some((item, index) =>
    items
      .slice(0, index)
      .some((earlier) => earlier.id === item.id || boxesOverlap(earlier.box, item.box)),
  );
  if (items.length > MAX_DASHBOARD_ITEMS || clash) {
    invalid(issues, path, `Items need unique IDs, no overlap and at most ${MAX_DASHBOARD_ITEMS}`);
  }
}

/** Whether an untrusted pivot reads a cell range. */
function reads_range(pivot: unknown): boolean {
  const source = isPlainRecord(pivot) ? ownValue(pivot, "source") : undefined;
  return isPlainRecord(source) && ownValue(source, "range") !== undefined;
}

/**
 * Checks of the kind and items of an untrusted sheet snapshot. A dashboard
 * has no rows, columns or cells; only a dashboard has items; and a dashboard
 * pivot reads a table or the data model, because slicers filter tables.
 */
export function validateSheetKindShape(
  sheet: PlainRecord,
  path: string,
  issues: DataModelIssueSink,
): void {
  const kind = ownValue(sheet, "kind");
  const dashboard = ownValue(sheet, "dashboard");
  if (kind !== "dashboard") {
    if ((kind !== undefined && kind !== "worksheet") || dashboard !== undefined) {
      invalid(issues, path, 'Only a sheet of kind "dashboard" has items');
    }
    return;
  }

  const columns = ownValue(sheet, "columns");
  const cells = ownValue(sheet, "cells");
  const pivots = ownValue(sheet, "pivots");
  const items = isPlainRecord(dashboard) ? ownValue(dashboard, "items") : undefined;
  const valid =
    ownValue(sheet, "rowCount") === 0 &&
    Array.isArray(columns) &&
    columns.length === 0 &&
    (!Array.isArray(cells) || cells.length === 0) &&
    (!Array.isArray(pivots) || !pivots.some(reads_range)) &&
    (dashboard === undefined || Array.isArray(items));
  if (!valid) {
    invalid(issues, path, "A dashboard has no rows, columns, cells or range pivots");
    return;
  }
  if (!Array.isArray(items)) return;

  const shape_issues: DataModelIssue[] = [];
  items.slice(0, MAX_DASHBOARD_ITEMS + 1).forEach((item, index) => {
    validateDashboardItemShape(item, `${path}.dashboard.items[${index}]`, shape_issues);
  });
  issues.push(...shape_issues);
  // The shape checks above prove every entry is an item.
  if (shape_issues.length === 0)
    validate_items(items as DashboardItem[], `${path}.dashboard`, issues);
}

/**
 * Admission checks for a shape-valid `item` that replaces the one with its
 * ID on `sheet`: the sheet is a dashboard, and its items stay valid.
 */
export function validateDashboardItemAdmission(
  item: DashboardItem,
  sheet: DashboardSheet,
  issues: DataModelIssueSink,
): void {
  if (!isDashboard(sheet)) invalid(issues, "sheet", "Items go on a dashboard");
  else validate_items(withDashboardItem(sheet.dashboard, item).items, "dashboard", issues);
}

/** Whether a sheet can take `pivot`: a dashboard pivot does not read a range. */
export function dashboardPivotAllowed(sheet: DashboardSheet, pivot: PivotDefinition): boolean {
  return !isDashboard(sheet) || !("range" in pivot.source);
}

/** Reading order: top to bottom, then left to right. Items do not overlap, so no two are equal. */
function by_reading_order(left: DashboardItem, right: DashboardItem): number {
  return left.box.y - right.box.y || left.box.x - right.box.x;
}

/**
 * Deep copy of a dashboard, with items in reading order. One order for every
 * history of edits keeps undo, sync and snapshots exact.
 */
export function cloneDashboard(dashboard: Dashboard): Dashboard {
  return { items: structuredClone(dashboard.items).sort(by_reading_order) };
}

/**
 * The kind and a copy of the items of a dashboard, or nothing for a
 * worksheet. A dashboard always holds an item list, so every copy of a sheet
 * has the same form.
 */
export function dashboardFields(sheet: DashboardSheet): {
  kind?: "dashboard";
  dashboard?: Dashboard;
} {
  return isDashboard(sheet)
    ? { kind: "dashboard", dashboard: cloneDashboard(sheet.dashboard ?? { items: [] }) }
    : {};
}

export function findDashboardItem(
  sheet: DashboardSheet | null | undefined,
  id: string,
): DashboardItem | undefined {
  return sheet?.dashboard?.items.find((item) => item.id === id);
}

/** A copy of `dashboard` with `item` inserted, or replacing the one with its ID. */
export function withDashboardItem(
  dashboard: Dashboard | undefined,
  item: DashboardItem,
): Dashboard {
  const items = (dashboard?.items ?? []).filter((candidate) => candidate.id !== item.id);
  return { items: [...items, structuredClone(item)].sort(by_reading_order) };
}

/** A copy of `dashboard` without the item with `id`. */
export function withoutDashboardItem(dashboard: Dashboard | undefined, id: string): Dashboard {
  return { items: (dashboard?.items ?? []).filter((item) => item.id !== id) };
}
