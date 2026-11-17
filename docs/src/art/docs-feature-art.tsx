// Diagrams for docs pages that show what a feature does rather than a
// mechanism: a handle's methods by task, gestures and what they do, a hook
// lifecycle, the cells a chart reads. Every label comes from the page the
// diagram sits on.
import type { JSX } from "solid-js";

import { FanFigure, FlowFigure, PairsFigure, TileFigure } from "./blueprint-layouts.js";

/** Context menu: what a right-click does before the menu shows. */
export function ContextMenuDiagram() {
  return (
    <FlowFigure
      note="With contextMenu: false, no menu opens: bind contextmenu on the host and call grid.getCellAtPoint."
      steps={[
        { title: "Right-click", lines: ["The browser's own", "menu is prevented"] },
        { title: "Hit-test", lines: ["The cell under the", "pointer is selected"] },
        { title: "Filter the items", code: ["visible", "disabled"] },
        {
          title: "Show the menu",
          lines: ["At the pointer; a click", "runs onClick or action"],
          tone: "accent",
        },
      ]}
      text={{
        title: "What a right-click on a cell does",
        description:
          "On a right-click, Sheetwrite prevents the browser menu, hit-tests the pointer and selects the cell under it. Then it evaluates each item's visible and disabled policy and shows the menu at the pointer; choosing a row runs its onClick, or its built-in action. With contextMenu: false no menu opens, and the host binds the contextmenu event and calls grid.getCellAtPoint.",
      }}
    />
  );
}

/** Editing and clipboard: which clipboard format a paste uses. */
export function PasteFormatsDiagram() {
  return (
    <FlowFigure
      note="Copy and cut always write TSV, and also HTML and the Sheetwrite payload where the browser has ClipboardItem."
      steps={[
        {
          eyebrow: "First",
          title: "Sheetwrite payload",
          lines: ["Formulas and styles,", "from another grid"],
          tone: "accent",
        },
        {
          eyebrow: "Then",
          title: "HTML table",
          lines: ["Sanitized; from Excel", "or Google Sheets"],
        },
        { eyebrow: "Last", title: "TSV text", lines: ["Plain values, one", "row per line"] },
      ]}
      text={{
        title: "Which clipboard format a paste uses",
        description:
          "Paste prefers Sheetwrite's private payload, which keeps formulas and styles. Without it, paste reads a sanitized HTML table, as Excel and Google Sheets write, and last plain TSV. Copy and cut always write injection-hardened TSV, and also sanitized HTML and the private payload where the browser exposes ClipboardItem.",
      }}
    />
  );
}

/** Options and presentation: a DOM cell renderer's hooks over a cell's time in the window. */
export function CellRendererHooksDiagram() {
  return (
    <FlowFigure
      note="A renderer with only dom is created again when the value, style, theme or size changes."
      steps={[
        { title: "dom", lines: ["The cell enters the", "rendered window"], tone: "accent" },
        { title: "update", lines: ["Value, style, theme,", "zoom, size or scroll"] },
        { title: "destroy", lines: ["The cell leaves, or the", "grid resets or ends"] },
      ]}
      text={{
        title: "The hooks of a DOM cell renderer",
        description:
          "dom creates an element when a cell enters the bounded rendered window. update receives the same element after its value, style, theme, zoom, size or scroll geometry changes, so focus and element state survive. destroy runs just before the element leaves the window, is replaced by a newly registered renderer, or its grid is reset or destroyed. A renderer with only dom is recreated when its value, style, theme or size changes.",
      }}
    />
  );
}

/** Resize, merge and fill: dragging the fill handle repeats the source block. */
export function FillDiagram() {
  const source = [
    [0, 0, "10"],
    [1, 0, "30"],
    [0, 1, "20"],
    [1, 1, "40"],
  ] as const;
  return (
    <FlowFigure
      steps={[
        {
          title: "Select A1:B2",
          sheet: {
            cols: 2,
            rows: 4,
            cells: source,
            ranges: [{ from: [0, 0], to: [1, 1], tone: "accent" }],
          },
        },
        {
          title: "Drag the handle to row 4",
          sheet: {
            cols: 2,
            rows: 4,
            cells: [...source, [0, 2, "10"], [1, 2, "30"], [0, 3, "20"], [1, 3, "40"]],
            ranges: [
              { from: [0, 0], to: [1, 1], tone: "accent" },
              { from: [0, 2], to: [1, 3], tone: "muted" },
            ],
          },
          lines: ["The block repeats;", "it is not a series"],
          tone: "accent",
        },
        {
          title: "Formulas shift",
          code: ["=A1 + $B$1", "one column right:", "=B1 + $B$1"],
          lines: ["Relative parts move;", "$ parts stay"],
        },
      ]}
      text={{
        title: "What dragging the fill handle does",
        description:
          "Select A1:B2, holding 10 and 20 in column A and 30 and 40 in column B, and drag the fill handle down through row 4. Rows 3 and 4 repeat the block, 10 and 30, then 20 and 40; it does not become a numeric series. Filled formulas shift their relative references by the fill offset and keep the absolute ones: =A1 + $B$1 filled one column right becomes =B1 + $B$1.",
      }}
    />
  );
}

/** Search: the matches of a search, and stepping the active one. */
export function SearchStepsDiagram() {
  const log = (active: "B2" | "D7") => ({
    cols: 4,
    rows: 7,
    cells: [
      [1, 1, "error"],
      [3, 6, "error"],
    ] as const,
    ranges: [
      { from: [1, 1] as const, to: [1, 1] as const, tone: active === "B2" ? "accent" : "muted" },
      { from: [3, 6] as const, to: [3, 6] as const, tone: active === "D7" ? "accent" : "muted" },
    ] as const,
  });
  return (
    <FlowFigure
      steps={[
        {
          title: 'search("error")',
          sheet: log("B2"),
          lines: ["2 matches; B2 is", "the active one"],
        },
        {
          title: "findNext()",
          sheet: log("D7"),
          lines: ["D7 is active and", "scrolled into view"],
        },
        {
          title: "replaceAll(text)",
          lines: ["Replaces every match", "as an undoable change;", "clearSearch() ends it"],
          tone: "accent",
        },
      ]}
      text={{
        title: "How search steps through matches",
        description:
          'search("error") finds B2 and D7, highlights both and makes B2 the active match. findNext() makes D7 active and scrolls it into view; findPrev() steps back. replaceCurrent and replaceAll replace matches through undoable transactions, and clearSearch() drops the search and its highlights.',
      }}
    />
  );
}

/** Selection: the five shapes a selection takes. */
export function SelectionShapesDiagram() {
  const shape = (
    kind: string,
    title: string,
    ranges: readonly {
      from: readonly [number, number];
      to: readonly [number, number];
      tone: "accent" | "muted";
    }[],
  ) => ({ eyebrow: kind, title, sheet: { cols: 3, rows: 3, cells: [], ranges } });
  return (
    <TileFigure
      columns={5}
      narrowColumns={2}
      tiles={[
        shape("cell", "One cell", [{ from: [1, 1], to: [1, 1], tone: "accent" }]),
        shape("range", "A block", [{ from: [0, 0], to: [1, 1], tone: "accent" }]),
        shape("multi", "Several", [
          { from: [0, 0], to: [0, 1], tone: "muted" },
          { from: [2, 1], to: [2, 2], tone: "accent" },
        ]),
        shape("column", "A column", [{ from: [1, 0], to: [1, 2], tone: "accent" }]),
        shape("row", "A row", [{ from: [0, 1], to: [2, 1], tone: "accent" }]),
      ]}
      text={{
        title: "The five shapes of a selection",
        description:
          "A selection is one cell, a range, a multi selection of several ranges made with Ctrl or Cmd, a whole column, or a whole row. A click on a column letter selects the column; a row is selected only from code, with setSelection.",
      }}
    />
  );
}

/** Status bar: the totals of a selection. */
export function StatusTotalsDiagram() {
  return (
    <FlowFigure
      steps={[
        {
          title: "Select B1:B3",
          sheet: {
            cols: 2,
            rows: 3,
            cells: [
              [1, 0, "12"],
              [1, 1, "4"],
              [1, 2, "8"],
            ],
            ranges: [{ from: [1, 0], to: [1, 2], tone: "accent" }],
          },
        },
        {
          title: "The status bar",
          code: ["Average: 8 · Count: 3", "Sum: 24 · 3 × 1 cells"],
          lines: ["Updates on each", "selection and change"],
          tone: "accent",
        },
      ]}
      text={{
        title: "What the status bar shows for a selection",
        description:
          "With B1:B3 selected, holding 12, 4 and 8, the status bar reads Average: 8 · Count: 3 · Sum: 24 · 3 × 1 cells. It updates on each selection and change event.",
      }}
    />
  );
}

/** Toolbar and ribbon: one command model behind every set of controls. */
export function RibbonCommandsDiagram() {
  return (
    <FanFigure
      source={{
        title: "One command model",
        lines: ["The same commands, glyphs and enabled", "state, read from getCommandState"],
      }}
      text={{
        title: "The toolbar, the ribbons and your own controls share one command model",
        description:
          'The built-in toolbar (config), the full ribbon (config: { ribbon: true }) and the compact ribbon (ribbon: { mode: "compact" }) render one command model: the same commands, glyphs and enabled state. Host chrome reads the same getCommandState contract.',
      }}
      tiles={[
        { title: "Toolbar", code: ["config: {}"] },
        { title: "Full ribbon", code: ["ribbon: true"], tone: "accent" },
        { title: "Compact ribbon", code: ['mode: "compact"'] },
        { title: "Your controls", code: ["getCommandState"], tone: "muted" },
      ]}
    />
  );
}

/** The Grid section: its pages by what the user does. */
export function GridSectionDiagram() {
  return (
    <TileFigure
      columns={4}
      narrowColumns={2}
      text={{
        title: "What the Grid pages cover",
        description:
          "Edit: editing and clipboard, custom editors, resize, merge and fill. Select: selection and keyboard, search, touch. Commands: the toolbar and ribbon, the context menu, the status bar. Set up: options and presentation, and the grid's methods.",
      }}
      tiles={[
        {
          eyebrow: "Edit",
          title: "Change cells",
          lines: ["Editing, clipboard,", "custom editors, fill"],
        },
        { eyebrow: "Select", title: "Move around", lines: ["Selection, keys,", "search, touch"] },
        {
          eyebrow: "Commands",
          title: "Run actions",
          lines: ["Ribbon, toolbar,", "menu, status bar"],
        },
        { eyebrow: "Set up", title: "Configure", lines: ["Options and the", "grid's methods"] },
      ]}
    />
  );
}

/** Fonts and alignment: style fields and what each paints. */
export function FontFieldsDiagram() {
  return (
    <PairsFigure
      pairs={[
        {
          from: { title: "Font", code: ['fontFamily: "Georgia"', "fontSize: 16, bold: true"] },
          to: { title: "A bold 16 px Georgia title", tone: "accent" },
        },
        {
          from: { title: "Alignment", code: ['align: "right"', 'verticalAlign: "top"'] },
          to: { title: "Text at the cell's top right" },
        },
        {
          from: { title: "Wrap", code: ["wrap: true"] },
          to: { title: "Long text wraps onto more lines in the cell" },
        },
      ]}
      text={{
        title: "Font and alignment fields, and what each paints",
        description:
          'fontFamily "Georgia" with fontSize 16 and bold true paints a bold 16 px Georgia title. align "right" with verticalAlign "top" puts the text at the top right of the cell. wrap true wraps long text onto more lines inside the cell.',
      }}
    />
  );
}

/** Number formats: the same value through different format codes. */
export function NumberFormatCodesDiagram() {
  return (
    <PairsFigure
      pairs={[
        {
          from: { title: "1234.5", code: ["#,##0.00"] },
          to: { title: "1,234.50", tone: "accent" },
        },
        {
          from: { title: '1234.5, numberLocale "de-DE"', code: ["#,##0.00"] },
          to: { title: "1.234,50" },
        },
        { from: { title: "0.5", code: ["0%"] }, to: { title: "50%" } },
        { from: { title: "Serial 45351", code: ["yyyy-mm-dd"] }, to: { title: "2024-02-29" } },
      ]}
      text={{
        title: "A value, a format code and the text the grid paints",
        description:
          "1234.5 with #,##0.00 paints 1,234.50, and 1.234,50 in a column with numberLocale de-DE. 0.5 with 0% paints 50%. The date serial 45351 with yyyy-mm-dd paints 2024-02-29.",
      }}
    />
  );
}

/** The Formatting section: what each page sets. */
export function FormattingSectionDiagram() {
  return (
    <TileFigure
      columns={4}
      narrowColumns={2}
      text={{
        title: "What the Formatting pages cover",
        description:
          "Styles: fills, borders and the theme. Fonts and alignment: font, size, emphasis, alignment and wrap. Number formats: Excel format codes and locales. Conditional formats: rules that restyle cells from their values.",
      }}
      tiles={[
        {
          eyebrow: "Styles",
          title: "Fills, borders",
          lines: ["And the theme the", "canvas paints with"],
        },
        { eyebrow: "Fonts", title: "Text", lines: ["Font, size, emphasis,", "alignment and wrap"] },
        { eyebrow: "Numbers", title: "Format codes", code: ["$#,##0.00", "0.0%"] },
        { eyebrow: "Conditional", title: "Rules", lines: ["Restyle cells", "from their values"] },
      ]}
    />
  );
}

/** Charts: the cells the example's line chart reads. */
export function ChartRangesDiagram() {
  return (
    <FlowFigure
      note="The chart keeps no values of its own: edit B3 and the line redraws."
      steps={[
        {
          title: "The Sales sheet",
          sheet: {
            cols: 2,
            rows: 4,
            cells: [
              [0, 0, "Month"],
              [1, 0, "Revenue"],
              [0, 1, "Jan"],
              [1, 1, "120"],
              [0, 2, "Feb"],
              [1, 2, "95"],
              [0, 3, "Mar"],
              [1, 3, "140"],
            ],
            ranges: [
              { from: [0, 1], to: [0, 3], tone: "muted" },
              { from: [1, 1], to: [1, 3], tone: "accent" },
            ],
          },
        },
        {
          title: "setChart",
          code: ['kind: "line"', "categories: A2:A4", "values: B2:B4", "nameRange: B1"],
        },
        {
          title: "A line chart, Revenue",
          lines: ["Jan 120, Feb 95, Mar 140,", "floating over D1"],
          tone: "accent",
        },
      ]}
      text={{
        title: "The cells a line chart reads",
        description:
          "The Sales sheet holds Month and Revenue in A1:B1, and Jan 120, Feb 95 and Mar 140 below. setChart with kind line reads its categories from A2:A4, its values from B2:B4 and its series name from B1, and draws a line chart titled Revenue that floats over the sheet from D1. The chart keeps no values of its own, so an edit to B3 redraws the line.",
      }}
    />
  );
}

/** Pivot tables: the source rows and the output setPivot writes at the anchor. */
export function PivotOutputDiagram() {
  return (
    <FlowFigure
      steps={[
        {
          title: "Source, Orders A1:C5",
          code: [
            "Month    Region    Revenue",
            "2026-01  Americas      120",
            "2026-01  EMEA           80",
            "2026-02  Americas      140",
            "2026-02  EMEA           60",
          ],
        },
        { title: "setPivot", code: ["rows: Month", "columns: Region", "values: SUM(Revenue)"] },
        {
          title: "Output at the anchor",
          code: [
            "Month    Americas  EMEA  Total",
            "2026-01       120    80    200",
            "2026-02       140    60    200",
            "Total         260   140    400",
          ],
          tone: "accent",
        },
      ]}
      text={{
        title: "From source rows to a pivot table",
        description:
          "Four orders: 2026-01 Americas 120, 2026-01 EMEA 80, 2026-02 Americas 140 and 2026-02 EMEA 60. A pivot with Month as rows, Region as columns and the sum of Revenue as values writes, at its anchor: 2026-01 120, 80, total 200; 2026-02 140, 60, total 200; and a total row of 260, 140 and 400.",
      }}
    />
  );
}

/** The Analysis section: cells, the pivots over them and the charts over either. */
export function AnalysisSectionDiagram() {
  return (
    <FlowFigure
      steps={[
        { title: "Cells or a table", lines: ["Your rows, a range", "or a workbook table"] },
        { title: "Pivot table", lines: ["Groups and sums,", "with the full engine"] },
        {
          title: "Chart",
          lines: ["Reads cells or a pivot,", "redraws when they change"],
          tone: "accent",
        },
      ]}
      note="Dashboards put pivots, slicers, charts and KPI cards on one sheet."
      text={{
        title: "How the Analysis features build on each other",
        description:
          "A pivot table groups and sums the rows of a range or a workbook table; the full engine computes it. A chart reads cell ranges, or a pivot, and redraws when they change. Dashboards put pivots, slicers, charts and KPI cards on one sheet.",
      }}
    />
  );
}

/** Validation, protection and notes: what checks a local write. */
export function WriteChecksDiagram() {
  return (
    <FanFigure
      source={{
        title: "A local write",
        lines: ["An edit, paste, fill or clear, or a host transaction"],
      }}
      text={{
        title: "What checks a local write, and what doesn't",
        description:
          "Every local write, whether an edit, paste, fill, clear or host transaction, passes the validation rules of the cells it writes, with the policy reject, warn or allow, and the protection resolver of any protected range it touches, which allows or denies it. Notes don't check writes: setNote sets or removes a cell's plain-text note.",
      }}
      tiles={[
        {
          title: "Validation rule",
          code: ["list, number, date,", "textLength, checkbox"],
          lines: ["reject, warn or allow"],
          tone: "accent",
        },
        {
          title: "Protected range",
          code: ["protectionResolver"],
          lines: ["allow or deny"],
          tone: "accent",
        },
        {
          title: "Note",
          code: ["setNote(addr, text)"],
          lines: ["Plain text; checks", "nothing"],
          tone: "muted",
          unreached: true,
        },
      ]}
    />
  );
}

/** The Data section: what each page does with rows. */
export function DataSectionDiagram() {
  return (
    <TileFigure
      columns={3}
      narrowColumns={2}
      text={{
        title: "What the Data pages cover",
        description:
          "Data operations: sort, filter and views. Datasources: load pages of rows from your source. Host-owned rows: keep rows in your own store. Validation, protection and notes: check and annotate input. Persistence: save documents and versions.",
      }}
      tiles={[
        {
          eyebrow: "Operations",
          title: "Sort and filter",
          lines: ["In place, or the", "view only"],
        },
        {
          eyebrow: "Datasources",
          title: "Load by page",
          lines: ["Rows from your", "source, on demand"],
        },
        { eyebrow: "Host rows", title: "Your store", lines: ["Rows stay in your", "own records"] },
        {
          eyebrow: "Input",
          title: "Check and note",
          lines: ["Validation, protection", "and notes"],
        },
        { eyebrow: "Persistence", title: "Save", lines: ["Documents and", "named versions"] },
      ]}
    />
  );
}

/** Analysis formulas: a GROUPBY formula and what it spills. */
export function GroupBySpillDiagram() {
  return (
    <FlowFigure
      note="With the default engine these functions return #NAME?; they need the full engine."
      steps={[
        { title: "Orders A1:G12", lines: ["Region in column A,", "Revenue in column E"] },
        {
          title: "One formula",
          code: ["=GROUPBY(A1:A12,", "  E1:E12, SUM)"],
        },
        {
          title: "Spills a summary",
          code: ["East     1550", "North    3090", "South    2720", "Total    7360"],
          tone: "accent",
        },
      ]}
      text={{
        title: "A GROUPBY formula spills one row per region",
        description:
          "Over 12 orders in A1:G12, with the region in column A and revenue in column E, =GROUPBY(A1:A12, E1:E12, SUM) spills East 1550, North 3090, South 2720 and a total of 7360. The function needs the full engine; with the default engine it returns #NAME?.",
      }}
    />
  );
}

/** Formula help: what the editors show while a formula is typed. */
export function FormulaHelpPartsDiagram() {
  return (
    <TileFigure
      columns={3}
      narrowColumns={1}
      text={{
        title: "What formula help shows while you type",
        description:
          "While a cell editor or the formula bar holds a formula, the grid shows autocomplete for the function name at the caret, the argument guide with the current argument in bold, live errors underlined in the text, a colour for each reference and its range, and a preview of the result when the formula has no problem.",
      }}
      tiles={[
        { title: "Autocomplete", lines: ["Functions that start", "with the name at the caret"] },
        {
          title: "Argument guide",
          code: ["ROUND(number, digits)"],
          lines: ["The current argument", "in bold"],
          tone: "accent",
        },
        { title: "Live errors", lines: ["Underlined where the", "engine's parser fails"] },
        { title: "Coloured references", lines: ["Each reference and its", "range share a colour"] },
        {
          title: "Result preview",
          code: ["= 0.99"],
          lines: ["When the formula has", "no problem"],
        },
      ]}
    />
  );
}

/** The Formulas section: what its pages cover. */
export function FormulasSectionDiagram() {
  return (
    <TileFigure
      columns={3}
      narrowColumns={2}
      text={{
        title: "What the Formulas pages cover",
        description:
          "Writing formulas and references, with formula help. Dynamic arrays and spills. Lookups, criteria, finance and the analysis functions of the full engine. Custom functions. Recalculation: iterative calculation and volatile functions.",
      }}
      tiles={[
        { eyebrow: "Write", title: "References", lines: ["Point mode, help", "and operators"] },
        { eyebrow: "Arrays", title: "Spills", code: ["=SEQUENCE(3)", "=SUM(A1#)"] },
        {
          eyebrow: "Functions",
          title: "Lookups, analysis",
          lines: ["XLOOKUP, GROUPBY,", "LAMBDA and more"],
        },
        {
          eyebrow: "Extend",
          title: "Your functions",
          lines: ["JavaScript functions", "in formulas"],
        },
        {
          eyebrow: "Recalculate",
          title: "Cycles, volatiles",
          lines: ["Iteration, NOW,", "OFFSET, INDIRECT"],
        },
      ]}
    />
  );
}

/** Grid methods: the handle createGrid returns, its methods grouped by task. */
export function GridHandleDiagram() {
  return (
    <FanFigure
      source={{
        title: "createGrid(host, options) returns a Grid handle",
        lines: ["Its methods, grouped by the task they do"],
      }}
      text={{
        title: "The Grid handle's methods by task",
        description:
          "createGrid returns a Grid handle. Document and sheets: applyTransaction, insertRows, styleRange, undo. Selection, editing and search: setSelection, beginEdit, search, findNext. Views: sortBy, setViewSort, filterBy, hideRows, groupRows. Layout and appearance: setFrozen, setZoom, setColumnWidth, setTheme. Lifecycle: on, refresh, destroy.",
      }}
      tiles={[
        {
          title: "Document",
          code: ["applyTransaction", "insertRows", "styleRange", "undo · redo"],
        },
        { title: "Selection", code: ["setSelection", "beginEdit", "search", "findNext"] },
        {
          title: "Views",
          code: ["sortBy", "setViewSort", "filterBy", "hideRows", "groupRows"],
          tone: "muted",
        },
        {
          title: "Layout and lifecycle",
          code: ["setFrozen", "setZoom", "setColumnWidth", "setTheme", "on · refresh", "destroy"],
        },
      ]}
    />
  );
}

/** Touch: where a touch pointer goes down decides what the gesture does. */
export function TouchGesturesDiagram() {
  return (
    <FanFigure
      source={{
        title: "A touch pointer goes down",
        lines: ["Where it starts decides what the gesture does"],
      }}
      text={{
        title: "What each touch gesture does",
        description:
          "A tap on a cell selects it, and a tap on a column header selects the column. A double-tap on a cell begins editing. A drag that starts on a plain cell scrolls natively: the grid neither captures the pointer nor prevents the default. A drag that starts on the fill handle fills, on a row or column boundary resizes, and on the border of a multi-cell selection extends it; these capture the pointer.",
      }}
      tiles={[
        { title: "Tap", lines: ["Selects the cell;", "on a header, the", "column"] },
        { title: "Double-tap", lines: ["Begins editing", "the cell"] },
        {
          title: "Drag on a cell",
          lines: ["Native scroll:", "no capture, no", "preventDefault"],
          tone: "muted",
        },
        {
          title: "Drag on a handle",
          lines: ["Fill handle: fill", "Boundary: resize", "Border: extend"],
        },
      ]}
    />
  );
}

/** Custom editors: one editor instance per edit, from mount to commit or cancel. */
export function EditorLifecycleDiagram() {
  return (
    <FlowFigure
      outcome={{
        from: 1,
        step: {
          title: "Escape: cancel()",
          lines: [
            "context.signal aborts first; destroy()",
            "runs once, and focus returns to the grid",
          ],
          tone: "muted",
        },
      }}
      note="A commit goes through the stock edit's transaction: validation, undo and events."
      steps={[
        {
          title: "mount(host, context)",
          lines: ["Runs once; the host sits", "over the active cell"],
          tone: "accent",
        },
        {
          title: "update · reposition",
          lines: ["The value, theme or zoom,", "or the cell's box, changed"],
        },
        {
          title: "Enter or Tab: commit()",
          lines: ["Parsed with the column's", "type, then destroy()"],
          tone: "accent",
        },
      ]}
      text={{
        title: "A custom editor from mount to commit or cancel",
        description:
          "mount(host, context) runs once, with the host positioned over the active cell. update(context) and reposition(rect) report a changed value, theme, zoom or cell box without replacing the editor. Enter or Tab calls commit(); the returned value is parsed with the column's type and commits through the same document transaction as stock editing, so validation, protection, undo and change events still apply. Escape cancels: context.signal is aborted before cancel() and destroy(), destroy() runs exactly once, and focus returns to the grid.",
      }}
    />
  );
}

/** Styles: where the theme that paints the canvas comes from, and which layer wins. */
export function ThemeLayersDiagram() {
  return (
    <FlowFigure
      note="setTheme and replaceTheme repaint the grid and emit theme-change."
      steps={[
        { title: "DEFAULT_THEME", lines: ["The built-in values,", "such as rowHeight 28"] },
        {
          title: "CSS custom properties",
          code: ["--sheetwrite-*"],
          lines: ["read by resolveThemeFromCss", "from the host's style"],
        },
        {
          title: "opts.theme · setTheme",
          lines: ["A Partial<Theme> that", "wins last"],
          tone: "accent",
        },
      ]}
      text={{
        title: "Which theme layer wins",
        description:
          "The effective theme is resolved at construction and again on setTheme. DEFAULT_THEME comes first; the --sheetwrite-* CSS custom properties, read from the host's computed style by resolveThemeFromCss, override it; and the theme option or setTheme wins last. setTheme and replaceTheme repaint the grid and emit theme-change.",
      }}
    />
  );
}

/** The AutoFilter page's example: Item and Qty in A1:B5. */
const AUTOFILTER_CELLS = [
  [0, 0, "Item"],
  [1, 0, "Qty"],
  [0, 1, "apple"],
  [1, 1, "3"],
  [0, 2, "fig"],
  [1, 2, "7"],
  [0, 3, "kiwi"],
  [1, 3, "1"],
  [0, 4, "pear"],
  [1, 4, "12"],
] as const;

/** AutoFilter: buttons on the header row, a condition, and the rows below the header it hides. */
export function AutoFilterDiagram() {
  return (
    <FlowFigure
      steps={[
        {
          title: "Ctrl+Shift+L",
          lines: ["A filter button on", "each header cell"],
          sheet: {
            cols: 2,
            rows: 5,
            cells: AUTOFILTER_CELLS,
            ranges: [{ from: [0, 0], to: [1, 0], tone: "accent" }],
          },
        },
        {
          title: "Alt+Down on Qty",
          lines: ["Number Filters ›", "Greater Than… 5"],
          tone: "accent",
        },
        {
          title: "Rows below the header hide",
          lines: ["The rows of 3 and 1 hide;", "the header row stays"],
          sheet: {
            cols: 2,
            rows: 5,
            cells: AUTOFILTER_CELLS,
            ranges: [
              { from: [0, 0], to: [1, 0], tone: "accent" },
              { from: [0, 1], to: [1, 1], tone: "muted" },
              { from: [0, 3], to: [1, 3], tone: "muted" },
            ],
          },
        },
      ]}
      text={{
        title: "How an AutoFilter hides rows",
        description:
          "Item and Qty are in A1:B5. Ctrl+Shift+L puts a filter button on each header cell, Item and Qty. Alt+Down on the Qty header opens its dropdown, and Number Filters › Greater Than… with 5 sets the condition. The rows below the header whose Qty is 3 or 1 hide. The rows of 7 and 12 stay, and the header row always shows.",
      }}
    />
  );
}

/** The Keyboard shortcuts panel: open it, record keys, settle a conflict; the host stores the result. */
export function KeyboardShortcutsDiagram() {
  return (
    <FlowFigure
      steps={[
        {
          title: "File › Options",
          lines: ["Keyboard Shortcuts, or", "the compact ribbon's gear"],
        },
        {
          title: "Press the new keys",
          lines: ["Ctrl+I for Bold;", "Escape stops recording"],
          tone: "accent",
        },
        {
          title: "Ctrl+I is Italic's",
          lines: ["Swap, Replace or Cancel;", "each is one change"],
        },
      ]}
      outcome={{
        from: 2,
        step: {
          title: "key-bindings-change",
          lines: [
            "The host stores the",
            "bindings and passes them back",
            "as config.keyboard.bindings",
          ],
          tone: "muted",
        },
      }}
      text={{
        title: "How a user changes a command's keys",
        description:
          "File › Options › Keyboard Shortcuts, or the gear of the compact ribbon, opens the panel. The user clicks Bold's keys and presses Ctrl+I; Escape would stop recording instead. Ctrl+I belongs to Italic, so the panel offers Swap, Replace or Cancel, and each is one change that applies at once. The grid then emits key-bindings-change, and the host stores the bindings and passes them back as config.keyboard.bindings.",
      }}
    />
  );
}

/** Feature diagrams by the name a placement uses. */
export const FEATURE_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "grid-handle": GridHandleDiagram,
  "touch-gestures": TouchGesturesDiagram,
  "editor-lifecycle": EditorLifecycleDiagram,
  "theme-layers": ThemeLayersDiagram,
  "context-menu": ContextMenuDiagram,
  "paste-formats": PasteFormatsDiagram,
  "cell-renderer-hooks": CellRendererHooksDiagram,
  fill: FillDiagram,
  "search-steps": SearchStepsDiagram,
  "selection-shapes": SelectionShapesDiagram,
  "status-totals": StatusTotalsDiagram,
  "ribbon-commands": RibbonCommandsDiagram,
  "grid-section": GridSectionDiagram,
  "font-fields": FontFieldsDiagram,
  "number-format-codes": NumberFormatCodesDiagram,
  "formatting-section": FormattingSectionDiagram,
  "chart-ranges": ChartRangesDiagram,
  "pivot-output": PivotOutputDiagram,
  "analysis-section": AnalysisSectionDiagram,
  "write-checks": WriteChecksDiagram,
  "data-section": DataSectionDiagram,
  "groupby-spill": GroupBySpillDiagram,
  "formula-help": FormulaHelpPartsDiagram,
  "formulas-section": FormulasSectionDiagram,
  autofilter: AutoFilterDiagram,
  "keyboard-shortcuts": KeyboardShortcutsDiagram,
};
