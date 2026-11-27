// Data › Queries & Connections and Data › Get Data. The panel lists the
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

function button(label: string, run: () => void, focus_key?: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "sheetwrite-panel-control";
  control.textContent = label;
  if (focus_key !== undefined) control.dataset.focusKey = focus_key;
  control.addEventListener("click", run);
  return control;
}

function text_input(value = ""): HTMLInputElement {
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

function saved_queries(grid: Grid): readonly SavedQuery[] {
  return grid.store.getWorkbook().queries ?? [];
}

function output_text(grid: Grid, query: SavedQuery): string {
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

/** The Queries & Connections panel; `create` opens it with an empty new-query form focused. */
export function queryPanel(grid: Grid, create: boolean): GridPanel {
  return {
    title: "Queries & Connections",
    render(body) {
      const status = note();
      status.setAttribute("role", "status");
      const cancel = button("Cancel refresh", () => void toggleQueryRefresh(grid, null));
      const refresh_all = button("Refresh All", () => refresh(null), "refresh-all");
      const status_section = panelSection("Refresh");
      status_section.append(refresh_all, cancel, status);

      const list = panelSection("Queries");
      const entries = document.createElement("div");
      list.append(entries);

      const kept = panelSection("Kept from the file");
      const kept_entries = document.createElement("div");
      kept.append(kept_entries);
      kept.hidden = true;

      const editor = panelSection("Query");
      const form = document.createElement("form");
      const name = panelField("Name", text_input(), "query-name");
      const kind = panelField("Source", selectOf(SOURCE_KINDS, "csv"), "query-source-kind");
      const source_id = panelField("Source ID", text_input(), "query-source-id");
      const locator = panelField("Address (public, no credentials)", text_input(), "query-locator");
      const columns_area = document.createElement("textarea");
      columns_area.rows = 4;
      columns_area.className = "sheetwrite-panel-control";
      columns_area.dataset.focusKey = "query-columns";
      columns_area.placeholder = "Region: text\nTotal: number";
      const columns_label = document.createElement("label");
      columns_label.className = "sheetwrite-panel-field";
      const columns_title = document.createElement("span");
      columns_title.className = "sheetwrite-panel-label";
      columns_title.textContent = "Columns (Name: type, one per line)";
      const columns_error = note();
      columns_label.append(columns_title, columns_area, columns_error);

      const steps_list = document.createElement("ol");
      steps_list.className = "sheetwrite-query-steps";
      const steps_label = note("Steps run in order. Name columns as they are before each step.");
      const add_step = button("Add step", () => append_step("filter", ""), "query-add-step");

      const load = document.createElement("input");
      load.type = "checkbox";
      load.checked = true;
      load.dataset.focusKey = "query-load";
      const load_label = document.createElement("label");
      load_label.className = "sheetwrite-panel-check";
      load_label.append(load, "Load to a table");
      const table_name = panelField("Table name", text_input(), "query-table-name");
      const anchor = panelField("Top-left cell", text_input("A1"), "query-anchor");

      const save = document.createElement("button");
      save.type = "submit";
      save.className = "sheetwrite-panel-control";
      save.textContent = "Save";
      save.dataset.focusKey = "query-save";
      const form_error = note();
      form_error.setAttribute("role", "alert");
      form.append(
        name.element,
        kind.element,
        source_id.element,
        locator.element,
        columns_label,
        steps_label,
        steps_list,
        add_step,
        load_label,
        table_name.element,
        anchor.element,
        save,
        button("New query", () => edit(undefined), "query-new"),
        form_error,
      );
      editor.append(form);
      body.append(status_section, list, kept, editor);

      let editing: SavedQuery | undefined;
      let rows: StepRow[] = [];

      const show_status = (): void => {
        const running = queryRefreshRunning(grid);
        cancel.hidden = !running;
        refresh_all.hidden = running;
        if (running) status.textContent = REFRESHING;
      };

      const refresh = (ids: readonly string[] | null): void => {
        if (queryRefreshRunning(grid)) return;
        void toggleQueryRefresh(grid, ids).then((outcome) => {
          status.textContent = outcome ?? REFRESHED;
        });
      };

      const append_step = (step_kind: StepKind, text: string): void => {
        const item = document.createElement("li");
        const kind_select = selectOf(
          STEP_KINDS.map(([value, label]) => [value, label] as const),
          step_kind,
        );
        kind_select.className = "sheetwrite-panel-control";
        kind_select.setAttribute("aria-label", "Step kind");
        const input = text_input(text);
        input.className = "sheetwrite-panel-control";
        input.setAttribute("aria-label", "Step");
        const hint = (): void => {
          input.placeholder = STEP_KINDS.find(([value]) => value === kind_select.value)?.[2] ?? "";
        };
        kind_select.addEventListener("change", hint);
        hint();
        const error = note();
        const row: StepRow = { kind: kind_select, text: input, error };
        const move = (offset: number): void => {
          const index = rows.indexOf(row);
          const target = index + offset;
          if (target < 0 || target >= rows.length) return;
          rows.splice(index, 1);
          rows.splice(target, 0, row);
          const sibling = steps_list.children[offset < 0 ? target : target + 1] ?? null;
          steps_list.insertBefore(item, sibling);
          input.focus();
        };
        item.append(
          kind_select,
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
        steps_list.append(item);
      };

      const edit = (query: SavedQuery | undefined): void => {
        editing = query;
        form_error.textContent = "";
        columns_error.textContent = "";
        name.setError(null);
        source_id.setError(null);
        table_name.setError(null);
        anchor.setError(null);
        name.control.value = query?.name ?? "";
        kind.control.value = query?.source.kind ?? "csv";
        source_id.control.value = query?.source.sourceId ?? "";
        locator.control.value =
          query !== undefined && query.source.kind !== "host" ? (query.source.locator ?? "") : "";
        columns_area.value = query === undefined ? "" : sourceColumnsText(query.source.columns);
        steps_list.replaceChildren();
        rows = [];
        if (query !== undefined) {
          const queries = saved_queries(grid);
          query.steps.forEach((step, index) => {
            append_step(step.kind, stepText(step, columnsAfter(query, queries, index), queries));
          });
        }
        load.checked = query === undefined || query.output !== undefined;
        table_name.control.value = query?.output?.tableName ?? "";
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

      const sync_kind = (): void => {
        locator.element.hidden = kind.control.value === "host";
      };
      kind.control.addEventListener("change", sync_kind);
      const sync_load = (): void => {
        table_name.element.hidden = !load.checked;
        anchor.element.hidden = !load.checked;
      };
      load.addEventListener("change", sync_load);

      /** Builds the definition from the form, or shows why it cannot. */
      const definition = (): SavedQuery | undefined => {
        const queries = saved_queries(grid);
        const query_name = name.control.value.trim();
        name.setError(query_name === "" ? NO_NAME : null);
        const id = source_id.control.value.trim();
        source_id.setError(id === "" ? NO_SOURCE_ID : null);
        const columns = parseSourceColumns(columns_area.value, editing?.source.columns);
        columns_error.textContent = "error" in columns ? columns.error : "";
        if (query_name === "" || id === "" || "error" in columns) return undefined;

        const query_id =
          editing?.id ?? freshId(query_name, new Set(queries.map((query) => query.id)));
        const address = locator.control.value.trim();
        const source_kind = SOURCE_KINDS.find(([value]) => value === kind.control.value)?.[0];
        let source: SavedQuerySource;
        if (source_kind === "host" || source_kind === undefined) {
          source = { kind: "host", sourceId: id, columns: columns.value };
        } else {
          // Options the form does not show stay as they were saved.
          const previous = editing?.source.kind === source_kind ? editing.source : undefined;
          const options =
            previous === undefined ? {} : (({ locator: _locator, ...rest }) => rest)(previous);
          source = {
            ...options,
            kind: source_kind,
            sourceId: id,
            columns: columns.value,
            ...(address === "" ? {} : { locator: address }),
          };
        }

        const steps: QueryStep[] = [];
        let schema: ModelColumn[] = columns.value.map(({ id: column_id, name: column_name }) => ({
          id: column_id,
          name: column_name,
        }));
        let valid = true;
        for (const row of rows) {
          const step_kind = STEP_KINDS.find(([value]) => value === row.kind.value)?.[0] ?? "filter";
          const parsed = parseStep(step_kind, row.text.value, schema, queries, query_id);
          row.error.textContent = "error" in parsed ? parsed.error : "";
          if ("error" in parsed) {
            valid = false;
            continue;
          }
          steps.push(parsed.value);
          schema = columnsAfterStep(schema, parsed.value, queries);
        }
        if (!valid) return undefined;

        const base: SavedQuery = { id: query_id, name: query_name, source, steps };
        if (!load.checked) return base;

        const table = table_name.control.value.trim();
        table_name.setError(table === "" ? NO_TABLE_NAME : null);
        const workbook = grid.store.getWorkbook();
        const sheet = grid.getActiveSheet();
        const cell = parseRangeText(anchor.control.value, workbook.sheets, sheet);
        anchor.setError("error" in cell ? cell.error : null);
        if (table === "" || "error" in cell) return undefined;

        const tables = workbook.sheets.flatMap((candidate) => candidate.tables ?? []);
        const table_id =
          editing?.output?.table ??
          freshId(`query-${query_id}`, new Set(tables.map((candidate) => candidate.id)));
        return {
          ...base,
          output: {
            table: table_id,
            tableName: table,
            anchor: { sheet: cell.range.sheet, ...cell.range.start },
          },
        };
      };

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const commands = queryCommandsOf(grid);
        if (commands === undefined) {
          form_error.textContent = NO_SESSION;
          return;
        }
        const query = definition();
        if (query === undefined) return;
        const message = commands.define(query);
        form_error.textContent = message ?? SAVED;
        if (message === null) editing = query;
      });

      const remove = (query: SavedQuery): void => {
        const patches: DocumentOp[] = [{ op: "removeQuery", id: query.id }];
        const message = rejectionMessage(grid.applyTransaction({ patches }));
        status.textContent = message ?? `Removed ${query.name}; its table values stay.`;
        if (message === null && editing?.id === query.id) edit(undefined);
      };

      const select_output = (query: SavedQuery): void => {
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
        const queries = saved_queries(grid);
        if (queries.length === 0) entries.append(note("No saved queries yet."));
        for (const query of queries) {
          const row = document.createElement("div");
          row.className = "sheetwrite-query-row";
          const title = document.createElement("strong");
          title.textContent = query.name;
          const detail = note(
            `${query.source.kind.toUpperCase()} source · ${output_text(grid, query)}`,
          );
          row.append(
            title,
            detail,
            button("Refresh", () => refresh([query.id])),
            button("Edit", () => edit(query)),
            ...(query.output === undefined
              ? []
              : [button("Select output", () => select_output(query))]),
            button("Remove", () => remove(query)),
          );
          entries.append(row);
        }
        show_status();
      };

      const draw_kept = (): void => {
        // XLSX import records them on the kept DataMashup graph; they leave with it.
        const members =
          grid.store
            .getWorkbook()
            .xlsxSource?.graphs.flatMap((graph) => graph.unsupportedQueries ?? []) ?? [];
        kept_entries.replaceChildren(
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
      };

      sync_kind();
      sync_load();
      draw();
      draw_kept();
      if (create) {
        edit(undefined);
        // The side panel focuses its first control after render; Get Data starts at the name.
        queueMicrotask(() => name.control.focus());
      }
      const stop_change = grid.on("change", () => {
        draw();
        draw_kept();
      });
      const stop_commands = onQueryCommandsChange(grid, show_status);
      return () => {
        stop_change();
        stop_commands();
      };
    },
  };
}
