// The Chart panel: kind, series ranges, titles, category labels and legend of
// one chart. Each committed change is ONE `grid.setChart`, so it is one undo
// step and the chart redraws at once. The controls follow changes from
// elsewhere (undo, a collaborator) in place, so a field the user is typing in
// keeps its draft.

import { CHART_KINDS } from "../chart-kinds.js";
import { findMeasure } from "../data-model.js";
import { iconNode } from "../icons/resolve.js";
import type {
  ChartDefinition,
  ChartKind,
  ChartRange,
  ChartRef,
  ChartSeries,
} from "../types/chart.js";
import type { Grid, GridPanel, IconOverrides } from "../types/grid.js";
import { pivotValueCaptions, plotsPivotValue, withPivotValue } from "./chart-model.js";
import {
  committingInput,
  panelField,
  panelSection,
  rejectionMessage,
  selectOf,
  type CommittingInput,
  type PanelField,
} from "./panel-dom.js";
import { formatRangeText, parseRangeText } from "./range-text.js";

/** `""` stands for no legend setting: the renderer's default position. */
const LEGEND_OPTIONS: readonly (readonly [string, string])[] = [
  ["", "Automatic"],
  ["none", "None"],
  ["top", "Top"],
  ["right", "Right"],
  ["bottom", "Bottom"],
  ["left", "Left"],
];

const VALUES_REQUIRED = "A series needs a values range.";
const MISSING_CHART = "This chart no longer exists.";
const LAST_PIVOT_VALUE = "A chart plots at least one value.";

/** A series name that starts with `=` is a cell reference, as in Excel's series dialog. */
const REFERENCE_PREFIX = "=";

type Legend = NonNullable<ChartDefinition["legend"]>;

function is_legend(value: string): value is Legend {
  return LEGEND_OPTIONS.some(([option]) => option !== "" && option === value);
}

/** Copy `chart` with `key` set to `value`, or without `key` when `value` is undefined. */
function with_optional<K extends "title" | "legend" | "axes">(
  chart: ChartDefinition,
  key: K,
  value: ChartDefinition[K] | undefined,
): ChartDefinition {
  const next = { ...chart };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

type AxisSettings = NonNullable<ChartDefinition["axes"]>;

/** Copy `chart` with axis setting `key` set to `value`, or without it when `value` is undefined. */
function with_axis_setting<K extends keyof AxisSettings>(
  chart: ChartDefinition,
  key: K,
  value: AxisSettings[K] | undefined,
): ChartDefinition {
  const axes = { ...chart.axes };
  if (value === undefined) delete axes[key];
  else axes[key] = value;
  return with_optional(chart, "axes", Object.keys(axes).length === 0 ? undefined : axes);
}

/** The Chart panel for the chart `ref`; `grid.openPanel` shows it. */
export function chartPanel(grid: Grid, ref: ChartRef, icons?: IconOverrides): GridPanel {
  return {
    title: "Chart",
    render: (body) => render_chart_panel(body, grid, ref, icons),
  };
}

function render_chart_panel(
  body: HTMLElement,
  grid: Grid,
  ref: ChartRef,
  icons: IconOverrides | undefined,
): () => void {
  const read = (): ChartDefinition | null =>
    grid.getCharts(ref.sheet).find((chart) => chart.id === ref.id) ?? null;
  const sheets = () => grid.store.getWorkbook().sheets;
  const range_text = (range: ChartRange): string =>
    range === "#REF!" ? range : formatRangeText(range, sheets(), ref.sheet);

  /** Commit one edit of the current chart; returns an error message or null. */
  const commit = (edit: (chart: ChartDefinition) => ChartDefinition | string): string | null => {
    const chart = read();
    if (chart === null) return MISSING_CHART;
    const next = edit(chart);
    if (typeof next === "string") return next;
    return rejectionMessage(grid.setChart(next, ref.sheet));
  };

  // Kind: a radio group of toggle buttons. Arrow keys move and select, as in
  // any radio group, and each selection is one change.
  const kind_section = panelSection("Chart type");
  const kinds = document.createElement("div");
  kinds.className = "sheetwrite-panel-kinds";
  kinds.setAttribute("role", "radiogroup");
  kinds.setAttribute("aria-label", "Chart type");
  const kind_buttons = CHART_KINDS.map(({ kind, label, icon }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheetwrite-panel-kind";
    button.setAttribute("role", "radio");
    button.dataset.kind = kind;
    button.dataset.focusKey = `kind-${kind}`;
    const glyph = document.createElement("span");
    glyph.className = "sheetwrite-panel-icon";
    glyph.appendChild(iconNode(icon, icons));
    const text = document.createElement("span");
    text.textContent = label;
    button.append(glyph, text);
    button.addEventListener("click", () => select_kind(kind));
    return button;
  });
  kinds.append(...kind_buttons);
  kind_section.appendChild(kinds);

  const select_kind = (kind: ChartKind): void => {
    if (read()?.kind !== kind) commit((chart) => ({ ...chart, kind }));
    show_kind(kind);
    kind_buttons.find((button) => button.dataset.kind === kind)?.focus();
  };
  const show_kind = (kind: ChartKind | undefined): void => {
    for (const button of kind_buttons) {
      const checked = button.dataset.kind === kind;
      button.setAttribute("aria-checked", String(checked));
      // Roving tab stop: Tab reaches the group once, on the checked kind.
      button.tabIndex = checked ? 0 : -1;
    }
  };
  kinds.addEventListener("keydown", (event) => {
    const index = kind_buttons.findIndex((button) => button === event.target);
    if (index === -1) return;
    const count = kind_buttons.length;
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowDown: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      ArrowUp: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    const next = moves[event.key];
    const kind = next === undefined ? undefined : CHART_KINDS[next]?.kind;
    if (kind === undefined) return;
    event.preventDefault();
    select_kind(kind);
  });

  // Series: one group of A1 fields per series.
  const series_section = panelSection("Data");
  let series_views: SeriesView[] = [];
  const build_series = (chart: ChartDefinition): void => {
    for (const view of series_views) view.element.remove();
    series_views = chart.series.map((series, index) =>
      series_view(index, series, { commit, rangeText: range_text, sheets, sheet: ref.sheet }),
    );
    series_section.append(...series_views.map((view) => view.element));
  };

  // Values of a chart over a pivot: one checkbox per value field, measures
  // next to fields, as the Field List picks a PivotChart's values.
  const value_section = panelSection("Values");
  const value_list = document.createElement("div");
  value_list.setAttribute("role", "group");
  value_list.setAttribute("aria-label", "Values to plot");
  const value_error = document.createElement("p");
  value_error.className = "sheetwrite-panel-note";
  value_error.hidden = true;
  value_section.append(value_list, value_error);
  let value_captions = "";
  const show_values = (chart: ChartDefinition): void => {
    const pivot = grid.getPivots(ref.sheet).find((candidate) => candidate.id === chart.pivot);
    const values = pivot?.values ?? [];
    const fields = pivot === undefined ? [] : grid.getPivotFields(ref.sheet, pivot.id);
    const captions = pivotValueCaptions(
      values,
      (field) =>
        fields.find((candidate) => candidate.index === field)?.header ?? `Field ${field + 1}`,
      (id) => findMeasure(grid.store.getWorkbook().dataModel, id)?.name,
    );
    if (captions.join("\n") !== value_captions) {
      value_captions = captions.join("\n");
      value_list.replaceChildren(
        ...captions.map((caption, slot) => {
          const label = document.createElement("label");
          label.className = "sheetwrite-panel-check";
          const box = document.createElement("input");
          box.type = "checkbox";
          box.dataset.focusKey = `value-${slot}`;
          box.addEventListener("change", () => {
            const message = commit(
              (current) =>
                withPivotValue(current, captions.length, slot, box.checked) ?? LAST_PIVOT_VALUE,
            );
            value_error.textContent = message ?? "";
            value_error.hidden = message === null;
            if (message !== null) box.checked = !box.checked;
          });
          label.append(box, document.createTextNode(caption));
          return label;
        }),
      );
    }
    value_list.querySelectorAll("input").forEach((box, slot) => {
      box.checked = plotsPivotValue(chart, slot);
    });
  };

  const text_section = panelSection("Titles");
  const title_field = text_field("Chart title", "title", (text) =>
    commit((chart) => with_optional(chart, "title", text === "" ? undefined : text)),
  );
  const x_field = text_field("Horizontal axis title", "x-title", (text) =>
    commit((chart) => with_axis_setting(chart, "xTitle", text === "" ? undefined : text)),
  );
  const y_field = text_field("Vertical axis title", "y-title", (text) =>
    commit((chart) => with_axis_setting(chart, "yTitle", text === "" ? undefined : text)),
  );
  text_section.append(title_field.field.element, x_field.field.element, y_field.field.element);

  // Format Axis › Multi-level Category Labels in Excel; it shows only when the categories have levels.
  const axis_section = panelSection("Category axis");
  const levels_label = document.createElement("label");
  levels_label.className = "sheetwrite-panel-check";
  const levels_box = document.createElement("input");
  levels_box.type = "checkbox";
  levels_box.dataset.focusKey = "multi-level-labels";
  levels_box.addEventListener("change", () => {
    const on = levels_box.checked;
    if (commit((chart) => with_axis_setting(chart, "multiLevelLabels", on ? undefined : false))) {
      levels_box.checked = !on;
    }
  });
  levels_label.append(levels_box, document.createTextNode("Multi-level category labels"));
  axis_section.appendChild(levels_label);

  /**
   * Whether the categories of `chart` have levels: several pivot row fields,
   * or a category range of several rows and several columns, as charts-live
   * reads them. The panel chunk does not load charts-live for it.
   */
  const has_category_levels = (chart: ChartDefinition): boolean => {
    const { kind } = chart;
    if (kind === "pie" || kind === "doughnut" || kind === "scatter") return false;
    if (chart.pivot === undefined) {
      return chart.series.some(
        ({ categories }) =>
          categories !== undefined &&
          categories !== "#REF!" &&
          categories.start.row !== categories.end.row &&
          categories.start.col !== categories.end.col,
      );
    }
    const pivot = grid.getPivots(ref.sheet).find((candidate) => candidate.id === chart.pivot);
    return (pivot?.rows.length ?? 0) > 1;
  };

  const legend_section = panelSection("Legend");
  const legend = panelField("Legend position", selectOf(LEGEND_OPTIONS, ""), "legend");
  legend.control.addEventListener("change", () => {
    const value = legend.control.value;
    legend.setError(
      commit((chart) => with_optional(chart, "legend", is_legend(value) ? value : undefined)),
    );
  });
  legend_section.appendChild(legend.element);

  const missing = document.createElement("p");
  missing.className = "sheetwrite-panel-note";
  missing.textContent = MISSING_CHART;
  missing.hidden = true;

  body.append(
    missing,
    kind_section,
    series_section,
    value_section,
    text_section,
    axis_section,
    legend_section,
  );

  const show = (): void => {
    const chart = read();
    missing.hidden = chart !== null;
    for (const section of [kind_section, series_section, text_section, legend_section]) {
      section.hidden = chart === null;
    }
    if (chart === null) {
      value_section.hidden = true;
      axis_section.hidden = true;
      return;
    }

    show_kind(chart.kind);
    // A chart over a pivot takes its data from the pivot, not from ranges.
    series_section.hidden = chart.pivot !== undefined;
    value_section.hidden = chart.pivot === undefined;
    if (chart.pivot !== undefined) show_values(chart);
    if (series_views.length !== chart.series.length) build_series(chart);
    else chart.series.forEach((series, index) => series_views[index]?.show(series));
    title_field.input.show(chart.title ?? "");
    x_field.input.show(chart.axes?.xTitle ?? "");
    y_field.input.show(chart.axes?.yTitle ?? "");
    legend.control.value = chart.legend ?? "";
    axis_section.hidden = !has_category_levels(chart);
    levels_box.checked = chart.axes?.multiLevelLabels !== false;
  };

  show();
  return grid.on("change", show);
}

interface TextField {
  readonly field: PanelField<HTMLInputElement>;
  readonly input: CommittingInput;
}

function text_field(
  label: string,
  focus_key: string,
  commit: (text: string) => string | null,
): TextField {
  let field: PanelField<HTMLInputElement> | null = null;
  const input = committingInput(
    "",
    (text) => commit(text.trim()),
    (message) => field?.setError(message),
  );
  field = panelField(label, input.input, focus_key);
  return { field, input };
}

interface SeriesContext {
  readonly commit: (edit: (chart: ChartDefinition) => ChartDefinition | string) => string | null;
  readonly rangeText: (range: ChartRange) => string;
  readonly sheets: () => Parameters<typeof parseRangeText>[1];
  readonly sheet: ChartRef["sheet"];
}

interface SeriesView {
  readonly element: HTMLElement;
  show(series: ChartSeries): void;
}

function series_view(index: number, series: ChartSeries, context: SeriesContext): SeriesView {
  const { commit, rangeText: range_text, sheets, sheet } = context;
  const edit_series = (edit: (series: ChartSeries) => ChartSeries | string) =>
    commit((chart) => {
      const current = chart.series[index];
      if (current === undefined) return MISSING_CHART;
      const next = edit(current);
      if (typeof next === "string") return next;
      return {
        ...chart,
        series: chart.series.map((entry, position) => (position === index ? next : entry)),
      };
    });

  const name_text = (entry: ChartSeries): string =>
    entry.nameRange === undefined
      ? (entry.name ?? "")
      : `${REFERENCE_PREFIX}${range_text(entry.nameRange)}`;

  const name = text_field("Name", `series-${index}-name`, (text) =>
    edit_series((entry) => {
      const { name: _name, nameRange: _name_range, ...rest } = entry;
      if (text === "") return rest;
      if (!text.startsWith(REFERENCE_PREFIX)) return { ...rest, name: text };
      const parsed = parseRangeText(text.slice(REFERENCE_PREFIX.length), sheets(), sheet);
      return "error" in parsed ? parsed.error : { ...rest, nameRange: parsed.range };
    }),
  );
  const values = text_field("Values", `series-${index}-values`, (text) =>
    edit_series((entry) => {
      if (text === "") return VALUES_REQUIRED;
      const parsed = parseRangeText(text, sheets(), sheet);
      return "error" in parsed ? parsed.error : { ...entry, values: parsed.range };
    }),
  );
  const categories = text_field("Categories", `series-${index}-categories`, (text) =>
    edit_series((entry) => {
      const { categories: _categories, ...rest } = entry;
      if (text === "") return rest;
      const parsed = parseRangeText(text, sheets(), sheet);
      return "error" in parsed ? parsed.error : { ...rest, categories: parsed.range };
    }),
  );

  const element = document.createElement("fieldset");
  element.className = "sheetwrite-panel-series";
  const legend = document.createElement("legend");
  legend.className = "sheetwrite-panel-label";
  legend.textContent = `Series ${index + 1}`;
  element.append(legend, name.field.element, values.field.element, categories.field.element);

  const show = (entry: ChartSeries): void => {
    name.input.show(name_text(entry));
    values.input.show(range_text(entry.values));
    categories.input.show(entry.categories === undefined ? "" : range_text(entry.categories));
  };
  show(series);
  return { element, show };
}
