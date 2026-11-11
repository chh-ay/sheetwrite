import { GridImpl } from "../src/grid.js";
import { SheetwriteStore } from "../src/store.js";
import type {
  ColumnarData,
  DataSourcePage,
  DataSourceRequest,
  Range,
  RowData,
  Sheet,
  Workbook,
} from "../src/types.js";
import {
  setXlsxTableExportBackend,
  setXlsxTableImportBackend,
  setXlsxWorkbookBackend,
  xlsxTableExportBackend,
  xlsxTableImportBackend,
  xlsxWorkbookBackend,
} from "../src/xlsx-slots.js";

/**
 * Keep the XLSX backends installed now, and return the function that puts them
 * back. Add-ons install once per test process, so a test that replaces or
 * clears a backend restores what another file's `xlsxAddon()` installed.
 */
export function keepXlsxSlots(): () => void {
  const workbook = xlsxWorkbookBackend();
  const tableImport = xlsxTableImportBackend();
  const tableExport = xlsxTableExportBackend();

  return () => {
    setXlsxWorkbookBackend(workbook);
    setXlsxTableImportBackend(tableImport);
    setXlsxTableExportBackend(tableExport);
  };
}

export function makeWorkbook(rowCount = 50): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount,
        columns: [
          { key: "name", header: "Name", width: 160, type: "text" },
          { key: "amount", header: "Amount", width: 120, type: "number" },
          { key: "city", header: "City", width: 140, type: "text" },
        ],
      },
    ],
  };
}

export function makeColumnarData(rowCount = 50): ColumnarData {
  const name: string[] = new Array(rowCount);
  const amount = new Float64Array(rowCount);
  const city: string[] = new Array(rowCount);
  const cities = ["Phnom Penh", "Tokyo", "Berlin"];
  for (let r = 0; r < rowCount; r++) {
    name[r] = `Customer ${r}`;
    amount[r] = r * 10 + 0.5;
    city[r] = cities[r % cities.length]!;
  }
  return { rowCount, columns: { name, amount, city } };
}

export function sheet(id: string, rowCount = 10): Sheet {
  const columns = ["a", "b", "c", "d"].map((key) => ({
    key,
    header: key,
    width: 80,
    type: "number" as const,
  }));

  return { id, name: id, rowCount, columns };
}

export function range(sheetId: string, r0: number, c0: number, r1: number, c1: number): Range {
  return { sheet: sheetId, start: { row: r0, col: c0 }, end: { row: r1, col: c1 } };
}

/**
 * Append a grid host to the document with an 800 x 400 layout size, which
 * happy-dom does not compute on its own.
 */
export function mountHost(): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(host, "clientHeight", { value: 400, configurable: true });
  document.body.appendChild(host);
  return host;
}

/**
 * Mount a grid over a caller-owned store of `makeWorkbook(rowCount)` filled
 * with `makeColumnarData(rowCount)`.
 */
export function mountGridWithData(rowCount = 50): {
  workbook: Workbook;
  store: SheetwriteStore;
  host: HTMLDivElement;
  grid: GridImpl;
} {
  const workbook = makeWorkbook(rowCount);
  const store = new SheetwriteStore(workbook, makeColumnarData(rowCount));
  const host = mountHost();
  const grid = new GridImpl(host, { workbook }, store);
  return { workbook, store, host, grid };
}

/** The grid's scroll container under `host`. */
export function scrollerOf(host: HTMLElement): HTMLDivElement {
  const node = host.querySelector(".sheetwrite-scroller");
  if (!(node instanceof HTMLDivElement)) throw new Error("expected grid scroller");
  return node;
}

/**
 * Resolve with the first element under `host` that matches `selector`, now or
 * when it is added. Use it for chrome that loads its own chunk, such as the
 * find bar, instead of a guessed delay.
 */
export function elementAdded<T extends Element>(
  host: HTMLElement,
  selector: string,
  type: new () => T,
): Promise<T> {
  return new Promise((resolve) => {
    const match = (): boolean => {
      const element = host.querySelector(selector);
      if (!(element instanceof type)) return false;
      resolve(element);
      return true;
    };
    if (match()) return;
    const observer = new MutationObserver(() => {
      if (match()) observer.disconnect();
    });
    observer.observe(host, { childList: true, subtree: true });
  });
}

/** Fill each requested column of `values`, with `null` for keys it lacks. */
function coveredRow(request: DataSourceRequest, values: RowData): RowData {
  const row: RowData = {};
  for (const band of request.columns) {
    for (const key of band.keys) row[key] = values[key] ?? null;
  }
  return row;
}

/** A protocol-2 page that answers `request` with `rows`, covering every requested column. */
export function coveredPage(request: DataSourceRequest, rows: RowData[]): DataSourcePage {
  return {
    protocol: 2,
    start: request.start,
    columns: request.columns,
    rows: rows.map((row) => coveredRow(request, row)),
  };
}
