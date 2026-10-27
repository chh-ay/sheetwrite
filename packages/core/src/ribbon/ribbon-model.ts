// What the ribbon shows, as data: tabs, groups and controls bound to the
// public Grid API. The DOM side (ribbon-controls.ts) renders these specs and
// never decides behavior itself, so Excel parity is reviewed here alone.

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
import { createHyperlinkId, isSafeExternalHyperlink } from "../hyperlink.js";
import type { IconName } from "../icons/icon-names.js";
import type { CellStyle } from "../types/cell.js";
import type { CellAddress } from "../types/coordinates.js";
import type { BorderPreset, Grid, GridCommandName } from "../types/grid.js";

export type RibbonIcon = IconName;

/**
 * Where a control's disabled state comes from. `edit` borrows the state of a
 * selection-scoped edit command, which is disabled exactly when the grid is
 * read-only or nothing is selected; `view` controls never disable.
 */
export type RibbonAvailability = GridCommandName | "edit" | "view";

/** The command whose state stands in for every selection-scoped edit. */
export const EDIT_STATE_COMMAND: GridCommandName = "clearFormat";

interface RibbonMenuItem {
  readonly label: string;
  readonly icon?: RibbonIcon;
  readonly run: (grid: Grid) => unknown;
}

/** A command button; `toggle` buttons reflect their command's activity. */
export interface RibbonButtonSpec {
  readonly kind: "button";
  readonly label: string;
  readonly icon: RibbonIcon;
  readonly run: (grid: Grid) => unknown;
  readonly availability: RibbonAvailability;
  readonly toggle?: boolean;
  readonly large?: boolean;
}

/**
 * A dropdown. With `run`, it is a split button: the face runs the default
 * command and the arrow opens the menu, as Excel's Paste and Borders do.
 */
export interface RibbonMenuSpec {
  readonly kind: "menu";
  readonly label: string;
  readonly icon: RibbonIcon;
  readonly availability: RibbonAvailability;
  readonly items: readonly RibbonMenuItem[];
  readonly run?: (grid: Grid) => unknown;
  readonly large?: boolean;
}

/**
 * What the value boxes show, read once per refresh instead of once per box:
 * the focus cell's effective style and the theme font unstyled cells use.
 */
export interface RibbonFocus {
  readonly style: CellStyle;
  readonly themeFontFamily: string | undefined;
  readonly themeFontPx: number | undefined;
}

/** An editable dropdown (font, size, number format). */
export interface RibbonComboSpec {
  readonly kind: "combo";
  readonly label: string;
  /** Width in CSS pixels; Excel sizes each box to its longest common value. */
  readonly width: number;
  readonly availability: RibbonAvailability;
  readonly options: readonly string[];
  /** Render each option in its own typeface, as Excel's font list does. */
  readonly previewFont?: boolean;
  readonly read: (focus: RibbonFocus) => string;
  /** Apply typed or picked text; returns false when the text is not valid. */
  readonly apply: (grid: Grid, value: string) => boolean;
}

/** Excel's font-color and fill-color split buttons with a palette menu. */
export interface RibbonColorSpec {
  readonly kind: "color";
  readonly label: string;
  readonly icon: RibbonIcon;
  /** Palette entry that removes the color ("Automatic" / "No Fill"). */
  readonly clearLabel: string;
  /** Color the face applies before the user picks one, as in Excel. */
  readonly initial: string;
  readonly apply: (grid: Grid, color: string | null) => void;
}

/** A button that opens a one-field form at the focus cell (link, note). */
export interface RibbonFormSpec {
  readonly kind: "form";
  readonly label: string;
  readonly icon: RibbonIcon;
  readonly field: string;
  readonly multiline: boolean;
  readonly read: (grid: Grid, cell: CellAddress) => string;
  /** Save the value; returns an error message to show, or null on success. */
  readonly submit: (grid: Grid, cell: CellAddress, value: string) => string | null;
}

/** Zoom out / current percent / zoom in, as in Excel's View > Zoom group. */
interface RibbonZoomSpec {
  readonly kind: "zoom";
}

export type RibbonControlSpec =
  | RibbonButtonSpec
  | RibbonMenuSpec
  | RibbonComboSpec
  | RibbonColorSpec
  | RibbonFormSpec
  | RibbonZoomSpec;

/**
 * One ribbon group. `flow` groups hold buttons that can shrink from large to
 * small before collapsing. `rows` groups are Excel's dense Font, Alignment and
 * Number layouts: their rows only ever collapse whole.
 */
export type RibbonGroupSpec =
  | {
      readonly id: string;
      readonly label: string;
      readonly icon: RibbonIcon;
      readonly layout: "flow";
      readonly controls: readonly RibbonControlSpec[];
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly icon: RibbonIcon;
      readonly layout: "rows";
      readonly rows: readonly (readonly RibbonControlSpec[])[];
    };

export interface RibbonTabSpec {
  readonly label: string;
  readonly groups: readonly RibbonGroupSpec[];
  /**
   * Group ids in the order they give up space as the ribbon narrows. Excel
   * shrinks the right-hand, less-used groups first.
   */
  readonly reduceOrder: readonly string[];
}

/** Zoom limits and step of `Grid.setZoom`, shown as percents. */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const EXCEL_THEME_TEXT = "#c00000";
const EXCEL_THEME_FILL = "#ffff00";

const PERCENT_SCALE = 100;
const MAX_FONT_SIZE_PT = 409;

/** The cell link and note forms act on: a single cell, or a range's anchor. */
export function focusAddress(grid: Grid): CellAddress | null {
  const selection = grid.getSelection();
  if (selection?.kind === "cell") return selection.addr;
  if (selection?.kind === "range") {
    return { sheet: selection.range.sheet, ...selection.range.start };
  }
  return null;
}

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

const button = (
  label: string,
  icon: RibbonIcon,
  run: (grid: Grid) => unknown,
  availability: RibbonAvailability = "edit",
  options: { toggle?: boolean; large?: boolean } = {},
): RibbonButtonSpec => ({ kind: "button", label, icon, run, availability, ...options });

const toggle = (
  label: string,
  icon: RibbonIcon & GridCommandName,
  run: (grid: Grid) => unknown,
): RibbonButtonSpec => button(label, icon, run, icon, { toggle: true });

const item = (label: string, run: (grid: Grid) => unknown, icon?: RibbonIcon): RibbonMenuItem =>
  icon === undefined ? { label, run } : { label, icon, run };

const BORDER_ITEMS: readonly [string, RibbonIcon, BorderPreset][] = [
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
  item("Clear Filter", (grid) => grid.actions.clearFilter(), "clearFilter"),
];

const fontFamily: RibbonComboSpec = {
  kind: "combo",
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
  label: "Font Color",
  icon: "textColor",
  clearLabel: "Automatic",
  initial: EXCEL_THEME_TEXT,
  apply: (grid, color) => grid.actions.setTextColor(color),
};

const fillColor: RibbonColorSpec = {
  kind: "color",
  label: "Fill Color",
  icon: "fillColor",
  clearLabel: "No Fill",
  initial: EXCEL_THEME_FILL,
  apply: (grid, color) => grid.actions.setFillColor(color),
};

const HYPERLINK_ERROR = "Enter a full http, https or mailto address.";

const hyperlink: RibbonFormSpec = {
  kind: "form",
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

function outline(group: boolean): (grid: Grid) => void {
  return (grid) => {
    for (const [start, end] of selectedRowSpans(grid)) {
      if (group) grid.groupRows(start, end);
      else grid.ungroupRows(start, end);
    }
  };
}

/** Percent label for a zoom factor, e.g. 1.1 → "110%". */
export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * PERCENT_SCALE)}%`;
}

/** The next zoom step, clamped to the grid's range and kept on whole percents. */
export function steppedZoom(zoom: number, direction: 1 | -1): number {
  const next = Math.round((zoom + direction * ZOOM_STEP) * PERCENT_SCALE) / PERCENT_SCALE;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

/** The ribbon's tabs, in Excel's order and with Excel's labels. */
export const RIBBON_TABS: readonly RibbonTabSpec[] = [
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
          button("Undo", "undo", (grid) => grid.actions.undo(), "undo"),
          button("Redo", "redo", (grid) => grid.actions.redo(), "redo"),
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
            toggle("Bold", "bold", (grid) => grid.actions.toggleBold()),
            toggle("Italic", "italic", (grid) => grid.actions.toggleItalic()),
            toggle("Underline", "underline", (grid) => grid.actions.toggleUnderline()),
            toggle("Strikethrough", "strikethrough", (grid) => grid.actions.toggleStrikethrough()),
            {
              kind: "menu",
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
            toggle("Top Align", "alignTop", (grid) => grid.actions.setVerticalAlign("top")),
            toggle("Middle Align", "alignMiddle", (grid) =>
              grid.actions.setVerticalAlign("middle"),
            ),
            toggle("Bottom Align", "alignBottom", (grid) =>
              grid.actions.setVerticalAlign("bottom"),
            ),
            toggle("Wrap Text", "wrap", (grid) => grid.actions.toggleWrap()),
          ],
          [
            toggle("Align Left", "alignLeft", (grid) => grid.actions.setAlign("left")),
            toggle("Center", "alignCenter", (grid) => grid.actions.setAlign("center")),
            toggle("Align Right", "alignRight", (grid) => grid.actions.setAlign("right")),
            {
              kind: "menu",
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
            label: "Insert",
            icon: "insert",
            availability: "edit",
            large: true,
            items: INSERT_ITEMS,
          },
          {
            kind: "menu",
            label: "Delete",
            icon: "delete",
            availability: "edit",
            large: true,
            items: DELETE_ITEMS,
          },
          {
            kind: "menu",
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
    reduceOrder: ["notes", "links", "rowsColumns"],
    groups: [
      {
        id: "rowsColumns",
        label: "Rows & Columns",
        icon: "insert",
        layout: "flow",
        controls: [
          {
            kind: "menu",
            label: "Insert",
            icon: "insert",
            availability: "edit",
            large: true,
            items: INSERT_ITEMS,
          },
          {
            kind: "menu",
            label: "Delete",
            icon: "delete",
            availability: "edit",
            large: true,
            items: DELETE_ITEMS,
          },
        ],
      },
      { id: "links", label: "Links", icon: "hyperlink", layout: "flow", controls: [hyperlink] },
      { id: "notes", label: "Notes", icon: "note", layout: "flow", controls: [note] },
    ],
  },
  {
    label: "Data",
    reduceOrder: ["showHide", "outline", "sortFilter"],
    groups: [
      {
        id: "sortFilter",
        label: "Sort & Filter",
        icon: "sortFilter",
        layout: "flow",
        controls: [
          button("Sort A to Z", "sortAsc", (grid) => grid.actions.sort(true), "sortAsc", {
            large: true,
          }),
          button("Sort Z to A", "sortDesc", (grid) => grid.actions.sort(false), "sortDesc", {
            large: true,
          }),
          button("Clear Filter", "clearFilter", (grid) => grid.actions.clearFilter()),
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
      { id: "zoom", label: "Zoom", icon: "zoomIn", layout: "flow", controls: [{ kind: "zoom" }] },
    ],
  },
];
