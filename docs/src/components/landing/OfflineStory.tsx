import { For, Index, type JSX } from "solid-js";

import { Packet, px, secs, VersionRoll } from "./storyParts.js";

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
const MINI_CELL_INDEXES = Array.from({ length: MINI_CELLS }, (_, index) => index);

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

function MiniGrid(props: Readonly<{ x: number; marked: ReadonlyMap<number, JSX.CSSProperties> }>) {
  return (
    <For each={MINI_CELL_INDEXES}>
      {(index) => {
        const cell = miniCell(props.x, index);
        return (
          <rect
            class="sr-mini"
            data-flash={props.marked.has(index) ? "true" : undefined}
            height={MINI_HEIGHT}
            rx={2}
            style={props.marked.get(index)}
            width={MINI_WIDTH}
            x={cell.x}
            y={cell.y}
          />
        );
      }}
    </For>
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

/** A queued chip's style: one shift time per chip ahead of it, as React leaves unset ones out. */
function queueStyle(shifts: readonly string[]): JSX.CSSProperties {
  const style: JSX.CSSProperties = { "--pitch": px(OUTBOX_PITCH) };
  shifts.forEach((shift, ahead) => {
    style[`--shift-${ahead + 1}`] = shift;
  });
  return style;
}

export function OfflineStory() {
  const bramCells = new Map<number, JSX.CSSProperties>(
    OFFLINE_EDITS.map((edit) => [
      edit.cell,
      { "--edit": secs(edit.edit), "--ack": secs(edit.commit) },
    ]),
  );
  const anaCells = new Map<number, JSX.CSSProperties>(
    OFFLINE_EDITS.map((edit) => [edit.cell, { "--apply": secs(edit.apply) }]),
  );
  // Every chip drains from the head of the queue (slot 0), after the chips ahead of it left.
  const head = { x: OUTBOX_X + OUTBOX_CHIP_WIDTH / 2, y: OUTBOX_Y + OUTBOX_CHIP_HEIGHT / 2 };

  return (
    <svg aria-hidden="true" class="sr sr-offline" viewBox="0 0 640 330">
      <g class="sr-device" data-device="ana">
        <rect class="sr-panel" height={250} rx={12} width={196} x={20} y={40} />
        <text class="sr-name" x={36} y={70}>
          Ana
        </text>
        <circle class="sr-dot" cx={196} cy={65} r={6} />
        <text class="sr-sub" x={36} y={94}>
          version
        </text>
        <VersionRoll
          changes={OFFLINE_EDITS.map((edit) => edit.apply)}
          class="sr-ver"
          clip={{ x: 140, y: 80, width: 60, height: 19 }}
          clipId="sr-clip-ana"
          values={OFFLINE_VERSIONS}
          x={196}
          y={94}
        />
        <MiniGrid marked={anaCells} x={ANA_GRID_X} />
      </g>

      <g class="sr-server">
        <rect class="sr-panel" height={110} rx={12} width={132} x={254} y={110} />
        <For each={OFFLINE_EDITS}>
          {(edit) => (
            <rect
              class="sr-pulse"
              height={110}
              rx={12}
              style={{ "--at": secs(edit.commit) }}
              width={132}
              x={254}
              y={110}
            />
          )}
        </For>
        <text class="sr-name" x={320} y={142} data-center="">
          Your server
        </text>
        <VersionRoll
          center
          changes={OFFLINE_EDITS.map((edit) => edit.commit)}
          class="sr-big"
          clip={{ x: 262, y: 160, width: 116, height: 34 }}
          clipId="sr-clip-server"
          values={OFFLINE_VERSIONS}
          x={320}
          y={186}
        />
      </g>

      <line class="sr-wire" data-side="ana" x1={216} x2={254} y1={165} y2={165} />
      <line class="sr-wire" data-side="bram" x1={386} x2={424} y1={165} y2={165} />

      <g class="sr-device" data-device="bram">
        <rect class="sr-panel" height={250} rx={12} width={196} x={424} y={40} />
        <text class="sr-name" x={440} y={70}>
          Bram
        </text>
        <circle class="sr-dot sr-dot-bram" cx={600} cy={65} r={6} />
        <text class="sr-sub sr-state-online" x={440} y={94}>
          online
        </text>
        <text class="sr-sub sr-state-offline" x={440} y={94}>
          offline
        </text>
        <MiniGrid marked={bramCells} x={BRAM_GRID_X} />
        <text class="sr-sub" x={440} y={248}>
          Outbox
        </text>
      </g>

      <Index each={OFFLINE_EDITS}>
        {(edit, index) => {
          const slotX = OUTBOX_X + index * OUTBOX_PITCH;
          const slot = { x: slotX + OUTBOX_CHIP_WIDTH / 2, y: head.y };
          const cell = miniCentre(BRAM_GRID_X, edit().cell);
          // The queue moves up one slot each time a chip ahead of this one leaves.
          const shifts = OFFLINE_EDITS.slice(0, index).map((ahead) =>
            secs(ahead.drain + QUEUE_SHIFT_DELAY),
          );
          return (
            <g class="sr-queue" data-shifts={shifts.length} style={queueStyle(shifts)}>
              <g
                class="sr-outbox"
                style={{
                  "--edit": secs(edit().edit),
                  "--drain": secs(edit().drain),
                  "--from-x": px(cell.x - slot.x),
                  "--from-y": px(cell.y - slot.y),
                  "--exit-x": px(BRAM_EXIT.x - head.x),
                  "--exit-y": px(BRAM_EXIT.y - head.y),
                  "--to-x": px(SERVER_CENTER.x - head.x),
                  "--to-y": px(SERVER_CENTER.y - head.y),
                }}
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
        }}
      </Index>

      <Index each={OFFLINE_EDITS}>
        {(edit, index) => {
          const cell = miniCentre(ANA_GRID_X, edit().cell);
          return (
            <Packet
              label={`v${FIRST_VERSION + index + 1}`}
              style={{
                "--send": secs(edit().send),
                "--wire-x": px(ANA_ENTRY.x - SERVER_CENTER.x),
                "--to-x": px(cell.x - SERVER_CENTER.x),
                "--to-y": px(cell.y - SERVER_CENTER.y),
              }}
              tone="committed"
              x={SERVER_CENTER.x}
              y={SERVER_CENTER.y}
            />
          );
        }}
      </Index>
    </svg>
  );
}
