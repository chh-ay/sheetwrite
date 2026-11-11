// Diagrams for the showcases' "how it works" sections, one per page, each
// beside the section it explains. Every label comes from the section's text.
import { For } from "solid-js";

import { Bar, head, Panel, Sheet } from "./Art.js";
import { Arrow, Box, type DiagramText, Responsive } from "./diagram-kit.js";

/** These diagrams sit in eight of twelve columns: a narrower wide canvas. */
const EXPLAIN_WIDE = 700;

/** A rounded label: a pill with mono text. */
function Chip(props: Readonly<{ x: number; y: number; text: string; class?: string; w?: number }>) {
  const width = () => props.w ?? props.text.length * 6.6 + 20;
  return (
    <>
      <rect
        class={props.class ?? "hue-soft"}
        height={24}
        rx={12}
        width={width()}
        x={props.x}
        y={props.y}
      />
      <text class="small strong" x={props.x + 10} y={props.y + 16}>
        {props.text}
      </text>
    </>
  );
}

/** A small bar chart in a panel. */
function MiniChart(props: Readonly<{ x: number; y: number; w: number; h: number }>) {
  const bars = [0.45, 0.7, 0.55, 0.9, 0.35];
  const step = () => (props.w - 40) / bars.length;
  return (
    <>
      <Panel h={props.h} w={props.w} x={props.x} y={props.y} />
      <path class="rule" d={`M${props.x + 16} ${props.y + props.h - 16}h${props.w - 32}`} />
      <For each={bars}>
        {(bar, index) => (
          <rect
            class="hue"
            height={(props.h - 40) * bar}
            rx={2}
            width={step() * 0.6}
            x={props.x + 22 + index() * step()}
            y={props.y + props.h - 16 - (props.h - 40) * bar}
          />
        )}
      </For>
    </>
  );
}

const CHART_TEXT: DiagramText = {
  hue: "blue",
  alt: "green",
  title: "The chart reads cells, not the pivot",
  description:
    "The pivot table writes its result into cells. The chart points at a range of cells, so it redraws when those cells change, whether the pivot or your own edit changed them.",
};

/** Analysis: the chart reads a range of cells, which the pivot or an edit can change. */
export function ChartReadsCellsDiagram() {
  return (
    <Responsive
      narrow={{
        height: 430,
        draw: () => (
          <>
            <Box
              h={60}
              lines={["Writes its result", "into cells"]}
              title="Pivot table"
              w={168}
              x={4}
              y={4}
            />
            <Box
              class="alt-soft"
              h={60}
              lines={["Change any cell", "in the range"]}
              title="Your edit"
              w={168}
              x={188}
              y={4}
            />
            <Arrow class="hue-line" x1={88} x2={150} y1={68} y2={100} />
            <Arrow class="alt-line" x1={272} x2={210} y1={68} y2={100} />
            <text class="caption strong" x={120} y={118}>
              The chart's range
            </text>
            <Sheet
              ch={18}
              cols={2}
              cw={60}
              fill={<rect class="hue-tint" height={108} width={60} x={180} y={140} />}
              head={14}
              rows={6}
              x={120}
              y={126}
            />
            <Arrow class="hue-line" label="redraws" x1={180} x2={180} y1={252} y2={286} />
            <MiniChart h={130} w={240} x={60} y={292} />
          </>
        ),
      }}
      text={CHART_TEXT}
      wide={{
        height: 210,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <Box
              h={60}
              lines={["Writes its result", "into cells"]}
              title="Pivot table"
              w={170}
              x={8}
              y={14}
            />
            <Box
              class="alt-soft"
              h={60}
              lines={["Change any cell", "in the range"]}
              title="Your edit"
              w={170}
              x={8}
              y={126}
            />
            <Arrow class="hue-line" x1={182} x2={242} y1={46} y2={70} />
            <Arrow class="alt-line" x1={182} x2={242} y1={156} y2={134} />
            <text class="caption strong" x={248} y={28}>
              The chart's range
            </text>
            <Sheet
              ch={20}
              cols={2}
              cw={56}
              fill={<rect class="hue-tint" height={120} width={56} x={304} y={54} />}
              head={14}
              rows={6}
              x={248}
              y={40}
            />
            <Arrow class="hue-line" label="redraws" x1={366} x2={446} y1={110} y2={110} />
            <MiniChart h={160} w={236} x={452} y={30} />
          </>
        ),
      }}
    />
  );
}

const DASHBOARD_TEXT: DiagramText = {
  hue: "teal",
  alt: "amber",
  title: "How a dashboard filters together",
  description:
    "A dashboard sheet's pivots compute from the Orders table without writing output cells. One slicer on Region filters every pivot, PivotChart and KPI card whose table reaches its column, and its selection is saved and undone. A KPI card shows a data model measure in the slicers' filter context.",
};

const DASHBOARD_TILES = [
  ["Pivot", "Computes from Orders,", "no output cells"],
  ["PivotChart", "Filtered with", "its pivot"],
  ["KPI card", "A measure in the", "slicers' filter context"],
] as const;

/** The slicer panel: a title and four region chips, two selected. */
function SlicerPanel(props: Readonly<{ x: number; y: number; w: number; columns: number }>) {
  const regions = ["North", "South", "East", "West"] as const;
  const chipWidth = () => (props.w - 24 - (props.columns - 1) * 8) / props.columns;
  return (
    <>
      <Panel h={props.columns === 1 ? 196 : 124} w={props.w} x={props.x} y={props.y} />
      <text class="heading" x={props.x + 12} y={props.y + 22}>
        Slicer: Region
      </text>
      <For each={regions}>
        {(region, index) => (
          <Chip
            class={index() < 2 ? "hue-soft" : "panel"}
            text={region}
            w={chipWidth()}
            x={props.x + 12 + (index() % props.columns) * (chipWidth() + 8)}
            y={props.y + 36 + Math.floor(index() / props.columns) * 32}
          />
        )}
      </For>
      <text class="caption" x={props.x + 12} y={props.y + (props.columns === 1 ? 186 : 114)}>
        Saved and undone
      </text>
    </>
  );
}

/** Dashboards: one slicer filters the pivots, charts and KPI cards that reach its column. */
export function DashboardDiagram() {
  return (
    <Responsive
      narrow={{
        height: 500,
        draw: () => (
          <>
            <Box h={56} lines={["The source rows"]} title="Orders table" w={352} x={4} y={4} />
            <Arrow class="ink-line" x1={180} x2={180} y1={64} y2={80} />
            <SlicerPanel columns={2} w={352} x={4} y={84} />
            <For each={DASHBOARD_TILES}>
              {([title, first, second], index) => (
                <>
                  <Arrow
                    class="hue-line"
                    x1={180}
                    x2={180}
                    y1={212 + index() * 84}
                    y2={224 + index() * 84}
                  />
                  <Box
                    class={index() === 2 ? "alt-soft" : "panel"}
                    h={60}
                    lines={[first, second]}
                    title={title}
                    w={352}
                    x={4}
                    y={228 + index() * 84}
                  />
                </>
              )}
            </For>
          </>
        ),
      }}
      text={DASHBOARD_TEXT}
      wide={{
        height: 236,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <Box h={60} lines={["The source rows"]} title="Orders table" w={150} x={8} y={88} />
            <Arrow x1={162} x2={196} y1={118} y2={118} />
            <SlicerPanel columns={1} w={170} x={200} y={18} />
            <For each={DASHBOARD_TILES}>
              {([title, first, second], index) => (
                <>
                  <Arrow class="hue-line" x1={374} x2={426} y1={116} y2={48 + index() * 76} />
                  <Box
                    class={index() === 2 ? "alt-soft" : "panel"}
                    h={60}
                    lines={[first, second]}
                    title={title}
                    w={262}
                    x={430}
                    y={18 + index() * 76}
                  />
                </>
              )}
            </For>
          </>
        ),
      }}
    />
  );
}

const QUERIES_TEXT: DiagramText = {
  hue: "amber",
  alt: "blue",
  title: "What a refresh does",
  description:
    "A refresh loads the source only through your fetchSource callback, with your credentials and network rules, runs the saved steps, such as Large orders keeping orders of 1,500 or more, and writes the table. Undo and redo restore the written values without another source load. A refresh that would grow a table over other cells writes nothing.",
};

const QUERY_CHAIN = [
  ["Your fetchSource", "Your credentials", "and network rules", "alt-soft"],
  ["Source", "The CSV feed", "", "panel"],
  ["Steps", "Large orders keeps", "1,500 or more", "hue-soft"],
  ["Table", "Written on", "the sheet", "panel"],
] as const;

/** Saved queries: the refresh path, and the two cases that load or write nothing. */
export function QueriesRefreshDiagram() {
  return (
    <Responsive
      narrow={{
        height: 512,
        draw: () => (
          <>
            <For each={QUERY_CHAIN}>
              {([title, first, second, tone], index) => (
                <>
                  <Box
                    class={tone}
                    h={66}
                    lines={second ? [first, second] : [first]}
                    title={title}
                    w={196}
                    x={4}
                    y={4 + index() * 84}
                  />
                  {index() < 3 && (
                    <Arrow
                      class="hue-line"
                      x1={102}
                      x2={102}
                      y1={72 + index() * 84}
                      y2={86 + index() * 84}
                    />
                  )}
                </>
              )}
            </For>
            <Arrow class="error-line dash" x1={204} x2={216} y1={206} y2={206} />
            <Box
              class="error-soft"
              h={82}
              lines={["A refresh that would", "grow over other", "cells writes nothing"]}
              title="Blocked"
              w={140}
              x={218}
              y={166}
            />
            <Arrow class="alt-line" x1={102} x2={102} y1={324} y2={338} />
            <Box
              class="alt-soft"
              h={66}
              lines={["Restore the values;", "no source load"]}
              title="Undo / redo"
              w={352}
              x={4}
              y={342}
            />
            <Box
              h={82}
              lines={[
                "With a Power Query codec,",
                "XLSX export writes the queries;",
                "import reads them back",
              ]}
              title="XLSX"
              w={352}
              x={4}
              y={422}
            />
          </>
        ),
      }}
      text={QUERIES_TEXT}
      wide={{
        height: 230,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <For each={QUERY_CHAIN}>
              {([title, first, second, tone], index) => (
                <>
                  <Box
                    class={tone}
                    h={64}
                    lines={second ? [first, second] : [first]}
                    title={title}
                    w={150}
                    x={8 + index() * 172}
                    y={14}
                  />
                  {index() < 3 && (
                    <Arrow
                      class="hue-line"
                      x1={162 + index() * 172}
                      x2={176 + index() * 172}
                      y1={46}
                      y2={46}
                    />
                  )}
                </>
              )}
            </For>
            <Arrow class="error-line dash" x1={426} x2={426} y1={82} y2={134} />
            <Box
              class="error-soft"
              h={76}
              lines={["A refresh that would grow", "over other cells writes", "nothing"]}
              title="Blocked"
              w={160}
              x={352}
              y={138}
            />
            <Arrow class="alt-line" x1={598} x2={598} y1={82} y2={134} />
            <Box
              class="alt-soft"
              h={76}
              lines={["Restores the values;", "no new source load"]}
              title="Undo / redo"
              w={158}
              x={530}
              y={138}
            />
            <Box
              h={76}
              lines={[
                "With a Power Query codec,",
                "XLSX export writes the queries;",
                "import reads them back",
              ]}
              title="XLSX"
              w={322}
              x={8}
              y={138}
            />
          </>
        ),
      }}
    />
  );
}

/** A small table of sorted rows with a formula column; `moved` highlights a row. */
function SortTable(
  props: Readonly<{ x: number; y: number; labels: readonly string[]; formulas: boolean }>,
) {
  return (
    <>
      <Sheet
        ch={28}
        cols={3}
        cw={88}
        head={16}
        rows={props.labels.length}
        x={props.x}
        y={props.y}
      />
      <For each={props.labels}>
        {(label, index) => (
          <>
            <text class="small" x={props.x + 10} y={props.y + 34 + index() * 28}>
              {label}
            </text>
            <Bar w={30 + index() * 14} x={props.x + 98} y={props.y + 28 + index() * 28} />
            {props.formulas && (
              <text class="small alt-text" x={props.x + 186} y={props.y + 34 + index() * 28}>
                =D·E
              </text>
            )}
          </>
        )}
      </For>
    </>
  );
}

const SORT_TEXT: DiagramText = {
  hue: "pink",
  alt: "blue",
  title: "Sorting the cells versus sorting only the view",
  description:
    "Sorting the cells moves values, formulas, styles and notes with their row; a formula that reads its own row keeps reading it, formulas outside the range read the new order, and collaborators receive the sort as one transaction. Sorting only the view leaves the cells in place; the view sort is saved with the sheet and exports to Excel as its sort state.",
};

/** One sort mode: a title, a table and its three facts. */
function SortPanel(
  props: Readonly<{
    x: number;
    y: number;
    w: number;
    title: string;
    labels: readonly string[];
    formulas: boolean;
    facts: readonly string[];
  }>,
) {
  return (
    <>
      <Panel h={232} w={props.w} x={props.x} y={props.y} />
      <text class="heading" x={props.x + 14} y={props.y + 24}>
        {props.title}
      </text>
      <SortTable
        formulas={props.formulas}
        labels={props.labels}
        x={props.x + 14}
        y={props.y + 38}
      />
      <For each={props.facts}>
        {(fact, index) => (
          <text class="caption" x={props.x + 14} y={props.y + 170 + index() * 18}>
            {fact}
          </text>
        )}
      </For>
    </>
  );
}

const SORT_CELLS_FACTS = [
  "Values, formulas, styles and notes",
  "move with their row; outside formulas",
  "read the new order. One transaction.",
] as const;
const SORT_VIEW_FACTS = [
  "The cells stay where they are.",
  "Saved with the sheet; exports",
  "to Excel as its sort state.",
] as const;

/** Sort in place: the cells move with their formulas, or only the view changes. */
export function SortModesDiagram() {
  return (
    <Responsive
      narrow={{
        height: 484,
        draw: () => (
          <>
            <SortPanel
              facts={SORT_CELLS_FACTS}
              formulas
              labels={["row 2", "row 3", "row 4"]}
              title="Sort the cells"
              w={352}
              x={4}
              y={4}
            />
            <path class="hue-line" d={`M314 128c24 0 24-56 0-56${head(314, 72, 180)}`} />
            <SortPanel
              facts={SORT_VIEW_FACTS}
              formulas={false}
              labels={["row 4", "row 2", "row 3"]}
              title="Sort the view only"
              w={352}
              x={4}
              y={248}
            />
          </>
        ),
      }}
      text={SORT_TEXT}
      wide={{
        height: 242,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <SortPanel
              facts={SORT_CELLS_FACTS}
              formulas
              labels={["row 2", "row 3", "row 4"]}
              title="Sort the cells"
              w={334}
              x={8}
              y={4}
            />
            <path class="hue-line" d={`M306 128c22 0 22-56 0-56${head(306, 72, 180)}`} />
            <SortPanel
              facts={SORT_VIEW_FACTS}
              formulas={false}
              labels={["row 4", "row 2", "row 3"]}
              title="Sort the view only"
              w={334}
              x={358}
              y={4}
            />
          </>
        ),
      }}
    />
  );
}

const ENGINE_FAMILIES_TEXT: DiagramText = {
  hue: "green",
  alt: "violet",
  title: "Where the functions run",
  description:
    "The full engine, @sheetwrite/formulas, contains everything in the default engine, @sheetwrite/wasm. LOOKUP, TRIMRANGE, the information functions and the new math functions run in both. Engineering, financial, the Excel 2007 statistics names, byte text and GETPIVOTDATA run in the full engine only.",
};

const BOTH_ENGINES = ["LOOKUP", "TRIMRANGE", "Information", "New math"] as const;
const FULL_ONLY = [
  "Engineering",
  "Financial",
  "Excel 2007 statistics",
  "Byte text",
  "GETPIVOTDATA",
] as const;

/** Excel functions: the default engine inside the full one, with the families in each. */
export function FunctionEnginesDiagram() {
  return (
    <Responsive
      narrow={{
        height: 336,
        draw: () => (
          <>
            <rect class="hue-soft" height={326} rx={10} width={352} x={4} y={4} />
            <text class="heading" x={18} y={28}>
              Full engine
            </text>
            <text class="small" x={18} y={44}>
              @sheetwrite/formulas
            </text>
            <Panel h={122} w={324} x={18} y={58} />
            <text class="heading" x={32} y={82}>
              Default engine
            </text>
            <text class="small" x={32} y={98}>
              @sheetwrite/wasm · both engines
            </text>
            <For each={BOTH_ENGINES}>
              {(name, index) => (
                <Chip
                  class="panel"
                  text={name}
                  w={140}
                  x={32 + (index() % 2) * 152}
                  y={112 + Math.floor(index() / 2) * 32}
                />
              )}
            </For>
            <text class="caption strong" x={18} y={204}>
              Full engine only
            </text>
            <For each={FULL_ONLY}>
              {(name, index) => (
                <Chip
                  class="alt-soft"
                  text={name}
                  w={index() === 2 ? 324 : 156}
                  x={index() === 2 ? 18 : 18 + (index() % 2) * 168}
                  y={216 + Math.floor((index() + (index() > 2 ? 1 : 0)) / 2) * 32}
                />
              )}
            </For>
          </>
        ),
      }}
      text={ENGINE_FAMILIES_TEXT}
      wide={{
        height: 190,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <rect class="hue-soft" height={180} rx={10} width={684} x={8} y={4} />
            <text class="heading" x={24} y={28}>
              Full engine
            </text>
            <text class="small" x={110} y={28}>
              @sheetwrite/formulas
            </text>
            <Panel h={128} w={300} x={24} y={42} />
            <text class="heading" x={38} y={66}>
              Default engine
            </text>
            <text class="small" x={38} y={82}>
              @sheetwrite/wasm · runs in both
            </text>
            <For each={BOTH_ENGINES}>
              {(name, index) => (
                <Chip
                  class="panel"
                  text={name}
                  w={130}
                  x={38 + (index() % 2) * 140}
                  y={98 + Math.floor(index() / 2) * 34}
                />
              )}
            </For>
            <text class="caption strong" x={348} y={66}>
              Full engine only
            </text>
            <For each={FULL_ONLY}>
              {(name, index) => (
                <Chip
                  class="alt-soft"
                  text={name}
                  w={index() === 2 ? 320 : 155}
                  x={index() === 2 ? 348 : 348 + (index() % 2) * 165}
                  y={80 + Math.floor((index() + (index() > 2 ? 1 : 0)) / 2) * 34}
                />
              )}
            </For>
          </>
        ),
      }}
    />
  );
}

const VERSIONS_TEXT: DiagramText = {
  hue: "teal",
  alt: "pink",
  title: "How versions are kept",
  description:
    "The document authority journals each committed change in the archive with its author; edits that are not committed never reach a version. Versions are stored in content-addressed chunks, so unchanged cells are shared between versions. A restore is one undoable change and one synced transaction, so a collaborator's client receives it like any other edit.",
};

/** Two versions as rows of chunks; the second shares all but one with the first. */
function ChunkRows(props: Readonly<{ x: number; y: number; size: number }>) {
  return (
    <>
      <For each={["v1", "v2"] as const}>
        {(version, row) => (
          <>
            <text class="small strong" x={props.x} y={props.y + 16 + row() * 46}>
              {version}
            </text>
            <For each={[0, 1, 2, 3, 4]}>
              {(chunk) => (
                <rect
                  class={row() === 1 && chunk === 3 ? "alt-soft" : "hue-soft"}
                  height={props.size}
                  rx={4}
                  width={props.size}
                  x={props.x + 28 + chunk * (props.size + 10)}
                  y={props.y + row() * 46}
                />
              )}
            </For>
          </>
        )}
      </For>
      <path
        class="rule dash"
        d={[0, 1, 2, 4]
          .map(
            (chunk) =>
              `M${props.x + 28 + chunk * (props.size + 10) + props.size / 2} ${props.y + props.size}v${46 - props.size}`,
          )
          .join("")}
      />
    </>
  );
}

/** Version history: committed changes journalled by author, stored as shared chunks, restored as one edit. */
export function VersionsDiagram() {
  return (
    <Responsive
      narrow={{
        height: 470,
        draw: () => (
          <>
            <Box
              h={56}
              lines={["Each with its author"]}
              title="Committed edits"
              w={168}
              x={4}
              y={4}
            />
            <rect class="rule dash" fill="none" height={56} rx={8} width={168} x={188} y={4} />
            <text class="heading" x={200} y={26}>
              Not committed
            </text>
            <text class="caption" x={200} y={45}>
              Never a version
            </text>
            <Arrow class="hue-line" x1={88} x2={88} y1={64} y2={80} />
            <Box
              class="hue-soft"
              h={56}
              lines={["Journals each change"]}
              title="Document authority"
              w={352}
              x={4}
              y={84}
            />
            <Arrow class="hue-line" x1={180} x2={180} y1={144} y2={160} />
            <Panel h={130} w={352} x={4} y={164} />
            <text class="caption strong" x={16} y={186}>
              Content-addressed chunks
            </text>
            <ChunkRows size={26} x={16} y={198} />
            <Box
              class="alt-soft"
              h={76}
              lines={[
                "One undoable change and one",
                "synced transaction: a teammate's",
                "client gets it like any edit",
              ]}
              title="Restore"
              w={352}
              x={4}
              y={310}
            />
            <text class="caption" x={4} y={414}>
              A compare loads a small WASM
            </text>
            <text class="caption" x={4} y={430}>
              kernel the first time it runs.
            </text>
          </>
        ),
      }}
      text={VERSIONS_TEXT}
      wide={{
        height: 250,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <Box
              h={60}
              lines={["Each with its author"]}
              title="Committed edits"
              w={170}
              x={8}
              y={14}
            />
            <rect class="rule dash" fill="none" height={60} rx={8} width={170} x={8} y={92} />
            <text class="heading" x={20} y={114}>
              Not committed
            </text>
            <text class="caption" x={20} y={133}>
              Never reaches a version
            </text>
            <Arrow class="hue-line" x1={182} x2={210} y1={44} y2={44} />
            <Box
              class="hue-soft"
              h={60}
              lines={["Journals each", "change in the archive"]}
              title="Authority"
              w={160}
              x={214}
              y={14}
            />
            <Arrow class="hue-line" x1={378} x2={404} y1={44} y2={44} />
            <Panel h={124} w={284} x={408} y={10} />
            <text class="caption strong" x={420} y={32}>
              Content-addressed chunks
            </text>
            <ChunkRows size={26} x={420} y={44} />
            <text class="caption" x={214} y={104}>
              A compare loads a small
            </text>
            <text class="caption" x={214} y={120}>
              WASM kernel the first time.
            </text>
            <Box
              class="alt-soft"
              h={64}
              lines={[
                "One undoable change and one synced transaction:",
                "a teammate's client gets it like any other edit",
              ]}
              title="Restore"
              w={484}
              x={208}
              y={166}
            />
          </>
        ),
      }}
    />
  );
}

const ENGINE_API_TEXT: DiagramText = {
  hue: "blue",
  alt: "green",
  title: "Two engines, one API",
  description:
    "@sheetwrite/wasm is the default engine; @sheetwrite/formulas is the same engine with the full function set. Pass one to initSheetwrite once, before you create a grid; the grid then calculates with it.",
};

/** Formula analysis: either engine goes through the same initSheetwrite call, once, before the grid. */
export function EngineApiDiagram() {
  return (
    <Responsive
      narrow={{
        height: 330,
        draw: () => (
          <>
            <Box
              h={56}
              lines={["The default engine"]}
              title="@sheetwrite/wasm"
              w={168}
              x={4}
              y={4}
            />
            <Box
              class="hue-soft"
              h={56}
              lines={["Same engine, full set"]}
              title="@sheetwrite/formulas"
              w={168}
              x={188}
              y={4}
            />
            <Arrow class="ink-line" x1={88} x2={160} y1={64} y2={96} />
            <Arrow class="hue-line" x1={272} x2={200} y1={64} y2={96} />
            <Box
              class="hue-soft"
              code={["initSheetwrite({ engine })"]}
              h={64}
              lines={["Once, before the first grid"]}
              title="Select"
              w={352}
              x={4}
              y={100}
            />
            <Arrow class="hue-line" x1={180} x2={180} y1={168} y2={190} />
            <Box
              code={["createGrid(host, { workbook })"]}
              h={64}
              lines={["Calculates with that engine"]}
              title="Create the grid"
              w={352}
              x={4}
              y={194}
            />
          </>
        ),
      }}
      text={ENGINE_API_TEXT}
      wide={{
        height: 170,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <Box
              h={60}
              lines={["The default engine"]}
              title="@sheetwrite/wasm"
              w={190}
              x={8}
              y={8}
            />
            <Box
              class="hue-soft"
              h={60}
              lines={["Same engine, full set"]}
              title="@sheetwrite/formulas"
              w={190}
              x={8}
              y={96}
            />
            <Arrow class="ink-line" x1={202} x2={242} y1={38} y2={70} />
            <Arrow class="hue-line" x1={202} x2={242} y1={126} y2={98} />
            <Box
              class="hue-soft"
              code={["initSheetwrite({ engine })"]}
              h={64}
              lines={["Once, before the first grid"]}
              title="Select"
              w={210}
              x={246}
              y={52}
            />
            <Arrow class="hue-line" x1={460} x2={484} y1={84} y2={84} />
            <Box
              code={["createGrid(host, { workbook })"]}
              h={64}
              lines={["Calculates with that engine"]}
              title="Create the grid"
              w={204}
              x={488}
              y={52}
            />
          </>
        ),
      }}
    />
  );
}

const STORAGE_TEXT: DiagramText = {
  hue: "teal",
  alt: "violet",
  title: "What the browser database keeps",
  description:
    "IndexedDB holds a snapshot record and an operation tail capped by record count and bytes; crossing either bound folds the tail into one compacted snapshot record. Unacknowledged local commits wait in a durable pending queue. Closing and reopening the session brings back committed state and the pending queue exactly once.",
};

/** A labelled gauge: a track, a fill and a bound marker. */
function Gauge(props: Readonly<{ x: number; y: number; w: number; label: string; fill: number }>) {
  return (
    <>
      <text class="caption" x={props.x} y={props.y}>
        {props.label}
      </text>
      <rect class="soft" height={10} rx={5} width={props.w} x={props.x} y={props.y + 8} />
      <rect
        class="hue"
        height={10}
        rx={5}
        width={props.w * props.fill}
        x={props.x}
        y={props.y + 8}
      />
      <path class="error-line" d={`M${props.x + props.w * 0.85} ${props.y + 4}v18`} />
    </>
  );
}

/** Database: the snapshot, the bounded operation tail folded into it, the pending queue and reload. */
export function StorageDiagram() {
  const tail = (x: number, y: number) => (
    <For each={[0, 1, 2, 3, 4]}>
      {(index) => <rect class="alt-soft" height={30} rx={4} width={20} x={x + index * 26} y={y} />}
    </For>
  );
  return (
    <Responsive
      narrow={{
        height: 408,
        draw: () => (
          <>
            <Panel h={292} w={352} x={4} y={4} />
            <text class="heading" x={16} y={28}>
              IndexedDB
            </text>
            <Box
              class="hue-soft"
              h={50}
              lines={["Compacted state"]}
              title="Snapshot"
              w={140}
              x={16}
              y={44}
            />
            <text class="caption strong" x={176} y={62}>
              Operation tail
            </text>
            {tail(176, 72)}
            <path class="hue-line" d={`M230 108c0 30-60 30-110 0${head(120, 108, -150)}`} />
            <text class="caption" x={16} y={150}>
              Crossing a bound folds the tail
            </text>
            <Gauge fill={0.6} label="Records" w={324} x={16} y={176} />
            <Gauge fill={0.45} label="Bytes" w={324} x={16} y={214} />
            <Box h={42} lines={[]} title="Pending queue: durable" w={324} x={16} y={242} />
            <Arrow class="hue-line" x1={180} x2={180} y1={300} y2={318} />
            <Box
              class="alt-soft"
              h={76}
              lines={["Committed state and the", "pending queue come back", "exactly once"]}
              title="Reopen or reload"
              w={352}
              x={4}
              y={322}
            />
          </>
        ),
      }}
      text={STORAGE_TEXT}
      wide={{
        height: 230,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <Panel h={214} w={470} x={8} y={8} />
            <text class="heading" x={22} y={32}>
              IndexedDB
            </text>
            <Box
              class="hue-soft"
              h={56}
              lines={["Compacted state"]}
              title="Snapshot"
              w={140}
              x={22}
              y={46}
            />
            <text class="caption strong" x={186} y={62}>
              Operation tail
            </text>
            {tail(186, 72)}
            <path class="hue-line" d={`M248 106c0 26-56 26-96 0${head(152, 106, -150)}`} />
            <Gauge fill={0.6} label="Records" w={140} x={326} y={60} />
            <Gauge fill={0.45} label="Bytes" w={140} x={326} y={100} />
            <text class="caption" x={186} y={148}>
              Crossing either bound folds the tail
            </text>
            <Box
              h={42}
              lines={[]}
              title="Pending queue: unacknowledged, durable"
              w={444}
              x={22}
              y={164}
            />
            <Arrow class="hue-line" x1={482} x2={516} y1={114} y2={114} />
            <Box
              class="alt-soft"
              h={92}
              lines={["Committed state and the", "pending queue come back", "exactly once"]}
              title="Reopen or reload"
              w={172}
              x={520}
              y={68}
            />
          </>
        ),
      }}
    />
  );
}

const IMPORT_TEXT: DiagramText = {
  hue: "green",
  alt: "amber",
  title: "How the 10,000-row import loads",
  description:
    "Inserting the 10,000 rows is one commit. Their 50,000 cell values then load in batches of 1,800 rows, because one Grid transaction accepts a bounded number of operations.",
};

/** Six batches: five of 1,800 rows and the last 1,000. */
const BATCHES = [1800, 1800, 1800, 1800, 1800, 1000] as const;

/** Host-owned rows: the insert is one commit; the values follow in bounded batches. */
export function HostImportDiagram() {
  const batches = (x: number, y: number, unit: number, perRow: number) => (
    <For each={BATCHES}>
      {(rows, index) => (
        <>
          <rect
            class="hue"
            height={28}
            rx={5}
            width={rows * unit}
            x={x + (index() % perRow) * (1800 * unit + 8)}
            y={y + Math.floor(index() / perRow) * 36}
          />
          <text
            class="small on-hue"
            x={x + 8 + (index() % perRow) * (1800 * unit + 8)}
            y={y + 18 + Math.floor(index() / perRow) * 36}
          >
            {rows.toLocaleString("en")}
          </text>
        </>
      )}
    </For>
  );
  return (
    <Responsive
      narrow={{
        height: 250,
        draw: () => (
          <>
            <Box
              class="hue-soft"
              h={56}
              lines={["One commit"]}
              title="Insert 10,000 rows"
              w={352}
              x={4}
              y={4}
            />
            <Arrow class="hue-line" x1={180} x2={180} y1={64} y2={80} />
            <text class="caption strong" x={4} y={100}>
              50,000 values, in batches of 1,800 rows
            </text>
            {batches(4, 112, 0.062, 3)}
            <text class="caption" x={4} y={208}>
              One Grid transaction accepts a
            </text>
            <text class="caption" x={4} y={224}>
              bounded number of operations.
            </text>
          </>
        ),
      }}
      text={IMPORT_TEXT}
      wide={{
        height: 130,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <Box
              class="hue-soft"
              h={64}
              lines={["One commit"]}
              title="Insert 10,000 rows"
              w={170}
              x={8}
              y={20}
            />
            <Arrow class="hue-line" x1={182} x2={212} y1={52} y2={52} />
            <text class="caption strong" x={216} y={30}>
              50,000 values, in batches of 1,800 rows
            </text>
            {batches(216, 40, 0.042, 6)}
            <text class="caption" x={216} y={100}>
              One Grid transaction accepts a bounded number of operations.
            </text>
          </>
        ),
      }}
    />
  );
}

const FORMATTING_TEXT: DiagramText = {
  hue: "pink",
  alt: "green",
  title: "How fonts and number formats behave",
  description:
    "Georgia, Arial and Courier New sit beside the theme font, and a family the browser does not have falls back to it. A number format changes how a number is shown, not the stored number: a currency column shows its format, a cell can opt out with General, and a negative variance keeps its minus sign as well as its conditional fill.",
};

const FONT_ROWS = [
  ["Georgia", "Georgia, serif"],
  ["Arial", "Arial, sans-serif"],
  ["Courier New", "'Courier New', monospace"],
] as const;

/** The fonts panel: three families and the fallback. */
function FontsPanel(props: Readonly<{ x: number; y: number; w: number }>) {
  return (
    <>
      <Panel h={200} w={props.w} x={props.x} y={props.y} />
      <text class="heading" x={props.x + 14} y={props.y + 24}>
        Fonts
      </text>
      <For each={FONT_ROWS}>
        {([name, family], index) => (
          <>
            <text class="caption" x={props.x + 14} y={props.y + 56 + index() * 30}>
              {name}
            </text>
            <text
              class="strong"
              style={{ "font-family": family, "font-size": "15px", "font-weight": 400 }}
              x={props.x + 120}
              y={props.y + 56 + index() * 30}
            >
              Revenue 1,250
            </text>
          </>
        )}
      </For>
      <rect
        class="soft"
        height={44}
        rx={6}
        width={props.w - 28}
        x={props.x + 14}
        y={props.y + 144}
      />
      <text class="caption" x={props.x + 24} y={props.y + 163}>
        A family the browser lacks
      </text>
      <text class="caption strong" x={props.x + 24} y={props.y + 180}>
        falls back to the theme font
      </text>
    </>
  );
}

/** The number formats panel: one stored number, three displays. */
function FormatsPanel(props: Readonly<{ x: number; y: number; w: number }>) {
  const rows = [
    ["Currency column", "$1,234.50", "strong"],
    ["G3: General", "1234.5", "strong"],
    ["Negative variance", "-42.00", "hue-text"],
  ] as const;
  return (
    <>
      <Panel h={200} w={props.w} x={props.x} y={props.y} />
      <text class="heading" x={props.x + 14} y={props.y + 24}>
        Number formats
      </text>
      <Chip class="alt-soft" text="stored: 1234.5" x={props.x + 14} y={props.y + 36} />
      <For each={rows}>
        {([label, shown, tone], index) => (
          <>
            <text class="caption" x={props.x + 14} y={props.y + 94 + index() * 30}>
              {label}
            </text>
            <rect
              class={index() === 2 ? "hue-tint" : "panel"}
              height={24}
              rx={3}
              width={96}
              x={props.x + props.w - 110}
              y={props.y + 78 + index() * 30}
            />
            <text
              class={`small ${tone}`}
              text-anchor="end"
              x={props.x + props.w - 20}
              y={props.y + 94 + index() * 30}
            >
              {shown}
            </text>
          </>
        )}
      </For>
      <text class="caption" x={props.x + 14} y={props.y + 186}>
        The display changes; the number doesn't.
      </text>
    </>
  );
}

/** Formatting: fonts and their fallback, and number formats that change only the display. */
export function FormattingDiagram() {
  return (
    <Responsive
      narrow={{
        height: 420,
        draw: () => (
          <>
            <FontsPanel w={352} x={4} y={4} />
            <FormatsPanel w={352} x={4} y={214} />
          </>
        ),
      }}
      text={FORMATTING_TEXT}
      wide={{
        height: 212,
        width: EXPLAIN_WIDE,
        draw: () => (
          <>
            <FontsPanel w={334} x={8} y={4} />
            <FormatsPanel w={334} x={358} y={4} />
          </>
        ),
      }}
    />
  );
}
