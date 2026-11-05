import type { CSSProperties } from "react";

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

export function UndoStory() {
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
