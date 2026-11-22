// Composes the leaf pieces (toolbar, name box, formula bar, tabs, status)
// around exactly one grid, Google-Sheets style. The shell suppresses only the
// grid's duplicate built-in toolbar/tabs; find, context menu, and keyboard
// policy stay under the caller's `GridConfig` control, and the grid host
// remains the single spreadsheet keyboard/focus authority.

import { focusInto } from "../focus-exit.js";
import { createGridController, type GridController } from "../grid-controller.js";
import { DEFAULT_THEME } from "../grid.js";
import { assertRibbonConfig, ribbonHeight, TOOLBAR_HEIGHT } from "../ribbon/ribbon-metrics.js";
import { Scope } from "../scope.js";
import { insertSheet } from "../sheet-commands.js";
import { changesSheetTabs, SheetTabs } from "../sheet-tabs.js";
import type { Selection, SheetId } from "../types/coordinates.js";
import type {
  CommandFlags,
  Grid,
  GridConfig,
  GridOptions,
  IconOverrides,
  RibbonConfig,
  ToolbarItem,
} from "../types/grid.js";
import type { Theme } from "../types/render.js";
import type { ChangeEvent } from "../types/transaction.js";
import { seedWidgetTheme } from "../widget-theme.js";
import { createFormulaBar, createNameBox, type ShellPiece } from "./formula-controls.js";
import { createSelectionStatus } from "./selection-status.js";

interface ShellChromeOptions {
  readonly focusGrid: () => void;
  readonly items: readonly ToolbarItem[] | undefined;
  readonly flags: CommandFlags;
  readonly icons: IconOverrides | undefined;
}

/**
 * Mount chrome from its own chunk, so a shell downloads the command model only
 * when it shows chrome, and never at module load. The row keeps the chrome's
 * height meanwhile, so the grid does not move when it arrives. A chunk that
 * arrives after destroy is dropped. If the chunk fails, `fallback` (when
 * given) takes its place and the error is still reported.
 */
function mount_when_loaded(
  host: HTMLElement,
  reserved_height: number,
  load: () => Promise<() => ShellPiece>,
  fallback?: () => ShellPiece,
): ShellPiece {
  const lifetime = new Scope();
  host.style.minHeight = `${reserved_height}px`;

  void load().then(
    (mount) => {
      if (lifetime.closed) return;

      host.style.minHeight = "";
      const piece = mount();
      lifetime.add(() => piece.destroy());
    },
    (error: unknown) => {
      if (lifetime.closed) return;

      host.style.minHeight = "";
      if (fallback !== undefined) {
        const piece = fallback();
        lifetime.add(() => piece.destroy());
      }
      throw error;
    },
  );

  return {
    element: host,
    destroy: () => lifetime.close(),
  };
}

function mount_toolbar(host: HTMLElement, grid: Grid, chrome: ShellChromeOptions): ShellPiece {
  return mount_when_loaded(host, TOOLBAR_HEIGHT, async () => {
    const { createToolbar: create_toolbar } = await import("./toolbar-factory.js");
    return () =>
      create_toolbar(host, grid, {
        focusGrid: chrome.focusGrid,
        flags: chrome.flags,
        ...(chrome.items === undefined ? {} : { items: chrome.items }),
        ...(chrome.icons === undefined ? {} : { icons: chrome.icons }),
      });
  });
}

/** The ribbon renders the same commands as the toolbar, which replaces it if its chunk fails. */
function mount_ribbon(
  host: HTMLElement,
  grid: Grid,
  chrome: ShellChromeOptions,
  layout: RibbonConfig,
): ShellPiece {
  return mount_when_loaded(
    host,
    // The ribbon spans its row, so the row's width decides its layout now.
    ribbonHeight(layout, host.clientWidth),
    async () => {
      const { createRibbon: create_ribbon } = await import("./ribbon-factory.js");
      return () =>
        create_ribbon(host, grid, {
          focusGrid: chrome.focusGrid,
          flags: chrome.flags,
          ...layout,
          ...(chrome.icons === undefined ? {} : { icons: chrome.icons }),
        });
    },
    () => mount_toolbar(host, grid, chrome),
  );
}

/** Host elements and feature options used to create a spreadsheet shell. */
export interface SpreadsheetShellOptions {
  /** Options for the single grid the shell owns. `initSheetwrite` must already be awaited. */
  grid: GridOptions;
  /** Toolbar items (default: every command the grid config's flags show, with Export). */
  toolbar?: readonly ToolbarItem[];
  /** Use an Excel-style ribbon instead of the toolbar; an object sets its layout. */
  ribbon?: boolean | RibbonConfig;
  /** Event callbacks forwarded from the owned grid. */
  onChange?: (event: ChangeEvent) => void;
  /** Called when the grid's selection changes; `null` when nothing is selected. */
  onSelectionChange?: (selection: Selection | null) => void;
  /** Called once with the grid, after the shell has mounted it. */
  onReady?: (grid: Grid) => void;
}

/** Disposable controller for the framework-neutral spreadsheet shell. */
export interface SpreadsheetShell {
  /** The single grid the shell owns; use it for data, search, and actions. */
  readonly grid: Grid;
  /** The shell's root element (already appended to the mount host). */
  readonly element: HTMLElement;
  /** Merge `theme` over the grid's theme; the shell's own chrome follows it. */
  setTheme(theme: Partial<Theme>): void;
  /** Turn editing off or on for the grid and the shell's toolbar. */
  setReadOnly(readOnly: boolean): void;
  /** Reconfigure the grid; the shell keeps its own toolbar/tabs suppressed. */
  setGridConfig(config: GridConfig | undefined): void;
  /** Show the sheet with this stable ID. */
  setActiveSheet(id: SheetId): void;
  /** Remove the shell, its grid and all its DOM; calling it twice is safe. */
  destroy(): void;
}

/** Force the duplicate built-in chrome off while preserving everything else. */
function shell_grid_config(config: GridConfig | undefined): GridConfig {
  return { ...(config ?? {}), toolbar: false, tabs: false };
}

/**
 * Mount a complete spreadsheet shell into `host`: toolbar row, formula row
 * (name box + formula bar), the grid, and a bottom row with sheet tabs and a
 * selection status. The host must have a real size; the shell fills it. Returns
 * the shell handle; `destroy` tears down every piece, the grid, and the shell
 * DOM, and is safe to call twice.
 *
 * @param host - Element the shell is appended to and fills; give it a size.
 * @param options - Options for the grid the shell creates, the toolbar or
 *   ribbon, and event callbacks.
 */
export function createSpreadsheetShell(
  host: HTMLElement,
  options: SpreadsheetShellOptions,
): SpreadsheetShell {
  assertRibbonConfig(options.ribbon);

  const root = document.createElement("div");
  root.className = "sheetwrite-shell";

  const toolbar_row = document.createElement("div");
  toolbar_row.className = "sheetwrite-shell-row sheetwrite-shell-toolbar-row";

  const formula_row = document.createElement("div");
  formula_row.className = "sheetwrite-shell-row sheetwrite-shell-formula-row";

  const fx = document.createElement("span");
  fx.className = "sheetwrite-shell-fx";
  fx.textContent = "fx";
  fx.setAttribute("aria-hidden", "true");

  const grid_host = document.createElement("div");
  grid_host.className = "sheetwrite-shell-grid";
  grid_host.setAttribute("aria-label", "Spreadsheet grid");

  const bottom_row = document.createElement("div");
  bottom_row.className = "sheetwrite-shell-row sheetwrite-shell-bottom-row";

  root.append(toolbar_row, formula_row, grid_host, bottom_row);
  host.appendChild(root);
  // Disposers run in reverse: grid listeners, then the pieces, the grid, and the root last.
  const lifetime = new Scope();
  lifetime.add(() => root.remove());

  // Seed the widget CSS custom properties on the shell root so chrome outside
  // the grid host (toolbar/formula/bottom rows) themes identically.
  let base_theme: Theme = { ...DEFAULT_THEME, ...options.grid.theme };
  seedWidgetTheme(root, base_theme);

  let controller: GridController;
  try {
    controller = createGridController(
      grid_host,
      { ...options.grid, config: shell_grid_config(options.grid.config) },
      {
        onGridChange: (event) => options.onChange?.(event),
        onSelectionChange: (selection) => options.onSelectionChange?.(selection),
      },
    );
  } catch (error) {
    lifetime.close();
    throw error;
  }
  lifetime.add(() => controller.destroy());
  const grid = controller.grid;
  try {
    options.onReady?.(grid);
  } catch (error) {
    lifetime.close();
    throw error;
  }

  // The shell's own chrome honours the grid's glyph overrides and command
  // flags, like the grid's built-in chrome. The shell toolbar shows Export
  // unless the config turns it off.
  const grid_config = options.grid.config ?? {};
  const chrome: ShellChromeOptions = {
    focusGrid: () => grid_host.focus(),
    items: options.toolbar,
    flags: { export: true, ...grid_config },
    icons: grid_config.icons,
  };
  const focus_grid = chrome.focusGrid;

  const toolbar = options.ribbon
    ? mount_ribbon(
        toolbar_row,
        grid,
        { ...chrome, flags: grid_config },
        typeof options.ribbon === "object" ? options.ribbon : {},
      )
    : mount_toolbar(toolbar_row, grid, chrome);
  lifetime.add(() => toolbar.destroy());
  const name_box = createNameBox(formula_row, grid, { focusGrid: focus_grid });
  lifetime.add(() => name_box.destroy());
  formula_row.appendChild(fx);
  const formula_bar = createFormulaBar(formula_row, grid, { focusGrid: focus_grid });
  lifetime.add(() => formula_bar.destroy());
  let read_only = options.grid.readOnly ?? false;
  formula_bar.setReadOnly(read_only);

  let tabs_enabled = options.grid.config?.tabs !== false;
  let tab_host: HTMLDivElement | null = null;
  let tabs: SheetTabs | null = null;
  lifetime.add(() => tabs?.destroy());
  // The tab strip's own width sets its floor beside the status (shell.css):
  // half the row, or its own width if that is less. Measured once a frame at
  // most, after the tabs change or the strip is resized.
  let measure_frame = 0;
  const measure_tabs = (): void => {
    measure_frame = 0;
    tab_host?.style.setProperty("--sheetwrite-shell-tabs-width", `${tab_host.scrollWidth}px`);
  };
  const schedule_measure = (): void => {
    if (measure_frame === 0) measure_frame = requestAnimationFrame(measure_tabs);
  };
  lifetime.add(() => {
    if (measure_frame !== 0) cancelAnimationFrame(measure_frame);
  });
  const tabs_resized =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule_measure);
  lifetime.add(() => tabs_resized?.disconnect());
  const create_tabs = (): void => {
    if (!tabs_enabled || tabs) return;
    tab_host = document.createElement("div");
    tab_host.className = "sheetwrite-shell-tabs";
    bottom_row.prepend(tab_host);
    tabs_resized?.observe(tab_host);
    tabs = new SheetTabs(tab_host, {
      onActivate: (id) => grid.setActiveSheet(id),
      focusSheet: focus_grid,
      onAdd: (index) => insertSheet(grid, index),
      onRemove: (id) => grid.removeSheet(id),
      onRename: (id, name) => grid.renameSheet(id, name),
      onMove: (id, to_index) => grid.moveSheet(id, to_index),
      // The same chunk Grid loads for its own tab bar.
      onCommand: (command, id) =>
        void import("../sheet-tab-panels.js").then(({ openTabPanel: open_tab_panel }) => {
          if (tabs) open_tab_panel(grid, tabs, command, id);
        }),
      onHide: (id) => grid.setSheetVisibility(id, "hidden"),
      onUnhide: (id) => grid.setSheetVisibility(id, "visible"),
      icons: () => chrome.icons,
    });
    tabs.setReadOnly(read_only);
  };
  const refresh_tabs = (): void => {
    if (!tabs_enabled) {
      tabs?.destroy();
      tabs = null;
      tab_host?.remove();
      tab_host = null;
      return;
    }
    create_tabs();
    tabs?.update(grid.store.getWorkbook().sheets, grid.getActiveSheet());
    schedule_measure();
  };
  refresh_tabs();

  const status = createSelectionStatus(bottom_row, grid);
  lifetime.add(() => status.destroy());

  // F6 and Shift+F6 move between the shell's parts, as Excel's F6 moves
  // between the parts of its window: the ribbon or toolbar, the formula bar,
  // the sheet, the sheet tabs and the status bar. Tab moves between cells
  // inside the sheet, so F6 is also the sheet's way out. The status bar takes
  // the focus only this way.
  status.element.tabIndex = -1;
  const region_key = (event: KeyboardEvent): void => {
    if (event.key !== "F6" || event.ctrlKey || event.metaKey || event.altKey) return;
    // The cell editor, the find bar and the grid's dialogs keep their keys.
    const target = event.target;
    if (target instanceof Node && target !== grid_host && grid_host.contains(target)) return;
    const regions = [toolbar_row, formula_bar.element, grid_host, tab_host, status.element].filter(
      (region): region is HTMLElement => region !== null,
    );
    const at = regions.findIndex((region) => region.contains(document.activeElement));
    const step = event.shiftKey ? -1 : 1;
    const from = at === -1 ? regions.indexOf(grid_host) : at;
    for (let offset = 1; offset < regions.length; offset++) {
      const index = (((from + step * offset) % regions.length) + regions.length) % regions.length;
      const region = regions[index];
      if (region === undefined) continue;
      if (region === status.element) {
        region.focus();
        break;
      }
      if (focusInto(region)) break;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  root.addEventListener("keydown", region_key, true);
  lifetime.add(() => root.removeEventListener("keydown", region_key, true));
  lifetime.add(grid.on("active-sheet", () => refresh_tabs()));
  // A tab update closes an open tab menu; a collaborator's cell edit must not.
  lifetime.add(
    grid.on("change", (event) => {
      if (event.transaction.patches.some(changesSheetTabs)) refresh_tabs();
    }),
  );

  return {
    grid,
    element: root,

    setTheme(theme: Partial<Theme>) {
      base_theme = { ...base_theme, ...theme };
      seedWidgetTheme(root, base_theme);
      controller.setTheme(theme);
    },

    setReadOnly(next_read_only: boolean) {
      read_only = next_read_only;
      controller.setReadOnly(next_read_only);
      formula_bar.setReadOnly(next_read_only);
      tabs?.setReadOnly(next_read_only);
    },

    setGridConfig(config: GridConfig | undefined) {
      tabs_enabled = config?.tabs !== false;
      controller.setConfig(shell_grid_config(config));
      refresh_tabs();
    },

    setActiveSheet(id: SheetId) {
      grid.setActiveSheet(id);
    },

    destroy: () => lifetime.close(),
  };
}
