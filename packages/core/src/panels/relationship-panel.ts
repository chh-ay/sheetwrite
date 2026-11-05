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
function statusText(status: RelationshipStatus): string {
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

function controlButton(label: string, run: () => void, focusKey?: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  if (focusKey !== undefined) control.dataset.focusKey = focusKey;
  control.addEventListener("click", run);
  return control;
}

/** `Table[Column]` for one side of a relationship. */
function columnLabel(tables: readonly WorkbookTable[], tableId: string, columnId: string): string {
  const table = tables.find((candidate) => candidate.id === tableId);
  const column = table?.columns.find((candidate) => candidate.id === columnId);
  return `${table?.name ?? tableId}[${column?.name ?? columnId}]`;
}

/** The first `relationship-N` ID that no relationship uses. */
function nextRelationshipId(relationships: readonly TableRelationship[]): string {
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
      const tablesSection = panelSection("Tables");
      const tableList = document.createElement("ul");
      tablesSection.append(tableList);

      const listSection = panelSection("Relationships");
      const entries = document.createElement("div");
      listSection.append(entries);

      const editorSection = panelSection("Relationship");
      const form = document.createElement("form");
      const fromTable = panelField("Data table", selectOf([], ""), "from-table");
      const fromColumn = panelField("Key column", selectOf([], ""), "from-column");
      const toTable = panelField("Lookup table", selectOf([], ""), "to-table");
      const toColumn = panelField("Key column", selectOf([], ""), "to-column");
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
      const fillColumns = (table: HTMLSelectElement, column: HTMLSelectElement): void => {
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

      const fillTables = (): void => {
        const options = tables().map((table): [string, string] => [table.id, table.name]);
        for (const picker of [fromTable.control, toTable.control]) {
          const value = options.some(([id]) => id === picker.value)
            ? picker.value
            : (options[0]?.[0] ?? "");
          picker.replaceChildren(...selectOf(options, value).childNodes);
          picker.value = value;
        }
        if (toTable.control.value === fromTable.control.value && options[1] !== undefined) {
          toTable.control.value = options[1][0];
        }
        fillColumns(fromTable.control, fromColumn.control);
        fillColumns(toTable.control, toColumn.control);
      };

      const edit = (relationship: TableRelationship | undefined): void => {
        editing = relationship?.id;
        if (relationship !== undefined) {
          fromTable.control.value = relationship.from.table;
          fillColumns(fromTable.control, fromColumn.control);
          fromColumn.control.value = relationship.from.column;
          toTable.control.value = relationship.to.table;
          fillColumns(toTable.control, toColumn.control);
          toColumn.control.value = relationship.to.column;
        }
        toColumn.setError(null);
        fromTable.control.focus();
      };

      fromTable.control.addEventListener("change", () =>
        fillColumns(fromTable.control, fromColumn.control),
      );
      toTable.control.addEventListener("change", () =>
        fillColumns(toTable.control, toColumn.control),
      );
      form.append(
        fromTable.element,
        fromColumn.element,
        toTable.element,
        toColumn.element,
        save,
        controlButton("New relationship", () => edit(undefined), "new-relationship"),
      );
      editorSection.append(form);
      body.append(tablesSection, listSection, editorSection);

      const draw = (): void => {
        const workbookTables = tables();
        tableList.replaceChildren(
          ...workbookTables.map((table) => {
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
          const label = `${columnLabel(workbookTables, relationship.from.table, relationship.from.column)} → ${columnLabel(workbookTables, relationship.to.table, relationship.to.column)}`;
          const row = panelSection(label);
          const status = document.createElement("p");
          status.className = "sheetwrite-panel-note";
          status.textContent = statusText(
            engine?.getRelationshipStatus(relationship.id) ?? { status: "unavailable" },
          );
          const change = controlButton("Edit", () => edit(relationship));
          change.setAttribute("aria-label", `Edit ${label}`);
          const remove = controlButton("Delete", () => {
            const result = grid.applyTransaction({
              patches: [{ op: "removeRelationship", id: relationship.id }],
            });
            toColumn.setError(rejectionMessage(result));
          });
          remove.setAttribute("aria-label", `Delete ${label}`);
          row.append(status, change, remove);
          entries.append(row);
        }
        fillTables();
      };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const relationship: TableRelationship = {
          id: editing ?? nextRelationshipId(relationships()),
          from: { table: fromTable.control.value, column: fromColumn.control.value },
          to: { table: toTable.control.value, column: toColumn.control.value },
        };
        if (relationship.from.table === relationship.to.table) {
          toColumn.setError("Choose two different tables.");
          return;
        }
        const patch: DocumentOp = { op: "setRelationship", relationship };
        const message = rejectionMessage(grid.applyTransaction({ patches: [patch] }));
        if (message !== null) {
          toColumn.setError("Each pair of tables can have one relationship, without a cycle.");
          return;
        }

        // As in Excel, the panel does not keep a relationship whose keys
        // cannot resolve; the API admits one, because cells change later.
        const status = storeEngine(grid.store)?.getRelationshipStatus(relationship.id);
        if (status !== undefined && status.status !== "ok" && status.status !== "unavailable") {
          grid.undo();
          toColumn.setError(statusText(status));
          return;
        }

        toColumn.setError(null);
        editing = relationship.id;
      });

      draw();
      return grid.on("change", draw);
    },
  };
}
