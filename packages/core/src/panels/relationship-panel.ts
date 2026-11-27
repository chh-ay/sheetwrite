// Data › Data Tools: the data model panel. It lists the workbook tables and
// their relationships with each relationship's key status, and edits
// relationships through document operations, so undo, sync and the
// admission rules (no cycle, one relationship per pair of tables) apply.

import { storeEngine } from "../store/engine-registry.js";
import type { RelationshipStatus, TableRelationship } from "../types/data-model.js";
import type { DocumentOp } from "../types/document.js";
import type { Grid, GridPanel } from "../types/grid.js";
import type { WorkbookTable } from "../types/table.js";
import { panelField, panelSection, rejectionMessage, selectOf } from "./panel-dom.js";

/** What `RelationshipStatus` means to a user; rows count from 1 below the header. */
function status_text(status: RelationshipStatus): string {
  switch (status.status) {
    case "ok":
      return status.unmatched === 0
        ? "Every key matches."
        : `${status.unmatched} keys match no row and show as blank.`;
    case "missingTable":
      return "A table was removed.";
    case "missingColumn":
      return "A column was removed.";
    case "typeMismatch":
      return `Key row ${status.row + 1} of the ${status.side === "to" ? "lookup" : "data"} table is not the same type as the other keys.`;
    case "duplicateKey":
      return `The lookup table repeats a key in rows ${status.rows[0] + 1} and ${status.rows[1] + 1}.`;
    case "unavailable":
      return "Key checks need the full engine.";
  }
}

function control_button(label: string, run: () => void, focus_key?: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  if (focus_key !== undefined) control.dataset.focusKey = focus_key;
  control.addEventListener("click", run);
  return control;
}

/** `Table[Column]` for one side of a relationship. */
function column_label(
  tables: readonly WorkbookTable[],
  table_id: string,
  column_id: string,
): string {
  const table = tables.find((candidate) => candidate.id === table_id);
  const column = table?.columns.find((candidate) => candidate.id === column_id);
  return `${table?.name ?? table_id}[${column?.name ?? column_id}]`;
}

/** The first `relationship-N` ID that no relationship uses. */
function next_relationship_id(relationships: readonly TableRelationship[]): string {
  const ids = new Set(relationships.map((relationship) => relationship.id));
  let index = 1;
  while (ids.has(`relationship-${index}`)) index += 1;
  return `relationship-${index}`;
}

/**
 * The data model panel. A form edits one relationship: the data (many) side
 * names the column that repeats keys, the lookup (one) side the column that
 * holds each key once, as in Excel's Create Relationship dialog.
 */
export function relationshipPanel(grid: Grid): GridPanel {
  return {
    title: "Data Model",
    render(body) {
      const tables_section = panelSection("Tables");
      const table_list = document.createElement("ul");
      tables_section.append(table_list);

      const list_section = panelSection("Relationships");
      const entries = document.createElement("div");
      list_section.append(entries);

      const editor_section = panelSection("Relationship");
      const form = document.createElement("form");
      const from_table = panelField("Data table", selectOf([], ""), "from-table");
      const from_column = panelField("Key column", selectOf([], ""), "from-column");
      const to_table = panelField("Lookup table", selectOf([], ""), "to-table");
      const to_column = panelField("Key column", selectOf([], ""), "to-column");
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "sheetwrite-panel-control";
      save.textContent = "Save";
      save.dataset.focusKey = "save-relationship";
      let editing: string | undefined;

      const tables = (): WorkbookTable[] =>
        grid.store.getWorkbook().sheets.flatMap((sheet) => sheet.tables ?? []);
      const relationships = (): TableRelationship[] =>
        grid.store.getWorkbook().dataModel?.relationships ?? [];

      /** Fill a column picker from the table that `table` selects, keeping a valid choice. */
      const fill_columns = (table: HTMLSelectElement, column: HTMLSelectElement): void => {
        const chosen = tables().find((candidate) => candidate.id === table.value);
        const options = (chosen?.columns ?? []).map((entry): [string, string] => [
          entry.id,
          entry.name,
        ]);
        const value = options.some(([id]) => id === column.value)
          ? column.value
          : (options[0]?.[0] ?? "");
        column.replaceChildren(...selectOf(options, value).childNodes);
        column.value = value;
      };

      const fill_tables = (): void => {
        const options = tables().map((table): [string, string] => [table.id, table.name]);
        for (const picker of [from_table.control, to_table.control]) {
          const value = options.some(([id]) => id === picker.value)
            ? picker.value
            : (options[0]?.[0] ?? "");
          picker.replaceChildren(...selectOf(options, value).childNodes);
          picker.value = value;
        }
        if (to_table.control.value === from_table.control.value && options[1] !== undefined) {
          to_table.control.value = options[1][0];
        }
        fill_columns(from_table.control, from_column.control);
        fill_columns(to_table.control, to_column.control);
      };

      const edit = (relationship: TableRelationship | undefined): void => {
        editing = relationship?.id;
        if (relationship !== undefined) {
          from_table.control.value = relationship.from.table;
          fill_columns(from_table.control, from_column.control);
          from_column.control.value = relationship.from.column;
          to_table.control.value = relationship.to.table;
          fill_columns(to_table.control, to_column.control);
          to_column.control.value = relationship.to.column;
        }
        to_column.setError(null);
        from_table.control.focus();
      };

      from_table.control.addEventListener("change", () =>
        fill_columns(from_table.control, from_column.control),
      );
      to_table.control.addEventListener("change", () =>
        fill_columns(to_table.control, to_column.control),
      );
      form.append(
        from_table.element,
        from_column.element,
        to_table.element,
        to_column.element,
        save,
        control_button("New relationship", () => edit(undefined), "new-relationship"),
      );
      editor_section.append(form);
      body.append(tables_section, list_section, editor_section);

      const draw = (): void => {
        const workbook_tables = tables();
        table_list.replaceChildren(
          ...workbook_tables.map((table) => {
            const item = document.createElement("li");
            const rows =
              table.range.end.row -
              table.range.start.row +
              1 -
              (table.headerRow ? 1 : 0) -
              (table.totalsRow ? 1 : 0);
            item.textContent = `${table.name}: ${table.columns.length} columns, ${rows} rows`;
            return item;
          }),
        );

        const engine = storeEngine(grid.store);
        entries.replaceChildren();
        if (relationships().length === 0) {
          const empty = document.createElement("p");
          empty.className = "sheetwrite-panel-note";
          empty.textContent = "No relationships yet. Pick two tables and their key columns below.";
          entries.append(empty);
        }
        for (const relationship of relationships()) {
          const label = `${column_label(workbook_tables, relationship.from.table, relationship.from.column)} → ${column_label(workbook_tables, relationship.to.table, relationship.to.column)}`;
          const row = panelSection(label);
          const status = document.createElement("p");
          status.className = "sheetwrite-panel-note";
          status.textContent = status_text(
            engine?.getRelationshipStatus(relationship.id) ?? { status: "unavailable" },
          );
          const change = control_button("Edit", () => edit(relationship));
          change.setAttribute("aria-label", `Edit ${label}`);
          const remove = control_button("Delete", () => {
            const result = grid.applyTransaction({
              patches: [{ op: "removeRelationship", id: relationship.id }],
            });
            to_column.setError(rejectionMessage(result));
          });
          remove.setAttribute("aria-label", `Delete ${label}`);
          row.append(status, change, remove);
          entries.append(row);
        }
        fill_tables();
      };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const relationship: TableRelationship = {
          id: editing ?? next_relationship_id(relationships()),
          from: { table: from_table.control.value, column: from_column.control.value },
          to: { table: to_table.control.value, column: to_column.control.value },
        };
        if (relationship.from.table === relationship.to.table) {
          to_column.setError("Choose two different tables.");
          return;
        }
        const patch: DocumentOp = { op: "setRelationship", relationship };
        const message = rejectionMessage(grid.applyTransaction({ patches: [patch] }));
        if (message !== null) {
          to_column.setError("Each pair of tables can have one relationship, without a cycle.");
          return;
        }

        // As in Excel, the panel does not keep a relationship whose keys
        // cannot resolve; the API admits one, because cells change later.
        // The engine reports key status only for a relationship in the
        // workbook, so the panel applies it first and undoes it on failure.
        const status = storeEngine(grid.store)?.getRelationshipStatus(relationship.id);
        if (status !== undefined && status.status !== "ok" && status.status !== "unavailable") {
          grid.undo();
          to_column.setError(status_text(status));
          return;
        }

        to_column.setError(null);
        editing = relationship.id;
      });

      draw();
      return grid.on("change", draw);
    },
  };
}
