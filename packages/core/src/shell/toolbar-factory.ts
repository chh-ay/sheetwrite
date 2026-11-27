// Public wrapper over the same command toolbar the grid mounts with
// `config.toolbar`, so custom chrome and the stock toolbar cannot drift.

import { CommandToolbar } from "../ribbon/command-toolbar.js";
import type { CommandFlags, Grid, IconOverrides, ToolbarItem } from "../types/grid.js";
import type { ShellPiece } from "./formula-controls.js";

/** Options for {@link createToolbar}. */
export interface ToolbarOptions {
  /** Items to render; defaults to every command `flags` shows, in ribbon order. */
  items?: readonly ToolbarItem[];
  /** `GridConfig` switches that choose the default commands (default: all, with Export). */
  flags?: CommandFlags;
  /** Per-glyph icon overrides, exactly like `GridConfig.icons`. */
  icons?: IconOverrides;
  /** Accessible toolbar label (default "Spreadsheet formatting"). */
  label?: string;
  /** Return keyboard focus to the grid after a pick or Escape (default: focus `host`). */
  focusGrid?: () => void;
}

/**
 * Mount a toolbar bound to `grid.actions` (custom items receive the grid). It
 * shows the ribbon's commands on one row, with the same glyphs, state and
 * keyboard; commands that do not fit move into a "More commands" popup. Mouse
 * clicks never steal grid focus; Left/Right/Home/End move between controls and
 * Escape returns focus to the grid. Returns the piece with an idempotent `destroy`.
 *
 * @param host - Element the toolbar is appended to.
 * @param grid - The grid whose commands the toolbar runs.
 * @param options - The items, which commands show, icon overrides, the
 *   accessible label, and how to return focus to the grid.
 */
export function createToolbar(
  host: HTMLElement,
  grid: Grid,
  options: ToolbarOptions = {},
): ShellPiece {
  const toolbar = new CommandToolbar(host, grid, {
    label: options.label ?? "Spreadsheet formatting",
    className: "sheetwrite-shell-toolbar",
    flags: options.flags ?? { export: true },
    ...(options.items === undefined ? {} : { items: options.items }),
    ...(options.icons === undefined ? {} : { icons: options.icons }),
    ...(options.focusGrid === undefined ? {} : { focusGrid: options.focusGrid }),
  });
  return { element: toolbar.element, destroy: () => toolbar.destroy() };
}
