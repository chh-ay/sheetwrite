// Diagrams for the formula pages: small sheets that show which cells a
// formula reads, and flows for how formulas are registered and recalculated.
// Every label, value and result comes from the page the diagram sits on.
import type { JSX } from "solid-js";

import { FanFigure, FlowFigure, TileFigure } from "./blueprint-layouts.js";
import type { BlueprintText } from "./blueprint.js";

/** A cell's text: column and row from 0, as the sheet's letters and numbers count them. */
type CellText = readonly [col: number, row: number, text: string];

/** A tinted block of cells, inclusive. */
interface CellRange {
  readonly from: readonly [col: number, row: number];
  readonly to: readonly [col: number, row: number];
  readonly tone: "accent" | "muted" | "danger";
}

/** One small sheet: its heading, the formula, the cells and what the formula reads. */
interface CellsPicture {
  readonly title: string;
  readonly formula: string;
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly CellText[];
  readonly ranges: readonly CellRange[];
  readonly notes: readonly string[];
}

/** Small sheets side by side on wide screens, stacked on small ones. */
function CellsDiagram(props: Readonly<{ text: BlueprintText; pictures: readonly CellsPicture[] }>) {
  return (
    <TileFigure
      columns={props.pictures.length}
      text={props.text}
      tiles={props.pictures.map((picture) => ({
        title: picture.title,
        code: [picture.formula],
        lines: picture.notes,
        sheet: {
          cols: picture.cols,
          rows: picture.rows,
          cells: picture.cells,
          ranges: picture.ranges,
        },
      }))}
    />
  );
}

/** OFFSET and INDIRECT: the target each picks at calculation time. */
export function DynamicReferencesDiagram() {
  return (
    <CellsDiagram
      pictures={[
        {
          title: "OFFSET moves from a base",
          formula: "C1 =SUM(OFFSET(A1,0,1,3,1))",
          cols: 3,
          rows: 3,
          cells: [
            [0, 0, "1"],
            [0, 1, "2"],
            [0, 2, "3"],
            [1, 0, "10"],
            [1, 1, "20"],
            [1, 2, "30"],
            [2, 0, "60"],
          ],
          ranges: [
            { from: [0, 0], to: [0, 0], tone: "muted" },
            { from: [1, 0], to: [1, 2], tone: "accent" },
          ],
          notes: [
            "From A1: 0 rows down, 1 column right,",
            "3 tall and 1 wide: B1:B3, which sum to 60.",
          ],
        },
        {
          title: "INDIRECT reads reference text",
          formula: 'C1 =INDIRECT("B"&A2)',
          cols: 3,
          rows: 3,
          cells: [
            [0, 0, "1"],
            [0, 1, "2"],
            [0, 2, "3"],
            [1, 0, "10"],
            [1, 1, "20"],
            [1, 2, "30"],
            [2, 0, "20"],
          ],
          ranges: [
            { from: [0, 1], to: [0, 1], tone: "muted" },
            { from: [1, 1], to: [1, 1], tone: "accent" },
          ],
          notes: [
            '"B"&A2 is the text "B2", so C1 reads B2.',
            "Inserted rows never rewrite that text.",
          ],
        },
      ]}
      text={{
        title: "The targets OFFSET and INDIRECT choose",
        description:
          'Column A holds 1, 2 and 3, column B 10, 20 and 30. =SUM(OFFSET(A1,0,1,3,1)) starts at A1, moves 0 rows and 1 column, and takes 3 rows by 1 column: B1:B3, which sum to 60. =INDIRECT("B"&A2) builds the text B2 from A2 and reads B2, 20. Fill, copy and structural edits rewrite OFFSET\'s reference argument but never the text inside INDIRECT.',
      }}
    />
  );
}

/** Operators: what intersection, union and a 3-D span read. */
export function ReferenceOperatorsDiagram() {
  return (
    <CellsDiagram
      pictures={[
        {
          title: "Intersection: a space",
          formula: "=SUM(A1:C3 B2:D4)",
          cols: 4,
          rows: 4,
          cells: [],
          ranges: [
            { from: [0, 0], to: [2, 2], tone: "muted" },
            { from: [1, 1], to: [3, 3], tone: "muted" },
            { from: [1, 1], to: [2, 2], tone: "accent" },
          ],
          notes: ["Adds the shared cells, B2:C3.", "No shared cells: #NULL!"],
        },
        {
          title: "Union: a comma in ( )",
          formula: "=SUM((A1:A2,C1:C2))",
          cols: 4,
          rows: 4,
          cells: [],
          ranges: [
            { from: [0, 0], to: [0, 1], tone: "accent" },
            { from: [2, 0], to: [2, 1], tone: "accent" },
          ],
          notes: ["Adds both ranges.", "A comma between arguments isn't one."],
        },
        {
          title: "3-D: a span of sheets",
          formula: "=SUM(Jan:Mar!B2)",
          cols: 4,
          rows: 4,
          cells: [[1, 1, "×3"]],
          ranges: [{ from: [1, 1], to: [1, 1], tone: "accent" }],
          notes: ["B2 on Jan, Feb and Mar,", "in tab order."],
        },
      ]}
      text={{
        title: "What intersection, union and 3-D references read",
        description:
          "A space between two references intersects them: =SUM(A1:C3 B2:D4) adds the shared cells B2:C3, and references with no shared cells return #NULL!. A comma inside parentheses that are not a function call is a union: =SUM((A1:A2,C1:C2)) adds both ranges. A 3-D reference reads the same cell on a span of sheets: =SUM(Jan:Mar!B2) adds B2 on every sheet from Jan to Mar in tab order.",
      }}
    />
  );
}

/** Lookup, criteria and financial: which rows a SUMIFS adds. */
export function CriteriaRowsDiagram() {
  return (
    <CellsDiagram
      pictures={[
        {
          title: "Criteria pick rows; the sum range adds them",
          formula: '=SUMIFS(C1:C4, A1:A4, "East", B1:B4, ">10")',
          cols: 3,
          rows: 4,
          cells: [
            [0, 0, "East"],
            [0, 1, "West"],
            [0, 2, "East"],
            [0, 3, "East"],
            [1, 0, "12"],
            [1, 1, "40"],
            [1, 2, "8"],
            [1, 3, "30"],
            [2, 0, "100"],
            [2, 1, "200"],
            [2, 2, "300"],
            [2, 3, "400"],
          ],
          ranges: [
            { from: [0, 0], to: [2, 0], tone: "accent" },
            { from: [0, 3], to: [2, 3], tone: "accent" },
          ],
          notes: [
            "Rows 1 and 4 meet both criteria, so the result is 500.",
            "Every range has the same shape; a different shape is #VALUE!",
          ],
        },
      ]}
      text={{
        title: "Which rows a SUMIFS adds",
        description:
          '=SUMIFS(C1:C4, A1:A4, "East", B1:B4, ">10") checks each row against every criteria pair. Rows 1 (East, 12) and 4 (East, 30) meet both, so it adds C1 and C4: 100 + 400 = 500. Row 2 is West and row 3 has 8, so they are skipped. The criteria ranges and the sum range have the same shape.',
      }}
    />
  );
}

/** Authoring and references: how fill rewrites relative and absolute references. */
export function ReferenceRewriteDiagram() {
  return (
    <CellsDiagram
      pictures={[
        {
          title: "Relative: moves with the formula",
          formula: "B1 =A1*2, filled down to B3",
          cols: 2,
          rows: 3,
          cells: [
            [0, 0, "1"],
            [0, 1, "2"],
            [0, 2, "3"],
            [1, 0, "=A1*2"],
            [1, 1, "=A2*2"],
            [1, 2, "=A3*2"],
          ],
          ranges: [
            { from: [0, 0], to: [0, 2], tone: "muted" },
            { from: [1, 0], to: [1, 2], tone: "accent" },
          ],
          notes: ["Each copy reads the row it sits on."],
        },
        {
          title: "Absolute: stays on its cell",
          formula: "B1 =A1*$D$1, filled down to B3",
          cols: 4,
          rows: 3,
          cells: [
            [0, 0, "1"],
            [0, 1, "2"],
            [0, 2, "3"],
            [1, 0, "10"],
            [1, 1, "20"],
            [1, 2, "30"],
            [3, 0, "10"],
          ],
          ranges: [
            { from: [1, 0], to: [1, 2], tone: "accent" },
            { from: [3, 0], to: [3, 0], tone: "muted" },
          ],
          notes: ["$D$1 stays $D$1 in every copy, while", "A1 becomes A2, then A3: 10, 20, 30."],
        },
      ]}
      text={{
        title: "How fill rewrites relative and absolute references",
        description:
          "B1 holds =A1*2. Filled down to B3, the relative reference moves with each copy: =A2*2 and =A3*2, so each reads its own row. With =A1*$D$1 and 10 in D1, the dollar signs keep $D$1 on the same cell in every copy, while A1 becomes A2 and then A3, giving 10, 20 and 30.",
      }}
    />
  );
}

/** Custom functions: from registration to a cell and to formula help. */
export function CustomFunctionsDiagram() {
  return (
    <FanFigure
      source={{
        title: "functionsAddon([...]) or a grid's addons.functions",
        lines: ["Each function: { metadata, implementation },", "on the full engine"],
      }}
      text={{
        title: "Where a registered custom function shows up",
        description:
          "Functions given to functionsAddon, or to one grid's addons.functions, register when the grid is created, on the full engine. Each is { metadata, implementation }. Formulas call it by name during recalculation; it is synchronous, gets values and arrays of rows, and returns a value. Formula help reads its metadata. With volatile: true it runs again on every edit; otherwise only when its arguments change. A thrown error or a promise shows #VALUE!.",
      }}
      tiles={[
        {
          title: "In formulas",
          lines: ["Called by name while", "recalculating; returns", "a number, text or bool"],
          tone: "accent",
        },
        {
          title: "In formula help",
          lines: ["Its metadata names", "and describes it and", "its arguments"],
        },
        {
          title: "On recalculation",
          lines: ["volatile: true runs", "on every edit; others", "when arguments change"],
          tone: "muted",
        },
        { title: "On failure", lines: ["A thrown error or a", "promise shows #VALUE!"] },
      ]}
    />
  );
}

/** Volatile functions: one clock instant per recalculation. */
export function VolatileClockDiagram() {
  return (
    <FlowFigure
      note="Random values come from each engine's own generator, which isn't cryptographic."
      steps={[
        {
          title: "An edit, or",
          code: ["recalculateVolatile(", '  new Date("…Z"))'],
          tone: "accent",
        },
        { title: "The clock, read once", lines: ["One UTC serial for the", "whole recalculation"] },
        {
          title: "Volatile formulas",
          code: ["NOW · TODAY", "RAND · RANDBETWEEN", "OFFSET · INDIRECT"],
          lines: ["and their dependents"],
          tone: "muted",
        },
      ]}
      text={{
        title: "One clock instant for each recalculation",
        description:
          "Each edit, or a call to recalculateVolatile with an absolute instant, recalculates the volatile functions NOW, TODAY, RAND, RANDBETWEEN, OFFSET and INDIRECT and their dependents. TODAY and NOW read the clock once per recalculation as a UTC serial, so every formula in that recalculation sees the same time, and a fixed Date gives the same result in every time zone. Random values come from each engine's own generator, which isn't cryptographic.",
      }}
    />
  );
}

/** Formula diagrams by the name a placement uses. */
export const FORMULA_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "dynamic-references": DynamicReferencesDiagram,
  "reference-operators": ReferenceOperatorsDiagram,
  "criteria-rows": CriteriaRowsDiagram,
  "reference-rewrite": ReferenceRewriteDiagram,
  "custom-functions": CustomFunctionsDiagram,
  "volatile-clock": VolatileClockDiagram,
};
