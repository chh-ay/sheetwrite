import { type CSSProperties, useEffect, useState } from "react";

import { onTabListKey } from "./tabKeys.js";
import { useScenePlayback } from "./useScenePlayback.js";

/**
 * A reel of four short animated stories. Each plays one 10-second loop and
 * then hands over to the next; the progress bar in the active tab is the
 * timer, so a paused (off-screen) reel also stops advancing, and reduced
 * motion shows each story's finished picture with no automatic change.
 */

const STORY_SECONDS = 10;

interface Story {
  id: "analysis" | "spill" | "offline" | "undo";
  tab: string;
  title: string;
  detail: string;
  href: string;
  link: string;
}

const STORIES: readonly Story[] = [
  {
    id: "analysis",
    tab: "Pivots and charts",
    title: "Change an order. The pivot and the chart follow.",
    detail:
      "A pivot table sums the orders by region, and a chart reads the pivot's cells. Edit one order and both update in place, with no refresh call.",
    href: "/showcases/analysis/",
    link: "Try the analysis showcase",
  },
  {
    id: "spill",
    tab: "Dynamic arrays",
    title: "One formula. The answer takes the space it needs.",
    detail:
      "FILTER spills its result into the cells below. When a source value changes, the spill grows, and every formula that reads E2# follows.",
    href: "/showcases/formulas/",
    link: "Try the formula showcase",
  },
  {
    id: "offline",
    tab: "Offline and sync",
    title: "Lose the network. Keep every edit.",
    detail:
      "Edits made offline wait in a durable outbox. On reconnect they drain in order, the server gives each a version, and the other client follows.",
    href: "/showcases/collaboration/",
    link: "Try the collaboration showcase",
  },
  {
    id: "undo",
    tab: "Large undo",
    title: "Clear 100,000 cells. Undo it in one step.",
    detail:
      "Undo sends one compressed restore. When it is larger than one server version, it travels as one atomic batch: every peer applies all of it or none.",
    href: "/showcases/database/",
    link: "Try the database showcase",
  },
];

const secs = (seconds: number) => `${seconds.toFixed(2)}s`;
const delay = (seconds: number): CSSProperties => ({ animationDelay: secs(seconds) });

/* ---- Story 1: FILTER spills, then grows ---------------------------------------- */

const SOURCE_ROWS = [
  ["EMEA", "Chair", "3,200"],
  ["APAC", "Desk", "6,400"],
  ["AMER", "Lamp", "2,100"],
  ["APAC", "Screen", "3,100"],
  ["EMEA", "Desk", "4,800"],
  ["AMER", "Chair", "1,900"],
] as const;

function SpillStory() {
  const rowY = (index: number) => 76 + index * 30;
  return (
    <svg aria-hidden="true" className="sr sr-spill" viewBox="0 0 640 330">
      <g className="sr-table">
        <rect className="sr-panel" height={250} rx={10} width={292} x={20} y={30} />
        {["Region", "Product", "Revenue"].map((label, index) => (
          <text
            className="sr-head"
            key={label}
            x={[36, 112, 296][index]}
            y={58}
            data-num={index === 2 || undefined}
          >
            {label}
          </text>
        ))}
        {SOURCE_ROWS.map(([region, product, revenue], index) => (
          <g key={`${region}-${product}`}>
            <line
              className="sr-rule"
              x1={28}
              x2={304}
              y1={rowY(index) - 10}
              y2={rowY(index) - 10}
            />
            <text className="sr-cell" x={36} y={rowY(index) + 10}>
              {region}
            </text>
            <text className="sr-cell" x={112} y={rowY(index) + 10}>
              {product}
            </text>
            {index === 3 ? (
              <g className="sr-change">
                <rect className="sr-flash" height={30} width={90} x={214} y={rowY(index) - 10} />
                <text className="sr-cell sr-before" data-num="" x={296} y={rowY(index) + 10}>
                  {revenue}
                </text>
                <text className="sr-cell sr-after" data-num="" x={296} y={rowY(index) + 10}>
                  5,200
                </text>
              </g>
            ) : (
              <text className="sr-cell" data-num="" x={296} y={rowY(index) + 10}>
                {revenue}
              </text>
            )}
          </g>
        ))}
      </g>

      <g className="sr-out">
        <rect className="sr-panel" height={250} rx={10} width={268} x={352} y={30} />
        <defs>
          <clipPath id="sr-type-clip">
            <rect className="sr-type" height={24} width={240} x={366} y={40} />
          </clipPath>
        </defs>
        <text className="sr-formula" clipPath="url(#sr-type-clip)" x={368} y={58}>
          =FILTER(A2:C7, C2:C7&gt;4000)
        </text>
        <text className="sr-cell sr-spill-row" style={delay(3)} x={372} y={96}>
          APAC · Desk
        </text>
        <text className="sr-cell sr-spill-row" data-num="" style={delay(3)} x={604} y={96}>
          6,400
        </text>
        <text className="sr-cell sr-spill-row" style={delay(3.3)} x={372} y={126}>
          EMEA · Desk
        </text>
        <text className="sr-cell sr-spill-row" data-num="" style={delay(3.3)} x={604} y={126}>
          4,800
        </text>
        <g className="sr-grow">
          <text className="sr-cell" x={372} y={156}>
            APAC · Screen
          </text>
          <text className="sr-cell" data-num="" x={604} y={156}>
            5,200
          </text>
        </g>
        <rect className="sr-spill-edge" height={92} rx={4} width={246} x={364} y={74} />
        <text className="sr-tag" x={366} y={210}>
          =ROWS(E2#)
        </text>
        <g className="sr-change-count">
          <text className="sr-count sr-before" data-num="" x={604} y={210}>
            2
          </text>
          <text className="sr-count sr-after" data-num="" x={604} y={210}>
            3
          </text>
        </g>
        <text className="sr-note" x={366} y={256}>
          E2# reads the whole spill, whatever its size.
        </text>
      </g>
      <path className="sr-link" d="M 312 156 C 330 156, 336 140, 352 140" />
    </svg>
  );
}

/* ---- Analysis story: orders → pivot → chart -------------------------------------------- */

/** Orders by region; the first EMEA order changes at 6 s. */
const ORDERS = [
  ["EMEA", 3200],
  ["APAC", 6400],
  ["AMER", 2100],
  ["APAC", 3100],
  ["EMEA", 4800],
  ["AMER", 1900],
] as const;
const EDITED_ORDER = 0;
const EDITED_REVENUE = 6200;
const REGIONS = ["AMER", "APAC", "EMEA"] as const;
const EDITED_REGION = "EMEA";
/** The chart's value axis ends here, above the edited EMEA bar. */
const ANALYSIS_MAX = 12_000;
const PLOT = { x: 452, base: 236, height: 150, width: 34, pitch: 56 } as const;

const thousands = (value: number) => value.toLocaleString("en-US");
const regionTotal = (region: string, edited: boolean) =>
  ORDERS.reduce(
    (total, [name, revenue], index) =>
      name === region
        ? total + (edited && index === EDITED_ORDER ? EDITED_REVENUE : revenue)
        : total,
    0,
  );

/** A value that changes at the story's edit: the old one shows until then. */
function Changed({
  before,
  after,
  x,
  y,
}: Readonly<{ before: string; after: string; x: number; y: number }>) {
  return (
    <>
      <text className="sr-cell sr-before" data-num="" x={x} y={y}>
        {before}
      </text>
      <text className="sr-cell sr-after" data-num="" x={x} y={y}>
        {after}
      </text>
    </>
  );
}

function AnalysisStory() {
  const rowY = (index: number) => 76 + index * 30;
  const grand = (edited: boolean) =>
    REGIONS.reduce((total, region) => total + regionTotal(region, edited), 0);
  return (
    <svg aria-hidden="true" className="sr sr-analysis" viewBox="0 0 640 330">
      <g>
        <rect className="sr-panel" height={250} rx={10} width={196} x={20} y={30} />
        <text className="sr-head" x={36} y={58}>
          Region
        </text>
        <text className="sr-head" data-num="" x={200} y={58}>
          Revenue
        </text>
        {ORDERS.map(([region, revenue], index) => (
          // oxlint-disable-next-line react/no-array-index-key -- rows repeat regions; the index is the order.
          <g key={index}>
            <line
              className="sr-rule"
              x1={28}
              x2={208}
              y1={rowY(index) - 10}
              y2={rowY(index) - 10}
            />
            <text className="sr-cell" x={36} y={rowY(index) + 10}>
              {region}
            </text>
            {index === EDITED_ORDER ? (
              <g className="sr-change" data-step="order">
                <rect className="sr-flash" height={30} width={84} x={124} y={rowY(index) - 10} />
                <Changed
                  after={thousands(EDITED_REVENUE)}
                  before={thousands(revenue)}
                  x={200}
                  y={rowY(index) + 10}
                />
              </g>
            ) : (
              <text className="sr-cell" data-num="" x={200} y={rowY(index) + 10}>
                {thousands(revenue)}
              </text>
            )}
          </g>
        ))}
      </g>

      <path className="sr-link" d="M 216 86 C 226 86, 226 136, 236 136" />

      <g>
        <rect className="sr-panel" height={250} rx={10} width={178} x={236} y={30} />
        <text className="sr-head" x={252} y={58}>
          Region
        </text>
        <text className="sr-head" data-num="" x={398} y={58}>
          Sum of Revenue
        </text>
        {REGIONS.map((region, index) => (
          <g className="sr-pivot-row" key={region} style={delay(0.8 + index * 0.25)}>
            <line
              className="sr-rule"
              x1={244}
              x2={406}
              y1={rowY(index) - 10}
              y2={rowY(index) - 10}
            />
            <text className="sr-cell" x={252} y={rowY(index) + 10}>
              {region}
            </text>
            {region === EDITED_REGION ? (
              <g className="sr-change" data-step="pivot">
                <rect className="sr-flash" height={30} width={84} x={322} y={rowY(index) - 10} />
                <Changed
                  after={thousands(regionTotal(region, true))}
                  before={thousands(regionTotal(region, false))}
                  x={398}
                  y={rowY(index) + 10}
                />
              </g>
            ) : (
              <text className="sr-cell" data-num="" x={398} y={rowY(index) + 10}>
                {thousands(regionTotal(region, false))}
              </text>
            )}
          </g>
        ))}
        <g className="sr-pivot-row" style={delay(1.6)}>
          <line className="sr-rule sr-total-rule" x1={244} x2={406} y1={166} y2={166} />
          <text className="sr-cell sr-total" x={252} y={186}>
            Grand Total
          </text>
          <g className="sr-change" data-step="pivot">
            <Changed
              after={thousands(grand(true))}
              before={thousands(grand(false))}
              x={398}
              y={186}
            />
          </g>
        </g>
      </g>

      <path className="sr-link" d="M 414 136 C 424 136, 424 120, 434 120" />

      <g>
        <rect className="sr-panel" height={250} rx={10} width={186} x={434} y={30} />
        <text className="sr-head" data-center="" x={527} y={58}>
          Revenue by region
        </text>
        <line className="sr-rule" x1={446} x2={608} y1={PLOT.base} y2={PLOT.base} />
        {REGIONS.map((region, index) => {
          const after = regionTotal(region, true);
          const height = (after / ANALYSIS_MAX) * PLOT.height;
          const x = PLOT.x + index * PLOT.pitch;
          const edited = region === EDITED_REGION;
          return (
            <g key={region}>
              <rect
                className="sr-bar"
                data-edited={edited || undefined}
                height={height}
                rx={3}
                style={
                  {
                    // The edited bar runs one absolute timeline (sr-bar-follow), so
                    // an inline delay would shift its edit away from the cells'.
                    animationDelay: edited ? undefined : secs(2.2 + index * 0.2),
                    // It holds at its old share until the edit lands.
                    "--sr-from": edited ? regionTotal(region, false) / after : 1,
                  } as CSSProperties
                }
                width={PLOT.width}
                x={x}
                y={PLOT.base - height}
              />
              <text className="sr-cell" data-center="" x={x + PLOT.width / 2} y={PLOT.base + 18}>
                {region}
              </text>
            </g>
          );
        })}
      </g>

      <text className="sr-note" x={20} y={310}>
        The pivot reads the orders; the chart reads the pivot&apos;s cells.
      </text>
    </svg>
  );
}

/* ---- Story 2: offline edits queue, then drain ------------------------------------ */

/**
 * One timeline per offline edit, in seconds. Bram edits while offline, the
 * outbox drains after he reconnects at 5 s (sr-online flips at 50 %), the
 * server commits each edit as the next version, then Ana applies it.
 */
const OFFLINE_EDITS = [0, 1, 2].map((index) => {
  const edit = 1.6 + index * 0.9;
  const drain = 5.3 + index * 1.1;
  const commit = drain + 0.6;
  const send = commit + 0.1;
  return {
    // The diagonal cells B2, C3, D4 of each 4 × 4 grid.
    cell: (index + 1) * 5,
    edit,
    drain,
    commit,
    send,
    apply: send + 0.55,
  };
});

const FIRST_VERSION = 42;
const OFFLINE_VERSIONS = [
  FIRST_VERSION,
  ...OFFLINE_EDITS.map((_, index) => FIRST_VERSION + index + 1),
];

const MINI_X0 = 16;
const MINI_Y0 = 124;
const MINI_PITCH_X = 40;
const MINI_PITCH_Y = 26;
const MINI_WIDTH = 36;
const MINI_HEIGHT = 22;
const MINI_COLUMNS = 4;
const MINI_CELLS = MINI_COLUMNS * MINI_COLUMNS;

function miniCell(gridX: number, index: number) {
  return {
    x: gridX + MINI_X0 + (index % MINI_COLUMNS) * MINI_PITCH_X,
    y: MINI_Y0 + Math.floor(index / MINI_COLUMNS) * MINI_PITCH_Y,
  };
}

function miniCentre(gridX: number, index: number) {
  const cell = miniCell(gridX, index);

  return { x: cell.x + MINI_WIDTH / 2, y: cell.y + MINI_HEIGHT / 2 };
}

function MiniGrid({
  x,
  marked,
}: Readonly<{ x: number; marked: ReadonlyMap<number, CSSProperties> }>) {
  const cells = [];
  for (let index = 0; index < MINI_CELLS; index++) {
    cells.push(
      <rect
        className="sr-mini"
        data-flash={marked.has(index) || undefined}
        height={MINI_HEIGHT}
        key={index}
        rx={2}
        style={marked.get(index)}
        width={MINI_WIDTH}
        {...miniCell(x, index)}
      />,
    );
  }
  return <>{cells}</>;
}

/**
 * Version numbers roll like an odometer inside a clip window: the old value
 * slides up and out as the new one slides up into place. `changes[k]` is when
 * `values[k]` gives way to `values[k + 1]`.
 */
function VersionRoll({
  className,
  clipId,
  values,
  changes,
  x,
  y,
  clip,
  center = false,
}: Readonly<{
  className: string;
  clipId: string;
  values: readonly number[];
  changes: readonly number[];
  x: number;
  y: number;
  clip: { x: number; y: number; width: number; height: number };
  center?: boolean;
}>) {
  return (
    <g className="sr-roll-window" clipPath={`url(#${clipId})`}>
      <clipPath id={clipId}>
        <rect {...clip} />
      </clipPath>
      {values.map((value, step) => {
        const out = changes[step];
        return (
          <text
            className={`${className} sr-roll`}
            data-center={center ? "" : undefined}
            data-final={out === undefined || undefined}
            data-first={step === 0 || undefined}
            data-num=""
            key={value}
            style={
              {
                "--in": step > 0 ? secs(changes[step - 1] ?? 0) : undefined,
                "--out": out === undefined ? undefined : secs(out),
              } as CSSProperties
            }
            x={x}
            y={y}
          >
            v{value}
          </text>
        );
      })}
    </g>
  );
}

/* Bram's outbox: the band under his grid (grid ends at y 224, card at y 290). */
const OUTBOX_X = 440;
const OUTBOX_Y = 258;
const OUTBOX_CHIP_WIDTH = 50;
const OUTBOX_CHIP_HEIGHT = 20;
const OUTBOX_PITCH = 56;
const SERVER_CENTER = { x: 320, y: 165 } as const;
/** Where a draining chip leaves Bram's card: the end of his wire. */
const BRAM_EXIT = { x: 430, y: 165 } as const;
/** Where a packet reaches Ana's card: the end of her wire. */
const ANA_ENTRY = { x: 216, y: 165 } as const;
const ANA_GRID_X = 20;
const BRAM_GRID_X = 424;
// Shift the queue near the middle of the 0.6-second chip drain.
const QUEUE_SHIFT_DELAY = 0.35;
const PACKET_CHAR_WIDTH = 7;
const PACKET_PADDING = 16;

const px = (value: number) => `${value}px`;

/**
 * A change on the wire, labelled with what it is: amber while it is a pending
 * client edit, green once the server has given it a version.
 */
function Packet({
  label,
  x,
  y,
  tone,
  style,
}: Readonly<{
  label: string;
  x: number;
  y: number;
  tone: "pending" | "committed";
  style: CSSProperties;
}>) {
  const width = label.length * PACKET_CHAR_WIDTH + PACKET_PADDING;
  return (
    <g className="sr-packet" data-tone={tone} style={style}>
      <rect height={20} rx={10} width={width} x={x - width / 2} y={y - 10} />
      <text x={x} y={y + 4} data-center="">
        {label}
      </text>
    </g>
  );
}

function OfflineStory() {
  const bramCells = new Map(
    OFFLINE_EDITS.map((edit) => [
      edit.cell,
      { "--edit": secs(edit.edit), "--ack": secs(edit.commit) } as CSSProperties,
    ]),
  );
  const anaCells = new Map(
    OFFLINE_EDITS.map((edit) => [edit.cell, { "--apply": secs(edit.apply) } as CSSProperties]),
  );
  // Every chip drains from the head of the queue (slot 0), after the chips ahead of it left.
  const head = { x: OUTBOX_X + OUTBOX_CHIP_WIDTH / 2, y: OUTBOX_Y + OUTBOX_CHIP_HEIGHT / 2 };

  return (
    <svg aria-hidden="true" className="sr sr-offline" viewBox="0 0 640 330">
      <g className="sr-device" data-device="ana">
        <rect className="sr-panel" height={250} rx={12} width={196} x={20} y={40} />
        <text className="sr-name" x={36} y={70}>
          Ana
        </text>
        <circle className="sr-dot" cx={196} cy={65} r={6} />
        <text className="sr-sub" x={36} y={94}>
          version
        </text>
        <VersionRoll
          changes={OFFLINE_EDITS.map((edit) => edit.apply)}
          className="sr-ver"
          clip={{ x: 140, y: 80, width: 60, height: 19 }}
          clipId="sr-clip-ana"
          values={OFFLINE_VERSIONS}
          x={196}
          y={94}
        />
        <MiniGrid marked={anaCells} x={ANA_GRID_X} />
      </g>

      <g className="sr-server">
        <rect className="sr-panel" height={110} rx={12} width={132} x={254} y={110} />
        {OFFLINE_EDITS.map((edit) => (
          <rect
            className="sr-pulse"
            height={110}
            key={edit.cell}
            rx={12}
            style={{ "--at": secs(edit.commit) } as CSSProperties}
            width={132}
            x={254}
            y={110}
          />
        ))}
        <text className="sr-name" x={320} y={142} data-center="">
          Your server
        </text>
        <VersionRoll
          center
          changes={OFFLINE_EDITS.map((edit) => edit.commit)}
          className="sr-big"
          clip={{ x: 262, y: 160, width: 116, height: 34 }}
          clipId="sr-clip-server"
          values={OFFLINE_VERSIONS}
          x={320}
          y={186}
        />
      </g>

      <line className="sr-wire" data-side="ana" x1={216} x2={254} y1={165} y2={165} />
      <line className="sr-wire" data-side="bram" x1={386} x2={424} y1={165} y2={165} />

      <g className="sr-device" data-device="bram">
        <rect className="sr-panel" height={250} rx={12} width={196} x={424} y={40} />
        <text className="sr-name" x={440} y={70}>
          Bram
        </text>
        <circle className="sr-dot sr-dot-bram" cx={600} cy={65} r={6} />
        <text className="sr-sub sr-state-online" x={440} y={94}>
          online
        </text>
        <text className="sr-sub sr-state-offline" x={440} y={94}>
          offline
        </text>
        <MiniGrid marked={bramCells} x={BRAM_GRID_X} />
        <text className="sr-sub" x={440} y={248}>
          Outbox
        </text>
      </g>

      {OFFLINE_EDITS.map((edit, index) => {
        const slotX = OUTBOX_X + index * OUTBOX_PITCH;
        const slot = { x: slotX + OUTBOX_CHIP_WIDTH / 2, y: head.y };
        const cell = miniCentre(BRAM_GRID_X, edit.cell);
        // The queue moves up one slot each time a chip ahead of this one leaves.
        const shifts = OFFLINE_EDITS.slice(0, index).map((ahead) =>
          secs(ahead.drain + QUEUE_SHIFT_DELAY),
        );
        return (
          <g
            className="sr-queue"
            data-shifts={shifts.length}
            key={edit.cell}
            style={
              {
                "--pitch": px(OUTBOX_PITCH),
                "--shift-1": shifts[0],
                "--shift-2": shifts[1],
              } as CSSProperties
            }
          >
            <g
              className="sr-outbox"
              style={
                {
                  "--edit": secs(edit.edit),
                  "--drain": secs(edit.drain),
                  "--from-x": px(cell.x - slot.x),
                  "--from-y": px(cell.y - slot.y),
                  "--exit-x": px(BRAM_EXIT.x - head.x),
                  "--exit-y": px(BRAM_EXIT.y - head.y),
                  "--to-x": px(SERVER_CENTER.x - head.x),
                  "--to-y": px(SERVER_CENTER.y - head.y),
                } as CSSProperties
              }
            >
              <rect
                height={OUTBOX_CHIP_HEIGHT}
                rx={OUTBOX_CHIP_HEIGHT / 2}
                width={OUTBOX_CHIP_WIDTH}
                x={slotX}
                y={OUTBOX_Y}
              />
              <text x={slot.x} y={OUTBOX_Y + 14} data-center="">
                edit {index + 1}
              </text>
            </g>
          </g>
        );
      })}

      {OFFLINE_EDITS.map((edit, index) => {
        const cell = miniCentre(ANA_GRID_X, edit.cell);
        return (
          <Packet
            key={edit.cell}
            label={`v${FIRST_VERSION + index + 1}`}
            style={
              {
                "--send": secs(edit.send),
                "--wire-x": px(ANA_ENTRY.x - SERVER_CENTER.x),
                "--to-x": px(cell.x - SERVER_CENTER.x),
                "--to-y": px(cell.y - SERVER_CENTER.y),
              } as CSSProperties
            }
            tone="committed"
            x={SERVER_CENTER.x}
            y={SERVER_CENTER.y}
          />
        );
      })}
    </svg>
  );
}

/* ---- Story 3: clear, then one-step undo ------------------------------------------ */

/**
 * The undo story's schedule, in seconds. The clear first syncs as one ordinary
 * version (v50), so the undo's five-version atomic batch reads as different.
 */
const UNDO = {
  clearToServer: 2.5,
  clearCommit: 2.8,
  clearToPeer: 2.9,
  clearApplied: 3.2,
  localRestore: 4.0,
  restoreSend: 4.2,
  batchChips: 5.25,
  batchCommit: 5.9,
  batchSend: 6.2,
  batchApplied: 6.9,
} as const;

const UNDO_SERVER = { x: 508, y: 34, width: 120, height: 100 } as const;
const UNDO_PEER = { x: 508, y: 194, width: 120, height: 100 } as const;
const UNDO_CENTER_X = UNDO_SERVER.x + UNDO_SERVER.width / 2;
/** The grid → server wire, level with the server's centre. */
const UNDO_WIRE_Y = UNDO_SERVER.y + UNDO_SERVER.height / 2;
const BATCH_VERSIONS = [51, 52, 53, 54, 55] as const;
const UNDO_VERSIONS = [BATCH_VERSIONS[0] - 2, BATCH_VERSIONS[0] - 1, Math.max(...BATCH_VERSIONS)];
const BLOCK_X = 404;
const BLOCK_WIDTH = 100;
const BLOCK_CENTER_X = BLOCK_X + BLOCK_WIDTH / 2;
/** The clear packet starts just right of the grid card, on the wire. */
const CLEAR_PACKET_X = 430;
/** Centre of the peer's 3 × 2 cell block (rows at y 248 and 266, 14 tall). */
const PEER_CELLS_CENTER_Y = 264;
const BATCH_CHIP_WIDTH = 20;
const BATCH_CHIP_GAP = 2;
const BATCH_Y = 98;
const BATCH_X =
  UNDO_CENTER_X -
  (BATCH_VERSIONS.length * BATCH_CHIP_WIDTH + (BATCH_VERSIONS.length - 1) * BATCH_CHIP_GAP) / 2;

/** The peer's 3 × 2 cell block, centred in its card. */
function PeerCells({ className }: Readonly<{ className: string }>) {
  return (
    <g className={className}>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <rect
          height={14}
          key={index}
          rx={2}
          width={18}
          x={537 + (index % 3) * 22}
          y={248 + Math.floor(index / 3) * 18}
        />
      ))}
    </g>
  );
}

function UndoStory() {
  const cells = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 14; column++) {
      const shade = ((row * 7 + column * 3) % 5) / 10 + 0.18;
      cells.push(
        <rect
          className="sr-data"
          height={20}
          key={`${row}-${column}`}
          rx={2}
          // The clear sweeps left to right from 1 s into the story.
          style={{ ...delay(1 + column * 0.09 + row * 0.03), "--shade": shade } as CSSProperties}
          width={22}
          x={24 + column * 26}
          y={50 + row * 26}
        />,
      );
    }
  }
  const restored = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 14; column++) {
      const shade = ((row * 7 + column * 3) % 5) / 10 + 0.18;
      restored.push(
        <rect
          height={20}
          key={`${row}-${column}`}
          rx={2}
          style={{ "--shade": shade } as CSSProperties}
          width={22}
          x={24 + column * 26}
          y={50 + row * 26}
        />,
      );
    }
  }
  const peerDrop = UNDO_PEER.y - UNDO_SERVER.y;

  return (
    <svg
      aria-hidden="true"
      className="sr sr-undo"
      style={
        {
          "--local-restore": secs(UNDO.localRestore),
          "--restore-send": secs(UNDO.restoreSend),
          "--batch-send": secs(UNDO.batchSend),
          "--batch-applied": secs(UNDO.batchApplied),
          "--clear-applied": secs(UNDO.clearApplied),
          "--peer-drop": px(peerDrop),
        } as CSSProperties
      }
      viewBox="0 0 640 330"
    >
      <rect className="sr-panel" height={260} rx={12} width={388} x={12} y={34} />
      <g className="sr-cells">{cells}</g>
      <g className="sr-restored">{restored}</g>
      {/* Inside the grid card, in the band under the last row (rows end at y 252). */}
      <g className="sr-cleared">
        <rect height={24} rx={12} width={196} x={108} y={262} />
        <text x={206} y={278} data-center="">
          100,000 cells cleared
        </text>
      </g>
      <g className="sr-key">
        <rect height={40} rx={8} width={64} x={174} y={146} />
        <text x={206} y={172} data-center="">
          Undo
        </text>
      </g>

      {/* Grid → server → peer. Every change travels these two wires. */}
      <line className="sr-wire" x1={400} x2={UNDO_SERVER.x} y1={UNDO_WIRE_Y} y2={UNDO_WIRE_Y} />
      <line
        className="sr-wire"
        x1={UNDO_CENTER_X}
        x2={UNDO_CENTER_X}
        y1={UNDO_SERVER.y + UNDO_SERVER.height}
        y2={UNDO_PEER.y}
      />

      <g className="sr-server">
        <rect className="sr-panel" rx={10} {...UNDO_SERVER} />
        {[UNDO.clearCommit, UNDO.batchCommit].map((at) => (
          <rect
            className="sr-pulse"
            key={at}
            rx={10}
            style={{ "--at": secs(at) } as CSSProperties}
            {...UNDO_SERVER}
          />
        ))}
        <text className="sr-name" x={UNDO_CENTER_X} y={60} data-center="">
          Server
        </text>
        <VersionRoll
          center
          changes={[UNDO.clearCommit, UNDO.batchCommit]}
          className="sr-ver"
          clip={{ x: UNDO_SERVER.x + 8, y: 71, width: UNDO_SERVER.width - 16, height: 19 }}
          clipId="sr-clip-undo-server"
          values={UNDO_VERSIONS}
          x={UNDO_CENTER_X}
          y={85}
        />
      </g>

      <g className="sr-peer">
        <rect className="sr-panel" rx={10} {...UNDO_PEER} />
        {[UNDO.clearApplied, UNDO.batchApplied].map((at) => (
          <rect
            className="sr-pulse"
            key={at}
            rx={10}
            style={{ "--at": secs(at) } as CSSProperties}
            {...UNDO_PEER}
          />
        ))}
        <text className="sr-name" x={UNDO_CENTER_X} y={218} data-center="">
          Peer
        </text>
        <VersionRoll
          center
          changes={[UNDO.clearApplied, UNDO.batchApplied]}
          className="sr-ver"
          clip={{ x: UNDO_PEER.x + 8, y: 225, width: UNDO_PEER.width - 16, height: 19 }}
          clipId="sr-clip-undo-peer"
          values={UNDO_VERSIONS}
          x={UNDO_CENTER_X}
          y={239}
        />
        <PeerCells className="sr-peer-empty" />
        <PeerCells className="sr-peer-cells" />
      </g>

      {/* The clear syncs as one ordinary version: it reaches the server as a
          pending change, and the peer receives it as v50. */}
      <Packet
        label="clear"
        style={
          {
            "--at": secs(UNDO.clearToServer),
            "--dx": px(UNDO_CENTER_X - CLEAR_PACKET_X),
            "--dy": "0px",
          } as CSSProperties
        }
        tone="pending"
        x={CLEAR_PACKET_X}
        y={UNDO_WIRE_Y}
      />
      <Packet
        label="v50"
        style={
          {
            "--at": secs(UNDO.clearToPeer),
            "--dx": "0px",
            "--dy": px(PEER_CELLS_CENTER_Y - (UNDO_SERVER.y + UNDO_SERVER.height)),
          } as CSSProperties
        }
        tone="committed"
        x={UNDO_CENTER_X}
        y={UNDO_SERVER.y + UNDO_SERVER.height}
      />

      {/* One compressed restore leaves the grid on the wire and merges into the server. */}
      <g
        className="sr-block"
        style={{ "--dx": px(UNDO_CENTER_X - BLOCK_CENTER_X) } as CSSProperties}
      >
        <rect height={46} rx={8} width={BLOCK_WIDTH} x={BLOCK_X} y={UNDO_WIRE_Y - 23} />
        <text x={BLOCK_CENTER_X} y={UNDO_WIRE_Y - 3} data-center="">
          1 restore
        </text>
        <text className="sr-block-sub" x={BLOCK_CENTER_X} y={UNDO_WIRE_Y + 13} data-center="">
          compressed
        </text>
      </g>

      {/* The server splits it into five versions, held together as one batch,
          then sends the batch to the peer as a unit. */}
      <g className="sr-batch-group">
        <rect
          className="sr-batch-outline"
          style={{ "--at": secs(UNDO.batchChips + 0.5) } as CSSProperties}
          height={22}
          rx={6}
          width={UNDO_SERVER.width - 8}
          x={UNDO_SERVER.x + 4}
          y={BATCH_Y - 3}
        />
        {BATCH_VERSIONS.map((version, index) => {
          const x = BATCH_X + index * (BATCH_CHIP_WIDTH + BATCH_CHIP_GAP);
          return (
            <g
              className="sr-batch-chip"
              key={version}
              style={{ "--at": secs(UNDO.batchChips + index * 0.1) } as CSSProperties}
            >
              <rect height={16} rx={3} width={BATCH_CHIP_WIDTH} x={x} y={BATCH_Y} />
              <text x={x + BATCH_CHIP_WIDTH / 2} y={BATCH_Y + 12} data-center="">
                {version}
              </text>
            </g>
          );
        })}
      </g>

      <text className="sr-batch" x={UNDO_CENTER_X} y={316} data-center="">
        one atomic batch
      </text>
    </svg>
  );
}

export function StoryReel() {
  const [active, setActive] = useState<Story["id"]>("analysis");
  const { ref, epoch, sync } = useScenePlayback<HTMLDivElement>();
  useEffect(() => {
    void active;
    requestAnimationFrame(sync);
  }, [active, sync]);
  const index = STORIES.findIndex((story) => story.id === active);
  const story = STORIES[index] ?? (STORIES[0] as Story);
  const advance = () => setActive(STORIES[(index + 1) % STORIES.length]?.id ?? "analysis");
  return (
    <div
      className="sw-reel"
      ref={ref}
      style={{ "--sr-loop": `${STORY_SECONDS}s` } as CSSProperties}
    >
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- the tabs inside take focus; the tab list itself does not. */}
      <div
        aria-label="Stories"
        className="sw-reel__tabs"
        onKeyDown={(event) =>
          onTabListKey(
            event,
            STORIES.map((item) => item.id),
            active,
            setActive,
            (id) => `landing-story-${id}`,
          )
        }
        role="tablist"
        // The indicator slides to this tab instead of jumping.
        style={{ "--sr-index": Math.max(index, 0), "--sr-count": STORIES.length } as CSSProperties}
      >
        {STORIES.map((item) => (
          <button
            aria-controls="landing-story-panel"
            aria-selected={item.id === active}
            id={`landing-story-${item.id}`}
            key={item.id}
            onClick={() => setActive(item.id)}
            role="tab"
            tabIndex={item.id === active ? 0 : -1}
            type="button"
          >
            <span>{item.tab}</span>
            {item.id === active ? (
              <i
                aria-hidden="true"
                className="sw-reel__timer"
                key={`${item.id}-${epoch}`}
                onAnimationEnd={advance}
              />
            ) : null}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`landing-story-${story.id}`}
        className="sw-reel__panel"
        id="landing-story-panel"
        role="tabpanel"
      >
        {/* The copy key remounts it so its fade plays on each story. Sibling keys must differ. */}
        <div className="sw-reel__copy" key={`copy-${story.id}`}>
          <h3>{story.title}</h3>
          <p>{story.detail}</p>
          <a href={story.href}>{story.link} →</a>
        </div>
        <div className="sw-reel__stage" data-story={story.id} key={`stage-${story.id}`}>
          {story.id === "analysis" ? <AnalysisStory /> : null}
          {story.id === "spill" ? <SpillStory /> : null}
          {story.id === "offline" ? <OfflineStory /> : null}
          {story.id === "undo" ? <UndoStory /> : null}
        </div>
      </div>
    </div>
  );
}
