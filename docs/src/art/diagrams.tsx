// In-page diagrams for the showcases: labelled pictures for ideas that a
// picture explains better than text. Each is an image with a title and a
// description (Art.tsx `DiagramArt`), drawn twice: a wide layout, and a narrow
// one that small screens get instead (art.css).
import { For, type JSX } from "solid-js";

import { DiagramArt, head } from "./Art.js";
import { FlowFigure, SequenceFigure } from "./blueprint-layouts.js";
import { Arrow, Box, type DiagramText, Responsive } from "./diagram-kit.js";

const INTEROP_STEPS = [
  ["XLSX bytes", "From a file input,", "fetch or drop"],
  ["Unzip, with limits", "Safe part names;", "size and ratio capped"],
  ["Parse XML", "No DTDs or entities;", "nesting up to 64"],
  ["Workbook", "Sheets, cells, styles,", "formulas and names"],
  ["Grid", "Recalculated", "and painted"],
] as const;

const INTEROP_TEXT: DiagramText = {
  hue: "blue",
  alt: "amber",
  title: "How an XLSX file is imported, where hostile files stop, and what export reports",
  description:
    "An XLSX file goes through unzip with limits, then XML parsing, into a workbook shown in the grid. A hostile or oversized file stops at unzip or parsing with a typed error, xlsx-import-failed or xlsx-resource-limit, and nothing is imported. Export writes XLSX, CSV or TSV, and import and export both list anything not kept, by code and cell.",
};

/** Interoperability: the XLSX import path, where hostile files stop, and what export reports. */
export function InteropFlowDiagram() {
  const stepClass = (index: number) => (index === 1 || index === 2 ? "hue-soft" : "panel");
  return (
    <Responsive
      narrow={{
        height: 460,
        draw: () => (
          <>
            <For each={INTEROP_STEPS}>
              {([title, first, second], index) => (
                <>
                  <Box
                    class={stepClass(index())}
                    h={68}
                    lines={[first, second]}
                    title={title}
                    w={186}
                    x={8}
                    y={8 + index() * 92}
                  />
                  {index() < INTEROP_STEPS.length - 1 && (
                    <Arrow
                      class="hue-line"
                      x1={101}
                      x2={101}
                      y1={80 + index() * 92}
                      y2={96 + index() * 92}
                    />
                  )}
                </>
              )}
            </For>
            <Arrow class="error-line dash" x1={198} x2={210} y1={134} y2={134} />
            <Arrow class="error-line dash" x1={198} x2={210} y1={226} y2={226} />
            <Box
              class="error-soft"
              code={["xlsx-import-failed", "xlsx-resource-limit"]}
              h={160}
              lines={["Nothing imported;", "the error says why:"]}
              title="Typed error"
              w={140}
              x={214}
              y={100}
            />
            <Arrow x1={198} x2={210} y1={318} y2={318} />
            <Box h={68} lines={["XLSX, CSV or TSV"]} title="Export" w={140} x={214} y={284} />
            <Arrow class="alt-line" x1={284} x2={284} y1={356} y2={372} />
            <Box
              class="alt-soft"
              h={68}
              lines={["Anything not kept,", "by code and cell"]}
              title="Warnings"
              w={140}
              x={214}
              y={376}
            />
          </>
        ),
      }}
      text={INTEROP_TEXT}
      wide={{
        height: 262,
        draw: () => (
          <>
            <For each={INTEROP_STEPS}>
              {([title, first, second], index) => (
                <>
                  <Box
                    class={stepClass(index())}
                    h={76}
                    lines={[first, second]}
                    title={title}
                    w={150}
                    x={10 + index() * 162}
                    y={16}
                  />
                  {index() < INTEROP_STEPS.length - 1 && (
                    <Arrow
                      class="hue-line"
                      x1={162 + index() * 162}
                      x2={170 + index() * 162}
                      y1={54}
                      y2={54}
                    />
                  )}
                </>
              )}
            </For>
            <Arrow class="error-line dash" x1={247} x2={247} y1={96} y2={170} />
            <Arrow class="error-line dash" x1={409} x2={409} y1={96} y2={170} />
            <Box
              class="error-soft"
              code={["xlsx-import-failed or xlsx-resource-limit"]}
              h={76}
              lines={["The error's code and message say why:"]}
              title="Typed error; nothing imported"
              w={312}
              x={172}
              y={174}
            />
            <Arrow x1={571} x2={571} y1={96} y2={170} />
            <Box h={76} lines={["XLSX, CSV or TSV"]} title="Export" w={150} x={496} y={174} />
            <Arrow class="alt-line" x1={648} x2={656} y1={212} y2={212} />
            <Box
              class="alt-soft"
              h={76}
              lines={["Anything not kept,", "by code and cell"]}
              title="Warnings"
              w={150}
              x={658}
              y={174}
            />
          </>
        ),
      }}
    />
  );
}

/** A stack of formula cells: two offset sheets behind a labelled box. */
function FormulaStack(
  props: Readonly<{ x: number; y: number; w: number; title: string; line: string }>,
) {
  return (
    <>
      <rect class="panel" height={60} rx={8} width={props.w} x={props.x + 8} y={props.y + 8} />
      <rect class="panel" height={60} rx={8} width={props.w} x={props.x + 4} y={props.y + 4} />
      <Box h={60} lines={[props.line]} title={props.title} w={props.w} x={props.x} y={props.y} />
    </>
  );
}

/** The timing strip: an edit, then the engine's recalculation and the grid's paint. */
function TimingStrip(props: Readonly<{ x: number; y: number; recalc: number; paint: number }>) {
  return (
    <>
      <circle class="hue" cx={props.x + 6} cy={props.y + 7} r={6} />
      <text class="caption" x={props.x + 18} y={props.y + 11}>
        Edit
      </text>
      <rect class="hue" height={14} rx={7} width={props.recalc} x={props.x + 52} y={props.y} />
      <text class="caption strong" x={props.x + 58} y={props.y - 6}>
        Recalculate (engine)
      </text>
      <rect
        class="alt"
        height={14}
        rx={7}
        width={props.paint}
        x={props.x + 58 + props.recalc}
        y={props.y}
      />
      <text class="caption strong" x={props.x + 62 + props.recalc} y={props.y - 6}>
        Paint
      </text>
    </>
  );
}

const RECALC_TEXT: DiagramText = {
  hue: "violet",
  alt: "amber",
  title: "Which formulas one edit recalculates, and what the page times",
  description:
    "Editing the Price change cell recalculates the 100,000 revenue formulas that read it and their total. Moving the first SKU looked up recalculates 1,000 XLOOKUP formulas, each searching 100,000 SKUs, and their total. The page times each edit in two parts: the engine's recalculation, then the grid's paint.",
};

/** Curves from one point to four points spread around a target. */
function fan(fromX: number, fromY: number, toX: number, toY: number, vertical = false): string {
  return [-24, -8, 8, 24]
    .map((offset) =>
      vertical
        ? `M${fromX} ${fromY}C${fromX} ${(fromY + toY) / 2} ${toX + offset * 3} ${(fromY + toY) / 2} ${toX + offset * 3} ${toY}`
        : `M${fromX} ${fromY}C${(fromX + toX) / 2} ${fromY} ${(fromX + toX) / 2} ${toY + offset} ${toX} ${toY + offset}`,
    )
    .join("");
}

/** Recalculation: two control cells and the formulas that read each, timed from edit to paint. */
export function RecalculationDiagram() {
  const groups = [
    [
      "Price change",
      "The control cell you edit",
      "100,000 revenue formulas",
      "Each reads the price change",
      "Total revenue",
    ],
    [
      "First SKU looked up",
      "The second control cell",
      "1,000 XLOOKUP formulas",
      "Each searches 100,000 SKUs",
      "Looked-up prices",
    ],
  ] as const;
  return (
    <Responsive
      narrow={{
        height: 600,
        draw: () => (
          <>
            <For each={groups}>
              {([control, controlLine, formulas, formulasLine, total], index) => (
                <>
                  <Box
                    class="hue-soft"
                    h={56}
                    lines={[controlLine]}
                    title={control}
                    w={340}
                    x={8}
                    y={8 + index() * 264}
                  />
                  <path
                    class="hue-line"
                    d={fan(178, 66 + index() * 264, 178, 100 + index() * 264, true)}
                    stroke-width={1.5}
                  />
                  <FormulaStack
                    line={formulasLine}
                    title={formulas}
                    w={332}
                    x={8}
                    y={100 + index() * 264}
                  />
                  <Arrow
                    class="hue-line"
                    x1={178}
                    x2={178}
                    y1={172 + index() * 264}
                    y2={190 + index() * 264}
                  />
                  <Box
                    h={56}
                    lines={["One SUM over them"]}
                    title={total}
                    w={340}
                    x={8}
                    y={194 + index() * 264}
                  />
                </>
              )}
            </For>
            <path class="rule" d="M8 540h344" />
            <TimingStrip paint={92} recalc={180} x={8} y={568} />
          </>
        ),
      }}
      text={RECALC_TEXT}
      wide={{
        height: 320,
        draw: () => (
          <>
            <For each={groups}>
              {([control, controlLine, formulas, formulasLine, total], index) => (
                <>
                  <Box
                    class="hue-soft"
                    h={58}
                    lines={[controlLine]}
                    title={control}
                    w={184}
                    x={10}
                    y={28 + index() * 136}
                  />
                  <path
                    class="hue-line"
                    d={fan(196, 57 + index() * 136, 316, 57 + index() * 136)}
                    stroke-width={1.5}
                  />
                  <FormulaStack
                    line={formulasLine}
                    title={formulas}
                    w={232}
                    x={318}
                    y={24 + index() * 136}
                  />
                  <Arrow
                    class="hue-line"
                    x1={562}
                    x2={616}
                    y1={54 + index() * 136}
                    y2={54 + index() * 136}
                  />
                  <Box
                    h={58}
                    lines={["One SUM over them"]}
                    title={total}
                    w={184}
                    x={620}
                    y={28 + index() * 136}
                  />
                </>
              )}
            </For>
            <path class="rule" d="M10 262h800" />
            <TimingStrip paint={160} recalc={340} x={10} y={288} />
            <text class="caption" x={640} y={299}>
              Both timed in your browser
            </text>
          </>
        ),
      }}
    />
  );
}

/** A table in the data model: a name row and its fields, keys marked. */
function ModelTable(
  props: Readonly<{
    x: number;
    y: number;
    w: number;
    name: string;
    fields: readonly (readonly [name: string, key?: string])[];
  }>,
) {
  const height = () => 32 + props.fields.length * 24;
  return (
    <>
      <rect
        class="shade"
        height={height()}
        rx={8}
        width={props.w}
        x={props.x + 2}
        y={props.y + 3}
      />
      <rect class="panel" height={height()} rx={8} width={props.w} x={props.x} y={props.y} />
      <rect
        class="hue-tint"
        height={30}
        rx={7}
        width={props.w - 1.5}
        x={props.x + 0.75}
        y={props.y + 0.75}
      />
      <text class="heading" x={props.x + 12} y={props.y + 20}>
        {props.name}
      </text>
      <For each={props.fields}>
        {([field, key], index) => (
          <>
            <path class="rule" d={`M${props.x} ${props.y + 32 + index() * 24}h${props.w}`} />
            <text class="caption" x={props.x + 12} y={props.y + 49 + index() * 24}>
              {field}
            </text>
            {key && (
              <text
                class="hue-text"
                text-anchor="end"
                x={props.x + props.w - 12}
                y={props.y + 49 + index() * 24}
              >
                {key}
              </text>
            )}
          </>
        )}
      </For>
    </>
  );
}

const ORDERS_FIELDS = [
  ["Order"],
  ["Product", "many"],
  ["Region", "many"],
  ["Units"],
  ["Amount"],
] as const;
const PRODUCTS_FIELDS = [["Product ID", "1"], ["Product"], ["Category"]] as const;
const REGIONS_FIELDS = [["Code", "1"], ["Region"], ["Manager"]] as const;

/** The model pivot: where its rows and values come from. */
function ModelPivot(props: Readonly<{ x: number; y: number; w: number; h: number }>) {
  const lines: readonly (readonly [
    text: string,
    kind: "head" | "caption" | "code",
    gap?: number,
  ])[] = [
    ["Rows", "head"],
    ["Category, Region or Manager", "caption"],
    ["Values", "head", 12],
    ["Revenue: SUM of Amount", "caption"],
    ["Orders: COUNTA of Order", "caption"],
    ["Average order, a measure:", "caption"],
    ["=SUM(Orders[Amount])", "code"],
    ["/COUNT(Orders[Amount])", "code"],
  ];
  let y = props.y + 46;
  const placed = lines.map(([text, kind, gap]) => {
    y += gap ?? 0;
    const line = { text, kind, y };
    y += kind === "code" ? 14 : 16;
    return line;
  });
  return (
    <>
      <rect class="shade" height={props.h} rx={8} width={props.w} x={props.x + 2} y={props.y + 3} />
      <rect class="alt-soft" height={props.h} rx={8} width={props.w} x={props.x} y={props.y} />
      <text class="heading" x={props.x + 12} y={props.y + 22}>
        Revenue by group
      </text>
      <For each={placed}>
        {(line) => (
          <text
            class={
              line.kind === "head" ? "caption strong" : line.kind === "code" ? "small" : "caption"
            }
            x={props.x + 12}
            y={line.y}
          >
            {line.text}
          </text>
        )}
      </For>
      <text class="caption" x={props.x + 12} y={props.y + props.h - 28}>
        A repeated key or an orphaned
      </text>
      <text class="caption" x={props.x + 12} y={props.y + props.h - 12}>
        order shows in the key status.
      </text>
    </>
  );
}

const DATA_MODEL_TEXT: DiagramText = {
  hue: "violet",
  alt: "teal",
  title: "The data model: three related tables and the pivot over them",
  description:
    "Orders has Order, Product, Region, Units and Amount. Many orders relate to one product through Orders[Product] and Products[Product ID], and to one region through Orders[Region] and Regions[Code]. The model pivot Revenue by group takes its rows from Category, Region or Manager, and its values from Orders: Revenue as SUM of Amount, Orders as COUNTA of Order, and the Average order measure.",
};

/** Data model: Orders related to Products and Regions, and the model pivot over them. */
export function DataModelDiagram() {
  return (
    <Responsive
      narrow={{
        height: 520,
        draw: () => (
          <>
            <ModelTable fields={ORDERS_FIELDS} name="Orders" w={150} x={8} y={48} />
            <ModelTable fields={PRODUCTS_FIELDS} name="Products" w={150} x={202} y={8} />
            <ModelTable fields={REGIONS_FIELDS} name="Regions" w={150} x={202} y={136} />
            <path class="hue-line" d="M158 116c22 0 22-64 44-64M158 140c22 0 22 40 44 40" />
            <Arrow class="alt-line dash" x1={180} x2={180} y1={246} y2={270} />
            <ModelPivot h={236} w={344} x={8} y={274} />
          </>
        ),
      }}
      text={DATA_MODEL_TEXT}
      wide={{
        height: 300,
        draw: () => (
          <>
            <ModelTable fields={ORDERS_FIELDS} name="Orders" w={176} x={10} y={48} />
            <ModelTable fields={PRODUCTS_FIELDS} name="Products" w={176} x={310} y={16} />
            <ModelTable fields={REGIONS_FIELDS} name="Regions" w={176} x={310} y={168} />
            <path class="hue-line" d="M186 116c62 0 62-56 124-56M186 140c62 0 62 72 124 72" />
            <path
              class="alt-line dash"
              d={`M486 108c50 0 50-12 104-12${head(590, 96, 0)}M486 236c56 0 50-140 104-140${head(590, 96, 0)}M186 188c180 0 120 -40 404 -40${head(590, 148, 0)}`}
            />
            <ModelPivot h={246} w={214} x={596} y={40} />
          </>
        ),
      }}
    />
  );
}

const COLLABORATION_TEXT: DiagramText = {
  hue: "red",
  alt: "blue",
  title: "Recovering a missed version, and draining offline edits on reconnect",
  description:
    "Client A sends an edit based on version 5; the server assigns version 6, acknowledges it to A and sends it to B. Version 7 never reaches B. When version 8 arrives, B sees the gap, requests versions 7 to 8, and the server replays them so B applies them in order. Later A goes offline with two edits queued; on reconnect it sends them and the server acknowledges them as versions 9 and 10.",
};

/** Collaboration: how a client recovers a missed version, and how offline edits drain on reconnect. */
export function CollaborationRecoveryDiagram() {
  return (
    <SequenceFigure
      lanes={[
        { id: "a", name: "Client A" },
        { id: "server", name: "Server" },
        { id: "b", name: "Client B" },
      ]}
      steps={[
        { message: "edit on v5", from: "a", to: "server" },
        { message: "ack v6", from: "server", to: "a", kind: "back" },
        { message: "v6", from: "server", to: "b", kind: "back" },
        { message: "v7", from: "server", to: "b", lost: true },
        { message: "v8", from: "server", to: "b", kind: "back" },
        { note: "Gap: v7 missing", lane: "b", tone: "danger" },
        { message: "ask v7–v8", from: "b", to: "server" },
        { message: "replay v7, v8", from: "server", to: "b", kind: "back" },
        { note: "Applied in order", lane: "b", tone: "accent" },
        { note: "Offline: 2 queued", lane: "a", tone: "muted" },
        { message: "send 2 edits", from: "a", to: "server" },
        { message: "ack v9, v10", from: "server", to: "a", kind: "back" },
      ]}
      text={COLLABORATION_TEXT}
    />
  );
}

const PAGING_TEXT: DiagramText = {
  hue: "amber",
  alt: "blue",
  title: "What stays loaded when you scroll a million rows",
  description:
    "The sheet has 1,000,000 rows and 1,000 columns. Rows load in pages of 4,096. The pages in view and those near them stay in memory, up to a 32 MiB budget for unedited pages; pages further away are evicted and fetched again from your page provider when you come back.",
};

/** Performance: the address space, the pages kept near the viewport, and the host's page provider. */
export function PagingDiagram() {
  return (
    <FlowFigure
      outcome={{
        from: 2,
        kind: "back",
        step: {
          title: "Your page provider",
          lines: ["Fetches a page again", "when you come back"],
        },
      }}
      steps={[
        { title: "1,000,000 rows", lines: ["In pages of", "4,096 rows"] },
        {
          title: "Pages in view",
          lines: ["And the pages near", "them stay in memory"],
          tone: "accent",
        },
        {
          title: "Over 32 MiB",
          lines: ["The farthest unedited", "pages are evicted"],
          tone: "muted",
        },
      ]}
      text={{ title: PAGING_TEXT.title, description: PAGING_TEXT.description }}
    />
  );
}

const COMMAND_TEXT: DiagramText = {
  hue: "green",
  alt: "amber",
  title: "One command model: the ribbon and your toolbar call the same grid actions",
  description:
    "A ribbon command and a button in your own toolbar both call grid.actions, which applies the command to the grid. Data › Refresh All reloads the saved query behind the Targets sheet.",
};

/** The spreadsheet app's command model: every caller goes through grid.actions. */
export function CommandModelDiagram() {
  return (
    <Responsive
      narrow={{
        height: 388,
        draw: () => (
          <>
            <Box
              h={56}
              lines={["Home › Editing › AutoSum"]}
              title="Ribbon command"
              w={164}
              x={8}
              y={8}
            />
            <Box h={56} lines={["Your own buttons"]} title="Your toolbar" w={164} x={188} y={8} />
            <Arrow class="hue-line" x1={90} x2={160} y1={68} y2={92} />
            <Arrow class="hue-line" x1={270} x2={200} y1={68} y2={92} />
            <Box
              class="hue-soft"
              h={56}
              lines={["The same methods"]}
              title="grid.actions"
              w={344}
              x={8}
              y={96}
            />
            <Arrow class="hue-line" x1={180} x2={180} y1={156} y2={172} />
            <Box h={56} lines={["Applies the command"]} title="Grid" w={344} x={8} y={176} />
            <Box
              class="alt-soft"
              h={56}
              lines={["Data › Refresh All"]}
              title="Refresh"
              w={164}
              x={8}
              y={260}
            />
            <Arrow class="alt-line" x1={176} x2={186} y1={288} y2={288} />
            <Box
              h={56}
              lines={["Reloads into Targets"]}
              title="Saved query"
              w={164}
              x={188}
              y={260}
            />
            <text class="caption" x={8} y={350}>
              The Targets sheet is a saved query
            </text>
            <text class="caption" x={8} y={366}>
              that Refresh All reloads.
            </text>
          </>
        ),
      }}
      text={COMMAND_TEXT}
      wide={{
        height: 236,
        width: 690,
        draw: () => (
          <>
            <Box
              h={56}
              lines={["Home › Editing › AutoSum"]}
              title="Ribbon command"
              w={190}
              x={10}
              y={12}
            />
            <Box h={56} lines={["Your own buttons"]} title="Your toolbar" w={190} x={10} y={84} />
            <Arrow class="hue-line" x1={204} x2={276} y1={40} y2={68} />
            <Arrow class="hue-line" x1={204} x2={276} y1={112} y2={84} />
            <Box
              class="hue-soft"
              h={56}
              lines={["The same methods"]}
              title="grid.actions"
              w={170}
              x={280}
              y={48}
            />
            <Arrow class="hue-line" x1={454} x2={496} y1={76} y2={76} />
            <Box h={56} lines={["Applies the command"]} title="Grid" w={170} x={500} y={48} />
            <path class="rule" d="M10 162h670" />
            <Box
              class="alt-soft"
              h={56}
              lines={["Data › Refresh All"]}
              title="Refresh"
              w={190}
              x={10}
              y={172}
            />
            <Arrow class="alt-line" x1={204} x2={276} y1={200} y2={200} />
            <Box
              h={56}
              lines={["Reloads the Targets sheet"]}
              title="Saved query"
              w={210}
              x={280}
              y={172}
            />
          </>
        ),
      }}
    />
  );
}

/** The library/host seam: the two interfaces the host implements and Sheetwrite calls. */
export function BoundarySeam(
  props: Readonly<{ interfaces: readonly (readonly [name: string, methods: readonly string[]])[] }>,
) {
  let y = 64;
  const boxes = props.interfaces.map(([name, methods]) => {
    const box = { name, methods, y, h: 40 + methods.length * 16 };
    y += box.h + 24;
    return box;
  });
  return (
    <DiagramArt
      alt="blue"
      description={`Sheetwrite calls, and your host implements: ${props.interfaces
        .map(([name, methods]) => `${name} (${methods.join(", ")})`)
        .join("; ")}.`}
      height={y + 8}
      hue="red"
      title="The seam between Sheetwrite and your host"
      width={280}
    >
      <path class="ink-line dash faint" d={`M140 34V${y}`} />
      <text class="caption strong" text-anchor="end" x={130} y={22}>
        Sheetwrite calls
      </text>
      <text class="caption strong" x={150} y={22}>
        your host implements
      </text>
      <For each={boxes}>
        {(box) => (
          <>
            <path
              class="hue-line"
              d={`M4 ${box.y + box.h / 2}h22${head(26, box.y + box.h / 2, 0)}`}
            />
            <path
              class="alt-line"
              d={`M276 ${box.y + box.h / 2}h-22${head(254, box.y + box.h / 2, 180)}`}
            />
            <Box
              class="hue-soft"
              code={box.methods}
              h={box.h}
              title={box.name}
              w={224}
              x={28}
              y={box.y}
            />
          </>
        )}
      </For>
    </DiagramArt>
  );
}

/** A proposed in-page diagram: the showcase it belongs on and where. */
export interface ShowcaseDiagram {
  readonly showcase: string;
  readonly placement: string;
  readonly Diagram: () => JSX.Element;
}

/** The proposed diagrams, in the order the review shows them. */
export const DIAGRAMS: readonly ShowcaseDiagram[] = [
  {
    showcase: "Spreadsheet interoperability",
    placement: "above the Security lab",
    Diagram: InteropFlowDiagram,
  },
  {
    showcase: "Live recalculation",
    placement: "beside the timing panel",
    Diagram: RecalculationDiagram,
  },
  { showcase: "Data model", placement: "above the model pivot", Diagram: DataModelDiagram },
  {
    showcase: "Collaboration protocol",
    placement: "after the protocol log",
    Diagram: CollaborationRecoveryDiagram,
  },
  {
    showcase: "Performance & scale",
    placement: "beside the cache counters",
    Diagram: PagingDiagram,
  },
];
