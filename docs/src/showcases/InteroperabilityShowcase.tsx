import type {
  Column,
  ColumnarData,
  Grid,
  GridOptions,
  Theme,
  WorkbookSnapshot,
  XlsxWorkbookWarning,
} from "@sheetwrite/core";
import {
  cellA1,
  createGrid,
  createGridFromSnapshot,
  downloadBytes,
  fromCsv,
  initSheetwrite,
} from "@sheetwrite/core";
import {
  createFormulaBar,
  createNameBox,
  createSelectionStatus,
  type ShellPiece,
} from "@sheetwrite/core/shell";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { Icon } from "../components/Icon.js";
import compatibilityData from "../generated/compatibility.json";
import { errorText } from "../lib/errors.js";
import { formatBytes } from "../lib/format.js";
import { observeSiteTheme } from "../lib/site-theme.js";
import { ActionError, pendingProps, useAction } from "../lib/use-action.js";
import { InteropLabs } from "./interop-labs/InteropLabs.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
  ShowcaseStatus,
} from "./layout/ShowcaseLayout.js";
import {
  ADVERSARIAL_FIXTURES,
  abortedImport,
  BULK_SALES_ROWS,
  createBulkSalesCsv,
  createInteropSnapshot,
  csvOfActiveSheet,
  expectRejection,
  exportWorkbook,
  fetchFixtureBytes,
  INTEROP_ANALYSIS_SHEET,
  INTEROP_ASSUMPTIONS_SHEET,
  type InteropFixture,
  importDelimitedText,
  importWorkbook,
  POSITIVE_FIXTURES,
  probeXlsxRegistration,
  type RejectionReport,
  type RoundTripReport,
  roundTripWorkbook,
  sha256Hex,
  tsvOfSelection,
} from "./scenarios/interoperability.js";
import InteroperabilitySnippet from "./snippets/interoperability.mdx";
import { DemoButton } from "./ui/DemoButton.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

/** Empty value for an exchange measurement that has not run yet. */
const NOT_RUN = "Not run";

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

interface WarningLog {
  operation: string;
  warnings: XlsxWorkbookWarning[];
}

interface DigestState {
  state: "pending" | "verified" | "mismatch";
  actual?: string;
  /** The fetched file's size in bytes. */
  bytes?: number;
}

interface IsolationProbe {
  registered: boolean;
  error: string | null;
}

interface FixtureLoad {
  id: string;
  state: "loading" | "loaded" | "failed";
  detail: string;
}

interface AnalyticalReadout {
  selectedRate: number | null;
  payment: number | null;
  statistical: number | null;
  letResult: number | null;
  npv: number | null;
  irr: number | null;
  scheduleEnd: number | null;
  spill: readonly (number | null)[];
}

interface AnalyticalChange {
  address: string;
  committedCells: number;
  changedResults: readonly string[];
}

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

/** "pass" when every cell, formula, sheet, merge and frozen row came back. */
function roundTripOutcome(report: RoundTripReport): "pass" | "partial" {
  return report.formulasPreserved === report.formulasBefore &&
    report.sheetsPreserved &&
    report.mergePreserved &&
    report.frozenRowsPreserved &&
    report.cellsMatched === report.cellsCompared
    ? "pass"
    : "partial";
}

function formatCurrency(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
}

function formatPercent(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(value);
}

function formatSerialDate(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Date(Date.UTC(1899, 11, 30) + Math.trunc(value) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Workbench state and lifetime for the interoperability page: the Grid, the
 * loaded source and every import, export and limit report the sections show.
 */
function useInteroperabilityWorkbench() {
  const action = useAction();
  const run = (command: () => unknown) =>
    void action.run(
      command,
      (error) => `The file operation failed: ${describeError(error)}. Try again.`,
    );
  const hostRef = useRef<HTMLDivElement>(null);
  const formulaRowRef = useRef<HTMLDivElement>(null);
  const statusRowRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const bytesCache = useRef(new Map<string, Uint8Array>());
  const probedRef = useRef(false);

  const [source, setSource] = useState<WorkbenchSource>(() => ({
    kind: "snapshot",
    label: "Q1 2026 · workplace equipment sales",
    snapshot: createInteropSnapshot(),
  }));
  const [gridReady, setGridReady] = useState(false);
  const [status, setStatus] = useState("Booting the WASM engine…");
  const [probe, setProbe] = useState<IsolationProbe | null>(null);
  const [warningLog, setWarningLog] = useState<WarningLog | null>(null);
  const [roundTrip, setRoundTrip] = useState<RoundTripReport | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [bulkReport, setBulkReport] = useState<{
    rows: number;
    columns: number;
    ms: number;
    bytes: number;
  } | null>(null);
  const [fileReport, setFileReport] = useState<{
    name: string;
    bytes: number;
    ms: number;
    sheets: number;
    cells: number;
    formulas: number;
    warnings: number;
  } | null>(null);
  const [digests, setDigests] = useState<Record<string, DigestState>>({});
  const [rejections, setRejections] = useState<Record<string, RejectionReport>>({});
  const [abortReport, setAbortReport] = useState<RejectionReport | null>(null);
  const [cellCapReport, setCellCapReport] = useState<RejectionReport | null>(null);
  const [csvCapReport, setCsvCapReport] = useState<RejectionReport | null>(null);
  const [csvPreview, setCsvPreview] = useState<string | null>(null);
  const [tsvPreview, setTsvPreview] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [fixtureLoad, setFixtureLoad] = useState<FixtureLoad | null>(null);
  const [modelReadout, setModelReadout] = useState<AnalyticalReadout | null>(null);
  const [modelChange, setModelChange] = useState<AnalyticalChange | null>(null);

  const fixtureBytes = useCallback(async (fixture: InteropFixture): Promise<Uint8Array> => {
    const cached = bytesCache.current.get(fixture.file);
    if (cached) return cached;
    const bytes = await fetchFixtureBytes(fixture);
    bytesCache.current.set(fixture.file, bytes);
    return bytes;
  }, []);

  const exportFromMenu = useEffectEvent(() => run(handleDownload));
  const compareFromMenu = useEffectEvent(() => run(handleRoundTrip));

  // Mount one grid generation per workbench source.
  useEffect(() => {
    const host = hostRef.current;
    const formulaRow = formulaRowRef.current;
    const statusRow = statusRowRef.current;
    if (!host || !formulaRow || !statusRow) return;

    let disposed = false;
    let grid: Grid | null = null;
    const pieces: ShellPiece[] = [];
    let unsubscribeChange: (() => void) | null = null;
    let previousModel: AnalyticalReadout | null = null;

    void initSheetwrite()
      .then(async () => {
        if (disposed) return;
        // The registration probe must observe the page BEFORE this route ever
        // touches the optional XLSX package, so it runs exactly once, here.
        if (!probedRef.current) {
          probedRef.current = true;
          setProbe(await probeXlsxRegistration());
          if (disposed) return;
        }
        const base: Pick<GridOptions, "theme" | "config"> = {
          theme: CANVAS_THEME,
          config: {
            toolbar: false,
            contextMenu: [
              { action: "copy", label: "Copy imported value" },
              { action: "paste" },
              { action: "separator" },
              { label: "Export XLSX with fidelity report", onClick: () => exportFromMenu() },
              { label: "Compare XLSX round-trip", onClick: () => compareFromMenu() },
            ],
          },
        };
        grid =
          source.kind === "snapshot"
            ? createGridFromSnapshot(host, source.snapshot, base)
            : createGrid(host, {
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
        grid.setSelection({
          kind: "cell",
          addr: { sheet: grid.getActiveSheet(), row: 0, col: 0 },
        });
        pieces.push(
          createNameBox(formulaRow, grid, { focusGrid: () => host.focus() }),
          createFormulaBar(formulaRow, grid, { focusGrid: () => host.focus() }),
          createSelectionStatus(statusRow, grid),
        );
        gridRef.current = grid;
        window.__sheetwriteInteropGrid = grid;
        previousModel = readAnalyticalModel(grid);
        setModelReadout(previousModel);
        setModelChange(null);
        unsubscribeChange = grid.on("change", (event) => {
          if (!grid) return;
          const nextModel = readAnalyticalModel(grid);
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
        if (!disposed) {
          setGridReady(false);
          setStatus(`Workbook could not load — ${describeError(error)}`);
        }
      });

    return () => {
      unsubscribeChange?.();
      disposed = true;
      setGridReady(false);
      for (const piece of pieces) piece.destroy();
      if (gridRef.current === grid) {
        gridRef.current = null;
        delete window.__sheetwriteInteropGrid;
      }
      grid?.destroy();
    };
  }, [source]);

  // Verify fixture provenance in-browser: hash committed bytes, compare to the manifest.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const fixture of [...POSITIVE_FIXTURES, ...ADVERSARIAL_FIXTURES]) {
        try {
          const bytes = await fixtureBytes(fixture);
          const actual = await sha256Hex(bytes);
          if (cancelled) return;
          setDigests((previous) => ({
            ...previous,
            [fixture.id]: {
              state: actual === fixture.sha256 ? "verified" : "mismatch",
              actual,
              bytes: bytes.byteLength,
            },
          }));
        } catch (error) {
          if (cancelled) return;
          setDigests((previous) => ({
            ...previous,
            [fixture.id]: { state: "mismatch", actual: describeError(error) },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fixtureBytes]);

  // The engine resolves --sheetwrite-* custom properties at grid mount.
  // When the site theme flips, re-run that resolution (DEFAULT < CSS < options)
  // so the canvas repaints with the new palette instead of going stale.
  useEffect(() => observeSiteTheme(() => gridRef.current?.replaceTheme(CANVAS_THEME)), []);

  const handleDownload = async () => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      const outcome = await exportWorkbook(grid);
      setWarningLog({ operation: "XLSX export", warnings: outcome.warnings });
      downloadBytes(outcome.bytes, "sheetwrite-interoperability.xlsx", XLSX_MIME);
      setStatus(`Downloaded ${outcome.bytes.byteLength.toLocaleString()} bytes of .xlsx.`);
    } catch (error) {
      setStatus(`Export failed — ${describeError(error)}`);
      throw new Error("Cannot export the workbook.", { cause: error });
    }
  };

  const handleRoundTrip = async () => {
    const grid = gridRef.current;
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
        `Compared ${report.cellsCompared.toLocaleString()} stored cells. ${report.cellsMatched.toLocaleString()} matched; ${report.formulasPreserved}/${report.formulasBefore} formula sources preserved.`,
      );
    } catch (error) {
      setStatus(`Round-trip failed — ${describeError(error)}`);
      throw new Error("Cannot compare the workbook round-trip.", { cause: error });
    }
  };

  const handleModelInput = (row: number, col: number, value: number, label: string) => {
    const grid = gridRef.current;
    if (!grid || !modelReadout) return;
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
  };

  const handleFile = async (file: File | null) => {
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
        setSource({
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
        setSource({ kind: "snapshot", label: file.name, snapshot: outcome.snapshot });
      }
      setRoundTrip(null);
      setFixtureLoad(null);
    } catch (error) {
      setStatus(`Import rejected — ${describeError(error)}`);
      throw new Error("Cannot import this file. Check the file and try again.", { cause: error });
    }
  };

  const handleBulkImport = async () => {
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
      setSource({
        kind: "columnar",
        label: "Generated sales ledger · 200,000 orders",
        columns: generated.columns,
        data,
      });
    } catch (error) {
      setStatus(`Generated CSV import failed — ${describeError(error)}`);
      throw new Error("Cannot import the generated CSV.", { cause: error });
    }
  };

  const handleFixtureLoad = async (fixture: InteropFixture) => {
    setStatus(`Importing committed fixture ${fixture.file}…`);
    setFixtureLoad({ id: fixture.id, state: "loading", detail: "Importing committed bytes…" });
    try {
      const outcome = await importWorkbook(await fixtureBytes(fixture));
      setWarningLog({
        operation: `Import of ${fixture.file} (${fixture.producer})`,
        warnings: outcome.warnings,
      });
      setRoundTrip(null);
      setSource({
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
        detail: `In the workbench now — ${sheets} sheet${sheets === 1 ? "" : "s"}, ${cells.toLocaleString()} cells, ${outcome.warnings.length} warning${outcome.warnings.length === 1 ? "" : "s"}.`,
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
  };

  const handleHostileRun = async () => {
    setStatus("Feeding hostile packages to the import path…");
    for (const fixture of ADVERSARIAL_FIXTURES) {
      try {
        const report = await expectRejection(await fixtureBytes(fixture));
        setRejections((previous) => ({ ...previous, [fixture.id]: report }));
      } catch (error) {
        setRejections((previous) => ({
          ...previous,
          [fixture.id]: {
            rejected: false,
            errorName: null,
            code: null,
            limit: null,
            message: describeError(error),
          },
        }));
      }
    }
    setStatus("Hostile-input run finished — every package must show a typed rejection.");
  };

  const handleAbortDemo = async () => {
    const rich = POSITIVE_FIXTURES.find((fixture) => fixture.file === "libreoffice-rich.xlsx");
    if (!rich) return;
    setAbortReport(await abortedImport(await fixtureBytes(rich)));
  };

  const handleCellCapDemo = async () => {
    const rich = POSITIVE_FIXTURES.find((fixture) => fixture.file === "libreoffice-rich.xlsx");
    if (!rich) return;
    setCellCapReport(await expectRejection(await fixtureBytes(rich), { maxCells: 8 }));
  };

  const handleCsvExport = () => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      setCsvPreview(csvOfActiveSheet(grid));
      setStatus("Active sheet exported to CSV through the hardened text path.");
    } catch (error) {
      setStatus(`CSV export failed — ${describeError(error)}`);
      throw new Error("Cannot export CSV.", { cause: error });
    }
  };

  const handleCsvDownload = () => {
    const grid = gridRef.current;
    if (!grid) return;
    try {
      downloadBytes(csvOfActiveSheet(grid), "sheetwrite-interoperability.csv", "text/csv");
    } catch (error) {
      setStatus(`CSV download failed — ${describeError(error)}`);
      throw new Error("Cannot download CSV.", { cause: error });
    }
  };

  const handleTsvExport = () => {
    const grid = gridRef.current;
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
  };

  const handlePasteImport = () => {
    setPasteError(null);
    try {
      const imported = importDelimitedText(pasteText);
      setRoundTrip(null);
      setWarningLog(null);
      setFixtureLoad(null);
      setSource({
        kind: "columnar",
        label: `Pasted ${imported.delimiter === "\t" ? "TSV" : "CSV"} (${imported.rows} rows)`,
        columns: imported.columns,
        data: imported.data,
      });
    } catch (error) {
      setPasteError(errorText(error));
      throw new Error("Cannot import the pasted text.", { cause: error });
    }
  };

  const injectionCsvLine = csvPreview?.split(/\r?\n/).find((line) => line.includes("'=HYPERLINK("));
  const spillExamples = roundTrip?.formulaExamples ?? [];
  const spillExamplesStored = spillExamples.filter((example) => example.exported !== null).length;
  const spillExamplesEncoded = spillExamples.filter((example) =>
    example.exported?.includes("_xlfn.ANCHORARRAY("),
  ).length;

  /** Back to the starting workbook, with every report cleared. */
  const resetWorkbench = () => {
    setFileReport(null);
    setBulkReport(null);
    setRoundTrip(null);
    setWarningLog(null);
    setFixtureLoad(null);
    setSource({
      kind: "snapshot",
      label: "Q1 2026 · workplace equipment sales",
      snapshot: createInteropSnapshot(),
    });
  };

  return {
    resetWorkbench,
    source,
    action,
    run,
    hostRef,
    formulaRowRef,
    statusRowRef,
    setSource,
    gridReady,
    status,
    warningLog,
    setWarningLog,
    roundTrip,
    setRoundTrip,
    dragActive,
    setDragActive,
    bulkReport,
    setBulkReport,
    fileReport,
    setFileReport,
    setFixtureLoad,
    modelReadout,
    modelChange,
    handleDownload,
    handleRoundTrip,
    handleModelInput,
    handleFile,
    handleBulkImport,
    spillExamplesStored,
    spillExamplesEncoded,
    digests,
    fixtureLoad,
    handleFixtureLoad,
    csvPreview,
    tsvPreview,
    pasteText,
    setPasteText,
    pasteError,
    handleCsvExport,
    handleCsvDownload,
    handleTsvExport,
    handlePasteImport,
    probe,
    rejections,
    abortReport,
    cellCapReport,
    csvCapReport,
    setCsvCapReport,
    setCsvPreview,
    handleHostileRun,
    handleAbortDemo,
    handleCellCapDemo,
    injectionCsvLine,
  };
}

export type InteroperabilityWorkbench = ReturnType<typeof useInteroperabilityWorkbench>;

export function InteroperabilityShowcase() {
  const workbench = useInteroperabilityWorkbench();
  const { roundTrip } = workbench;

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: InteroperabilitySnippet }}
      controls={<ExchangeControls workbench={workbench} />}
      demo={<ExchangeDemo workbench={workbench} />}
      demoActions={<ExchangeSource workbench={workbench} />}
      demoLabel="Live XLSX and CSV exchange workbook"
      demoTitle="Exchange workbook"
      eyebrow="Spreadsheet interoperability"
      facts={[
        { label: "Source workbooks", value: POSITIVE_FIXTURES.length.toLocaleString("en") },
        { label: "Hostile inputs", value: ADVERSARIAL_FIXTURES.length.toLocaleString("en") },
        {
          label: "Compatibility records",
          value: compatibilityData.records.length.toLocaleString("en"),
        },
      ]}
      guide={{ href: "/docs/import-export/xlsx-export/", label: "Read the XLSX interchange guide" }}
      id="interoperability"
      task="Load a workbook into a live grid, change it, then export it to XLSX, import it again and compare every cell."
      title="Open the workbook. Change it. Bring it back intact."
    >
      {roundTrip && roundTrip.formulaExamples.length > 0 && (
        <ShowcaseSection id="interop-spill" title="Array constants and spill references">
          <SpillProof workbench={workbench} />
        </ShowcaseSection>
      )}
      <InteropLabs workbench={workbench} />
    </ShowcaseLayout>
  );
}

/** The workbook in the grid and whether the grid is ready, in the demo window bar. */
function ExchangeSource({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { source, gridReady } = workbench;
  return (
    <span className="sw-si-source" data-testid="interop-source">
      <span className="sw-si-source__label">{source.label}</span>
      <ShowcaseStatus tone={gridReady ? "ok" : "neutral"}>
        {gridReady ? "Editable" : "Loading"}
      </ShowcaseStatus>
    </span>
  );
}

/** The editable workbook, a drop target for files, and its formula model. */
function ExchangeDemo({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { action, run, hostRef, formulaRowRef, statusRowRef, gridReady, dragActive } = workbench;
  const { setDragActive, handleFile } = workbench;

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a file drop target; the file picker is the keyboard path.
    <section
      aria-label="Live workbook and spreadsheet drop target"
      className="sw-si-workbench"
      data-dragging={dragActive || undefined}
      data-ready={gridReady || undefined}
      data-testid="interop-drop-stage"
      id="xlsx"
      onDragLeave={() => setDragActive(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files[0] ?? null;
        run(() => handleFile(file));
      }}
    >
      <ActionError error={action.error} />
      {/* shell.css sizes .sheetwrite-shell at height:100%, so the definite
          height lives on this owned wrapper. */}
      <div className="sw-si-stage">
        <div className="sheetwrite-shell">
          <div className="sheetwrite-shell-row sheetwrite-shell-formula-row" ref={formulaRowRef} />
          {/* Sheetwrite upgrades this host into a virtualized ARIA grid. */}
          <div
            aria-label="Interoperability workbench grid"
            className="sheetwrite-shell-grid sw-si-grid"
            ref={hostRef}
            role="grid"
          />
          <div className="sheetwrite-shell-row sheetwrite-shell-bottom-row" ref={statusRowRef} />
        </div>
      </div>
      <FormulaModel workbench={workbench} />
    </section>
  );
}

/** The lease and cash-flow model in the workbook: two inputs and its results. */
function FormulaModel({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { modelReadout, modelChange, handleModelInput } = workbench;
  return (
    <details className="sw-si-model" data-testid="interop-model-disclosure">
      <summary>
        <Icon name="chevron-right" />
        Change the lease model's inputs and read its formula results
      </summary>
      <p className="sw-si-model__evidence" data-testid="interop-model-evidence">
        The local engine evaluates the model now; the compatibility results below are the checked
        record from other spreadsheet apps.
      </p>
      <fieldset className="sw-si-model__controls">
        <legend className="sw-visually-hidden">Analytical model inputs</legend>
        <fieldset
          className="sw-si-model__choice"
          data-testid="interop-rate-input"
          disabled={!modelReadout}
        >
          <legend>Base annual rate</legend>
          <div className="sw-si-model__segments">
            {[
              { label: "6.0%", value: 0.06 },
              { label: "9.0%", value: 0.09 },
            ].map((option) => (
              <label key={option.value}>
                <input
                  checked={modelReadout?.selectedRate === option.value}
                  name="interop-base-rate"
                  onChange={(event) =>
                    handleModelInput(1, 3, Number(event.currentTarget.value), "Base annual rate")
                  }
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset
          className="sw-si-model__choice"
          data-testid="interop-spill-input"
          disabled={!modelReadout}
        >
          <legend>Projection rows</legend>
          <div className="sw-si-model__segments">
            {[3, 4, 6].map((periods) => (
              <label key={periods}>
                <input
                  checked={modelReadout?.spill.filter((value) => value !== null).length === periods}
                  name="interop-spill-periods"
                  onChange={(event) =>
                    handleModelInput(4, 1, Number(event.currentTarget.value), "Projection rows")
                  }
                  type="radio"
                  value={periods}
                />
                <span>
                  {periods}
                  <span className="sw-visually-hidden"> rows</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      <dl className="sw-si-model__results" data-testid="interop-model-readout">
        {[
          ["XLOOKUP rate", "interop-model-rate", formatPercent(modelReadout?.selectedRate ?? null)],
          ["PMT / month", "interop-model-payment", formatCurrency(modelReadout?.payment ?? null)],
          ["NPV", "interop-model-npv", formatCurrency(modelReadout?.npv ?? null)],
          ["IRR", "interop-model-irr", formatPercent(modelReadout?.irr ?? null)],
          [
            "STDEV.S",
            "interop-model-statistical",
            formatCurrency(modelReadout?.statistical ?? null),
          ],
          [
            "LET remaining payments",
            "interop-model-let",
            formatCurrency(modelReadout?.letResult ?? null),
          ],
          [
            "Schedule end",
            "interop-model-date",
            formatSerialDate(modelReadout?.scheduleEnd ?? null),
          ],
          [
            "SEQUENCE output",
            "interop-model-spill",
            modelReadout
              ? modelReadout.spill.filter((value) => value !== null).join(", ")
              : "Unavailable",
          ],
        ].map(([label, testId, value]) => (
          <div key={testId}>
            <dt>{label}</dt>
            <dd data-testid={testId}>{value}</dd>
          </div>
        ))}
      </dl>
      <p
        aria-live="polite"
        className="sw-si-model__scope"
        data-change-count={modelChange?.committedCells ?? 0}
        data-changed-results={modelChange?.changedResults.join(",") ?? ""}
        data-testid="interop-model-change-scope"
      >
        {modelChange
          ? `Public change event: ${modelChange.committedCells} input cell at ${modelChange.address}. Changed dependent results: ${
              modelChange.changedResults.join(", ") || "none"
            }.`
          : "Public change event: awaiting an analytical input edit."}
      </p>
    </details>
  );
}

/** The side panel: the round trip and its result, your own file, and the streamed import. */
function ExchangeControls({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const {
    action,
    run,
    gridReady,
    status,
    warningLog,
    roundTrip,
    handleRoundTrip,
    handleDownload,
    handleFile,
    handleBulkImport,
    bulkReport,
    fileReport,
    resetWorkbench,
  } = workbench;

  return (
    <>
      <ShowcaseControlGroup
        title="Round trip"
        description="Export the workbook to XLSX, import the bytes again and compare every cell."
      >
        <DemoButton
          data-testid="interop-roundtrip"
          {...pendingProps(action.pending)}
          disabled={!gridReady || action.pending}
          onClick={() => run(handleRoundTrip)}
          variant="primary"
        >
          <Icon name="refresh" />
          {action.pending ? "Comparing workbook…" : "Export, re-import & compare"}
        </DemoButton>
        <div
          aria-live="polite"
          data-state={roundTrip ? roundTripOutcome(roundTrip) : "ready"}
          data-testid={roundTrip ? "interop-roundtrip-report" : "interop-fidelity-ledger"}
        >
          <ShowcaseReadout
            items={[
              {
                label: "Cells matched",
                value: roundTrip ? (
                  <span data-testid="interop-roundtrip-cells">
                    {roundTrip.cellsMatched}/{roundTrip.cellsCompared}
                  </span>
                ) : (
                  <span data-testid="interop-cells-compared">{NOT_RUN}</span>
                ),
              },
              {
                label: "Formulas preserved",
                value: roundTrip ? (
                  <span data-testid="interop-roundtrip-formulas">
                    {roundTrip.formulasPreserved}/{roundTrip.formulasBefore}
                  </span>
                ) : (
                  NOT_RUN
                ),
              },
              {
                label: "Sheets, merges, frozen rows",
                value: roundTrip
                  ? [
                      roundTrip.sheetsPreserved,
                      roundTrip.mergePreserved,
                      roundTrip.frozenRowsPreserved,
                    ]
                      .map((kept) => (kept ? "kept" : "lost"))
                      .join(" · ")
                  : NOT_RUN,
              },
              {
                label: "Warnings",
                value: warningLog ? warningLog.warnings.length.toLocaleString() : NOT_RUN,
              },
              {
                label: "XLSX size",
                value: roundTrip
                  ? formatBytes(roundTrip.exportedBytes, { kib: 1, mib: 2 })
                  : NOT_RUN,
              },
              {
                label: "Exchange time",
                value: roundTrip ? `${roundTrip.elapsedMs.toFixed(0)} ms` : NOT_RUN,
              },
            ]}
          />
        </div>
        <p aria-live="polite" className="sw-si-status" data-testid="interop-status" role="status">
          {status}
        </p>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Your own file"
        description="Drop an .xlsx or .csv on the workbook, or pick one. Download the current workbook as .xlsx."
      >
        <div className="sw-si-actions">
          <label className="sw-button sw-si-file" data-variant="default">
            <Icon name="upload" />
            {action.pending ? "Importing file…" : "Open .xlsx or .csv"}
            <input
              accept=".xlsx,.csv"
              aria-busy={action.pending || undefined}
              data-testid="interop-file-input"
              disabled={action.pending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                run(() => handleFile(file));
              }}
              type="file"
            />
          </label>
          <DemoButton
            data-testid="interop-download"
            {...pendingProps(action.pending)}
            onClick={() => run(handleDownload)}
          >
            <Icon name="download" />
            {action.pending ? "Exporting XLSX…" : "Download .xlsx"}
          </DemoButton>
          <DemoButton
            data-testid="interop-reset"
            disabled={action.pending}
            onClick={resetWorkbench}
            variant="quiet"
          >
            <Icon name="restore" />
            Reset workbench
          </DemoButton>
        </div>
        {fileReport && (
          <p className="sw-si-report-line" data-testid="interop-file-report" role="status">
            <strong>{fileReport.name}</strong>: {fileReport.sheets}{" "}
            {fileReport.sheets === 1 ? "sheet" : "sheets"} · {fileReport.cells.toLocaleString()}{" "}
            stored cells · {fileReport.formulas} formula sources · {fileReport.warnings} import
            warnings · {fileReport.bytes.toLocaleString()} bytes · {fileReport.ms.toFixed(0)} ms.
          </p>
        )}
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Streamed import"
        description="Generate 200,000 sales records and put them through the CSV importer into typed columns. The time is the CSV parse."
      >
        <DemoButton
          aria-busy={action.pending || undefined}
          data-testid="interop-bulk-import"
          disabled={action.pending}
          onClick={() => run(handleBulkImport)}
        >
          <Icon name="bolt" />
          {action.pending ? "Importing rows…" : "Generate & import 200,000 rows"}
        </DemoButton>
        {bulkReport && (
          <p className="sw-si-report-line" data-testid="interop-bulk-report" role="status">
            <strong>
              {bulkReport.rows.toLocaleString()} rows × {bulkReport.columns} columns
            </strong>{" "}
            · {bulkReport.ms.toFixed(0)} ms CSV parse · {bulkReport.bytes.toLocaleString()} bytes
          </p>
        )}
      </ShowcaseControlGroup>
    </>
  );
}

/** Each array or spill formula before export, inside the exported file, and after import. */
function SpillProof({ workbench }: Readonly<{ workbench: InteroperabilityWorkbench }>) {
  const { roundTrip, spillExamplesStored, spillExamplesEncoded } = workbench;
  if (!roundTrip) return null;
  return (
    <div className="sw-si-source-proof" data-testid="interop-spill-proof">
      <p>
        Excel stores <code>A1#</code> as <code>_xlfn.ANCHORARRAY(A1)</code>. Each row shows the same
        formula as a grid source, as the text inside the exported .xlsx file, and after the file is
        imported again.
      </p>
      <div className="sw-si-tablewrap">
        <table className="sw-si-matrix">
          <thead>
            <tr>
              <th>Cell</th>
              <th>Before export</th>
              <th>In the exported .xlsx</th>
              <th>After import</th>
            </tr>
          </thead>
          <tbody>
            {roundTrip.formulaExamples.map((example) => (
              <tr
                data-exported={example.exported === null ? "missing" : "found"}
                data-matched={example.before === example.after}
                data-spill-encoding={
                  example.exported?.includes("_xlfn.ANCHORARRAY(") ? "anchorarray" : "plain"
                }
                key={`${example.sheet}:${example.row}:${example.col}`}
              >
                <th>
                  {example.sheet} · {cellA1(example.row, example.col)}
                </th>
                <td>
                  <code>{example.before}</code>
                </td>
                <td>
                  <code>{example.exported ?? "Not found in the exported file"}</code>
                </td>
                <td>
                  <code>{example.after ?? "Not preserved"}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sw-si-note" data-testid="interop-spill-file-check">
        Exported-file check: {spillExamplesStored} of {roundTrip.formulaExamples.length} example
        formulas found in the bytes this page just wrote; {spillExamplesEncoded} stored as{" "}
        <code>_xlfn.ANCHORARRAY(...)</code>.
      </p>
    </div>
  );
}
