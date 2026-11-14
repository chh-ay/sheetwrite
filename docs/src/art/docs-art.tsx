// Pictures for the docs: one illustration per docs section card (2:1, the
// docs card shape) and the concept diagrams that sit beside a page's text.
// The same primitives and stylesheet as the showcase art.
import { For, type JSX } from "solid-js";

import {
  type ArtProps,
  Bar,
  CardArt,
  docPath,
  foldPath,
  FRAMEWORK_CARD_HEIGHT,
  head,
  Panel,
  Sheet,
} from "./Art.js";
import {
  DashboardSlicerFigure,
  EngineBuildsFigure,
  FirstGridFigure,
  LoadOrderFigure,
  RecalculationFigure,
  RelationshipFigure,
  RowBridgeFigure,
  VersionArchiveFigure,
  XlsxFlowFigure,
} from "./blueprint-figures.js";
import { CollaborationRecoveryDiagram, PagingDiagram } from "./diagrams.js";

/** Docs section cards are 2:1, like the framework cards. */
const DOCS_CARD_HEIGHT = FRAMEWORK_CARD_HEIGHT;

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
function GettingStartedArt(props: ArtProps) {
  return (
    <CardArt class={props.class} alt="blue" height={DOCS_CARD_HEIGHT} hue="green">
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
      <path class="ink-line" d={`M102 76h16${head(118, 76, 0)}`} />
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
      <path class="ink-line" d={`M206 76h16${head(222, 76, 0)}`} />
      <Sheet ch={14} cols={2} cw={40} head={10} rows={4} x={222} y={46} />
      <rect class="hue" height={14} width={40} x={262} y={84} />
      <text class="small on-hue" x={266} y={95}>
        =SUM
      </text>
      <text class="small" x={14} y={136}>
        install · create · calculate
      </text>
    </CardArt>
  );
}

/** One grid, mounted from plain JavaScript, React, Vue or Svelte. */
function FrameworksArt(props: ArtProps) {
  const mounts = [
    ["JavaScript", 14, 22],
    ["React", 14, 104],
    ["Vue", 236, 22],
    ["Svelte", 236, 104],
  ] as const;
  return (
    <CardArt class={props.class} alt="violet" height={DOCS_CARD_HEIGHT} hue="blue">
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
function TutorialsArt(props: ArtProps) {
  const badges = [
    [14, 22],
    [110, 84],
    [222, 14],
  ] as const;
  return (
    <CardArt class={props.class} alt="green" height={DOCS_CARD_HEIGHT} hue="amber">
      <path class="hue-line dash" d="M44 68C44 104 80 109 106 109M184 109C232 109 264 104 264 78" />
      <Panel h={44} w={60} x={14} y={22} />
      <Sheet ch={8} cols={3} cw={14} rows={3} x={22} y={32} />
      <Panel h={50} w={72} x={110} y={84} />
      <rect class="soft" height={10} rx={3} width={70.5} x={110.75} y={84.75} />
      <Sheet ch={8} cols={3} cw={18} rows={3} x={119} y={100} />
      <Panel h={60} w={84} x={222} y={14} />
      <rect class="hue-soft" height={12} rx={5} width={82} x={223} y={15} />
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
function ConceptsArt(props: ArtProps) {
  return (
    <CardArt class={props.class} alt="violet" height={DOCS_CARD_HEIGHT} hue="teal">
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
      <path class="ink-line" d={`M106 76h22${head(128, 76, 0)}${head(106, 76, 180)}`} />
      <rect class="panel" height={52} rx={8} width={72} x={128} y={50} />
      <text class="small strong" text-anchor="middle" x={164} y={80}>
        store
      </text>
      <path class="ink-line" d={`M200 76h22${head(222, 76, 0)}`} />
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
function FeaturesArt(props: ArtProps) {
  return (
    <CardArt class={props.class} alt="blue" height={DOCS_CARD_HEIGHT} hue="pink">
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
function ImportExportArt(props: ArtProps) {
  return (
    <CardArt class={props.class} alt="amber" height={DOCS_CARD_HEIGHT} hue="blue">
      <path class="panel" d={docPath(16, 14, 64, 60)} />
      <path class="rule" d={foldPath(16, 14, 64)} />
      <Pill class="hue" text="XLSX" x={22} y={46} />
      <path class="panel" d={docPath(16, 86, 64, 60)} />
      <path class="rule" d={foldPath(16, 86, 64)} />
      <Pill class="alt-soft" text="CSV" x={22} y={118} />
      <path
        class="hue-line"
        d={`M80 44c44 0 52 20 112 20${head(192, 64, 0)}${head(80, 44, 180)}`}
      />
      <path
        class="alt-line"
        d={`M80 116c44 0 52-20 112-20${head(192, 96, 0)}${head(80, 116, 180)}`}
      />
      <Sheet ch={18} cols={3} cw={36} head={14} headClass="hue-tint" rows={6} x={192} y={14} />
    </CardArt>
  );
}

/** Reference entries by kind: functions, classes, types and events. */
function ApiReferenceArt(props: ArtProps) {
  const entries = [
    ["fn", "createGrid", "hue"],
    ["class", "Grid", "alt"],
    ["type", "CellValue", "hue"],
    ["event", "change", "alt"],
  ] as const;
  return (
    <CardArt class={props.class} alt="violet" height={DOCS_CARD_HEIGHT} hue="blue">
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
function FormulaCatalogArt(props: ArtProps) {
  const families = [
    ["Math", ["SUM", "ROUND"]],
    ["Lookup", ["XLOOKUP", "INDEX"]],
    ["Stats", ["STDEV.S", "T.TEST"]],
  ] as const;
  return (
    <CardArt class={props.class} alt="green" height={DOCS_CARD_HEIGHT} hue="violet">
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
function PerformanceResultsArt(props: ArtProps) {
  const bars = [62, 40, 86, 54] as const;
  return (
    <CardArt class={props.class} alt="blue" height={DOCS_CARD_HEIGHT} hue="amber">
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
export const DOCS_CARD_ART: Readonly<Record<string, (props: ArtProps) => JSX.Element>> = {
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

/** Docs diagrams by the name a placement uses. */
export const DOCS_DIAGRAMS: Readonly<Record<string, () => JSX.Element>> = {
  "first-grid": FirstGridFigure,
  engines: EngineBuildsFigure,
  "load-order": LoadOrderFigure,
  recalculation: RecalculationFigure,
  "row-bridge": RowBridgeFigure,
  relationships: RelationshipFigure,
  "dashboard-slicers": DashboardSlicerFigure,
  "version-archive": VersionArchiveFigure,
  paging: PagingDiagram,
  xlsx: XlsxFlowFigure,
  "collaboration-recovery": CollaborationRecoveryDiagram,
};
