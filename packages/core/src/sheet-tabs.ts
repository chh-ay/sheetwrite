import type { IconName } from "./icons/icon-names.js";
import { iconNode } from "./icons/resolve.js";
import { type PopupPlacement, popupPosition } from "./menu-surface.js";
import { checkIconStyles, checkStylePart } from "./style-parts.js";
import type { SheetId } from "./types/coordinates.js";
import type { DocumentOp } from "./types/document.js";
import type { IconOverrides, SheetLifecycleResult } from "./types/grid.js";

/** One selectable sheet record; activation is by `id`, never by display name. */
export interface SheetTabRecord {
  id: SheetId;
  name: string;
  visibility?: "visible" | "hidden" | "veryHidden";
  /** The tab's color as `#RRGGBB`; absent shows the default tab. */
  tabColor?: string;
}

/**
 * Whether an operation changes what tabs show (id, name, order or visibility).
 * A tab update rebuilds the tabs and closes an open tab menu, so cell edits
 * must not trigger one.
 */
export function changesSheetTabs(operation: DocumentOp): boolean {
  return (
    operation.op === "addSheet" ||
    operation.op === "removeSheet" ||
    operation.op === "renameSheet" ||
    operation.op === "moveSheet" ||
    operation.op === "setSheetVisibility" ||
    (operation.op === "setSheetMeta" && operation.patch.tabColor !== undefined)
  );
}

/** The sheet menu's Move or Copy… and Tab Color…, whose panels load on first use. */
export type SheetTabCommand = "moveCopy" | "tabColor";

export interface SheetTabsOptions {
  onActivate: (id: SheetId) => void;
  /**
   * Give the keyboard to the active sheet. Called after a tab is clicked, so
   * keys act on the sheet, as in Excel; a tab chosen from the keyboard keeps
   * the focus.
   */
  focusSheet?: () => void;
  /**
   * Add a sheet at workbook position `index`. As in Excel, the add button
   * adds it after the active sheet, Shift+F11 before it, and the sheet
   * menu's Insert before the menu's sheet.
   */
  onAdd?: (index: number) => SheetLifecycleResult;
  onRemove?: (id: SheetId) => SheetLifecycleResult;
  onRename?: (id: SheetId, name: string) => SheetLifecycleResult;
  onMove?: (id: SheetId, toIndex: number) => SheetLifecycleResult;
  /** Open a panel of `sheet-tab-panels.ts` for sheet `id`; it shows itself with `showPanel`. */
  onCommand?: (command: SheetTabCommand, id: SheetId) => void;
  onHide?: (id: SheetId) => SheetLifecycleResult;
  onUnhide?: (id: SheetId) => SheetLifecycleResult;
  /** Accessible tablist label (default "Sheets"). */
  label?: string;
  /** Suppresses document lifecycle affordances while retaining navigation. */
  readOnly?: boolean;
  /** The host's glyph overrides (`config.icons`), read each time the sheet menu opens. */
  icons?: () => IconOverrides | undefined;
}

interface VisibleSheet {
  readonly sheet: SheetTabRecord;
  readonly workbookIndex: number;
}

interface RenameState {
  readonly id: SheetId;
  draft: string;
  sourceName: string;
  composing: boolean;
}

interface LifecycleFeedback {
  readonly sheet: SheetId;
  readonly message: string;
  readonly code?: string;
}

let next_error_id = 0;
// One tab bar shows at most one sheet menu. Find it by its class, not by its
// per-grid id: the browser keeps a parsed copy of each different selector text
// for the page, so an id selector would keep one entry for every grid created.
const TAB_MENU_SELECTOR = ".sheetwrite-tab-menu";
/** Width of the active tab's ⋯ button; `.sheetwrite-tab-active` leaves 40 px of right padding for it. */
const OPTIONS_BUTTON_WIDTH = 32;
/** The sheet menu opens under its trigger, flush with it. */
const MENU_PLACEMENT: PopupPlacement = { side: "below", gap: 0 };
/** The hidden-sheet choices open over the tab bar, which sits at the bottom of the grid. */
const CHOICES_PLACEMENT: PopupPlacement = { side: "above", gap: 4 };
/** A touch held this long on a scroll arrow opens the list of sheets, as a right-click does. */
const LONG_PRESS_MS = 500;
/** A touch that moves farther than this, in CSS px, is a scroll, not a long press. */
const LONG_PRESS_SLOP = 10;
/** The list of all sheets shows this many before it scrolls. */
const SHEET_LIST_ROWS = 12;
/** The list of all sheets keeps this far inside the page's visible area, in CSS px. */
const SHEET_LIST_MARGIN = 8;

/**
 * A tab bar glyph on a 20-unit grid; `stroke_width` 1.33 matches the command
 * icon sheet's 1.6 on 24 units.
 */
function create_tab_icon(path_data: string, stroke_width = "2"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("sheetwrite-tab-icon");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", path_data);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-width", stroke_width);
  svg.appendChild(path);
  return svg;
}

function feedback_from(result: SheetLifecycleResult): Omit<LifecycleFeedback, "sheet"> | null {
  const issues =
    result.status === "rejected"
      ? result.issues
      : result.status === "applied"
        ? result.rejections
        : undefined;
  const issue = issues?.find((candidate) => candidate.kind === "sheet-lifecycle");
  if (!issue) return null;
  return {
    message: issue.message,
    ...(typeof issue.code === "string" ? { code: issue.code } : {}),
  };
}

/**
 * Controlled worksheet tab strip shared by Grid and the spreadsheet shell.
 * Document lifecycle callbacks are synchronous so rejected operations can keep
 * inline rename focused and expose their structured error without a prompt.
 */
export class SheetTabs {
  private readonly host: HTMLElement;
  private readonly on_activate: (id: SheetId) => void;
  private readonly on_add?: (index: number) => SheetLifecycleResult;
  private readonly on_remove?: (id: SheetId) => SheetLifecycleResult;
  private readonly on_rename?: (id: SheetId, name: string) => SheetLifecycleResult;
  private readonly on_move?: (id: SheetId, toIndex: number) => SheetLifecycleResult;
  private readonly on_command?: (command: SheetTabCommand, id: SheetId) => void;
  private readonly on_hide?: (id: SheetId) => SheetLifecycleResult;
  private readonly on_unhide?: (id: SheetId) => SheetLifecycleResult;
  private readonly label: string;
  private readonly icons: (() => IconOverrides | undefined) | undefined;
  private readonly focus_sheet: (() => void) | undefined;
  private readonly error_id = `sheetwrite-sheet-error-${++next_error_id}`;
  private readonly menu_id = `${this.error_id}-options`;

  private sheets: readonly SheetTabRecord[] = [];
  private active_id: SheetId = "";
  private focused_id: SheetId | null = null;
  private editing: RenameState | null = null;
  private menu_sheet_id: SheetId | null = null;
  /** A panel shown in place of the open menu's items. */
  private menu_panel: HTMLElement | null = null;
  /** Viewport position of the options trigger when the open menu was placed. */
  private menu_anchor: { left: number; top: number } | null = null;
  private feedback: LifecycleFeedback | null = null;
  private unhide_dismiss: (() => void) | null = null;
  /** Closes the list of every sheet that the scroll arrows open. */
  private sheet_list_dismiss: (() => void) | null = null;
  /** The overflow cue (the scroll arrows) is updated once a frame at most. */
  private overflow_frame = 0;
  private readonly overflow_observer: ResizeObserver | null =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => this.schedule_overflow());
  private buttons: HTMLButtonElement[] = [];
  private button_ids: SheetId[] = [];
  private move_indexes: number[] = [];
  private dragged_id: SheetId | null = null;
  private read_only: boolean;
  private rendering = false;
  private destroyed = false;

  constructor(host: HTMLElement, options: SheetTabsOptions) {
    this.host = host;
    this.on_activate = options.onActivate;
    this.on_add = options.onAdd;
    this.on_remove = options.onRemove;
    this.on_rename = options.onRename;
    this.on_move = options.onMove;
    this.on_command = options.onCommand;
    this.on_hide = options.onHide;
    this.on_unhide = options.onUnhide;
    this.read_only = options.readOnly ?? false;
    this.label = options.label ?? "Sheets";
    this.icons = options.icons;
    this.focus_sheet = options.focusSheet;
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", `${this.label} controls`);
    host.addEventListener("keydown", this.on_keydown);
    host.addEventListener("focusout", this.on_focus_out);
    host.addEventListener("scroll", this.on_strip_scroll, { passive: true });
    this.overflow_observer?.observe(host);
  }

  /** Reconciles the controlled workbook records while preserving transient focus/editor state by ID. */
  update(sheets: readonly SheetTabRecord[], activeId: SheetId): void {
    if (this.destroyed) return;
    this.clear_menu_state();

    const old_visible = this.visible_sheets();
    const old_focus_index = old_visible.findIndex(({ sheet }) => sheet.id === this.focused_id);
    const old_edit_index = old_visible.findIndex(({ sheet }) => sheet.id === this.editing?.id);
    const had_focus = this.host.contains(document.activeElement);
    const focused_element_id = this.sheet_id_of(document.activeElement);
    if (focused_element_id) this.focused_id = focused_element_id;

    this.sheets = sheets;
    this.active_id = activeId;
    const visible = this.visible_sheets();

    if (this.editing) {
      const current = visible.find(({ sheet }) => sheet.id === this.editing?.id)?.sheet;
      if (!current) {
        this.editing = null;
        this.feedback = null;
        this.focused_id = this.neighbor_at(visible, old_edit_index);
      } else {
        if (this.editing.draft === this.editing.sourceName) this.editing.draft = current.name;
        this.editing.sourceName = current.name;
      }
    }

    if (this.feedback && !sheets.some((sheet) => sheet.id === this.feedback?.sheet)) {
      this.feedback = null;
    }
    if (!visible.some(({ sheet }) => sheet.id === this.focused_id)) {
      this.focused_id = this.neighbor_at(visible, old_focus_index);
    }
    if (!this.focused_id) {
      this.focused_id = visible.some(({ sheet }) => sheet.id === activeId)
        ? activeId
        : (visible[0]?.sheet.id ?? null);
    }

    this.render(had_focus || this.editing !== null);
  }

  /** Changes mutation availability without rebuilding the owner or losing controlled sheet state. */
  setReadOnly(readOnly: boolean): void {
    if (this.destroyed || this.read_only === readOnly) return;
    const had_focus = this.host.contains(document.activeElement);
    this.read_only = readOnly;
    if (readOnly) {
      this.editing = null;
      this.feedback = null;
      this.clear_menu_state();
    }
    this.render(had_focus);
  }

  /** Idempotently removes DOM and every listener owned by the primitive. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.rendering = true;
    this.host.removeEventListener("keydown", this.on_keydown);
    this.host.removeEventListener("focusout", this.on_focus_out);
    this.host.removeEventListener("scroll", this.on_strip_scroll);
    this.overflow_observer?.disconnect();
    if (this.overflow_frame !== 0) cancelAnimationFrame(this.overflow_frame);
    this.overflow_frame = 0;
    this.clear_menu_state();
    this.unhide_dismiss?.();
    this.unhide_dismiss = null;
    this.sheet_list_dismiss?.();
    this.sheet_list_dismiss = null;
    this.host.replaceChildren();
    this.host.removeAttribute("role");
    this.host.removeAttribute("aria-label");
    this.host.removeAttribute("data-tabs-cut-start");
    this.host.removeAttribute("data-tabs-cut-end");
    this.rendering = false;
    this.sheets = [];
    this.buttons = [];
    this.button_ids = [];
    this.move_indexes = [];
    this.editing = null;
    this.feedback = null;
    this.focused_id = null;
    this.dragged_id = null;
  }

  /** The active sheet's workbook position. */
  private active_index(): number {
    return this.sheets.findIndex((sheet) => sheet.id === this.active_id);
  }

  private visible_sheets(): VisibleSheet[] {
    const visible: VisibleSheet[] = [];
    for (let workbook_index = 0; workbook_index < this.sheets.length; workbook_index++) {
      const sheet = this.sheets[workbook_index]!;
      if (sheet.visibility === "hidden" || sheet.visibility === "veryHidden") continue;
      visible.push({ sheet, workbookIndex: workbook_index });
    }
    return visible;
  }

  private hidden_sheets(): readonly SheetTabRecord[] {
    return this.sheets.filter((sheet) => sheet.visibility === "hidden");
  }

  private neighbor_at(visible: readonly VisibleSheet[], previous_index: number): SheetId | null {
    if (visible.length === 0) return null;
    const index = previous_index < 0 ? 0 : Math.min(previous_index, visible.length - 1);
    return visible[index]!.sheet.id;
  }

  private sheet_id_of(element: Element | null): SheetId | null {
    if (!(element instanceof HTMLElement) || !this.host.contains(element)) return null;
    return element.closest<HTMLElement>("[data-sheet-id]")?.dataset.sheetId ?? null;
  }

  private render(force_focus = false): void {
    if (this.destroyed) return;
    this.unhide_dismiss?.();
    this.unhide_dismiss = null;
    this.sheet_list_dismiss?.();
    this.sheet_list_dismiss = null;
    const restore_focus = force_focus || this.host.contains(document.activeElement);
    const visible = this.visible_sheets();
    const hidden = this.hidden_sheets();
    const fragment = document.createDocumentFragment();
    const tabstrip = document.createElement("div");
    tabstrip.className = "sheetwrite-tabstrip";
    const tablist = document.createElement("div");
    tablist.className = "sheetwrite-tablist";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", this.label);
    let rename_input: HTMLInputElement | null = null;
    let active_options: HTMLElement | null = null;
    this.rendering = true;
    this.buttons = [];
    this.button_ids = [];
    this.move_indexes = [];

    for (let visible_index = 0; visible_index < visible.length; visible_index++) {
      const { sheet, workbookIndex: workbook_index } = visible[visible_index]!;
      const active = sheet.id === this.active_id;
      const editing = this.editing?.id === sheet.id;
      const item = document.createElement("div");
      item.className = "sheetwrite-tab-item";
      item.setAttribute("role", "presentation");
      if (editing) {
        rename_input = this.create_rename_input(sheet, active);
        const placeholder = this.create_tab(sheet, active, workbook_index);
        placeholder.classList.add("sheetwrite-tab-placeholder");
        placeholder.dataset.renamePlaceholder = sheet.id;
        placeholder.tabIndex = -1;
        item.appendChild(placeholder);
      } else {
        item.appendChild(this.create_tab(sheet, active, workbook_index));
        if (active && !this.read_only && this.has_sheet_options(visible.length)) {
          item.classList.add("sheetwrite-tab-item-with-options");
          active_options = this.create_options(sheet, visible.length);
        }
      }
      tablist.appendChild(item);
    }

    tabstrip.appendChild(tablist);
    if (rename_input) tabstrip.appendChild(rename_input);
    if (active_options) tabstrip.appendChild(active_options);
    // When the tabs overflow, an arrow at each edge says so and scrolls by a
    // sheet, as Excel's tab scroll arrows do; a right-click on either lists
    // every sheet. The trailing arrow and + stay at the strip's right edge.
    fragment.append(this.create_scroll_arrow("previous"), tabstrip);
    const end = document.createElement("div");
    end.className = "sheetwrite-tab-end";
    end.appendChild(this.create_scroll_arrow("next"));
    if (!this.read_only && this.on_add) end.appendChild(this.create_add_button(this.on_add));
    fragment.appendChild(end);

    if (!this.read_only && this.on_unhide && hidden.length > 0) {
      fragment.appendChild(this.create_unhide_menu(hidden, this.on_unhide));
    }
    if (this.feedback) fragment.appendChild(this.create_error(this.feedback));

    this.host.replaceChildren(fragment);
    checkStylePart(tabstrip, "tabs", "The sheet tab bar");
    if (rename_input) {
      const placeholder = this.host.querySelector<HTMLElement>(
        `[data-rename-placeholder="${CSS.escape(rename_input.dataset.sheetId ?? "")}"]`,
      );
      if (placeholder) {
        const strip_rect = tabstrip.getBoundingClientRect();
        const placeholder_rect = placeholder.getBoundingClientRect();
        rename_input.style.left = `${placeholder_rect.left - strip_rect.left}px`;
        rename_input.style.top = `${placeholder_rect.top - strip_rect.top}px`;
        rename_input.style.width = `${placeholder_rect.width}px`;
        rename_input.style.height = `${placeholder_rect.height}px`;
      }
    }
    if (active_options) {
      const active_tab = this.button_for(this.active_id);
      if (active_tab) {
        const strip_rect = tabstrip.getBoundingClientRect();
        const tab_rect = active_tab.getBoundingClientRect();
        active_options.style.left = `${tab_rect.right - strip_rect.left - OPTIONS_BUTTON_WIDTH}px`;
        active_options.style.top = `${tab_rect.top - strip_rect.top}px`;
        active_options.style.width = `${OPTIONS_BUTTON_WIDTH}px`;
        active_options.style.height = `${tab_rect.height}px`;
      }
    }
    this.rendering = false;

    const edited_input = this.host.querySelector<HTMLInputElement>(".sheetwrite-tab-input");
    const menu = this.host.querySelector<HTMLElement>(TAB_MENU_SELECTOR);
    const focus_button =
      this.button_for(this.focused_id) ?? this.button_for(this.active_id) ?? this.buttons[0];
    if (edited_input) {
      edited_input.focus({ preventScroll: true });
      edited_input.setSelectionRange(0, edited_input.value.length);
      this.scroll_into_view(edited_input);
    } else if (menu) {
      this.position_menu(menu);
      this.focus_menu_item(0);
    } else if (restore_focus && focus_button) {
      this.set_roving_focus(focus_button);
      focus_button.focus({ preventScroll: true });
      this.scroll_into_view(focus_button);
    }

    const active_button = this.button_for(this.active_id);
    if (active_button && active_button !== focus_button) this.scroll_into_view(active_button);
    if (!edited_input && focus_button) this.scroll_into_view(focus_button);
    this.update_overflow();
  }

  private create_tab(
    sheet: SheetTabRecord,
    active: boolean,
    workbook_index: number,
  ): HTMLButtonElement {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = active ? "sheetwrite-tab sheetwrite-tab-active" : "sheetwrite-tab";
    tab.textContent = sheet.name;
    tab.dataset.sheetId = sheet.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-label", `${sheet.name} sheet`);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    if (sheet.tabColor) tab.style.setProperty("--sheetwrite-tab-color", sheet.tabColor);
    if (this.feedback?.sheet === sheet.id) tab.setAttribute("aria-describedby", this.error_id);
    tab.tabIndex = sheet.id === this.focused_id ? 0 : -1;
    tab.draggable = !this.read_only && this.on_move !== undefined;

    tab.addEventListener("focus", () => {
      this.focused_id = sheet.id;
      this.set_roving_focus(tab);
      this.scroll_into_view(tab);
    });

    tab.addEventListener("click", (event) => {
      this.focused_id = sheet.id;
      this.feedback = null;
      this.on_activate(sheet.id);
      // A keyboard press of the tab makes a click with no pointer presses.
      if (event.detail > 0) this.focus_sheet?.();
    });

    if (!this.read_only) {
      // As in Excel, a right-click on a tab activates its sheet and opens the sheet's menu.
      tab.addEventListener("contextmenu", (event) => {
        if (!this.has_sheet_options(this.visible_sheets().length)) return;
        event.preventDefault();
        this.focused_id = sheet.id;
        this.feedback = null;
        if (sheet.id !== this.active_id) this.on_activate(sheet.id);
        this.open_menu(sheet.id);
      });
    }

    if (!this.read_only && this.on_rename) {
      tab.addEventListener("dblclick", (event) => {
        event.preventDefault();
        this.start_rename(sheet.id);
      });
    }

    if (tab.draggable) {
      tab.addEventListener("dragstart", (event) => {
        this.dragged_id = sheet.id;
        event.dataTransfer?.setData("text/plain", sheet.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });

      tab.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });

      tab.addEventListener("drop", (event) => {
        event.preventDefault();
        const dragged = this.dragged_id ?? event.dataTransfer?.getData("text/plain") ?? null;
        this.dragged_id = null;
        if (!dragged || dragged === sheet.id) return;
        this.focused_id = dragged;
        this.performLifecycle(dragged, () => this.on_move!(dragged, workbook_index));
      });

      tab.addEventListener("dragend", () => {
        this.dragged_id = null;
      });
    }

    this.buttons.push(tab);
    this.button_ids.push(sheet.id);
    this.move_indexes.push(workbook_index);
    return tab;
  }

  private create_rename_input(sheet: SheetTabRecord, active: boolean): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.className = active
      ? "sheetwrite-tab sheetwrite-tab-active sheetwrite-tab-input"
      : "sheetwrite-tab sheetwrite-tab-input";
    input.value = this.editing?.draft ?? sheet.name;
    input.dataset.sheetId = sheet.id;
    input.setAttribute("aria-label", `Rename ${sheet.name} sheet`);
    if (this.feedback?.sheet === sheet.id) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", this.error_id);
    }

    input.addEventListener("input", () => {
      if (this.editing?.id === sheet.id) this.editing.draft = input.value;
    });

    input.addEventListener("compositionstart", () => {
      if (this.editing?.id === sheet.id) this.editing.composing = true;
    });

    input.addEventListener("compositionend", () => {
      if (this.editing?.id === sheet.id) {
        this.editing.composing = false;
        this.editing.draft = input.value;
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        if (event.isComposing || this.editing?.composing) return;
        event.preventDefault();
        event.stopPropagation();
        this.commit_rename();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancel_rename();
      }
    });

    input.addEventListener("blur", () => {
      if (this.rendering || this.destroyed || this.editing?.composing) return;
      this.commit_rename();
    });

    return input;
  }

  private has_sheet_options(visible_count: number): boolean {
    return (
      this.on_add !== undefined ||
      this.on_rename !== undefined ||
      this.on_command !== undefined ||
      this.on_hide !== undefined ||
      (this.on_remove !== undefined && visible_count > 1)
    );
  }

  private create_options(sheet: SheetTabRecord, visible_count: number): HTMLElement {
    const options = document.createElement("span");
    options.className = "sheetwrite-tab-options";
    options.dataset.sheetId = sheet.id;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = `${this.menu_id}-trigger`;
    trigger.className = "sheetwrite-tab-options-button";
    trigger.setAttribute("aria-label", `Options for ${sheet.name} sheet`);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", String(this.menu_sheet_id === sheet.id));
    trigger.setAttribute("aria-controls", this.menu_id);
    trigger.appendChild(create_tab_icon("M4 10h.01M10 10h.01M16 10h.01"));
    trigger.addEventListener("click", () => {
      if (this.menu_sheet_id === sheet.id) this.closeMenu(true);
      else this.open_menu(sheet.id);
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      event.stopPropagation();
      this.open_menu(sheet.id, event.key === "ArrowUp");
    });

    options.appendChild(trigger);

    if (this.menu_panel) {
      options.appendChild(this.menu_panel);
    } else if (this.menu_sheet_id === sheet.id) {
      const menu = document.createElement("div");
      menu.id = this.menu_id;
      menu.className = "sheetwrite-tab-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `${sheet.name} sheet options`);
      // WebKit does not focus a pressed button, so a press would move focus out
      // of the menu and close it before the click; keep focus where it is.
      menu.addEventListener("mousedown", (event) => event.preventDefault());

      const on_add = this.on_add;
      if (on_add) {
        // Excel's Insert adds a sheet before this one.
        const index = this.sheets.indexOf(sheet);
        menu.appendChild(
          this.create_menu_item(
            "Insert",
            `Insert a sheet before ${sheet.name}`,
            "",
            () => this.performLifecycle(sheet.id, () => on_add(index)),
            { icon: "insertSheet" },
          ),
        );
      }

      if (this.on_rename) {
        menu.appendChild(
          this.create_menu_item("Rename", `Rename ${sheet.name} sheet`, "F2", () => {
            this.clear_menu_state();
            this.start_rename(sheet.id);
          }),
        );
      }

      const on_command = this.on_command;
      if (on_command) {
        menu.append(
          this.create_menu_item(
            "Move or Copy…",
            `Move or copy ${sheet.name} sheet`,
            "",
            () => on_command("moveCopy", sheet.id),
            { icon: "moveCopySheet" },
          ),
          this.create_menu_item(
            "Tab Color…",
            `Tab color for ${sheet.name} sheet`,
            "",
            () => on_command("tabColor", sheet.id),
            { icon: "tabColor" },
          ),
        );
      }

      const on_hide = this.on_hide;
      if (on_hide) {
        menu.appendChild(
          this.create_menu_item("Hide", `Hide ${sheet.name} sheet`, "Control+Shift+H", () => {
            this.clear_menu_state();
            this.focused_id = sheet.id;
            this.performLifecycle(sheet.id, () => on_hide(sheet.id), true);
          }),
        );
      }

      const on_remove = this.on_remove;
      if (on_remove && visible_count > 1) {
        menu.appendChild(
          this.create_menu_item(
            "Remove",
            `Remove ${sheet.name} sheet`,
            "Delete",
            () => {
              this.clear_menu_state();
              this.focused_id = sheet.id;
              this.performLifecycle(sheet.id, () => on_remove(sheet.id), true);
            },
            { destructive: true },
          ),
        );
      }

      options.appendChild(menu);
    }

    return options;
  }

  /**
   * One row of the sheet menu. Every row keeps the icon column, so labels line
   * up with or without a glyph from the command icon sheet.
   */
  private create_menu_item(
    text: string,
    label: string,
    shortcut: string,
    action: () => void,
    { destructive = false, icon }: { destructive?: boolean; icon?: IconName } = {},
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = destructive
      ? "sheetwrite-tab-menu-item sheetwrite-tab-menu-item-destructive"
      : "sheetwrite-tab-menu-item";
    const icon_slot = document.createElement("span");
    icon_slot.className = "sheetwrite-tab-menu-icon";
    if (icon) icon_slot.append(iconNode(icon, this.icons?.()));
    button.append(icon_slot, text);
    button.tabIndex = -1;
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-label", label);
    if (shortcut) button.setAttribute("aria-keyshortcuts", shortcut);
    button.addEventListener("click", action);
    return button;
  }

  private create_add_button(on_add: (index: number) => SheetLifecycleResult): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheetwrite-tab-add";
    button.appendChild(create_tab_icon("M10 4v12M4 10h12", "1.33"));
    button.setAttribute("aria-label", "Add sheet");
    button.title = "Add sheet";
    button.addEventListener("click", (event) => {
      this.performLifecycle(this.active_id, () => {
        const result = on_add(this.active_index() + 1);
        // The new sheet's tab takes the roving focus, not the tab that last had it.
        this.focused_id = this.active_id;
        return result;
      });
      // As a click on a tab does, a click on + gives the new sheet the keys, so
      // typing goes to its A1, as in Excel.
      if (event.detail > 0) this.focus_sheet?.();
    });
    return button;
  }

  private create_unhide_menu(
    hidden: readonly SheetTabRecord[],
    on_unhide: (id: SheetId) => SheetLifecycleResult,
  ): HTMLElement {
    const disclosure = document.createElement("div");
    disclosure.className = "sheetwrite-tab-unhide";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "Unhide…";
    trigger.setAttribute("aria-label", "Unhide sheet");
    trigger.setAttribute("aria-keyshortcuts", "Control+Shift+U");
    trigger.setAttribute("aria-expanded", "false");
    if (this.feedback && hidden.some((sheet) => sheet.id === this.feedback?.sheet)) {
      trigger.setAttribute("aria-invalid", "true");
      trigger.setAttribute("aria-describedby", this.error_id);
    }

    const choices = document.createElement("div");
    choices.className = "sheetwrite-tab-unhide-menu";
    choices.setAttribute("popover", "manual");
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Hidden sheets");
    choices.hidden = true;
    // As in the sheet menu, keep focus where it is.
    choices.addEventListener("mousedown", (event) => event.preventDefault());
    const close = (restore_focus: boolean): void => {
      if (typeof choices.hidePopover === "function") {
        try {
          choices.hidePopover();
        } catch {
          // `hidePopover` throws when the menu is not open as a popover: nothing to hide.
        }
      }

      choices.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      this.unhide_dismiss?.();
      this.unhide_dismiss = null;
      if (restore_focus) trigger.focus();
    };

    const on_outside_pointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !disclosure.contains(event.target)) {
        close(disclosure.contains(document.activeElement));
      }
    };

    trigger.addEventListener("click", () => {
      if (!choices.hidden) {
        close(true);
        return;
      }

      choices.hidden = false;
      if (typeof choices.showPopover === "function") {
        choices.showPopover();
        const { left, top } = popupPosition(
          trigger.getBoundingClientRect(),
          choices.getBoundingClientRect(),
          CHOICES_PLACEMENT,
        );
        choices.style.left = `${left}px`;
        choices.style.top = `${top}px`;
      }

      trigger.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", on_outside_pointer, true);
      this.unhide_dismiss = () =>
        document.removeEventListener("pointerdown", on_outside_pointer, true);
      choices.querySelector("button")?.focus();
    });

    disclosure.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || choices.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    });

    disclosure.addEventListener("focusout", (event) => {
      if (event.relatedTarget instanceof Node && disclosure.contains(event.relatedTarget)) return;
      close(false);
    });

    for (const sheet of hidden) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sheet.name;
      button.addEventListener("click", () => {
        this.focused_id = sheet.id;
        this.performLifecycle(sheet.id, () => on_unhide(sheet.id));
      });

      choices.appendChild(button);
    }

    disclosure.append(trigger, choices);
    return disclosure;
  }

  private create_error(feedback: LifecycleFeedback): HTMLElement {
    const error = document.createElement("span");
    error.id = this.error_id;
    error.className = "sheetwrite-tab-error";
    error.dataset.code = feedback.code ?? "sheet-lifecycle";
    error.setAttribute("role", "alert");
    error.textContent = feedback.message;
    return error;
  }

  private start_rename(id: SheetId): void {
    if (this.destroyed || this.read_only || !this.on_rename) return;
    const sheet = this.sheets.find((candidate) => candidate.id === id);
    if (!sheet || sheet.visibility === "hidden" || sheet.visibility === "veryHidden") return;
    this.focused_id = id;
    this.feedback = null;
    this.editing = { id, draft: sheet.name, sourceName: sheet.name, composing: false };
    this.render(true);
  }

  private cancel_rename(): void {
    if (!this.editing) return;
    const id = this.editing.id;
    this.editing = null;
    this.feedback = null;
    this.focused_id = id;
    this.render(true);
  }

  private commit_rename(): void {
    const editing = this.editing;
    if (!editing || this.read_only || !this.on_rename) return;
    if (editing.draft === editing.sourceName) {
      this.cancel_rename();
      return;
    }

    const result = this.on_rename(editing.id, editing.draft);
    const feedback = feedback_from(result);
    if (feedback) {
      this.feedback = { sheet: editing.id, ...feedback };
    } else {
      this.feedback = null;
    }
    if (!feedback && (result.status === "applied" || result.status === "noop")) this.editing = null;
    this.focused_id = editing.id;
    this.render(true);
  }

  private open_menu(id: SheetId, focus_last = false): void {
    if (this.destroyed || this.read_only || id !== this.active_id) return;
    if (!this.visible_sheets().some(({ sheet }) => sheet.id === id)) return;
    this.menu_sheet_id = id;
    this.render();
    if (focus_last) this.focus_menu_item(-1);
    this.add_menu_dismiss_listeners();
  }

  /**
   * Show `panel` in place of the items of sheet `id`'s open menu; it closes as
   * the menu does. `sheet-tab-panels.ts` builds the panels.
   */
  showPanel(id: SheetId, panel: HTMLElement): void {
    if (this.menu_sheet_id !== id) return;
    this.menu_panel = panel;
    this.render();
  }

  private clear_menu_state(): SheetId | null {
    const id = this.menu_sheet_id;
    this.menu_sheet_id = null;
    this.menu_panel = null;
    this.menu_anchor = null;
    this.remove_menu_dismiss_listeners();
    return id;
  }

  closeMenu(restoreFocus: boolean): void {
    const id = this.clear_menu_state();
    if (!id) return;
    this.host.querySelector<HTMLElement>(TAB_MENU_SELECTOR)?.remove();
    const trigger = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-options-button");
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus && trigger?.closest<HTMLElement>("[data-sheet-id]")?.dataset.sheetId === id) {
      trigger.focus();
    }
  }

  private focus_menu_item(index: number): void {
    const menu = this.host.querySelector<HTMLElement>(TAB_MENU_SELECTOR);
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    if (items.length === 0) return;
    const target_index = (index + items.length) % items.length;
    for (let current = 0; current < items.length; current++) {
      items[current]!.tabIndex = current === target_index ? 0 : -1;
    }
    items[target_index]!.focus();
  }

  private position_menu(menu: HTMLElement): void {
    const trigger = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-options-button");
    if (!trigger) return;
    const trigger_rect = trigger.getBoundingClientRect();
    this.menu_anchor = { left: trigger_rect.left, top: trigger_rect.top };
    const { left, top } = popupPosition(trigger_rect, menu.getBoundingClientRect(), MENU_PLACEMENT);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    checkIconStyles(menu, "The sheet tab menu");
  }

  private add_menu_dismiss_listeners(): void {
    document.addEventListener("pointerdown", this.on_outside_interaction, true);
    document.addEventListener("focusin", this.on_outside_interaction, true);
    window.addEventListener("scroll", this.on_menu_scroll, true);
    window.addEventListener("resize", this.on_menu_resize);
  }

  private remove_menu_dismiss_listeners(): void {
    document.removeEventListener("pointerdown", this.on_outside_interaction, true);
    document.removeEventListener("focusin", this.on_outside_interaction, true);
    window.removeEventListener("scroll", this.on_menu_scroll, true);
    window.removeEventListener("resize", this.on_menu_resize);
  }

  private readonly on_outside_interaction = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    const options = this.host.querySelector<HTMLElement>(".sheetwrite-tab-options");
    if (!options?.contains(target)) this.closeMenu(false);
  };

  /**
   * The menu uses viewport coordinates, so it must close when its trigger
   * moves. Scrolls that leave the trigger in place (another panel on the page,
   * or a page scroll event that arrives after the menu opened) keep it open.
   */
  private readonly on_menu_scroll = (): void => {
    const anchor = this.menu_anchor;
    const trigger = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-options-button");
    if (anchor && trigger) {
      const rect = trigger.getBoundingClientRect();
      if (Math.abs(rect.left - anchor.left) < 0.5 && Math.abs(rect.top - anchor.top) < 0.5) return;
    }
    this.closeMenu(false);
  };

  private readonly on_menu_resize = (): void => {
    this.closeMenu(false);
  };

  private readonly on_focus_out = (event: FocusEvent): void => {
    if (this.rendering || !this.menu_sheet_id) return;
    const next = event.relatedTarget;
    const options = this.host.querySelector<HTMLElement>(".sheetwrite-tab-options");
    if (!(next instanceof Node) || !options?.contains(next)) this.closeMenu(false);
  };

  performLifecycle(
    id: SheetId,
    operation: () => SheetLifecycleResult,
    restoreOptions = false,
  ): void {
    if (this.destroyed || this.read_only) return;
    this.clear_menu_state();
    const result = operation();
    const feedback = feedback_from(result);
    this.feedback = feedback ? { sheet: id || result.sheet, ...feedback } : null;
    this.render(restoreOptions || this.host.contains(document.activeElement));
    if (!restoreOptions) return;
    const trigger = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-options-button");
    if (trigger?.closest<HTMLElement>("[data-sheet-id]")?.dataset.sheetId === id) trigger.focus();
  }

  private button_for(id: SheetId | null): HTMLButtonElement | undefined {
    if (id === null) return undefined;
    const index = this.button_ids.indexOf(id);
    return index < 0 ? undefined : this.buttons[index];
  }

  private set_roving_focus(target: HTMLButtonElement): void {
    for (const button of this.buttons) button.tabIndex = button === target ? 0 : -1;
  }

  /**
   * The part of the strip where a tab is in view, in viewport px: between the
   * leading scroll arrow and the trailing arrow and + button, which stay at
   * the strip's edges when the tabs overflow.
   */
  private view_edges(): { left: number; right: number } {
    const strip = this.host.getBoundingClientRect();
    const previous = this.host.querySelector<HTMLElement>(".sheetwrite-tab-scroll-previous");
    const end = this.host.querySelector<HTMLElement>(".sheetwrite-tab-end");
    const left = previous && !previous.hidden ? previous.getBoundingClientRect().right : strip.left;
    const end_left = end?.getBoundingClientRect().left ?? strip.right;
    return { left: Math.max(strip.left, left), right: Math.min(strip.right, end_left) };
  }

  private scroll_into_view(element: HTMLElement): void {
    // Only reveal the tab horizontally; the workbook may sit below the page fold.
    if (element.closest(".sheetwrite-tab-end") !== null) return;
    const { left, right } = this.view_edges();
    const tab_rect = element.getBoundingClientRect();
    if (tab_rect.left < left) {
      this.host.scrollLeft += tab_rect.left - left;
    } else if (tab_rect.right > right) {
      this.host.scrollLeft += tab_rect.right - right;
    }
  }

  /** An arrow at one edge of the strip: shown while the tabs overflow, it scrolls by a sheet. */
  private create_scroll_arrow(direction: "previous" | "next"): HTMLButtonElement {
    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = `sheetwrite-tab-scroll sheetwrite-tab-scroll-${direction}`;
    arrow.appendChild(
      create_tab_icon(direction === "previous" ? "M12 5l-5 5 5 5" : "M8 5l5 5-5 5"),
    );
    const label = direction === "previous" ? "Show earlier sheets" : "Show later sheets";
    arrow.setAttribute("aria-label", label);
    arrow.title = `${label}. Right-click, or press and hold, for a list of all sheets.`;
    arrow.setAttribute("aria-haspopup", "true");
    arrow.setAttribute("aria-expanded", "false");
    arrow.hidden = true;

    // A press after a long press that opened the list must not also scroll.
    let list_opened_by_press = false;
    arrow.addEventListener("click", () => {
      if (list_opened_by_press) {
        list_opened_by_press = false;
        return;
      }
      if (arrow.getAttribute("aria-disabled") !== "true") this.scroll_by_sheet(direction);
    });
    // As in Excel, a right-click on the arrows lists every sheet. The context
    // menu key and Shift+F10 send the same event from the keyboard.
    arrow.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.open_sheet_list(arrow);
    });
    // Touch: a long press does the same, as a right-click is not available.
    arrow.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      const { clientX: client_x, clientY: client_y } = event;
      const timer = setTimeout(() => {
        list_opened_by_press = true;
        this.open_sheet_list(arrow);
      }, LONG_PRESS_MS);
      const stop = (): void => {
        clearTimeout(timer);
        arrow.removeEventListener("pointerup", stop);
        arrow.removeEventListener("pointercancel", stop);
        arrow.removeEventListener("pointermove", move);
      };
      const move = (moved: PointerEvent): void => {
        if (Math.hypot(moved.clientX - client_x, moved.clientY - client_y) > LONG_PRESS_SLOP)
          stop();
      };
      arrow.addEventListener("pointerup", stop);
      arrow.addEventListener("pointercancel", stop);
      arrow.addEventListener("pointermove", move);
    });
    return arrow;
  }

  private schedule_overflow(): void {
    if (this.overflow_frame !== 0 || this.destroyed) return;
    this.overflow_frame = requestAnimationFrame(() => {
      this.overflow_frame = 0;
      this.update_overflow();
    });
  }

  private readonly on_strip_scroll = (): void => this.schedule_overflow();

  /** Shows the arrows while the tabs overflow, and disables the one at the end reached. */
  private update_overflow(): void {
    if (this.destroyed) return;
    const previous = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-scroll-previous");
    const next = this.host.querySelector<HTMLButtonElement>(".sheetwrite-tab-scroll-next");
    if (!previous || !next) return;
    const {
      scrollLeft: scroll_left,
      scrollWidth: scroll_width,
      clientWidth: client_width,
    } = this.host;
    const overflow = scroll_width > client_width + 1;
    if (previous.hidden === overflow) {
      previous.hidden = !overflow;
      next.hidden = !overflow;
    }
    const at_start = !overflow || scroll_left <= 1;
    const at_end = !overflow || scroll_left + client_width >= scroll_width - 1;
    // Cut tab text fades out before an arrow while that edge hides tabs (tabs.css).
    this.host.toggleAttribute("data-tabs-cut-start", !at_start);
    this.host.toggleAttribute("data-tabs-cut-end", !at_end);
    if (!overflow) return;
    previous.setAttribute("aria-disabled", String(at_start));
    next.setAttribute("aria-disabled", String(at_end));
  }

  /** Brings the next sheet that is out of view on that side fully into view, as Excel's arrows do. */
  private scroll_by_sheet(direction: "previous" | "next"): void {
    const { left, right } = this.view_edges();
    const tabs = this.buttons.map((tab) => tab.getBoundingClientRect());
    if (direction === "next") {
      const target = tabs.find((rect) => rect.right > right + 1);
      if (target) this.host.scrollLeft += target.right - right;
    } else {
      // The last tab that starts left of the view: the first one hidden on that side.
      const target = tabs.filter((rect) => rect.left < left - 1).at(-1);
      if (target) this.host.scrollLeft -= left - target.left;
    }
    this.update_overflow();
  }

  /**
   * Excel's list of sheets: every visible sheet, the active one marked;
   * choosing one activates it. It opens from the scroll arrows.
   */
  private open_sheet_list(anchor: HTMLButtonElement): void {
    this.sheet_list_dismiss?.();
    const list = document.createElement("div");
    list.className = "sheetwrite-tab-list";
    list.setAttribute("popover", "manual");
    list.setAttribute("role", "group");
    list.setAttribute("aria-label", `All ${this.label.toLowerCase()}`);
    // WebKit does not focus a pressed button; keep focus in the list.
    list.addEventListener("mousedown", (event) => event.preventDefault());
    const choices: HTMLButtonElement[] = [];
    for (const { sheet } of this.visible_sheets()) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.textContent = sheet.name;
      if (sheet.id === this.active_id) choice.setAttribute("aria-current", "true");
      choice.addEventListener("click", () => {
        close(false);
        this.focused_id = sheet.id;
        this.feedback = null;
        this.on_activate(sheet.id);
        this.button_for(sheet.id)?.focus();
      });
      choices.push(choice);
    }
    // The choices scroll inside the list's frame, so the frame keeps its
    // border and shadow while a fade at a cut edge shows there is more.
    const items = document.createElement("div");
    items.className = "sheetwrite-tab-list-items";
    items.append(...choices);
    list.append(items);
    const mark_cut_edges = (): void => {
      const {
        scrollTop: scroll_top,
        scrollHeight: scroll_height,
        clientHeight: client_height,
      } = items;
      items.toggleAttribute("data-more-above", scroll_top > 1);
      items.toggleAttribute("data-more-below", scroll_top + client_height < scroll_height - 1);
    };
    items.addEventListener("scroll", mark_cut_edges, { passive: true });

    const on_outside_pointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !list.contains(event.target) && event.target !== anchor) {
        close(list.contains(document.activeElement));
      }
    };
    // Removing the list blurs its focused choice, whose focusout closes again.
    let closed = false;
    const close = (restore_focus: boolean): void => {
      if (closed) return;
      closed = true;
      document.removeEventListener("pointerdown", on_outside_pointer, true);
      if (typeof list.hidePopover === "function") {
        try {
          list.hidePopover();
        } catch {
          // `hidePopover` throws when the list is not open as a popover: nothing to hide.
        }
      }
      list.remove();
      anchor.setAttribute("aria-expanded", "false");
      if (this.sheet_list_dismiss === dismiss) this.sheet_list_dismiss = null;
      if (restore_focus && anchor.isConnected) anchor.focus();
    };
    const dismiss = (): void => close(false);
    this.sheet_list_dismiss = dismiss;

    list.addEventListener("keydown", (event) => {
      const current = choices.indexOf(document.activeElement as HTMLButtonElement);
      let target: number | null = null;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key === "ArrowDown") target = Math.min(choices.length - 1, current + 1);
      else if (event.key === "ArrowUp") target = Math.max(0, current - 1);
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = choices.length - 1;
      if (target === null) return;
      event.preventDefault();
      event.stopPropagation();
      choices[target]?.focus();
    });
    list.addEventListener("focusout", (event) => {
      if (event.relatedTarget instanceof Node && list.contains(event.relatedTarget)) return;
      close(false);
    });

    this.host.appendChild(list);
    if (typeof list.showPopover === "function") {
      list.showPopover();
      // Up to SHEET_LIST_ROWS sheets show before the list scrolls, and no
      // more than the larger side of the anchor holds.
      const anchor_rect = anchor.getBoundingClientRect();
      const viewport_width = document.documentElement.clientWidth;
      const viewport_height = document.documentElement.clientHeight;
      const room =
        Math.max(anchor_rect.top, viewport_height - anchor_rect.bottom) -
        CHOICES_PLACEMENT.gap -
        2 * SHEET_LIST_MARGIN;
      const row = choices[0]?.offsetHeight ?? 0;
      const chrome = list.offsetHeight - items.offsetHeight;
      const padding = items.scrollHeight - row * choices.length;
      const rows = padding + row * SHEET_LIST_ROWS;
      items.style.maxHeight = `${Math.max(row, Math.min(rows, room - chrome))}px`;
      const { left, top } = popupPosition(
        anchor_rect,
        list.getBoundingClientRect(),
        CHOICES_PLACEMENT,
      );
      // Inside the page's visible width, which leaves out a scrollbar.
      const width = list.offsetWidth;
      list.style.left = `${Math.max(SHEET_LIST_MARGIN, Math.min(left, viewport_width - width - SHEET_LIST_MARGIN))}px`;
      list.style.top = `${top}px`;
    }
    mark_cut_edges();
    anchor.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", on_outside_pointer, true);
    (choices.find((choice) => choice.hasAttribute("aria-current")) ?? choices[0])?.focus();
  }

  private readonly on_keydown = (event: KeyboardEvent): void => {
    if (this.destroyed || !this.host.contains(document.activeElement)) return;
    const active = document.activeElement;
    if (this.menu_sheet_id) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu(true);
        return;
      }

      if (active instanceof HTMLButtonElement && active.getAttribute("role") === "menuitem") {
        const items = [
          ...this.host.querySelectorAll<HTMLButtonElement>(
            `${TAB_MENU_SELECTOR} [role="menuitem"]`,
          ),
        ];
        const current = items.indexOf(active);
        let next: number | null = null;
        if (event.key === "ArrowDown") next = current + 1;
        else if (event.key === "ArrowUp") next = current - 1;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        if (next !== null) {
          event.preventDefault();
          event.stopPropagation();
          this.focus_menu_item(next);
          return;
        }
      }
    }

    const on_add = this.on_add;
    if (!this.read_only && event.shiftKey && event.key === "F11" && on_add) {
      event.preventDefault();
      this.performLifecycle(this.active_id, () => on_add(this.active_index()));
      return;
    }

    if (
      !this.read_only &&
      event.shiftKey &&
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "u" &&
      this.on_unhide
    ) {
      const on_unhide = this.on_unhide;
      const hidden = this.hidden_sheets();
      const only_hidden = hidden.length === 1 ? hidden[0] : undefined;
      if (only_hidden) {
        event.preventDefault();
        this.performLifecycle(only_hidden.id, () => on_unhide(only_hidden.id));
      } else if (hidden.length > 1) {
        event.preventDefault();
        this.host.querySelector<HTMLElement>(".sheetwrite-tab-unhide > button")?.focus();
      }

      return;
    }

    if (!(active instanceof HTMLButtonElement) || active.getAttribute("role") !== "tab") return;
    const current = this.buttons.indexOf(active);
    if (current < 0) return;
    const id = this.button_ids[current]!;

    if (!this.read_only) {
      if (event.key === "F2" && this.on_rename) {
        event.preventDefault();
        this.start_rename(id);
        return;
      }

      const on_remove = this.on_remove;
      if (event.key === "Delete" && on_remove && this.buttons.length > 1) {
        event.preventDefault();
        this.performLifecycle(id, () => on_remove(id));
        return;
      }

      if (
        event.shiftKey &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "h" &&
        this.on_hide
      ) {
        event.preventDefault();
        this.performLifecycle(id, () => this.on_hide!(id));
        return;
      }

      if (event.shiftKey && (event.ctrlKey || event.metaKey) && this.on_move) {
        const target_visible_index =
          event.key === "ArrowLeft"
            ? Math.max(0, current - 1)
            : event.key === "ArrowRight"
              ? Math.min(this.buttons.length - 1, current + 1)
              : null;
        const to =
          target_visible_index === null ? null : (this.move_indexes[target_visible_index] ?? null);
        if (to !== null && to !== this.move_indexes[current]) {
          event.preventDefault();
          this.performLifecycle(id, () => this.on_move!(id, to));
          return;
        }
      }
    }

    let next: number;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(this.buttons.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = this.buttons.length - 1;
    else return;

    event.preventDefault();
    const target = this.buttons[next];
    if (!target || target === active) return;
    this.focused_id = this.button_ids[next]!;
    this.set_roving_focus(target);
    target.focus({ preventScroll: true });
    this.scroll_into_view(target);
  };
}
