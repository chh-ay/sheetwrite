// Diagrams for the framework pages, the tutorials and the upgrade guides: who
// owns the grid in each framework, the path a workbook takes in each tutorial,
// and which old APIs map to which new ones. Every label comes from the page the
// diagram sits on.
import type { JSX } from "solid-js";

import {
  ExchangeFigure,
  FanFigure,
  type FigureStep,
  FlowFigure,
  PairsFigure,
} from "./blueprint-layouts.js";
import type { BlueprintText } from "./blueprint.js";

/** One framework's adapter: what the app passes in and what comes back out. */
interface Adapter {
  /** The diagram's accessible title. */
  readonly title: string;
  readonly app: FigureStep;
  readonly component: FigureStep;
  /** Labels of the arrows between the app and the component, and the component and the grid. */
  readonly props: string;
  readonly events: string;
  readonly creates: string;
  readonly access: string;
  readonly note: string;
}

/** The adapter's Grid: created on the client after the engine loads. */
const GRID: FigureStep = {
  title: "Grid",
  lines: ["Created on the client,", "after WASM loads"],
  tone: "accent",
};

/** App, adapter component and Grid in a row: inputs go right, events and the grid handle come back. */
function AdapterDiagram(props: Readonly<{ adapter: Adapter; description: string }>) {
  return (
    <ExchangeFigure
      links={[
        { forward: props.adapter.props, back: props.adapter.events },
        { forward: props.adapter.creates, back: props.adapter.access },
      ]}
      note={props.adapter.note}
      steps={[props.adapter.app, props.adapter.component, GRID]}
      text={{ title: props.adapter.title, description: props.description }}
    />
  );
}

export function ReactAdapterDiagram() {
  return (
    <AdapterDiagram
      adapter={{
        title: "Who owns what with the React adapter",
        app: { title: "Your component", lines: ["Owns columns, rows", "and saving"] },
        component: { title: "<Sheetwrite>", code: ["columns", "defaultRows", "height"] },
        props: "props",
        events: "onGridChange",
        creates: "creates",
        access: "ref · onReady",
        note: "A reset makes a new Grid generation: attach coordinators again in onReady.",
      }}
      description="Your React component passes columns, defaultRows and height to <Sheetwrite>, which creates the Grid on the client after WASM loads. Committed changes come back through onGridChange, and the Grid through the forwarded ref and onReady, which receives { grid, generation, reason }. Replacing a reset-sensitive input creates a new Grid generation, so destroy the coordinators attached to the old Grid and attach new ones in onReady."
    />
  );
}

export function VueAdapterDiagram() {
  return (
    <AdapterDiagram
      adapter={{
        title: "Who owns what with the Vue adapter",
        app: { title: "Your component", lines: ["Owns columns, rows", "and saving"] },
        component: { title: "<Sheetwrite>", code: [":columns", ":default-rows", ":height"] },
        props: "props",
        events: "@grid-change",
        creates: "creates",
        access: "grid · @ready",
        note: "A reset clears the exposed grid, then publishes the new generation.",
      }}
      description="Your Vue component binds :columns, :default-rows and :height on <Sheetwrite>, which creates the Grid on the client after WASM loads. Committed changes come back as @grid-change; the component exposes grid before it emits @ready. A reset clears the old exposed handle, creates a new generation and then publishes the replacement."
    />
  );
}

export function SvelteAdapterDiagram() {
  return (
    <AdapterDiagram
      adapter={{
        title: "Who owns what with the Svelte adapter",
        app: { title: "Your component", lines: ["Owns columns, rows", "and saving"] },
        component: { title: "<Sheetwrite>", code: ["{columns}", "defaultRows", "height"] },
        props: "props",
        events: "onGridChange",
        creates: "creates",
        access: "bind:grid · onReady",
        note: "The binding clears before a reset or unmount; attach coordinators again.",
      }}
      description="Your Svelte component passes columns, defaultRows and height to <Sheetwrite>, which creates the Grid in the browser after WASM loads. Committed changes come back through onGridChange; bind:grid is set before onReady runs. The binding is cleared before a reset or unmount, and a reset publishes a new generation, so destroy the coordinators attached to the old Grid and create new ones."
    />
  );
}

export function VanillaLifecycleDiagram() {
  return (
    <AdapterDiagram
      adapter={{
        title: "Who owns what without an adapter",
        app: { title: "Your code", lines: ["Owns the host element", "and the Grid's lifetime"] },
        component: {
          title: "initSheetwrite()",
          code: ["then createGrid(", "  host,", "  { workbook, data })"],
        },
        props: "await",
        events: "the Grid",
        creates: "creates",
        access: 'grid.on("change")',
        note: "Cleanup is yours: remove the listener, then call grid.destroy().",
      }}
      description={`Without an adapter your code owns the host element and the Grid's lifetime. It awaits initSheetwrite() on the client, calls createGrid(host, { workbook, data }) and keeps the returned Grid. grid.on("change", …) reports committed changes and returns a function that removes the listener; cleanup removes the listener and then calls grid.destroy().`}
    />
  );
}

/** One tutorial's path from an XLSX file to a downloaded workbook. */
function TutorialFlow(
  props: Readonly<{ host: FigureStep; framework: string; description: string }>,
) {
  return (
    <FlowFigure
      note="The first sheet's first row becomes the column keys; formulas and formatting aren't kept."
      steps={[
        { title: "An .xlsx file", code: ["fromXlsxTable(", "  bytes, options)"] },
        { ...props.host, tone: "accent" },
        { title: "Save", code: ["toXlsxWorkbook(", "  grid)", "downloadBytes(…)"] },
      ]}
      text={{
        title: `From an XLSX file to a downloaded workbook in ${props.framework}`,
        description: props.description,
      }}
    />
  );
}

const TUTORIAL_DESCRIPTION = (host: string) =>
  `fromXlsxTable reads the first sheet of the chosen .xlsx file; its first row supplies the column keys, and formula source and formatting are not kept. ${host} toXlsxWorkbook saves the current Grid as a workbook, not only its visible viewport, and downloadBytes downloads it.`;

export function JavaScriptTutorialDiagram() {
  return (
    <TutorialFlow
      description={TUTORIAL_DESCRIPTION(
        "Your code destroys the old Grid and creates a new one with createGrid on the imported data, then the user edits it.",
      )}
      framework="JavaScript"
      host={{
        title: "Edit in a Grid",
        code: ["grid.destroy()", "createGrid(host,", "  { workbook, data })"],
      }}
    />
  );
}

export function ReactTutorialDiagram() {
  return (
    <TutorialFlow
      description={TUTORIAL_DESCRIPTION(
        "The imported workbook and data go to <SheetwriteGrid> together, which creates a new Grid generation published by onReady; the user edits it.",
      )}
      framework="React"
      host={{
        title: "Edit in React",
        code: ["<SheetwriteGrid", "  {...input}", "  onReady={…} />"],
      }}
    />
  );
}

export function VueTutorialDiagram() {
  return (
    <TutorialFlow
      description={TUTORIAL_DESCRIPTION(
        "The imported workbook and data go to <SheetwriteGrid> together, which creates a new Grid generation published by @ready; the user edits it.",
      )}
      framework="Vue"
      host={{ title: "Edit in Vue", code: ["<SheetwriteGrid", "  :workbook :data", "  @ready />"] }}
    />
  );
}

export function SvelteTutorialDiagram() {
  return (
    <TutorialFlow
      description={TUTORIAL_DESCRIPTION(
        "The imported workbook and data go to <SheetwriteGrid> together, which creates a new Grid generation; bind:grid and onReady publish it, and the user edits it.",
      )}
      framework="Svelte"
      host={{
        title: "Edit in Svelte",
        code: ["<SheetwriteGrid", "  bind:grid={…}", "  onReady={…} />"],
      }}
    />
  );
}

export function NodeTutorialDiagram() {
  return (
    <FlowFigure
      note="No Grid, no formula engine and no DOM: formula source is kept, not recalculated."
      steps={[
        { title: "Input file", code: ["readFile(input)"], lines: ["Size checked first"] },
        { title: "Snapshot", code: ["fromXlsxWorkbook(", "  bytes, options)"], tone: "accent" },
        { title: "Output file", code: ["toXlsxWorkbook(…)", 'writeFile(out, { flag: "wx" })'] },
      ]}
      text={{
        title: "From XLSX bytes to a snapshot and back to a file in Node.js",
        description:
          "The command checks the input's size, reads its bytes with readFile and turns them into a WorkbookSnapshot with fromXlsxWorkbook. toXlsxWorkbook writes the snapshot back to bytes, and writeFile with flag \"wx\" refuses to overwrite an existing output. The codec doesn't create a Grid, start a formula engine or touch the DOM; formula source is kept where supported, not recalculated.",
      }}
    />
  );
}

export function ShellTutorialDiagram() {
  return (
    <FanFigure
      source={{
        title: "createSpreadsheetShell(host, { grid, ribbon })",
        lines: ["One shell owns one Grid and its chrome;", "shell.destroy() removes them all"],
      }}
      text={{
        title: "What the spreadsheet shell owns",
        description:
          "createSpreadsheetShell mounts one Grid with its chrome: the ribbon (Home, Insert, Data and View, compact below 768 px with mode auto), the name box and formula bar, the grid, and the sheet tabs and selection status. The XLSX file buttons stay host-owned. shell.destroy() destroys the Grid and its chrome and is safe to call twice.",
      }}
      tiles={[
        {
          title: "Ribbon",
          lines: ["Home, Insert, Data,", "View; compact below", "768 px in auto mode"],
        },
        { title: "Formula row", lines: ["Name box and", "formula bar"] },
        { title: "Grid", lines: ["The one Grid,", "shell.grid"], tone: "muted" },
        { title: "Bottom row", lines: ["Sheet tabs and", "selection status"] },
      ]}
    />
  );
}

/** One API change: the old call and what replaces it. */
type ApiChange = readonly [before: string, after: string];

/** Old calls on the left, their replacements on the right. */
function MigrationDiagram(props: Readonly<{ text: BlueprintText; changes: readonly ApiChange[] }>) {
  return (
    <PairsFigure
      pairs={props.changes.map(([before, after], index) => ({
        from: {
          ...(index === 0 ? { eyebrow: "Before" } : {}),
          title: "",
          code: before.split("\n"),
        },
        to: {
          ...(index === 0 ? { eyebrow: "After" } : {}),
          title: "",
          code: after.split("\n"),
          tone: "accent",
        },
      }))}
      text={props.text}
    />
  );
}

export function Upgrade070Diagram() {
  return (
    <MigrationDiagram
      changes={[
        ["grid.setSort(keys)", "grid.setViewSort(keys)"],
        ["grid.sortBy(col) sorted the view", "grid.sortBy(col) sorts the cells"],
        ["new RevisionCoordinator(…)", "HistoryArchive.open(\n  { documentId, storage })"],
        ['import "@sheetwrite/xlsx/register"', "initSheetwrite({ addons: [xlsxAddon()] })"],
        ["initSheetwrite(source, engine)", "initSheetwrite({ source, engine })"],
      ]}
      text={{
        title: "The main API changes in 0.7.0",
        description:
          "grid.setSort and sortByMulti are removed: use grid.setViewSort. grid.sortBy used to sort the view and now sorts the cells in place. RevisionCoordinator is replaced by HistoryArchive.open({ documentId, storage }). Register add-ons with initSheetwrite({ addons: [xlsxAddon()] }) instead of importing @sheetwrite/xlsx/register, and pass initSheetwrite one options object, { source, engine }.",
      }}
    />
  );
}

export function Upgrade060Diagram() {
  return (
    <FanFigure
      source={{
        title: "Before you upgrade to 0.6.0, review",
        lines: ["Update every Sheetwrite package to the same release first"],
      }}
      text={{
        title: "What to review when upgrading to 0.6.0",
        description:
          "Update every Sheetwrite package together, then review four areas. Formula results: volatile functions recalculate with their dependents, OFFSET and INDIRECT return references, and intersection, union and 3-D references calculate. Document consumers: the setCalculation operation and workbook.xlsxSource. Imported appearance: bottom vertical alignment and OOXML column widths. UI additions are opt-in.",
      }}
      tiles={[
        {
          title: "Formula results",
          lines: ["Volatile recalculation,", "OFFSET, INDIRECT,", "reference operators"],
          tone: "muted",
        },
        { title: "Documents", code: ["setCalculation", "xlsxSource"] },
        { title: "Imported looks", lines: ["Bottom alignment,", "OOXML widths"] },
        { title: "UI additions", lines: ["Opt in when", "you want them"] },
      ]}
    />
  );
}

/** Guide diagrams by the name a placement uses. */
export const GUIDE_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "react-adapter": ReactAdapterDiagram,
  "vue-adapter": VueAdapterDiagram,
  "svelte-adapter": SvelteAdapterDiagram,
  "vanilla-lifecycle": VanillaLifecycleDiagram,
  "tutorial-javascript": JavaScriptTutorialDiagram,
  "tutorial-react": ReactTutorialDiagram,
  "tutorial-vue": VueTutorialDiagram,
  "tutorial-svelte": SvelteTutorialDiagram,
  "tutorial-nodejs": NodeTutorialDiagram,
  "tutorial-shell": ShellTutorialDiagram,
  "upgrade-0-7-0": Upgrade070Diagram,
  "upgrade-0-6-0": Upgrade060Diagram,
};
