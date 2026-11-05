// Pure dashboard rules shared by the protocol, the store and the history:
// shape checks, layout checks, references and copies of dashboard items
// (#231). Nothing here reads cells or computes item values.

import {
  type DataModelIssue,
  type DataModelIssueSink,
  validateColumnRefShape,
} from "./data-model.js";
import { isPivotScalar, MAX_PIVOT_FILTER_VALUES } from "./pivot.js";
import { isPlainRecord, ownValue, type PlainRecord } from "./plain-data.js";
import type { Dashboard, DashboardBox, DashboardItem } from "./types/dashboard.js";
import type { DocumentOp } from "./types/document.js";
import type { PivotDefinition } from "./types/pivot.js";

/** Columns of the dashboard grid. */
const DASHBOARD_COLUMNS = 12;
/** Most items on one dashboard. */
const MAX_DASHBOARD_ITEMS = 64;
/** Tallest item, in grid rows. */
const MAX_ITEM_HEIGHT = 64;
/** Rows a full dashboard of the tallest items needs; bounds every box. */
const MAX_DASHBOARD_ROWS = MAX_DASHBOARD_ITEMS * MAX_ITEM_HEIGHT;
/** Longest item ID, pivot ID or title. */
const MAX_TEXT_LENGTH = 255;

/** A dashboard sheet takes only these operations, because it has no cells, rows or columns. */
const DASHBOARD_OPERATIONS: Partial<Record<DocumentOp["op"], true>> = {
  addSheet: true,
  removeSheet: true,
  renameSheet: true,
  moveSheet: true,
  setSheetVisibility: true,
  setPivot: true,
  removePivot: true,
  setDashboardItem: true,
  removeDashboardItem: true,
};

/** The kind, items and pivots of a sheet, as live sheets and snapshots hold them. */
interface DashboardSheet {
  kind?: string;
  dashboard?: Dashboard;
  pivots?: readonly PivotDefinition[];
}

function invalid(issues: DataModelIssueSink, path: string, message: string): void {
  issues.push({ path, code: "invalid-value", message });
}

function isBoundedText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Whether `sheet` is a dashboard. */
export function isDashboard(sheet: { kind?: string } | undefined): boolean {
  return sheet?.kind === "dashboard";
}

/** Whether a dashboard sheet takes `op`. A worksheet takes every operation. */
export function dashboardTakes(op: DocumentOp["op"]): boolean {
  return DASHBOARD_OPERATIONS[op] === true;
}

function validateBoxShape(value: unknown, path: string, issues: DataModelIssueSink): void {
  if (!isPlainRecord(value)) {
    invalid(issues, path, "box must be an object");
    return;
  }

  const x = ownValue(value, "x");
  const y = ownValue(value, "y");
  const w = ownValue(value, "w");
  const h = ownValue(value, "h");
  const xValid = isIntegerIn(x, 0, DASHBOARD_COLUMNS - 1);
  const hValid = isIntegerIn(h, 1, MAX_ITEM_HEIGHT);

  if (!xValid) {
    invalid(issues, `${path}.x`, `x must be an integer from 0 to ${DASHBOARD_COLUMNS - 1}`);
  }
  if (!isIntegerIn(w, 1, DASHBOARD_COLUMNS) || (xValid && x + w > DASHBOARD_COLUMNS)) {
    invalid(issues, `${path}.w`, `w must be at least 1, and x + w at most ${DASHBOARD_COLUMNS}`);
  }
  if (!hValid) {
    invalid(issues, `${path}.h`, `h must be an integer from 1 to ${MAX_ITEM_HEIGHT}`);
  }
  if (!isIntegerIn(y, 0, MAX_DASHBOARD_ROWS - 1) || (hValid && y + h > MAX_DASHBOARD_ROWS)) {
    invalid(issues, `${path}.y`, `y must be at least 0, and y + h at most ${MAX_DASHBOARD_ROWS}`);
  }
}

function validateSlicerShape(item: PlainRecord, path: string, issues: DataModelIssueSink): void {
  validateColumnRefShape(ownValue(item, "field"), `${path}.field`, issues);

  const title = ownValue(item, "title");
  if (title !== undefined && !isBoundedText(title)) {
    invalid(
      issues,
      `${path}.title`,
      `title must be a non-empty string of at most ${MAX_TEXT_LENGTH}`,
    );
  }

  const selected = ownValue(item, "selected");
  if (selected === undefined) return;
  if (!Array.isArray(selected)) {
    invalid(issues, `${path}.selected`, "selected must be an array");
  } else if (selected.length > MAX_PIVOT_FILTER_VALUES) {
    issues.push({
      path: `${path}.selected`,
      code: "resource-limit",
      message: `Slicer value limit ${MAX_PIVOT_FILTER_VALUES} exceeded`,
    });
  } else if (!selected.every(isPivotScalar)) {
    invalid(issues, `${path}.selected`, "selected must hold cell scalars");
  }
}

/** Shape checks for one untrusted dashboard item. */
export function validateDashboardItemShape(
  value: unknown,
  path: string,
  issues: DataModelIssueSink,
): void {
  if (!isPlainRecord(value)) {
    invalid(issues, path, "Dashboard item must be an object");
    return;
  }

  if (!isBoundedText(ownValue(value, "id"))) {
    invalid(issues, `${path}.id`, `id must be a non-empty string of at most ${MAX_TEXT_LENGTH}`);
  }
  validateBoxShape(ownValue(value, "box"), `${path}.box`, issues);

  const kind = ownValue(value, "kind");
  if (kind === "pivot") {
    if (!isBoundedText(ownValue(value, "pivot"))) {
      invalid(
        issues,
        `${path}.pivot`,
        `pivot must be a non-empty string of at most ${MAX_TEXT_LENGTH}`,
      );
    }
  } else if (kind === "slicer") {
    validateSlicerShape(value, path, issues);
  } else {
    invalid(issues, `${path}.kind`, 'kind must be "pivot" or "slicer"');
  }
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
function validateItems(
  items: readonly DashboardItem[],
  path: string,
  issues: DataModelIssueSink,
): void {
  if (items.length > MAX_DASHBOARD_ITEMS) {
    issues.push({
      path,
      code: "resource-limit",
      message: `Dashboard item limit ${MAX_DASHBOARD_ITEMS} exceeded`,
    });
    return;
  }

  // At most 64 items, so a check of every pair costs less than an index.
  items.forEach((item, index) => {
    for (let other = 0; other < index; other++) {
      const earlier = items[other];
      if (earlier === undefined) continue;
      if (earlier.id === item.id) {
        issues.push({
          path: `${path}[${index}].id`,
          code: "duplicate-id",
          message: `Dashboard item ID ${item.id} is used twice`,
        });
      } else if (boxesOverlap(earlier.box, item.box)) {
        invalid(issues, `${path}[${index}].box`, `Item ${item.id} overlaps item ${earlier.id}`);
      }
    }
  });
}

/** Whether an untrusted pivot reads a cell range. */
function readsRange(pivot: unknown): boolean {
  const source = isPlainRecord(pivot) ? ownValue(pivot, "source") : undefined;
  return isPlainRecord(source) && ownValue(source, "range") !== undefined;
}

/**
 * Checks of the kind and items of an untrusted sheet snapshot whose other
 * fields passed their shape checks. A dashboard has no rows, columns or
 * cells; only a dashboard has items; and a dashboard pivot reads a table or
 * the data model, because slicers filter tables.
 */
export function validateSheetKindShape(
  sheet: PlainRecord,
  path: string,
  issues: DataModelIssueSink,
): void {
  const kind = ownValue(sheet, "kind");
  const dashboard = ownValue(sheet, "dashboard");
  if (kind !== undefined && kind !== "worksheet" && kind !== "dashboard") {
    invalid(issues, `${path}.kind`, 'kind must be "worksheet" or "dashboard"');
    return;
  }
  if (kind !== "dashboard") {
    if (dashboard !== undefined) {
      invalid(issues, `${path}.dashboard`, "Only a dashboard sheet has items");
    }
    return;
  }

  const columns = ownValue(sheet, "columns");
  const cells = ownValue(sheet, "cells");
  const empty =
    ownValue(sheet, "rowCount") === 0 &&
    Array.isArray(columns) &&
    columns.length === 0 &&
    (!Array.isArray(cells) || cells.length === 0);
  if (!empty) invalid(issues, path, "A dashboard sheet has no rows, columns or cells");

  const pivots = ownValue(sheet, "pivots");
  if (Array.isArray(pivots) && pivots.some(readsRange)) {
    invalid(issues, `${path}.pivots`, "A dashboard pivot reads a table or the data model");
  }

  if (dashboard === undefined) return;
  const itemsPath = `${path}.dashboard.items`;
  const items = isPlainRecord(dashboard) ? ownValue(dashboard, "items") : undefined;
  if (!Array.isArray(items)) {
    invalid(issues, itemsPath, "items must be an array");
    return;
  }
  if (items.length > MAX_DASHBOARD_ITEMS) {
    issues.push({
      path: itemsPath,
      code: "resource-limit",
      message: `Dashboard item limit ${MAX_DASHBOARD_ITEMS} exceeded`,
    });
    return;
  }

  const shapeIssues: DataModelIssue[] = [];
  items.forEach((item, index) => {
    validateDashboardItemShape(item, `${itemsPath}[${index}]`, shapeIssues);
  });
  if (shapeIssues.length > 0) {
    issues.push(...shapeIssues);
    return;
  }

  // The shape checks above prove every entry is an item.
  validateItems(items as DashboardItem[], itemsPath, issues);
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
  if (!isDashboard(sheet)) {
    invalid(issues, "sheet", "Items go on a dashboard sheet");
    return;
  }
  validateItems(withDashboardItem(sheet.dashboard, item).items, "dashboard.items", issues);
}

/** Whether a pivot on `sheet` can take `pivot`: a dashboard pivot does not read a range. */
export function dashboardPivotAllowed(sheet: DashboardSheet, pivot: PivotDefinition): boolean {
  return !isDashboard(sheet) || !("range" in pivot.source);
}

/** Deep copy of one item holding only its defined fields. */
export function cloneDashboardItem(item: DashboardItem): DashboardItem {
  const box = { x: item.box.x, y: item.box.y, w: item.box.w, h: item.box.h };
  if (item.kind === "pivot") return { id: item.id, box, kind: "pivot", pivot: item.pivot };
  return {
    id: item.id,
    box,
    kind: "slicer",
    field: { table: item.field.table, column: item.field.column },
    ...(item.selected ? { selected: [...item.selected] } : {}),
    ...(item.title !== undefined ? { title: item.title } : {}),
  };
}

/** Reading order: top to bottom, then left to right. Items do not overlap, so no two are equal. */
function byReadingOrder(left: DashboardItem, right: DashboardItem): number {
  return left.box.y - right.box.y || left.box.x - right.box.x;
}

/**
 * Deep copy of a dashboard, with items in reading order. One order for every
 * history of edits keeps undo, sync and snapshots exact.
 */
export function cloneDashboard(dashboard: Dashboard): Dashboard {
  return { items: dashboard.items.map(cloneDashboardItem).sort(byReadingOrder) };
}

/** The item with `id` on `sheet`, if it has one. */
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
  const items = dashboard?.items ?? [];
  const index = items.findIndex((candidate) => candidate.id === item.id);
  const copy = cloneDashboardItem(item);
  const next =
    index < 0
      ? [...items, copy]
      : items.map((candidate, position) => (position === index ? copy : candidate));
  return { items: next.sort(byReadingOrder) };
}

/** A copy of `dashboard` without the item with `id`. */
export function withoutDashboardItem(dashboard: Dashboard | undefined, id: string): Dashboard {
  return { items: (dashboard?.items ?? []).filter((item) => item.id !== id) };
}
