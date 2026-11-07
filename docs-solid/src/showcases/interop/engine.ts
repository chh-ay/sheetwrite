// The interoperability demo's engine: the exchange workbook and every import,
// export and limit the panel and the labs run. Loaded once the workbook comes
// near the viewport (InteropStage.tsx); it writes the page's shared state
// (state.ts).
import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";
import { errorText } from "@docs/lib/errors.js";
import { observeSiteTheme } from "@docs/lib/site-theme.js";
import {
  type Column,
  type ColumnarData,
  createGrid,
  createGridFromSnapshot,
  downloadBytes,
  fromCsv,
  type Grid,
  type GridOptions,
  initSheetwrite,
  type Theme,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  type ShellPiece,
} from "@sheetwrite/core/shell";

import {
  abortedImport,
  ADVERSARIAL_FIXTURES,
  BULK_SALES_ROWS,
  createBulkSalesCsv,
  createInjectionSnapshot,
  createInteropSnapshot,
  csvOfActiveSheet,
  delimitedCeilingDemo,
  expectRejection,
  exportWorkbook,
  fetchFixtureBytes,
  importDelimitedText,
  importWorkbook,
  INTEROP_ANALYSIS_SHEET,
  INTEROP_ASSUMPTIONS_SHEET,
  type InteropFixture,
  POSITIVE_FIXTURES,
  probeXlsxRegistration,
  roundTripWorkbook,
  sha256Hex,
  tsvOfSelection,
} from "../scenarios/interoperability.js";
import {
  type AnalyticalReadout,
  setAbortReport,
  setAttacksRunAt,
  setBulkReport,
  setCellCapReport,
  setCsvCapReport,
  setCsvPreview,
  setDigests,
  setFileReport,
  setFixtureLoad,
  setGridReady,
  setModelChange,
  setModelReadout,
  setPasteError,
  setProbe,
  setRejections,
  setRoundTrip,
  setSourceLabel,
  setStatus,
  setTsvPreview,
  setWarningLog,
  STARTING_SOURCE_LABEL,
} from "./state.js";

declare global {
  interface Window {
    __sheetwriteInteropGrid?: Grid;
  }
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Canvas colors come from the stage's shared demo tokens, which follow the page theme. */
const CANVAS_THEME: Partial<Theme> = { rowHeight: 36 };

type WorkbenchSource =
  | { kind: "snapshot"; label: string; snapshot: WorkbookSnapshot }
  | { kind: "columnar"; label: string; columns: Column[]; data: ColumnarData };

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function modelNumber(grid: Grid, sheet: string, row: number, col: number): number | null {
  const resolved = grid.store.getCell({ sheet, row, col }).resolved;
  return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : null;
}

function readAnalyticalModel(grid: Grid): AnalyticalReadout | null {
  const sheets = new Set(grid.store.getWorkbook().sheets.map((sheet) => sheet.id));
  if (!sheets.has(INTEROP_ASSUMPTIONS_SHEET) || !sheets.has(INTEROP_ANALYSIS_SHEET)) {
    return null;
  }
  const spillAnchor = { sheet: INTEROP_ANALYSIS_SHEET, row: 0, col: 4 };
  const spill = Array.from({ length: 6 }, (_, row) => {
    const address = { ...spillAnchor, row };
    const owner = grid.store.getSpillAnchor(address);
    return owner?.sheet === spillAnchor.sheet &&
      owner.row === spillAnchor.row &&
      owner.col === spillAnchor.col
      ? modelNumber(grid, address.sheet, address.row, address.col)
      : null;
  });
  return {
    selectedRate: modelNumber(grid, INTEROP_ASSUMPTIONS_SHEET, 1, 1),
    payment: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 0, 3),
    statistical: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 1, 3),
    letResult: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 2, 3),
    npv: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 3, 3),
    irr: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 4, 3),
    scheduleEnd: modelNumber(grid, INTEROP_ANALYSIS_SHEET, 4, 0),
    spill,
  };
}

function changedAnalyticalResults(
  previous: AnalyticalReadout,
  next: AnalyticalReadout,
): readonly string[] {
  const changed = [
    ["Payment", previous.payment, next.payment],
    ["NPV", previous.npv, next.npv],
    ["IRR", previous.irr, next.irr],
    ["STDEV.S", previous.statistical, next.statistical],
    ["LET", previous.letResult, next.letResult],
    ["Date schedule", previous.scheduleEnd, next.scheduleEnd],
  ] as const;
  const labels: string[] = changed
    .filter(([, before, after]) => !Object.is(before, after))
    .map(([label]) => label);
  if (previous.spill.some((value, index) => !Object.is(value, next.spill[index]))) {
    labels.push("Spill");
  }
  return labels;
}

/** Hosts the engine mounts into: the grid, its formula row and its status row. */
export interface InteropHosts {
  readonly grid: HTMLElement;
  readonly formulaRow: HTMLElement;
  readonly statusRow: HTMLElement;
}

export interface InteropEngine {
  handleDownload(): Promise<void>;
  handleRoundTrip(): Promise<void>;
  handleModelInput(row: number, col: number, value: number, label: string): void;
  handleFile(file: File | null): Promise<void>;
  handleBulkImport(): Promise<void>;
  handleFixtureLoad(fixture: InteropFixture): Promise<void>;
  /** Every hostile package, the aborted signal and both cell ceilings, in order. */
  runAllAttacks(): Promise<void>;
  handleCsvExport(): void;
  handleCsvDownload(): void;
  handleTsvExport(): void;
  handlePasteImport(text: string): void;
  /** The formula-injection probe: a literal formula-like text cell in the grid. */
  loadInjectionProbe(): void;
  resetWorkbench(): void;
  dispose(): void;
}

/** Starts the exchange workbook in its hosts and hashes the committed fixtures. */
export function createInteropEngine(hosts: InteropHosts): InteropEngine {
  const bytesCache = new Map<string, Uint8Array>();
  let probed = false;
  let grid: Grid | null = null;
  let unmount: (() => void) | null = null;
  let disposed = false;
  let generation = 0;

  const fixtureBytes = async (fixture: InteropFixture): Promise<Uint8Array> => {
    const cached = bytesCache.get(fixture.file);
    if (cached) return cached;
    const bytes = await fetchFixtureBytes(fixture);
    bytesCache.set(fixture.file, bytes);
    return bytes;
  };

  /** Mounts one grid generation for `source`, replacing the one before. */
  const mount = (source: WorkbenchSource) => {
    unmount?.();
    unmount = null;
    const current = ++generation;
    setSourceLabel(source.label);
    setGridReady(false);
    let mounted: Grid | null = null;
    const pieces: ShellPiece[] = [];
    let unsubscribeChange: (() => void) | null = null;
    let previousModel: AnalyticalReadout | null = null;

    void initSheetwrite()
      .then(async () => {
        if (disposed || current !== generation) return;
        // The registration probe must observe the page BEFORE this route ever
        // touches the optional XLSX package, so it runs exactly once, here.
        if (!probed) {
          probed = true;
          setProbe(await probeXlsxRegistration());
          if (disposed || current !== generation) return;
        }
        const base: Pick<GridOptions, "theme" | "config"> = {
          theme: CANVAS_THEME,
          config: {
            toolbar: false,
            contextMenu: [
              { action: "copy", label: "Copy imported value" },
              { action: "paste" },
              { action: "separator" },
              { label: "Export XLSX with fidelity report", onClick: () => void handleDownload() },
              { label: "Compare XLSX round-trip", onClick: () => void handleRoundTrip() },
            ],
          },
        };
        mounted =
          source.kind === "snapshot"
            ? createGridFromSnapshot(hosts.grid, source.snapshot, base)
            : createGrid(hosts.grid, {
                workbook: {
                  activeSheet: "imported",
                  sheets: [
                    {
                      id: "imported",
                      name: "Imported",
                      rowCount: source.data.rowCount,
                      columns: source.columns,
                    },
                  ],
                },
                data: source.data,
                ...base,
              });
        const live = mounted;
        live.setSelection({
          kind: "cell",
          addr: { sheet: live.getActiveSheet(), row: 0, col: 0 },
        });
        pieces.push(
          createNameBox(hosts.formulaRow, live, { focusGrid: () => hosts.grid.focus() }),
          createFormulaBar(hosts.formulaRow, live, { focusGrid: () => hosts.grid.focus() }),
          createSelectionStatus(hosts.statusRow, live),
        );
        grid = live;
        window.__sheetwriteInteropGrid = live;
        previousModel = readAnalyticalModel(live);
        setModelReadout(previousModel);
        setModelChange(null);
        unsubscribeChange = live.on("change", (event) => {
          const nextModel = readAnalyticalModel(live);
          setModelReadout(nextModel);
          if (previousModel && nextModel) {
            setModelChange({
              address: event.changes
                .map(({ addr }) => `${String(addr.sheet)}!R${addr.row + 1}C${addr.col + 1}`)
                .join(", "),
              committedCells: event.changes.length,
              changedResults: changedAnalyticalResults(previousModel, nextModel),
            });
          }
          previousModel = nextModel;
        });
        setGridReady(true);
        setStatus(
          `Loaded: ${source.label}. Edit any cell, then export, re-import, and compare it cell by cell.`,
        );
      })
      .catch((error: unknown) => {
        if (!disposed && current === generation) {
          setGridReady(false);
          setStatus(`Workbook could not load — ${describeError(error)}`);
        }
      });

    unmount = () => {
      unsubscribeChange?.();
      setGridReady(false);
      for (const piece of pieces) piece.destroy();
      if (grid === mounted) {
        grid = null;
        delete window.__sheetwriteInteropGrid;
      }
      mounted?.destroy();
    };
  };

  // Verify fixture provenance in-browser: hash committed bytes, compare to the manifest.
  void (async () => {
    for (const fixture of [...POSITIVE_FIXTURES, ...ADVERSARIAL_FIXTURES]) {
      try {
        const bytes = await fixtureBytes(fixture);
        const actual = await sha256Hex(bytes);
        if (disposed) return;
        setDigests(fixture.id, {
          state: actual === fixture.sha256 ? "verified" : "mismatch",
          actual,
          bytes: bytes.byteLength,
        });
      } catch (error) {
        if (disposed) return;
        setDigests(fixture.id, { state: "mismatch", actual: describeError(error) });
      }
    }
  })();

  // The engine resolves --sheetwrite-* custom properties at grid mount. When
  // the site theme flips, re-run that resolution so the canvas repaints.
  const stopTheme = observeSiteTheme(() => grid?.replaceTheme(CANVAS_THEME));

  const handleDownload = async () => {
    if (!grid) return;
    try {
      const outcome = await exportWorkbook(grid);
      setWarningLog({ operation: "XLSX export", warnings: outcome.warnings });
      downloadBytes(outcome.bytes, "sheetwrite-interoperability.xlsx", XLSX_MIME);
      setStatus(`Downloaded ${outcome.bytes.byteLength.toLocaleString("en")} bytes of .xlsx.`);
    } catch (error) {
      setStatus(`Export failed — ${describeError(error)}`);
      throw new Error("Cannot export the workbook.", { cause: error });
    }
  };

  const handleRoundTrip = async () => {
    if (!grid) return;
    setStatus("Exporting and re-importing the live document…");
    try {
      const report = await roundTripWorkbook(grid);
      setRoundTrip(report);
      setWarningLog({
        operation: "XLSX export, then re-import",
        warnings: [...report.exportWarnings, ...report.importWarnings],
      });
      setStatus(
        `Compared ${report.cellsCompared.toLocaleString("en")} stored cells. ${report.cellsMatched.toLocaleString("en")} matched; ${report.formulasPreserved}/${report.formulasBefore} formula sources preserved.`,
      );
    } catch (error) {
      setStatus(`Round-trip failed — ${describeError(error)}`);
      throw new Error("Cannot compare the workbook round-trip.", { cause: error });
    }
  };

  const rich = () => POSITIVE_FIXTURES.find((fixture) => fixture.file === "libreoffice-rich.xlsx");

  const resetWorkbench = () => {
    setFileReport(null);
    setBulkReport(null);
    setRoundTrip(null);
    setWarningLog(null);
    setFixtureLoad(null);
    mount({ kind: "snapshot", label: STARTING_SOURCE_LABEL, snapshot: createInteropSnapshot() });
  };

  mount({ kind: "snapshot", label: STARTING_SOURCE_LABEL, snapshot: createInteropSnapshot() });

  return {
    handleDownload,
    handleRoundTrip,
    handleModelInput(row, col, value, label) {
      if (!grid) return;
      const outcome = grid.applyTransaction({
        patches: [
          {
            op: "set",
            addr: { sheet: INTEROP_ASSUMPTIONS_SHEET, row, col },
            value: { kind: "literal", value },
          },
        ],
      });
      setStatus(
        outcome.status === "applied"
          ? `${label} changed through Grid.applyTransaction; live dependents recalculated.`
          : `${label} was not changed — transaction status: ${outcome.status}.`,
      );
    },
    async handleFile(file) {
      if (!file) return;
      if (!/\.(xlsx|csv)$/iu.test(file.name)) {
        setStatus("Choose an .xlsx or .csv file. The live workbook has not changed.");
        return;
      }
      setStatus(`Importing ${file.name}…`);
      const started = performance.now();
      try {
        if (/\.csv$/iu.test(file.name)) {
          const imported = importDelimitedText(await file.text());
          setWarningLog({ operation: `CSV import of ${file.name}`, warnings: [] });
          mount({
            kind: "columnar",
            label: file.name,
            columns: imported.columns,
            data: imported.data,
          });
          setFileReport({
            name: file.name,
            bytes: file.size,
            ms: performance.now() - started,
            sheets: 1,
            cells: imported.data.rowCount * imported.columns.length,
            formulas: 0,
            warnings: 0,
          });
        } else {
          const outcome = await importWorkbook(await file.arrayBuffer());
          setWarningLog({ operation: `Import of ${file.name}`, warnings: outcome.warnings });
          const cells = outcome.snapshot.sheets.flatMap((sheet) =>
            sheet.cells.flatMap((block) => block.cells),
          );
          setFileReport({
            name: file.name,
            bytes: file.size,
            ms: performance.now() - started,
            sheets: outcome.snapshot.sheets.length,
            cells: cells.length,
            formulas: cells.filter((cell) => cell.value.kind === "formula").length,
            warnings: outcome.warnings.length,
          });
          mount({ kind: "snapshot", label: file.name, snapshot: outcome.snapshot });
        }
        setRoundTrip(null);
        setFixtureLoad(null);
      } catch (error) {
        setStatus(`Import rejected — ${describeError(error)}`);
        throw new Error("Cannot import this file. Check the file and try again.", {
          cause: error,
        });
      }
    },
    async handleBulkImport() {
      setStatus("Generating a sales CSV in this browser…");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      try {
        const generated = createBulkSalesCsv();
        const bytes = new TextEncoder().encode(generated.text).byteLength;
        const started = performance.now();
        const data = fromCsv(generated.text, generated.columns, {
          resourceLimits: { maxCells: (BULK_SALES_ROWS + 1) * generated.columns.length },
        });
        setBulkReport({
          rows: data.rowCount,
          columns: generated.columns.length,
          ms: performance.now() - started,
          bytes,
        });
        setRoundTrip(null);
        setFileReport(null);
        setWarningLog(null);
        mount({
          kind: "columnar",
          label: "Generated sales ledger · 200,000 orders",
          columns: generated.columns,
          data,
        });
      } catch (error) {
        setStatus(`Generated CSV import failed — ${describeError(error)}`);
        throw new Error("Cannot import the generated CSV.", { cause: error });
      }
    },
    async handleFixtureLoad(fixture) {
      setStatus(`Importing committed fixture ${fixture.file}…`);
      setFixtureLoad({ id: fixture.id, state: "loading", detail: "Importing committed bytes…" });
      try {
        const outcome = await importWorkbook(await fixtureBytes(fixture));
        setWarningLog({
          operation: `Import of ${fixture.file} (${fixture.producer})`,
          warnings: outcome.warnings,
        });
        setRoundTrip(null);
        mount({
          kind: "snapshot",
          label: `${fixture.file} — produced by ${fixture.producer}`,
          snapshot: outcome.snapshot,
        });
        const sheets = outcome.snapshot.sheets.length;
        let cells = 0;
        for (const sheet of outcome.snapshot.sheets) {
          for (const block of sheet.cells) cells += block.cells.length;
        }
        setFixtureLoad({
          id: fixture.id,
          state: "loaded",
          detail: `In the workbench now — ${sheets} sheet${sheets === 1 ? "" : "s"}, ${cells.toLocaleString("en")} cells, ${outcome.warnings.length} warning${outcome.warnings.length === 1 ? "" : "s"}.`,
        });
      } catch (error) {
        setFixtureLoad({
          id: fixture.id,
          state: "failed",
          detail: `Import failed — ${describeError(error)}`,
        });
        setStatus(`Fixture import failed — ${describeError(error)}`);
        throw new Error("Cannot import this fixture.", { cause: error });
      }
    },
    async runAllAttacks() {
      setStatus("Feeding hostile packages to the import path…");
      for (const fixture of ADVERSARIAL_FIXTURES) {
        try {
          setRejections(fixture.id, await expectRejection(await fixtureBytes(fixture)));
        } catch (error) {
          setRejections(fixture.id, {
            rejected: false,
            errorName: null,
            code: null,
            limit: null,
            message: describeError(error),
          });
        }
      }
      const workbook = rich();
      if (workbook) {
        const bytes = await fixtureBytes(workbook);
        setAbortReport(await abortedImport(bytes));
        setCellCapReport(await expectRejection(bytes, { maxCells: 8 }));
      }
      setCsvCapReport(delimitedCeilingDemo());
      setAttacksRunAt(Date.now());
      setStatus("Attack run finished — every input must show a typed rejection.");
    },
    handleCsvExport() {
      if (!grid) return;
      try {
        setCsvPreview(csvOfActiveSheet(grid));
        setStatus("Active sheet exported to CSV through the hardened text path.");
      } catch (error) {
        setStatus(`CSV export failed — ${describeError(error)}`);
        throw new Error("Cannot export CSV.", { cause: error });
      }
    },
    handleCsvDownload() {
      if (!grid) return;
      try {
        downloadBytes(csvOfActiveSheet(grid), "sheetwrite-interoperability.csv", "text/csv");
      } catch (error) {
        setStatus(`CSV download failed — ${describeError(error)}`);
        throw new Error("Cannot download CSV.", { cause: error });
      }
    },
    handleTsvExport() {
      if (!grid) return;
      try {
        const tsv = tsvOfSelection(grid);
        setTsvPreview(tsv);
        setStatus(
          tsv === null
            ? "Select a cell or range in the grid first, then export the selection."
            : "Selection exported as clipboard-format TSV.",
        );
      } catch (error) {
        setStatus(`TSV export failed — ${describeError(error)}`);
        throw new Error("Cannot export TSV.", { cause: error });
      }
    },
    handlePasteImport(text) {
      setPasteError(null);
      try {
        const imported = importDelimitedText(text);
        setRoundTrip(null);
        setWarningLog(null);
        setFixtureLoad(null);
        mount({
          kind: "columnar",
          label: `Pasted ${imported.delimiter === "\t" ? "TSV" : "CSV"} (${imported.rows} rows)`,
          columns: imported.columns,
          data: imported.data,
        });
      } catch (error) {
        setPasteError(errorText(error));
        throw new Error("Cannot import the pasted text.", { cause: error });
      }
    },
    loadInjectionProbe() {
      setRoundTrip(null);
      setFileReport(null);
      setBulkReport(null);
      setCsvPreview(null);
      mount({
        kind: "snapshot",
        label: "CSV and TSV · literal injection probe",
        snapshot: createInjectionSnapshot(),
      });
    },
    resetWorkbench,
    dispose() {
      disposed = true;
      stopTheme();
      unmount?.();
      unmount = null;
    },
  };
}
