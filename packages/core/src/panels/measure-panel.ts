// Data › Data Tools › Measures: the workbook's measures under their home
// tables, each with its status, and a form that edits one measure through
// `setMeasure` and `removeMeasure`, so undo, sync and the admission rules
// (unique names, an existing home table) apply.

import type { SheetwriteStore } from "../store.js";
import type { Measure, MeasureStatus } from "../types/data-model.js";
import type { Grid, GridPanel } from "../types/grid.js";
import type { Store } from "../types/store.js";
import type { WorkbookTable } from "../types/table.js";
import { panelField, panelSection, rejectionMessage, selectOf } from "./panel-dom.js";

const NEEDS_NAME_AND_FORMULA = "Enter a name and a formula.";
const NEEDS_TABLE = "Measures need a workbook table.";

/** What a measure's status means to a user; null when it is ok. */
function measure_status_text(status: MeasureStatus): string | null {
  switch (status.status) {
    case "ok":
      return null;
    case "syntax":
      return "The formula has a syntax error.";
    case "missingTable":
      return "Its table was removed.";
    case "unavailable":
      return "This measure no longer exists.";
  }
}

/**
 * Whether `store` reports each measure's status, as `SheetwriteStore` does.
 * It checks the method instead of the class, so the panel's lazy chunk does
 * not import the store module.
 */
function reports_measure_status(
  store: Store,
): store is Store & Pick<SheetwriteStore, "getMeasureStatus"> {
  return "getMeasureStatus" in store && typeof store.getMeasureStatus === "function";
}

/** The first `measure-N` ID that no measure uses. */
function next_measure_id(measures: readonly Measure[]): string {
  const ids = new Set(measures.map((measure) => measure.id));
  let index = 1;
  while (ids.has(`measure-${index}`)) index += 1;
  return `measure-${index}`;
}

/**
 * The measures of each table that holds some, in table order, then the
 * measures whose table is gone, under a null table.
 */
function measures_by_table(
  measures: readonly Measure[],
  tables: readonly WorkbookTable[],
): Array<[WorkbookTable | null, Measure[]]> {
  const groups: Array<[WorkbookTable | null, Measure[]]> = [];
  for (const table of tables) {
    const own = measures.filter((measure) => measure.table === table.id);
    if (own.length > 0) groups.push([table, own]);
  }
  const orphans = measures.filter((measure) => !tables.some((table) => table.id === measure.table));
  if (orphans.length > 0) groups.push([null, orphans]);
  return groups;
}

function button(label: string, run: () => void, focus_key?: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  if (focus_key !== undefined) control.dataset.focusKey = focus_key;
  control.addEventListener("click", run);
  return control;
}

function text_input(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "sheetwrite-panel-input";
  input.spellcheck = false;
  return input;
}

/** The Measures panel. Selecting Edit loads a measure into the form; New measure clears it. */
export function measurePanel(grid: Grid): GridPanel {
  return {
    title: "Measures",
    render(body) {
      const list_section = panelSection("Measures");
      const entries = document.createElement("div");
      list_section.append(entries);

      const editor_section = panelSection("Measure");
      const form = document.createElement("form");
      const name = panelField("Name", text_input(), "measure-name");
      const table = panelField("Table", selectOf([], ""), "measure-table");
      const formula = panelField("Formula", text_input(), "measure-formula");
      formula.control.classList.add("sheetwrite-explain-formula");
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "sheetwrite-panel-control";
      save.textContent = "Save measure";
      form.append(
        name.element,
        table.element,
        formula.element,
        save,
        button("New measure", () => edit(null), "new-measure"),
      );
      editor_section.append(form);

      const note = document.createElement("p");
      note.className = "sheetwrite-panel-note";
      note.hidden = true;
      body.append(list_section, editor_section, note);

      /** The ID of the measure the form edits; null for a new one. */
      let editing: string | null = null;
      // Another store than `SheetwriteStore` shows no status.
      const store = reports_measure_status(grid.store) ? grid.store : null;

      const edit = (measure: Measure | null): void => {
        editing = measure?.id ?? null;
        name.control.value = measure?.name ?? "";
        formula.control.value = measure?.formula ?? "=";
        if (measure !== null) table.control.value = measure.table;
        name.setError(null);
        formula.setError(null);
        name.control.focus();
      };

      const remove = (measure: Measure): void => {
        const result = grid.applyTransaction({
          patches: [{ op: "removeMeasure", id: measure.id }],
        });
        note.textContent = rejectionMessage(result) ?? "";
        note.hidden = note.textContent === "";
        if (editing === measure.id) edit(null);
      };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const next_name = name.control.value.trim();
        const source = formula.control.value.trim();
        if (next_name === "" || source === "" || source === "=") {
          formula.setError(NEEDS_NAME_AND_FORMULA);
          return;
        }
        if (table.control.value === "") {
          formula.setError(NEEDS_TABLE);
          return;
        }
        const measure: Measure = {
          id: editing ?? next_measure_id(grid.store.getWorkbook().dataModel?.measures ?? []),
          name: next_name,
          table: table.control.value,
          // Saved formulas keep their leading `=`.
          formula: source.startsWith("=") ? source : `=${source}`,
        };
        const message = rejectionMessage(
          grid.applyTransaction({ patches: [{ op: "setMeasure", measure }] }),
        );
        formula.setError(message);
        if (message === null) editing = measure.id;
      });

      const show = (): void => {
        const workbook = grid.store.getWorkbook();
        const current = workbook.sheets.flatMap((sheet) => sheet.tables ?? []);
        const options = current.map((candidate): [string, string] => [
          candidate.id,
          candidate.name,
        ]);
        const value = options.some(([id]) => id === table.control.value)
          ? table.control.value
          : (options[0]?.[0] ?? "");
        table.control.replaceChildren(...selectOf(options, value).childNodes);
        table.control.value = value;

        const groups = measures_by_table(workbook.dataModel?.measures ?? [], current);
        entries.replaceChildren();
        if (groups.length === 0) {
          const empty = document.createElement("p");
          empty.className = "sheetwrite-panel-note";
          empty.textContent = "No measures yet. Name a formula over table columns below.";
          entries.append(empty);
        }
        for (const [home, own] of groups) {
          for (const measure of own) {
            // A measure is named by its home table, as Excel's Manage Measures lists them.
            const label = `${home?.name ?? "Removed table"} › ${measure.name}`;
            const row = panelSection(label);
            const source = document.createElement("p");
            source.className = "sheetwrite-explain-formula";
            source.textContent = measure.formula;
            row.append(source);
            const status = measure_status_text(
              store?.getMeasureStatus(measure.id) ?? { status: "ok" },
            );
            if (status !== null) {
              const warning = document.createElement("p");
              warning.className = "sheetwrite-panel-note";
              warning.textContent = status;
              row.append(warning);
            }
            const change = button("Edit", () => edit(measure), `edit-${measure.id}`);
            change.setAttribute("aria-label", `Edit ${label}`);
            const removal = button("Remove", () => remove(measure), `remove-${measure.id}`);
            removal.setAttribute("aria-label", `Remove ${label}`);
            row.append(change, removal);
            entries.append(row);
          }
        }
      };

      edit(null);
      show();
      return grid.on("change", show);
    },
  };
}
