// Diagrams for the docs sections that explain how something works: one per
// mechanism, beside the section's text. Every label comes from that section.
import { For, type JSX } from "solid-js";

import { head, Panel, Sheet } from "./Art.js";
import { Arrow, Box, type DiagramText, NARROW, Responsive } from "./diagram-kit.js";

/** Diagrams sit in the reading column, about 46rem wide. */
const COLUMN = 700;

/** One step of a flow: a box with a heading, caption lines and code lines. */
interface FlowStep {
  readonly title: string;
  readonly lines?: readonly string[];
  readonly code?: readonly string[];
  readonly tone?: string;
}

/** A side outcome drawn under one step, reached by its own arrow. */
interface FlowBranch {
  readonly from: number;
  readonly step: FlowStep;
  readonly arrow?: string;
}

const stepHeight = (step: FlowStep) =>
  34 + ((step.lines?.length ?? 0) + (step.code?.length ?? 0)) * 16 + 6;
const rowHeight = (steps: readonly FlowStep[]) => Math.max(...steps.map(stepHeight));

/**
 * A left-to-right flow of steps, with optional outcomes under some steps; on
 * small screens the steps run top to bottom and the outcomes follow them.
 */
function FlowDiagram(
  props: Readonly<{
    text: DiagramText;
    steps: readonly FlowStep[];
    branches?: readonly FlowBranch[];
    note?: string;
  }>,
) {
  const branches = () => props.branches ?? [];
  const width = () => (COLUMN - 16 - (props.steps.length - 1) * 18) / props.steps.length;
  const mainHeight = () => rowHeight(props.steps);
  const branchHeight = () =>
    branches().length === 0 ? 0 : rowHeight(branches().map((branch) => branch.step));
  const wideHeight = () =>
    8 + mainHeight() + (branches().length === 0 ? 0 : 40 + branchHeight()) + (props.note ? 36 : 12);
  const narrowLayout = () => {
    let y = 4;
    const steps = props.steps.map((step) => {
      const placed = { step, y, h: stepHeight(step) };
      y += placed.h + 26;
      return placed;
    });
    const outcomes = branches().map((branch) => {
      const placed = { branch, y, h: stepHeight(branch.step) };
      y += placed.h + 14;
      return placed;
    });
    return { steps, outcomes, height: y + (props.note ? 40 : 0) };
  };
  return (
    <Responsive
      narrow={{
        height: narrowLayout().height,
        draw: () => (
          <>
            <For each={narrowLayout().steps}>
              {(placed, index) => (
                <>
                  <Box
                    class={placed.step.tone ?? "panel"}
                    code={placed.step.code}
                    h={placed.h}
                    lines={placed.step.lines}
                    title={placed.step.title}
                    w={NARROW - 8}
                    x={4}
                    y={placed.y}
                  />
                  {index() < props.steps.length - 1 && (
                    <Arrow
                      class="hue-line"
                      x1={180}
                      x2={180}
                      y1={placed.y + placed.h + 4}
                      y2={placed.y + placed.h + 20}
                    />
                  )}
                </>
              )}
            </For>
            <For each={narrowLayout().outcomes}>
              {(placed) => (
                <>
                  <path
                    class={placed.branch.arrow ?? "alt-line"}
                    d={`M14 ${placed.y - 8}v${placed.h / 2 + 8}h12${head(26, placed.y + placed.h / 2, 0)}`}
                  />
                  <Box
                    class={placed.branch.step.tone ?? "alt-soft"}
                    code={placed.branch.step.code}
                    h={placed.h}
                    lines={placed.branch.step.lines}
                    title={placed.branch.step.title}
                    w={NARROW - 36}
                    x={30}
                    y={placed.y}
                  />
                </>
              )}
            </For>
            {props.note && (
              <text class="caption" x={4} y={narrowLayout().height - 16}>
                {props.note}
              </text>
            )}
          </>
        ),
      }}
      text={props.text}
      wide={{
        height: wideHeight(),
        width: COLUMN,
        draw: () => (
          <>
            <For each={props.steps}>
              {(step, index) => (
                <>
                  <Box
                    class={step.tone ?? "panel"}
                    code={step.code}
                    h={mainHeight()}
                    lines={step.lines}
                    title={step.title}
                    w={width()}
                    x={8 + index() * (width() + 18)}
                    y={8}
                  />
                  {index() < props.steps.length - 1 && (
                    <Arrow
                      class="hue-line"
                      x1={10 + width() + index() * (width() + 18)}
                      x2={24 + width() + index() * (width() + 18)}
                      y1={8 + mainHeight() / 2}
                      y2={8 + mainHeight() / 2}
                    />
                  )}
                </>
              )}
            </For>
            <For each={branches()}>
              {(branch) => (
                <>
                  <Arrow
                    class={branch.arrow ?? "alt-line"}
                    x1={8 + branch.from * (width() + 18) + width() / 2}
                    x2={8 + branch.from * (width() + 18) + width() / 2}
                    y1={12 + mainHeight()}
                    y2={44 + mainHeight()}
                  />
                  <Box
                    class={branch.step.tone ?? "alt-soft"}
                    code={branch.step.code}
                    h={branchHeight()}
                    lines={branch.step.lines}
                    title={branch.step.title}
                    w={width()}
                    x={8 + branch.from * (width() + 18)}
                    y={48 + mainHeight()}
                  />
                </>
              )}
            </For>
            {props.note && (
              <text class="caption" x={8} y={wideHeight() - 12}>
                {props.note}
              </text>
            )}
          </>
        ),
      }}
    />
  );
}

/** A labelled mini grid: a panel with a cell grid and a caption above. */
function GridPanel(
  props: Readonly<{ x: number; y: number; title: string; children?: JSX.Element }>,
) {
  return (
    <>
      <Panel h={196} w={330} x={props.x} y={props.y} />
      <text class="heading" x={props.x + 14} y={props.y + 24}>
        {props.title}
      </text>
      <Sheet ch={22} cols={4} cw={60} head={14} rows={5} x={props.x + 14} y={props.y + 36} />
      {props.children}
    </>
  );
}

const SPILL_TEXT: DiagramText = {
  hue: "blue",
  alt: "red",
  title: "A spill, and a blocked spill",
  description:
    "A formula that returns an array spills: the formula cell is the anchor, and the result fills the cells below it. A1# refers to the current spill and follows it when it grows or shrinks. Spills are atomic: if any destination cell is not empty, the anchor shows #SPILL! and no partial result appears.",
};

/** One spill panel: the anchor and its range, or the anchor blocked by a value. */
function SpillPanel(props: Readonly<{ x: number; y: number; blocked: boolean }>) {
  const x = () => props.x + 14;
  const y = () => props.y + 50;
  return (
    <GridPanel title={props.blocked ? "A cell is in the way" : "The spill"} x={props.x} y={props.y}>
      {props.blocked ? (
        <>
          <rect class="error-soft" height={22} width={60} x={x()} y={y()} />
          <text class="small strong" x={x() + 6} y={y() + 15}>
            #SPILL!
          </text>
          <rect class="alt-soft" height={22} width={60} x={x()} y={y() + 44} />
          <text class="small strong" x={x() + 6} y={y() + 59}>
            text
          </text>
          <text class="caption" x={x() + 74} y={y() + 15}>
            no partial result
          </text>
        </>
      ) : (
        <>
          <rect class="hue-tint" height={88} width={60} x={x()} y={y()} />
          <rect class="hue" height={22} width={60} x={x()} y={y()} />
          <For each={[1, 2, 3, 4]}>
            {(value, index) => (
              <text
                class={index() === 0 ? "small on-hue" : "small strong"}
                x={x() + 8}
                y={y() + 15 + index() * 22}
              >
                {value}
              </text>
            )}
          </For>
          <rect class="hue-line dash" height={88} width={60} x={x()} y={y()} />
          <text class="small hue-text" x={x() + 74} y={y() + 15}>
            =SEQUENCE(4)
          </text>
          <text class="caption" x={x() + 74} y={y() + 59}>
            A1# is this range
          </text>
        </>
      )}
    </GridPanel>
  );
}

/** Calculation engine › Spills. */
export function SpillDiagram() {
  return (
    <Responsive
      narrow={{
        height: 412,
        draw: () => (
          <>
            <SpillPanel blocked={false} x={14} y={4} />
            <SpillPanel blocked x={14} y={210} />
          </>
        ),
      }}
      text={SPILL_TEXT}
      wide={{
        height: 206,
        width: COLUMN,
        draw: () => (
          <>
            <SpillPanel blocked={false} x={8} y={4} />
            <SpillPanel blocked x={362} y={4} />
          </>
        ),
      }}
    />
  );
}

const LOADING_TEXT: DiagramText = {
  hue: "amber",
  alt: "green",
  title: "A formula that reads cells not loaded yet",
  description:
    "With a windowed datasource, only some rows are in memory. A formula that reads cells that are not loaded yet shows #LOADING!, and calculates again when they arrive.",
};

/** Calculation engine › Paged data and #LOADING!. */
export function LoadingDiagram() {
  const stage = (x: number, y: number, loaded: boolean) => (
    <>
      <Panel h={180} w={330} x={x} y={y} />
      <text class="heading" x={x + 14} y={y + 24}>
        {loaded ? "The page arrives" : "Before the page loads"}
      </text>
      <rect class="hue-soft" height={44} rx={4} width={140} x={x + 14} y={y + 40} />
      <text class="small strong" x={x + 22} y={y + 58}>
        rows in memory
      </text>
      <text class="small" x={x + 22} y={y + 74}>
        =SUM(B900:B910)
      </text>
      <rect
        class={loaded ? "hue-soft" : "panel"}
        height={44}
        rx={4}
        width={140}
        x={x + 14}
        y={y + 120}
      />
      <text class="small strong" x={x + 22} y={y + 138}>
        rows 900–910
      </text>
      <text class="small" x={x + 22} y={y + 154}>
        {loaded ? "loaded" : "not loaded yet"}
      </text>
      <path class={loaded ? "hue-line" : "rule dash"} d={`M${x + 84} ${y + 116}v-28`} />
      <rect
        class={loaded ? "alt-soft" : "error-soft"}
        height={36}
        rx={6}
        width={140}
        x={x + 176}
        y={y + 44}
      />
      <text class="small strong" x={x + 188} y={y + 66}>
        {loaded ? "1,250 (calculated)" : "#LOADING!"}
      </text>
    </>
  );
  return (
    <Responsive
      narrow={{
        height: 372,
        draw: () => (
          <>
            {stage(14, 4, false)}
            {stage(14, 190, true)}
          </>
        ),
      }}
      text={LOADING_TEXT}
      wide={{
        height: 188,
        width: COLUMN,
        draw: () => (
          <>
            {stage(8, 4, false)}
            <Arrow class="hue-line" x1={342} x2={358} y1={94} y2={94} />
            {stage(362, 4, true)}
          </>
        ),
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
      branches={[
        {
          from: 0,
          step: { title: "No cell changes", lines: ["Nothing recalculates"], tone: "panel" },
          arrow: "rule dash",
        },
      ]}
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

/** Documents and operations: three ways operations reach the store, and snapshot hydration. */
export function DocumentOpsDiagram() {
  const sources = [
    ["Grid edits", ["Undo history;", "SyncCoordinator sends them"], "hue-soft"],
    ["Store.applyTransaction", ["Bypasses read-only", "and history"], "panel"],
    ["Remote operations", ['source: "remote";', "no history, not resent"], "alt-soft"],
  ] as const;
  const text: DiagramText = {
    hue: "blue",
    alt: "violet",
    title: "How operations and snapshots reach the document",
    description:
      "DocumentOp transactions reach one store reducer and one change-event shape from three places: grid edits, which enter undo history and are sent by SyncCoordinator; direct Store.applyTransaction calls, which bypass the grid's read-only and history policy; and remote operations, which carry source remote and enter neither history nor outgoing sync. A WorkbookSnapshot loads through a separate validated hydration path that recomputes once the whole graph exists and emits no event or undo entry.",
  };
  return (
    <Responsive
      narrow={{
        height: 512,
        draw: () => (
          <>
            <For each={sources}>
              {([title, lines, tone], index) => (
                <Box
                  class={tone}
                  h={66}
                  lines={lines}
                  title={title}
                  w={352}
                  x={4}
                  y={4 + index() * 78}
                />
              )}
            </For>
            <Arrow class="hue-line" x1={180} x2={180} y1={240} y2={258} />
            <Box
              code={["DocumentOp[]"]}
              h={66}
              lines={["One reducer, one change event"]}
              title="Store"
              w={352}
              x={4}
              y={262}
            />
            <Box
              class="hue-tint"
              code={["WorkbookSnapshot"]}
              h={98}
              lines={[
                "Validated hydration:",
                "recompute once the graph",
                "exists; no event, no undo",
              ]}
              title="Load a snapshot"
              w={352}
              x={4}
              y={350}
            />
            <Arrow class="ink-line dash" x1={180} x2={180} y1={346} y2={332} />
          </>
        ),
      }}
      text={text}
      wide={{
        height: 252,
        width: COLUMN,
        draw: () => (
          <>
            <For each={sources}>
              {([title, lines, tone], index) => (
                <>
                  <Box
                    class={tone}
                    h={66}
                    lines={lines}
                    title={title}
                    w={232}
                    x={8}
                    y={6 + index() * 80}
                  />
                  <Arrow class="hue-line" x1={244} x2={292} y1={39 + index() * 80} y2={110} />
                </>
              )}
            </For>
            <Box
              code={["DocumentOp[]"]}
              h={82}
              lines={["One reducer,", "one change event"]}
              title="Store"
              w={180}
              x={296}
              y={74}
            />
            <Box
              class="hue-tint"
              code={["WorkbookSnapshot"]}
              h={114}
              lines={[
                "Validated hydration:",
                "recompute once the",
                "graph exists; no",
                "event, no undo",
              ]}
              title="Load a snapshot"
              w={196}
              x={496}
              y={58}
            />
            <Arrow class="ink-line dash" x1={494} x2={480} y1={115} y2={115} />
          </>
        ),
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
  ["Read the cause or code", ["PersistenceError", "IndexedDbPendingCommit…"], "panel"],
  ["The grid keeps working", ["renderer-fallback", "worker → canvas"], "panel"],
] as const;

/** Error handling › Recovery by boundary. */
export function RecoveryDiagram() {
  const text: DiagramText = {
    hue: "red",
    alt: "amber",
    title: "What each error asks you to do",
    description:
      "Fix the input for SnapshotValidationError, DelimitedTextOptionsError and SyncProtocolError. Reduce the input or raise the named limit for SnapshotResourceError, DelimitedTextResourceError and XlsxResourceError. Load the pages an IncompleteDataError names. Drain pending work after SyncPendingCapacityError. Read the cause or code of PersistenceError and IndexedDbPendingCommitStorageError. A worker failure switches to the canvas renderer and emits renderer-fallback.",
  };
  return (
    <Responsive
      narrow={{
        height: 540,
        draw: () => (
          <For each={RECOVERY_GROUPS}>
            {([title, code, tone], index) => (
              <Box
                class={tone}
                code={code}
                h={34 + code.length * 16 + 6}
                lines={[]}
                title={title}
                w={352}
                x={4}
                y={4 + [0, 92, 184, 236, 288, 356][index()]}
              />
            )}
          </For>
        ),
      }}
      text={text}
      wide={{
        height: 206,
        width: COLUMN,
        draw: () => (
          <For each={RECOVERY_GROUPS}>
            {([title, code, tone], index) => (
              <Box
                class={tone}
                code={code}
                h={88}
                lines={[]}
                title={title}
                w={222}
                x={8 + (index() % 3) * 236}
                y={6 + Math.floor(index() / 3) * 104}
              />
            )}
          </For>
        ),
      }}
    />
  );
}

/** Runtime ownership › Virtualization & scaled scroll. */
export function VirtualScrollDiagram() {
  const text: DiagramText = {
    hue: "teal",
    alt: "amber",
    title: "Painting only the rows in view, past the browser's height cap",
    description:
      "Only the rows that intersect the viewport are painted: computeWindow turns the scroll offset and viewport height into a row range, padded by overscan rows on each side. Browsers cap an element's height, so the grid measures the real cap, pins its scroll sizer to it, and ScaledScroll maps the capped scrollbar position linearly onto every row.",
  };
  const draw = (x: number, y: number, narrow: boolean) => (
    <>
      <text class="caption strong" x={x} y={y + 12}>
        Every row
      </text>
      <rect class="panel" height={180} rx={6} width={40} x={x} y={y + 22} />
      <rect class="hue" height={8} width={40} x={x} y={y + 110} />
      <text class="caption strong" x={x + (narrow ? 120 : 140)} y={y + 12}>
        Scroll sizer, capped
      </text>
      <rect
        class="alt-soft"
        height={110}
        rx={6}
        width={40}
        x={x + (narrow ? 120 : 140)}
        y={y + 22}
      />
      <rect class="alt" height={6} width={40} x={x + (narrow ? 120 : 140)} y={y + 70} />
      <path
        class="ink-line dash"
        d={`M${x + 40} ${y + 22}L${x + (narrow ? 120 : 140)} ${y + 22}M${x + 40} ${y + 202}L${x + (narrow ? 120 : 140)} ${y + 132}`}
      />
      <text class="small" x={x + (narrow ? 50 : 54)} y={y + 120}>
        ScaledScroll
      </text>
      <text class="caption" x={x + (narrow ? 120 : 140)} y={y + 152}>
        measured by a probe,
      </text>
      <text class="caption" x={x + (narrow ? 120 : 140)} y={y + 168}>
        again on zoom
      </text>
    </>
  );
  const window = (x: number, y: number) => (
    <>
      <text class="caption strong" x={x} y={y + 12}>
        The painted window
      </text>
      <rect class="hue-tint" height={22} rx={3} width={190} x={x} y={y + 24} />
      <text class="small" x={x + 8} y={y + 39}>
        overscan rows
      </text>
      <rect class="hue-soft" height={70} rx={3} width={190} x={x} y={y + 50} />
      <text class="small strong" x={x + 8} y={y + 70}>
        viewport
      </text>
      <text class="small" x={x + 8} y={y + 86}>
        [start, end)
      </text>
      <rect class="hue-tint" height={22} rx={3} width={190} x={x} y={y + 124} />
      <text class="small" x={x + 8} y={y + 139}>
        overscan rows
      </text>
      <text class="small" x={x} y={y + 168}>
        OffsetIndex: O(log n) row ↔ offset
      </text>
    </>
  );
  return (
    <Responsive
      narrow={{
        height: 420,
        draw: () => (
          <>
            {draw(14, 4, true)}
            {window(14, 236)}
          </>
        ),
      }}
      text={text}
      wide={{
        height: 214,
        width: COLUMN,
        draw: () => (
          <>
            {draw(8, 4, false)}
            <path class="hue-line" d={`M48 118h400${head(448, 118, 0)}`} />
            {window(460, 30)}
          </>
        ),
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
  const text: DiagramText = {
    hue: "green",
    alt: "amber",
    title: "Which props update in place, and which make a new generation",
    description:
      "theme, readOnly, config, overscan and minColumns update the current grid in place, as do callbacks and sizing. Changing the identity of workbook, data, datasource, datasourceStorage, presentation, editors, protectionResolver, mutationPolicy or transactionResourceLimits makes a new generation with reason input-reset; renderer, workerUrl or renderers make one with reason renderer-reset.",
  };
  const columns = [
    [
      "Live: same generation",
      ["theme", "readOnly", "config", "overscan", "minColumns"],
      "hue-soft",
    ],
    [
      "New generation: input-reset",
      ["workbook", "data", "datasource", "presentation", "editors …"],
      "alt-soft",
    ],
    ["New generation: renderer-reset", ["renderer", "workerUrl", "renderers"], "alt-soft"],
  ] as const;
  return (
    <Responsive
      narrow={{
        height: 468,
        draw: () => (
          <For each={columns}>
            {([title, code, tone], index) => (
              <Box
                class={tone}
                code={code}
                h={34 + code.length * 16 + 6}
                lines={[]}
                title={title}
                w={352}
                x={4}
                y={4 + [0, 132, 264][index()]}
              />
            )}
          </For>
        ),
      }}
      text={text}
      wide={{
        height: 136,
        width: COLUMN,
        draw: () => (
          <For each={columns}>
            {([title, code, tone], index) => (
              <Box
                class={tone}
                code={code}
                h={120}
                lines={[]}
                title={title}
                w={222}
                x={8 + index() * 236}
                y={6}
              />
            )}
          </For>
        ),
      }}
    />
  );
}

/** CSV and TSV › Output and injection safety. */
export function CsvInjectionDiagram() {
  const rows = [
    ["Text  =1+1", "'=1+1", "error-soft"],
    ["Text  @SUM(A1)", "'@SUM(A1)", "error-soft"],
    ["Formula  =1+1", "2", "hue-soft"],
  ] as const;
  const text: DiagramText = {
    hue: "blue",
    alt: "red",
    title: "How CSV export keeps text from running as a formula",
    description:
      "For text values, a leading =, +, -, @, tab or carriage return is prefixed with a single quote, so the text =1+1 exports as '=1+1 and cannot reopen as a formula. A real formula cell exports its resolved value, so =1+1 exports as 2. CSV is UTF-8 with a byte-order mark and CRLF line endings.",
  };
  const draw = (x: number, y: number, w: number) => (
    <>
      <text class="caption strong" x={x} y={y + 12}>
        Cell
      </text>
      <text class="caption strong" x={x + w - 150} y={y + 12}>
        In the CSV
      </text>
      <For each={rows}>
        {([cell, out, tone], index) => (
          <>
            <rect
              class="panel"
              height={30}
              rx={5}
              width={w - 196}
              x={x}
              y={y + 24 + index() * 40}
            />
            <text class="small strong" x={x + 10} y={y + 43 + index() * 40}>
              {cell}
            </text>
            <path
              class="hue-line"
              d={`M${x + w - 190} ${y + 39 + index() * 40}h28${head(x + w - 162, y + 39 + index() * 40, 0)}`}
            />
            <rect
              class={tone}
              height={30}
              rx={5}
              width={150}
              x={x + w - 150}
              y={y + 24 + index() * 40}
            />
            <text class="small strong" x={x + w - 140} y={y + 43 + index() * 40}>
              {out}
            </text>
          </>
        )}
      </For>
      <text class="caption" x={x} y={y + 160}>
        Prefixed: a leading = + - @ tab or CR. UTF-8, BOM, CRLF.
      </text>
    </>
  );
  return (
    <Responsive
      narrow={{ height: 180, draw: () => draw(4, 4, 352) }}
      text={text}
      wide={{ height: 176, width: COLUMN, draw: () => draw(8, 4, 684) }}
    />
  );
}

/** Large files and streaming: a seekable file streams into a snapshot; an abort leaves nothing. */
export function StreamingImportDiagram() {
  return (
    <FlowDiagram
      branches={[
        {
          from: 1,
          arrow: "error-line dash",
          step: {
            title: "signal aborts",
            lines: ["Rejects with signal.reason;", "no partial snapshot"],
            tone: "error-soft",
          },
        },
      ]}
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
      branches={[
        {
          from: 0,
          arrow: "error-line dash",
          step: {
            title: "Construction throws",
            lines: ["CanvasRenderer on the", "main thread"],
            code: ["renderer-fallback"],
            tone: "error-soft",
          },
        },
      ]}
      steps={[
        {
          title: "Construct the Worker",
          lines: ["First, before the", "canvas is transferred"],
          tone: "hue-soft",
        },
        {
          title: "Transfer the canvas",
          code: ["transferControlToOffscreen"],
          lines: ["to the worker"],
        },
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
  const text: DiagramText = {
    hue: "teal",
    alt: "violet",
    title: "The screen-reader mirror of the visible window",
    description:
      "Beside the canvas, the grid keeps a visually hidden div, role rowgroup. It holds a header row with aria-rowindex 1 and one row per visible row, with aria-rowindex set to the true row position plus two. Each cell is a gridcell with an aria-colindex, a stable id and the cell's value as text.",
  };
  const mirror = (x: number, y: number, w: number) => (
    <>
      <rect class="alt-soft" height={150} rx={8} width={w} x={x} y={y} />
      <text class="small strong" x={x + 10} y={y + 18}>
        div.sheetwrite-aria · rowgroup
      </text>
      <For
        each={[
          'row · aria-rowindex="1"  headers',
          'row · aria-rowindex="42"',
          'row · aria-rowindex="43"',
          'row · aria-rowindex="44"',
        ]}
      >
        {(line, index) => (
          <>
            <rect
              class="panel"
              height={22}
              rx={4}
              width={w - 20}
              x={x + 10}
              y={y + 28 + index() * 28}
            />
            <text class="small" x={x + 18} y={y + 43 + index() * 28}>
              {line}
            </text>
          </>
        )}
      </For>
    </>
  );
  const visible = (x: number, y: number) => (
    <>
      <Sheet ch={18} cols={3} cw={46} head={14} rows={6} x={x} y={y} />
      <rect class="hue-tint" height={54} width={138} x={x} y={y + 50} />
      <rect class="hue-line" height={54} width={138} x={x} y={y + 50} />
      <text class="small" x={x} y={y + 142}>
        rows 40–42 in view
      </text>
    </>
  );
  return (
    <Responsive
      narrow={{
        height: 340,
        draw: () => (
          <>
            {visible(110, 4)}
            <Arrow class="hue-line" x1={180} x2={180} y1={156} y2={176} />
            {mirror(4, 182, 352)}
          </>
        ),
      }}
      text={text}
      wide={{
        height: 164,
        width: COLUMN,
        draw: () => (
          <>
            {visible(8, 6)}
            <Arrow class="hue-line" x1={160} x2={250} y1={80} y2={80} />
            {mirror(256, 6, 436)}
          </>
        ),
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
      branches={[
        {
          from: 2,
          step: {
            title: "Readers of the cycle",
            lines: ["Calculate once,", "after it settles"],
            tone: "panel",
          },
          arrow: "hue-line",
        },
      ]}
      steps={[
        {
          title: "Start",
          lines: ["From the values shown;", "#CYCLE! starts at 0"],
          tone: "hue-soft",
        },
        { title: "One pass", lines: ["Cycle cells in row order,", "each reads the newest"] },
        {
          title: "Stop",
          code: ["maxChange", "maxIterations"],
          lines: ["No value moved more than", "or the pass limit"],
          tone: "alt-soft",
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
  const text: DiagramText = {
    hue: "pink",
    alt: "blue",
    title: "How matching rules combine",
    description:
      "Rules are checked in array order. When two rules match a cell, their styles merge, and for a field both set, the earlier rule wins: rule 1 sets color and bold, rule 2 sets another color and italic, so the cell paints rule 1's color, bold and italic. With stopIfTrue on rule 1, later rules are left out, so the cell paints rule 1's color and bold only.",
  };
  const outcome = (x: number, y: number, w: number, title: string, styled: { italic: boolean }) => (
    <>
      <text class="caption strong" x={x} y={y + 12}>
        {title}
      </text>
      <rect class="panel" height={40} rx={6} width={w} x={x} y={y + 22} />
      <text
        class="strong"
        style={{
          "font-family": "var(--sw-font-body)",
          "font-size": "15px",
          "font-weight": 700,
          "font-style": styled.italic ? "italic" : "normal",
        }}
        x={x + 12}
        y={y + 48}
      >
        {styled.italic ? "Revenue: bold, italic" : "Revenue: bold"}
      </text>
      <text class="small" x={x} y={y + 80}>
        color from rule 1
      </text>
    </>
  );
  const rules = (x: number, y: number, w: number) => (
    <>
      <Box
        class="hue-soft"
        code={["color: rule 1's", "bold: true"]}
        h={70}
        lines={[]}
        title="Rule 1"
        w={w}
        x={x}
        y={y}
      />
      <Box
        class="alt-soft"
        code={["color: rule 2's", "italic: true"]}
        h={70}
        lines={[]}
        title="Rule 2"
        w={w}
        x={x}
        y={y + 82}
      />
    </>
  );
  return (
    <Responsive
      narrow={{
        height: 404,
        draw: () => (
          <>
            {rules(4, 4, 352)}
            {outcome(4, 170, 352, "Both match: styles merge", { italic: true })}
            {outcome(4, 270, 352, "stopIfTrue on rule 1", { italic: false })}
          </>
        ),
      }}
      text={text}
      wide={{
        height: 170,
        width: COLUMN,
        draw: () => (
          <>
            {rules(8, 4, 200)}
            <Arrow class="hue-line" x1={214} x2={250} y1={80} y2={50} />
            <Arrow class="hue-line" x1={214} x2={250} y1={80} y2={128} />
            {outcome(256, 4, 260, "Both match: styles merge", { italic: true })}
            {outcome(256, 82, 260, "stopIfTrue on rule 1", { italic: false })}
          </>
        ),
      }}
    />
  );
}

/** Collaboration › Durable pending commits. */
export function PendingCommitsDiagram() {
  return (
    <FlowDiagram
      branches={[
        {
          from: 3,
          step: {
            title: "Conflicts and failures",
            lines: ["Kept for explicit", "host recovery"],
            tone: "error-soft",
          },
          arrow: "error-line dash",
        },
      ]}
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
        hue: "red",
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
  const contracts = [
    [
      "fromXlsxWorkbook",
      "ArrayBuffer or Uint8Array",
      ["WorkbookSnapshot", "Formulas as source"],
      "hue-soft",
    ],
    [
      "fromXlsxWorkbookFile",
      "File or Blob, not buffered",
      ["WorkbookSnapshot", "Same contract"],
      "hue-soft",
    ],
    [
      "fromXlsxTable",
      "ArrayBuffer or Uint8Array",
      ["ColumnarData", "One table, resolved values"],
      "alt-soft",
    ],
  ] as const;
  const text: DiagramText = {
    hue: "blue",
    alt: "amber",
    title: "The three XLSX import contracts",
    description:
      "fromXlsxWorkbook takes an ArrayBuffer or Uint8Array and returns a WorkbookSnapshot that keeps supported workbook state, with formulas imported as source. fromXlsxWorkbookFile returns the same snapshot from a File or Blob without buffering the compressed file first. fromXlsxTable returns ColumnarData: one rectangular table with first-row headers and resolved values; it is not a workbook round-trip API.",
  };
  return (
    <Responsive
      narrow={{
        height: 408,
        draw: () => (
          <For each={contracts}>
            {([name, input, result, tone], index) => (
              <Box
                class={tone}
                code={[name, ...result]}
                h={98}
                lines={[input]}
                title={index() === 2 ? "Table" : "Workbook"}
                w={352}
                x={4}
                y={4 + index() * 134}
              />
            )}
          </For>
        ),
      }}
      text={text}
      wide={{
        height: 130,
        width: COLUMN,
        draw: () => (
          <For each={contracts}>
            {([name, input, result, tone], index) => (
              <Box
                class={tone}
                code={[name, ...result]}
                h={114}
                lines={[input]}
                title={index() === 2 ? "Table" : "Workbook"}
                w={222}
                x={8 + index() * 236}
                y={6}
              />
            )}
          </For>
        ),
      }}
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
  "document-ops": DocumentOpsDiagram,
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
