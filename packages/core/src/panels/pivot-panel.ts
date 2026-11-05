// The pivot field list: the source fields with their types, and the Filters,
// Columns, Rows and Values areas. Fields move by drag and drop, and by
// keyboard through the menu button on each field. Each change is ONE
// `grid.setPivot`, so it is one undo step and the output updates at once.

import { Scope } from "../scope.js";
import type { CellScalar } from "../types/cell.js";
import type { SheetId } from "../types/coordinates.js";
import type { TableColumnRef } from "../types/data-model.js";
import type { Grid, GridPanel } from "../types/grid.js";
import type { PivotDefinition, PivotFieldType, PivotSourceField } from "../types/pivot.js";
import { panelSection, rebuildPanel, rejectionMessage, selectOf } from "./panel-dom.js";
import { menuButton, type PanelMenuItem } from "./panel-menu.js";
import {
  AGGREGATION_LABELS,
  areaFields,
  isDescending,
  MAX_FILTER_VALUES,
  PIVOT_AREAS,
  placeField,
  removeField,
  setAggregation,
  setFilterValues,
  setSortOrder,
  shiftField,
  sourceDataRange,
  baseTable,
  relatedTables,
  valuesType,
  withModelField,
  type FieldFacts,
  type PivotArea,
  type PivotPlacement,
} from "./pivot-model.js";

const TYPE_BADGES: Readonly<Record<PivotFieldType, string>> = {
  number: "Number",
  text: "Text",
  boolean: "Logical",
  mixed: "Mixed",
  blank: "Blank",
};

const SORT_OPTIONS: readonly (readonly [string, string])[] = [
  ["ascending", "Ascending"],
  ["descending", "Descending"],
];

const NEEDS_FULL_ENGINE =
  "Pivot tables need the full engine. Load @sheetwrite/formulas to edit fields.";
const MISSING_PIVOT = "This pivot table no longer exists.";
const TOO_MANY_VALUES = `This field has more than ${MAX_FILTER_VALUES.toLocaleString("en-US")} values, so it cannot be a filter.`;
const EMPTY_AREA = "Drag fields here";
const BLANK_LABEL = "(blank)";

/** What a drag carries: a source field, or an entry that leaves its area. */
interface DragState {
  readonly field: number;
  readonly from: PivotPlacement | null;
}

/** The field list for the pivot `id` on `sheet`; `grid.openPanel` shows it. */
export function pivotPanel(grid: Grid, sheet: SheetId, id: string, focus = true): GridPanel {
  return {
    title: "PivotTable Fields",
    focus,
    render: (body) => renderPivotPanel(body, grid, sheet, id),
  };
}

/** Sort order of filter values: numbers, then text, then logicals, then blank. */
function compareScalars(a: CellScalar, b: CellScalar): number {
  const rank = (value: CellScalar): number =>
    typeof value === "number"
      ? 0
      : typeof value === "string"
        ? 1
        : typeof value === "boolean"
          ? 2
          : 3;
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return Number(a) - Number(b);
}

function scalarLabel(value: CellScalar): string {
  return value === null || value === "" ? BLANK_LABEL : String(value);
}

function renderPivotPanel(body: HTMLElement, grid: Grid, sheet: SheetId, id: string): () => void {
  const read = (): PivotDefinition | null =>
    grid.getPivots(sheet).find((pivot) => pivot.id === id) ?? null;
  // The panel's lifetime: its grid listener and the document listener of an open menu.
  const lifetime = new Scope();

  let drag: DragState | null = null;
  let message: string | null = null;
  let rendered = "";

  /**
   * Distinct values of one source field, at most one more than a filter may
   * keep, so an overflow is visible without reading every row twice.
   */
  const distinctValues = (pivot: PivotDefinition, field: number): CellScalar[] => {
    const tables = grid.store.getWorkbook().sheets.flatMap((candidate) => candidate.tables ?? []);
    const modelField = "model" in pivot.source ? pivot.source.model.fields[field] : undefined;
    const source = modelField ? { table: modelField.table } : pivot.source;
    const range = sourceDataRange(source, tables);
    if (range === null) return [];
    const offset = modelField
      ? (tables
          .find((table) => table.id === modelField.table)
          ?.columns.findIndex((column) => column.id === modelField.column) ?? -1)
      : field;
    if (offset < 0) return [];
    // Related fields can be blank because a fact key has no matching row.
    const seen = new Set<CellScalar>(modelField ? [null] : []);
    const col = range.start.col + offset;
    for (let row = range.start.row; row <= range.end.row; row++) {
      seen.add(grid.store.getCell({ sheet: range.sheet, row, col }).resolved);
      if (seen.size > MAX_FILTER_VALUES) break;
    }
    return [...seen].sort(compareScalars);
  };

  /** Commit one edit, then rebuild with focus on `focusKey` when given. */
  const commit = (next: PivotDefinition, focusKey?: string): void => {
    message = rejectionMessage(grid.setPivot(next, sheet));
    refresh(true);
    if (focusKey !== undefined)
      body.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus();
  };

  /** Move a field, refusing a filter whose keep-list would pass the limit. */
  const move = (
    pivot: PivotDefinition,
    fields: readonly PivotSourceField[],
    field: number,
    to: PivotArea,
    from: PivotPlacement | null,
    at?: number,
  ): void => {
    const type = fields.find((candidate) => candidate.index === field)?.type;
    // Only a new filter reads the source; a moved filter keeps its keep-list.
    const values = to === "filters" && from?.area !== "filters" ? distinctValues(pivot, field) : [];
    if (values.length > MAX_FILTER_VALUES) {
      message = TOO_MANY_VALUES;
      refresh(true);
      return;
    }
    const next = placeField(pivot, field, to, { type, distinctValues: () => values }, from, at);
    const index = areaFields(next, to).lastIndexOf(field);
    const placed = to === "values" ? (at ?? next.values.length - 1) : index;
    commit(next, `${to}-${placed}-menu`);
  };

  /**
   * Add `column` of a related table to `to`. A table source becomes a model
   * source in the same change, so it stays one undo step.
   */
  const addRelated = (pivot: PivotDefinition, column: TableColumnRef, to: PivotArea): void => {
    const tables = grid.store.getWorkbook().sheets.flatMap((candidate) => candidate.tables ?? []);
    const added = withModelField(pivot, tables, column);
    if (added === null) return;
    const values = distinctValues(added.pivot, added.field);
    if (to === "filters" && values.length > MAX_FILTER_VALUES) {
      message = TOO_MANY_VALUES;
      refresh(true);
      return;
    }
    const facts = { type: valuesType(values), distinctValues: () => values };
    const next = placeField(added.pivot, added.field, to, facts, null);
    const placed =
      to === "values" ? next.values.length - 1 : areaFields(next, to).lastIndexOf(added.field);
    commit(next, `${to}-${placed}-menu`);
  };

  /**
   * One section per table that the pivot's base table reaches through
   * relationships, with the columns the pivot does not read yet.
   */
  const appendRelatedTables = (target: HTMLElement, pivot: PivotDefinition): void => {
    const base = baseTable(pivot.source);
    if (base === undefined) return;
    const workbook = grid.store.getWorkbook();
    const tables = workbook.sheets.flatMap((candidate) => candidate.tables ?? []);
    const reads = "model" in pivot.source ? pivot.source.model.fields : [];
    for (const table of relatedTables(base, tables, workbook.dataModel?.relationships ?? [])) {
      const section = panelSection(`Related: ${table.name}`);
      const list = document.createElement("ul");
      list.className = "sheetwrite-panel-fields";
      list.setAttribute("aria-label", `${table.name} fields`);
      for (const column of table.columns) {
        const ref = { table: table.id, column: column.id };
        if (reads.some((field) => field.table === ref.table && field.column === ref.column))
          continue;
        const item = document.createElement("li");
        item.className = "sheetwrite-panel-field-item";
        const name = document.createElement("span");
        name.className = "sheetwrite-panel-field-name";
        name.textContent = column.name;
        const label = `${table.name} › ${column.name}`;
        const menu = menuButton(
          `${label} field actions`,
          `related-${table.id}-${column.id}-menu`,
          () =>
            PIVOT_AREAS.map(([area, areaLabel]) => ({
              label: `Add to ${areaLabel}`,
              run: () => addRelated(pivot, ref, area),
            })),
          lifetime.signal,
        );
        item.append(name, menu);
        list.appendChild(item);
      }
      if (list.childElementCount === 0) continue;
      section.appendChild(list);
      target.appendChild(section);
    }
  };

  const build = (target: HTMLElement): void => {
    const pivot = read();
    if (pivot === null) {
      target.appendChild(note(MISSING_PIVOT));
      return;
    }
    const fields = grid.getPivotFields(sheet, id);
    if (message !== null) target.appendChild(note(message, true));
    if (fields.length === 0) {
      target.appendChild(note(NEEDS_FULL_ENGINE));
      return;
    }
    const tables = grid.store.getWorkbook().sheets.flatMap((candidate) => candidate.tables ?? []);
    const model = "model" in pivot.source ? pivot.source.model : undefined;
    // A related field names its table, since two tables can share a column name.
    const header = (field: number): string => {
      const name =
        fields.find((candidate) => candidate.index === field)?.header ?? `Field ${field + 1}`;
      const ref = model?.fields[field];
      if (ref === undefined || ref.table === model?.table) return name;
      const table = tables.find((candidate) => candidate.id === ref.table);
      return `${table?.name ?? ref.table} › ${name}`;
    };

    // Source fields. Dropping an entry here removes it from its area.
    const fieldSection = panelSection("Fields");
    const fieldList = document.createElement("ul");
    fieldList.className = "sheetwrite-panel-fields";
    fieldList.setAttribute("aria-label", "Fields");
    const used = new Set(PIVOT_AREAS.flatMap(([area]) => areaFields(pivot, area)));
    for (const field of fields) {
      const item = document.createElement("li");
      item.className = "sheetwrite-panel-field-item";
      item.draggable = true;
      if (used.has(field.index)) item.dataset.used = "";
      const name = document.createElement("span");
      name.className = "sheetwrite-panel-field-name";
      name.textContent = header(field.index);
      const badge = document.createElement("span");
      badge.className = "sheetwrite-panel-badge";
      badge.textContent = TYPE_BADGES[field.type];
      const menu = menuButton(
        `${header(field.index)} field actions`,
        `field-${field.index}-menu`,
        () =>
          PIVOT_AREAS.map(([area, label]) => ({
            label: `Add to ${label}`,
            disabled: area !== "values" && areaFields(pivot, area).includes(field.index),
            run: () => move(pivot, fields, field.index, area, null),
          })),
        lifetime.signal,
      );
      item.append(name, badge, menu);
      item.addEventListener("dragstart", (event) => {
        drag = { field: field.index, from: null };
        event.dataTransfer?.setData("text/plain", field.header);
      });
      item.addEventListener("dragend", () => {
        drag = null;
      });
      fieldList.appendChild(item);
    }
    fieldList.addEventListener("dragover", (event) => {
      if (drag?.from !== null && drag !== null) event.preventDefault();
    });
    fieldList.addEventListener("drop", (event) => {
      const source = drag;
      drag = null;
      if (source?.from == null) return;
      event.preventDefault();
      commit(removeField(pivot, source.from));
    });
    fieldSection.appendChild(fieldList);
    target.appendChild(fieldSection);
    appendRelatedTables(target, pivot);

    for (const [area, label] of PIVOT_AREAS) {
      target.appendChild(
        areaSection(area, label, pivot, header, {
          dragState: () => drag,
          startDrag: (state) => {
            drag = state;
          },
          endDrag: () => {
            const state = drag;
            drag = null;
            return state;
          },
          move: (field, to, from, at) => move(pivot, fields, field, to, from, at),
          commit,
          distinctValues: (field) => distinctValues(pivot, field),
          signal: lifetime.signal,
        }),
      );
    }
  };

  /** Rebuild when the definition, its fields, the relationships or the message changed. */
  const refresh = (force = false): void => {
    const pivot = read();
    const signature = JSON.stringify([
      pivot,
      pivot === null ? [] : grid.getPivotFields(sheet, id),
      grid.store.getWorkbook().dataModel,
      message,
    ]);
    if (!force && signature === rendered) return;
    rendered = signature;
    rebuildPanel(body, build);
  };

  refresh(true);
  lifetime.add(grid.on("change", () => refresh()));
  return () => lifetime.close();
}

function note(text: string, alert = false): HTMLElement {
  const element = document.createElement("p");
  element.className = "sheetwrite-panel-note";
  element.textContent = text;
  if (alert) element.setAttribute("role", "alert");
  return element;
}

interface AreaActions {
  dragState(): DragState | null;
  startDrag(state: DragState): void;
  endDrag(): DragState | null;
  move(field: number, to: PivotArea, from: PivotPlacement | null, at?: number): void;
  commit(next: PivotDefinition, focusKey?: string): void;
  distinctValues(field: number): CellScalar[];
  /** The panel's signal; an open menu stops listening on the document when it aborts. */
  signal: AbortSignal;
}

function areaSection(
  area: PivotArea,
  label: string,
  pivot: PivotDefinition,
  header: (field: number) => string,
  actions: AreaActions,
): HTMLElement {
  const section = panelSection(label);
  const list = document.createElement("ul");
  list.className = "sheetwrite-panel-area";
  list.dataset.area = area;
  list.setAttribute("aria-label", label);

  const entries = areaFields(pivot, area);
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "sheetwrite-panel-area-empty";
    empty.textContent = EMPTY_AREA;
    list.appendChild(empty);
  }

  entries.forEach((field, index) => {
    const placement: PivotPlacement = { area, index };
    const item = document.createElement("li");
    item.className = "sheetwrite-panel-area-item";
    item.draggable = true;

    const name = document.createElement("span");
    name.className = "sheetwrite-panel-field-name";
    const value = area === "values" ? pivot.values[index] : undefined;
    const aggregation = AGGREGATION_LABELS.find(([key]) => key === value?.aggregation)?.[1];
    name.textContent =
      value?.name ??
      (aggregation === undefined ? header(field) : `${aggregation} of ${header(field)}`);
    item.appendChild(name);

    const menuItems = (): PanelMenuItem[] => [
      ...PIVOT_AREAS.map(([to, toLabel]) => ({
        label: `Move to ${toLabel}`,
        disabled: to === area,
        run: () => actions.move(field, to, placement),
      })),
      {
        label: "Move Up",
        disabled: index === 0,
        run: () =>
          actions.commit(shiftField(pivot, placement, -1, noFacts), `${area}-${index - 1}-menu`),
      },
      {
        label: "Move Down",
        disabled: index === entries.length - 1,
        run: () =>
          actions.commit(shiftField(pivot, placement, 1, noFacts), `${area}-${index + 1}-menu`),
      },
      { label: "Remove", run: () => actions.commit(removeField(pivot, placement)) },
    ];
    // The area is part of the name: a field can sit in two areas at once.
    const actionsLabel = `${name.textContent} in ${label} actions`;
    item.appendChild(menuButton(actionsLabel, `${area}-${index}-menu`, menuItems, actions.signal));

    if (area === "values") {
      const select = selectOf(AGGREGATION_LABELS, value?.aggregation ?? "SUM");
      select.className = "sheetwrite-panel-control";
      select.dataset.focusKey = `${area}-${index}-aggregation`;
      select.setAttribute("aria-label", `Summarize ${header(field)} by`);
      select.addEventListener("change", () => {
        const choice = AGGREGATION_LABELS.find(([key]) => key === select.value)?.[0];
        if (choice !== undefined) actions.commit(setAggregation(pivot, index, choice));
      });
      item.appendChild(select);
    } else if (area === "rows" || area === "columns") {
      const select = selectOf(
        SORT_OPTIONS,
        isDescending(pivot, area, field) ? "descending" : "ascending",
      );
      select.className = "sheetwrite-panel-control";
      select.dataset.focusKey = `${area}-${index}-sort`;
      select.setAttribute("aria-label", `Sort ${header(field)}`);
      select.addEventListener("change", () =>
        actions.commit(setSortOrder(pivot, area, field, select.value === "descending")),
      );
      item.appendChild(select);
    } else {
      item.appendChild(filterValues(pivot, index, field, header(field), actions));
    }

    item.addEventListener("dragstart", (event) => {
      actions.startDrag({ field, from: placement });
      event.dataTransfer?.setData("text/plain", header(field));
    });
    item.addEventListener("dragend", () => actions.endDrag());
    list.appendChild(item);
  });

  list.addEventListener("dragover", (event) => {
    if (actions.dragState() !== null) event.preventDefault();
  });
  list.addEventListener("drop", (event) => {
    const state = actions.endDrag();
    if (state === null) return;
    event.preventDefault();

    // Insert before the first entry whose middle is below the pointer.
    const items = [...list.querySelectorAll<HTMLElement>(".sheetwrite-panel-area-item")];
    let at = items.findIndex((item) => {
      const rect = item.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    if (at === -1) at = items.length;
    // The entry leaves its place first, so later slots move up by one.
    if (state.from?.area === area && state.from.index < at) at -= 1;
    actions.move(state.field, area, state.from, at);
  });

  section.appendChild(list);
  return section;
}

/** Up and Down keep an entry in its area, so it needs no type or values. */
const noFacts: FieldFacts = { type: undefined, distinctValues: () => [] };

/** The keep-list of one filter as checkboxes; each toggle is one change. */
function filterValues(
  pivot: PivotDefinition,
  index: number,
  field: number,
  header: string,
  actions: AreaActions,
): HTMLElement {
  const kept = pivot.filters?.[index]?.values ?? [];
  const keptSet = new Set(kept);
  const all = [...new Set([...actions.distinctValues(field), ...kept])].sort(compareScalars);

  const details = document.createElement("details");
  details.className = "sheetwrite-panel-filter";
  const summary = document.createElement("summary");
  summary.textContent = `${keptSet.size} of ${all.length} shown`;
  summary.dataset.focusKey = `filters-${index}-values`;
  details.appendChild(summary);

  const group = document.createElement("div");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", `Values of ${header} to show`);
  all.forEach((value, position) => {
    const label = document.createElement("label");
    label.className = "sheetwrite-panel-check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = keptSet.has(value);
    box.dataset.focusKey = `filters-${index}-value-${position}`;
    box.addEventListener("change", () => {
      const next = box.checked ? [...kept, value] : kept.filter((candidate) => candidate !== value);
      actions.commit(setFilterValues(pivot, index, next), box.dataset.focusKey);
    });
    label.append(box, scalarLabel(value));
    group.appendChild(label);
  });
  details.appendChild(group);
  return details;
}
