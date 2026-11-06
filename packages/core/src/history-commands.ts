// The seam between a grid's Version History and Save Version commands and
// the history add-on. Core never loads history code: the add-on sets the
// command of each grid it applies to, and the panel loads when it runs.

import type { Grid } from "./types/grid.js";

/** Opens the history panel of one grid, or its Save Version form. */
type HistoryCommand = (action: "open" | "save") => void;

const COMMANDS = new WeakMap<Grid, HistoryCommand>();

/** Shows the history commands of `grid` and connects them; the returned function removes them. */
export function setHistoryCommand(grid: Grid, command: HistoryCommand): () => void {
  COMMANDS.set(grid, command);
  return () => {
    if (COMMANDS.get(grid) === command) COMMANDS.delete(grid);
  };
}

/** The history command of `grid`, if the history add-on applies to it. */
export function historyCommandOf(grid: Grid): HistoryCommand | undefined {
  return COMMANDS.get(grid);
}
