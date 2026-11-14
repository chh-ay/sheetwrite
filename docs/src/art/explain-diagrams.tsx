// Diagrams for the showcases' "how it works" sections, one per page, each
// beside the section it explains, drawn with the blueprint kit
// (art/blueprint-layouts.tsx). Every label comes from the section's text.
import { FanFigure, FlowFigure, MergeFigure, TileFigure } from "./blueprint-layouts.js";

/** Analysis: the chart reads a range of cells, which the pivot or an edit can change. */
export function ChartReadsCellsDiagram() {
  return (
    <MergeFigure
      sources={[
        { title: "Pivot table", lines: ["Writes its result", "into cells"] },
        { title: "Your edit", lines: ["Change any cell", "in the range"] },
      ]}
      steps={[
        { title: "The chart's range", lines: ["A range of cells"], tone: "accent" },
        { title: "Chart", lines: ["Redraws when", "those cells change"] },
      ]}
      text={{
        title: "The chart reads cells, not the pivot",
        description:
          "The pivot table writes its result into cells. The chart points at a range of cells, so it redraws when those cells change, whether the pivot or your own edit changed them.",
      }}
    />
  );
}

/** Dashboards: one slicer filters every pivot, chart and card that reaches its column. */
export function DashboardDiagram() {
  return (
    <FanFigure
      note="The pivots compute from the Orders table; the slicer's selection is saved and undone."
      source={{
        title: "Slicer: Region",
        lines: ["Filters everything whose table reaches its column"],
      }}
      text={{
        title: "How a dashboard filters together",
        description:
          "A dashboard sheet's pivots compute from the Orders table without writing output cells. One slicer on Region filters every pivot, PivotChart and KPI card whose table reaches its column, and its selection is saved and undone. A KPI card shows a data model measure in the slicers' filter context.",
      }}
      tiles={[
        { title: "Pivot", lines: ["Computes from Orders,", "no output cells"], tone: "accent" },
        { title: "PivotChart", lines: ["Filtered with", "its pivot"], tone: "accent" },
        {
          title: "KPI card",
          lines: ["A measure in the", "slicers' filter context"],
          tone: "accent",
        },
      ]}
    />
  );
}

/** Queries: a refresh loads through the host, runs the steps and writes the table. */
export function QueriesRefreshDiagram() {
  return (
    <FlowFigure
      note="Undo and redo restore the written values with no new source load. With a Power Query codec, XLSX export writes the queries; import reads them back."
      outcome={{
        from: 3,
        kind: "fail",
        step: {
          title: "Blocked",
          lines: ["A refresh that would grow over", "other cells writes nothing"],
          tone: "danger",
        },
      }}
      steps={[
        {
          title: "Your fetchSource",
          lines: ["Your credentials", "and network rules"],
          tone: "muted",
        },
        { title: "Source", lines: ["The CSV feed"] },
        { title: "Steps", lines: ["Large orders keeps", "1,500 or more"], tone: "accent" },
        { title: "Table", lines: ["Written on", "the sheet"] },
      ]}
      text={{
        title: "What a refresh does",
        description:
          "A refresh loads the source only through your fetchSource callback, with your credentials and network rules, runs the saved steps, such as Large orders keeping orders of 1,500 or more, and writes the table. Undo and redo restore the written values without another source load. A refresh that would grow a table over other cells writes nothing.",
      }}
    />
  );
}

/** Sort: sorting the cells moves rows; sorting the view only changes the order shown. */
export function SortModesDiagram() {
  return (
    <TileFigure
      columns={2}
      text={{
        title: "Sorting the cells versus sorting only the view",
        description:
          "Sorting the cells moves values, formulas, styles and notes with their row; a formula that reads its own row keeps reading it, formulas outside the range read the new order, and collaborators receive the sort as one transaction. Sorting only the view leaves the cells in place; the view sort is saved with the sheet and exports to Excel as its sort state.",
      }}
      tiles={[
        {
          title: "Sort the cells",
          lines: [
            "Values, formulas, styles and notes",
            "move with their row; outside",
            "formulas read the new order.",
            "One transaction.",
          ],
          tone: "accent",
        },
        {
          title: "Sort the view only",
          lines: [
            "The cells stay where they are.",
            "Saved with the sheet; exports",
            "to Excel as its sort state.",
          ],
        },
      ]}
    />
  );
}

/** Functions: what runs in both engines, and what runs in the full engine only. */
export function FunctionEnginesDiagram() {
  return (
    <TileFigure
      columns={2}
      note="The full engine contains everything in the default engine."
      text={{
        title: "Where the functions run",
        description:
          "The full engine, @sheetwrite/formulas, contains everything in the default engine, @sheetwrite/wasm. LOOKUP, TRIMRANGE, the information functions and the new math functions run in both. Engineering, financial, the Excel 2007 statistics names, byte text and GETPIVOTDATA run in the full engine only.",
      }}
      tiles={[
        {
          eyebrow: "Both engines",
          title: "@sheetwrite/wasm",
          lines: ["LOOKUP, TRIMRANGE,", "information, new math"],
        },
        {
          eyebrow: "Full engine only",
          title: "@sheetwrite/formulas",
          lines: ["Engineering, financial,", "Excel 2007 statistics,", "byte text, GETPIVOTDATA"],
          tone: "accent",
        },
      ]}
    />
  );
}

/** Version history: committed edits become versions; a restore is one more edit. */
export function VersionsDiagram() {
  return (
    <FlowFigure
      note="A compare loads a small WASM kernel the first time it runs."
      outcome={{
        from: 0,
        kind: "fail",
        step: { title: "Not committed", lines: ["Never reaches a version"], tone: "muted" },
      }}
      steps={[
        { title: "Committed edits", lines: ["Each with", "its author"] },
        { title: "Authority", lines: ["Journals each change", "in the archive"], tone: "accent" },
        { title: "Chunks", lines: ["Content-addressed;", "unchanged cells shared"] },
        { title: "Restore", lines: ["One undoable change,", "one synced transaction"] },
      ]}
      text={{
        title: "How versions are kept",
        description:
          "The document authority journals each committed change in the archive with its author; edits that are not committed never reach a version. Versions are stored in content-addressed chunks, so unchanged cells are shared between versions. A restore is one undoable change and one synced transaction, so a collaborator's client receives it like any other edit.",
      }}
    />
  );
}

/** Formulas: either engine package, selected once, then the grid calculates with it. */
export function EngineApiDiagram() {
  return (
    <MergeFigure
      sources={[
        { title: "@sheetwrite/wasm", lines: ["The default engine"] },
        { title: "@sheetwrite/formulas", lines: ["Same engine, full set"] },
      ]}
      steps={[
        {
          title: "Select",
          code: ["initSheetwrite({ engine })"],
          lines: ["Once, before the first grid"],
          tone: "accent",
        },
        {
          title: "Create the grid",
          code: ["createGrid(host, { workbook })"],
          lines: ["Calculates with that engine"],
        },
      ]}
      text={{
        title: "Two engines, one API",
        description:
          "@sheetwrite/wasm is the default engine; @sheetwrite/formulas is the same engine with the full function set. Pass one to initSheetwrite once, before you create a grid; the grid then calculates with it.",
      }}
    />
  );
}

/** Browser database: what IndexedDB keeps, and what comes back on reopen. */
export function StorageDiagram() {
  return (
    <MergeFigure
      note="Crossing either bound of the operation tail folds it into one compacted snapshot record."
      sources={[
        { eyebrow: "IndexedDB", title: "Snapshot", lines: ["Compacted state"] },
        { title: "Operation tail", lines: ["Capped by records", "and bytes"] },
        { title: "Pending queue", lines: ["Unacknowledged", "commits, durable"] },
      ]}
      steps={[
        {
          title: "Reopen or reload",
          lines: ["Committed state and the", "pending queue come back", "exactly once"],
          tone: "accent",
        },
      ]}
      text={{
        title: "What the browser database keeps",
        description:
          "IndexedDB holds a snapshot record and an operation tail capped by record count and bytes; crossing either bound folds the tail into one compacted snapshot record. Unacknowledged local commits wait in a durable pending queue. Closing and reopening the session brings back committed state and the pending queue exactly once.",
      }}
    />
  );
}

/** Host-owned rows: the insert is one commit; the values follow in bounded batches. */
export function HostImportDiagram() {
  return (
    <FlowFigure
      note="One Grid transaction accepts a bounded number of operations."
      steps={[
        { title: "Insert 10,000 rows", lines: ["One commit"], tone: "accent" },
        { title: "50,000 values", lines: ["In batches of", "1,800 rows"] },
        { title: "Six batches", lines: ["Five of 1,800 rows,", "then 1,000"] },
      ]}
      text={{
        title: "How the 10,000-row import loads",
        description:
          "Inserting the 10,000 rows is one commit. Their 50,000 cell values then load in batches of 1,800 rows, because one Grid transaction accepts a bounded number of operations.",
      }}
    />
  );
}

/** Formatting: fonts that fall back, and number formats that change only what is shown. */
export function FormattingDiagram() {
  return (
    <TileFigure
      columns={2}
      note="A number format changes the display, not the stored number."
      text={{
        title: "How fonts and number formats behave",
        description:
          "Georgia, Arial and Courier New sit beside the theme font, and a family the browser does not have falls back to it. A number format changes how a number is shown, not the stored number: a currency column shows its format, a cell can opt out with General, and a negative variance keeps its minus sign as well as its conditional fill.",
      }}
      tiles={[
        {
          title: "Fonts",
          lines: [
            "Georgia, Arial and Courier New",
            "beside the theme font; a family",
            "the browser lacks falls back to it",
          ],
        },
        {
          title: "Number formats",
          code: ["stored: 1234.5"],
          lines: ["Currency column: $1,234.50", "G3, General: 1234.5", "Negative variance: -42.00"],
          tone: "accent",
        },
      ]}
    />
  );
}
