import { useTimeline } from "./useTimeline.js";

/**
 * How one paste travels through the three layers, as a scripted 13-second
 * loop (see `STEP_TIMES`):
 *
 * 1. The Grid fills with 20,000 pasted cells. Many edits gather into one
 *    transaction that crosses to the engine.
 * 2. The engine's column store fills and a counter recalculates formulas.
 * 3. One packed render window crosses back; only the visible Grid cells repaint.
 * 4. The Grid sends one change event; your application logs it.
 * 5. Your application saves the operations; your server's version goes up.
 *
 * Each frame is drawn from the loop time through useTimeline. Reduced motion
 * shows the finished picture: everything filled and saved at v43.
 */

const LOOP_SECONDS = 13;
const STILL_SECONDS = 11.5;

const STEPS = [
  "You paste 20,000 cells. The Grid sends them to the engine in one transaction: one crossing, not 20,000.",
  "The engine stores the cells and recalculates every formula that reads them.",
  "The engine returns one packed render window. The Grid paints only what is on screen.",
  "The Grid reports a change event with the exact operations.",
  "Your application saves the operations to your server. Sheetwrite never talks to it.",
] as const;

/** When each numbered step starts; the last one runs to the end of the loop. */
const STEP_TIMES = [0, 3.0, 5.2, 7.2, 9.0] as const;

interface Layer {
  id: "app" | "grid" | "engine";
  x: number;
  title: string;
  owner: string;
  lines: readonly string[];
}

const BOX = { y: 24, w: 220, h: 254 } as const;
/** Baseline of the caption under each box's picture. */
const CAPTION_Y = BOX.y + BOX.h - 16;
const VISUAL_Y = BOX.y + 168;

const LAYERS: readonly Layer[] = [
  {
    id: "app",
    x: 20,
    title: "Your application",
    owner: "You own",
    lines: ["Rows and product UI", "Auth and permissions", "Server and storage"],
  },
  {
    id: "grid",
    x: 370,
    title: "Grid · TypeScript",
    owner: "Sheetwrite",
    lines: ["Input, selection, undo", "Virtual canvas rendering", "Transactions and events"],
  },
  {
    id: "engine",
    x: 720,
    title: "Engine · Rust/WASM",
    owner: "Sheetwrite",
    lines: ["Columnar cell store", "Formulas and recalculation", "Paging and snapshots"],
  },
];

const layerX = (id: Layer["id"]) => LAYERS.find((layer) => layer.id === id)?.x ?? 0;

/* Lanes between the boxes. */
const LANE = {
  tx: { y: 84, from: 590, to: 720 },
  window: { y: 134, from: 720, to: 590 },
  change: { y: 108, from: 370, to: 240 },
  save: { x: 130, from: BOX.y + BOX.h, to: 314 },
} as const;
const SERVER = { x: 20, y: 314, w: 220, h: 40 } as const;

/* The Grid's mini canvas: 8 × 3 cells. The window repaint covers 4 × 2. */
const GRID_CELLS = { cols: 8, rows: 3, size: 18, gap: 4 } as const;
const WINDOW_CELLS = { cols: 4, rows: 2 } as const;
const CELLS = Array.from({ length: GRID_CELLS.cols * GRID_CELLS.rows }, (_, index) => ({
  index,
  col: index % GRID_CELLS.cols,
  row: Math.floor(index / GRID_CELLS.cols),
}));
const cellX = (col: number) => layerX("grid") + 20 + col * (GRID_CELLS.size + GRID_CELLS.gap);
const cellY = (row: number) => VISUAL_Y + row * (GRID_CELLS.size + GRID_CELLS.gap) - 8;

/* The engine's column store: 7 columns that fill one after another. */
const COLUMNS = Array.from({ length: 7 }, (_, index) => index);
const COLUMN = { w: 18, gap: 8, h: 58 } as const;

/* Edits that gather into one transaction: they start on the pasted cells. */
const EDITS = CELLS.filter((cell) => cell.index % 2 === 0);

/* ---- Timing helpers ---------------------------------------------------------- */

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const span = (t: number, from: number, to: number) => ease(clamp((t - from) / (to - from)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** Fade in, hold, fade out over [from, to]. */
const windowed = (t: number, from: number, to: number, fade = 0.2) =>
  t < from || t > to ? 0 : clamp(Math.min((t - from) / fade, (to - t) / fade));
const count = (value: number) => Math.round(value).toLocaleString("en-US");

/* ---- Drawing ----------------------------------------------------------------- */

function query<T extends Element>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Architecture scene is missing ${selector}`);
  return found;
}

function all<T extends Element>(root: Element, selector: string): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

function createDraw(root: HTMLElement): (t: number) => void {
  const cells = all<SVGRectElement>(root, "[data-part=cell]");
  const edits = all<SVGCircleElement>(root, "[data-part=edit]");
  const columns = all<SVGRectElement>(root, "[data-part=column]");
  const byData = <T extends SVGElement>(selector: string, key: string) =>
    new Map(all<T>(root, selector).map((el) => [el.dataset[key] ?? "", el]));
  const glows = byData<SVGRectElement>("[data-part=glow]", "layer");
  const lanes = byData<SVGLineElement>("[data-lane]", "lane");
  const packets = byData<SVGGElement>("[data-packet]", "packet");
  const pasted = query<SVGTextElement>(root, "[data-part=pasted]");
  const formulas = query<SVGTextElement>(root, "[data-part=formulas]");
  const logLines = all<SVGTextElement>(root, "[data-part=log]");
  const version = query<SVGTextElement>(root, "[data-part=version]");
  const versionChip = query<SVGGElement>(root, "[data-part=version-chip]");
  const steps = all<HTMLElement>(root, "[data-step]");

  const opacity = (el: Element | undefined, value: number) => {
    if (el instanceof SVGElement || el instanceof HTMLElement) el.style.opacity = String(value);
  };
  const move = (el: Element | undefined, x: number, y: number, scale = 1) => {
    if (el instanceof SVGElement) {
      el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
  };

  return (t) => {
    let step = 0;
    for (const [index, start] of STEP_TIMES.entries()) if (t >= start) step = index;
    for (const [index, item] of steps.entries()) {
      item.dataset.current = String(index === step);
      item.firstElementChild?.setAttribute("aria-current", index === step ? "step" : "false");
    }
    // The whole picture fades back to empty during the last half second.
    const reset = 1 - span(t, LOOP_SECONDS - 0.6, LOOP_SECONDS - 0.1);

    // 1. Paste: the cells fill in a diagonal sweep, with a running count.
    const paste = span(t, 0.3, 1.5);
    for (const [index, cell] of cells.entries()) {
      const { col = 0, row = 0 } = CELLS[index] ?? {};
      const at = (col + row * 2) / (GRID_CELLS.cols + GRID_CELLS.rows * 2);
      cell.dataset.filled = String(paste > at && reset > 0.5);
      // 3. The render window repaints only the visible cells.
      const inWindow = col < WINDOW_CELLS.cols && row < WINDOW_CELLS.rows;
      const repaint = inWindow ? windowed(t, 6.3, 7.0, 0.1) : 0;
      cell.dataset.painted = String(repaint > 0.5);
    }
    pasted.textContent = `${count(20_000 * paste * reset)} cells pasted`;
    opacity(pasted, windowed(t, 0.3, 3.2));

    // Edits fly from their cells to the lane start and merge into one packet.
    const gather = span(t, 1.6, 2.3);
    for (const [index, edit] of edits.entries()) {
      const cell = EDITS[index];
      if (!cell) continue;
      const fromX = cellX(cell.col) + GRID_CELLS.size / 2;
      const fromY = cellY(cell.row) + GRID_CELLS.size / 2;
      // A small stagger so the dots arrive one after another.
      const k = clamp(gather * 1.4 - index * 0.03);
      move(edit, lerp(fromX, LANE.tx.from, ease(k)), lerp(fromY, LANE.tx.y, ease(k)));
      opacity(edit, t > 1.6 && k < 1 ? 1 : 0);
    }
    const tx = span(t, 2.35, 3.0);
    move(
      packets.get("tx"),
      lerp(LANE.tx.from, LANE.tx.to, tx),
      LANE.tx.y,
      0.6 + 0.4 * span(t, 2.2, 2.4),
    );
    opacity(packets.get("tx"), windowed(t, 2.2, 3.05, 0.1));

    // 2. Engine: the column store fills and formulas recalculate.
    for (const [index, column] of columns.entries()) {
      const k = span(t, 3.0 + index * 0.12, 3.5 + index * 0.12) * reset;
      column.setAttribute("height", String(COLUMN.h * k));
      column.setAttribute("y", String(VISUAL_Y + COLUMN.h - 14 - COLUMN.h * k));
    }
    formulas.textContent = `${count(312 * span(t, 3.4, 4.8) * reset)} formulas recalculated`;

    // 3. One render window crosses back.
    const back = span(t, 5.3, 6.1);
    move(packets.get("window"), lerp(LANE.window.from, LANE.window.to, back), LANE.window.y);
    opacity(packets.get("window"), windowed(t, 5.2, 6.15, 0.1));

    // 4. One change event to the application, which logs it.
    const change = span(t, 7.3, 8.1);
    move(packets.get("change"), lerp(LANE.change.from, LANE.change.to, change), LANE.change.y);
    opacity(packets.get("change"), windowed(t, 7.2, 8.15, 0.1));
    opacity(logLines[0], clamp((t - 8.1) / 0.3) * reset);
    opacity(logLines[1], clamp((t - 9.0) / 0.3) * reset);

    // 5. Save to your server; its version goes up when the save lands.
    const save = span(t, 9.1, 9.9);
    move(packets.get("save"), LANE.save.x, lerp(LANE.save.from, LANE.save.to, save));
    opacity(packets.get("save"), windowed(t, 9.0, 9.95, 0.1));
    const landed = t >= 9.9 && reset > 0.5;
    version.textContent = landed ? "v43" : "v42";
    const pop = landed ? 1 + 0.25 * (1 - span(t, 9.9, 10.3)) : 1;
    move(versionChip, 0, 0, pop);

    // Lanes flow while something crosses them.
    const flowing = {
      tx: t >= 2.2 && t <= 3.05,
      window: t >= 5.2 && t <= 6.15,
      change: t >= 7.2 && t <= 8.15,
      save: t >= 9.0 && t <= 9.95,
    };
    for (const [name, lane] of lanes) {
      lane.dataset.flowing = String(flowing[name as keyof typeof flowing] ?? false);
    }

    // The busy layer glows.
    opacity(glows.get("grid"), Math.max(windowed(t, 0.2, 2.4, 0.3), windowed(t, 6.1, 7.1, 0.2)));
    opacity(glows.get("engine"), windowed(t, 3.0, 5.2, 0.3));
    opacity(glows.get("app"), windowed(t, 8.1, 10.2, 0.3));
  };
}

/* ---- Component --------------------------------------------------------------- */

function Packet({ name, label, width }: Readonly<{ name: string; label: string; width: number }>) {
  return (
    <g className="as-packet" data-packet={name}>
      <rect height={22} rx={11} width={width} x={-width / 2} y={-11} />
      <text textAnchor="middle" x={0} y={4}>
        {label}
      </text>
    </g>
  );
}

export function ArchitectureScene() {
  const { ref, seek } = useTimeline<HTMLDivElement>({
    loopSeconds: LOOP_SECONDS,
    stillSeconds: STILL_SECONDS,
    create: createDraw,
  });
  const appX = layerX("app");
  const engineX = layerX("engine");
  return (
    <div className="sw-arch" data-landing-running="false" ref={ref}>
      <svg aria-hidden="true" className="as" viewBox="0 0 960 362">
        {LAYERS.map((layer) => (
          <g className="as-layer" data-layer={layer.id} key={layer.id}>
            <rect
              className="as-glow"
              data-layer={layer.id}
              data-part="glow"
              height={BOX.h + 12}
              rx={18}
              width={BOX.w + 12}
              x={layer.x - 6}
              y={BOX.y - 6}
            />
            <rect className="as-box" height={BOX.h} rx={14} width={BOX.w} x={layer.x} y={BOX.y} />
            <text className="as-owner" x={layer.x + 20} y={BOX.y + 28}>
              {layer.owner}
            </text>
            <text className="as-title" x={layer.x + 20} y={BOX.y + 54}>
              {layer.title}
            </text>
            {layer.lines.map((line, index) => (
              <text className="as-line" key={line} x={layer.x + 20} y={BOX.y + 86 + index * 22}>
                {line}
              </text>
            ))}
            <line
              className="as-divider"
              x1={layer.x + 20}
              x2={layer.x + BOX.w - 20}
              y1={VISUAL_Y - 22}
              y2={VISUAL_Y - 22}
            />
          </g>
        ))}

        {/* Grid: the mini canvas. */}
        {CELLS.map((cell) => (
          <rect
            className="as-cell"
            data-filled="true"
            data-part="cell"
            height={GRID_CELLS.size}
            key={cell.index}
            rx={3}
            width={GRID_CELLS.size}
            x={cellX(cell.col)}
            y={cellY(cell.row)}
          />
        ))}
        <text className="as-caption" data-part="pasted" x={layerX("grid") + 20} y={CAPTION_Y}>
          20,000 cells pasted
        </text>

        {/* Engine: the column store. */}
        {COLUMNS.map((index) => (
          <rect
            className="as-column"
            data-part="column"
            height={COLUMN.h}
            key={index}
            rx={3}
            width={COLUMN.w}
            x={engineX + 20 + index * (COLUMN.w + COLUMN.gap)}
            y={VISUAL_Y - 14}
          />
        ))}
        <text className="as-caption" data-part="formulas" x={engineX + 20} y={CAPTION_Y}>
          312 formulas recalculated
        </text>

        {/* Application: the event log. */}
        <text className="as-log" data-part="log" x={appX + 20} y={VISUAL_Y}>
          <tspan x={appX + 20}>onChange</tspan>
          <tspan className="as-log-detail" dy={22} x={appX + 20}>
            20,000 operations
          </tspan>
        </text>
        <text className="as-log" data-part="log" x={appX + 20} y={CAPTION_Y}>
          save → your server
        </text>

        {/* Lanes between the layers. */}
        <g className="as-lanes">
          <line data-lane="tx" x1={LANE.tx.from} x2={LANE.tx.to} y1={LANE.tx.y} y2={LANE.tx.y} />
          <text x={655} y={LANE.tx.y - 12}>
            1 transaction
          </text>
          <line
            data-lane="window"
            x1={LANE.window.from}
            x2={LANE.window.to}
            y1={LANE.window.y}
            y2={LANE.window.y}
          />
          <text x={655} y={LANE.window.y + 22}>
            render window
          </text>
          <line
            data-lane="change"
            x1={LANE.change.from}
            x2={LANE.change.to}
            y1={LANE.change.y}
            y2={LANE.change.y}
          />
          <text x={305} y={LANE.change.y - 12}>
            change event
          </text>
          <line
            data-lane="save"
            x1={LANE.save.x}
            x2={LANE.save.x}
            y1={LANE.save.from}
            y2={LANE.save.to}
          />
        </g>

        <g className="as-server">
          <rect height={SERVER.h} rx={10} width={SERVER.w} x={SERVER.x} y={SERVER.y} />
          <text x={SERVER.x + 90} y={SERVER.y + 25}>
            Your server
          </text>
          <g className="as-version" data-part="version-chip">
            <rect height={22} rx={11} width={52} x={SERVER.x + 152} y={SERVER.y + 9} />
            <text data-part="version" x={SERVER.x + 178} y={SERVER.y + 24}>
              v43
            </text>
          </g>
        </g>

        {EDITS.map((cell) => (
          <circle className="as-edit" data-part="edit" key={cell.index} r={3.5} />
        ))}
        <Packet label="1 tx" name="tx" width={52} />
        <Packet label="window" name="window" width={70} />
        <Packet label="change" name="change" width={70} />
        <Packet label="save" name="save" width={52} />
      </svg>
      <ol className="sw-arch__steps">
        {STEPS.map((step, index) => (
          <li data-current={index === STEPS.length - 1} data-step={index + 1} key={step}>
            <button onClick={() => seek(STEP_TIMES[index] ?? 0)} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span>
              {step}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
