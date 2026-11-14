import type { Grid } from "./types/grid.js";

/**
 * The cell edit's draft, shared by the cell editor and the shell's formula
 * bar. Internal: the package entries do not export it.
 */
export interface EditDraftSink {
  /** The cell editor's text, when it opens and on every change the user makes in it. */
  text(value: string): void;
  /** The cell edit closed, committed or cancelled. */
  end(): void;
}

/** What the shell's formula bar uses to type the cell's draft. */
export interface EditDraftChannel {
  /** Hear the cell editor's draft; returns the unsubscribe. */
  subscribe(listener: EditDraftSink): () => void;
  /**
   * Show `text`, typed in the bar, in the cell editor with the bar's caret,
   * opening it without focus when no edit is open. False when the cell
   * cannot be edited as text.
   */
  setText(text: string, selectionStart: number, selectionEnd: number): boolean;
  /** Commit the open cell edit in place. */
  commit(): void;
  /** Cancel the open cell edit. */
  cancel(): void;
}

/** Channels by grid, so the shell built outside the grid finds its grid's draft. */
const channels = new WeakMap<Grid, EditDraftChannel>();

export function registerEditDraft(grid: Grid, channel: EditDraftChannel): void {
  channels.set(grid, channel);
}

/** The draft channel of a built-in grid; undefined for another `Grid` implementation. */
export function editDraftFor(grid: Grid): EditDraftChannel | undefined {
  return channels.get(grid);
}
