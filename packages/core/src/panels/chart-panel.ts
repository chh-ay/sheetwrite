// The Chart panel: kind, series ranges, titles and legend of one chart. Each
// committed change is ONE `grid.setChart`, so it is one undo step and the
// chart redraws at once. The controls follow changes from elsewhere (undo,
// a collaborator) in place, so a field the user is typing in keeps its draft.

import { CHART_KINDS } from "../chart-kinds.js";
import { iconNode } from "../icons/resolve.js";
import type {
  ChartDefinition,
  ChartKind,
  ChartRange,
  ChartRef,
  ChartSeries,
} from "../types/chart.js";
import type { Grid, GridPanel, IconOverrides } from "../types/grid.js";
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

/** A series name that starts with `=` is a cell reference, as in Excel's series dialog. */
const REFERENCE_PREFIX = "=";

type Legend = NonNullable<ChartDefinition["legend"]>;

function isLegend(value: string): value is Legend {
  return LEGEND_OPTIONS.some(([option]) => option !== "" && option === value);
}

/** Copy `chart` with `key` set to `value`, or without `key` when `value` is undefined. */
function withOptional<K extends "title" | "legend" | "axes">(
  chart: ChartDefinition,
  key: K,
  value: ChartDefinition[K] | undefined,
): ChartDefinition {
  const next = { ...chart };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function withAxisTitle(
  chart: ChartDefinition,
  axis: "xTitle" | "yTitle",
  text: string,
): ChartDefinition {
  const axes = { ...chart.axes };
  if (text === "") delete axes[axis];
  else axes[axis] = text;
  return withOptional(chart, "axes", Object.keys(axes).length === 0 ? undefined : axes);
}

/** The Chart panel for the chart `ref`; `grid.openPanel` shows it. */
export function chartPanel(grid: Grid, ref: ChartRef, icons?: IconOverrides): GridPanel {
  return {
    title: "Chart",
    render: (body) => renderChartPanel(body, grid, ref, icons),
  };
}

function renderChartPanel(
  body: HTMLElement,
  grid: Grid,
  ref: ChartRef,
  icons: IconOverrides | undefined,
): () => void {
  const read = (): ChartDefinition | null =>
    grid.getCharts(ref.sheet).find((chart) => chart.id === ref.id) ?? null;
  const sheets = () => grid.store.getWorkbook().sheets;
  const rangeText = (range: ChartRange): string =>
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
  const kindSection = panelSection("Chart type");
  const kinds = document.createElement("div");
  kinds.className = "sheetwrite-panel-kinds";
  kinds.setAttribute("role", "radiogroup");
  kinds.setAttribute("aria-label", "Chart type");
  const kindButtons = CHART_KINDS.map(({ kind, label, icon }) => {
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
    button.addEventListener("click", () => selectKind(kind));
    return button;
  });
  kinds.append(...kindButtons);
  kindSection.appendChild(kinds);

  const selectKind = (kind: ChartKind): void => {
    if (read()?.kind !== kind) commit((chart) => ({ ...chart, kind }));
    showKind(kind);
    kindButtons.find((button) => button.dataset.kind === kind)?.focus();
  };
  const showKind = (kind: ChartKind | undefined): void => {
    for (const button of kindButtons) {
      const checked = button.dataset.kind === kind;
      button.setAttribute("aria-checked", String(checked));
      // Roving tab stop: Tab reaches the group once, on the checked kind.
      button.tabIndex = checked ? 0 : -1;
    }
  };
  kinds.addEventListener("keydown", (event) => {
    const index = kindButtons.findIndex((button) => button === event.target);
    if (index === -1) return;
    const count = kindButtons.length;
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
    selectKind(kind);
  });

  // Series: one group of A1 fields per series.
  const seriesSection = panelSection("Data");
  let seriesViews: SeriesView[] = [];
  const buildSeries = (chart: ChartDefinition): void => {
    for (const view of seriesViews) view.element.remove();
    seriesViews = chart.series.map((series, index) =>
      seriesView(index, series, { commit, rangeText, sheets, sheet: ref.sheet }),
    );
    seriesSection.append(...seriesViews.map((view) => view.element));
  };

  // Titles and legend.
  const textSection = panelSection("Titles");
  const titleField = textField("Chart title", "title", (text) =>
    commit((chart) => withOptional(chart, "title", text === "" ? undefined : text)),
  );
  const xField = textField("Horizontal axis title", "x-title", (text) =>
    commit((chart) => withAxisTitle(chart, "xTitle", text)),
  );
  const yField = textField("Vertical axis title", "y-title", (text) =>
    commit((chart) => withAxisTitle(chart, "yTitle", text)),
  );
  textSection.append(titleField.field.element, xField.field.element, yField.field.element);

  const legendSection = panelSection("Legend");
  const legend = panelField("Legend position", selectOf(LEGEND_OPTIONS, ""), "legend");
  legend.control.addEventListener("change", () => {
    const value = legend.control.value;
    legend.setError(
      commit((chart) => withOptional(chart, "legend", isLegend(value) ? value : undefined)),
    );
  });
  legendSection.appendChild(legend.element);

  const missing = document.createElement("p");
  missing.className = "sheetwrite-panel-note";
  missing.textContent = MISSING_CHART;
  missing.hidden = true;

  body.append(missing, kindSection, seriesSection, textSection, legendSection);

  const show = (): void => {
    const chart = read();
    missing.hidden = chart !== null;
    for (const section of [kindSection, seriesSection, textSection, legendSection]) {
      section.hidden = chart === null;
    }
    if (chart === null) return;

    showKind(chart.kind);
    if (seriesViews.length !== chart.series.length) buildSeries(chart);
    else chart.series.forEach((series, index) => seriesViews[index]?.show(series));
    titleField.input.show(chart.title ?? "");
    xField.input.show(chart.axes?.xTitle ?? "");
    yField.input.show(chart.axes?.yTitle ?? "");
    legend.control.value = chart.legend ?? "";
  };

  show();
  return grid.on("change", show);
}

interface TextField {
  readonly field: PanelField<HTMLInputElement>;
  readonly input: CommittingInput;
}

function textField(
  label: string,
  focusKey: string,
  commit: (text: string) => string | null,
): TextField {
  let field: PanelField<HTMLInputElement> | null = null;
  const input = committingInput(
    "",
    (text) => commit(text.trim()),
    (message) => field?.setError(message),
  );
  field = panelField(label, input.input, focusKey);
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

function seriesView(index: number, series: ChartSeries, context: SeriesContext): SeriesView {
  const { commit, rangeText, sheets, sheet } = context;
  const editSeries = (edit: (series: ChartSeries) => ChartSeries | string) =>
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

  const nameText = (entry: ChartSeries): string =>
    entry.nameRange === undefined
      ? (entry.name ?? "")
      : `${REFERENCE_PREFIX}${rangeText(entry.nameRange)}`;

  const name = textField("Name", `series-${index}-name`, (text) =>
    editSeries((entry) => {
      const { name: _name, nameRange: _nameRange, ...rest } = entry;
      if (text === "") return rest;
      if (!text.startsWith(REFERENCE_PREFIX)) return { ...rest, name: text };
      const parsed = parseRangeText(text.slice(REFERENCE_PREFIX.length), sheets(), sheet);
      return "error" in parsed ? parsed.error : { ...rest, nameRange: parsed.range };
    }),
  );
  const values = textField("Values", `series-${index}-values`, (text) =>
    editSeries((entry) => {
      if (text === "") return VALUES_REQUIRED;
      const parsed = parseRangeText(text, sheets(), sheet);
      return "error" in parsed ? parsed.error : { ...entry, values: parsed.range };
    }),
  );
  const categories = textField("Categories", `series-${index}-categories`, (text) =>
    editSeries((entry) => {
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
    name.input.show(nameText(entry));
    values.input.show(rangeText(entry.values));
    categories.input.show(entry.categories === undefined ? "" : rangeText(entry.categories));
  };
  show(series);
  return { element, show };
}
