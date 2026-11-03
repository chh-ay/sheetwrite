import { colToA1 } from "../a1.js";
import { formulaNameKey } from "../name-key.js";
import type { Range } from "../types/coordinates.js";
import type { DocumentOp, NamedRangeSnapshot } from "../types/document.js";
import type { Grid, GridPanel } from "../types/grid.js";
import { selectionRange } from "./chart-model.js";
import { panelField, panelSection, rejectionMessage, selectOf } from "./panel-dom.js";

function absoluteFormula(grid: Grid, range: Range): string {
  const sheet = grid.store.getWorkbook().sheets.find((sheet) => sheet.id === range.sheet);
  if (sheet === undefined) return "=#REF!";
  const start = `$${colToA1(range.start.col)}$${range.start.row + 1}`;
  const end = `$${colToA1(range.end.col)}$${range.end.row + 1}`;
  return `='${sheet.name.replaceAll("'", "''")}'!${start}:${end}`;
}

function textInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  return input;
}

function button(label: string, run: () => void): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  control.addEventListener("click", run);
  return control;
}

/** Changes use document transactions, so the normal history and sync paths own them. */
export function namePanel(grid: Grid, define = false): GridPanel {
  return {
    title: "Name Manager",
    render(body) {
      const list = panelSection("Defined names");
      const entries = document.createElement("div");
      list.append(entries);
      const editor = panelSection("Define name");
      const form = document.createElement("form");
      const name = panelField("Name", textInput(), "defined-name");
      const scope = panelField("Scope", selectOf([], ""), "name-scope");
      const formula = panelField("Refers to", textInput(), "name-formula");
      let editing: NamedRangeSnapshot | undefined;

      const reset = (): void => {
        editing = undefined;
        name.control.value = "";
        scope.control.value = "";
        formula.control.value = "=";
        formula.setError(null);
        name.control.focus();
      };
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "sheetwrite-panel-control";
      save.textContent = "Save";
      save.dataset.focusKey = "save-name";
      form.append(name.element, scope.element, formula.element, save, button("New name", reset));
      editor.append(form);
      const note = document.createElement("p");
      note.className = "sheetwrite-panel-note";
      note.textContent =
        "Relative references are based on A1. Named LAMBDAs require the full engine and allow 64 nested calls.";
      body.append(list, editor, note);

      const draw = (): void => {
        const workbook = grid.store.getWorkbook();
        const selectedScope = scope.control.value;
        const options = selectOf(
          [
            ["", "Workbook"],
            ...workbook.sheets.map((sheet): [string, string] => [sheet.id, sheet.name]),
          ],
          selectedScope,
        );
        scope.control.replaceChildren(...options.childNodes);
        scope.control.value = selectedScope;
        entries.replaceChildren();
        for (const definition of workbook.namedRanges ?? []) {
          const scopeLabel =
            definition.scope === undefined
              ? "Workbook"
              : (workbook.sheets.find((sheet) => sheet.id === definition.scope)?.name ??
                definition.scope);
          const label = `${definition.name} (${scopeLabel})`;
          const definitionSource =
            definition.range === undefined
              ? definition.formula
              : absoluteFormula(grid, definition.range);
          const row = panelSection(label);
          const source = document.createElement("code");
          source.className = "sheetwrite-explain-formula";
          source.textContent = definitionSource;
          const edit = button("Edit", () => {
            editing = definition;
            name.control.value = definition.name;
            scope.control.value = definition.scope ?? "";
            formula.control.value = definitionSource;
            formula.setError(null);
            name.control.focus();
          });
          edit.setAttribute("aria-label", `Edit ${label}`);
          const remove = button("Delete", () => {
            const result = grid.applyTransaction({
              patches: [
                {
                  op: "removeNamedRange",
                  name: definition.name,
                  ...(definition.scope === undefined ? {} : { scope: definition.scope }),
                },
              ],
            });
            formula.setError(rejectionMessage(result));
          });
          remove.setAttribute("aria-label", `Delete ${label}`);
          row.append(source, edit, remove);
          entries.append(row);
        }
      };
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const nextName = name.control.value.trim();
        const nextScope = scope.control.value || undefined;
        const source = formula.control.value.trim();
        if (nextName === "" || source === "" || source === "=") {
          formula.setError("Enter a name and a formula or reference.");
          return;
        }
        const sameIdentity = (definition: NamedRangeSnapshot): boolean =>
          formulaNameKey(definition.name) === formulaNameKey(nextName) &&
          definition.scope === nextScope;
        const collision = grid.store.getWorkbook().namedRanges?.find(sameIdentity);
        if (collision !== undefined && (editing === undefined || !sameIdentity(editing))) {
          formula.setError("A name already exists in this scope. Edit that name instead.");
          return;
        }
        const definition: NamedRangeSnapshot = {
          name: nextName,
          ...(nextScope === undefined ? {} : { scope: nextScope }),
          formula: source.startsWith("=") ? source : `=${source}`,
        };
        const patches: DocumentOp[] = [];
        if (editing !== undefined && !sameIdentity(editing)) {
          patches.push({
            op: "removeNamedRange",
            name: editing.name,
            ...(editing.scope === undefined ? {} : { scope: editing.scope }),
          });
        }
        patches.push({ op: "setNamedRange", namedRange: definition });
        const message = rejectionMessage(grid.applyTransaction({ patches }));
        formula.setError(message);
        if (message === null) editing = definition;
      });
      draw();
      const range = define
        ? selectionRange(grid.getSelection(), grid.store.getWorkbook().sheets)
        : null;
      formula.control.value = range === null ? "=" : absoluteFormula(grid, range);
      return grid.on("change", draw);
    },
  };
}
