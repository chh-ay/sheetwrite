import {
  initSheetwrite,
  type Grid,
  type GridOptions,
  type InitSheetwriteOptions,
} from "@sheetwrite/core";
import { createSpreadsheetShell } from "@sheetwrite/core/shell";

import { initFullEngine, whenStylesReady } from "../../lib/full-engine.js";
import { observeSiteTheme } from "../../lib/site-theme.js";
import { siteGridTheme } from "../site-grid-theme.js";

/** A spreadsheet shell with the site's theme, as the feature showcases mount it. */
export interface ShowcaseShell {
  readonly grid: Grid;
  readonly element: HTMLElement;
  dispose(): void;
}

/**
 * Select the full engine and install `addons`, then mount the spreadsheet
 * shell (ribbon, name box, formula bar, sheet tabs) in `host` with the site's
 * colours, following the site theme. Resolves `null` when the page reloads to
 * select the engine or `signal` aborted first; create nothing then.
 */
export async function mountShowcaseShell(
  host: HTMLElement,
  grid: Omit<GridOptions, "theme">,
  signal: AbortSignal,
  addons: NonNullable<InitSheetwriteOptions["addons"]> = [],
): Promise<ShowcaseShell | null> {
  if (!(await initFullEngine())) return null;
  // Add-ons install after the engine: installing first would select the default one.
  if (addons.length > 0) await initSheetwrite({ addons });
  await whenStylesReady();
  if (signal.aborted) return null;

  const shell = createSpreadsheetShell(host, {
    ribbon: { mode: "auto" },
    grid: { ...grid, theme: siteGridTheme() },
  });
  const stopTheme = observeSiteTheme(() => shell.setTheme(siteGridTheme()));

  return {
    grid: shell.grid,
    element: shell.element,
    dispose() {
      stopTheme();
      shell.destroy();
    },
  };
}

/** Throws with the transaction's first issue, so a broken setup shows on the page. */
export function requireApplied(
  result: { status: string; issues?: ReadonlyArray<{ message: string }> },
  what: string,
): void {
  if (result.status === "applied") return;

  throw new Error(`${what} failed: ${result.issues?.[0]?.message ?? result.status}`);
}

/**
 * Press a ribbon command as a reader would: select its tab, then click the
 * button with its `data-command`. Panels that only the ribbon opens, such as
 * Queries & Connections or Relationships, open this way.
 */
export function pressRibbonCommand(shell: HTMLElement, tabLabel: string, command: string): void {
  const tab = Array.from(shell.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (candidate) => candidate.textContent === tabLabel,
  );
  if (!tab) throw new Error(`The ribbon has no ${tabLabel} tab`);
  tab.click();
  const button = shell.querySelector<HTMLElement>(`[data-command="${command}"]`);
  if (!button) throw new Error(`The ${tabLabel} tab has no ${command} command`);
  button.click();
}

/** The listeners of a scenario's snapshot. */
export function createListeners() {
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify(): void {
      for (const listener of listeners) listener();
    },
  };
}
