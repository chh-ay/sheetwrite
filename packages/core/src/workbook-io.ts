import { downloadBytesIn } from "./export.js";
import type { RibbonButtonSpec } from "./ribbon/command-spec.js";
import { Scope } from "./scope.js";
import { IncompleteDataError, SheetwriteStore } from "./store.js";
import type { WorkbookSnapshot } from "./types/document.js";
import type { Grid } from "./types/grid.js";
import { fromXlsxWorkbookFile, hasXlsxWorkbookBackend, toXlsxTable } from "./xlsx-bridge.js";

/** The registry loads this module before activation, so opening the native picker needs no network turn. */
export const xlsxImportCommand: RibbonButtonSpec = {
  kind: "button",
  id: "importXlsx",
  label: "Import XLSX",
  icon: "importXlsx",
  availability: "importXlsx",
  available: hasXlsxWorkbookBackend,
  run: (grid) => grid.actions.importXlsx(),
};

/** A loader that ignores cancellation must not retain the caller's pending operation. */
export async function loadWorkbook(
  source: WorkbookSnapshot | ((signal: AbortSignal) => Promise<WorkbookSnapshot>),
  signal: AbortSignal,
): Promise<WorkbookSnapshot> {
  signal.throwIfAborted();
  const stopped = Promise.withResolvers<never>();
  const abort = (): void => stopped.reject(signal.reason);
  signal.addEventListener("abort", abort, { once: true });

  try {
    return await Promise.race([
      typeof source === "function" ? source(signal) : source,
      stopped.promise,
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

/** Native file selection keeps keyboard and assistive-technology behavior with the browser. */
export async function pickXlsxWorkbook(
  grid: Grid,
  host: HTMLElement,
  lifetime: Scope,
): Promise<void> {
  lifetime.signal.throwIfAborted();
  const run = lifetime.child();
  const selected = Promise.withResolvers<File | null>();
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  picker.setAttribute("aria-label", "Import XLSX");
  picker.hidden = true;
  host.append(picker);
  run.add(() => {
    picker.remove();
    selected.resolve(null);
  });
  picker.addEventListener("change", () => selected.resolve(picker.files?.item(0) ?? null), {
    once: true,
    signal: run.signal,
  });
  picker.addEventListener("cancel", () => selected.resolve(null), {
    once: true,
    signal: run.signal,
  });

  try {
    picker.click();
    const file = await selected.promise;
    if (file !== null) {
      await grid.importWorkbook((signal) => fromXlsxWorkbookFile(file, { signal }), {
        signal: run.signal,
      });
    }
  } finally {
    run.close();
    if (!lifetime.closed) host.focus();
  }
}

/** Export is cold document work; replacement and destruction both cancel it. */
export async function exportWorkbookFile(
  grid: Pick<Grid, "store" | "getActiveSheet">,
  filename: string,
  run: Scope,
  lifetime: Scope,
): Promise<void> {
  run.signal.throwIfAborted();

  const store = grid.store;
  const storedWorkbook = store.getWorkbook();
  const activeSheet = grid.getActiveSheet();
  const workbook =
    storedWorkbook.activeSheet === activeSheet
      ? storedWorkbook
      : { ...storedWorkbook, activeSheet };
  const sheet =
    workbook.sheets.find((candidate) => candidate.id === activeSheet) ?? workbook.sheets[0];
  if (sheet && store instanceof SheetwriteStore) {
    const capability = store.queryCapability(sheet.id);
    if (capability.status === "incomplete") throw new IncompleteDataError(sheet.id, capability);
  }

  const bytes = await toXlsxTable(workbook, store, { signal: run.signal });
  run.signal.throwIfAborted();

  downloadBytesIn(
    lifetime,
    bytes,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}
