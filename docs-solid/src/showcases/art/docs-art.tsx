// Pictures for the docs: one illustration per docs section card (2:1, the
// docs card shape) and the concept diagrams that sit beside a page's text.
// The same primitives and stylesheet as the showcase art.
import { For, type JSX } from "solid-js";

import {
  Bar,
  CardArt,
  docPath,
  foldPath,
  FRAMEWORK_CARD_HEIGHT,
  head,
  Panel,
  Sheet,
} from "./Art.js";
import { Arrow, Box, type DiagramText, Responsive } from "./diagram-kit.js";
import { CollaborationRecoveryDiagram, InteropFlowDiagram, PagingDiagram } from "./diagrams.js";

/** Docs section cards are 2:1, like the framework cards. */
const DOCS_CARD_HEIGHT = FRAMEWORK_CARD_HEIGHT;
/** Diagrams sit in the reading column, about 46rem wide. */
const COLUMN_WIDE = 700;

/** A pill with mono text. */
function Pill(props: Readonly<{ x: number; y: number; text: string; class?: string; w?: number }>) {
  const width = () => props.w ?? props.text.length * 6.2 + 18;
  return (
    <>
      <rect
        class={props.class ?? "hue-soft"}
        height={20}
        rx={10}
        width={width()}
        x={props.x}
        y={props.y}
      />
      <text
        class={props.class === "hue" ? "small on-hue" : "small strong"}
        x={props.x + 9}
        y={props.y + 14}
      >
        {props.text}
      </text>
    </>
  );
}

/** Install, create, calculate: three numbered steps to a working grid. */
function GettingStartedArt() {
  return (
    <CardArt alt="blue" height={DOCS_CARD_HEIGHT} hue="green">
      <For each={[1, 2, 3]}>
        {(step, index) => (
          <>
            <circle class="hue" cx={26 + index() * 104} cy={26} r={10} />
            <text class="small on-hue" text-anchor="middle" x={26 + index() * 104} y={30}>
              {step}
            </text>
          </>
        )}
      </For>
      <rect class="panel" height={60} rx={6} width={88} x={14} y={46} />
      <text class="small hue-text" x={22} y={64}>
        $ npm i
      </text>
      <text class="small" x={22} y={80}>
        @sheetwrite/
      </text>
      <text class="small" x={22} y={94}>
        core
      </text>
      <path class="ink-line" d={`M104 76h10${head(114, 76, 0)}`} />
      <rect class="panel" height={60} rx={6} width={88} x={118} y={46} />
      <text class="small" x={126} y={64}>
        createGrid(
      </text>
      <text class="small hue-text" x={134} y={80}>
        host, …
      </text>
      <text class="small" x={126} y={94}>
        )
      </text>
      <path class="ink-line" d={`M208 76h10${head(218, 76, 0)}`} />
      <Sheet ch={14} cols={2} cw={40} head={10} rows={4} x={222} y={46} />
      <rect class="hue" height={14} width={40} x={262} y={98} />
      <text class="small on-hue" x={266} y={109}>
        =SUM
      </text>
      <text class="small" x={14} y={136}>
        install · create · calculate
      </text>
    </CardArt>
  );
}

/** One grid, mounted from plain JavaScript, React, Vue or Svelte. */
function FrameworksArt() {
  const mounts = [
    ["JavaScript", 14, 22],
    ["React", 14, 104],
    ["Vue", 236, 22],
    ["Svelte", 236, 104],
  ] as const;
  return (
    <CardArt alt="violet" height={DOCS_CARD_HEIGHT} hue="blue">
      <Sheet ch={16} cols={3} cw={30} head={12} rows={5} x={115} y={30} />
      <For each={mounts}>
        {([name, x, y]) => (
          <>
            <Pill
              class={name === "React" || name === "Svelte" ? "alt-soft" : "hue-soft"}
              text={name}
              w={72}
              x={x}
              y={y}
            />
            <path
              class="hue-line dash"
              d={
                x < 100
                  ? `M${x + 74} ${y + 10}C100 ${y + 10} 100 80 112 80`
                  : `M${x - 2} ${y + 10}C218 ${y + 10} 218 80 208 80`
              }
              stroke-width={1.5}
            />
          </>
        )}
      </For>
      <text class="small" text-anchor="middle" x={160} y={136}>
        the same grid
      </text>
    </CardArt>
  );
}

/** A path of three stages, from a first grid to a full spreadsheet app. */
function TutorialsArt() {
  const badges = [
    [14, 22],
    [110, 84],
    [222, 14],
  ] as const;
  return (
    <CardArt alt="green" height={DOCS_CARD_HEIGHT} hue="amber">
      <path class="hue-line dash" d="M44 68C44 104 80 109 106 109M184 109C232 109 264 104 264 78" />
      <Panel h={44} w={60} x={14} y={22} />
      <Sheet ch={8} cols={3} cw={14} rows={3} x={22} y={32} />
      <Panel h={50} w={72} x={110} y={84} />
      <rect class="soft" height={10} rx={3} width={70.5} x={110.75} y={84.75} />
      <Sheet ch={8} cols={3} cw={18} rows={3} x={119} y={100} />
      <Panel h={60} w={84} x={222} y={14} />
      <rect class="hue-soft" height={12} rx={3} width={82} x={223} y={15} />
      <path class="hue" d="M244 18h4v5h-4zM252 18h4v5h-4zM260 18h4v5h-4z" />
      <Sheet ch={8} cols={4} cw={16} rows={3} x={232} y={34} />
      <rect class="soft" height={6} rx={2} width={64} x={232} y={62} />
      <For each={badges}>
        {([x, y], index) => (
          <>
            <circle class="hue" cx={x} cy={y} r={8} />
            <text class="small on-hue" text-anchor="middle" x={x} y={y + 3.5}>
              {index() + 1}
            </text>
          </>
        )}
      </For>
      <text class="small" x={14} y={150}>
        first grid → ribbon → full app
      </text>
    </CardArt>
  );
}

/** Who owns what: your app around the store, the engine and the renderer. */
function ConceptsArt() {
  return (
    <CardArt alt="violet" height={DOCS_CARD_HEIGHT} hue="teal">
      <rect class="rule dash" fill="none" height={132} rx={10} width={296} x={12} y={14} />
      <text class="small hue-text" x={22} y={30}>
        your app: workbook, data, lifecycle
      </text>
      <rect class="hue-soft" height={52} rx={8} width={80} x={26} y={50} />
      <text class="small strong" text-anchor="middle" x={66} y={72}>
        engine
      </text>
      <text class="small" text-anchor="middle" x={66} y={88}>
        WASM
      </text>
      <path class="ink-line" d={`M108 76h18${head(126, 76, 0)}${head(108, 76, 180)}`} />
      <rect class="panel" height={52} rx={8} width={72} x={128} y={50} />
      <text class="small strong" text-anchor="middle" x={164} y={80}>
        store
      </text>
      <path class="ink-line" d={`M202 76h18${head(220, 76, 0)}`} />
      <rect class="alt-soft" height={52} rx={8} width={78} x={222} y={50} />
      <text class="small strong" text-anchor="middle" x={261} y={72}>
        renderer
      </text>
      <text class="small" text-anchor="middle" x={261} y={88}>
        canvas
      </text>
      <text class="small" x={26} y={128}>
        recalculates · changes documents
      </text>
    </CardArt>
  );
}

/** The grid with its features called out: format, filter, chart, note, lock. */
function FeaturesArt() {
  return (
    <CardArt alt="blue" height={DOCS_CARD_HEIGHT} hue="pink">
      <Sheet ch={18} cols={4} cw={40} head={16} headClass="hue-tint" rows={6} x={14} y={18} />
      <path class="hue" d="M110 20h10l-3.6 4.8v4l-2.8 1.4v-5.4z" />
      <rect class="hue" height={18} width={40} x={14} y={52} />
      <text class="small on-hue" x={22} y={65}>
        B
      </text>
      <path class="alt" d="M128 70h6v6z" />
      <rect class="alt-tint" height={36} width={80} x={54} y={88} />
      <path class="alt-line" d="M146 106v-5a7 7 0 0 1 14 0v5" />
      <rect class="alt" height={14} rx={3} width={20} x={143} y={106} />
      <Panel h={60} w={112} x={194} y={18} />
      <path class="hue-line" d="M204 66l16-14 14 6 16-18 16 8 18-16" />
      <Panel h={50} w={112} x={194} y={92} />
      <Bar w={60} x={204} y={104} />
      <rect class="alt-soft" height={14} rx={4} width={80} x={204} y={118} />
    </CardArt>
  );
}

/** XLSX and CSV files exchanged with the grid. */
function ImportExportArt() {
  return (
    <CardArt alt="amber" height={DOCS_CARD_HEIGHT} hue="blue">
      <path class="panel" d={docPath(16, 14, 64, 60)} />
      <path class="rule" d={foldPath(16, 14, 64)} />
      <Pill class="hue" text="XLSX" x={22} y={46} />
      <path class="panel" d={docPath(16, 86, 64, 60)} />
      <path class="rule" d={foldPath(16, 86, 64)} />
      <Pill class="alt-soft" text="CSV" x={22} y={118} />
      <path
        class="hue-line"
        d={`M86 44c40 0 46 20 100 20${head(186, 64, 0)}${head(86, 44, 180)}`}
      />
      <path
        class="alt-line"
        d={`M86 116c40 0 46-20 100-20${head(186, 96, 0)}${head(86, 116, 180)}`}
      />
      <Sheet ch={18} cols={3} cw={36} head={14} headClass="hue-tint" rows={6} x={192} y={14} />
    </CardArt>
  );
}

/** Reference entries by kind: functions, classes, types and events. */
function ApiReferenceArt() {
  const entries = [
    ["fn", "createGrid", "hue"],
    ["class", "Grid", "alt"],
    ["type", "CellValue", "hue"],
    ["event", "change", "alt"],
  ] as const;
  return (
    <CardArt alt="violet" height={DOCS_CARD_HEIGHT} hue="blue">
      <Panel h={132} w={218} x={14} y={14} />
      <For each={entries}>
        {([kind, name, tone], index) => (
          <>
            <rect
              class={`${tone}-soft`}
              height={18}
              rx={4}
              width={44}
              x={24}
              y={26 + index() * 30}
            />
            <text class="small strong" text-anchor="middle" x={46} y={39 + index() * 30}>
              {kind}
            </text>
            <text class="strong" x={78} y={40 + index() * 30}>
              {name}
            </text>
            <Bar w={60 - index() * 8} x={160} y={33 + index() * 30} />
          </>
        )}
      </For>
      <text class="glyph hue-text" text-anchor="middle" x={274} y={92}>
        {"{ }"}
      </text>
    </CardArt>
  );
}

/** The function catalog: families in columns, each function tagged with its build. */
function FormulaCatalogArt() {
  const families = [
    ["Math", ["SUM", "ROUND"]],
    ["Lookup", ["XLOOKUP", "INDEX"]],
    ["Stats", ["STDEV.S", "T.TEST"]],
  ] as const;
  return (
    <CardArt alt="green" height={DOCS_CARD_HEIGHT} hue="violet">
      <For each={families}>
        {([family, names], column) => (
          <>
            <text class="small hue-text" x={16 + column() * 100} y={26}>
              {family}
            </text>
            <For each={names}>
              {(name, row) => (
                <>
                  <rect
                    class={column() === 2 ? "alt-soft" : "panel"}
                    height={22}
                    rx={5}
                    width={92}
                    x={14 + column() * 100}
                    y={36 + row() * 30}
                  />
                  <text class="small strong" x={22 + column() * 100} y={51 + row() * 30}>
                    {name}
                  </text>
                </>
              )}
            </For>
          </>
        )}
      </For>
      <Pill class="panel" text="default" x={14} y={110} />
      <Pill class="alt-soft" text="full engine" x={92} y={110} />
      <text class="small" x={14} y={150}>
        Excel syntax · which build runs it
      </text>
    </CardArt>
  );
}

/** Measured results per release: paired bars per benchmark, one release against the next. */
function PerformanceResultsArt() {
  const bars = [62, 40, 86, 54] as const;
  return (
    <CardArt alt="blue" height={DOCS_CARD_HEIGHT} hue="amber">
      <Panel h={132} w={212} x={14} y={14} />
      <For each={bars}>
        {(width, index) => (
          <>
            <Bar w={30} x={26} y={34 + index() * 28} />
            <rect class="alt" height={8} rx={4} width={width + 50} x={66} y={30 + index() * 28} />
            <rect class="hue" height={8} rx={4} width={width + 20} x={66} y={41 + index() * 28} />
          </>
        )}
      </For>
      <Pill class="alt-soft" text="0.6.1" x={240} y={46} />
      <Pill class="hue-soft" text="0.7.0" x={240} y={76} />
    </CardArt>
  );
}

/** Docs section cards by section id. */
export const DOCS_CARD_ART: Readonly<Record<string, () => JSX.Element>> = {
  "getting-started": GettingStartedArt,
  frameworks: FrameworksArt,
  tutorials: TutorialsArt,
  concepts: ConceptsArt,
  features: FeaturesArt,
  "import-export": ImportExportArt,
  "api-reference": ApiReferenceArt,
  formulas: FormulaCatalogArt,
  performance: PerformanceResultsArt,
};

const RECALC_EDIT_TEXT: DiagramText = {
  hue: "violet",
  alt: "amber",
  title: "What happens on an edit",
  description:
    "An edit is a transaction, such as set A2. The engine stores the value and marks A2 dirty. Its dependency index finds every formula that A2 affects, also through other formulas: B2 reads A2, and D5 reads B2. Only those formulas calculate again, in dependency order; a formula no change reaches, such as C3, keeps its result. The transaction returns after the calculation, so getCell(…).resolved has the new result, and the change event and the next paint show it.",
};

/** One formula cell node: address, formula, and an optional order badge. */
function CellNode(
  props: Readonly<{
    x: number;
    y: number;
    address: string;
    formula: string;
    tone: string;
    order?: number;
  }>,
) {
  return (
    <>
      <rect class={props.tone} height={40} rx={6} width={118} x={props.x} y={props.y} />
      <text
        class={props.tone === "hue" ? "small on-hue" : "small strong"}
        x={props.x + 10}
        y={props.y + 17}
      >
        {props.address}
      </text>
      <text
        class={props.tone === "hue" ? "small on-hue" : "small"}
        x={props.x + 10}
        y={props.y + 32}
      >
        {props.formula}
      </text>
      {props.order !== undefined && (
        <>
          <circle class="alt" cx={props.x + 110} cy={props.y} r={9} />
          <text class="small on-hue" text-anchor="middle" x={props.x + 110} y={props.y + 4}>
            {props.order}
          </text>
        </>
      )}
    </>
  );
}

/** Calculation engine: an edit marks cells dirty, and only the formulas it reaches calculate, in order. */
export function RecalcEditDiagram() {
  return (
    <Responsive
      narrow={{
        height: 432,
        draw: () => (
          <>
            <Box
              class="hue-soft"
              code={["set A2 = 12"]}
              h={56}
              lines={["A transaction"]}
              title="Edit"
              w={352}
              x={4}
              y={4}
            />
            <Arrow class="hue-line" x1={180} x2={180} y1={64} y2={84} />
            <CellNode address="A2 · dirty" formula="12" tone="hue" x={4} y={92} />
            <Arrow class="hue-line" x1={124} x2={150} y1={112} y2={112} />
            <CellNode address="B2" formula="=A2*2" order={1} tone="hue-soft" x={154} y={92} />
            <Arrow class="hue-line" x1={213} x2={213} y1={134} y2={160} />
            <CellNode
              address="D5"
              formula="=SUM(B2:B4)"
              order={2}
              tone="hue-soft"
              x={154}
              y={164}
            />
            <CellNode address="C3" formula="=10*2" tone="panel" x={4} y={164} />
            <text class="caption" x={4} y={226}>
              C3 keeps its result: no change reaches it.
            </text>
            <Arrow class="hue-line" x1={180} x2={180} y1={238} y2={258} />
            <Box
              code={["store.getCell(…).resolved", "change event · next paint"]}
              h={82}
              lines={["After the calculation:"]}
              title="The transaction returns"
              w={352}
              x={4}
              y={262}
            />
            <text class="caption" x={4} y={380}>
              The dependency index finds every formula
            </text>
            <text class="caption" x={4} y={396}>
              an edit affects, also through other formulas.
            </text>
            <text class="caption" x={4} y={412}>
              Numbers show the calculation order.
            </text>
          </>
        ),
      }}
      text={RECALC_EDIT_TEXT}
      wide={{
        height: 232,
        width: COLUMN_WIDE,
        draw: () => (
          <>
            <Box
              class="hue-soft"
              code={["set A2 = 12"]}
              h={56}
              lines={["A transaction"]}
              title="Edit"
              w={140}
              x={8}
              y={70}
            />
            <Arrow class="hue-line" x1={152} x2={176} y1={98} y2={98} />
            <CellNode address="A2 · dirty" formula="12" tone="hue" x={180} y={78} />
            <Arrow class="hue-line" x1={300} x2={330} y1={92} y2={52} />
            <CellNode address="B2" formula="=A2*2" order={1} tone="hue-soft" x={334} y={22} />
            <Arrow class="hue-line" x1={393} x2={393} y1={66} y2={96} />
            <CellNode
              address="D5"
              formula="=SUM(B2:B4)"
              order={2}
              tone="hue-soft"
              x={334}
              y={100}
            />
            <CellNode address="C3" formula="=10*2" tone="panel" x={334} y={172} />
            <text class="caption" x={180} y={190}>
              keeps its result
            </text>
            <path class="rule dash" d="M290 186h40" />
            <Arrow class="hue-line" x1={456} x2={490} y1={120} y2={120} />
            <Box
              code={["store.getCell(…).resolved", "change event · next paint"]}
              h={82}
              lines={["After the calculation:"]}
              title="The transaction returns"
              w={198}
              x={494}
              y={80}
            />
            <text class="caption" x={494} y={190}>
              Numbers: calculation order.
            </text>
          </>
        ),
      }}
    />
  );
}

const ENGINE_BUILDS_TEXT: DiagramText = {
  hue: "green",
  alt: "violet",
  title: "The default and full engine builds",
  description:
    "The default build, @sheetwrite/wasm, has math, lookup, text, logic, dates, dynamic arrays and LET. The full build, @sheetwrite/formulas, has every default function plus statistics and distributions, regression, finance, regex, database, matrix and reshaping functions, the LAMBDA helpers, GROUPBY and PIVOTBY. Both compile from the same source with the same API, storage and limits. In the default build, full-only functions return #NAME?.",
};

const DEFAULT_FAMILIES = [
  "Math",
  "Lookup",
  "Text",
  "Logic",
  "Dates",
  "Dynamic arrays",
  "LET",
] as const;
const FULL_FAMILIES = [
  "Statistics",
  "Regression",
  "Finance",
  "Regex",
  "Database",
  "Matrix",
  "LAMBDA helpers",
  "GROUPBY · PIVOTBY",
] as const;

/** Family pills laid out in rows of a fixed width. */
function FamilyPills(
  props: Readonly<{ x: number; y: number; w: number; names: readonly string[]; class: string }>,
) {
  const placed = () => {
    let x = props.x;
    let y = props.y;
    return props.names.map((name) => {
      const width = name.length * 6.2 + 20;
      if (x + width > props.x + props.w) {
        x = props.x;
        y += 28;
      }
      const pill = { name, x, y, width };
      x += width + 8;
      return pill;
    });
  };
  return (
    <For each={placed()}>
      {(pill) => <Pill class={props.class} text={pill.name} w={pill.width} x={pill.x} y={pill.y} />}
    </For>
  );
}

/** Choose an engine: the default build inside the full one, with the families in each. */
export function EngineBuildsDiagram() {
  return (
    <Responsive
      narrow={{
        height: 380,
        draw: () => (
          <>
            <rect class="alt-soft" height={370} rx={10} width={352} x={4} y={4} />
            <text class="heading" x={18} y={28}>
              Full build
            </text>
            <text class="small" x={104} y={28}>
              @sheetwrite/formulas
            </text>
            <Panel h={150} w={324} x={18} y={40} />
            <text class="heading" x={30} y={62}>
              Default build
            </text>
            <text class="small" x={30} y={78}>
              @sheetwrite/wasm · smallest download
            </text>
            <FamilyPills class="panel" names={DEFAULT_FAMILIES} w={300} x={30} y={90} />
            <text class="caption strong" x={18} y={212}>
              Full build only
            </text>
            <FamilyPills class="alt-soft" names={FULL_FAMILIES} w={324} x={18} y={222} />
            <text class="caption" x={18} y={350}>
              Same source, API, storage and limits.
            </text>
            <text class="caption" x={18} y={366}>
              Default build: full-only functions show #NAME?
            </text>
          </>
        ),
      }}
      text={ENGINE_BUILDS_TEXT}
      wide={{
        height: 214,
        width: COLUMN_WIDE,
        draw: () => (
          <>
            <rect class="alt-soft" height={180} rx={10} width={684} x={8} y={4} />
            <text class="heading" x={22} y={28}>
              Full build
            </text>
            <text class="small" x={104} y={28}>
              @sheetwrite/formulas
            </text>
            <Panel h={134} w={316} x={22} y={40} />
            <text class="heading" x={34} y={62}>
              Default build
            </text>
            <text class="small" x={34} y={78}>
              @sheetwrite/wasm · smallest download
            </text>
            <FamilyPills class="panel" names={DEFAULT_FAMILIES} w={296} x={34} y={90} />
            <text class="caption strong" x={356} y={62}>
              Full build only
            </text>
            <FamilyPills class="alt-soft" names={FULL_FAMILIES} w={322} x={356} y={74} />
            <text class="caption" x={8} y={206}>
              Same source, API, storage and limits. In the default build, full-only functions show
              #NAME?.
            </text>
          </>
        ),
      }}
    />
  );
}

const LOADS_TEXT: DiagramText = {
  hue: "blue",
  alt: "amber",
  title: "What loads when",
  description:
    "Install @sheetwrite/core, which uses the default engine, @sheetwrite/wasm; add @sheetwrite/formulas for the full engine. initSheetwrite() loads the engine once, before the first grid or store; framework adapters call it on mount, and an engine passed to it is selected for good. Then createGrid mounts the grid. Worker rendering and XLSX stay explicit: the worker entry comes from @sheetwrite/core/worker, and XLSX needs @sheetwrite/xlsx registered with initSheetwrite({ addons: [xlsxAddon()] }).",
};

const LOAD_STEPS = [
  ["Install", ["@sheetwrite/core", "+ formulas, if needed"]],
  ["initSheetwrite()", ["Loads the engine once,", "before any grid"]],
  ["createGrid(host, …)", ["Mounts the grid;", "adapters init on mount"]],
] as const;

/** Installation: the packages, the one-time engine load, then the grid; optional assets stay explicit. */
export function LoadOrderDiagram() {
  return (
    <Responsive
      narrow={{
        height: 420,
        draw: () => (
          <>
            <For each={LOAD_STEPS}>
              {([title, lines], index) => (
                <>
                  <Box
                    class={index() === 1 ? "hue-soft" : "panel"}
                    h={66}
                    lines={lines}
                    title={title}
                    w={352}
                    x={4}
                    y={4 + index() * 86}
                  />
                  {index() < 2 && (
                    <Arrow
                      class="hue-line"
                      x1={180}
                      x2={180}
                      y1={72 + index() * 86}
                      y2={88 + index() * 86}
                    />
                  )}
                </>
              )}
            </For>
            <text class="caption strong" x={4} y={282}>
              Optional, and explicit
            </text>
            <Box
              class="alt-soft"
              code={["@sheetwrite/core/worker"]}
              h={64}
              lines={['renderer: "worker"']}
              title="Worker rendering"
              w={170}
              x={4}
              y={292}
            />
            <Box
              class="alt-soft"
              code={["addons: [xlsxAddon()]"]}
              h={64}
              lines={["@sheetwrite/xlsx"]}
              title="XLSX"
              w={170}
              x={186}
              y={292}
            />
          </>
        ),
      }}
      text={LOADS_TEXT}
      wide={{
        height: 196,
        width: COLUMN_WIDE,
        draw: () => (
          <>
            <For each={LOAD_STEPS}>
              {([title, lines], index) => (
                <>
                  <Box
                    class={index() === 1 ? "hue-soft" : "panel"}
                    h={66}
                    lines={lines}
                    title={title}
                    w={210}
                    x={8 + index() * 232}
                    y={8}
                  />
                  {index() < 2 && (
                    <Arrow
                      class="hue-line"
                      x1={222 + index() * 232}
                      x2={236 + index() * 232}
                      y1={40}
                      y2={40}
                    />
                  )}
                </>
              )}
            </For>
            <text class="caption strong" x={8} y={106}>
              Optional, and explicit
            </text>
            <Box
              class="alt-soft"
              code={["@sheetwrite/core/worker"]}
              h={66}
              lines={['renderer: "worker"']}
              title="Worker rendering"
              w={210}
              x={8}
              y={118}
            />
            <Box
              class="alt-soft"
              code={["initSheetwrite({ addons: [xlsxAddon()] })"]}
              h={66}
              lines={["@sheetwrite/xlsx, registered at init"]}
              title="XLSX"
              w={442}
              x={240}
              y={118}
            />
          </>
        ),
      }}
    />
  );
}

const BRIDGE_TEXT: DiagramText = {
  hue: "green",
  alt: "amber",
  title: "Keeping app rows in your store",
  description:
    "Your store keeps the row objects. createRowBridge maps each row to a stable ID with getRowId, and createRowId names new rows. Sheetwrite owns editing, history, sorting and filtering in the grid, and reports each edit as a row delta that names the row by its ID, which your app applies to its store.",
};

/** Host-owned rows: your store, the row bridge with stable IDs, the grid, and row deltas back. */
export function RowBridgeDiagram() {
  const rows = ["invoice-1", "invoice-2", "invoice-3"] as const;
  const store = (x: number, y: number, w: number) => (
    <>
      <Panel h={120} w={w} x={x} y={y} />
      <text class="heading" x={x + 12} y={y + 22}>
        Your store
      </text>
      <For each={rows}>
        {(id, index) => (
          <>
            <rect
              class={index() === 1 ? "alt-tint" : "soft"}
              height={20}
              rx={4}
              width={w - 24}
              x={x + 12}
              y={y + 34 + index() * 26}
            />
            <text class="small strong" x={x + 20} y={y + 48 + index() * 26}>
              {id}
            </text>
          </>
        )}
      </For>
    </>
  );
  return (
    <Responsive
      narrow={{
        height: 470,
        draw: () => (
          <>
            {store(4, 4, 352)}
            <Arrow class="hue-line" x1={120} x2={120} y1={128} y2={150} />
            <Box
              class="hue-soft"
              code={["getRowId · createRowId"]}
              h={66}
              lines={["Stable row IDs"]}
              title="createRowBridge"
              w={352}
              x={4}
              y={154}
            />
            <Arrow class="hue-line" x1={120} x2={120} y1={224} y2={246} />
            <Box
              h={66}
              lines={["Editing, history, sorting", "and filtering"]}
              title="Grid"
              w={352}
              x={4}
              y={250}
            />
            <path class="alt-line" d={`M300 248V134${head(300, 132, -90)}`} />
            <Box
              class="alt-soft"
              code={["onRowDelta → invoice-2"]}
              h={66}
              lines={["Names the row by ID"]}
              title="Row delta"
              w={352}
              x={4}
              y={340}
            />
            <text class="caption" x={4} y={432}>
              Your app applies each delta to its store.
            </text>
          </>
        ),
      }}
      text={BRIDGE_TEXT}
      wide={{
        height: 210,
        width: COLUMN_WIDE,
        draw: () => (
          <>
            {store(8, 8, 170)}
            <Arrow class="hue-line" x1={182} x2={214} y1={56} y2={56} />
            <Box
              class="hue-soft"
              code={["getRowId", "createRowId"]}
              h={82}
              lines={["Stable row IDs"]}
              title="createRowBridge"
              w={190}
              x={218}
              y={18}
            />
            <Arrow class="hue-line" x1={412} x2={444} y1={56} y2={56} />
            <Box
              h={82}
              lines={["Editing, history,", "sorting and filtering"]}
              title="Grid"
              w={240}
              x={448}
              y={18}
            />
            <path class="alt-line" d={`M568 104c0 40-40 60-120 60H182${head(182, 164, 180)}`} />
            <rect class="alt-soft" height={36} rx={8} width={228} x={244} y={146} />
            <text class="small strong" x={256} y={161}>
              onRowDelta: names invoice-2
            </text>
            <text class="caption" x={256} y={176}>
              Your app applies it to its store.
            </text>
          </>
        ),
      }}
    />
  );
}

const RELATIONSHIP_TEXT: DiagramText = {
  hue: "violet",
  alt: "teal",
  title: "A relationship and a pivot across it",
  description:
    "A relationship links two tables by one key column each. The from side, Orders[Customer], is the many side: many orders share a key. The to side, Customers[Customer], is the one side: each non-blank key is unique. A pivot over the model groups Orders by Customers › Region. A matching key reads that row's cell; no match or a blank key reads blank; a duplicate one-side key shows #VALUE! at the pivot's anchor.",
};

/** One table: a name row and its fields, the key field marked. */
function RelationTable(
  props: Readonly<{
    x: number;
    y: number;
    w: number;
    name: string;
    side: string;
    fields: readonly string[];
    key: number;
  }>,
) {
  return (
    <>
      <Panel h={32 + props.fields.length * 24} w={props.w} x={props.x} y={props.y} />
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
      <text class="small hue-text" text-anchor="end" x={props.x + props.w - 12} y={props.y + 20}>
        {props.side}
      </text>
      <For each={props.fields}>
        {(field, index) => (
          <>
            <path class="rule" d={`M${props.x} ${props.y + 32 + index() * 24}h${props.w}`} />
            {index() === props.key && (
              <rect
                class="alt-tint"
                height={23}
                width={props.w - 1.5}
                x={props.x + 0.75}
                y={props.y + 32.5 + index() * 24}
              />
            )}
            <text class="caption" x={props.x + 12} y={props.y + 49 + index() * 24}>
              {field}
            </text>
          </>
        )}
      </For>
    </>
  );
}

const KEY_CASES = [
  ["Key matches one row", "That row's cell", "panel"],
  ["No match, or blank", "Blank", "panel"],
  ["Duplicate one-side key", "#VALUE!", "error-soft"],
] as const;

/** Data model: the many side, the one side, the pivot field across them, and what each key case reads. */
export function RelationshipDiagram() {
  const cases = (x: number, y: number, w: number) => (
    <For each={KEY_CASES}>
      {([when, reads, tone], index) => (
        <>
          <rect class={tone} height={26} rx={6} width={w} x={x} y={y + index() * 32} />
          <text class="caption" x={x + 10} y={y + 17 + index() * 32}>
            {when}
          </text>
          <text class="small strong" text-anchor="end" x={x + w - 10} y={y + 17 + index() * 32}>
            {reads}
          </text>
        </>
      )}
    </For>
  );
  return (
    <Responsive
      narrow={{
        height: 440,
        draw: () => (
          <>
            <RelationTable
              fields={["Order", "Customer", "Amount"]}
              key={1}
              name="Orders"
              side="many"
              w={168}
              x={4}
              y={4}
            />
            <RelationTable
              fields={["Customer", "Region"]}
              key={0}
              name="Customers"
              side="one"
              w={168}
              x={188}
              y={4}
            />
            <path class="hue-line" d="M172 72c8 0 8-24 16-24" />
            <Box
              class="alt-soft"
              code={["rows: Customers › Region", "values: SUM of Amount"]}
              h={82}
              lines={["A pivot over the model"]}
              title="Amount by region"
              w={352}
              x={4}
              y={140}
            />
            <text class="caption strong" x={4} y={256}>
              What a related field reads
            </text>
            {cases(4, 268, 352)}
          </>
        ),
      }}
      text={RELATIONSHIP_TEXT}
      wide={{
        height: 240,
        width: COLUMN_WIDE,
        draw: () => (
          <>
            <RelationTable
              fields={["Order", "Customer", "Amount"]}
              key={1}
              name="Orders"
              side="many (from)"
              w={180}
              x={8}
              y={8}
            />
            <RelationTable
              fields={["Customer", "Region"]}
              key={0}
              name="Customers"
              side="one (to)"
              w={180}
              x={244}
              y={8}
            />
            <path class="hue-line" d="M188 76c28 0 28-24 56-24" />
            <Box
              class="alt-soft"
              code={["rows: Customers › Region", "values: SUM of Amount"]}
              h={82}
              lines={["A pivot over the model"]}
              title="Amount by region"
              w={248}
              x={444}
              y={8}
            />
            <text class="caption strong" x={244} y={128}>
              What a related field reads
            </text>
            {cases(244, 138, 448)}
          </>
        ),
      }}
    />
  );
}

const FIRST_GRID_TEXT: DiagramText = {
  hue: "green",
  alt: "blue",
  title: "The four steps of a first grid",
  description:
    "Install the packages, create the grid in a host element with createGrid, add a formula that totals a column, then save the document with exportSnapshot and open it again with createGridFromSnapshot.",
};

const FIRST_GRID_STEPS = [
  ["1 · Install", "npm install", "@sheetwrite/core"],
  ["2 · Create", "createGrid(", "host, { workbook })"],
  ["3 · Formula", "=SUM(B2:B4)", "a total that updates"],
  ["4 · Save, open", "exportSnapshot()", "createGridFromSnapshot"],
] as const;

/** First grid: install, create, add a formula, save and open. */
export function FirstGridDiagram() {
  return (
    <Responsive
      narrow={{
        height: 340,
        draw: () => (
          <For each={FIRST_GRID_STEPS}>
            {([title, first, second], index) => (
              <>
                <Box
                  class={index() === 2 ? "hue-soft" : "panel"}
                  code={[first, second]}
                  h={66}
                  lines={[]}
                  title={title}
                  w={352}
                  x={4}
                  y={4 + index() * 84}
                />
                {index() < 3 && (
                  <Arrow
                    class="hue-line"
                    x1={180}
                    x2={180}
                    y1={72 + index() * 84}
                    y2={86 + index() * 84}
                  />
                )}
              </>
            )}
          </For>
        ),
      }}
      text={FIRST_GRID_TEXT}
      wide={{
        height: 90,
        width: COLUMN_WIDE,
        draw: () => (
          <For each={FIRST_GRID_STEPS}>
            {([title, first, second], index) => (
              <>
                <Box
                  class={index() === 2 ? "hue-soft" : "panel"}
                  code={[first, second]}
                  h={66}
                  lines={[]}
                  title={title}
                  w={158}
                  x={8 + index() * 172}
                  y={8}
                />
                {index() < 3 && (
                  <Arrow
                    class="hue-line"
                    x1={168 + index() * 172}
                    x2={178 + index() * 172}
                    y1={40}
                    y2={40}
                  />
                )}
              </>
            )}
          </For>
        ),
      }}
    />
  );
}

const SLICER_TEXT: DiagramText = {
  hue: "teal",
  alt: "amber",
  title: "Which items a slicer filters",
  description:
    "A slicer on a column of a table filters every pivot whose table is that table or reaches it through many-to-one relationships; the filter goes from the one side to the many side, never back. Here a Region slicer on Regions filters the pivot over Orders, which reaches Regions, the PivotChart over that pivot, and a KPI card whose measure's home table is Orders. A pivot over Targets, which doesn't reach Regions, is not filtered.",
};

const SLICER_TARGETS = [
  ["Pivot over Orders", "Orders reaches Regions", "hue-soft", true],
  ["PivotChart", "Follows its pivot", "hue-soft", true],
  ["KPI card", "Measure on Orders", "hue-soft", true],
  ["Pivot over Targets", "Doesn't reach Regions", "panel", false],
] as const;

/** Dashboards: a slicer filters the items whose table reaches its column's table. */
export function DashboardSlicerDiagram() {
  return (
    <Responsive
      narrow={{
        height: 470,
        draw: () => (
          <>
            <Box
              h={66}
              lines={["Orders → Regions,", "many to one"]}
              title="Tables"
              w={352}
              x={4}
              y={4}
            />
            <Arrow class="ink-line" x1={180} x2={180} y1={72} y2={86} />
            <Box
              class="alt-soft"
              h={50}
              lines={["Regions[Region]"]}
              title="Slicer"
              w={352}
              x={4}
              y={90}
            />
            <For each={SLICER_TARGETS}>
              {([title, line, tone, filtered], index) => (
                <>
                  <path
                    class={filtered ? "alt-line" : "rule dash"}
                    d={`M180 ${148 + index() * 78}v${filtered ? 14 : 14}`}
                  />
                  <Box
                    class={tone}
                    h={58}
                    lines={[line]}
                    title={filtered ? title : `${title}: not filtered`}
                    w={352}
                    x={4}
                    y={166 + index() * 78}
                  />
                </>
              )}
            </For>
          </>
        ),
      }}
      text={SLICER_TEXT}
      wide={{
        height: 232,
        width: COLUMN_WIDE,
        draw: () => (
          <>
            <Box h={58} lines={["Many rows per region"]} title="Orders" w={150} x={8} y={20} />
            <Arrow class="ink-line" label="many → one" x1={162} x2={232} y1={50} y2={50} />
            <Box h={58} lines={["One row per region"]} title="Regions" w={150} x={236} y={20} />
            <Box h={58} lines={["Unrelated"]} title="Targets" w={150} x={8} y={150} />
            <Arrow class="alt-line" x1={311} x2={311} y1={82} y2={150} />
            <Box
              class="alt-soft"
              h={58}
              lines={["Regions[Region]"]}
              title="Slicer"
              w={150}
              x={236}
              y={154}
            />
            <For each={SLICER_TARGETS}>
              {([title, line, tone, filtered], index) => (
                <>
                  <path
                    class={filtered ? "alt-line" : "rule dash"}
                    d={`M390 183C420 183 420 ${30 + index() * 54} 450 ${30 + index() * 54}${filtered ? head(450, 30 + index() * 54, 0) : ""}`}
                  />
                  <Box
                    class={tone}
                    h={46}
                    lines={[line]}
                    title={title}
                    w={238}
                    x={454}
                    y={8 + index() * 54}
                  />
                  {!filtered && <path class="error-line" d="M424 183l8 8M432 183l-8 8" />}
                </>
              )}
            </For>
          </>
        ),
      }}
    />
  );
}

const ARCHIVE_TEXT: DiagramText = {
  hue: "teal",
  alt: "pink",
  title: "How the version archive records a document",
  description:
    "Only committed transactions, confirmed by the document authority with their revision and author, go to record; optimistic grid change events don't. The archive appends each one to its log and makes a checkpoint when one is due: after 30 active minutes, 1,000 transactions or 2 MiB of log. Checkpoints reference fixed 16-row by 4-column cell pages, and unchanged pages are shared between checkpoints. An automatic marker is made after five active minutes with committed edits; saveVersion names one. readVersion and diffVersions read versions back.",
};

/** Persistence: committed transactions into the archive's log, checkpoints of shared pages, and markers. */
export function VersionArchiveDiagram() {
  const pages = (x: number, y: number) => (
    <>
      <For each={[0, 1]}>
        {(row) => (
          <For each={[0, 1, 2, 3]}>
            {(column) => (
              <rect
                class={row === 1 && column === 2 ? "alt-soft" : "hue-soft"}
                height={18}
                rx={3}
                width={24}
                x={x + 30 + column * 30}
                y={y + row * 30}
              />
            )}
          </For>
        )}
      </For>
      <text class="small strong" x={x} y={y + 13}>
        cp 1
      </text>
      <text class="small strong" x={x} y={y + 43}>
        cp 2
      </text>
      <path
        class="rule dash"
        d={[0, 1, 3].map((column) => `M${x + 42 + column * 30} ${y + 18}v12`).join("")}
      />
    </>
  );
  return (
    <Responsive
      narrow={{
        height: 470,
        draw: () => (
          <>
            <Box
              class="hue-soft"
              h={66}
              lines={["Revision and author", "confirmed by the authority"]}
              title="Committed transaction"
              w={240}
              x={4}
              y={4}
            />
            <rect class="rule dash" fill="none" height={66} rx={8} width={104} x={252} y={4} />
            <text class="caption" x={262} y={30}>
              Optimistic
            </text>
            <text class="caption" x={262} y={46}>
              changes: not
            </text>
            <text class="caption" x={262} y={62}>
              recorded
            </text>
            <Arrow class="hue-line" x1={124} x2={124} y1={74} y2={104} />
            <text class="small" x={134} y={94}>
              record(commit)
            </text>
            <Panel h={190} w={352} x={4} y={108} />
            <text class="heading" x={16} y={130}>
              Archive
            </text>
            <text class="caption" x={16} y={150}>
              Log, then a checkpoint when due:
            </text>
            <text class="small" x={16} y={166}>
              30 active min · 1,000 txns · 2 MiB
            </text>
            {pages(16, 182)}
            <text class="caption" x={16} y={252}>
              16 × 4 cell pages; unchanged
            </text>
            <text class="caption" x={16} y={268}>
              pages are shared.
            </text>
            <Box
              class="alt-soft"
              code={["saveVersion(name, …)"]}
              h={66}
              lines={["Automatic after 5 active min"]}
              title="Markers"
              w={352}
              x={4}
              y={310}
            />
            <Box
              code={["readVersion · diffVersions"]}
              h={50}
              lines={[]}
              title="Read back"
              w={352}
              x={4}
              y={390}
            />
          </>
        ),
      }}
      text={ARCHIVE_TEXT}
      wide={{
        height: 236,
        width: COLUMN_WIDE,
        draw: () => (
          <>
            <Box
              class="hue-soft"
              h={66}
              lines={["Revision and author", "confirmed by the authority"]}
              title="Committed transaction"
              w={200}
              x={8}
              y={14}
            />
            <rect class="rule dash" fill="none" height={56} rx={8} width={200} x={8} y={100} />
            <text class="caption" x={20} y={124}>
              Optimistic grid changes
            </text>
            <text class="caption" x={20} y={142}>
              are not recorded
            </text>
            <Arrow class="hue-line" label="record()" x1={212} x2={262} y1={46} y2={46} />
            <Panel h={176} w={262} x={266} y={8} />
            <text class="heading" x={278} y={30}>
              Archive
            </text>
            <text class="caption" x={278} y={50}>
              Log, then a checkpoint when due:
            </text>
            <text class="small" x={278} y={66}>
              30 active min · 1,000 txns · 2 MiB
            </text>
            {pages(278, 80)}
            <text class="caption" x={278} y={150}>
              16 × 4 cell pages; unchanged
            </text>
            <text class="caption" x={278} y={166}>
              pages are shared.
            </text>
            <Box
              class="alt-soft"
              code={["saveVersion(name, …)"]}
              h={66}
              lines={["Automatic after", "5 active minutes"]}
              title="Markers"
              w={160}
              x={536}
              y={8}
            />
            <Box
              code={["readVersion", "diffVersions"]}
              h={66}
              lines={[]}
              title="Read back"
              w={160}
              x={536}
              y={114}
            />
            <text class="caption" x={8} y={210}>
              The archive is a headless module from @sheetwrite/core/history; a normal grid never
              loads it.
            </text>
          </>
        ),
      }}
    />
  );
}

/** The labelled diagrams the docs place, by the name a page's `<Diagram name="…" />` uses. */
export const DOCS_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "first-grid": FirstGridDiagram,
  engines: EngineBuildsDiagram,
  "load-order": LoadOrderDiagram,
  recalculation: RecalcEditDiagram,
  "row-bridge": RowBridgeDiagram,
  relationships: RelationshipDiagram,
  "dashboard-slicers": DashboardSlicerDiagram,
  "version-archive": VersionArchiveDiagram,
  paging: PagingDiagram,
  xlsx: InteropFlowDiagram,
  "collaboration-recovery": CollaborationRecoveryDiagram,
};
