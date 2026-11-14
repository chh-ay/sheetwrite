// Diagrams for the docs sections that explain how something works: one per
// mechanism, beside the section's text. Every label comes from that section.
import type { JSX } from "solid-js";

import { DocumentOpsFigure } from "./blueprint-figures.js";
import {
  type FigureOutcome,
  type FigureStep,
  FlowFigure,
  PairsFigure,
  TileFigure,
} from "./blueprint-layouts.js";
import type { DiagramText } from "./diagram-kit.js";

/** One step of a flow: a box with a heading, caption lines and code lines. */
export interface FlowStep {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  readonly tone?: string;
}

/** A side outcome of one step, drawn across the row below and reached by its own arrow. */
export interface FlowBranch {
  readonly from: number;
  readonly step: FlowStep;
  readonly arrow?: string;
}

/** A flow box's height: its heading, then 16 units per caption or code line. */
export const stepHeight = (step: FlowStep) =>
  34 + ((step.lines?.length ?? 0) + (step.code?.length ?? 0)) * 16 + 6;

/** The blueprint tone of the older flow box classes. */
function toneOf(tone: string | undefined): FigureStep["tone"] {
  if (tone === "hue-soft") return "accent";
  if (tone === "error-soft") return "danger";
  if (tone === "alt-soft") return "muted";
  return undefined;
}

/** A flow step as a blueprint box. */
export function figureStep(step: FlowStep): FigureStep {
  const tone = toneOf(step.tone);
  return {
    title: step.title,
    ...(step.lines === undefined ? {} : { lines: step.lines }),
    ...(step.code === undefined ? {} : { code: step.code }),
    ...(tone === undefined ? {} : { tone }),
  };
}

/**
 * A left-to-right flow of steps, with an optional outcome of one step across
 * the row below, drawn as a blueprint flow (art/blueprint-layouts.tsx).
 */
export function FlowDiagram(
  props: Readonly<{
    text: DiagramText;
    steps: readonly FlowStep[];
    branch?: FlowBranch;
    note?: string;
  }>,
) {
  const outcome = (branch: FlowBranch): FigureOutcome => ({
    from: branch.from,
    step: figureStep({ tone: "alt-soft", ...branch.step }),
    kind: branch.arrow === "error-line" || branch.step.tone === "error-soft" ? "fail" : "back",
  });
  return (
    <FlowFigure
      note={props.note}
      outcome={props.branch === undefined ? undefined : outcome(props.branch)}
      steps={props.steps.map(figureStep)}
      text={{ title: props.text.title, description: props.text.description }}
    />
  );
}

/** Calculation engine › Spills. */
export function SpillDiagram() {
  return (
    <PairsFigure
      pairs={[
        {
          from: { eyebrow: "The spill", title: "A1", code: ["=SEQUENCE(4)"] },
          to: { title: "A1:A4 show 1, 2, 3, 4", lines: ["A1# is this range"], tone: "accent" },
        },
        {
          from: {
            eyebrow: "A cell is in the way",
            title: "A1",
            code: ["=SEQUENCE(4)"],
            lines: ["A3 holds text"],
          },
          to: { title: "A1 shows #SPILL!", lines: ["No partial result"], tone: "danger" },
        },
      ]}
      text={{
        title: "A spill, and a blocked spill",
        description:
          "A formula that returns an array spills: the formula cell is the anchor, and the result fills the cells below it. A1# refers to the current spill and follows it when it grows or shrinks. Spills are atomic: if any destination cell is not empty, the anchor shows #SPILL! and no partial result appears.",
      }}
    />
  );
}

/** Calculation engine › Paged data and #LOADING!. */
export function LoadingDiagram() {
  return (
    <PairsFigure
      pairs={[
        {
          from: {
            eyebrow: "Before the page loads",
            title: "B1",
            code: ["=SUM(B900:B910)"],
            lines: ["Rows 900–910 not loaded"],
          },
          to: { title: "B1 shows #LOADING!", lines: ["Until the rows arrive"], tone: "muted" },
        },
        {
          from: {
            eyebrow: "The page arrives",
            title: "B1",
            code: ["=SUM(B900:B910)"],
            lines: ["Rows 900–910 loaded"],
          },
          to: { title: "B1 shows 1,250", lines: ["Calculated again"], tone: "accent" },
        },
      ]}
      text={{
        title: "A formula that reads cells not loaded yet",
        description:
          "With a windowed datasource, only some rows are in memory. A formula that reads cells that are not loaded yet shows #LOADING!, and calculates again when they arrive.",
      }}
    />
  );
}

/** Calculation engine › Errors are values. */
export function ErrorFlowDiagram() {
  return (
    <FlowDiagram
      note="An unknown function shows #NAME? and keeps its source."
      steps={[
        { title: "A1", code: ["=1/0", "→ #DIV/0!"], tone: "error-soft" },
        { title: "B1 reads A1", code: ["=A1*2", "→ #DIV/0!"], tone: "error-soft" },
        { title: "C1 replaces it", code: ["=IFERROR(B1,0)", "→ 0"], tone: "hue-soft" },
      ]}
      text={{
        hue: "green",
        alt: "red",
        title: "Errors are values that flow to dependents",
        description:
          "A formula error is a result, not an exception. A1 =1/0 shows #DIV/0!; B1 =A1*2, which reads it, shows #DIV/0! too; C1 =IFERROR(B1,0) replaces the error with 0. An unknown function shows #NAME? and its source stays in the document.",
      }}
    />
  );
}

/** Calculation engine › Volatile functions. */
export function VolatileDiagram() {
  return (
    <FlowDiagram
      note="A transaction without cell changes recalculates nothing."
      steps={[
        { title: "A transaction", lines: ["that changes cells"], tone: "hue-soft" },
        {
          title: "Volatile formulas",
          code: ["NOW · TODAY · RAND", "OFFSET · INDIRECT"],
          lines: ["and their dependents"],
          tone: "alt-soft",
        },
        { title: "Other formulas", lines: ["Only when a cell", "they read changed"] },
      ]}
      text={{
        hue: "violet",
        alt: "amber",
        title: "What a transaction recalculates",
        description:
          "Each transaction that changes cell inputs recalculates the volatile functions, OFFSET, INDIRECT, RAND, RANDBETWEEN, TODAY and NOW, and their dependents. Other formulas recalculate only when a cell they read changes. A transaction without cell changes recalculates nothing.",
      }}
    />
  );
}

const RECOVERY_GROUPS = [
  [
    "Fix the input",
    ["SnapshotValidationError", "DelimitedTextOptionsError", "SyncProtocolError"],
    "error-soft",
  ],
  [
    "Reduce it, or raise the limit",
    ["SnapshotResourceError", "DelimitedTextResourceError", "XlsxResourceError"],
    "alt-soft",
  ],
  ["Load the pages", ["IncompleteDataError"], "hue-soft"],
  ["Drain pending work", ["SyncPendingCapacityError"], "hue-soft"],
  [
    "Read the cause or code",
    ["PersistenceError", "IndexedDbPending", "  CommitStorageError"],
    "panel",
  ],
  ["The grid keeps working", ["renderer-fallback", "worker → canvas"], "panel"],
] as const;

/** Where each group's box starts on small screens, and (last) where the stack ends. */

/** Error handling › Recovery by boundary. */
export function RecoveryDiagram() {
  return (
    <TileFigure
      columns={2}
      text={{
        title: "What each error asks you to do",
        description:
          "Fix the input for SnapshotValidationError, DelimitedTextOptionsError and SyncProtocolError. Reduce the input or raise the named limit for SnapshotResourceError, DelimitedTextResourceError and XlsxResourceError. Load the pages an IncompleteDataError names. Drain pending work after SyncPendingCapacityError. Read the cause or code of PersistenceError and IndexedDbPendingCommitStorageError. A worker failure switches to the canvas renderer and emits renderer-fallback.",
      }}
      tiles={RECOVERY_GROUPS.map(([title, code, tone]) => figureStep({ title, code, tone }))}
    />
  );
}

/** Runtime ownership › Virtualization & scaled scroll. */
export function VirtualScrollDiagram() {
  return (
    <FlowDiagram
      note="OffsetIndex maps a row to its offset and back in O(log n)."
      steps={[
        { title: "Every row", lines: ["Taller than the", "browser's height cap"] },
        { title: "Scroll sizer, capped", lines: ["Measured by a probe,", "again on zoom"] },
        {
          title: "ScaledScroll",
          lines: ["Maps the capped position", "onto every row"],
          tone: "hue-soft",
        },
        {
          title: "The painted window",
          code: ["[start, end)"],
          lines: ["Plus overscan rows", "on each side"],
        },
      ]}
      text={{
        hue: "teal",
        alt: "amber",
        title: "Painting only the rows in view, past the browser's height cap",
        description:
          "Only the rows that intersect the viewport are painted: computeWindow turns the scroll offset and viewport height into a row range, padded by overscan rows on each side. Browsers cap an element's height, so the grid measures the real cap, pins its scroll sizer to it, and ScaledScroll maps the capped scrollbar position linearly onto every row.",
      }}
    />
  );
}

/** Adapter lifecycle › Readiness is generation-scoped. */
export function GenerationsDiagram() {
  const generations = [
    ["Generation 1", 'reason: "initial"', "After mount and WASM init"],
    ["Generation 2", 'reason: "input-reset"', "A reset input changed"],
    ["Generation 3", 'reason: "renderer-reset"', "renderer or workerUrl changed"],
  ] as const;
  return (
    <FlowDiagram
      note="Reattach subscriptions in onReady; never keep a Grid from an earlier generation."
      steps={generations.map(([title, code, line], index) => ({
        title,
        code: ["onReady", code],
        lines: [line],
        tone: index === 0 ? "hue-soft" : "panel",
      }))}
      text={{
        hue: "green",
        alt: "violet",
        title: "Each grid generation gets its own onReady",
        description:
          "onReady receives the grid, a one-based generation that increases whenever the adapter replaces its Grid, and a reason: initial after mount and WASM initialization, input-reset when a reset-classified input changed identity, or renderer-reset when renderer, workerUrl or renderers changed. The exposed handle is set before onReady and cleared when its generation is destroyed.",
      }}
    />
  );
}

/** Adapter lifecycle › Controlled values do not reset the document. */
export function LiveOrResetDiagram() {
  return (
    <TileFigure
      columns={3}
      text={{
        title: "Which props update in place, and which make a new generation",
        description:
          "theme, readOnly, config, overscan and minColumns update the current grid in place, as do callbacks and sizing. Changing the identity of workbook, data, datasource, datasourceStorage, presentation, editors, protectionResolver, mutationPolicy or transactionResourceLimits makes a new generation with reason input-reset; renderer, workerUrl or renderers make one with reason renderer-reset.",
      }}
      tiles={[
        {
          title: "Updated in place",
          code: ["theme", "readOnly", "config", "overscan", "minColumns"],
          tone: "accent",
        },
        {
          title: "New one: input-reset",
          code: ["workbook", "data", "datasource", "presentation", "editors …"],
        },
        { title: "New one: renderer-reset", code: ["renderer", "workerUrl", "renderers"] },
      ]}
    />
  );
}

/** CSV and TSV › Output and injection safety. */
export function CsvInjectionDiagram() {
  return (
    <PairsFigure
      note="A text value that starts with =, +, -, @, a tab or a carriage return gets a leading quote. CSV is UTF-8 with a byte-order mark and CRLF line endings."
      pairs={[
        {
          from: { eyebrow: "Cell, text", title: "=1+1" },
          to: { eyebrow: "In the CSV", title: "'=1+1" },
        },
        {
          from: { eyebrow: "Cell, text", title: "@SUM(A1)" },
          to: { eyebrow: "In the CSV", title: "'@SUM(A1)" },
        },
        {
          from: { eyebrow: "Cell, formula", title: "=1+1" },
          to: { eyebrow: "In the CSV", title: "2" },
        },
      ]}
      text={{
        title: "How CSV export keeps text from running as a formula",
        description:
          "For text values, a leading =, +, -, @, tab or carriage return is prefixed with a single quote, so the text =1+1 exports as '=1+1 and cannot reopen as a formula. A real formula cell exports its resolved value, so =1+1 exports as 2. CSV is UTF-8 with a byte-order mark and CRLF line endings.",
      }}
    />
  );
}

/** Large files and streaming: a seekable file streams into a snapshot; an abort leaves nothing. */
export function StreamingImportDiagram() {
  return (
    <FlowDiagram
      branch={{
        from: 1,
        arrow: "error-line dash",
        step: {
          title: "signal aborts",
          lines: ["Rejects with signal.reason; nothing partial"],
          tone: "error-soft",
        },
      }}
      note="The snapshot holds every imported cell: streaming bounds parsing, not the document."
      steps={[
        {
          title: "File or Blob",
          code: ["fromXlsxWorkbookFile"],
          lines: ["Seekable; not buffered"],
        },
        {
          title: "Each worksheet",
          lines: ["Parsed from bounded", "inflated chunks"],
          tone: "hue-soft",
        },
        { title: "Snapshot cells", lines: ["Built as rows", "stream in"] },
      ]}
      text={{
        hue: "blue",
        alt: "red",
        title: "How a large XLSX file imports",
        description:
          "fromXlsxWorkbookFile reads a seekable File or Blob without buffering it first. Import keeps the ZIP directory and parses each worksheet incrementally from bounded inflated chunks, building snapshot cells as rows stream; the snapshot still holds every imported cell. If the signal aborts, the call rejects with signal.reason and keeps no partial snapshot.",
      }}
    />
  );
}

/** Kept parts and round trips: opaque parts travel as their original bytes, under three conditions. */
export function KeptPartsDiagram() {
  return (
    <FlowDiagram
      note="A shared graph, such as a pivot and its cache, is kept or dropped together."
      steps={[
        {
          title: "Import",
          lines: ["Opaque parts keep their", "compressed ZIP bytes"],
          code: ["workbook.xlsxSource"],
          tone: "hue-soft",
        },
        { title: "Always kept", lines: ["VBA, customXml, theme,", "connections, properties"] },
        {
          title: "If the sheet's shape",
          lines: ["didn't change: images,", "drawings, XML tables"],
        },
        {
          title: "If no cell changed",
          lines: ["Unmodelled charts,", "pivots and caches"],
          tone: "alt-soft",
        },
      ]}
      text={{
        hue: "teal",
        alt: "amber",
        title: "Which parts Sheetwrite keeps on save",
        description:
          "Import stores each opaque part with its original compressed ZIP bytes in snapshot.workbook.xlsxSource, and export writes it back byte for byte. VBA projects, customXml, XML maps, data connections, theme and document properties are always kept. Images, drawings without charts and single-cell XML tables are kept if their sheet's rows and columns didn't change. Charts the chart model can't hold, pivot tables and their caches are kept if no cell, sheet name or defined name changed.",
      }}
    />
  );
}

/** Worker rendering › How it works, and Automatic fallback. */
export function WorkerRenderingDiagram() {
  return (
    <FlowDiagram
      branch={{
        from: 0,
        arrow: "error-line dash",
        step: {
          title: "Construction throws",
          lines: ["CanvasRenderer paints on the main thread"],
          code: ["renderer-fallback, once"],
          tone: "error-soft",
        },
      }}
      note="The canvas moves with transferControlToOffscreen."
      steps={[
        {
          title: "Construct the Worker",
          lines: ["First, before the", "canvas is transferred"],
          tone: "hue-soft",
        },
        { title: "Transfer the canvas", lines: ["Its control moves", "to the worker"] },
        {
          title: "Post each window",
          code: ["VisibleWindowView"],
          lines: ["Layout, theme, viewport"],
        },
        {
          title: "Worker paints",
          lines: ["OffscreenCanvas, off", "the main thread"],
          tone: "alt-soft",
        },
      ]}
      text={{
        hue: "violet",
        alt: "green",
        title: "How worker rendering paints, and when it falls back",
        description:
          "The renderer constructs the Worker first, then transfers control of a canvas to it with transferControlToOffscreen. Layout, theme, viewport and each painted window, a typed-array-backed VisibleWindowView, are posted to the worker, which paints into the OffscreenCanvas off the main thread. If constructing the worker throws, the grid switches to the main-thread CanvasRenderer and emits one renderer-fallback event.",
      }}
    />
  );
}

/** Accessibility › The SR-only mirror: the visible window, mirrored as ARIA rows. */
export function AriaMirrorDiagram() {
  const rows = [
    ["Column headers", "1"],
    ["Data row 40", "42"],
    ["Data row 41", "43"],
    ["Data row 42", "44"],
  ] as const;
  return (
    <PairsFigure
      note="In the mirror, aria-rowindex is the data row plus two."
      pairs={rows.map(([row, index], position) => ({
        from: { ...(position === 0 ? { eyebrow: "Visible window" } : {}), title: row },
        to: {
          ...(position === 0 ? { eyebrow: "div.sheetwrite-aria · rowgroup" } : {}),
          title: "",
          code: [`row · aria-rowindex="${index}"`],
          tone: "accent",
        },
      }))}
      text={{
        title: "The screen-reader mirror of the visible window",
        description:
          "Beside the canvas, the grid keeps a visually hidden div, role rowgroup. It holds a header row with aria-rowindex 1 and one row per visible row, with aria-rowindex set to the true row position plus two. Each cell is a gridcell with an aria-colindex, a stable id and the cell's value as text.",
      }}
    />
  );
}

/** Datasources › Cells that visible formulas read. */
export function FormulaReadsDiagram() {
  return (
    <FlowDiagram
      note="Reads from other sheets aren't loaded this way: return them from the datasource."
      steps={[
        {
          title: "Painted formulas",
          lines: ["In the window, frozen", "bands and overscan"],
          tone: "hue-soft",
        },
        {
          title: "Ask the engine",
          lines: ["Which same-sheet cells", "do they read, also", "through other formulas?"],
        },
        { title: "Load them too", lines: ["With the window, within", "one 32,768-cell budget"] },
        {
          title: "Kept while visible",
          lines: ["Protected from", "clean-cache eviction"],
          tone: "alt-soft",
        },
      ]}
      text={{
        hue: "amber",
        alt: "blue",
        title: "Loading the cells that visible formulas read",
        description:
          "For the formulas it paints, including frozen bands and overscan, the grid asks the engine which same-sheet cells they read, also through other formulas, and requests those cells with the window, within one shared 32,768-cell budget. The painted cells and their dependency closure stay protected from clean-cache eviction while visible. Reads from other sheets are not loaded this way.",
      }}
    />
  );
}

/** Iterative calculation › How a cycle calculates. */
export function IterationDiagram() {
  return (
    <FlowDiagram
      steps={[
        {
          title: "Start",
          lines: ["From the values", "shown; #CYCLE!", "starts at 0"],
          tone: "hue-soft",
        },
        {
          title: "One pass",
          lines: ["Cycle cells in row", "order, each reads", "the newest values"],
        },
        {
          title: "Stop",
          lines: ["Nothing moved more", "than maxChange, or", "maxIterations ran"],
          tone: "alt-soft",
        },
        {
          title: "Then its readers",
          lines: ["Formulas that read", "the cycle calculate", "once, after it settles"],
        },
      ]}
      text={{
        hue: "violet",
        alt: "green",
        title: "How a cycle calculates with iteration on",
        description:
          "Each recalculation starts from the values the cells show now; a cell that showed #CYCLE! starts at 0. The engine calculates the cycle's cells in row order, each reading the newest values, and stops after maxIterations passes or after the first pass in which no value changes by more than maxChange. Formulas that read the cycle calculate once, after it settles.",
      }}
    />
  );
}

/** Conditional formats › Order and precedence. */
export function RulePrecedenceDiagram() {
  const rules = {
    title: "Rule 1, then rule 2",
    code: ["1: color, bold: true", "2: color, italic: true"],
  };
  return (
    <PairsFigure
      pairs={[
        {
          from: { eyebrow: "Both match", ...rules },
          to: { title: "Styles merge", lines: ["Rule 1's color, bold, italic"], tone: "accent" },
        },
        {
          from: { eyebrow: "stopIfTrue on rule 1", ...rules },
          to: { title: "Rule 2 is left out", lines: ["Rule 1's color and bold only"] },
        },
      ]}
      text={{
        title: "How matching rules combine",
        description:
          "Rules are checked in array order. When two rules match a cell, their styles merge, and for a field both set, the earlier rule wins: rule 1 sets color and bold, rule 2 sets another color and italic, so the cell paints rule 1's color, bold and italic. With stopIfTrue on rule 1, later rules are left out, so the cell paints rule 1's color and bold only.",
      }}
    />
  );
}

/** Collaboration › Durable pending commits. */
export function PendingCommitsDiagram() {
  return (
    <FlowDiagram
      branch={{
        from: 3,
        step: {
          title: "Conflicts and failures",
          lines: ["Kept for explicit host recovery"],
          tone: "error-soft",
        },
        arrow: "error-line dash",
      }}
      steps={[
        {
          title: "1 · Persist",
          lines: ["Each commit, before", "it can be sent"],
          tone: "hue-soft",
        },
        { title: "2 · Restore", lines: ["On startup, reapplied", "as remote, not echoed"] },
        { title: "3 · Retry", lines: ["After reconnect or", "reload, same mutation id"] },
        { title: "4 · Remove", lines: ["Only after applied", "or duplicate"], tone: "alt-soft" },
      ]}
      text={{
        hue: "blue",
        alt: "green",
        title: "What durable pending commits do",
        description:
          "With a PendingCommitStorage adapter, SyncCoordinator persists each immutable commit before it can be sent, restores pending commits on startup and reapplies them as remote-source operations so they are not echoed, retries with the original clientMutationId after reconnect or reload, removes durable work only after an applied or duplicate acknowledgement, and keeps conflicts and storage failures for explicit host recovery.",
      }}
    />
  );
}

/** XLSX import › Choose an import contract. */
export function ImportContractsDiagram() {
  return (
    <TileFigure
      columns={3}
      text={{
        title: "The three XLSX import contracts",
        description:
          "fromXlsxWorkbook takes an ArrayBuffer or Uint8Array and returns a WorkbookSnapshot that keeps supported workbook state, with formulas imported as source. fromXlsxWorkbookFile returns the same snapshot from a File or Blob without buffering the compressed file first. fromXlsxTable returns ColumnarData: one rectangular table with first-row headers and resolved values; it is not a workbook round-trip API.",
      }}
      tiles={[
        {
          eyebrow: "Workbook",
          title: "fromXlsxWorkbook",
          lines: ["ArrayBuffer or Uint8Array"],
          code: ["→ WorkbookSnapshot"],
          tone: "accent",
        },
        {
          eyebrow: "Workbook",
          title: "fromXlsxWorkbookFile",
          lines: ["File or Blob, not buffered"],
          code: ["→ WorkbookSnapshot"],
          tone: "accent",
        },
        {
          eyebrow: "Table",
          title: "fromXlsxTable",
          lines: ["One table, resolved values"],
          code: ["→ ColumnarData"],
        },
      ]}
    />
  );
}

/** Data operations › Display views: how the displayed rows are chosen and ordered. */
export function ViewPipelineDiagram() {
  return (
    <FlowDiagram
      note="No cell moves. A view sort is saved with the sheet and exports as sortState."
      steps={[
        { title: "Every row", lines: ["In data order"] },
        {
          title: "Column filters",
          lines: ["All active filters,", "ANDed together"],
          tone: "hue-soft",
        },
        { title: "Minus hidden", lines: ["Hidden rows and", "collapsed groups"] },
        { title: "Sorted", lines: ["By the active", "multi-key sort"], tone: "alt-soft" },
      ]}
      text={{
        hue: "pink",
        alt: "blue",
        title: "How a view picks and orders the displayed rows",
        description:
          "All active column filters are ANDed together, hidden rows and collapsed groups are subtracted, and the remaining rows are sorted by the active multi-key sort. No cell moves: a view sort is saved with the sheet and exports to XLSX as sortState.",
      }}
    />
  );
}

/** Mechanism diagrams by the name a page's `<Picture name="…" />` uses. */
export const MECHANISM_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  spills: SpillDiagram,
  loading: LoadingDiagram,
  "error-flow": ErrorFlowDiagram,
  volatile: VolatileDiagram,
  "document-ops": DocumentOpsFigure,
  recovery: RecoveryDiagram,
  "virtual-scroll": VirtualScrollDiagram,
  generations: GenerationsDiagram,
  "live-or-reset": LiveOrResetDiagram,
  "csv-injection": CsvInjectionDiagram,
  "streaming-import": StreamingImportDiagram,
  "kept-parts": KeptPartsDiagram,
  "worker-rendering": WorkerRenderingDiagram,
  "aria-mirror": AriaMirrorDiagram,
  "formula-reads": FormulaReadsDiagram,
  iteration: IterationDiagram,
  "rule-precedence": RulePrecedenceDiagram,
  "pending-commits": PendingCommitsDiagram,
  "import-contracts": ImportContractsDiagram,
  "view-pipeline": ViewPipelineDiagram,
};
