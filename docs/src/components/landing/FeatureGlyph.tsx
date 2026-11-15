import { type Component, For, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

/** Small looping illustrations for the landing capability cards (CSS keyframes in styles/landing/features.css). */
export type FeatureGlyphKind =
  | "spreadsheet"
  | "analysis"
  | "scale"
  | "formulas"
  | "collaboration"
  | "database"
  | "interoperability"
  | "host-rows";

const order = (index: number): JSX.CSSProperties => ({ "--i": String(index) });

/** Every (row, column) pair of a `rows` × `columns` grid, row by row. */
function grid(rows: number, columns: number): { row: number; column: number }[] {
  return Array.from({ length: rows * columns }, (_, index) => ({
    row: Math.floor(index / columns),
    column: index % columns,
  }));
}

/** The app shell in miniature: ribbon tabs, a pressed command, the formula bar, cells, sheet tabs. */
function SpreadsheetGlyph() {
  return (
    <>
      <For each={["Home", "Insert", "Data"]}>
        {(label, index) => (
          <text class="fg-tab" x={40 + index() * 44} y={15}>
            {label}
          </text>
        )}
      </For>
      <rect class="fg-tab-line" height={2} rx={1} width={32} x={24} y={19} />
      <rect class="fg-ribbon" height={24} rx={4} width={200} x={20} y={23} />
      <For each={[0, 1, 2, 3, 4]}>
        {(index) => (
          <rect
            class="fg-ribbon-button"
            data-press={index === 2 ? "true" : undefined}
            height={14}
            rx={3}
            width={14}
            x={30 + index * 22}
            y={28}
          />
        )}
      </For>
      <rect class="fg-ribbon-group" height={14} rx={3} width={40} x={150} y={28} />
      <rect class="fg-namebox" height={11} rx={2} width={26} x={20} y={51} />
      <text class="fg-fx" x={52} y={60}>
        fx
      </text>
      <rect class="fg-formula" height={11} rx={2} width={156} x={64} y={51} />
      <For each={grid(3, 5)}>
        {({ row, column }) => (
          <rect class="fg-cell" height={12} width={38} x={22 + column * 40} y={66 + row * 13} />
        )}
      </For>
      <rect class="fg-edit" data-client="a" height={12} width={38} x={62} y={79} />
      <rect class="fg-sheet-tab" data-active="true" height={8} rx={2} width={30} x={22} y={109} />
      <rect class="fg-sheet-tab" height={8} rx={2} width={30} x={56} y={109} />
    </>
  );
}

/** A pivot beside a column chart: the bars grow in, then the edited bar follows its cell. */
function AnalysisGlyph() {
  const bars = [44, 62, 36, 54];
  return (
    <>
      <For each={["EMEA", "APAC", "AMER", "LATAM"]}>
        {(region, row) => (
          <g>
            <rect class="fg-cell" height={16} width={40} x={16} y={18 + row() * 19} />
            <rect
              class="fg-cell"
              data-edited={row() === 1 ? "true" : undefined}
              height={16}
              width={38}
              x={58}
              y={18 + row() * 19}
            />
            <text class="fg-result" x={20} y={29 + row() * 19}>
              {region}
            </text>
          </g>
        )}
      </For>
      <path class="fg-arrow" d="M 104 56 h 18" />
      <path class="fg-axis" d="M 134 18 v 80 h 92" />
      <For each={bars}>
        {(height, index) => (
          <rect
            class="fg-chart-bar"
            data-edited={index() === 1 ? "true" : undefined}
            height={height}
            rx={2}
            style={order(index())}
            width={14}
            x={144 + index() * 20}
            y={98 - height}
          />
        )}
      </For>
    </>
  );
}

function ScaleGlyph() {
  return (
    <>
      <For each={grid(4, 9)}>
        {({ row, column }) => {
          const onPath = row === 1 || row === 2;
          return (
            <rect
              class="fg-tile"
              data-path={onPath ? "true" : undefined}
              height={18}
              rx={3}
              style={onPath ? order(column) : undefined}
              width={18}
              x={14 + column * 24}
              y={12 + row * 24}
            />
          );
        }}
      </For>
      <rect class="fg-viewport" height={44} rx={5} width={44} x={11} y={33} />
    </>
  );
}

function FormulasGlyph() {
  return (
    <>
      <rect class="fg-anchor" height={20} rx={3} width={112} x={30} y={12} />
      <text class="fg-code" x={40} y={26}>
        =GROUPBY(…)
      </text>
      <For each={[0, 1, 2, 3]}>
        {(row) => (
          <g class="fg-spill-row" style={order(row)}>
            <rect height={16} rx={2} width={64} x={30} y={38 + row * 18} />
            <rect height={16} rx={2} width={44} x={98} y={38 + row * 18} />
            <text class="fg-result" x={36} y={50 + row * 18}>
              {["AMER", "EMEA", "APAC", "LATAM"][row]}
            </text>
            <text class="fg-result" x={104} y={50 + row * 18}>
              {["10.9M", "9.5M", "7.6M", "3.8M"][row]}
            </text>
          </g>
        )}
      </For>
      <rect class="fg-spill-edge" height={74} rx={4} width={118} x={27} y={35} />
      <path class="fg-arrow" d="M 148 72 h 24" />
      <text class="fg-tag" x={191} y={77}>
        A2#
      </text>
    </>
  );
}

function CollaborationGlyph() {
  return (
    <>
      <For each={grid(3, 4)}>
        {({ row, column }) => (
          <rect class="fg-cell" height={20} width={40} x={20 + column * 44} y={12 + row * 24} />
        )}
      </For>
      <rect class="fg-edit" data-client="a" height={20} width={40} x={64} y={12} />
      <rect class="fg-edit" data-client="b" height={20} width={40} x={152} y={60} />
      <path class="fg-cursor" data-client="a" d="M 96 22 l 0 14 l 4 -4 l 5 2 Z" />
      <path class="fg-cursor" data-client="b" d="M 184 70 l 0 14 l 4 -4 l 5 2 Z" />
      <For each={["v41", "v42", "v43"]}>
        {(label, index) => (
          <g class="fg-version" style={order(index())}>
            <rect height={18} rx={9} width={40} x={44 + index() * 50} y={94} />
            <text x={64 + index() * 50} y={107}>
              {label}
            </text>
          </g>
        )}
      </For>
    </>
  );
}

/** The reload icon: an arc around (RELOAD.x, RELOAD.y) with a gap at the top. */
const RELOAD = { x: 202, y: 54, r: 17 } as const;

function reloadIcon(): { arc: string; head: string } {
  const { x, y, r } = RELOAD;
  const point = (degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    return [x + r * Math.cos(angle), y + r * Math.sin(angle)] as const;
  };
  const [startX, startY] = point(-60);
  const [endX, endY] = point(-120);
  // The arc runs with increasing angle (clockwise on screen); its direction
  // at the end angle θ is (-sin θ, cos θ).
  const end = (-120 * Math.PI) / 180;
  const tangent = [-Math.sin(end), Math.cos(end)] as const;
  const normal = [-tangent[1], tangent[0]] as const;
  const tip = [endX + tangent[0] * 5, endY + tangent[1] * 5];
  const baseX = endX - tangent[0] * 2;
  const baseY = endY - tangent[1] * 2;
  const fixed = (value: number) => value.toFixed(1);
  return {
    arc: `M ${fixed(startX)} ${fixed(startY)} A ${r} ${r} 0 1 1 ${fixed(endX)} ${fixed(endY)}`,
    head: `M ${fixed(tip[0] ?? 0)} ${fixed(tip[1] ?? 0)} L ${fixed(baseX + normal[0] * 5)} ${fixed(baseY + normal[1] * 5)} L ${fixed(baseX - normal[0] * 5)} ${fixed(baseY - normal[1] * 5)} Z`,
  };
}

const RELOAD_ICON = reloadIcon();

function DatabaseGlyph() {
  return (
    <>
      <rect class="fg-snapshot" height={56} rx={6} width={36} x={18} y={26} />
      <path class="fg-snapshot-lines" d="M 26 40 h 20 M 26 49 h 20 M 26 58 h 20 M 26 67 h 12" />
      <text class="fg-tag" x={36} y={98}>
        snapshot
      </text>
      <For each={[0, 1, 2, 3]}>
        {(index) => (
          <g class="fg-commit" style={order(index)}>
            <rect height={56} rx={4} width={18} x={74 + index * 24} y={26} />
          </g>
        )}
      </For>
      <text class="fg-tag" x={113} y={98}>
        commits
      </text>
      <g class="fg-reload">
        <path d={RELOAD_ICON.arc} />
        <path class="fg-reload-head" d={RELOAD_ICON.head} />
      </g>
      <text class="fg-tag" x={RELOAD.x} y={98}>
        reload
      </text>
    </>
  );
}

function InteroperabilityGlyph() {
  return (
    <>
      <g class="fg-file" data-side="in">
        <path d="M 18 20 h 30 l 12 12 v 52 h -42 Z" />
        <text x={39} y={64}>
          .xlsx
        </text>
      </g>
      <path class="fg-arrow" d="M 70 54 h 26" />
      <g class="fg-mini-grid">
        <For each={grid(3, 3)}>
          {({ row, column }) => (
            <rect height={14} width={18} x={104 + column * 20} y={32 + row * 16} />
          )}
        </For>
      </g>
      <path class="fg-arrow" data-out="" d="M 166 54 h 18" />
      <g class="fg-file" data-side="out">
        <path d="M 190 20 h 30 l 12 12 v 52 h -42 Z" />
        <text x={211} y={64}>
          .xlsx
        </text>
        <path class="fg-check" d="M 202 100 l 6 6 l 12 -14" />
      </g>
    </>
  );
}

function HostRowsGlyph() {
  const rows = [
    { id: "003", width: 120, from: 0, to: 2 },
    { id: "001", width: 80, from: 1, to: 0 },
    { id: "002", width: 100, from: 2, to: 1 },
    { id: "004", width: 60, from: 3, to: 3 },
  ];
  return (
    <For each={rows}>
      {(row) => (
        <g
          class="fg-host-row"
          style={{ "--from": `${row.from * 24}px`, "--to": `${row.to * 24}px` }}
        >
          <rect class="fg-id" height={18} rx={9} width={46} x={14} y={14} />
          <text x={37} y={27}>
            #{row.id}
          </text>
          <rect class="fg-bar" height={12} rx={3} width={row.width} x={70} y={17} />
        </g>
      )}
    </For>
  );
}

const GLYPHS: Readonly<Record<FeatureGlyphKind, Component>> = {
  spreadsheet: SpreadsheetGlyph,
  analysis: AnalysisGlyph,
  scale: ScaleGlyph,
  formulas: FormulasGlyph,
  collaboration: CollaborationGlyph,
  database: DatabaseGlyph,
  interoperability: InteroperabilityGlyph,
  "host-rows": HostRowsGlyph,
};

/** Server-rendered only: the animation is pure CSS, so no island hydrates it. */
export function FeatureGlyph(props: Readonly<{ kind: FeatureGlyphKind }>) {
  return (
    <svg aria-hidden="true" class="fg" data-kind={props.kind} viewBox="0 0 240 120">
      <Dynamic component={GLYPHS[props.kind]} />
    </svg>
  );
}
