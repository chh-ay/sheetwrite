// Data › Data Tools › Measures: the workbook's measures under their home
// tables, each with its status, and a form that edits one measure through
// `setMeasure` and `removeMeasure`, so undo, sync and the admission rules
// (unique names, an existing home table) apply.

import type { Measure, MeasureStatus } from "../types/data-model.js";
import type { Grid, GridPanel } from "../types/grid.js";
import type { WorkbookTable } from "../types/table.js";
import { panelField, panelSection, rejectionMessage, selectOf } from "./panel-dom.js";

const NEEDS_NAME_AND_FORMULA = "Enter a name and a formula.";
const NEEDS_TABLE = "Measures need a workbook table.";

/** What a measure's status means to a user; null when it is ok. */
export function measureStatusText(status: MeasureStatus): string | null {
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

/** The first `measure-N` ID that no measure uses. */
export function nextMeasureId(measures: readonly Measure[]): string {
  const ids = new Set(measures.map((measure) => measure.id));
  let index = 1;
  while (ids.has(`measure-${index}`)) index += 1;
  return `measure-${index}`;
}

/**
 * The measures of each table that holds some, in table order, then the
 * measures whose table is gone, under a null table.
 */
export function measuresByTable(
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

/** A measure formula as saved: with its leading `=`. */
export function measureFormula(text: string): string {
  const source = text.trim();
  return source.startsWith("=") ? source : `=${source}`;
}

function button(label: string, run: () => void, focusKey?: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  if (focusKey !== undefined) control.dataset.focusKey = focusKey;
  control.addEventListener("click", run);
  return control;
}

function textInput(): HTMLInputElement {
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
      const listSection = panelSection("Measures");
      const entries = document.createElement("div");
      listSection.append(entries);

      const editorSection = panelSection("Measure");
      const form = document.createElement("form");
      const name = panelField("Name", textInput(), "measure-name");
      const table = panelField("Table", selectOf([], ""), "measure-table");
      const formula = panelField("Formula", textInput(), "measure-formula");
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
      editorSection.append(form);

      const note = document.createElement("p");
      note.className = "sheetwrite-panel-note";
      note.hidden = true;
      body.append(listSection, editorSection, note);

      /** The ID of the measure the form edits; null for a new one. */
      let editing: string | null = null;
      // `SheetwriteStore` reports each measure's status; another store shows none.
      const store = grid.store as { getMeasureStatus?: (id: string) => MeasureStatus };

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
        const nextName = name.control.value.trim();
        const source = formula.control.value.trim();
        if (nextName === "" || source === "" || source === "=") {
          formula.setError(NEEDS_NAME_AND_FORMULA);
          return;
        }
        if (table.control.value === "") {
          formula.setError(NEEDS_TABLE);
          return;
        }
        const measure: Measure = {
          id: editing ?? nextMeasureId(grid.store.getWorkbook().dataModel?.measures ?? []),
          name: nextName,
          table: table.control.value,
          formula: measureFormula(source),
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

        const groups = measuresByTable(workbook.dataModel?.measures ?? [], current);
        entries.replaceChildren();
        if (groups.length === 0) {
          const empty = document.createElement("p");
          empty.className = "sheetwrite-panel-note";
          empty.textContent = "No measures yet. Name a formula over table columns below.";
          entries.append(empty);
        }
        for (const [home, own] of groups) {
          const heading = document.createElement("h4");
          heading.className = "sheetwrite-panel-label";
          heading.textContent = home?.name ?? "Removed table";
          const list = document.createElement("ul");
          list.className = "sheetwrite-panel-fields";
          list.setAttribute("aria-label", `${home?.name ?? "Removed table"} measures`);
          for (const measure of own) {
            const item = document.createElement("li");
            item.className = "sheetwrite-panel-field-item";
            const label = document.createElement("span");
            label.className = "sheetwrite-panel-field-name";
            label.textContent = measure.name;
            const source = document.createElement("code");
            source.className = "sheetwrite-explain-formula";
            source.textContent = measure.formula;
            item.append(label, source);
            const status = measureStatusText(
              store.getMeasureStatus?.(measure.id) ?? { status: "ok" },
            );
            if (status !== null) {
              const warning = document.createElement("span");
              warning.className = "sheetwrite-panel-error";
              warning.textContent = status;
              item.append(warning);
            }
            item.append(
              button("Edit", () => edit(measure), `edit-${measure.id}`),
              button("Remove", () => remove(measure), `remove-${measure.id}`),
            );
            list.append(item);
          }
          entries.append(heading, list);
        }
      };

      edit(null);
      show();
      return grid.on("change", show);
    },
  };
}
