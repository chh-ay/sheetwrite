/**
 * One edit through the collaboration protocol: optimistic local commit, server
 * sequencing, acknowledgement, fan-out to a peer, and the conflict path. The
 * labels name the real API so the diagram doubles as an index into the guide.
 */

const LANES = [
  { x: 120, title: "Client A", detail: "Grid + SyncCoordinator" },
  { x: 380, title: "Your server", detail: "PersistenceAdapter endpoint" },
  { x: 640, title: "Client B", detail: "SyncCoordinator.subscribe" },
] as const;

type Lane = 0 | 1 | 2;

interface Message {
  readonly from: Lane;
  readonly to: Lane;
  readonly y: number;
  readonly label: string;
  readonly kind?: "conflict";
}

interface Note {
  readonly lane: Lane;
  readonly y: number;
  readonly lines: readonly string[];
  readonly kind?: "conflict";
}

const MESSAGES: readonly Message[] = [
  { from: 0, to: 1, y: 170, label: "commit(baseVersion 41, clientMutationId, ops)" },
  { from: 1, to: 0, y: 290, label: "applied · version 42" },
  { from: 1, to: 2, y: 336, label: "VersionedOperation 42" },
  { from: 1, to: 0, y: 474, label: "conflict · operationsSinceBase", kind: "conflict" },
];

const NOTES: readonly Note[] = [
  { lane: 0, y: 86, lines: ["Edit renders at once", "and waits in the queue"] },
  { lane: 1, y: 194, lines: ["Duplicate? Base version?", "Authorize, append v42"] },
  { lane: 0, y: 308, lines: ["acknowledged:", "remove from the queue"] },
  { lane: 2, y: 354, lines: ["applyRemoteOperations", "at serverVersion + 1"] },
  {
    lane: 0,
    y: 494,
    lines: ["sync.recoverConflict()", "then sync.flush()"],
    kind: "conflict",
  },
];

const NOTE_WIDTH = 196;
const LINE_HEIGHT = 17;

function Arrow({ from, to, y, label, kind }: Message) {
  const start = LANES[from].x;
  const end = LANES[to].x;
  const direction = Math.sign(end - start);
  const tip = end - direction * 6;
  return (
    <g className="sw-collab-flow__message" data-kind={kind}>
      <line x1={start} x2={tip} y1={y} y2={y} />
      <path d={`M${tip} ${y - 5} L${end} ${y} L${tip} ${y + 5} Z`} />
      <text textAnchor="middle" x={(start + end) / 2} y={y - 9}>
        {label}
      </text>
    </g>
  );
}

function NoteBox({ lane, y, lines, kind }: Note) {
  const height = lines.length * LINE_HEIGHT + 14;
  const x = LANES[lane].x - NOTE_WIDTH / 2;
  return (
    <g className="sw-collab-flow__note" data-kind={kind}>
      <rect height={height} rx={8} width={NOTE_WIDTH} x={x} y={y} />
      {lines.map((line, index) => (
        <text key={line} textAnchor="middle" x={LANES[lane].x} y={y + 21 + index * LINE_HEIGHT}>
          {line}
        </text>
      ))}
    </g>
  );
}

export default function CollaborationFlow() {
  return (
    <figure
      aria-label="One edit through the collaboration protocol"
      className="sw-collab-flow"
      role="region"
    >
      <div className="sw-collab-flow__frame">
        <svg aria-labelledby="sw-collab-flow-title" role="img" viewBox="0 0 760 560">
          <title id="sw-collab-flow-title">
            Client A commits an edit, the server appends version 42 and acknowledges it, Client B
            applies version 42; on a version conflict Client A recovers and resends.
          </title>
          {LANES.map((lane) => (
            <g className="sw-collab-flow__lane" key={lane.title}>
              <rect height={52} rx={10} width={210} x={lane.x - 105} y={16} />
              <text className="sw-collab-flow__lane-title" textAnchor="middle" x={lane.x} y={38}>
                {lane.title}
              </text>
              <text className="sw-collab-flow__lane-detail" textAnchor="middle" x={lane.x} y={56}>
                {lane.detail}
              </text>
              <line x1={lane.x} x2={lane.x} y1={68} y2={548} />
            </g>
          ))}
          {/* The conflict path is an alternative, so it sits in its own frame. */}
          <g className="sw-collab-flow__alt">
            <rect height={126} rx={10} width={724} x={18} y={420} />
            <text x={30} y={440}>
              If baseVersion is behind the server
            </text>
          </g>
          {NOTES.map((note) => (
            <NoteBox key={note.lines[0]} {...note} />
          ))}
          {MESSAGES.map((message) => (
            <Arrow key={message.label} {...message} />
          ))}
        </svg>
      </div>
      <figcaption>
        Local edits render at once. The server orders every commit, acknowledges it by mutation ID,
        and sends the new version to the other clients.
      </figcaption>
    </figure>
  );
}
