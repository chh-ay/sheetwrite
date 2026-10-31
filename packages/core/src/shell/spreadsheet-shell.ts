// Composes the leaf pieces (toolbar, name box, formula bar, tabs, status)
// around exactly one grid, Google-Sheets style. The shell suppresses only the
// grid's duplicate built-in toolbar/tabs; find, context menu, and keyboard
// policy stay under the caller's `GridConfig` control, and the grid host
// remains the single spreadsheet keyboard/focus authority.

import { createGridController, type GridController } from "../grid-controller.js";
import { DEFAULT_THEME } from "../grid.js";
import {
  assertRibbonConfig,
  RIBBON_EXPANDED_HEIGHT,
  TOOLBAR_HEIGHT,
} from "../ribbon/ribbon-metrics.js";
import { sheetNameKey } from "../sheet-name.js";
import { SheetTabs } from "../sheet-tabs.js";
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
function mountWhenLoaded(
  host: HTMLElement,
  reservedHeight: number,
  load: () => Promise<() => ShellPiece>,
  fallback?: () => ShellPiece,
): ShellPiece {
  let piece: ShellPiece | null = null;
  let destroyed = false;
  host.style.minHeight = `${reservedHeight}px`;

  void load().then(
    (mount) => {
      if (destroyed) return;

      host.style.minHeight = "";
      piece = mount();
    },
    (error: unknown) => {
      if (destroyed) return;

      host.style.minHeight = "";
      if (fallback !== undefined) piece = fallback();
      throw error;
    },
  );

  return {
    element: host,
    destroy() {
      destroyed = true;
      piece?.destroy();
    },
  };
}

function mountToolbar(host: HTMLElement, grid: Grid, chrome: ShellChromeOptions): ShellPiece {
  return mountWhenLoaded(host, TOOLBAR_HEIGHT, async () => {
    const { createToolbar } = await import("./toolbar-factory.js");
    return () =>
      createToolbar(host, grid, {
        focusGrid: chrome.focusGrid,
        flags: chrome.flags,
        ...(chrome.items === undefined ? {} : { items: chrome.items }),
        ...(chrome.icons === undefined ? {} : { icons: chrome.icons }),
      });
  });
}

/** The ribbon renders the same commands as the toolbar, which replaces it if its chunk fails. */
function mountRibbon(
  host: HTMLElement,
  grid: Grid,
  chrome: ShellChromeOptions,
  layout: RibbonConfig,
): ShellPiece {
  return mountWhenLoaded(
    host,
    RIBBON_EXPANDED_HEIGHT,
    async () => {
      const { createRibbon } = await import("./ribbon-factory.js");
      return () =>
        createRibbon(host, grid, {
          focusGrid: chrome.focusGrid,
          flags: chrome.flags,
          ...layout,
          ...(chrome.icons === undefined ? {} : { icons: chrome.icons }),
        });
    },
    () => mountToolbar(host, grid, chrome),
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
  onSelectionChange?: (selection: Selection | null) => void;
  onReady?: (grid: Grid) => void;
}

/** Disposable controller for the framework-neutral spreadsheet shell. */
export interface SpreadsheetShell {
  /** The single grid the shell owns; use it for data, search, and actions. */
  readonly grid: Grid;
  /** The shell's root element (already appended to the mount host). */
  readonly element: HTMLElement;
  setTheme(theme: Partial<Theme>): void;
  setReadOnly(readOnly: boolean): void;
  /** Reconfigure the grid; the shell keeps its own toolbar/tabs suppressed. */
  setGridConfig(config: GridConfig | undefined): void;
  setActiveSheet(id: SheetId): void;
  destroy(): void;
}

/** Force the duplicate built-in chrome off while preserving everything else. */
function shellGridConfig(config: GridConfig | undefined): GridConfig {
  return { ...(config ?? {}), toolbar: false, tabs: false };
}

/**
 * Mount a complete spreadsheet shell into `host`: toolbar row, formula row
 * (name box + formula bar), the grid, and a bottom row with sheet tabs and a
 * selection status. The host must have a real size; the shell fills it. Returns
 * the shell handle; `destroy` tears down every piece, the grid, and the shell
 * DOM, and is safe to call twice.
 */
export function createSpreadsheetShell(
  host: HTMLElement,
  options: SpreadsheetShellOptions,
): SpreadsheetShell {
  assertRibbonConfig(options.ribbon);

  const root = document.createElement("div");
  root.className = "sheetwrite-shell";

  const toolbarRow = document.createElement("div");
  toolbarRow.className = "sheetwrite-shell-row sheetwrite-shell-toolbar-row";

  const formulaRow = document.createElement("div");
  formulaRow.className = "sheetwrite-shell-row sheetwrite-shell-formula-row";

  const fx = document.createElement("span");
  fx.className = "sheetwrite-shell-fx";
  fx.textContent = "fx";
  fx.setAttribute("aria-hidden", "true");

  const gridHost = document.createElement("div");
  gridHost.className = "sheetwrite-shell-grid";
  gridHost.setAttribute("aria-label", "Spreadsheet grid");

  const bottomRow = document.createElement("div");
  bottomRow.className = "sheetwrite-shell-row sheetwrite-shell-bottom-row";

  root.append(toolbarRow, formulaRow, gridHost, bottomRow);
  host.appendChild(root);

  // Seed the widget CSS custom properties on the shell root so chrome outside
  // the grid host (toolbar/formula/bottom rows) themes identically.
  let baseTheme: Theme = { ...DEFAULT_THEME, ...options.grid.theme };
  seedWidgetTheme(root, baseTheme);

  let controller: GridController;
  try {
    controller = createGridController(
      gridHost,
      { ...options.grid, config: shellGridConfig(options.grid.config) },
      {
        onGridChange: (event) => options.onChange?.(event),
        onSelectionChange: (selection) => options.onSelectionChange?.(selection),
      },
    );
  } catch (error) {
    root.remove();
    throw error;
  }
  const grid = controller.grid;
  try {
    options.onReady?.(grid);
  } catch (error) {
    controller.destroy();
    root.remove();
    throw error;
  }

  // The shell's own chrome honours the grid's glyph overrides and command
  // flags, like the grid's built-in chrome. The shell toolbar shows Export
  // unless the config turns it off.
  const gridConfig = options.grid.config ?? {};
  const chrome: ShellChromeOptions = {
    focusGrid: () => gridHost.focus(),
    items: options.toolbar,
    flags: { export: true, ...gridConfig },
    icons: gridConfig.icons,
  };
  const focusGrid = chrome.focusGrid;

  const pieces: ShellPiece[] = [];
  pieces.push(
    options.ribbon
      ? mountRibbon(
          toolbarRow,
          grid,
          { ...chrome, flags: gridConfig },
          typeof options.ribbon === "object" ? options.ribbon : {},
        )
      : mountToolbar(toolbarRow, grid, chrome),
  );
  pieces.push(createNameBox(formulaRow, grid, { focusGrid }));
  formulaRow.appendChild(fx);
  const formulaBar = createFormulaBar(formulaRow, grid, { focusGrid });
  pieces.push(formulaBar);
  let readOnly = options.grid.readOnly ?? false;
  formulaBar.setReadOnly(readOnly);

  let tabsEnabled = options.grid.config?.tabs !== false;
  let tabHost: HTMLDivElement | null = null;
  let tabs: SheetTabs | null = null;
  const nextSheetName = (): string => {
    const names = new Set(grid.store.getWorkbook().sheets.map((sheet) => sheetNameKey(sheet.name)));
    let suffix = grid.store.getWorkbook().sheets.length + 1;
    while (names.has(sheetNameKey(`Sheet ${suffix}`))) suffix++;
    return `Sheet ${suffix}`;
  };
  const createTabs = (): void => {
    if (!tabsEnabled || tabs) return;
    tabHost = document.createElement("div");
    tabHost.className = "sheetwrite-shell-tabs";
    bottomRow.prepend(tabHost);
    tabs = new SheetTabs(tabHost, {
      onActivate: (id) => grid.setActiveSheet(id),
      onAdd: () => {
        const result = grid.addSheet({ name: nextSheetName() });
        if (result.status === "applied") grid.setActiveSheet(result.sheet);
        return result;
      },
      onRemove: (id) => grid.removeSheet(id),
      onRename: (id, name) => grid.renameSheet(id, name),
      onMove: (id, toIndex) => grid.moveSheet(id, toIndex),
      onHide: (id) => grid.setSheetVisibility(id, "hidden"),
      onUnhide: (id) => grid.setSheetVisibility(id, "visible"),
    });
    tabs.setReadOnly(readOnly);
  };
  const refreshTabs = (): void => {
    if (!tabsEnabled) {
      tabs?.destroy();
      tabs = null;
      tabHost?.remove();
      tabHost = null;
      return;
    }
    createTabs();
    tabs?.update(grid.store.getWorkbook().sheets, grid.getActiveSheet());
  };
  refreshTabs();

  const unsubscribes: Array<() => void> = [
    grid.on("active-sheet", () => refreshTabs()),
    grid.on("change", () => refreshTabs()),
  ];
  pieces.push(createSelectionStatus(bottomRow, grid));

  let destroyed = false;
  return {
    grid,
    element: root,

    setTheme(theme: Partial<Theme>) {
      baseTheme = { ...baseTheme, ...theme };
      seedWidgetTheme(root, baseTheme);
      controller.setTheme(theme);
    },

    setReadOnly(nextReadOnly: boolean) {
      readOnly = nextReadOnly;
      controller.setReadOnly(nextReadOnly);
      formulaBar.setReadOnly(nextReadOnly);
      tabs?.setReadOnly(nextReadOnly);
    },

    setGridConfig(config: GridConfig | undefined) {
      tabsEnabled = config?.tabs !== false;
      controller.setConfig(shellGridConfig(config));
      refreshTabs();
    },

    setActiveSheet(id: SheetId) {
      grid.setActiveSheet(id);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      for (const piece of pieces) piece.destroy();
      tabs?.destroy();
      controller.destroy();
      root.remove();
    },
  };
}
