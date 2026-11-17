import type { CellScalar } from "./types/cell.js";

/** `text` with the characters that mean something in a regular expression escaped. */
function escapeRegExp(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
}

/**
 * Excel's AutoComplete for one cell edit: the distinct text entries around the
 * edited cell, completed by prefix, ignoring letter case. `read` runs on the
 * first lookup only, so an edit that never types text reads nothing. Each
 * lookup tests only the entries the previous, shorter prefix matched, so
 * typing on narrows the scan.
 * https://support.microsoft.com/en-us/office/turn-automatic-completion-of-cell-entries-on-or-off-0f4aa749-b927-4ff3-a8e0-28d6e2e4d4b4
 */
export class ColumnCompletions {
  private readonly read: () => readonly CellScalar[];
  private entries: string[] | null = null;
  /** The entries the last prefix matched, and that prefix in lower case. */
  private matched: string[] | null = null;
  private matchedPrefix = "";

  constructor(read: () => readonly CellScalar[]) {
    this.read = read;
  }

  /**
   * The one entry that `typed` begins and that is longer than it, or null
   * when no entry or more than one does. Entries that differ only in letter
   * case count as one, the first seen. Numbers, dates and other non-text
   * values are never entries, as in Excel.
   */
  complete(typed: string): string | null {
    if (typed === "") return null;
    const prefix = typed.toLowerCase();
    const pool =
      this.matched !== null && prefix.startsWith(this.matchedPrefix) ? this.matched : this.load();
    const begins = new RegExp(`^${escapeRegExp(typed)}`, "iu");
    const matched = pool.filter((entry) => begins.test(entry));
    this.matched = matched;
    this.matchedPrefix = prefix;

    const first = matched[0];
    if (first === undefined) return null;
    const key = first.toLowerCase();
    for (let index = 1; index < matched.length; index++) {
      if (matched[index]!.toLowerCase() !== key) return null;
    }
    return key.length > prefix.length ? first : null;
  }

  private load(): string[] {
    if (this.entries !== null) return this.entries;
    const entries: string[] = [];
    for (const value of this.read()) {
      if (typeof value === "string" && value !== "") entries.push(value);
    }
    this.entries = entries;
    return entries;
  }
}
