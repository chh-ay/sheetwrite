// In-page diagrams for the showcases: labelled pictures for ideas that a
// picture explains better than text. Each is an image with a title and a
// description (Art.tsx `DiagramArt`), drawn twice: a wide layout, and a narrow
// one that small screens get instead (art.css).
import { For, type JSX } from "solid-js";

import { type ArtAlt, type ArtHue, DiagramArt, head } from "./Art.js";

/** Wide and narrow canvas widths, in diagram units. */
const WIDE = 820;
const NARROW = 360;

/** A labelled box: a heading, caption lines, then code lines in mono. */
function Box(
  props: Readonly<{
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    lines?: readonly string[];
    code?: readonly string[];
    class?: string;
  }>,
) {
  const captions = () => props.lines ?? [];
  return (
    <>
      <rect class="shade" height={props.h} rx={8} width={props.w} x={props.x + 2} y={props.y + 3} />
      <rect
        class={props.class ?? "panel"}
        height={props.h}
        rx={8}
        width={props.w}
        x={props.x}
        y={props.y}
      />
      <text class="heading" x={props.x + 12} y={props.y + 22}>
        {props.title}
      </text>
      <For each={captions()}>
        {(line, index) => (
          <text class="caption" x={props.x + 12} y={props.y + 41 + index() * 16}>
            {line}
          </text>
        )}
      </For>
      <For each={props.code ?? []}>
        {(line, index) => (
          <text
            class="small"
            x={props.x + 12}
            y={props.y + 41 + (captions().length + index()) * 16}
          >
            {line}
          </text>
        )}
      </For>
    </>
  );
}

/** A straight arrow, with an optional caption above it (or below, with `below`). */
function Arrow(
  props: Readonly<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    class?: string;
    label?: string;
    below?: boolean;
  }>,
) {
  const angle = () => (Math.atan2(props.y2 - props.y1, props.x2 - props.x1) * 180) / Math.PI;
  return (
    <>
      <path
        class={props.class ?? "ink-line"}
        d={`M${props.x1} ${props.y1}L${props.x2} ${props.y2}${head(props.x2, props.y2, angle())}`}
      />
      {props.label && (
        <text
          class="caption"
          text-anchor="middle"
          x={(props.x1 + props.x2) / 2}
          y={(props.y1 + props.y2) / 2 + (props.below ? 16 : -7)}
        >
          {props.label}
        </text>
      )}
    </>
  );
}

/** One diagram's shared text and colours; the drawing differs per layout. */
interface DiagramText {
  readonly hue: ArtHue;
  readonly alt: ArtAlt;
  readonly title: string;
  readonly description: string;
}

/** Both layouts of a diagram; art.css shows the narrow one on small screens. */
function Responsive(
  props: Readonly<{
    text: DiagramText;
    wide: { height: number; draw: () => JSX.Element };
    narrow: { height: number; draw: () => JSX.Element };
  }>,
) {
  return (
    <div class="sw-art-diagram">
      <div class="sw-art-diagram__wide">
        <DiagramArt {...props.text} height={props.wide.height} width={WIDE}>
          {props.wide.draw()}
        </DiagramArt>
      </div>
      <div class="sw-art-diagram__narrow">
        <DiagramArt {...props.text} height={props.narrow.height} width={NARROW}>
          {props.narrow.draw()}
        </DiagramArt>
      </div>
    </div>
  );
}

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

/** A note on a sequence diagram's lane. */
function LaneNote(
  props: Readonly<{ x: number; y: number; w: number; text: string; class: string }>,
) {
  return (
    <>
      <rect class={props.class} height={26} rx={6} width={props.w} x={props.x} y={props.y} />
      <text class="caption" x={props.x + 8} y={props.y + 17}>
        {props.text}
      </text>
    </>
  );
}

const COLLABORATION_TEXT: DiagramText = {
  hue: "red",
  alt: "blue",
  title: "Recovering a missed version, and draining offline edits on reconnect",
  description:
    "Client A sends an edit based on version 5; the server assigns version 6, acknowledges it to A and sends it to B. Version 7 never reaches B. When version 8 arrives, B sees the gap, requests versions 7 to 8, and the server replays them so B applies them in order. Later A goes offline with two edits queued; on reconnect it sends them and the server acknowledges them as versions 9 and 10.",
};

/** The sequence for one layout: lanes at `a`, `s` and `b`, notes placed per layout. */
function CollaborationSequence(
  props: Readonly<{
    a: number;
    s: number;
    b: number;
    laneWidth: number;
    gapNote: number;
    noteWidth: number;
  }>,
) {
  const lanes = () =>
    [
      [props.a, "Client A"],
      [props.s, "Server"],
      [props.b, "Client B"],
    ] as const;
  return (
    <>
      <For each={lanes()}>
        {([x, name]) => (
          <>
            <path class="rule dash" d={`M${x} 52V364`} />
            <rect
              class="shade"
              height={32}
              rx={8}
              width={props.laneWidth}
              x={x - props.laneWidth / 2 + 2}
              y={15}
            />
            <rect
              class="panel"
              height={32}
              rx={8}
              width={props.laneWidth}
              x={x - props.laneWidth / 2}
              y={12}
            />
            <text class="heading" text-anchor="middle" x={x} y={33}>
              {name}
            </text>
          </>
        )}
      </For>
      <Arrow
        class="hue-line"
        label="edit, based on v5"
        x1={props.a}
        x2={props.s - 6}
        y1={80}
        y2={80}
      />
      <Arrow label="ack v6" x1={props.s} x2={props.a + 6} y1={112} y2={112} />
      <Arrow class="alt-line" label="v6" x1={props.s} x2={props.b - 6} y1={112} y2={112} />
      <path class="error-line dash" d={`M${props.s} 150H${props.b - 50}`} />
      <path class="error-line" d={`M${props.b - 46} 144l12 12M${props.b - 34} 144l-12 12`} />
      <text class="caption" text-anchor="middle" x={(props.s + props.b) / 2 - 20} y={143}>
        v7, lost
      </text>
      <Arrow class="alt-line" label="v8" x1={props.s} x2={props.b - 6} y1={184} y2={184} />
      <LaneNote
        class="alt-soft"
        text="Gap: v7 missing"
        w={props.noteWidth}
        x={props.gapNote}
        y={194}
      />
      <Arrow
        class="alt-line"
        label="request v7–v8"
        x1={props.b}
        x2={props.s + 6}
        y1={244}
        y2={244}
      />
      <Arrow
        class="alt-line"
        label="replay v7, v8"
        x1={props.s}
        x2={props.b - 6}
        y1={276}
        y2={276}
      />
      <LaneNote
        class="alt-soft"
        text="Applied in order"
        w={props.noteWidth}
        x={props.gapNote}
        y={286}
      />
      <LaneNote
        class="hue-soft"
        text="Offline: 2 edits queued"
        w={164}
        x={props.a - 44 < 8 ? 8 : props.a - 44}
        y={300}
      />
      <Arrow
        class="hue-line"
        label="send 2 queued edits"
        x1={props.a}
        x2={props.s - 6}
        y1={344}
        y2={344}
      />
      <Arrow below label="ack v9, v10" x1={props.s} x2={props.a + 6} y1={356} y2={356} />
    </>
  );
}

/** Collaboration: how a client recovers a missed version, and how offline edits drain on reconnect. */
export function CollaborationRecoveryDiagram() {
  return (
    <Responsive
      narrow={{
        height: 386,
        draw: () => (
          <CollaborationSequence
            a={52}
            b={308}
            gapNote={194}
            laneWidth={96}
            noteWidth={110}
            s={180}
          />
        ),
      }}
      text={COLLABORATION_TEXT}
      wide={{
        height: 386,
        draw: () => (
          <CollaborationSequence
            a={120}
            b={700}
            gapNote={548}
            laneWidth={150}
            noteWidth={140}
            s={410}
          />
        ),
      }}
    />
  );
}

/** Pages in memory around the viewport, top to bottom. */
const PAGE_BANDS = [
  "evicted",
  "evicted",
  "kept",
  "view",
  "view",
  "kept",
  "kept",
  "evicted",
] as const;
const BAND_CLASS = { evicted: "panel", kept: "hue-tint", view: "hue" } as const;
const BAND_LABEL = { evicted: "evicted", kept: "kept in memory", view: "in view" } as const;

/** The address-space bar, its zoom lines and the page bands. */
function PageBands(props: Readonly<{ barX: number; x: number; w: number }>) {
  return (
    <>
      <text class="heading" x={props.barX - 4} y={20}>
        1,000,000 rows
      </text>
      <rect class="panel" height={232} rx={6} width={32} x={props.barX} y={36} />
      <path
        class="rule"
        d={[66, 96, 126, 156, 186, 216, 246].map((y) => `M${props.barX} ${y}h32`).join("")}
      />
      <rect class="hue" height={10} rx={2} width={32} x={props.barX} y={140} />
      <path
        class="ink-line dash"
        d={`M${props.barX + 32} 140L${props.x - 6} 44M${props.barX + 32} 150L${props.x - 6} 250`}
      />
      <For each={PAGE_BANDS}>
        {(band, index) => (
          <>
            <rect
              class={BAND_CLASS[band]}
              height={22}
              rx={4}
              width={props.w}
              x={props.x}
              y={44 + index() * 26}
            />
            {(index() === 0 || index() === 2 || index() === 3) && (
              <text
                class={band === "view" ? "small on-hue" : "small"}
                x={props.x + 10}
                y={59 + index() * 26}
              >
                {BAND_LABEL[band]}
              </text>
            )}
          </>
        )}
      </For>
      <rect
        class="alt-line"
        height={56}
        rx={6}
        stroke-width={2.5}
        width={props.w + 12}
        x={props.x - 6}
        y={117}
      />
      <text class="caption" x={props.x} y={278}>
        Each band is a page of 4,096 rows
      </text>
    </>
  );
}

/** The page budget bar and what happens over it. */
function PageBudget(props: Readonly<{ x: number; y: number; w: number }>) {
  return (
    <>
      <text class="caption strong" x={props.x} y={props.y}>
        Unedited pages: up to 32 MiB
      </text>
      <rect class="soft" height={12} rx={6} width={props.w} x={props.x} y={props.y + 8} />
      <rect class="hue" height={12} rx={6} width={props.w * 0.65} x={props.x} y={props.y + 8} />
      <text class="caption" x={props.x} y={props.y + 40}>
        Over the budget, the farthest
      </text>
      <text class="caption" x={props.x} y={props.y + 56}>
        pages are evicted
      </text>
    </>
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
    <Responsive
      narrow={{
        height: 470,
        draw: () => (
          <>
            <PageBands barX={12} w={266} x={86} />
            <Box
              h={62}
              lines={["Fetched on demand: a network", "or database call you write"]}
              title="Your page provider"
              w={344}
              x={8}
              y={300}
            />
            <Arrow class="hue-line" x1={330} x2={330} y1={298} y2={260} />
            <PageBudget w={344} x={8} y={396} />
          </>
        ),
      }}
      text={PAGING_TEXT}
      wide={{
        height: 300,
        draw: () => (
          <>
            <PageBands barX={36} w={320} x={200} />
            <Box
              h={62}
              lines={["A network or database", "call that you write"]}
              title="Your page provider"
              w={220}
              x={590}
              y={24}
            />
            <path class="hue-line" d={`M640 90c0 80-40 110-104 110${head(536, 200, 180)}`} />
            <text class="caption" x={652} y={150}>
              fetch on demand
            </text>
            <PageBudget w={220} x={590} y={228} />
          </>
        ),
      }}
    />
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
