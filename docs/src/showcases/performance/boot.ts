// The performance demo's engine: the billion-address Grid and its datasource,
// loaded once the Grid comes near the viewport (workbench.ts).
import "@sheetwrite/core/styles.css";
import {
  createScaleDataSource,
  createScaleWorkbook,
  type DatasourceTelemetry,
  FEED_SHEET,
  SCALE_ROWS,
  SCALE_THEME,
} from "@docs/showcases/scenarios/scale.js";
import { siteGridTheme } from "@docs/showcases/site-grid-theme.js";
import type { RenderingMode } from "@docs/showcases/ui/rendering-mode.js";
import {
  createGrid,
  type DataSourceStorageOptions,
  type Grid,
  initSheetwrite,
  type Theme,
} from "@sheetwrite/core";
import workerRendererUrl from "@sheetwrite/core/worker?worker&url";

export {
  attemptColumnScan,
  attemptFullCsvExport,
  measureBulkMutation,
  pagedStatsOf,
  queryCapabilityOf,
} from "@docs/showcases/scenarios/scale.js";
export { diffRuntimeResourcePhases } from "@sheetwrite/core";

/** The site palette under the scale Grid's own font and row sizes. */
export const scaleTheme = (): Partial<Theme> => ({ ...siteGridTheme(), ...SCALE_THEME });

interface ScaleGridOptions {
  readonly renderer: RenderingMode;
  readonly storage: Required<DataSourceStorageOptions>;
  readonly overscan: number;
  readonly onTelemetry: (update: DatasourceTelemetry) => void;
  /** PageUp moves the selection one visible page up from the window's first row. */
  readonly visibleRows: () => { firstRow: number; lastRow: number };
}

/** Starts the engine and mounts the scale Grid in `host`. */
export async function startScaleGrid(host: HTMLElement, options: ScaleGridOptions): Promise<Grid> {
  await initSheetwrite();
  return createGrid(host, {
    workbook: createScaleWorkbook(),
    datasource: createScaleDataSource((update) => options.onTelemetry({ ...update })),
    datasourceStorage: options.storage,
    theme: scaleTheme(),
    presentation: "data-grid",
    config: {
      toolbar: false,
      tabs: false,
      contextMenu: [
        { action: "copy", label: "Copy loaded value" },
        {
          label: "Jump to last row",
          onClick(instance) {
            const addr = { sheet: FEED_SHEET, row: SCALE_ROWS - 1, col: 0 };
            instance.setSelection({ kind: "cell", addr });
            instance.scrollToCell(addr);
          },
        },
        {
          label: "Return to first cell",
          onClick(instance) {
            const addr = { sheet: FEED_SHEET, row: 0, col: 0 };
            instance.setSelection({ kind: "cell", addr });
            instance.scrollToCell(addr);
          },
        },
      ],
      keyboard: (event, mountedGrid) => {
        if (
          event.key !== "PageUp" ||
          event.shiftKey ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        ) {
          return false;
        }
        const selected = mountedGrid.getSelection();
        if (selected?.kind !== "cell") return false;
        const visible = options.visibleRows();
        const pageRows = Math.max(1, visible.lastRow - visible.firstRow + 1);
        const selectedAddr = {
          ...selected.addr,
          row: Math.max(0, visible.firstRow - pageRows),
        };
        mountedGrid.setSelection({ kind: "cell", addr: selectedAddr });
        mountedGrid.scrollToCell(selectedAddr);
        event.preventDefault();
        return true;
      },
    },
    renderer: options.renderer,
    overscan: options.overscan,
    ...(options.renderer === "worker" ? { workerUrl: workerRendererUrl } : {}),
  });
}
