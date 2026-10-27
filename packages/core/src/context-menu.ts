import { type ActionFeedback, actionFeedbackFor } from "./action-feedback.js";
import type { IconName } from "./icons/icon-names.js";
import { iconNode } from "./icons/resolve.js";
import { boundShortcutLabel, formatShortcut, isKeyboardAction, parseShortcut } from "./keymap.js";
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
function defaultItems(grid: Grid): ContextMenuItem[] {
  const hasNote = (context: ContextMenuContext): boolean =>
    context.cell !== null && grid.getNote(context.cell) !== null;
  return [
    { action: "cut" },
    { action: "copy" },
    { action: "paste" },
    { action: "separator" },
    {
      id: "insert",
      label: "Insert",
      icon: "insert",
      items: [
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
    { action: "editNote", label: "New note", visible: (context) => !hasNote(context) },
    { action: "editNote", visible: hasNote },
    { action: "deleteNote", visible: hasNote },
  ];
}

/** The glyph a built-in action shows when its row names no icon. */
const ACTION_ICON: Record<Exclude<ContextMenuActionName, "separator">, IconName> = {
  cut: "cut",
  copy: "copy",
  paste: "paste",
  clearContents: "clear",
  merge: "merge",
  unmerge: "unmerge",
  insertRowAbove: "insert",
  insertRowBelow: "insert",
  insertColumnLeft: "insert",
  insertColumnRight: "insert",
  deleteRow: "delete",
  deleteColumn: "delete",
  hideRow: "hideRows",
  showAllRows: "unhideRows",
  autoFitRow: "format",
  hideColumn: "hideColumns",
  showAllColumns: "unhideColumns",
  autoFitColumn: "format",
  clearFilter: "clearFilter",
  exportCsv: "exportCsv",
  exportXlsx: "exportXlsx",
  editNote: "note",
  deleteNote: "note",
};

/** Drops hidden rows, then leading, trailing and doubled separators. */
function visibleItems(
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
  exportCsv: "Export CSV",
  exportXlsx: "Export XLSX",
  editNote: "Edit note",
  deleteNote: "Delete note",
};

function actionHandler(
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
    case "clearContents":
      return () => actions.clearContents();
    case "merge":
      return () => actions.merge();
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
    case "hideColumn":
      return () => actions.hideColumns();
    case "showAllColumns":
      return () => actions.showColumns();
    case "autoFitColumn":
      return () => actions.autoFitColumns();
    case "clearFilter":
      return () => actions.clearFilter();
    case "exportCsv":
      return () => actions.exportCsv();
    case "exportXlsx":
      return () => actions.exportXlsx();
    case "editNote":
      return () => actions.editNote();
    case "deleteNote":
      return () => actions.deleteNote();
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
  private returnFocus: HTMLElement | null = null;
  private hoverTimer: number | undefined;

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
    this.el = this.createMenuElement("sheetwrite-context-menu");
  }

  open(context: ContextMenuContext): void {
    this.closeSubmenusFrom(0);
    const active = document.activeElement;
    this.returnFocus = active instanceof HTMLElement && !this.ownsElement(active) ? active : null;

    const configured = this.config.contextMenu;
    const items =
      typeof configured === "function"
        ? configured(context)
        : Array.isArray(configured)
          ? configured
          : defaultItems(this.grid);
    this.fill(this.el, items, context);

    const menu = this.el;
    menu.style.display = "block";

    const clampedX = Math.max(0, Math.min(context.clientX, window.innerWidth - menu.offsetWidth));
    const clampedY = Math.max(0, Math.min(context.clientY, window.innerHeight - menu.offsetHeight));

    menu.style.left = `${clampedX}px`;
    menu.style.top = `${clampedY}px`;

    this.addDismissListeners();
    this.enabledRows(menu)[0]?.focus({ preventScroll: true });
  }

  close(): void {
    window.clearTimeout(this.hoverTimer);
    const hadFocus = this.ownsElement(document.activeElement);
    this.closeSubmenusFrom(0);
    this.el.style.display = "none";
    this.removeDismissListeners();

    // Give focus back only when the menu holds it; an outside click has
    // already chosen where focus goes.
    const target = this.returnFocus;
    this.returnFocus = null;
    if (hadFocus && target?.isConnected) target.focus({ preventScroll: true });
  }

  destroy(): void {
    window.clearTimeout(this.hoverTimer);
    this.closeSubmenusFrom(0);
    this.removeDismissListeners();
    this.el.remove();
  }

  private createMenuElement(className: string): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = className;
    menu.setAttribute("role", "menu");
    // Fixed positioning + visibility toggle are behavior; cosmetics live in styles.css.
    menu.style.position = "fixed";
    menu.style.display = "none";

    // Keep grid focus so selection-based actions act on the right cells.
    menu.addEventListener("mousedown", (e) => e.preventDefault());
    menu.addEventListener("keydown", (e) => this.onMenuKey(e, menu));

    this.host.appendChild(menu);
    return menu;
  }

  /** Root menu is level 0; submenu i is level i + 1. */
  private levelOf(menu: HTMLElement): number {
    return menu === this.el ? 0 : this.submenus.findIndex((sub) => sub.element === menu) + 1;
  }

  private ownsElement(node: Element | null): boolean {
    return (
      node !== null &&
      (this.el.contains(node) || this.submenus.some((sub) => sub.element.contains(node)))
    );
  }

  private enabledRows(menu: HTMLElement): HTMLElement[] {
    return [
      ...menu.querySelectorAll<HTMLElement>(
        ":scope > .sheetwrite-context-menu-item:not(.sheetwrite-context-menu-item-disabled)",
      ),
    ];
  }

  private fill(
    menu: HTMLDivElement,
    items: readonly ContextMenuItem[],
    context: ContextMenuContext,
  ): void {
    menu.replaceChildren();
    for (const item of visibleItems(items, context)) {
      if (item.action === "separator") {
        const separator = document.createElement("div");
        separator.className = "sheetwrite-context-menu-sep";
        separator.setAttribute("role", "separator");
        menu.appendChild(separator);
        continue;
      }
      menu.appendChild(this.renderRow(menu, item, context));
    }
  }

  private renderRow(
    menu: HTMLDivElement,
    item: ContextMenuItem,
    context: ContextMenuContext,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "sheetwrite-context-menu-item";
    row.setAttribute("role", "menuitem");
    row.tabIndex = -1;
    const action = item.action;
    const rowId = item.id ?? action;
    if (rowId) row.dataset.contextMenuItem = rowId;
    const key = action ?? item.id ?? item.label ?? "item";
    const feedback = actionFeedbackFor(this.grid);
    const pending = feedback?.isRunning(key) ?? false;

    const isDisabled =
      pending ||
      (typeof item.disabled === "function" ? item.disabled(context) : item.disabled === true);
    if (isDisabled) {
      row.classList.add("sheetwrite-context-menu-item-disabled");
      row.setAttribute("aria-disabled", "true");
    }

    // Separators never reach here (fill draws them); the guard narrows the type.
    const builtIn = action === "separator" ? undefined : action;

    // Every row keeps the icon column, so labels line up with or without a glyph.
    const iconSlot = document.createElement("span");
    iconSlot.className = "sheetwrite-context-menu-icon";
    iconSlot.setAttribute("aria-hidden", "true");
    const iconName = item.icon ?? (builtIn ? ACTION_ICON[builtIn] : undefined);
    if (iconName) iconSlot.append(iconNode(iconName, this.config.icons));
    row.appendChild(iconSlot);

    const label = document.createElement("span");
    label.className = "sheetwrite-context-menu-label";
    label.textContent = item.label ?? (builtIn ? DEFAULT_LABEL[builtIn] : "");
    if (pending) {
      row.setAttribute("aria-busy", "true");
      label.textContent = `Running ${label.textContent}…`;
    }
    row.appendChild(label);

    const binding: RowBinding = { menu, row, context, isDisabled };
    const children = item.items;
    if (children !== undefined) this.bindSubmenuRow(binding, children);
    else this.bindActionRow(binding, item, key, feedback);

    row.addEventListener("pointerenter", () => {
      if (!isDisabled) row.focus({ preventScroll: true });
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = window.setTimeout(() => {
        if (children !== undefined && !isDisabled) {
          this.openSubmenu(menu, row, children, context, false);
        } else {
          this.closeSubmenusFrom(this.levelOf(menu));
        }
      }, SUBMENU_HOVER_MS);
    });
    return row;
  }

  /** Adds the submenu arrow; a click opens `children` beside the row. */
  private bindSubmenuRow(binding: RowBinding, children: readonly ContextMenuItem[]): void {
    const { menu, row, context, isDisabled } = binding;
    row.setAttribute("aria-haspopup", "menu");
    row.setAttribute("aria-expanded", "false");
    const arrow = document.createElement("span");
    arrow.className = "sheetwrite-context-menu-arrow";
    arrow.setAttribute("aria-hidden", "true");
    row.appendChild(arrow);

    row.addEventListener("click", () => {
      if (!isDisabled) this.openSubmenu(menu, row, children, context);
    });
  }

  /** Adds the shortcut hint; a click runs the row's command and closes the menu. */
  private bindActionRow(
    binding: RowBinding,
    item: ContextMenuItem,
    key: string,
    feedback: ActionFeedback | undefined,
  ): void {
    const { row, context, isDisabled } = binding;
    this.appendShortcut(row, item, item.action);
    const run = item.onClick
      ? () => item.onClick?.(this.grid, context.cell)
      : actionHandler(item.action, this.actions);

    row.addEventListener("click", () => {
      if (isDisabled) return;
      // The menu closes at once; a refused clipboard or a failed export
      // still reaches the user through the grid's action status.
      if (feedback) void feedback.run(key, run);
      else run();
      this.close();
    });
  }

  private appendShortcut(
    row: HTMLElement,
    item: ContextMenuItem,
    action: ContextMenuActionName | undefined,
  ): void {
    const binding = item.shortcut ?? (action && isKeyboardAction(action) ? action : undefined);
    const shortcutLabel =
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
    if (!shortcutLabel) return;
    const shortcut = document.createElement("span");
    shortcut.className = "sheetwrite-context-menu-shortcut";
    shortcut.textContent = shortcutLabel;
    row.appendChild(shortcut);
  }

  /**
   * Opens `items` beside `row`, replacing any deeper submenu. Keyboard and
   * click openings move focus to the first row; hover leaves it on the parent.
   */
  private openSubmenu(
    parent: HTMLDivElement,
    row: HTMLElement,
    items: readonly ContextMenuItem[],
    context: ContextMenuContext,
    focusFirst = true,
  ): void {
    const level = this.levelOf(parent);
    if (this.submenus[level]?.parentRow !== row) {
      this.closeSubmenusFrom(level);
      const element = this.createMenuElement("sheetwrite-context-menu sheetwrite-context-menu-sub");
      this.fill(element, items, context);
      element.style.display = "block";
      this.place(element, parent, row);
      row.setAttribute("aria-expanded", "true");
      this.submenus.push({ element, parentRow: row });
    }
    const submenu = this.submenus[level]?.element;
    if (focusFirst && submenu) this.enabledRows(submenu)[0]?.focus({ preventScroll: true });
  }

  /** Beside the parent row, flipped to the left when the right edge would clip it. */
  private place(submenu: HTMLElement, parent: HTMLElement, row: HTMLElement): void {
    const parentRect = parent.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    let left = parentRect.right - SUBMENU_OVERLAP_PX;
    if (left + submenu.offsetWidth > window.innerWidth) {
      left = Math.max(0, parentRect.left - submenu.offsetWidth + SUBMENU_OVERLAP_PX);
    }
    const top = Math.max(
      0,
      Math.min(rowRect.top - MENU_PADDING_PX, window.innerHeight - submenu.offsetHeight),
    );
    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;
  }

  /** Closes the submenus at `level` and deeper (0 closes all of them). */
  private closeSubmenusFrom(level: number): void {
    for (const sub of this.submenus.splice(level)) {
      sub.parentRow.setAttribute("aria-expanded", "false");
      sub.element.remove();
    }
  }

  private onMenuKey(event: KeyboardEvent, menu: HTMLDivElement): void {
    const rows = this.enabledRows(menu);
    const active = document.activeElement;
    const index = rows.findIndex((row) => row === active);
    const level = this.levelOf(menu);
    const focusAt = (next: number): void => {
      rows[(next + rows.length) % rows.length]?.focus({ preventScroll: true });
    };
    const backToParent = (): void => {
      const parentRow = this.submenus[level - 1]?.parentRow;
      this.closeSubmenusFrom(level - 1);
      parentRow?.focus({ preventScroll: true });
    };

    switch (event.key) {
      case "ArrowDown":
        focusAt(index + 1);
        break;
      case "ArrowUp":
        focusAt(index < 0 ? -1 : index - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(-1);
        break;
      case "Enter":
      case " ":
        if (active instanceof HTMLElement && rows.includes(active)) active.click();
        break;
      case "ArrowRight":
        if (active instanceof HTMLElement && active.getAttribute("aria-haspopup") === "menu") {
          active.click();
        }
        break;
      case "ArrowLeft":
        if (level > 0) backToParent();
        break;
      case "Escape":
        if (level > 0) backToParent();
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

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!(e.target instanceof Element) || !this.ownsElement(e.target)) this.close();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") this.close();
  };

  private readonly onDismiss = (): void => {
    this.close();
  };

  private addDismissListeners(): void {
    document.addEventListener("pointerdown", this.onPointerDown, true);
    document.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("scroll", this.onDismiss, {
      capture: true,
      once: true,
    });
    window.addEventListener("resize", this.onDismiss, { once: true });
  }

  private removeDismissListeners(): void {
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    document.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("scroll", this.onDismiss, true);
    window.removeEventListener("resize", this.onDismiss);
  }
}
