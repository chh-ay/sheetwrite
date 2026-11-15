// The formatting demo's engine, the budget and the XLSX proof, loaded once the
// budget comes near the viewport (FormattingStage.tsx).
import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";
import { observeSiteTheme } from "@docs/lib/site-theme.js";
import {
  applyNumberFormat,
  applyStyleCommand,
  createFormattingSnapshot,
  FORMATTING_TARGET,
  roundTripFormatting,
  type StyleCommand,
} from "@docs/showcases/scenarios/formatting.js";
import { siteGridTheme } from "@docs/showcases/site-grid-theme.js";
import {
  createGridFromSnapshot,
  type Grid,
  initSheetwrite,
  type CellStyle,
  type Theme,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { createFormulaBar, createNameBox } from "@sheetwrite/core/shell";

declare global {
  interface Window {
    __sheetwriteFormattingGrid?: Grid;
  }
}

const ROW_HEIGHT = 42;
const theme = (): Partial<Theme> => ({ ...siteGridTheme(), rowHeight: ROW_HEIGHT });

export type RoundTrip = Awaited<ReturnType<typeof roundTripFormatting>>;

export interface FormattingBudget {
  /** Styles the revenue pair, B3:C3. */
  styleTarget(style: Partial<CellStyle>): void;
  applyStyleCommand(command: StyleCommand): void;
  applyNumberFormat(code: string): void;
  /** Exports the current edits to XLSX, decodes them and compares. */
  roundTrip(): Promise<RoundTrip>;
  dispose(): void;
}

/** Starts the budget in `host` with its name box and formula bar in `formulaHost`. */
export async function startFormattingBudget(
  host: HTMLElement,
  formulaHost: HTMLElement,
): Promise<FormattingBudget> {
  await initSheetwrite();
  const grid = createGridFromSnapshot(host, createFormattingSnapshot(), {
    theme: theme(),
    config: { toolbar: false },
  });
  grid.setSelection({ kind: "range", range: FORMATTING_TARGET });
  const pieces = [createNameBox(formulaHost, grid), createFormulaBar(formulaHost, grid)];
  window.__sheetwriteFormattingGrid = grid;
  const stopTheme = observeSiteTheme(() => grid.replaceTheme(theme()));
  return {
    styleTarget: (style) => grid.styleRange(FORMATTING_TARGET, style),
    applyStyleCommand: (command) => applyStyleCommand(grid, command),
    applyNumberFormat: (code) => applyNumberFormat(grid, code),
    roundTrip: () => roundTripFormatting(grid),
    dispose() {
      stopTheme();
      for (const piece of pieces) piece.destroy();
      grid.destroy();
      delete window.__sheetwriteFormattingGrid;
    },
  };
}

/** Shows the re-imported workbook in `host`, following the site theme. */
export function showImportedBudget(host: HTMLElement, snapshot: WorkbookSnapshot): () => void {
  const imported = createGridFromSnapshot(host, snapshot, {
    theme: theme(),
    config: { toolbar: false },
  });
  const stopTheme = observeSiteTheme(() => imported.replaceTheme(theme()));
  return () => {
    stopTheme();
    imported.destroy();
  };
}
