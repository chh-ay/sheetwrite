/**
 * Excel's Format Cells dialog (Ctrl+1): Number, Alignment, Font, Border and
 * Fill tabs over the grid's style actions. It loads on first use, with
 * the dialog shell it uses.
 */

import { type DialogHost, openDialog } from "./dialog.js";
import {
  DATE_TYPES,
  FONT_FAMILIES,
  FONT_SIZES_PT,
  FRACTION_TYPES,
  fontShorthandParts,
  MAX_DECIMALS,
  type NumberCategory,
  type NumberFormatParts,
  numberFormatCode,
  numberFormatParts,
  pixelsToPoints,
  pointsToPixels,
  TIME_TYPES,
} from "./format-presets.js";
import { formatPreview } from "./format-preview.js";
import { formatNumber, numberFormatColor } from "./number-format.js";
import type { PaintedWindowTransform } from "./read-window-controller.js";
import type { SelRect } from "./selection.js";
import type { StyleActionsDeps } from "./style-actions.js";
import type { CellAlign, CellScalar, CellStyle, CellVerticalAlign } from "./types/cell.js";
import type { BorderPreset } from "./types/grid.js";

/** What the dialog starts from: the active cell. */
export interface FormatCellsInput {
  /** The active cell's style, with its column's number format when it has none of its own. */
  readonly style: CellStyle;
  /** The active cell's value, shown in the Number tab's sample. */
  readonly sample: CellScalar;
  /** The theme's font shorthand, for the size and family an unstyled cell shows. */
  readonly font: string;
  /** Called with what OK would change each time the user changes a setting. */
  readonly onChange?: (change: FormatCellsChange) => void;
}

/** What OK changes: only the properties the user changed, and a border preset. */
export interface FormatCellsChange {
  readonly style: Partial<CellStyle>;
  readonly border: BorderPreset | null;
}

/** The Number tab's categories, in Excel's order. */
const CATEGORIES: readonly NumberCategory[] = [
  "General",
  "Number",
  "Currency",
  "Accounting",
  "Date",
  "Time",
  "Percentage",
  "Fraction",
  "Scientific",
  "Text",
  "Custom",
];

/** Label text for a control, and the wrapper that holds both. */
function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "sheetwrite-dialog-field";
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.append(text, control);
  return wrapper;
}

function select(options: readonly (readonly [string, string])[], value: string): HTMLSelectElement {
  const element = document.createElement("select");
  element.className = "sheetwrite-dialog-control";
  for (const [option_value, label] of options) {
    const option = document.createElement("option");
    option.value = option_value;
    option.textContent = label;
    element.append(option);
  }
  element.value = value;
  return element;
}

function checkbox(
  label: string,
  checked: boolean,
): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = document.createElement("label");
  wrapper.className = "sheetwrite-dialog-choice";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  wrapper.append(input, label);
  return { wrapper, input };
}

function radios(
  name: string,
  options: readonly (readonly [string, string])[],
  value: string,
): { group: HTMLFieldSetElement; value: () => string; inputs: HTMLInputElement[] } {
  const group = document.createElement("fieldset");
  group.className = "sheetwrite-dialog-choices";
  const inputs = options.map(([option_value, label]) => {
    const wrapper = document.createElement("label");
    wrapper.className = "sheetwrite-dialog-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option_value;
    input.checked = option_value === value;
    wrapper.append(input, label);
    group.append(wrapper);
    return input;
  });
  return {
    group,
    inputs,
    value: () => inputs.find((input) => input.checked)?.value ?? value,
  };
}

/** `#rgb` or `#rrggbb` as the `#rrggbb` a color input takes; black otherwise. */
function color_input_value(color: string | undefined): string {
  if (color === undefined) return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
    : "#000000";
}

let dialog_count = 0;

/**
 * Open Format Cells for the selection behind `deps`, showing its active
 * cell's format, with its column's number format when it has none of its
 * own. Resolves to the changes on OK, or to `null`. While it is open,
 * `preview` receives a transform of the painted windows that shows the
 * selected cells as OK would format them; it receives `null` when the dialog
 * closes, before the result resolves.
 */
export function formatSelectionDialog(
  grid: DialogHost,
  deps: StyleActionsDeps,
  font: string,
  preview?: (transform: PaintedWindowTransform | null) => void,
): Promise<FormatCellsChange | null> {
  const focus = deps.selection().focusCell;
  if (focus === null) return Promise.resolve(null);
  const anchor = deps.anchorCell(focus.row, focus.col);
  const cell = deps.store.getCell({
    sheet: deps.activeSheet(),
    row: deps.toDataRow(anchor.row),
    col: anchor.col,
  });
  const number_format = cell.style.numberFormat ?? deps.sheet().columns[anchor.col]?.numberFormat;
  const rects: SelRect[] = [];
  deps.selection().forEachRect((rect) => rects.push(rect));
  const color = deps.theme().fg;
  const input = {
    style: { ...cell.style, numberFormat: number_format },
    sample: cell.resolved,
    font,
    onChange:
      preview && ((change: FormatCellsChange) => preview(formatPreview(rects, change, color))),
  };
  return formatCellsDialog(grid, input).result.then((change) => {
    preview?.(null);
    return change;
  });
}

/**
 * Open Format Cells over `host`. `result` resolves to the changes on OK, or
 * to `null` on Cancel, Escape or close. The tabs follow the ARIA tabs
 * pattern: arrow keys move between them, Tab enters the shown panel.
 */
export function formatCellsDialog(
  grid: DialogHost,
  input: FormatCellsInput,
): { readonly result: Promise<FormatCellsChange | null>; close(): void } {
  const id = `sheetwrite-format-cells-${++dialog_count}`;
  const { style } = input;
  const body = document.createElement("div");
  body.className = "sheetwrite-format-cells";

  const tab_list = document.createElement("div");
  tab_list.setAttribute("role", "tablist");
  tab_list.setAttribute("aria-label", "Format Cells");
  tab_list.className = "sheetwrite-format-cells-tabs";
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLDivElement[] = [];
  const add_tab = (label: string): HTMLDivElement => {
    const index = tabs.length;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `${id}-tab-${index}`;
    tab.className = "sheetwrite-format-cells-tab";
    tab.setAttribute("role", "tab");
    tab.textContent = label;
    const panel = document.createElement("div");
    panel.id = `${id}-panel-${index}`;
    panel.className = "sheetwrite-format-cells-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);
    tab.addEventListener("click", () => show_tab(index));
    tabs.push(tab);
    panels.push(panel);
    tab_list.append(tab);
    return panel;
  };
  const show_tab = (index: number, focus = false): void => {
    for (const [at, tab] of tabs.entries()) {
      const selected = at === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[at]!.hidden = !selected;
    }
    if (focus) tabs[index]?.focus();
  };
  tab_list.addEventListener("keydown", (event) => {
    const current = tabs.findIndex((tab) => tab === event.target);
    if (current < 0) return;
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? current === last
          ? 0
          : current + 1
        : event.key === "ArrowLeft"
          ? current === 0
            ? last
            : current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    show_tab(next, true);
  });

  const number_panel = add_tab("Number");
  const start_parts = numberFormatParts(style.numberFormat);
  const start_code = numberFormatCode(start_parts);
  const category = select(
    CATEGORIES.map((name) => [name, name] as const),
    start_parts.category,
  );
  category.size = CATEGORIES.length;
  const decimals = document.createElement("input");
  decimals.type = "number";
  decimals.min = "0";
  decimals.max = String(MAX_DECIMALS);
  decimals.className = "sheetwrite-dialog-control";
  decimals.value = String(start_parts.decimals);
  const thousands = checkbox("Use 1000 Separator (,)", start_parts.thousands);
  const negative = select(
    [
      ["minus", "-1,234.10"],
      ["parentheses", "(1,234.10)"],
    ],
    start_parts.parentheses ? "parentheses" : "minus",
  );
  const date_type = select(
    DATE_TYPES.map((code) => [code, code] as const),
    start_parts.category === "Date" ? start_parts.code : DATE_TYPES[0]!,
  );
  const time_type = select(
    TIME_TYPES.map((code) => [code, code] as const),
    start_parts.category === "Time" ? start_parts.code : TIME_TYPES[0]!,
  );
  const fraction_type = select(
    FRACTION_TYPES,
    start_parts.category === "Fraction" ? start_parts.code : FRACTION_TYPES[0]![0],
  );
  const custom = document.createElement("input");
  custom.type = "text";
  custom.className = "sheetwrite-dialog-control";
  custom.maxLength = 255;
  custom.value = start_code;
  const sample = document.createElement("output");
  sample.className = "sheetwrite-format-cells-sample";
  sample.setAttribute("aria-live", "polite");
  const decimals_field = field("Decimal places", decimals);
  const negative_field = field("Negative numbers", negative);
  const date_field = field("Type", date_type);
  const time_field = field("Type", time_type);
  const fraction_field = field("Type", fraction_type);
  const custom_field = field("Type", custom);
  const parts = (): NumberFormatParts => {
    const name = category.value as NumberCategory;
    const count = Math.min(MAX_DECIMALS, Math.max(0, Math.trunc(Number(decimals.value) || 0)));
    return {
      category: name,
      decimals: count,
      thousands: thousands.input.checked,
      parentheses: negative.value === "parentheses",
      code:
        name === "Date"
          ? date_type.value
          : name === "Time"
            ? time_type.value
            : name === "Fraction"
              ? fraction_type.value
              : custom.value.trim(),
    };
  };
  const refresh_number = (): void => {
    const name = category.value as NumberCategory;
    decimals_field.hidden = ![
      "Number",
      "Currency",
      "Accounting",
      "Percentage",
      "Scientific",
    ].includes(name);
    thousands.wrapper.hidden = name !== "Number";
    negative_field.hidden = name !== "Number" && name !== "Currency";
    date_field.hidden = name !== "Date";
    time_field.hidden = name !== "Time";
    fraction_field.hidden = name !== "Fraction";
    custom_field.hidden = name !== "Custom";
    const code = numberFormatCode(parts());
    custom.setAttribute("aria-invalid", String(name === "Custom" && code === ""));
    let shown = "";
    if (input.sample !== null && input.sample !== "" && code !== "") {
      try {
        shown =
          typeof input.sample === "number" || typeof input.sample === "string"
            ? formatNumber(input.sample, code)
            : String(input.sample).toUpperCase();
      } catch {
        shown = "";
      }
    }
    sample.textContent = shown;
    // Excel's sample shows the number in its section's color, such as `[Red]`.
    sample.style.color =
      typeof input.sample === "number" ? (numberFormatColor(input.sample, code) ?? "") : "";
  };
  // Choosing Custom starts from the code the other settings made, as Excel does.
  category.addEventListener("change", () => {
    if (category.value === "Custom" && custom.value.trim() === "") custom.value = start_code;
    refresh_number();
  });
  for (const control of [
    decimals,
    thousands.input,
    negative,
    date_type,
    time_type,
    fraction_type,
    custom,
  ]) {
    control.addEventListener("input", refresh_number);
    control.addEventListener("change", refresh_number);
  }
  number_panel.append(
    field("Category", category),
    field("Sample", sample),
    decimals_field,
    thousands.wrapper,
    negative_field,
    date_field,
    time_field,
    fraction_field,
    custom_field,
  );
  refresh_number();

  const alignment_panel = add_tab("Alignment");
  const start_align = style.align ?? "general";
  const start_vertical = style.verticalAlign ?? "middle";
  const horizontal = select(
    [
      ["general", "General"],
      ["left", "Left"],
      ["center", "Center"],
      ["right", "Right"],
    ],
    start_align,
  );
  const vertical = select(
    [
      ["top", "Top"],
      ["middle", "Center"],
      ["bottom", "Bottom"],
    ],
    start_vertical,
  );
  const wrap = checkbox("Wrap text", style.wrap === true);
  alignment_panel.append(
    field("Horizontal", horizontal),
    field("Vertical", vertical),
    wrap.wrapper,
  );

  const font_panel = add_tab("Font");
  const theme_font = fontShorthandParts(input.font);
  const start_family = style.fontFamily ?? "";
  const family = select(
    [
      ["", `${theme_font.family ?? "Theme font"} (default)`],
      ...FONT_FAMILIES.filter((name) => name !== theme_font.family).map(
        (name) => [name, name] as const,
      ),
      ...(start_family !== "" && !FONT_FAMILIES.includes(start_family)
        ? [[start_family, start_family] as const]
        : []),
    ],
    start_family,
  );
  const start_points = pixelsToPoints(style.fontSize ?? theme_font.px ?? pointsToPixels(11));
  const sizes = [...new Set([...FONT_SIZES_PT, start_points])].sort((a, b) => a - b);
  const size = select(
    sizes.map((points) => [String(points), String(points)] as const),
    String(start_points),
  );
  const bold = checkbox("Bold", style.bold === true);
  const italic = checkbox("Italic", style.italic === true);
  const underline = checkbox("Underline", style.underline === true);
  const strikethrough = checkbox("Strikethrough", style.strikethrough === true);
  const automatic_color = checkbox("Automatic color", style.color === undefined);
  const color = document.createElement("input");
  color.type = "color";
  color.value = color_input_value(style.color);
  color.disabled = style.color === undefined;
  automatic_color.input.addEventListener("change", () => {
    color.disabled = automatic_color.input.checked;
  });
  font_panel.append(
    field("Font", family),
    field("Size", size),
    bold.wrapper,
    italic.wrapper,
    underline.wrapper,
    strikethrough.wrapper,
    automatic_color.wrapper,
    field("Color", color),
  );

  const border_panel = add_tab("Border");
  const border = radios(
    `${id}-border`,
    [
      ["keep", "No change"],
      ["none", "None"],
      ["outside", "Outline"],
      ["all", "All borders"],
      ["thickOutside", "Thick outline"],
      ["top", "Top"],
      ["bottom", "Bottom"],
      ["left", "Left"],
      ["right", "Right"],
    ],
    "keep",
  );
  border.group.setAttribute("aria-label", "Presets");
  border_panel.append(border.group);

  const fill_panel = add_tab("Fill");
  const start_fill = style.backgroundColor === undefined ? "none" : "color";
  const fill = radios(
    `${id}-fill`,
    [
      ["none", "No fill"],
      ["color", "Color"],
    ],
    start_fill,
  );
  fill.group.setAttribute("aria-label", "Background");
  const fill_color = document.createElement("input");
  fill_color.type = "color";
  fill_color.value = color_input_value(style.backgroundColor ?? "#ffffff");
  fill_color.setAttribute("aria-label", "Background color");
  fill_color.addEventListener("input", () => {
    for (const option of fill.inputs) option.checked = option.value === "color";
  });
  fill_panel.append(fill.group, fill_color);

  body.append(tab_list, ...panels);
  show_tab(0);
  // Each setting the user changes previews at once, as OK would apply it.
  const notify = (): void => input.onChange?.(change());
  body.addEventListener("input", notify);
  body.addEventListener("change", notify);

  /** Only what changed, so the other properties of a mixed selection stay. */
  const change = (): FormatCellsChange => {
    const next: Partial<CellStyle> = {};
    const code = numberFormatCode(parts());
    if (code !== start_code) next.numberFormat = code;
    if (horizontal.value !== start_align) {
      next.align = horizontal.value === "general" ? undefined : (horizontal.value as CellAlign);
    }
    if (vertical.value !== start_vertical) next.verticalAlign = vertical.value as CellVerticalAlign;
    if (wrap.input.checked !== (style.wrap === true)) next.wrap = wrap.input.checked;
    if (family.value !== start_family)
      next.fontFamily = family.value === "" ? undefined : family.value;
    if (Number(size.value) !== start_points) next.fontSize = pointsToPixels(Number(size.value));
    for (const [key, box] of [
      ["bold", bold],
      ["italic", italic],
      ["underline", underline],
      ["strikethrough", strikethrough],
    ] as const) {
      if (box.input.checked !== (style[key] === true)) next[key] = box.input.checked;
    }
    const next_color = automatic_color.input.checked ? undefined : color.value;
    if (next_color !== (style.color === undefined ? undefined : color_input_value(style.color))) {
      next.color = next_color;
    }
    const next_fill = fill.value() === "none" ? undefined : fill_color.value;
    if (
      next_fill !==
      (style.backgroundColor === undefined ? undefined : color_input_value(style.backgroundColor))
    ) {
      next.backgroundColor = next_fill;
    }
    const preset = border.value();
    return { style: next, border: preset === "keep" ? null : (preset as BorderPreset) };
  };

  const dialog = openDialog(grid, {
    title: "Format Cells",
    body,
    buttons: [
      { label: "OK", value: "ok", default: true },
      { label: "Cancel", value: "cancel" },
    ],
    cancel: "cancel",
    initialFocus: tabs[0],
    accept: () => {
      if (category.value !== "Custom" || custom.value.trim() !== "") return true;
      show_tab(0);
      custom.focus();
      return false;
    },
  });
  dialog.element.classList.add("sheetwrite-format-cells-dialog");
  return {
    result: dialog.result.then((value) => (value === "ok" ? change() : null)),
    close: () => dialog.close(),
  };
}
