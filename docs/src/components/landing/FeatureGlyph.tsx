import type { CSSProperties } from "react";

/** Small looping illustrations for the landing capability cards (CSS keyframes in landing.css). */
export type FeatureGlyphKind =
  | "scale"
  | "formulas"
  | "collaboration"
  | "database"
  | "interoperability"
  | "host-rows";

const order = (index: number) => ({ "--i": index }) as CSSProperties;

function ScaleGlyph() {
  const tiles = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 9; column++) {
      const onPath = row === 1 || row === 2;
      tiles.push(
        <rect
          className="fg-tile"
          data-path={onPath || undefined}
          height={18}
          key={`${row}-${column}`}
          rx={3}
          style={onPath ? order(column) : undefined}
          width={18}
          x={14 + column * 24}
          y={12 + row * 24}
        />,
      );
    }
  }
  return (
    <>
      {tiles}
      <rect className="fg-viewport" height={44} rx={5} width={44} x={11} y={33} />
    </>
  );
}

function FormulasGlyph() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    cells.push(
      <g className="fg-spill-row" key={row} style={order(row)}>
        <rect height={16} rx={2} width={64} x={30} y={38 + row * 18} />
        <rect height={16} rx={2} width={44} x={98} y={38 + row * 18} />
        <text className="fg-result" x={36} y={50 + row * 18}>
          {["AMER", "EMEA", "APAC", "LATAM"][row]}
        </text>
        <text className="fg-result" x={104} y={50 + row * 18}>
          {["10.9M", "9.5M", "7.6M", "3.8M"][row]}
        </text>
      </g>,
    );
  }
  return (
    <>
      <rect className="fg-anchor" height={20} rx={3} width={112} x={30} y={12} />
      <text className="fg-code" x={40} y={26}>
        =GROUPBY(…)
      </text>
      {cells}
      <rect className="fg-spill-edge" height={74} rx={4} width={118} x={27} y={35} />
      <path className="fg-arrow" d="M 148 72 h 24" />
      <text className="fg-tag" x={191} y={77}>
        A2#
      </text>
    </>
  );
}

function CollaborationGlyph() {
  const cells = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 4; column++) {
      cells.push(
        <rect
          className="fg-cell"
          height={20}
          key={`${row}-${column}`}
          width={40}
          x={20 + column * 44}
          y={12 + row * 24}
        />,
      );
    }
  }
  return (
    <>
      {cells}
      <rect className="fg-edit" data-client="a" height={20} width={40} x={64} y={12} />
      <rect className="fg-edit" data-client="b" height={20} width={40} x={152} y={60} />
      <path className="fg-cursor" data-client="a" d="M 96 22 l 0 14 l 4 -4 l 5 2 Z" />
      <path className="fg-cursor" data-client="b" d="M 184 70 l 0 14 l 4 -4 l 5 2 Z" />
      {["v41", "v42", "v43"].map((label, index) => (
        <g className="fg-version" key={label} style={order(index)}>
          <rect height={18} rx={9} width={40} x={44 + index * 50} y={94} />
          <text x={64 + index * 50} y={107}>
            {label}
          </text>
        </g>
      ))}
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
      <rect className="fg-snapshot" height={56} rx={6} width={36} x={18} y={26} />
      <path className="fg-snapshot-lines" d="M 26 40 h 20 M 26 49 h 20 M 26 58 h 20 M 26 67 h 12" />
      <text className="fg-tag" x={36} y={98}>
        snapshot
      </text>
      {[0, 1, 2, 3].map((index) => (
        <g className="fg-commit" key={index} style={order(index)}>
          <rect height={56} rx={4} width={18} x={74 + index * 24} y={26} />
        </g>
      ))}
      <text className="fg-tag" x={113} y={98}>
        commits
      </text>
      <g className="fg-reload">
        <path d={RELOAD_ICON.arc} />
        <path className="fg-reload-head" d={RELOAD_ICON.head} />
      </g>
      <text className="fg-tag" x={RELOAD.x} y={98}>
        reload
      </text>
    </>
  );
}

function InteroperabilityGlyph() {
  return (
    <>
      <g className="fg-file" data-side="in">
        <path d="M 18 20 h 30 l 12 12 v 52 h -42 Z" />
        <text x={39} y={64}>
          .xlsx
        </text>
      </g>
      <path className="fg-arrow" d="M 70 54 h 26" />
      <g className="fg-mini-grid">
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((column) => (
            <rect
              height={14}
              key={`${row}-${column}`}
              width={18}
              x={104 + column * 20}
              y={32 + row * 16}
            />
          )),
        )}
      </g>
      <path className="fg-arrow" data-out="" d="M 166 54 h 18" />
      <g className="fg-file" data-side="out">
        <path d="M 190 20 h 30 l 12 12 v 52 h -42 Z" />
        <text x={211} y={64}>
          .xlsx
        </text>
        <path className="fg-check" d="M 202 100 l 6 6 l 12 -14" />
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
    <>
      {rows.map((row) => (
        <g
          className="fg-host-row"
          key={row.id}
          style={
            {
              "--from": `${row.from * 24}px`,
              "--to": `${row.to * 24}px`,
            } as CSSProperties
          }
        >
          <rect className="fg-id" height={18} rx={9} width={46} x={14} y={14} />
          <text x={37} y={27}>
            #{row.id}
          </text>
          <rect className="fg-bar" height={12} rx={3} width={row.width} x={70} y={17} />
        </g>
      ))}
    </>
  );
}

export function FeatureGlyph({ kind }: Readonly<{ kind: FeatureGlyphKind }>) {
  return (
    <svg aria-hidden="true" className="fg" data-kind={kind} viewBox="0 0 240 120">
      {kind === "scale" ? <ScaleGlyph /> : null}
      {kind === "formulas" ? <FormulasGlyph /> : null}
      {kind === "collaboration" ? <CollaborationGlyph /> : null}
      {kind === "database" ? <DatabaseGlyph /> : null}
      {kind === "interoperability" ? <InteroperabilityGlyph /> : null}
      {kind === "host-rows" ? <HostRowsGlyph /> : null}
    </svg>
  );
}
