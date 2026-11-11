// One decorative illustration per showcase hub card, each drawing what its
// showcase does. Shapes and colours come from Art.tsx and art.css.
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

/** The ribbon, formula bar, grid and sheet tabs of the spreadsheet app. */
function SpreadsheetArt() {
  return (
    <CardArt alt="blue" hue="green">
      <Panel h={164} w={248} x={36} y={18} />
      <rect class="soft" height={34} rx={5} width={246} x={37} y={19} />
      <rect class="hue-soft" height={20} rx={4} width={20} x={46} y={26} />
      <Bar w={22} x={72} y={29} />
      <Bar w={16} x={72} y={38} />
      <path class="rule" d="M102 26v20M174 26v20M232 26v20" />
      <For each={[110, 122, 134]}>
        {(x) => (
          <>
            <rect class="bar" height={8} rx={2} width={8} x={x} y={27} />
            <rect class="bar" height={8} rx={2} width={8} x={x} y={38} />
          </>
        )}
      </For>
      <Bar w={18} x={148} y={29} />
      <Bar w={14} x={148} y={38} />
      <path class="hue" d="M184 46v-8h5v8zM191 46V30h5v16zM198 46v-11h5v11z" />
      <Bar w={16} x={208} y={29} />
      <rect class="bar" height={8} rx={2} width={8} x={242} y={27} />
      <rect class="bar" height={8} rx={2} width={8} x={254} y={27} />
      <Bar w={20} x={242} y={39} />
      <text class="hue-text" x={46} y={70}>
        fx
      </text>
      <rect class="panel" height={14} rx={3} width={202} x={66} y={60} />
      <Bar w={86} x={72} y={65} />
      <Sheet ch={14} cols={6} cw={37} head={12} rows={5} x={46} y={80} />
      <Bar w={22} x={52} y={97} />
      <Bar w={18} x={89} y={111} />
      <Bar w={26} x={52} y={125} />
      <Bar w={14} x={200} y={97} />
      <Bar w={20} x={163} y={139} />
      <rect class="hue-tint" height={14} rx={1} width={37} x={120} y={106} />
      <rect class="hue-line" height={14} rx={1} width={37} x={120} y={106} />
      <rect class="hue" height={6} rx={1} width={6} x={154} y={117} />
      <rect class="hue-soft" height={12} rx={3} width={44} x={46} y={166} />
      <rect class="panel" height={12} rx={3} width={44} x={94} y={166} />
      <rect class="panel" height={12} rx={3} width={44} x={142} y={166} />
      <path class="ink-line" d="M194 172h8M198 168v8" />
    </CardArt>
  );
}

/** A pivot table beside the chart it feeds; the edited row moves its bar. */
function AnalysisArt() {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <CardArt alt="green" hue="blue">
      <Sheet
        ch={16}
        cols={3}
        cw={40}
        fill={<rect class="soft" height={96} width={39} x={24.75} y={52} />}
        head={16}
        headClass="hue-tint"
        rows={7}
        x={24}
        y={36}
      />
      <For each={rows}>
        {(row) => (
          <>
            <Bar w={22} x={30} y={58 + row * 16} />
            <Bar w={14 + ((row * 7) % 18)} x={98 - ((row * 7) % 18)} y={58 + row * 16} />
            <Bar w={10 + ((row * 11) % 20)} x={138 - ((row * 11) % 20)} y={58 + row * 16} />
          </>
        )}
      </For>
      <rect class="ink" height={4} rx={2} width={26} x={30} y={154} />
      <rect class="ink" height={4} rx={2} width={30} x={68} y={154} />
      <rect class="ink" height={4} rx={2} width={30} x={108} y={154} />
      <rect class="alt-line" height={16} rx={1} width={40} x={64} y={84} />
      <Panel h={128} w={132} x={164} y={36} />
      <path class="rule" d="M180 148h104M180 52v96M180 124h104M180 100h104M180 76h104" />
      <path
        class="hue"
        d="M188 148v-40h14v40zM208 148v-64h14v64zM248 148v-80h14v80zM268 148v-30h14v30z"
      />
      <rect class="alt" height={52} width={14} x={228} y={96} />
      <path class="alt-line dash" d={`M106 92h50${head(156, 92, 0)}`} />
    </CardArt>
  );
}

/** A table card: a tinted header, then field rows; `keys` rows carry a key dot. */
function TableCard(
  props: Readonly<{ x: number; y: number; w: number; rows: number; keys: readonly number[] }>,
) {
  return (
    <>
      <Panel h={24 + props.rows * 16} w={props.w} x={props.x} y={props.y} />
      <rect
        class="hue-tint"
        height={17}
        rx={5}
        width={props.w - 1.5}
        x={props.x + 0.75}
        y={props.y + 0.75}
      />
      <rect class="hue" height={5} rx={2.5} width={34} x={props.x + 10} y={props.y + 7} />
      <For each={Array.from({ length: props.rows }, (_, row) => row)}>
        {(row) => (
          <>
            {props.keys.includes(row) && (
              <circle class="hue" cx={props.x + 13} cy={props.y + 26 + row * 16} r={3} />
            )}
            <Bar
              w={props.w / 2 - 6 + ((row * 9) % 14)}
              x={props.x + 22}
              y={props.y + 24 + row * 16}
            />
          </>
        )}
      </For>
    </>
  );
}

/** Orders related to Products and Regions by key columns, with a measure. */
function DataModelArt() {
  return (
    <CardArt alt="teal" hue="violet">
      <TableCard keys={[1, 2]} rows={5} w={104} x={24} y={36} />
      <TableCard keys={[0]} rows={3} w={96} x={200} y={18} />
      <TableCard keys={[0]} rows={3} w={96} x={200} y={110} />
      <path class="hue-line" d="M128 78c36 0 36-34 72-34M128 94c36 0 36 42 72 42" />
      <text class="hue-text" x={133} y={74}>
        *
      </text>
      <text class="hue-text" x={133} y={108}>
        *
      </text>
      <text class="hue-text" x={190} y={40}>
        1
      </text>
      <text class="hue-text" x={190} y={132}>
        1
      </text>
      <rect class="alt-soft" height={22} rx={11} width={104} x={24} y={158} />
      <text class="alt-text" x={36} y={173}>
        Σ measure
      </text>
    </CardArt>
  );
}

/** KPI tiles, a chart and a pivot that one slicer filters together. */
function DashboardsArt() {
  return (
    <CardArt alt="amber" hue="teal">
      <Panel h={160} w={60} x={20} y={20} />
      <Bar class="ink" w={30} x={28} y={30} />
      <For each={[0, 1, 2, 3, 4]}>
        {(chip) => (
          <>
            <rect
              class={chip < 2 ? "hue" : "panel"}
              height={16}
              rx={8}
              width={44}
              x={28}
              y={44 + chip * 22}
            />
            <Bar class={chip < 2 ? "on-hue" : "bar"} w={22} x={36} y={50 + chip * 22} />
          </>
        )}
      </For>
      <For each={[92, 164, 236]}>
        {(x, index) => (
          <>
            <Panel h={48} w={64} x={x} y={20} />
            <Bar w={28} x={x + 8} y={29} />
            <rect class="ink" height={8} rx={3} width={30 + index() * 4} x={x + 8} y={40} />
            <path class="hue-line" d={`M${x + 44} 58l5-6l5 3l5-8`} />
          </>
        )}
      </For>
      <Panel h={104} w={128} x={92} y={76} />
      <path class="hue-tint" d="M104 166V150l15-12 15 6 15-24 15 8 15-24 15 6 15-14v72z" />
      <path class="hue-line" d="M104 150l15-12 15 6 15-24 15 8 15-24 15 6 15-14" />
      <path class="rule" d="M104 166h104" />
      <Panel h={104} w={72} x={228} y={76} />
      <rect class="hue-tint" height={17} rx={5} width={70.5} x={228.75} y={76.75} />
      <path class="rule" d="M228 112h72M228 130h72M228 148h72M228 166h72M262 94v86" />
      <For each={[100, 118, 136, 154]}>
        {(y) => (
          <>
            <Bar w={22} x={234} y={y} />
            <Bar w={22} x={270} y={y} />
          </>
        )}
      </For>
    </CardArt>
  );
}

/** A CSV feed shaped by saved steps into a table, refreshed on demand. */
function QueriesArt() {
  const steps = ["Filter", "Rename", "Type"] as const;
  return (
    <CardArt alt="blue" hue="amber">
      <path class="panel" d={docPath(20, 44, 68, 96)} />
      <path class="rule" d={foldPath(20, 44, 68)} />
      <For each={[70, 82, 94, 106, 118]}>
        {(y) => (
          <>
            <Bar w={12} x={28} y={y} />
            <circle class="ink" cx={44} cy={y + 4} r={1.3} />
            <Bar w={10} x={48} y={y} />
            <circle class="ink" cx={62} cy={y + 4} r={1.3} />
            <Bar w={12} x={66} y={y} />
          </>
        )}
      </For>
      <text class="hue-text" x={28} y={60}>
        CSV
      </text>
      <For each={steps}>
        {(step, index) => (
          <>
            <rect
              class={index() === 1 ? "hue-soft" : "panel"}
              height={26}
              rx={13}
              width={88}
              x={118}
              y={40 + index() * 48}
            />
            <circle class="hue" cx={133} cy={53 + index() * 48} r={4} />
            <text class="strong" x={144} y={57 + index() * 48}>
              {step}
            </text>
          </>
        )}
      </For>
      <path class="ink-line" d={`M162 68v18${head(162, 86, 90)}M162 116v18${head(162, 134, 90)}`} />
      <path
        class="hue-line"
        d={`M90 92c16 0 12-39 26-39${head(116, 53, 0)}M208 149c16 0 12-35 26-35${head(234, 114, 0)}`}
      />
      <Sheet ch={14} cols={3} cw={20} head={12} headClass="hue-tint" rows={5} x={236} y={74} />
      <path class="alt-line" d={`M276 40a10 10 0 1 1-4-8${head(272, 32, -40)}`} />
    </CardArt>
  );
}

/** A column sorted ascending, its header arrows, and a row moving into place. */
function SortArt() {
  const rows = [0, 1, 2, 3, 4, 5, 6];
  return (
    <CardArt alt="blue" hue="pink">
      <Sheet
        ch={18}
        cols={3}
        cw={64}
        fill={
          <>
            <rect class="hue-tint" height={21} width={64} x={120} y={28.75} />
            <rect class="alt-tint" height={18} width={190.5} x={56.75} y={68} />
          </>
        }
        head={22}
        rows={7}
        x={56}
        y={28}
      />
      <Bar class="ink" w={26} x={66} y={37} />
      <Bar class="ink" w={22} x={194} y={37} />
      <path class="hue-line" d={`M146 46V34${head(146, 33, -90)}`} />
      <path class="ink-line faint" d={`M160 33v12${head(160, 46, 90)}`} />
      <For each={rows}>
        {(row) => (
          <>
            <Bar w={18 + ((row * 13) % 22)} x={66} y={57 + row * 18} />
            <rect class="hue" height={6} rx={3} width={10 + row * 7} x={128} y={56 + row * 18} />
            <text class="alt-text small" x={194} y={63 + row * 18}>
              =B{row + 2}*2
            </text>
          </>
        )}
      </For>
      <path class="alt-line" d={`M252 166c26 0 26-89 0-89${head(252, 77, 180)}`} />
    </CardArt>
  );
}

/** Function chips from several families around an fx emblem. */
function FunctionsArt() {
  const chips: readonly (readonly [name: string, x: number, y: number, alt: boolean])[] = [
    ["XLOOKUP", 118, 40, false],
    ["PMT", 190, 40, true],
    ["STDEV.S", 236, 40, false],
    ["REGEXTEST", 118, 74, true],
    ["NPV", 204, 74, true],
    ["IFS", 250, 74, false],
    ["BIN2HEX", 118, 108, false],
    ["SORTBY", 190, 108, false],
    ["LET", 256, 108, true],
    ["TEXTSPLIT", 118, 142, false],
    ["RATE", 204, 142, true],
    ["MODE", 256, 142, false],
  ];
  return (
    <CardArt alt="violet" hue="green">
      <circle class="hue-soft" cx={62} cy={100} r={36} />
      <text class="glyph hue-text" text-anchor="middle" x={62} y={109}>
        fx
      </text>
      <For each={chips}>
        {([name, x, y, alt]) => (
          <>
            <rect
              class={alt ? "alt-soft" : "hue-soft"}
              height={22}
              rx={11}
              width={name.length * 6.6 + 16}
              x={x}
              y={y}
            />
            <text class="strong" x={x + 8} y={y + 15}>
              {name}
            </text>
          </>
        )}
      </For>
    </CardArt>
  );
}

/** One edited cell, the formulas that read it, their total, and a timer. */
function RecalculationArt() {
  const dependents = [34, 56, 78, 100, 122, 144];
  return (
    <CardArt alt="amber" hue="violet">
      <circle class="hue-line faint" cx={52} cy={100} r={44} />
      <circle class="hue-line" cx={52} cy={100} r={30} opacity={0.6} />
      <path
        class="ink-line faint"
        d={dependents.map((y) => `M76 100C112 100 112 ${y + 7} 146 ${y + 7}`).join("")}
      />
      <path
        class="hue-line"
        d={dependents.map((y) => `M190 ${y + 7}C218 ${y + 7} 218 100 242 100`).join("")}
      />
      <rect class="hue" height={26} rx={4} width={48} x={28} y={87} />
      <text class="on-hue" text-anchor="middle" x={52} y={104}>
        +5%
      </text>
      <For each={dependents}>
        {(y) => <rect class="hue-soft" height={14} rx={3} width={44} x={146} y={y} />}
      </For>
      <rect class="panel" height={28} rx={4} width={52} x={242} y={86} />
      <text class="hue-text glyph" text-anchor="middle" x={268} y={110}>
        Σ
      </text>
      <circle class="alt-line" cx={268} cy={40} r={14} />
      <path class="alt-line" d="M268 40v-8M268 40l6 4M263 20h10" />
      <rect class="hue" height={8} rx={4} width={64} x={146} y={172} />
      <rect class="alt" height={8} rx={4} width={30} x={214} y={172} />
    </CardArt>
  );
}

/** Two versions compared side by side over a timeline of two authors' edits. */
function VersionHistoryArt() {
  const dots: readonly (readonly [x: number, alt: boolean])[] = [
    [48, false],
    [92, true],
    [136, false],
    [180, false],
    [224, true],
    [268, false],
  ];
  return (
    <CardArt alt="pink" hue="teal">
      <Sheet ch={14} cols={3} cw={30} head={10} rows={4} x={40} y={26} />
      <Sheet
        ch={14}
        cols={3}
        cw={30}
        fill={
          <>
            <rect class="alt-tint" height={14} width={30} x={220} y={50} />
            <rect class="hue-tint" height={14} width={30} x={250} y={78} />
          </>
        }
        head={10}
        rows={4}
        x={190}
        y={26}
      />
      <path class="ink-line" d={`M140 54h36${head(176, 54, 0)}M176 68h-36${head(140, 68, 180)}`} />
      <path class="rule dash" d="M85 92l7 50M235 92l-11 50" />
      <path class="rule" d="M28 150h264" stroke-width={2} />
      <circle class="alt-line" cx={92} cy={150} r={10} />
      <circle class="alt-line" cx={224} cy={150} r={10} />
      <For each={dots}>
        {([x, alt]) => <circle class={alt ? "alt" : "hue"} cx={x} cy={150} r={6} />}
      </For>
      <path class="hue-line" d={`M268 160c-6 26-170 26-176 4${head(92, 163, -100)}`} />
    </CardArt>
  );
}

/** A billion-cell address space as tiles: the viewport, the pages kept near it, the rest evicted. */
function PerformanceArt() {
  const rowsAt = (ys: readonly number[], from: number, to: number) =>
    ys.map((y) => `M${from} ${y}H${to}`).join("");
  return (
    <CardArt alt="blue" hue="amber">
      <path class="tiles" d={rowsAt([30, 50, 70, 90, 110, 130, 150, 170], 20, 296)} />
      <path class="tiles tiles-loaded" d={rowsAt([70, 90, 110, 130], 80, 236)} />
      <path class="tiles tiles-shown" d={rowsAt([90, 110], 100, 176)} />
      <rect class="hue-line" height={46} rx={4} stroke-width={2.5} width={88} x={93} y={77} />
      <rect class="panel" height={156} rx={3} width={8} x={304} y={22} />
      <rect class="hue" height={10} rx={3} width={8} x={304} y={92} />
      <text x={20} y={194}>
        1,000,000 × 1,000
      </text>
    </CardArt>
  );
}

/** A dynamic-array formula in the bar and the range it spills into. */
function FormulasArt() {
  return (
    <CardArt alt="green" hue="blue">
      <Panel h={26} r={5} w={280} x={20} y={20} />
      <text class="hue-text" x={30} y={37}>
        fx
      </text>
      <path class="rule" d="M50 26v14" />
      <text class="strong" x={58} y={37}>
        =<tspan class="hue-text">GROUPBY</tspan>(B2:B9,D2:D9,SUM)
      </text>
      <Sheet
        ch={18}
        cols={6}
        cw={46}
        fill={<rect class="hue-tint" height={90} width={92} x={66} y={72} />}
        head={14}
        rows={6}
        x={20}
        y={58}
      />
      <rect class="hue-line dash" height={90} width={92} x={66} y={72} />
      <rect class="hue" height={18} width={46} x={66} y={72} />
      <Bar class="on-hue" w={24} x={72} y={79} />
      <For each={[0, 1, 2, 3]}>
        {(row) => (
          <>
            <Bar w={22 - row * 3} x={72} y={97 + row * 18} />
            <Bar w={18 + row * 4} x={134 - row * 4} y={97 + row * 18} />
          </>
        )}
      </For>
      <Bar w={20} x={118} y={79} />
      <Bar w={26} x={210} y={115} />
      <Bar w={18} x={258} y={133} />
    </CardArt>
  );
}

/** A client window with its own cursor and a peer's selection. */
function ClientWindow(
  props: Readonly<{ x: number; mine: "hue" | "alt"; peer: "hue" | "alt"; cursor: number }>,
) {
  return (
    <>
      <Panel h={100} w={116} x={props.x} y={30} />
      <rect class="soft" height={14} rx={5} width={114.5} x={props.x + 0.75} y={30.75} />
      <circle class="bar" cx={props.x + 10} cy={38} r={2.5} />
      <circle class="bar" cx={props.x + 18} cy={38} r={2.5} />
      <Sheet ch={16} cols={4} cw={24} rows={4} x={props.x + 10} y={52} />
      <rect
        class={`${props.peer}-line`}
        height={16}
        width={24}
        x={props.x + 58 - props.cursor}
        y={52}
      />
      <path
        class={props.mine}
        d={`M${props.x + props.cursor} 84v18l5-4.5 3.5 7 3.5-1.6-3.5-6.9h7z`}
      />
      <rect
        class={props.mine}
        height={10}
        rx={5}
        width={22}
        x={props.x + props.cursor + 10}
        y={104}
      />
    </>
  );
}

/** Two clients, each showing the other's cursor, synced through a sequencing server. */
function CollaborationArt() {
  return (
    <CardArt alt="blue" hue="red">
      <ClientWindow cursor={40} mine="hue" peer="alt" x={16} />
      <ClientWindow cursor={24} mine="alt" peer="hue" x={188} />
      <path class="hue-line" d={`M60 132c0 24 30 32 64 32${head(124, 164, 0)}`} />
      <path class="alt-line" d={`M196 164c34 0 64-8 64-32${head(260, 132, -90)}`} />
      <Panel h={32} w={64} x={128} y={148} />
      <text class="strong" text-anchor="middle" x={160} y={168}>
        v42
      </text>
    </CardArt>
  );
}

/** A database with a snapshot and an append-only log compacted into it. */
function DatabaseArt() {
  return (
    <CardArt alt="violet" hue="teal">
      <path class="panel" d="M28 44v112a44 12 0 0 0 88 0V44" />
      <ellipse class="hue-soft" cx={72} cy={44} rx={44} ry={12} />
      <path class="rule" d="M28 82a44 12 0 0 0 88 0M28 120a44 12 0 0 0 88 0" />
      <Panel class="hue-soft" h={40} w={128} x={164} y={24} />
      <text class="hue-text" x={176} y={48}>
        snapshot
      </text>
      <For each={[80, 100, 120, 140, 160]}>
        {(y, index) => (
          <>
            <rect class="panel" height={14} rx={7} width={128} x={164} y={y} />
            <circle class="alt" cx={175} cy={y + 7} r={3} />
            <Bar w={44 + ((index() * 17) % 40)} x={186} y={y + 5} />
          </>
        )}
      </For>
      <path class="hue-line" d={`M158 168c-22 0-22-124 0-124${head(160, 44, 0)}`} />
    </CardArt>
  );
}

/** Records in the host's store streaming into the grid; an edit returns as a delta naming its record. */
function HostRowsArt() {
  const ids = [41, 42, 43, 44, 45];
  return (
    <CardArt alt="amber" hue="green">
      <Panel h={136} w={104} x={20} y={32} />
      <rect class="soft" height={16} rx={5} width={102.5} x={20.75} y={32.75} />
      <Bar class="ink" w={34} x={30} y={39} />
      <rect class="alt-tint" height={18} width={102.5} x={20.75} y={95} />
      <For each={ids}>
        {(id, index) => (
          <>
            <text class="small" x={30} y={68 + index() * 20}>
              id {id}
            </text>
            <Bar w={30} x={84} y={64 + index() * 20} />
          </>
        )}
      </For>
      <Sheet ch={20} cols={3} cw={34} head={16} headClass="hue-tint" rows={6} x={196} y={32} />
      <path
        class="hue-line dash"
        d={`M128 64h62${head(190, 64, 0)}M128 144h62${head(190, 144, 0)}`}
      />
      <rect class="hue" height={10} rx={5} width={22} x={140} y={59} />
      <rect class="hue" height={10} rx={5} width={22} x={156} y={139} />
      <path class="alt-line" d={`M190 104h-60${head(130, 104, 180)}`} />
      <text class="alt-text small" text-anchor="middle" x={160} y={97}>
        Δ id 43
      </text>
    </CardArt>
  );
}

/** XLSX and CSV files exchanged with the grid, the ZIP guarded by a shield. */
function InteropArt() {
  return (
    <CardArt alt="amber" hue="blue">
      <path class="panel" d={docPath(24, 24, 72, 84)} />
      <path class="rule" d={foldPath(24, 24, 72)} />
      <path
        class="ink-line"
        d="M48 36v40"
        stroke-dasharray="2 3"
        stroke-linecap="butt"
        stroke-width={6}
      />
      <rect class="hue" height={16} rx={8} width={44} x={32} y={84} />
      <text class="on-hue small" x={40} y={95}>
        XLSX
      </text>
      <path class="hue" d="M92 22l15 5v11c0 10-6 16-15 20c-9-4-15-10-15-20V27z" />
      <path class="on-hue-line" d="M86 39l4.5 4.5L99 35" />
      <path class="panel" d={docPath(24, 120, 72, 60)} />
      <path class="rule" d={foldPath(24, 120, 72)} />
      <text class="alt-text" x={34} y={152}>
        a,b,c
      </text>
      <rect class="alt" height={16} rx={8} width={36} x={32} y={158} />
      <text class="on-hue small" x={40} y={169}>
        CSV
      </text>
      <Sheet ch={18} cols={3} cw={32} head={14} headClass="hue-tint" rows={6} x={200} y={38} />
      <path
        class="hue-line"
        d={`M106 68c40 0 46 14 88 14${head(194, 82, 0)}${head(106, 68, 180)}`}
      />
      <path
        class="alt-line"
        d={`M104 150c40 0 48-26 90-26${head(194, 124, 0)}${head(104, 150, 180)}`}
      />
    </CardArt>
  );
}

/** A styled budget: a coloured header, mixed number formats, a format toolbar. */
function FormattingArt() {
  const values = ["$1,250.00", "12.5%", "-340.00", "2026-11-11", "1.2E+06"] as const;
  return (
    <CardArt alt="green" hue="pink">
      <Sheet ch={20} cols={2} cw={88} head={20} headClass="hue" rows={6} x={20} y={28} />
      <Bar class="on-hue" w={34} x={30} y={36} />
      <Bar class="on-hue" w={40} x={146} y={36} />
      <For each={values}>
        {(value, index) => (
          <>
            <Bar w={30 + ((index() * 13) % 26)} x={30} y={56 + index() * 20} />
            <text
              class={value.startsWith("-") ? "hue-text" : "strong"}
              text-anchor="end"
              x={190}
              y={62 + index() * 20}
            >
              {value}
            </text>
          </>
        )}
      </For>
      <path class="ink-line" d="M108 150.5h88" />
      <Bar class="ink" w={34} x={30} y={156} />
      <text class="alt-text" text-anchor="end" x={190} y={162}>
        $4,812.50
      </text>
      <Panel h={140} w={88} x={212} y={28} />
      <rect class="hue-soft" height={28} rx={5} width={32} x={222} y={38} />
      <text class="glyph hue-text" text-anchor="middle" x={238} y={61}>
        B
      </text>
      <For
        each={
          [
            [258, 38, "I"],
            [222, 74, "%"],
            [258, 74, ".00"],
            [222, 110, "$"],
            [258, 110, "A"],
          ] as const
        }
      >
        {([x, y, label]) => (
          <>
            <rect class="panel" height={28} rx={5} width={32} x={x} y={y} />
            <text class="strong" text-anchor="middle" x={x + 16} y={y + 18}>
              {label}
            </text>
          </>
        )}
      </For>
      <rect class="hue" height={3} rx={1.5} width={14} x={267} y={131} />
      <circle class="hue" cx={232} cy={152} r={6} />
      <circle class="alt" cx={250} cy={152} r={6} />
      <circle class="ink" cx={268} cy={152} r={6} />
    </CardArt>
  );
}

/** A column filter open over the table, a validated cell and a locked range. */
function DataToolsArt() {
  return (
    <CardArt alt="violet" hue="amber">
      <Sheet
        ch={20}
        cols={3}
        cw={56}
        fill={<rect class="hue-tint" height={19} width={56} x={76} y={36.75} />}
        head={20}
        rows={6}
        x={20}
        y={36}
      />
      <For each={[0, 1, 2, 3, 4, 5]}>
        {(row) => <Bar w={24 + ((row * 11) % 16)} x={28} y={64 + row * 20} />}
      </For>
      <Bar class="ink" w={22} x={84} y={44} />
      <path class="hue" d="M112 41h14l-5 6.5v5.5l-4 2v-7.5z" />
      <Panel h={96} w={104} x={88} y={60} />
      <rect class="panel" height={14} rx={4} width={88} x={96} y={68} />
      <circle class="ink-line" cx={104} cy={75} r={3} />
      <For each={[0, 1, 2, 3]}>
        {(row) => (
          <>
            <rect
              class={row === 2 ? "panel" : "hue"}
              height={10}
              rx={2}
              width={10}
              x={98}
              y={90 + row * 16}
            />
            {row !== 2 && <path class="on-hue-line" d={`M100.5 ${95 + row * 16}l2 2l3.5-4`} />}
            <Bar w={36 + ((row * 9) % 20)} x={116} y={93 + row * 16} />
          </>
        )}
      </For>
      <Panel h={24} r={4} w={88} x={208} y={36} />
      <Bar w={40} x={216} y={46} />
      <path class="ink-line" d="M280 46l4 4l4-4" />
      <rect class="alt-soft" height={40} rx={4} width={88} x={208} y={64} />
      <Bar w={44} x={216} y={74} />
      <Bar w={34} x={216} y={88} />
      <path class="alt-line" d="M242 140v-6a10 10 0 0 1 20 0v6" stroke-width={2.5} />
      <rect class="alt" height={26} rx={5} width={36} x={234} y={140} />
      <circle class="on-hue" cx={252} cy={152} r={3} />
    </CardArt>
  );
}

/** A grid mounted into a host element, with the calls that own its lifecycle. */
function VanillaArt() {
  const calls = ["createGrid", "renderer", "destroy"] as const;
  return (
    <CardArt alt="blue" height={FRAMEWORK_CARD_HEIGHT} hue="amber">
      <rect class="hue-line dash" height={124} rx={8} width={184} x={18} y={18} />
      <text class="hue-text small" x={28} y={34}>
        #host
      </text>
      <Sheet ch={18} cols={5} cw={32} head={14} rows={4} x={30} y={44} />
      <Bar w={20} x={36} y={65} />
      <Bar w={16} x={100} y={83} />
      <Bar w={22} x={132} y={101} />
      <For each={calls}>
        {(call, index) => (
          <>
            <rect
              class={index() === 0 ? "hue-soft" : "panel"}
              height={24}
              rx={12}
              width={88}
              x={216}
              y={20 + index() * 46}
            />
            <text class="strong small" text-anchor="middle" x={260} y={35 + index() * 46}>
              {call}
            </text>
          </>
        )}
      </For>
      <path class="ink-line" d={`M260 46v16${head(260, 62, 90)}M260 92v16${head(260, 108, 90)}`} />
    </CardArt>
  );
}

/** A component tree: props flow down into the grid component, events come back up. */
function ReactArt() {
  return (
    <CardArt alt="green" height={FRAMEWORK_CARD_HEIGHT} hue="react">
      <Panel h={26} w={72} x={20} y={18} />
      <text class="strong" text-anchor="middle" x={56} y={35}>
        {"<App>"}
      </text>
      <Panel class="hue-soft" h={26} w={128} x={20} y={110} />
      <text class="hue-text" text-anchor="middle" x={84} y={127}>
        {"<SheetwriteGrid>"}
      </text>
      <path class="hue-line" d={`M48 48v56${head(48, 104, 90)}`} />
      <text class="hue-text small" text-anchor="end" x={42} y={80}>
        props
      </text>
      <path class="alt-line" d={`M112 104V56${head(112, 50, -90)}`} />
      <text class="alt-text small" x={118} y={80}>
        events
      </text>
      <path class="ink-line" d={`M150 123h20${head(170, 123, 0)}`} />
      <Sheet ch={20} cols={4} cw={30} head={14} headClass="hue-tint" rows={5} x={176} y={18} />
      <Bar w={18} x={184} y={38} />
      <Bar w={20} x={214} y={58} />
      <Bar w={14} x={244} y={78} />
      <Bar w={22} x={274} y={98} />
    </CardArt>
  );
}

/** A validated cell's list, a note on a cell, a locked range and sheet tabs. */
function VueArt() {
  return (
    <CardArt alt="violet" height={FRAMEWORK_CARD_HEIGHT} hue="vue">
      <Sheet ch={18} cols={5} cw={36} head={14} rows={5} x={20} y={18} />
      <path class="alt" d="M158 32h6v6z" />
      <rect class="hue-line" height={18} width={36} x={56} y={50} />
      <path class="ink-line" d="M82 57l3 3l3-3" />
      <Panel h={46} r={4} w={72} x={56} y={72} />
      <rect class="hue-tint" height={14} rx={2} width={64} x={60} y={76} />
      <Bar w={36} x={66} y={81} />
      <Bar w={44} x={66} y={97} />
      <Bar w={30} x={66} y={109} />
      <path class="alt-line dash" d="M164 32c20 0 26 0 44 0" />
      <Panel class="alt-soft" h={36} w={92} x={208} y={18} />
      <Bar w={60} x={218} y={30} />
      <Bar w={44} x={218} y={40} />
      <path class="ink-line" d="M250 92v-6a8 8 0 0 1 16 0v6" stroke-width={2.5} />
      <rect class="ink" height={22} rx={4} width={28} x={244} y={92} />
      <circle class="on-hue" cx={258} cy={102} r={2.5} />
      <rect class="hue-soft" height={12} rx={3} width={40} x={20} y={134} />
      <rect class="panel" height={12} rx={3} width={40} x={64} y={134} />
      <rect class="panel" height={12} rx={3} width={40} x={108} y={134} />
    </CardArt>
  );
}

/** Edits queued while offline, then drained to the server on reconnect. */
function SvelteArt() {
  return (
    <CardArt alt="green" height={FRAMEWORK_CARD_HEIGHT} hue="svelte">
      <Panel h={108} w={100} x={20} y={26} />
      <Sheet ch={16} cols={3} cw={26} head={12} rows={5} x={31} y={44} />
      <circle class="hue-line faint" cx={108} cy={36} r={7} />
      <circle class="hue" cx={108} cy={36} r={3.5} />
      <For each={[0, 1, 2]}>
        {(chip) => (
          <>
            <rect class="hue-soft" height={20} rx={10} width={64} x={138} y={36 + chip * 26} />
            <Bar w={36} x={150} y={44 + chip * 26} />
          </>
        )}
      </For>
      <text class="hue-text small" text-anchor="middle" x={170} y={126}>
        3 pending
      </text>
      <path class="hue-line dash" d={`M124 72h10M206 72h22${head(228, 72, 0)}`} />
      <path class="panel" d="M246 98a16 16 0 0 1 2-32a22 22 0 0 1 40-6a16 16 0 0 1 6 38z" />
      <path class="alt-line" d="M256 80l6 6l12-12" stroke-width={2.5} />
    </CardArt>
  );
}

/** Every hub card's illustration, by showcase or framework id. */
export const HUB_ART: Readonly<Record<string, () => JSX.Element>> = {
  spreadsheet: SpreadsheetArt,
  analysis: AnalysisArt,
  "data-model": DataModelArt,
  dashboards: DashboardsArt,
  queries: QueriesArt,
  sort: SortArt,
  functions: FunctionsArt,
  recalculation: RecalculationArt,
  "version-history": VersionHistoryArt,
  performance: PerformanceArt,
  formulas: FormulasArt,
  collaboration: CollaborationArt,
  database: DatabaseArt,
  "host-rows": HostRowsArt,
  interoperability: InteropArt,
  formatting: FormattingArt,
  "data-tools": DataToolsArt,
  vanilla: VanillaArt,
  react: ReactArt,
  vue: VueArt,
  svelte: SvelteArt,
};
