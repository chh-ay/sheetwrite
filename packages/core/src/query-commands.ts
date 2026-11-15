// The seam between a grid's Data commands and an optional query session.
// Core never loads the query engine: the queries add-on registers these
// callbacks through its grid context and removes them on dispose. Only the
// lazy ribbon, toolbar and panel chunks read them.

import type { Grid } from "./types/grid.js";
import type { QueryCommands } from "./types/query.js";

interface QueryCommandState {
  commands: QueryCommands | undefined;
  /** The running refresh; one at a time per grid, so a second request cancels it. */
  running: AbortController | undefined;
  readonly listeners: Set<() => void>;
}

const STATES = new WeakMap<Grid, QueryCommandState>();

function stateOf(grid: Grid): QueryCommandState {
  let state = STATES.get(grid);
  if (state === undefined) {
    state = { commands: undefined, running: undefined, listeners: new Set() };
    STATES.set(grid, state);
  }
  return state;
}

function notify(state: QueryCommandState): void {
  for (const listener of state.listeners) listener();
}

/**
 * Shows the grid's Get Data, Refresh All and Queries & Connections commands
 * and connects them to `commands`. Returns the function that removes them.
 * The add-on grid context calls this for the queries add-on.
 */
export function registerQueryCommands(grid: Grid, commands: QueryCommands): () => void {
  const state = stateOf(grid);
  state.commands = commands;
  notify(state);

  return () => {
    if (state.commands !== commands) return;
    state.running?.abort();
    state.running = undefined;
    state.commands = undefined;
    notify(state);
  };
}

export function queryCommandsOf(grid: Grid): QueryCommands | undefined {
  return STATES.get(grid)?.commands;
}

export function queryRefreshRunning(grid: Grid): boolean {
  return STATES.get(grid)?.running !== undefined;
}

/** Called when a session registers or leaves, and when a refresh starts or ends. */
export function onQueryCommandsChange(grid: Grid, listener: () => void): () => void {
  const state = stateOf(grid);
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/** Why a refresh did not run or wrote nothing; null when it wrote its outputs. */
export type QueryRefreshOutcome = string | null;

const NO_SESSION = "Queries are not connected in this grid.";
const CANCELLED = "The refresh was cancelled; nothing was written.";

/**
 * Starts a refresh, or cancels the running one: Excel's Refresh All turns into
 * Cancel Refresh while it runs, and one button keeps that on every surface.
 */
export async function toggleQueryRefresh(
  grid: Grid,
  ids: readonly string[] | null,
): Promise<QueryRefreshOutcome> {
  const state = stateOf(grid);
  if (state.running !== undefined) {
    state.running.abort();
    // The running call reports the cancellation, so this one stays silent.
    return null;
  }

  const commands = state.commands;
  if (commands === undefined) return NO_SESSION;

  const running = new AbortController();
  state.running = running;
  notify(state);
  try {
    const outcome = await commands.refresh(ids, running.signal);
    return running.signal.aborted ? CANCELLED : outcome;
  } finally {
    if (state.running === running) state.running = undefined;
    notify(state);
  }
}
