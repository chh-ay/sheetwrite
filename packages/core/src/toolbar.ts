import { actionFeedbackFor } from "./action-feedback.js";
import { COMMAND_ICONS } from "./command-icons.js";
import { isIconName } from "./icons/resolve.js";
import { isKeyboardAction } from "./keymap.js";
import type {
  Grid,
  GridActions,
  GridCommandName,
  GridCommandState,
  GridConfig,
  IconOverrides,
  ToolbarActionName,
  ToolbarIcon,
  ToolbarItem,
} from "./types/grid.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/** Accessible tooltip for each built-in action. */
const DEFAULT_TITLE: Record<Exclude<ToolbarActionName, "separator">, string> = {
  bold: "Bold",
  undo: "Undo",
  redo: "Redo",
  italic: "Italic",
  underline: "Underline",
  strikethrough: "Strikethrough",
  alignLeft: "Align left",
  alignCenter: "Align center",
  alignRight: "Align right",
  alignTop: "Align top",
  alignMiddle: "Align middle",
  alignBottom: "Align bottom",
  wrap: "Wrap text",
  textColor: "Text color",
  fillColor: "Fill color",
  border: "Border",
  clearFormat: "Clear formatting",
  merge: "Merge cells",
  unmerge: "Unmerge cells",
  sortAsc: "Sort ascending",
  sortDesc: "Sort descending",
  exportCsv: "Export CSV",
  exportXlsx: "Export XLSX",
};

/** Shared mousedown guard so a control click never steals focus from the grid. */
const preventDefault = (event: Event): void => event.preventDefault();

/**
 * Dispatch one built-in toolbar action to its `GridActions` method. Returns
 * the action's promise when it has one, so the caller can track it.
 */
function runAction(actions: GridActions, action: ToolbarActionName): unknown {
  switch (action) {
    case "undo":
      actions.undo();
      break;
    case "redo":
      actions.redo();
      break;
    case "bold":
      actions.toggleBold();
      break;
    case "italic":
      actions.toggleItalic();
      break;
    case "underline":
      actions.toggleUnderline();
      break;
    case "strikethrough":
      actions.toggleStrikethrough();
      break;
    case "alignLeft":
      actions.setAlign("left");
      break;
    case "alignCenter":
      actions.setAlign("center");
      break;
    case "alignRight":
      actions.setAlign("right");
      break;
    case "alignTop":
      actions.setVerticalAlign("top");
      break;
    case "alignMiddle":
      actions.setVerticalAlign("middle");
      break;
    case "alignBottom":
      actions.setVerticalAlign("bottom");
      break;
    case "wrap":
      actions.toggleWrap();
      break;
    case "border":
      actions.toggleBorder();
      break;
    case "clearFormat":
      actions.clearFormat();
      break;
    case "merge":
      actions.merge();
      break;
    case "unmerge":
      actions.unmerge();
      break;
    case "sortAsc":
      actions.sort(true);
      break;
    case "sortDesc":
      actions.sort(false);
      break;
    case "exportCsv":
      actions.exportCsv();
      break;
    case "exportXlsx":
      return actions.exportXlsx();
  }
}

/**
 * The default per-flag item list the built-in toolbar renders when no custom
 * `ToolbarItem[]` is supplied. Also the default for the shell's toolbar.
 */
export function defaultToolbarItems(config: GridConfig): ToolbarItem[] {
  const enabled = (flag: boolean | undefined): boolean => flag !== false;
  const items: ToolbarItem[] = [];

  if (enabled(config.undo)) {
    items.push({ action: "undo" }, { action: "redo" }, { action: "separator" });
  }

  if (enabled(config.bold)) items.push({ action: "bold" });
  if (enabled(config.italic)) items.push({ action: "italic" });
  if (enabled(config.bold) || enabled(config.italic)) {
    items.push({ action: "underline" }, { action: "strikethrough" });
  }

  if (enabled(config.align)) {
    items.push({ action: "alignLeft" }, { action: "alignCenter" }, { action: "alignRight" });
  }

  if (enabled(config.textColor) || enabled(config.fillColor)) items.push({ action: "separator" });
  if (enabled(config.textColor)) items.push({ action: "textColor" });
  if (enabled(config.fillColor)) items.push({ action: "fillColor" });

  if (enabled(config.border)) items.push({ action: "border" });
  if (enabled(config.clearFormat)) items.push({ action: "clearFormat" });

  if (enabled(config.merge)) {
    items.push({ action: "separator" }, { action: "merge" }, { action: "unmerge" });
  }

  if (enabled(config.sort)) {
    items.push({ action: "separator" }, { action: "sortAsc" }, { action: "sortDesc" });
  }

  if (config.export) {
    items.push({ action: "separator" }, { action: "exportCsv" }, { action: "exportXlsx" });
  }

  return items;
}

const HEX_CHANNEL = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

/**
 * Convert a theme color to the `#rrggbb` form a color input accepts. Handles
 * hex (3, 4, 6 or 8 digits; alpha dropped) and `rgb()`/`rgba()`. Returns null
 * for other forms, so the input keeps its current value.
 */
function toHexColor(color: string): string | null {
  const value = color.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
  if (hex !== undefined) {
    if (hex.length === 3 || hex.length === 4) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    if (hex.length === 6 || hex.length === 8) return `#${hex.slice(0, 6)}`;
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (rgb === null) return null;
  return `#${HEX_CHANNEL(Number(rgb[1]))}${HEX_CHANNEL(Number(rgb[2]))}${HEX_CHANNEL(Number(rgb[3]))}`;
}

/**
 * Render toolbar items into `bar`, binding built-in actions to `grid.actions`
 * and custom `onClick` handlers to the grid handle. Shared by the grid's
 * legacy built-in toolbar and the shell's `createToolbar`, so the repo has one
 * toolbar implementation. Icon strings are always text (never HTML); DOM-node
 * icons are cloned so one config can serve several toolbars.
 */
export function renderToolbarItems(
  bar: HTMLElement,
  items: readonly ToolbarItem[],
  grid: Grid,
  icons?: IconOverrides,
): () => void {
  const controls = new Map<GridCommandName, HTMLButtonElement | HTMLInputElement>();
  const shortcutLabels = new Map<GridCommandName, string>();
  const setIcon = (el: HTMLElement, content: ToolbarIcon): void => {
    if (typeof content === "string") {
      // Icon strings are text-only; never interpret them as HTML.
      el.textContent = content;
      return;
    }

    const node = typeof content === "function" ? content() : content.cloneNode(true);
    el.replaceChildren(node);
  };

  const addButton = (
    suffix: string,
    icon: ToolbarIcon,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sheetwrite-tb-button sheetwrite-tb-${suffix}`;
    button.title = title;
    if (title) button.setAttribute("aria-label", title);
    setIcon(button, icon);

    // Mouse activation must not steal focus/selection from the grid.
    button.addEventListener("mousedown", preventDefault);
    button.addEventListener("click", onClick);

    bar.appendChild(button);
    return button;
  };

  const colorPickDisposers: Array<() => void> = [];
  /** Reseed hooks for color inputs the user has not picked from yet. */
  const colorSeeders: Array<() => void> = [];

  const addColorInput = (
    suffix: string,
    title: string,
    themeColor: () => string,
    onPick: (color: string) => void,
  ): HTMLInputElement => {
    const input = document.createElement("input");
    input.type = "color";
    input.className = `sheetwrite-tb-color sheetwrite-tb-${suffix}`;
    input.title = title;
    if (title) input.setAttribute("aria-label", title);

    // A color input shows black until it has a value. Until the user picks,
    // show the color the grid paints by default, so the swatch is truthful.
    let picked = false;
    const seed = (): void => {
      if (picked) return;
      const hex = toHexColor(themeColor());
      if (hex !== null) input.value = hex;
    };
    seed();
    colorSeeders.push(seed);
    input.addEventListener("pointerdown", seed);
    input.addEventListener("focus", seed);
    let timer: number | undefined;
    let lastCommitted: string | undefined;
    const commit = (): void => {
      timer = undefined;
      if (input.value === lastCommitted) return;
      lastCommitted = input.value;
      picked = true;
      onPick(input.value);
    };
    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 150);
    };
    const flush = (): void => {
      if (timer === undefined) return;
      window.clearTimeout(timer);
      commit();
    };
    input.addEventListener("input", schedule);
    input.addEventListener("change", schedule);
    input.addEventListener("blur", flush);
    colorPickDisposers.push(() => window.clearTimeout(timer));

    bar.appendChild(input);
    return input;
  };

  // One command at a time per button: a second click while an export or a
  // large edit runs is ignored, and a failure becomes a visible message.
  const guarded = (key: string, command: () => unknown, button: HTMLButtonElement): void => {
    const feedback = actionFeedbackFor(grid);
    if (feedback) void feedback.run(key, command, button);
    else command();
  };

  for (const item of items) {
    const action = item.action;

    if (action === "separator") {
      const divider = document.createElement("span");
      divider.className = "sheetwrite-tb-separator";
      divider.setAttribute("role", "separator");
      bar.appendChild(divider);
      continue;
    }

    const label = item.title ?? (action ? DEFAULT_TITLE[action] : "");
    const shortcut = action && isKeyboardAction(action) ? grid.getShortcutLabel(action) : "";
    const title = shortcut ? `${label} (${shortcut})` : label;
    if (action && isKeyboardAction(action)) shortcutLabels.set(action, label);
    const icon =
      item.icon ?? (action && isIconName(action) ? (icons?.[action] ?? COMMAND_ICONS[action]) : "");

    if (item.onClick) {
      const onClick = item.onClick;
      const button = addButton(action ?? "custom", icon, title, () =>
        guarded(`custom:${title || action || "item"}`, () => onClick(grid), button),
      );
      if (action) controls.set(action, button);
      continue;
    }

    if (action === "textColor") {
      controls.set(
        action,
        addColorInput(
          "textColor",
          title,
          () => grid.getTheme().fg,
          (color) => grid.actions.setTextColor(color),
        ),
      );
      continue;
    }

    if (action === "fillColor") {
      controls.set(
        action,
        addColorInput(
          "fillColor",
          title,
          () => grid.getTheme().bg,
          (color) => grid.actions.setFillColor(color),
        ),
      );
      continue;
    }

    if (action) {
      const button = addButton(action, icon, title, () =>
        guarded(action, () => runAction(grid.actions, action), button),
      );
      controls.set(action, button);
    }
  }

  const update = (states?: Readonly<Record<GridCommandName, GridCommandState>>): void => {
    for (const [action, control] of controls) {
      const label = shortcutLabels.get(action);
      if (label !== undefined && isKeyboardAction(action)) {
        const shortcut = grid.getShortcutLabel(action);
        const title = shortcut ? `${label} (${shortcut})` : label;
        control.title = title;
        control.setAttribute("aria-label", title);
      }
      const state = states?.[action] ?? grid.getCommandState(action);
      control.disabled = state.disabled || control.getAttribute("aria-busy") === "true";
      if (
        control instanceof HTMLButtonElement &&
        (action === "bold" ||
          action === "italic" ||
          action === "underline" ||
          action === "strikethrough" ||
          action === "alignLeft" ||
          action === "alignCenter" ||
          action === "alignRight" ||
          action === "alignTop" ||
          action === "alignMiddle" ||
          action === "alignBottom" ||
          action === "wrap" ||
          action === "border")
      ) {
        control.setAttribute(
          "aria-pressed",
          state.activity === "mixed" ? "mixed" : String(state.activity === "active"),
        );
        if (state.activity === "mixed") control.setAttribute("data-state", "mixed");
        else control.removeAttribute("data-state");
      }
    }
  };
  update();
  const disposeState =
    typeof grid.on === "function"
      ? grid.on("command-state-change", (event) => update(event.states))
      : () => {};
  const disposeTheme =
    typeof grid.on === "function" && colorSeeders.length > 0
      ? grid.on("theme-change", () => {
          for (const seed of colorSeeders) seed();
        })
      : () => {};
  return () => {
    disposeState();
    disposeTheme();
    for (const dispose of colorPickDisposers) dispose();
  };
}

/**
 * Config-driven built-in toolbar. Renders either a custom `config.toolbar` item
 * list or the default per-flag set of built-ins through the shared
 * {@link renderToolbarItems}. Built once in the constructor; nothing rebuilds
 * per render.
 */
export class Toolbar {
  static readonly height = 36;

  private readonly el: HTMLDivElement;
  private readonly disposeState: () => void;

  constructor(host: HTMLElement, config: GridConfig, theme: Theme, grid: Grid) {
    seedWidgetTheme(host, theme);

    const bar = document.createElement("div");
    bar.className = "sheetwrite-toolbar";
    // Anchoring + height back the grid's layout math; cosmetics live in styles.css.
    bar.style.position = "absolute";
    bar.style.top = "0";
    bar.style.left = "0";
    bar.style.right = "0";
    bar.style.height = `${Toolbar.height}px`;
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Spreadsheet formatting");

    const items = Array.isArray(config.toolbar) ? config.toolbar : defaultToolbarItems(config);
    this.disposeState = renderToolbarItems(bar, items, grid, config.icons);

    host.appendChild(bar);
    this.el = bar;
  }

  destroy(): void {
    this.disposeState();
    this.el.remove();
  }
}
