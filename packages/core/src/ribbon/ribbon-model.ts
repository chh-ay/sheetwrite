// The command registry: tabs, groups and commands bound to the public Grid
// API. Every renderer (full ribbon, compact ribbon, toolbar) reads this list,
// so a new command is added here once. Add its glyph to scripts/icon-glyphs.ts
// and run `bun scripts/icon-sheet.ts`; no renderer-specific entry is needed.
// The DOM side (ribbon-controls.ts) never decides behavior, so Excel parity
// is reviewed here. A command is added only with the feature it runs. The
// tab, group and glyph planned for each 0.7 feature are on the Toolbar and
// ribbon docs page, so features that land separately still form one layout.

import { actionFeedbackFor } from "../action-feedback.js";
import { CHART_KINDS } from "../chart-kinds.js";
import { isDashboard } from "../dashboard.js";
import {
  ACCOUNTING_FORMAT,
  COMMA_FORMAT,
  FONT_FAMILIES,
  FONT_SIZES_PT,
  NUMBER_FORMAT_PRESETS,
  PERCENT_FORMAT,
  numberFormatLabel,
  pixelsToPoints,
  pointsToPixels,
} from "../format-presets.js";
import { signature } from "../functions/signature.js";
import type { FormulaFunctionMetadata } from "../functions/types.js";
import { ZOOM_MIN, ZOOM_MAX } from "../grid-constants.js";
import { createHyperlinkId, isSafeExternalHyperlink } from "../hyperlink.js";
import type { IconName } from "../icons/icon-names.js";
import {
  loadPanels,
  pivotsAvailable,
  showDefineName,
  showFormulaExplanation,
  showNameManager,
} from "../panels/panel-loader.js";
import { queryCommandsOf, queryRefreshRunning, toggleQueryRefresh } from "../query-commands.js";
import { selectionCell } from "../selection.js";
import { storeEngine } from "../store/engine-registry.js";
import type { ChartKind } from "../types/chart.js";
import type { BorderPreset, CommandFlags, Grid, GridCommandName } from "../types/grid.js";
import { xlsxImportCommand } from "../workbook-io.js";
import type {
  RibbonAvailability,
  RibbonButtonSpec,
  RibbonColorSpec,
  RibbonComboSpec,
  RibbonFormSpec,
  RibbonMenuItem,
  RibbonMenuSpec,
  RibbonPlacementSpec,
  RibbonTabSpec,
} from "./command-spec.js";

/** Zoom step of `Grid.setZoom`, shown as percents. */
const ZOOM_STEP = 0.1;
/** The zoom that the ribbon's percent readout resets to: 100%. */
export const ZOOM_RESET = 1;

const EXCEL_THEME_TEXT = "#c00000";
const EXCEL_THEME_FILL = "#ffff00";

const PERCENT_SCALE = 100;
const MAX_FONT_SIZE_PT = 409;

/** Inclusive data-row spans of the selection, for row grouping. */
function selectedRowSpans(grid: Grid): Array<[number, number]> {
  const selection = grid.getSelection();
  switch (selection?.kind) {
    case "cell":
      return [[selection.addr.row, selection.addr.row]];
    case "row":
      return [[selection.row, selection.row]];
    case "range":
      return [rowSpan(selection.range.start.row, selection.range.end.row)];
    case "multi":
      return selection.ranges.map((range) => rowSpan(range.start.row, range.end.row));
    default:
      return [];
  }
}

function rowSpan(a: number, b: number): [number, number] {
  return [Math.min(a, b), Math.max(a, b)];
}

/**
 * Data › Get Data and Queries & Connections. The opener lives in this lazy
 * ribbon chunk rather than the panel loader, so grids without queries carry
 * none of it.
 */
function showQueryPanel(grid: Grid, create: boolean): void {
  void loadPanels(grid).then((controller) => controller.openQueryPanel(grid, create));
}

/** The query commands show only while a query session is connected to the grid. */
// They stay enabled in a read-only grid: the grid rejects the write and the
// rejection message is shown, because no command state reports read-only alone.
const queriesConnected = (grid: Grid): boolean => queryCommandsOf(grid) !== undefined;

const QUERIES_REFRESHED = "Queries refreshed.";
const QUERIES_REFRESHING = "Refreshing queries. Select Refresh All again to cancel.";

/** Data › Refresh All: one refresh of every output table; a second press cancels it. */
function refreshAllQueries(grid: Grid): void {
  const feedback = actionFeedbackFor(grid);
  if (queryRefreshRunning(grid)) {
    // The running refresh reports its own cancellation.
    void toggleQueryRefresh(grid, null);
    return;
  }

  feedback?.show(QUERIES_REFRESHING);
  void toggleQueryRefresh(grid, null).then((outcome) =>
    feedback?.show(outcome ?? QUERIES_REFRESHED),
  );
}

const button = (
  label: string,
  icon: IconName,
  run: (grid: Grid) => unknown,
  availability: RibbonAvailability = "edit",
  options: {
    toggle?: boolean;
    large?: boolean;
    flags?: readonly (keyof CommandFlags)[];
  } = {},
): RibbonButtonSpec => ({
  kind: "button",
  id: icon,
  label,
  icon,
  run,
  availability,
  ...options,
});

const toggle = (
  label: string,
  icon: IconName & GridCommandName,
  run: (grid: Grid) => unknown,
  flags?: readonly (keyof CommandFlags)[],
): RibbonButtonSpec =>
  button(label, icon, run, icon, flags === undefined ? { toggle: true } : { toggle: true, flags });

const ALIGN: readonly (keyof CommandFlags)[] = ["align"];
const SORT: readonly (keyof CommandFlags)[] = ["sort"];
const EXPORT: readonly (keyof CommandFlags)[] = ["export"];

const item = (label: string, run: (grid: Grid) => unknown, icon?: IconName): RibbonMenuItem =>
  icon === undefined ? { label, run } : { label, icon, run };

const BORDER_ITEMS: readonly [string, IconName, BorderPreset][] = [
  ["Bottom Border", "borderBottom", "bottom"],
  ["Top Border", "borderTop", "top"],
  ["Left Border", "borderLeft", "left"],
  ["Right Border", "borderRight", "right"],
  ["No Border", "borderNone", "none"],
  ["All Borders", "borderAll", "all"],
  ["Outside Borders", "borderOutside", "outside"],
  ["Thick Outside Borders", "borderThickOutside", "thickOutside"],
];

const INSERT_ITEMS: readonly RibbonMenuItem[] = [
  item("Insert Rows Above", (grid) => grid.actions.insertRowAbove()),
  item("Insert Rows Below", (grid) => grid.actions.insertRowBelow()),
  item("Insert Columns Left", (grid) => grid.actions.insertColumnLeft()),
  item("Insert Columns Right", (grid) => grid.actions.insertColumnRight()),
];

const DELETE_ITEMS: readonly RibbonMenuItem[] = [
  item("Delete Rows", (grid) => grid.actions.deleteRow()),
  item("Delete Columns", (grid) => grid.actions.deleteColumn()),
];

const VISIBILITY_ITEMS: readonly RibbonMenuItem[] = [
  item("Hide Rows", (grid) => grid.actions.hideRows(), "hideRows"),
  item("Unhide Rows", (grid) => grid.actions.showRows(), "unhideRows"),
  item("Hide Columns", (grid) => grid.actions.hideColumns(), "hideColumns"),
  item("Unhide Columns", (grid) => grid.actions.showColumns(), "unhideColumns"),
];

const SORT_ITEMS: readonly RibbonMenuItem[] = [
  item("Sort A to Z", (grid) => grid.actions.sort(true), "sortAsc"),
  item("Sort Z to A", (grid) => grid.actions.sort(false), "sortDesc"),
  item("Custom Sort…", (grid) => grid.actions.customSort(), "sortCustom"),
  item("Sort View A to Z", (grid) => grid.actions.sortView(true), "sortView"),
  item("Sort View Z to A", (grid) => grid.actions.sortView(false), "sortView"),
  item("Clear Filter", (grid) => grid.actions.clearFilter(), "clearFilter"),
];

/** Sort the view only; the two orders share the glyph, so each names its own ID. */
const viewSortButton = (label: string, id: string, ascending: boolean): RibbonButtonSpec => ({
  ...button(label, "sortView", (grid) => grid.actions.sortView(ascending), "edit", {
    flags: SORT,
  }),
  id,
});

const fontFamily: RibbonComboSpec = {
  kind: "combo",
  id: "fontFamily",
  label: "Font",
  width: 128,
  availability: "edit",
  options: FONT_FAMILIES,
  previewFont: true,
  // Unstyled cells show the theme font they paint with, as Excel shows Calibri.
  read: (focus) => focus.style.fontFamily ?? focus.themeFontFamily ?? "",
  apply: (grid, value) => {
    const family = value.trim();
    grid.actions.setFontFamily(family === "" ? null : family);
    return true;
  },
};

const fontSize: RibbonComboSpec = {
  kind: "combo",
  id: "fontSize",
  label: "Font Size",
  width: 48,
  availability: "edit",
  options: FONT_SIZES_PT.map(String),
  read: (focus) => {
    const size = focus.style.fontSize ?? focus.themeFontPx;
    return size === undefined ? "" : String(pixelsToPoints(size));
  },
  apply: (grid, value) => {
    const points = Number(value);
    if (!Number.isFinite(points) || points <= 0 || points > MAX_FONT_SIZE_PT) return false;
    grid.actions.setFontSize(pointsToPixels(points));
    return true;
  },
};

const numberFormat: RibbonComboSpec = {
  kind: "combo",
  id: "numberFormat",
  label: "Number Format",
  width: 112,
  availability: "edit",
  options: NUMBER_FORMAT_PRESETS.map((preset) => preset.label),
  read: (focus) => numberFormatLabel(focus.style.numberFormat),
  apply: (grid, value) => {
    const preset = NUMBER_FORMAT_PRESETS.find((candidate) => candidate.label === value);
    if (preset === undefined) return false;
    grid.actions.setNumberFormat(preset.code);
    return true;
  },
};

const fontColor: RibbonColorSpec = {
  kind: "color",
  id: "textColor",
  flags: ["textColor"],
  label: "Font Color",
  icon: "textColor",
  clearLabel: "Automatic",
  initial: EXCEL_THEME_TEXT,
  apply: (grid, color) => grid.actions.setTextColor(color),
};

const fillColor: RibbonColorSpec = {
  kind: "color",
  id: "fillColor",
  flags: ["fillColor"],
  label: "Fill Color",
  icon: "fillColor",
  clearLabel: "No Fill",
  initial: EXCEL_THEME_FILL,
  apply: (grid, color) => grid.actions.setFillColor(color),
};

const HYPERLINK_ERROR = "Enter a full http, https or mailto address.";

const hyperlink: RibbonFormSpec = {
  kind: "form",
  id: "hyperlink",
  label: "Link",
  icon: "hyperlink",
  field: "Address",
  multiline: false,
  read: (grid, cell) => {
    const target = grid.getHyperlink(cell)?.target;
    return target?.kind === "external" ? target.url : "";
  },
  submit: (grid, cell, value) => {
    const existing = grid.getHyperlink(cell);
    const url = value.trim();
    if (url === "") {
      if (existing !== null) grid.removeHyperlink(existing.id);
      return null;
    }
    if (!isSafeExternalHyperlink(url)) return HYPERLINK_ERROR;
    const range = { sheet: cell.sheet, start: { row: cell.row, col: cell.col } };
    grid.setHyperlink({
      id: existing?.id ?? createHyperlinkId(),
      range: existing?.range ?? { ...range, end: range.start },
      target: { kind: "external", url },
    });
    return null;
  },
};

const note: RibbonFormSpec = {
  kind: "form",
  id: "note",
  label: "Note",
  icon: "note",
  field: "Note",
  multiline: true,
  read: (grid, cell) => grid.getNote(cell) ?? "",
  submit: (grid, cell, value) => {
    grid.setNote(cell, value.trim() === "" ? null : value);
    return null;
  },
};

const PIVOT_NEEDS_FULL_ENGINE = "Pivot tables need the full engine (@sheetwrite/formulas).";

const pivotTable: RibbonPlacementSpec = {
  kind: "placement",
  id: "pivotTable",
  label: "PivotTable",
  icon: "pivotTable",
  unavailable: (grid) => (pivotsAvailable(grid) ? null : PIVOT_NEEDS_FULL_ENGINE),
  submit: async (grid, destination) => (await loadPanels(grid)).insertPivot(grid, destination),
};

/** Inserts a chart of `kind` from the selection; the panel code loads on first use. */
const insertChartOf =
  (kind: ChartKind) =>
  async (grid: Grid): Promise<boolean> =>
    (await loadPanels(grid)).insertChart(grid, kind);

/** Insert › Filters › Slicer opens the Insert Slicers list; the panel code loads on first use. */
const insertSlicer = async (grid: Grid): Promise<void> =>
  (await loadPanels(grid)).openSlicerPanel(grid);

function activeSheetIsDashboard(grid: Grid): boolean {
  const sheet = grid.getActiveSheet();
  return isDashboard(grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet));
}

/** Data › Data Tools opens the data model panel; the panel code loads on first use. */
const openDataModel = async (grid: Grid): Promise<void> =>
  (await loadPanels(grid)).openDataModelPanel(grid);

/** The data model needs workbook tables: one to manage, two to relate. */
function workbookTableCount(grid: Grid): number {
  let count = 0;
  for (const sheet of grid.store.getWorkbook().sheets) count += sheet.tables?.length ?? 0;
  return count;
}

/**
 * Excel's Insert › Charts: the face inserts a column chart, as Excel's
 * Recommended Charts usually does for a table, and the menu picks a kind.
 */
const chart: RibbonMenuSpec = {
  kind: "menu",
  id: "chart",
  label: "Chart",
  icon: "chart",
  availability: "edit",
  large: true,
  run: insertChartOf("column"),
  items: CHART_KINDS.map(({ kind, label, icon }) => ({ label, icon, run: insertChartOf(kind) })),
};

function outline(group: boolean): (grid: Grid) => void {
  return (grid) => {
    for (const [start, end] of selectedRowSpans(grid)) {
      if (group) grid.groupRows(start, end);
      else grid.ungroupRows(start, end);
    }
  };
}

/** Functions the host registered on the grid's store; none without the full engine. */
function hostFunctions(grid: Grid): readonly FormulaFunctionMetadata[] {
  return storeEngine(grid.store)?.hostFunctions?.metadata() ?? [];
}

/**
 * Starts a formula that calls `name` in the focus cell, as a pick in Excel's
 * Insert Function does; the user types the arguments. The selection holds the
 * same coordinates the formula bar edits with.
 */
function startFormula(grid: Grid, name: string): void {
  const cell = selectionCell(grid.getSelection());
  if (cell !== null) grid.beginEdit(cell.row, cell.col, `=${name}(`);
}

/**
 * Formulas › Insert Function lists the host functions with their signature
 * and description. It shows only while the store has host functions, which
 * needs the full engine; built-in functions stay with formula autocomplete.
 */
const insertFunction: RibbonMenuSpec = {
  kind: "menu",
  id: "insertFunction",
  label: "Insert Function",
  icon: "insertFunction",
  availability: "edit",
  large: true,
  available: (grid) => hostFunctions(grid).length > 0,
  items: (grid) =>
    hostFunctions(grid).map((fn) => ({
      label: fn.name,
      description: `${signature(fn)}: ${fn.description}`,
      run: (target: Grid) => startFormula(target, fn.name),
    })),
};

/** Percent label for a zoom factor, e.g. 1.1 → "110%". */
export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * PERCENT_SCALE)}%`;
}

/** The next zoom step, clamped to the grid's range and kept on whole percents. */
export function steppedZoom(zoom: number, direction: 1 | -1): number {
  const next = Math.round((zoom + direction * ZOOM_STEP) * PERCENT_SCALE) / PERCENT_SCALE;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

/**
 * The command registry, grouped into tabs. IDs, labels, icons, run handlers
 * and availability/toggle bindings belong here, not in a layout renderer.
 * Full and compact layouts render these same live controls.
 */
export const RIBBON_TABS: readonly RibbonTabSpec[] = [
  {
    label: "File",
    reduceOrder: ["import"],
    groups: [
      {
        id: "import",
        label: "Import",
        icon: "importXlsx",
        layout: "flow",
        controls: [xlsxImportCommand],
      },
    ],
  },
  {
    label: "Home",
    reduceOrder: ["editing", "cells", "number", "alignment", "clipboard", "font", "undo"],
    groups: [
      {
        id: "undo",
        label: "Undo",
        icon: "undo",
        layout: "flow",
        controls: [
          button("Undo", "undo", (grid) => grid.actions.undo(), "undo", { flags: ["undo"] }),
          button("Redo", "redo", (grid) => grid.actions.redo(), "redo", { flags: ["undo"] }),
        ],
      },
      {
        id: "clipboard",
        label: "Clipboard",
        icon: "paste",
        layout: "flow",
        controls: [
          {
            kind: "menu",
            id: "paste",
            label: "Paste",
            icon: "paste",
            availability: "edit",
            large: true,
            run: (grid) => grid.actions.paste(),
            items: [
              item("Paste", (grid) => grid.actions.paste(), "paste"),
              item("Paste Values", (grid) => grid.actions.pasteValues()),
            ],
          },
          button("Cut", "cut", (grid) => grid.actions.cut()),
          button("Copy", "copy", (grid) => grid.actions.copy(), "view"),
        ],
      },
      {
        id: "font",
        label: "Font",
        icon: "textColor",
        layout: "rows",
        rows: [
          [
            fontFamily,
            fontSize,
            button("Increase Font Size", "fontGrow", (grid) => grid.actions.stepFontSize(1)),
            button("Decrease Font Size", "fontShrink", (grid) => grid.actions.stepFontSize(-1)),
          ],
          [
            toggle("Bold", "bold", (grid) => grid.actions.toggleBold(), ["bold"]),
            toggle("Italic", "italic", (grid) => grid.actions.toggleItalic(), ["italic"]),
            toggle("Underline", "underline", (grid) => grid.actions.toggleUnderline(), [
              "bold",
              "italic",
            ]),
            toggle("Strikethrough", "strikethrough", (grid) => grid.actions.toggleStrikethrough(), [
              "bold",
              "italic",
            ]),
            {
              kind: "menu",
              id: "border",
              flags: ["border"],
              label: "Borders",
              icon: "borderBottom",
              availability: "edit",
              run: (grid) => grid.actions.setBorders("bottom"),
              items: BORDER_ITEMS.map(([label, icon, preset]) =>
                item(label, (grid) => grid.actions.setBorders(preset), icon),
              ),
            },
            fillColor,
            fontColor,
          ],
        ],
      },
      {
        id: "alignment",
        label: "Alignment",
        icon: "alignCenter",
        layout: "rows",
        rows: [
          [
            toggle("Top Align", "alignTop", (grid) => grid.actions.setVerticalAlign("top"), ALIGN),
            toggle(
              "Middle Align",
              "alignMiddle",
              (grid) => grid.actions.setVerticalAlign("middle"),
              ALIGN,
            ),
            toggle(
              "Bottom Align",
              "alignBottom",
              (grid) => grid.actions.setVerticalAlign("bottom"),
              ALIGN,
            ),
            toggle("Wrap Text", "wrap", (grid) => grid.actions.toggleWrap()),
          ],
          [
            toggle("Align Left", "alignLeft", (grid) => grid.actions.setAlign("left"), ALIGN),
            toggle("Center", "alignCenter", (grid) => grid.actions.setAlign("center"), ALIGN),
            toggle("Align Right", "alignRight", (grid) => grid.actions.setAlign("right"), ALIGN),
            {
              kind: "menu",
              id: "mergeAndCenter",
              flags: ["merge"],
              label: "Merge & Center",
              icon: "mergeAndCenter",
              availability: "edit",
              run: (grid) => grid.actions.mergeAndCenter(),
              items: [
                item("Merge & Center", (grid) => grid.actions.mergeAndCenter(), "mergeAndCenter"),
                item("Merge Cells", (grid) => grid.actions.merge(), "merge"),
                item("Unmerge Cells", (grid) => grid.actions.unmerge(), "unmerge"),
              ],
            },
          ],
        ],
      },
      {
        id: "number",
        label: "Number",
        icon: "currency",
        layout: "rows",
        rows: [
          [numberFormat],
          [
            button("Accounting Number Format", "currency", (grid) =>
              grid.actions.setNumberFormat(ACCOUNTING_FORMAT),
            ),
            button("Percent Style", "percent", (grid) =>
              grid.actions.setNumberFormat(PERCENT_FORMAT),
            ),
            button("Comma Style", "comma", (grid) => grid.actions.setNumberFormat(COMMA_FORMAT)),
            button("Increase Decimal", "decimalIncrease", (grid) => grid.actions.stepDecimals(1)),
            button("Decrease Decimal", "decimalDecrease", (grid) => grid.actions.stepDecimals(-1)),
          ],
        ],
      },
      {
        id: "cells",
        label: "Cells",
        icon: "insert",
        layout: "flow",
        controls: [
          {
            kind: "menu",
            id: "insert",
            label: "Insert",
            icon: "insert",
            availability: "edit",
            large: true,
            items: INSERT_ITEMS,
          },
          {
            kind: "menu",
            id: "delete",
            label: "Delete",
            icon: "delete",
            availability: "edit",
            large: true,
            items: DELETE_ITEMS,
          },
          {
            kind: "menu",
            id: "format",
            label: "Format",
            icon: "format",
            availability: "edit",
            large: true,
            items: [
              item("AutoFit Row Height", (grid) => grid.actions.autoFitRows()),
              item("AutoFit Column Width", (grid) => grid.actions.autoFitColumns()),
              ...VISIBILITY_ITEMS,
            ],
          },
        ],
      },
      {
        id: "editing",
        label: "Editing",
        icon: "find",
        layout: "flow",
        controls: [
          button("AutoSum", "autoSum", (grid) => grid.actions.autoSum()),
          {
            kind: "menu",
            id: "clear",
            flags: ["clearFormat"],
            label: "Clear",
            icon: "clear",
            availability: "edit",
            items: [
              item("Clear All", (grid) => grid.actions.clearAll(), "clear"),
              item("Clear Formats", (grid) => grid.actions.clearFormat(), "clearFormat"),
              item("Clear Contents", (grid) => grid.actions.clearContents()),
            ],
          },
          {
            kind: "menu",
            id: "sortFilter",
            flags: SORT,
            label: "Sort & Filter",
            icon: "sortFilter",
            availability: "edit",
            items: SORT_ITEMS,
          },
          button("Find", "find", (grid) => grid.actions.find(), "view"),
        ],
      },
    ],
  },
  {
    label: "Insert",
    reduceOrder: ["notes", "links", "filters", "dashboard", "charts", "tables", "rowsColumns"],
    groups: [
      {
        id: "rowsColumns",
        label: "Rows & Columns",
        icon: "insert",
        layout: "flow",
        controls: [
          {
            kind: "menu",
            id: "insert",
            label: "Insert",
            icon: "insert",
            availability: "edit",
            large: true,
            items: INSERT_ITEMS,
          },
          {
            kind: "menu",
            id: "delete",
            label: "Delete",
            icon: "delete",
            availability: "edit",
            large: true,
            items: DELETE_ITEMS,
          },
        ],
      },
      {
        id: "tables",
        label: "Tables",
        icon: "pivotTable",
        layout: "flow",
        controls: [pivotTable],
      },
      {
        id: "charts",
        label: "Charts",
        icon: "chart",
        layout: "flow",
        controls: [chart],
      },
      {
        id: "dashboard",
        label: "Dashboard",
        icon: "dashboard",
        layout: "flow",
        controls: [
          {
            ...button(
              "New Dashboard",
              "dashboard",
              (grid) => grid.actions.newDashboard(),
              "newDashboard",
              {
                large: true,
              },
            ),
            id: "newDashboard",
          },
        ],
      },
      {
        id: "filters",
        label: "Filters",
        icon: "slicer",
        layout: "flow",
        controls: [
          {
            ...button("Slicer", "slicer", insertSlicer, "newDashboard", { large: true }),
            // A slicer is a dashboard item, so the command shows on a dashboard.
            available: (grid) => activeSheetIsDashboard(grid),
          },
        ],
      },
      { id: "links", label: "Links", icon: "hyperlink", layout: "flow", controls: [hyperlink] },
      { id: "notes", label: "Notes", icon: "note", layout: "flow", controls: [note] },
    ],
  },
  {
    label: "Formulas",
    reduceOrder: ["formulaAuditing", "definedNames", "functionLibrary"],
    groups: [
      {
        id: "functionLibrary",
        label: "Function Library",
        icon: "insertFunction",
        layout: "flow",
        controls: [insertFunction],
      },
      {
        id: "definedNames",
        label: "Defined Names",
        icon: "nameManager",
        layout: "flow",
        controls: [
          button("Name Manager", "nameManager", showNameManager, "view", { large: true }),
          button("Define Name", "defineName", showDefineName, "edit"),
        ],
      },
      {
        id: "formulaAuditing",
        label: "Formula Auditing",
        icon: "explainFormula",
        layout: "flow",
        controls: [
          button("Explain Formula", "explainFormula", showFormulaExplanation, "view", {
            large: true,
          }),
        ],
      },
    ],
  },
  {
    label: "Data",
    reduceOrder: [
      "export",
      "showHide",
      "outline",
      "dataTools",
      "queries",
      "getTransform",
      "sortFilter",
    ],
    groups: [
      {
        id: "getTransform",
        label: "Get & Transform Data",
        icon: "getData",
        layout: "flow",
        controls: [
          {
            ...button("Get Data", "getData", (grid) => showQueryPanel(grid, true), "view", {
              large: true,
            }),
            available: queriesConnected,
          },
        ],
      },
      {
        id: "queries",
        label: "Queries & Connections",
        icon: "queries",
        layout: "flow",
        controls: [
          {
            ...button("Refresh All", "refreshAll", refreshAllQueries, "view", { large: true }),
            available: queriesConnected,
          },
          {
            ...button(
              "Queries & Connections",
              "queries",
              (grid) => showQueryPanel(grid, false),
              "view",
            ),
            available: queriesConnected,
          },
        ],
      },
      {
        id: "sortFilter",
        label: "Sort & Filter",
        icon: "sortFilter",
        layout: "flow",
        controls: [
          button("Sort A to Z", "sortAsc", (grid) => grid.actions.sort(true), "sortAsc", {
            large: true,
            flags: SORT,
          }),
          button("Sort Z to A", "sortDesc", (grid) => grid.actions.sort(false), "sortDesc", {
            large: true,
            flags: SORT,
          }),
          button("Custom Sort", "sortCustom", (grid) => grid.actions.customSort(), "edit", {
            large: true,
            flags: SORT,
          }),
          viewSortButton("Sort View A to Z", "sortViewAsc", true),
          viewSortButton("Sort View Z to A", "sortViewDesc", false),
          button("Clear Filter", "clearFilter", (grid) => grid.actions.clearFilter()),
        ],
      },
      {
        id: "dataTools",
        label: "Data Tools",
        icon: "dataModel",
        layout: "flow",
        controls: [
          {
            // Excel's "Manage Data Model" wraps to three lines under a large
            // glyph, so the label is short and the tooltip keeps Excel's name.
            ...button("Data Model", "dataModel", openDataModel, "view", { large: true }),
            description: "Manage Data Model",
            available: (grid) => workbookTableCount(grid) > 0,
          },
          {
            ...button("Relationships", "relationships", openDataModel, "view", { large: true }),
            available: (grid) => workbookTableCount(grid) > 1,
          },
        ],
      },
      {
        id: "outline",
        label: "Outline",
        icon: "groupRows",
        layout: "flow",
        controls: [
          button("Group", "groupRows", outline(true), "edit", { large: true }),
          button("Ungroup", "ungroupRows", outline(false), "edit", { large: true }),
        ],
      },
      {
        id: "showHide",
        label: "Show/Hide",
        icon: "hideRows",
        layout: "flow",
        controls: VISIBILITY_ITEMS.map((visibility) =>
          button(visibility.label, visibility.icon ?? "format", visibility.run),
        ),
      },
      {
        id: "export",
        label: "Export",
        icon: "exportCsv",
        layout: "flow",
        controls: [
          button("Export CSV", "exportCsv", (grid) => grid.actions.exportCsv(), "exportCsv", {
            flags: EXPORT,
          }),
          button("Export XLSX", "exportXlsx", (grid) => grid.actions.exportXlsx(), "exportXlsx", {
            flags: EXPORT,
          }),
        ],
      },
    ],
  },
  {
    label: "Review",
    reduceOrder: ["versionHistory"],
    groups: [
      {
        id: "versionHistory",
        label: "Version History",
        icon: "versionHistory",
        layout: "flow",
        controls: [
          {
            ...button(
              "Version History",
              "versionHistory",
              (grid) => grid.actions.versionHistory(),
              "versionHistory",
              { large: true },
            ),
            available: (grid) => !grid.getCommandState("versionHistory").disabled,
          },
          {
            ...button(
              "Save Version",
              "saveVersion",
              (grid) => grid.actions.saveVersion(),
              "saveVersion",
            ),
            available: (grid) => !grid.getCommandState("versionHistory").disabled,
          },
        ],
      },
    ],
  },
  {
    label: "View",
    reduceOrder: ["zoom", "freeze"],
    groups: [
      {
        id: "freeze",
        label: "Window",
        icon: "freeze",
        layout: "flow",
        controls: [
          {
            kind: "menu",
            id: "freezePanes",
            label: "Freeze Panes",
            icon: "freeze",
            availability: "view",
            large: true,
            items: [
              item("Freeze Panes", (grid) => grid.actions.freezePanes()),
              item("Freeze Top Row", (grid) => grid.setFrozen(1, 0)),
              item("Freeze First Column", (grid) => grid.setFrozen(0, 1)),
              item("Unfreeze Panes", (grid) => grid.setFrozen(0, 0)),
            ],
          },
        ],
      },
      {
        id: "zoom",
        label: "Zoom",
        icon: "zoomIn",
        layout: "flow",
        controls: [{ kind: "zoom", id: "zoom" }],
      },
    ],
  },
];
