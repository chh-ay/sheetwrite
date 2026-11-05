// Data › Queries & Connections and Data › Get Data (#227). The panel lists the
// saved queries and edits one at a time. It never runs a query itself: saving
// goes through the session's `define`, which checks the plan in the query
// engine first, and refresh goes through the session's host fetch callback.

import {
  onQueryCommandsChange,
  queryCommandsOf,
  queryRefreshRunning,
  toggleQueryRefresh,
} from "../query-commands.js";
import type { DocumentOp } from "../types/document.js";
import type { Grid, GridPanel } from "../types/grid.js";
import type { QueryStep, SavedQuery, SavedQuerySource } from "../types/query.js";
import { panelField, panelSection, rejectionMessage, selectOf } from "./panel-dom.js";
import {
  columnsAfter,
  columnsAfterStep,
  freshId,
  type ModelColumn,
  parseSourceColumns,
  parseStep,
  sourceColumnsText,
  STEP_KINDS,
  type StepKind,
  stepText,
} from "./query-model.js";
import { formatRangeText, parseRangeText } from "./range-text.js";

const SOURCE_KINDS: readonly (readonly [SavedQuerySource["kind"], string])[] = [
  ["csv", "CSV"],
  ["json", "JSON"],
  ["host", "Host data"],
];

const NO_SESSION = "Queries are not connected in this grid.";
const NO_NAME = "Enter a query name.";
const NO_SOURCE_ID = "Enter the source ID that the host fetch callback knows.";
const NO_TABLE_NAME = "Enter a table name for the output.";
const REFRESHED = "Queries refreshed.";
const REFRESHING = "Refreshing queries.";
const SAVED = "Query saved.";
const KEPT_IN_FILE =
  "It stays in the file unchanged while the saved queries are not edited; a change to the saved queries drops it on the next XLSX save.";

function button(label: string, run: () => void, focusKey?: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  if (focusKey !== undefined) control.dataset.focusKey = focusKey;
  control.addEventListener("click", run);
  return control;
}

function textInput(value = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.value = value;
  return input;
}

function note(text = ""): HTMLParagraphElement {
  const paragraph = document.createElement("p");
  paragraph.className = "sheetwrite-panel-note";
  paragraph.textContent = text;
  return paragraph;
}

/** One step row of the editor: a kind and its one-line text. */
interface StepRow {
  readonly kind: HTMLSelectElement;
  readonly text: HTMLInputElement;
  readonly error: HTMLParagraphElement;
}

function savedQueries(grid: Grid): readonly SavedQuery[] {
  return grid.store.getWorkbook().queries ?? [];
}

function outputText(grid: Grid, query: SavedQuery): string {
  const output = query.output;
  if (output === undefined) return "Connection only";
  const sheets = grid.store.getWorkbook().sheets;
  const anchor = formatRangeText(
    { sheet: output.anchor.sheet, start: output.anchor, end: output.anchor },
    sheets,
    "",
  );
  return `Table ${output.tableName} at ${anchor}`;
}

/** The panel; `create` opens it with an empty new-query form focused. */
export function queryPanel(grid: Grid, create: boolean): GridPanel {
  return {
    title: "Queries & Connections",
    render(body) {
      const status = note();
      status.setAttribute("role", "status");
      const cancel = button("Cancel refresh", () => void toggleQueryRefresh(grid, null));
      const refreshAll = button("Refresh All", () => refresh(null), "refresh-all");
      const statusSection = panelSection("Refresh");
      statusSection.append(refreshAll, cancel, status);

      const list = panelSection("Queries");
      const entries = document.createElement("div");
      list.append(entries);

      const kept = panelSection("Kept from the file");
      const keptEntries = document.createElement("div");
      kept.append(keptEntries);
      kept.hidden = true;

      const editor = panelSection("Query");
      const form = document.createElement("form");
      const name = panelField("Name", textInput(), "query-name");
      const kind = panelField("Source", selectOf(SOURCE_KINDS, "csv"), "query-source-kind");
      const sourceId = panelField("Source ID", textInput(), "query-source-id");
      const locator = panelField("Address (public, no credentials)", textInput(), "query-locator");
      const columnsArea = document.createElement("textarea");
      columnsArea.rows = 4;
      columnsArea.className = "sheetwrite-panel-control";
      columnsArea.dataset.focusKey = "query-columns";
      columnsArea.placeholder = "Region: text\nTotal: number";
      const columnsLabel = document.createElement("label");
      columnsLabel.className = "sheetwrite-panel-field";
      const columnsTitle = document.createElement("span");
      columnsTitle.className = "sheetwrite-panel-label";
      columnsTitle.textContent = "Columns (Name: type, one per line)";
      const columnsError = note();
      columnsLabel.append(columnsTitle, columnsArea, columnsError);

      const stepsList = document.createElement("ol");
      stepsList.className = "sheetwrite-query-steps";
      const stepsLabel = note("Steps run in order. Name columns as they are before each step.");
      const addStep = button("Add step", () => appendStep("filter", ""), "query-add-step");

      const load = document.createElement("input");
      load.type = "checkbox";
      load.checked = true;
      load.dataset.focusKey = "query-load";
      const loadLabel = document.createElement("label");
      loadLabel.className = "sheetwrite-panel-field";
      loadLabel.append(load, document.createTextNode(" Load to a table"));
      const tableName = panelField("Table name", textInput(), "query-table-name");
      const anchor = panelField("Top-left cell", textInput("A1"), "query-anchor");

      const save = document.createElement("button");
      save.type = "submit";
      save.className = "sheetwrite-panel-control";
      save.textContent = "Save";
      save.dataset.focusKey = "query-save";
      const formError = note();
      formError.setAttribute("role", "alert");
      form.append(
        name.element,
        kind.element,
        sourceId.element,
        locator.element,
        columnsLabel,
        stepsLabel,
        stepsList,
        addStep,
        loadLabel,
        tableName.element,
        anchor.element,
        save,
        button("New query", () => edit(undefined), "query-new"),
        formError,
      );
      editor.append(form);
      body.append(statusSection, list, kept, editor);

      let editing: SavedQuery | undefined;
      let rows: StepRow[] = [];

      const showStatus = (): void => {
        const running = queryRefreshRunning(grid);
        cancel.hidden = !running;
        refreshAll.hidden = running;
        if (running) status.textContent = REFRESHING;
      };

      const refresh = (ids: readonly string[] | null): void => {
        if (queryRefreshRunning(grid)) return;
        void toggleQueryRefresh(grid, ids).then((outcome) => {
          status.textContent = outcome ?? REFRESHED;
        });
      };

      const appendStep = (stepKind: StepKind, text: string): void => {
        const item = document.createElement("li");
        const kindSelect = selectOf(
          STEP_KINDS.map(([value, label]) => [value, label] as const),
          stepKind,
        );
        kindSelect.className = "sheetwrite-panel-control";
        kindSelect.setAttribute("aria-label", "Step kind");
        const input = textInput(text);
        input.className = "sheetwrite-panel-control";
        input.setAttribute("aria-label", "Step");
        const hint = (): void => {
          input.placeholder = STEP_KINDS.find(([value]) => value === kindSelect.value)?.[2] ?? "";
        };
        kindSelect.addEventListener("change", hint);
        hint();
        const error = note();
        const row: StepRow = { kind: kindSelect, text: input, error };
        const move = (offset: number): void => {
          const index = rows.indexOf(row);
          const target = index + offset;
          if (target < 0 || target >= rows.length) return;
          rows.splice(index, 1);
          rows.splice(target, 0, row);
          const sibling = stepsList.children[offset < 0 ? target : target + 1] ?? null;
          stepsList.insertBefore(item, sibling);
          input.focus();
        };
        item.append(
          kindSelect,
          input,
          button("Move up", () => move(-1)),
          button("Move down", () => move(1)),
          button("Remove step", () => {
            rows = rows.filter((candidate) => candidate !== row);
            item.remove();
          }),
          error,
        );
        rows.push(row);
        stepsList.append(item);
      };

      const edit = (query: SavedQuery | undefined): void => {
        editing = query;
        formError.textContent = "";
        columnsError.textContent = "";
        name.setError(null);
        sourceId.setError(null);
        tableName.setError(null);
        anchor.setError(null);
        name.control.value = query?.name ?? "";
        kind.control.value = query?.source.kind ?? "csv";
        sourceId.control.value = query?.source.sourceId ?? "";
        locator.control.value =
          query !== undefined && query.source.kind !== "host" ? (query.source.locator ?? "") : "";
        columnsArea.value = query === undefined ? "" : sourceColumnsText(query.source.columns);
        stepsList.replaceChildren();
        rows = [];
        if (query !== undefined) {
          const queries = savedQueries(grid);
          query.steps.forEach((step, index) => {
            appendStep(step.kind, stepText(step, columnsAfter(query, queries, index), queries));
          });
        }
        load.checked = query === undefined || query.output !== undefined;
        tableName.control.value = query?.output?.tableName ?? "";
        const sheets = grid.store.getWorkbook().sheets;
        const output = query?.output;
        anchor.control.value =
          output === undefined
            ? "A1"
            : formatRangeText(
                { sheet: output.anchor.sheet, start: output.anchor, end: output.anchor },
                sheets,
                "",
              );
        name.control.focus();
      };

      const syncKind = (): void => {
        locator.element.hidden = kind.control.value === "host";
      };
      kind.control.addEventListener("change", syncKind);
      const syncLoad = (): void => {
        tableName.element.hidden = !load.checked;
        anchor.element.hidden = !load.checked;
      };
      load.addEventListener("change", syncLoad);

      /** Builds the definition from the form, or shows why it cannot. */
      const definition = (): SavedQuery | undefined => {
        const queries = savedQueries(grid);
        const queryName = name.control.value.trim();
        name.setError(queryName === "" ? NO_NAME : null);
        const id = sourceId.control.value.trim();
        sourceId.setError(id === "" ? NO_SOURCE_ID : null);
        const columns = parseSourceColumns(columnsArea.value, editing?.source.columns);
        columnsError.textContent = "error" in columns ? columns.error : "";
        if (queryName === "" || id === "" || "error" in columns) return undefined;

        const queryId =
          editing?.id ?? freshId(queryName, new Set(queries.map((query) => query.id)));
        const address = locator.control.value.trim();
        const sourceKind = SOURCE_KINDS.find(([value]) => value === kind.control.value)?.[0];
        let source: SavedQuerySource;
        if (sourceKind === "host" || sourceKind === undefined) {
          source = { kind: "host", sourceId: id, columns: columns.value };
        } else {
          // Options the form does not show stay as they were saved.
          const previous = editing?.source.kind === sourceKind ? editing.source : undefined;
          const options =
            previous === undefined ? {} : (({ locator: _locator, ...rest }) => rest)(previous);
          source = {
            ...options,
            kind: sourceKind,
            sourceId: id,
            columns: columns.value,
            ...(address === "" ? {} : { locator: address }),
          };
        }

        const steps: QueryStep[] = [];
        let schema: ModelColumn[] = columns.value.map(({ id: columnId, name: columnName }) => ({
          id: columnId,
          name: columnName,
        }));
        let valid = true;
        for (const row of rows) {
          const stepKind = STEP_KINDS.find(([value]) => value === row.kind.value)?.[0] ?? "filter";
          const parsed = parseStep(stepKind, row.text.value, schema, queries, queryId);
          row.error.textContent = "error" in parsed ? parsed.error : "";
          if ("error" in parsed) {
            valid = false;
            continue;
          }
          steps.push(parsed.value);
          schema = columnsAfterStep(schema, parsed.value, queries);
        }
        if (!valid) return undefined;

        const base: SavedQuery = { id: queryId, name: queryName, source, steps };
        if (!load.checked) return base;

        const table = tableName.control.value.trim();
        tableName.setError(table === "" ? NO_TABLE_NAME : null);
        const workbook = grid.store.getWorkbook();
        const sheet = grid.getActiveSheet();
        const cell = parseRangeText(anchor.control.value, workbook.sheets, sheet);
        anchor.setError("error" in cell ? cell.error : null);
        if (table === "" || "error" in cell) return undefined;

        const tables = workbook.sheets.flatMap((candidate) => candidate.tables ?? []);
        const tableId =
          editing?.output?.table ??
          freshId(`query-${queryId}`, new Set(tables.map((candidate) => candidate.id)));
        return {
          ...base,
          output: {
            table: tableId,
            tableName: table,
            anchor: { sheet: cell.range.sheet, ...cell.range.start },
          },
        };
      };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const commands = queryCommandsOf(grid);
        if (commands === undefined) {
          formError.textContent = NO_SESSION;
          return;
        }
        const query = definition();
        if (query === undefined) return;
        const message = commands.define(query);
        formError.textContent = message ?? SAVED;
        if (message === null) editing = query;
      });

      const remove = (query: SavedQuery): void => {
        const patches: DocumentOp[] = [{ op: "removeQuery", id: query.id }];
        const message = rejectionMessage(grid.applyTransaction({ patches }));
        status.textContent = message ?? `Removed ${query.name}; its table values stay.`;
        if (message === null && editing?.id === query.id) edit(undefined);
      };

      const selectOutput = (query: SavedQuery): void => {
        const output = query.output;
        if (output === undefined) return;
        const table = grid.store
          .getWorkbook()
          .sheets.flatMap((sheet) => sheet.tables ?? [])
          .find((candidate) => candidate.id === output.table);
        if (table === undefined) return;
        grid.setActiveSheet(table.range.sheet);
        grid.setSelection({ kind: "range", range: table.range });
      };

      const draw = (): void => {
        entries.replaceChildren();
        const queries = savedQueries(grid);
        if (queries.length === 0) entries.append(note("No saved queries yet."));
        for (const query of queries) {
          const row = document.createElement("div");
          row.className = "sheetwrite-query-row";
          const title = document.createElement("strong");
          title.textContent = query.name;
          const detail = note(
            `${query.source.kind.toUpperCase()} source · ${outputText(grid, query)}`,
          );
          row.append(
            title,
            detail,
            button("Refresh", () => refresh([query.id])),
            button("Edit", () => edit(query)),
            ...(query.output === undefined
              ? []
              : [button("Select output", () => selectOutput(query))]),
            button("Remove", () => remove(query)),
          );
          entries.append(row);
        }
        showStatus();
      };

      // Unsupported members come from the codec, which reads the kept part.
      const unsupportedRequest = queryCommandsOf(grid)?.unsupported();
      void unsupportedRequest?.then((members) => {
        keptEntries.replaceChildren(
          ...members.map((member) => {
            const row = document.createElement("div");
            row.className = "sheetwrite-query-row";
            row.setAttribute("aria-disabled", "true");
            const title = document.createElement("strong");
            title.textContent = member.member;
            row.append(title, note(`Not supported: ${member.reason}. ${KEPT_IN_FILE}`));
            return row;
          }),
        );
        kept.hidden = members.length === 0;
      });

      syncKind();
      syncLoad();
      draw();
      if (create) edit(undefined);
      const stopChange = grid.on("change", draw);
      const stopCommands = onQueryCommandsChange(grid, showStatus);
      return () => {
        stopChange();
        stopCommands();
      };
    },
  };
}
