import { type ActionFeedback, actionFeedbackFor } from "./action-feedback.js";
import type { IconName } from "./icons/icon-names.js";
import { iconNode } from "./icons/resolve.js";
import { boundShortcutLabel, formatShortcut, isKeyboardAction, parseShortcut } from "./keymap.js";
import { pivotAt } from "./panels/panel-loader.js";
import { checkIconStyles, checkStylePart } from "./style-parts.js";
import type {
  ContextMenuActionName,
  ContextMenuContext,
  ContextMenuItem,
  Grid,
  GridActions,
  GridConfig,
} from "./types/grid.js";
import type { Theme } from "./types/render.js";
import { seedWidgetTheme } from "./widget-theme.js";

/**
 * The built-in menu: clipboard, structure, visibility, merging, then the note.
 * Row and column commands sit in short submenus, so the menu stays about ten
 * rows tall instead of listing every verb for both axes.
 */
function default_items(grid: Grid): ContextMenuItem[] {
  const has_note = (context: ContextMenuContext): boolean =>
    context.cell !== null && grid.getNote(context.cell) !== null;

  // The field list edits the pivot, so a grid that cannot edit (read-only) does
  // not offer it. `clearFormat` is the ribbon's stand-in for every edit command.
  const in_pivot = (context: ContextMenuContext): boolean =>
    context.cell !== null &&
    !grid.getCommandState("clearFormat").disabled &&
    pivotAt(grid, context.cell) !== null;
  return [
    { action: "cut" },
    { action: "copy" },
    // Excel's "Paste Options:" row, then Paste Special.
    {
      id: "pasteOptions",
      label: "Paste Options",
      inline: true,
      items: [
        { action: "paste" },
        { action: "pasteValues" },
        { action: "pasteFormulas" },
        { action: "pasteTranspose" },
        { action: "pasteFormatting" },
        { action: "pasteLink" },
        // Beyond Excel: after a paste wrote into hidden rows, the same paste
        // on the shown rows only.
        { action: "pasteVisibleRows", visible: () => grid.canPasteVisibleRows() },
      ],
    },
    { action: "pasteSpecial" },
    { action: "separator" },
    {
      id: "insert",
      label: "Insert",
      icon: "insert",
      items: [
        { action: "insertCells", label: "Cells…" },
        { action: "separator" },
        { action: "insertRowAbove", label: "Row above" },
        { action: "insertRowBelow", label: "Row below" },
        { action: "separator" },
        { action: "insertColumnLeft", label: "Column left" },
        { action: "insertColumnRight", label: "Column right" },
      ],
    },
    {
      id: "delete",
      label: "Delete",
      icon: "delete",
      items: [
        { action: "deleteCells", label: "Cells…" },
        { action: "separator" },
        { action: "deleteRow", label: "Row" },
        { action: "deleteColumn", label: "Column" },
      ],
    },
    { action: "clearContents" },
    { action: "separator" },
    {
      id: "row",
      label: "Row",
      icon: "hideRows",
      items: [
        { action: "hideRow", label: "Hide" },
        { action: "showAllRows", label: "Show all" },
        { action: "autoFitRow", label: "Auto-fit height" },
      ],
    },
    {
      id: "column",
      label: "Column",
      icon: "hideColumns",
      items: [
        { action: "hideColumn", label: "Hide" },
        { action: "showAllColumns", label: "Show all" },
        { action: "autoFitColumn", label: "Auto-fit width" },
        { action: "separator" },
        { action: "sortAscending" },
        { action: "sortDescending" },
        { action: "sortViewAscending" },
        { action: "sortViewDescending" },
      ],
    },
    {
      id: "filterMenu",
      label: "Filter",
      icon: "filter",
      items: [
        { action: "filterBySelection" },
        { action: "reapplyFilter" },
        { action: "separator" },
        { action: "clearFilter", label: "Clear filter" },
      ],
    },
    { action: "separator" },
    {
      // Not "merge": that name belongs to the leaf action's row and feedback key.
      id: "mergeMenu",
      label: "Merge",
      icon: "merge",
      items: [
        { action: "merge", label: "Merge cells" },
        { action: "unmerge", label: "Unmerge cells" },
      ],
    },
    { action: "separator" },
    { action: "formatCells" },
    { action: "pickFromList", visible: (context) => context.cell !== null },
    { action: "separator" },
    { action: "pivotFields", visible: in_pivot },
    { action: "separator" },
    { action: "editNote", label: "New note", visible: (context) => !has_note(context) },
    { action: "editNote", visible: has_note },
    { action: "deleteNote", visible: has_note },
  ];
}

/**
 * The glyph a built-in action shows when its row names no icon. Pick From
 * Drop-down List has none, as in Excel.
 */
const ACTION_ICON: Record<
  Exclude<ContextMenuActionName, "separator" | "pickFromList">,
  IconName
> = {
  cut: "cut",
  copy: "copy",
  paste: "paste",
  pasteValues: "pasteValues",
  pasteFormulas: "pasteFormulas",
  pasteFormatting: "pasteFormatting",
  pasteTranspose: "pasteTranspose",
  pasteLink: "pasteLink",
  pasteVisibleRows: "pasteVisibleRows",
  pasteSpecial: "pasteSpecial",
  clearContents: "clear",
  merge: "merge",
  unmerge: "unmerge",
  insertRowAbove: "insert",
  insertRowBelow: "insert",
  insertColumnLeft: "insert",
  insertColumnRight: "insert",
  deleteRow: "delete",
  deleteColumn: "delete",
  insertCells: "insertCells",
  deleteCells: "deleteCells",
  hideRow: "hideRows",
  showAllRows: "unhideRows",
  autoFitRow: "format",
  hideColumn: "hideColumns",
  showAllColumns: "unhideColumns",
  autoFitColumn: "format",
  clearFilter: "clearFilter",
  filterBySelection: "filter",
  reapplyFilter: "reapplyFilter",
  sortAscending: "sortAsc",
  sortDescending: "sortDesc",
  sortViewAscending: "sortView",
  sortViewDescending: "sortView",
  exportCsv: "exportCsv",
  exportXlsx: "exportXlsx",
  editNote: "note",
  deleteNote: "note",
  pivotFields: "pivotTable",
  formatCells: "formatCells",
};

/** Drops hidden rows, then leading, trailing and doubled separators. */
function visible_items(
  items: readonly ContextMenuItem[],
  context: ContextMenuContext,
): ContextMenuItem[] {
  const normalized: ContextMenuItem[] = [];
  for (const item of items) {
    const visible =
      typeof item.visible === "function" ? item.visible(context) : item.visible !== false;
    if (!visible) continue;
    if (item.action === "separator") {
      if (normalized.length === 0 || normalized.at(-1)?.action === "separator") continue;
    }
    normalized.push(item);
  }
  if (normalized.at(-1)?.action === "separator") normalized.pop();
  return normalized;
}

const DEFAULT_LABEL: Record<Exclude<ContextMenuActionName, "separator">, string> = {
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  pasteValues: "Values",
  pasteFormulas: "Formulas",
  pasteFormatting: "Formatting",
  pasteTranspose: "Transpose",
  pasteLink: "Paste Link",
  pasteVisibleRows: "Paste into visible rows only",
  pasteSpecial: "Paste Special…",
  clearContents: "Clear contents",
  merge: "Merge cells",
  unmerge: "Unmerge",
  insertRowAbove: "Insert row above",
  insertRowBelow: "Insert row below",
  deleteRow: "Delete row",
  hideRow: "Hide row",
  showAllRows: "Show all rows",
  autoFitRow: "Auto-fit row",
  insertColumnLeft: "Insert column left",
  insertColumnRight: "Insert column right",
  deleteColumn: "Delete column",
  hideColumn: "Hide column",
  showAllColumns: "Show all columns",
  autoFitColumn: "Auto-fit column",
  clearFilter: "Clear column filter",
  filterBySelection: "Filter by selected cell's value",
  reapplyFilter: "Reapply filter",
  sortAscending: "Sort A to Z",
  sortDescending: "Sort Z to A",
  sortViewAscending: "Sort view A to Z",
  sortViewDescending: "Sort view Z to A",
  exportCsv: "Export CSV",
  exportXlsx: "Export XLSX",
  editNote: "Edit note",
  deleteNote: "Delete note",
  pivotFields: "PivotTable Fields",
  insertCells: "Insert cells…",
  deleteCells: "Delete cells…",
  formatCells: "Format cells…",
  pickFromList: "Pick from drop-down list…",
};

function action_handler(
  action: ContextMenuActionName | undefined,
  actions: GridActions,
): () => unknown {
  switch (action) {
    case "cut":
      return () => actions.cut();

    case "copy":
      return () => actions.copy();

    case "paste":
      return () => actions.paste();

    case "pasteValues":
      return () => actions.pasteValues();

    case "pasteFormulas":
      return () => actions.pasteSpecial({ paste: "formulas" });

    case "pasteFormatting":
      return () => actions.pasteSpecial({ paste: "formats" });

    case "pasteTranspose":
      return () => actions.pasteSpecial({ transpose: true });

    case "pasteLink":
      return () => actions.pasteSpecial({ link: true });

    case "pasteVisibleRows":
      return () => actions.pasteVisibleRows();

    case "pasteSpecial":
      return () => actions.pasteSpecial({ ask: true });

    case "clearContents":
      return () => actions.clearContents();

    case "merge":
      return () => actions.merge({ ask: true });

    case "unmerge":
      return () => actions.unmerge();

    case "insertRowAbove":
      return () => actions.insertRowAbove();

    case "insertRowBelow":
      return () => actions.insertRowBelow();

    case "deleteRow":
      return () => actions.deleteRow();

    case "hideRow":
      return () => actions.hideRows();

    case "showAllRows":
      return () => actions.showRows();

    case "autoFitRow":
      return () => actions.autoFitRows();

    case "insertColumnLeft":
      return () => actions.insertColumnLeft();

    case "insertColumnRight":
      return () => actions.insertColumnRight();

    case "deleteColumn":
      return () => actions.deleteColumn();

    case "insertCells":
      return () => actions.insertCells({ ask: true });

    case "deleteCells":
      return () => actions.deleteCells({ ask: true });

    case "hideColumn":
      return () => actions.hideColumns();

    case "showAllColumns":
      return () => actions.showColumns();

    case "autoFitColumn":
      return () => actions.autoFitColumns();

    case "clearFilter":
      return () => actions.clearFilter();

    case "filterBySelection":
      return () => actions.filterBySelection();

    case "reapplyFilter":
      return () => actions.reapplyFilter();

    case "sortAscending":
      return () => actions.sort(true);

    case "sortDescending":
      return () => actions.sort(false);

    case "sortViewAscending":
      return () => actions.sortView(true);

    case "sortViewDescending":
      return () => actions.sortView(false);

    case "exportCsv":
      return () => actions.exportCsv();

    case "exportXlsx":
      return () => actions.exportXlsx();

    case "editNote":
      return () => actions.editNote();

    case "deleteNote":
      return () => actions.deleteNote();

    case "pivotFields":
      return () => actions.showPivotFields();

    case "formatCells":
      return () => actions.formatCells();

    case "pickFromList":
      return () => actions.pickFromList();

    default:
      return () => {};
  }
}

/** Delay before a hovered row opens its submenu, so a diagonal move toward an open submenu does not swap it. */
const SUBMENU_HOVER_MS = 120;
/** How far a submenu overlaps its parent, so the pointer crosses without a gap. */
const SUBMENU_OVERLAP_PX = 2;
/** The menu's top padding; a submenu's first row lines up with its parent row. */
const MENU_PADDING_PX = 4;

interface Submenu {
  readonly element: HTMLDivElement;
  readonly parentRow: HTMLElement;
}

/** One rendered row and the state its click handler reads. */
interface RowBinding {
  readonly menu: HTMLDivElement;
  readonly row: HTMLDivElement;
  readonly context: ContextMenuContext;
  readonly isDisabled: boolean;
}

/**
 * Floating right-click menu with nested submenus. Dynamic rows are resolved
 * for each opening; global dismiss listeners live only while the menu is open.
 * The menu takes focus when it opens, so the arrow keys move through it, and
 * gives focus back when it closes.
 */
export class ContextMenu {
  private readonly el: HTMLDivElement;
  private readonly host: HTMLElement;
  private readonly config: GridConfig;
  private readonly actions: GridActions;
  private readonly grid: Grid;
  /** Open submenus, outermost first; index i is menu level i + 1. */
  private submenus: Submenu[] = [];
  private return_focus: HTMLElement | null = null;
  private hover_timer: number | undefined;

  constructor(
    host: HTMLElement,
    config: GridConfig,
    theme: Theme,
    actions: GridActions,
    grid: Grid,
  ) {
    this.host = host;
    this.config = config;
    this.actions = actions;
    this.grid = grid;

    seedWidgetTheme(host, theme);
    this.el = this.create_menu_element("sheetwrite-context-menu");
  }

  /**
   * Open at the pointer. `items` replaces the configured cell menu, for menus
   * that belong to something other than a cell (a chart).
   */
  open(context: ContextMenuContext, items?: readonly ContextMenuItem[]): void {
    this.close_submenus_from(0);
    const active = document.activeElement;
    this.return_focus = active instanceof HTMLElement && !this.owns_element(active) ? active : null;

    const configured = this.config.contextMenu;
    const rows =
      items ??
      (typeof configured === "function"
        ? configured(context)
        : Array.isArray(configured)
          ? configured
          : default_items(this.grid));
    this.fill(this.el, rows, context);

    const menu = this.el;
    menu.style.display = "block";
    checkStylePart(menu, "context-menu", "The context menu");
    checkIconStyles(menu, "The context menu");

    const clamped_x = Math.max(0, Math.min(context.clientX, window.innerWidth - menu.offsetWidth));
    const clamped_y = Math.max(
      0,
      Math.min(context.clientY, window.innerHeight - menu.offsetHeight),
    );

    menu.style.left = `${clamped_x}px`;
    menu.style.top = `${clamped_y}px`;

    this.add_dismiss_listeners();
    this.enabled_rows(menu)[0]?.focus({ preventScroll: true });
  }

  close(): void {
    window.clearTimeout(this.hover_timer);
    const had_focus = this.owns_element(document.activeElement);
    this.close_submenus_from(0);
    this.el.style.display = "none";
    this.remove_dismiss_listeners();

    // Give focus back only when the menu holds it; an outside click has
    // already chosen where focus goes.
    const target = this.return_focus;
    this.return_focus = null;
    if (had_focus && target?.isConnected) target.focus({ preventScroll: true });
  }

  destroy(): void {
    window.clearTimeout(this.hover_timer);
    this.close_submenus_from(0);
    this.remove_dismiss_listeners();
    this.el.remove();
  }

  private create_menu_element(class_name: string): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = class_name;
    menu.setAttribute("role", "menu");
    // Fixed positioning + visibility toggle are behavior; cosmetics live in styles.css.
    menu.style.position = "fixed";
    menu.style.display = "none";

    // Keep grid focus so selection-based actions act on the right cells.
    menu.addEventListener("mousedown", (e) => e.preventDefault());
    menu.addEventListener("keydown", (e) => this.on_menu_key(e, menu));

    this.host.appendChild(menu);
    return menu;
  }

  /** Root menu is level 0; submenu i is level i + 1. */
  private level_of(menu: HTMLElement): number {
    return menu === this.el ? 0 : this.submenus.findIndex((sub) => sub.element === menu) + 1;
  }

  private owns_element(node: Element | null): boolean {
    return (
      node !== null &&
      (this.el.contains(node) || this.submenus.some((sub) => sub.element.contains(node)))
    );
  }

  private enabled_rows(menu: HTMLElement): HTMLElement[] {
    return [
      ...menu.querySelectorAll<HTMLElement>(
        ":scope > .sheetwrite-context-menu-item:not(.sheetwrite-context-menu-item-disabled), " +
          ":scope > .sheetwrite-context-menu-inline > div > " +
          ".sheetwrite-context-menu-item:not(.sheetwrite-context-menu-item-disabled)",
      ),
    ];
  }

  private fill(
    menu: HTMLDivElement,
    items: readonly ContextMenuItem[],
    context: ContextMenuContext,
  ): void {
    menu.replaceChildren();
    for (const item of visible_items(items, context)) {
      if (item.action === "separator") {
        const separator = document.createElement("div");
        separator.className = "sheetwrite-context-menu-sep";
        separator.setAttribute("role", "separator");
        menu.appendChild(separator);
        continue;
      }
      menu.appendChild(
        item.inline && item.items
          ? this.render_inline_row(menu, item, item.items, context)
          : this.render_row(menu, item, context),
      );
    }
  }

  /**
   * A row of icon buttons under its label, as Excel's "Paste Options:". Each
   * button names itself in its tooltip and to screen readers.
   */
  private render_inline_row(
    menu: HTMLDivElement,
    item: ContextMenuItem,
    children: readonly ContextMenuItem[],
    context: ContextMenuContext,
  ): HTMLDivElement {
    const group = document.createElement("div");
    group.className = "sheetwrite-context-menu-inline";
    group.setAttribute("role", "group");
    if (item.id) group.dataset.contextMenuItem = item.id;
    const label = document.createElement("div");
    label.className = "sheetwrite-context-menu-inline-label";
    label.textContent = `${item.label ?? ""}:`;
    group.setAttribute("aria-label", item.label ?? "");
    const buttons = document.createElement("div");
    for (const child of visible_items(children, context)) {
      if (child.action === "separator") continue;
      const button = this.render_row(menu, child, context);
      const name = button.querySelector(".sheetwrite-context-menu-label")?.textContent ?? "";
      const shortcut = button.querySelector(".sheetwrite-context-menu-shortcut")?.textContent;
      button.title = shortcut ? `${name} (${shortcut})` : name;
      button.setAttribute("aria-label", name);
      buttons.append(button);
    }
    group.append(label, buttons);
    return group;
  }

  private render_row(
    menu: HTMLDivElement,
    item: ContextMenuItem,
    context: ContextMenuContext,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "sheetwrite-context-menu-item";
    row.setAttribute("role", "menuitem");
    row.tabIndex = -1;
    const action = item.action;
    const row_id = item.id ?? action;
    if (row_id) row.dataset.contextMenuItem = row_id;
    const key = action ?? item.id ?? item.label ?? "item";
    const feedback = actionFeedbackFor(this.grid);
    const pending = feedback?.isRunning(key) ?? false;

    const is_disabled =
      pending ||
      (typeof item.disabled === "function" ? item.disabled(context) : item.disabled === true);
    if (is_disabled) {
      row.classList.add("sheetwrite-context-menu-item-disabled");
      row.setAttribute("aria-disabled", "true");
    }

    // Separators never reach here (fill draws them); the guard narrows the type.
    const built_in = action === "separator" ? undefined : action;

    // Every row keeps the icon column, so labels line up with or without a glyph.
    const icon_slot = document.createElement("span");
    icon_slot.className = "sheetwrite-context-menu-icon";
    icon_slot.setAttribute("aria-hidden", "true");
    const icon_name =
      item.icon ??
      (built_in !== undefined && built_in !== "pickFromList" ? ACTION_ICON[built_in] : undefined);
    if (icon_name) icon_slot.append(iconNode(icon_name, this.config.icons));
    row.appendChild(icon_slot);

    const label = document.createElement("span");
    label.className = "sheetwrite-context-menu-label";
    label.textContent = item.label ?? (built_in ? DEFAULT_LABEL[built_in] : "");
    if (pending) {
      row.setAttribute("aria-busy", "true");
      label.textContent = `Running ${label.textContent}…`;
    }
    row.appendChild(label);

    const binding: RowBinding = { menu, row, context, isDisabled: is_disabled };
    const children = item.items;
    if (children !== undefined) this.bind_submenu_row(binding, children);
    else this.bind_action_row(binding, item, key, feedback);

    row.addEventListener("pointerenter", () => {
      if (!is_disabled) row.focus({ preventScroll: true });
      window.clearTimeout(this.hover_timer);
      this.hover_timer = window.setTimeout(() => {
        if (children !== undefined && !is_disabled) {
          this.open_submenu(menu, row, children, context, false);
        } else {
          this.close_submenus_from(this.level_of(menu));
        }
      }, SUBMENU_HOVER_MS);
    });
    return row;
  }

  /** Adds the submenu arrow; a click opens `children` beside the row. */
  private bind_submenu_row(binding: RowBinding, children: readonly ContextMenuItem[]): void {
    const { menu, row, context, isDisabled: is_disabled } = binding;
    row.setAttribute("aria-haspopup", "menu");
    row.setAttribute("aria-expanded", "false");
    const arrow = document.createElement("span");
    arrow.className = "sheetwrite-context-menu-arrow";
    arrow.setAttribute("aria-hidden", "true");
    row.appendChild(arrow);

    row.addEventListener("click", () => {
      if (!is_disabled) this.open_submenu(menu, row, children, context);
    });
  }

  /** Adds the shortcut hint; a click runs the row's command and closes the menu. */
  private bind_action_row(
    binding: RowBinding,
    item: ContextMenuItem,
    key: string,
    feedback: ActionFeedback | undefined,
  ): void {
    const { row, context, isDisabled: is_disabled } = binding;
    this.append_shortcut(row, item, item.action);
    const run = item.onClick
      ? () => item.onClick?.(this.grid, context.cell)
      : action_handler(item.action, this.actions);

    row.addEventListener("click", () => {
      if (is_disabled) return;
      // The menu closes at once; a refused clipboard or a failed export
      // still reaches the user through the grid's action status.
      if (feedback) void feedback.run(key, run);
      else run();
      this.close();
    });
  }

  private append_shortcut(
    row: HTMLElement,
    item: ContextMenuItem,
    action: ContextMenuActionName | undefined,
  ): void {
    const binding = item.shortcut ?? (action && isKeyboardAction(action) ? action : undefined);
    const shortcut_label =
      binding === undefined
        ? ""
        : typeof binding === "string" && isKeyboardAction(binding)
          ? this.config.keyboard === false
            ? ""
            : boundShortcutLabel(
                binding,
                typeof this.config.keyboard === "object" ? this.config.keyboard : undefined,
              )
          : formatShortcut(parseShortcut(binding));
    if (!shortcut_label) return;
    const shortcut = document.createElement("span");
    shortcut.className = "sheetwrite-context-menu-shortcut";
    shortcut.textContent = shortcut_label;
    row.appendChild(shortcut);
  }

  /**
   * Opens `items` beside `row`, replacing any deeper submenu. Keyboard and
   * click openings move focus to the first row; hover leaves it on the parent.
   */
  private open_submenu(
    parent: HTMLDivElement,
    row: HTMLElement,
    items: readonly ContextMenuItem[],
    context: ContextMenuContext,
    focus_first = true,
  ): void {
    const level = this.level_of(parent);
    if (this.submenus[level]?.parentRow !== row) {
      this.close_submenus_from(level);
      const element = this.create_menu_element(
        "sheetwrite-context-menu sheetwrite-context-menu-sub",
      );
      this.fill(element, items, context);
      element.style.display = "block";
      this.place(element, parent, row);
      row.setAttribute("aria-expanded", "true");
      this.submenus.push({ element, parentRow: row });
    }
    const submenu = this.submenus[level]?.element;
    if (focus_first && submenu) this.enabled_rows(submenu)[0]?.focus({ preventScroll: true });
  }

  /** Beside the parent row, flipped to the left when the right edge would clip it. */
  private place(submenu: HTMLElement, parent: HTMLElement, row: HTMLElement): void {
    const parent_rect = parent.getBoundingClientRect();
    const row_rect = row.getBoundingClientRect();
    let left = parent_rect.right - SUBMENU_OVERLAP_PX;
    if (left + submenu.offsetWidth > window.innerWidth) {
      left = Math.max(0, parent_rect.left - submenu.offsetWidth + SUBMENU_OVERLAP_PX);
    }
    const top = Math.max(
      0,
      Math.min(row_rect.top - MENU_PADDING_PX, window.innerHeight - submenu.offsetHeight),
    );
    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;
  }

  /** Closes the submenus at `level` and deeper (0 closes all of them). */
  private close_submenus_from(level: number): void {
    for (const sub of this.submenus.splice(level)) {
      sub.parentRow.setAttribute("aria-expanded", "false");
      sub.element.remove();
    }
  }

  private on_menu_key(event: KeyboardEvent, menu: HTMLDivElement): void {
    const rows = this.enabled_rows(menu);
    const active = document.activeElement;
    const index = rows.findIndex((row) => row === active);
    const level = this.level_of(menu);
    const focus_at = (next: number): void => {
      rows[(next + rows.length) % rows.length]?.focus({ preventScroll: true });
    };
    // A row of icon buttons is one stop for Up and Down; Left and Right move inside it.
    const group_of = (row: Element | null | undefined): Element | null =>
      row?.closest(".sheetwrite-context-menu-inline") ?? null;
    const group = active instanceof HTMLElement ? group_of(active) : null;

    const back_to_parent = (): void => {
      const parent_row = this.submenus[level - 1]?.parentRow;
      this.close_submenus_from(level - 1);
      parent_row?.focus({ preventScroll: true });
    };

    switch (event.key) {
      case "ArrowDown": {
        let next = index + 1;
        while (group && group_of(rows[next]) === group) next++;
        focus_at(next);
        break;
      }

      case "ArrowUp": {
        let next = index < 0 ? -1 : index - 1;
        while (group && next >= 0 && group_of(rows[next]) === group) next--;
        // Coming up into a row of buttons lands on its first button.
        const above = group_of(rows.at(next));
        while (above && next > 0 && group_of(rows[next - 1]) === above) next--;
        focus_at(next);
        break;
      }

      case "Home":
        focus_at(0);
        break;

      case "End":
        focus_at(-1);
        break;

      case "Enter":
      case " ":
        if (active instanceof HTMLElement && rows.includes(active)) active.click();
        break;

      case "ArrowRight":
        if (group) {
          if (group_of(rows[index + 1]) === group) focus_at(index + 1);
        } else if (
          active instanceof HTMLElement &&
          active.getAttribute("aria-haspopup") === "menu"
        ) {
          active.click();
        }

        break;

      case "ArrowLeft":
        if (group) {
          if (index > 0 && group_of(rows[index - 1]) === group) focus_at(index - 1);
        } else if (level > 0) back_to_parent();
        break;

      case "Escape":
        if (level > 0) back_to_parent();
        else this.close();
        break;

      case "Tab":
        this.close();
        break;

      default:
        return;
    }

    // The grid under the menu must not also move its selection.
    event.preventDefault();
    event.stopPropagation();
  }

  /** A press, wheel turn or touch drag outside the menu closes it. */
  private readonly on_outside_input = (e: Event): void => {
    if (!(e.target instanceof Element) || !this.owns_element(e.target)) this.close();
  };

  // The menu does not handle Page Up and Page Down, so they scroll the page.
  private readonly on_key_down = (e: KeyboardEvent): void => {
    if (e.key === "Escape" || e.key === "PageUp" || e.key === "PageDown") this.close();
  };

  private readonly on_dismiss = (): void => {
    this.close();
  };

  // The menu closes when the user scrolls, so it listens for the user's input,
  // not for `scroll` events. The page's own scrolls, such as the one that
  // brings the grid into view when it takes the focus, send their `scroll`
  // event at the next frame, which can come after a right-click opened the menu.
  private add_dismiss_listeners(): void {
    document.addEventListener("pointerdown", this.on_outside_input, true);
    document.addEventListener("wheel", this.on_outside_input, { capture: true, passive: true });
    document.addEventListener("touchmove", this.on_outside_input, { capture: true, passive: true });
    document.addEventListener("keydown", this.on_key_down);
    window.addEventListener("resize", this.on_dismiss, { once: true });
  }

  private remove_dismiss_listeners(): void {
    document.removeEventListener("pointerdown", this.on_outside_input, true);
    document.removeEventListener("wheel", this.on_outside_input, true);
    document.removeEventListener("touchmove", this.on_outside_input, true);
    document.removeEventListener("keydown", this.on_key_down);
    window.removeEventListener("resize", this.on_dismiss);
  }
}
