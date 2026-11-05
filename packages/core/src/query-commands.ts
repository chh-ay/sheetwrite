// The seam between a grid's Data commands and an optional query session
// (#227). Core never loads the query engine: `@sheetwrite/queries` registers
// these callbacks when a session is created and removes them on dispose. Only
// the lazy ribbon, toolbar and panel chunks read them.

import type { Grid } from "./types/grid.js";
import type { SavedQuery } from "./types/query.js";

/** What the Data commands need from a query session. Messages are for the user. */
export interface QueryCommands {
  /** Checks the plan in the engine, then saves it; returns why it was not saved, or null. */
  define(query: SavedQuery): string | null;
  /**
   * Refreshes the given queries, or every query with an output table when
   * `ids` is null. Resolves to why nothing was written, or null when it was.
   */
  refresh(ids: readonly string[] | null, signal: AbortSignal): Promise<string | null>;
}

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
 * `@sheetwrite/queries` calls this from `createQuerySession`.
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
