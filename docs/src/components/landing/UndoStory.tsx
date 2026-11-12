import { For, Index } from "solid-js";

import { delay, Packet, px, secs, VersionRoll } from "./storyParts.js";

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

const GRID_ROWS = 8;
const GRID_COLUMNS = 14;
/** The data grid's cells, row by row, with the shade each one is drawn in. */
const GRID_CELLS = Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) => {
  const row = Math.floor(index / GRID_COLUMNS);
  const column = index % GRID_COLUMNS;
  return {
    row,
    column,
    shade: ((row * 7 + column * 3) % 5) / 10 + 0.18,
    x: 24 + column * 26,
    y: 50 + row * 26,
  };
});
const PEER_CELL_INDEXES = [0, 1, 2, 3, 4, 5] as const;

/** The peer's 3 × 2 cell block, centred in its card. */
function PeerCells(props: Readonly<{ class: string }>) {
  return (
    <g class={props.class}>
      <For each={PEER_CELL_INDEXES}>
        {(index) => (
          <rect
            height={14}
            rx={2}
            width={18}
            x={537 + (index % 3) * 22}
            y={248 + Math.floor(index / 3) * 18}
          />
        )}
      </For>
    </g>
  );
}

export function UndoStory() {
  const peerDrop = UNDO_PEER.y - UNDO_SERVER.y;

  return (
    <svg
      aria-hidden="true"
      class="sr sr-undo"
      style={{
        "--local-restore": secs(UNDO.localRestore),
        "--restore-send": secs(UNDO.restoreSend),
        "--batch-send": secs(UNDO.batchSend),
        "--batch-applied": secs(UNDO.batchApplied),
        "--clear-applied": secs(UNDO.clearApplied),
        "--peer-drop": px(peerDrop),
      }}
      viewBox="0 0 640 330"
    >
      <rect class="sr-panel" height={260} rx={12} width={388} x={12} y={34} />
      <g class="sr-cells">
        <For each={GRID_CELLS}>
          {(cell) => (
            <rect
              class="sr-data"
              height={20}
              rx={2}
              // The clear sweeps left to right from 1 s into the story.
              style={{
                ...delay(1 + cell.column * 0.09 + cell.row * 0.03),
                "--shade": cell.shade,
              }}
              width={22}
              x={cell.x}
              y={cell.y}
            />
          )}
        </For>
      </g>
      <g class="sr-restored">
        <For each={GRID_CELLS}>
          {(cell) => (
            <rect
              height={20}
              rx={2}
              style={{ "--shade": cell.shade }}
              width={22}
              x={cell.x}
              y={cell.y}
            />
          )}
        </For>
      </g>
      {/* Inside the grid card, in the band under the last row (rows end at y 252). */}
      <g class="sr-cleared">
        <rect height={24} rx={12} width={196} x={108} y={262} />
        <text x={206} y={278} data-center="">
          100,000 cells cleared
        </text>
      </g>
      <g class="sr-key">
        <rect height={40} rx={8} width={64} x={174} y={146} />
        <text x={206} y={172} data-center="">
          Undo
        </text>
      </g>

      {/* Grid → server → peer. Every change travels these two wires. */}
      <line class="sr-wire" x1={400} x2={UNDO_SERVER.x} y1={UNDO_WIRE_Y} y2={UNDO_WIRE_Y} />
      <line
        class="sr-wire"
        x1={UNDO_CENTER_X}
        x2={UNDO_CENTER_X}
        y1={UNDO_SERVER.y + UNDO_SERVER.height}
        y2={UNDO_PEER.y}
      />

      <g class="sr-server">
        <rect
          class="sr-panel"
          rx={10}
          x={UNDO_SERVER.x}
          y={UNDO_SERVER.y}
          width={UNDO_SERVER.width}
          height={UNDO_SERVER.height}
        />
        <For each={[UNDO.clearCommit, UNDO.batchCommit]}>
          {(at) => (
            <rect
              class="sr-pulse"
              rx={10}
              style={{ "--at": secs(at) }}
              x={UNDO_SERVER.x}
              y={UNDO_SERVER.y}
              width={UNDO_SERVER.width}
              height={UNDO_SERVER.height}
            />
          )}
        </For>
        <text class="sr-name" x={UNDO_CENTER_X} y={60} data-center="">
          Server
        </text>
        <VersionRoll
          center
          changes={[UNDO.clearCommit, UNDO.batchCommit]}
          class="sr-ver"
          clip={{ x: UNDO_SERVER.x + 8, y: 71, width: UNDO_SERVER.width - 16, height: 19 }}
          clipId="sr-clip-undo-server"
          values={UNDO_VERSIONS}
          x={UNDO_CENTER_X}
          y={85}
        />
      </g>

      <g class="sr-peer">
        <rect
          class="sr-panel"
          rx={10}
          x={UNDO_PEER.x}
          y={UNDO_PEER.y}
          width={UNDO_PEER.width}
          height={UNDO_PEER.height}
        />
        <For each={[UNDO.clearApplied, UNDO.batchApplied]}>
          {(at) => (
            <rect
              class="sr-pulse"
              rx={10}
              style={{ "--at": secs(at) }}
              x={UNDO_PEER.x}
              y={UNDO_PEER.y}
              width={UNDO_PEER.width}
              height={UNDO_PEER.height}
            />
          )}
        </For>
        <text class="sr-name" x={UNDO_CENTER_X} y={218} data-center="">
          Peer
        </text>
        <VersionRoll
          center
          changes={[UNDO.clearApplied, UNDO.batchApplied]}
          class="sr-ver"
          clip={{ x: UNDO_PEER.x + 8, y: 225, width: UNDO_PEER.width - 16, height: 19 }}
          clipId="sr-clip-undo-peer"
          values={UNDO_VERSIONS}
          x={UNDO_CENTER_X}
          y={239}
        />
        <PeerCells class="sr-peer-empty" />
        <PeerCells class="sr-peer-cells" />
      </g>

      {/* The clear syncs as one ordinary version: it reaches the server as a
          pending change, and the peer receives it as v50. */}
      <Packet
        label="clear"
        style={{
          "--at": secs(UNDO.clearToServer),
          "--dx": px(UNDO_CENTER_X - CLEAR_PACKET_X),
          "--dy": "0px",
        }}
        tone="pending"
        x={CLEAR_PACKET_X}
        y={UNDO_WIRE_Y}
      />
      <Packet
        label="v50"
        style={{
          "--at": secs(UNDO.clearToPeer),
          "--dx": "0px",
          "--dy": px(PEER_CELLS_CENTER_Y - (UNDO_SERVER.y + UNDO_SERVER.height)),
        }}
        tone="committed"
        x={UNDO_CENTER_X}
        y={UNDO_SERVER.y + UNDO_SERVER.height}
      />

      {/* One compressed restore leaves the grid on the wire and merges into the server. */}
      <g class="sr-block" style={{ "--dx": px(UNDO_CENTER_X - BLOCK_CENTER_X) }}>
        <rect height={46} rx={8} width={BLOCK_WIDTH} x={BLOCK_X} y={UNDO_WIRE_Y - 23} />
        <text x={BLOCK_CENTER_X} y={UNDO_WIRE_Y - 3} data-center="">
          1 restore
        </text>
        <text class="sr-block-sub" x={BLOCK_CENTER_X} y={UNDO_WIRE_Y + 13} data-center="">
          compressed
        </text>
      </g>

      {/* The server splits it into five versions, held together as one batch,
          then sends the batch to the peer as a unit. */}
      <g class="sr-batch-group">
        <rect
          class="sr-batch-outline"
          style={{ "--at": secs(UNDO.batchChips + 0.5) }}
          height={22}
          rx={6}
          width={UNDO_SERVER.width - 8}
          x={UNDO_SERVER.x + 4}
          y={BATCH_Y - 3}
        />
        <Index each={BATCH_VERSIONS}>
          {(version, index) => {
            const x = BATCH_X + index * (BATCH_CHIP_WIDTH + BATCH_CHIP_GAP);
            return (
              <g class="sr-batch-chip" style={{ "--at": secs(UNDO.batchChips + index * 0.1) }}>
                <rect height={16} rx={3} width={BATCH_CHIP_WIDTH} x={x} y={BATCH_Y} />
                <text x={x + BATCH_CHIP_WIDTH / 2} y={BATCH_Y + 12} data-center="">
                  {version()}
                </text>
              </g>
            );
          }}
        </Index>
      </g>

      <text class="sr-batch" x={UNDO_CENTER_X} y={316} data-center="">
        one atomic batch
      </text>
    </svg>
  );
}
