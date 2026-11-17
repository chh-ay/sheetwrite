/**
 * Excel's Format Cells dialog (Ctrl+1): Number, Alignment, Font, Border and
 * Fill tabs over the existing style operations. It loads on first use, with
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
import { formatNumber } from "./number-format.js";
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
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
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
  const inputs = options.map(([optionValue, label]) => {
    const wrapper = document.createElement("label");
    wrapper.className = "sheetwrite-dialog-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = optionValue;
    input.checked = optionValue === value;
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
function colorInputValue(color: string | undefined): string {
  if (color === undefined) return "#000000";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  return short
    ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase()
    : "#000000";
}

let dialogCount = 0;

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
  const numberFormat = cell.style.numberFormat ?? deps.sheet().columns[anchor.col]?.numberFormat;
  const rects: SelRect[] = [];
  deps.selection().forEachRect((rect) => rects.push(rect));
  const color = deps.theme().fg;
  const input = {
    style: { ...cell.style, numberFormat },
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
  const id = `sheetwrite-format-cells-${++dialogCount}`;
  const { style } = input;
  const body = document.createElement("div");
  body.className = "sheetwrite-format-cells";

  // Tabs.
  const tabList = document.createElement("div");
  tabList.setAttribute("role", "tablist");
  tabList.setAttribute("aria-label", "Format Cells");
  tabList.className = "sheetwrite-format-cells-tabs";
  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLDivElement[] = [];
  const addTab = (label: string): HTMLDivElement => {
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
    tab.addEventListener("click", () => showTab(index));
    tabs.push(tab);
    panels.push(panel);
    tabList.append(tab);
    return panel;
  };
  const showTab = (index: number, focus = false): void => {
    for (const [at, tab] of tabs.entries()) {
      const selected = at === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[at]!.hidden = !selected;
    }
    if (focus) tabs[index]?.focus();
  };
  tabList.addEventListener("keydown", (event) => {
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
    showTab(next, true);
  });

  // Number.
  const numberPanel = addTab("Number");
  const startParts = numberFormatParts(style.numberFormat);
  const startCode = numberFormatCode(startParts);
  const category = select(
    CATEGORIES.map((name) => [name, name] as const),
    startParts.category,
  );
  category.size = CATEGORIES.length;
  const decimals = document.createElement("input");
  decimals.type = "number";
  decimals.min = "0";
  decimals.max = String(MAX_DECIMALS);
  decimals.className = "sheetwrite-dialog-control";
  decimals.value = String(startParts.decimals);
  const thousands = checkbox("Use 1000 Separator (,)", startParts.thousands);
  const negative = select(
    [
      ["minus", "-1,234.10"],
      ["parentheses", "(1,234.10)"],
    ],
    startParts.parentheses ? "parentheses" : "minus",
  );
  const dateType = select(
    DATE_TYPES.map((code) => [code, code] as const),
    startParts.category === "Date" ? startParts.code : DATE_TYPES[0]!,
  );
  const timeType = select(
    TIME_TYPES.map((code) => [code, code] as const),
    startParts.category === "Time" ? startParts.code : TIME_TYPES[0]!,
  );
  const fractionType = select(
    FRACTION_TYPES,
    startParts.category === "Fraction" ? startParts.code : FRACTION_TYPES[0]![0],
  );
  const custom = document.createElement("input");
  custom.type = "text";
  custom.className = "sheetwrite-dialog-control";
  custom.maxLength = 255;
  custom.value = startCode;
  const sample = document.createElement("output");
  sample.className = "sheetwrite-format-cells-sample";
  sample.setAttribute("aria-live", "polite");
  const decimalsField = field("Decimal places", decimals);
  const negativeField = field("Negative numbers", negative);
  const dateField = field("Type", dateType);
  const timeField = field("Type", timeType);
  const fractionField = field("Type", fractionType);
  const customField = field("Type", custom);
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
          ? dateType.value
          : name === "Time"
            ? timeType.value
            : name === "Fraction"
              ? fractionType.value
              : custom.value.trim(),
    };
  };
  const refreshNumber = (): void => {
    const name = category.value as NumberCategory;
    decimalsField.hidden = ![
      "Number",
      "Currency",
      "Accounting",
      "Percentage",
      "Scientific",
    ].includes(name);
    thousands.wrapper.hidden = name !== "Number";
    negativeField.hidden = name !== "Number" && name !== "Currency";
    dateField.hidden = name !== "Date";
    timeField.hidden = name !== "Time";
    fractionField.hidden = name !== "Fraction";
    customField.hidden = name !== "Custom";
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
  };
  // Choosing Custom starts from the code the other settings made, as Excel does.
  category.addEventListener("change", () => {
    if (category.value === "Custom" && custom.value.trim() === "") custom.value = startCode;
    refreshNumber();
  });
  for (const control of [
    decimals,
    thousands.input,
    negative,
    dateType,
    timeType,
    fractionType,
    custom,
  ]) {
    control.addEventListener("input", refreshNumber);
    control.addEventListener("change", refreshNumber);
  }
  numberPanel.append(
    field("Category", category),
    field("Sample", sample),
    decimalsField,
    thousands.wrapper,
    negativeField,
    dateField,
    timeField,
    fractionField,
    customField,
  );
  refreshNumber();

  // Alignment.
  const alignmentPanel = addTab("Alignment");
  const startAlign = style.align ?? "general";
  const startVertical = style.verticalAlign ?? "middle";
  const horizontal = select(
    [
      ["general", "General"],
      ["left", "Left"],
      ["center", "Center"],
      ["right", "Right"],
    ],
    startAlign,
  );
  const vertical = select(
    [
      ["top", "Top"],
      ["middle", "Center"],
      ["bottom", "Bottom"],
    ],
    startVertical,
  );
  const wrap = checkbox("Wrap text", style.wrap === true);
  alignmentPanel.append(field("Horizontal", horizontal), field("Vertical", vertical), wrap.wrapper);

  // Font.
  const fontPanel = addTab("Font");
  const themeFont = fontShorthandParts(input.font);
  const startFamily = style.fontFamily ?? "";
  const family = select(
    [
      ["", `${themeFont.family ?? "Theme font"} (default)`],
      ...FONT_FAMILIES.filter((name) => name !== themeFont.family).map(
        (name) => [name, name] as const,
      ),
      ...(startFamily !== "" && !FONT_FAMILIES.includes(startFamily)
        ? [[startFamily, startFamily] as const]
        : []),
    ],
    startFamily,
  );
  const startPoints = pixelsToPoints(style.fontSize ?? themeFont.px ?? pointsToPixels(11));
  const sizes = [...new Set([...FONT_SIZES_PT, startPoints])].sort((a, b) => a - b);
  const size = select(
    sizes.map((points) => [String(points), String(points)] as const),
    String(startPoints),
  );
  const bold = checkbox("Bold", style.bold === true);
  const italic = checkbox("Italic", style.italic === true);
  const underline = checkbox("Underline", style.underline === true);
  const strikethrough = checkbox("Strikethrough", style.strikethrough === true);
  const automaticColor = checkbox("Automatic color", style.color === undefined);
  const color = document.createElement("input");
  color.type = "color";
  color.value = colorInputValue(style.color);
  color.disabled = style.color === undefined;
  automaticColor.input.addEventListener("change", () => {
    color.disabled = automaticColor.input.checked;
  });
  fontPanel.append(
    field("Font", family),
    field("Size", size),
    bold.wrapper,
    italic.wrapper,
    underline.wrapper,
    strikethrough.wrapper,
    automaticColor.wrapper,
    field("Color", color),
  );

  // Border.
  const borderPanel = addTab("Border");
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
  borderPanel.append(border.group);

  // Fill.
  const fillPanel = addTab("Fill");
  const startFill = style.backgroundColor === undefined ? "none" : "color";
  const fill = radios(
    `${id}-fill`,
    [
      ["none", "No fill"],
      ["color", "Color"],
    ],
    startFill,
  );
  fill.group.setAttribute("aria-label", "Background");
  const fillColor = document.createElement("input");
  fillColor.type = "color";
  fillColor.value = colorInputValue(style.backgroundColor ?? "#ffffff");
  fillColor.setAttribute("aria-label", "Background color");
  fillColor.addEventListener("input", () => {
    for (const option of fill.inputs) option.checked = option.value === "color";
  });
  fillPanel.append(fill.group, fillColor);

  body.append(tabList, ...panels);
  showTab(0);
  // Each setting the user changes previews at once, as OK would apply it.
  const notify = (): void => input.onChange?.(change());
  body.addEventListener("input", notify);
  body.addEventListener("change", notify);

  /** Only what changed, so the other properties of a mixed selection stay. */
  const change = (): FormatCellsChange => {
    const next: Partial<CellStyle> = {};
    const code = numberFormatCode(parts());
    if (code !== startCode) next.numberFormat = code;
    if (horizontal.value !== startAlign) {
      next.align = horizontal.value === "general" ? undefined : (horizontal.value as CellAlign);
    }
    if (vertical.value !== startVertical) next.verticalAlign = vertical.value as CellVerticalAlign;
    if (wrap.input.checked !== (style.wrap === true)) next.wrap = wrap.input.checked;
    if (family.value !== startFamily)
      next.fontFamily = family.value === "" ? undefined : family.value;
    if (Number(size.value) !== startPoints) next.fontSize = pointsToPixels(Number(size.value));
    for (const [key, box] of [
      ["bold", bold],
      ["italic", italic],
      ["underline", underline],
      ["strikethrough", strikethrough],
    ] as const) {
      if (box.input.checked !== (style[key] === true)) next[key] = box.input.checked;
    }
    const nextColor = automaticColor.input.checked ? undefined : color.value;
    if (nextColor !== (style.color === undefined ? undefined : colorInputValue(style.color))) {
      next.color = nextColor;
    }
    const nextFill = fill.value() === "none" ? undefined : fillColor.value;
    if (
      nextFill !==
      (style.backgroundColor === undefined ? undefined : colorInputValue(style.backgroundColor))
    ) {
      next.backgroundColor = nextFill;
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
      showTab(0);
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
