// Small sequence pictures for the showcases' "What the scenario proves" cards
// and the library/host boundary. Each proof picture is decorative: its card's
// title and text state the same facts.
import { For, type JSX } from "solid-js";

import { CardArt, head, Sheet } from "./Art.js";

/** Proof pictures share the 2:1 framework-card canvas. */
const PROOF_HEIGHT = 160;

/** Lane headers and dashed lifelines at the given x positions. */
function Lanes(props: Readonly<{ lanes: readonly (readonly [x: number, name: string])[] }>) {
  return (
    <For each={props.lanes}>
      {([x, name]) => (
        <>
          <path class="rule dash" d={`M${x} 30V154`} />
          <rect
            class="panel"
            height={20}
            rx={10}
            width={name.length * 6.6 + 18}
            x={x - (name.length * 6.6 + 18) / 2}
            y={8}
          />
          <text class="strong small" text-anchor="middle" x={x} y={22}>
            {name}
          </text>
        </>
      )}
    </For>
  );
}

/** A horizontal message between two lanes, with a label above it. */
function Message(
  props: Readonly<{ from: number; to: number; y: number; label?: string; class?: string }>,
) {
  const end = () => props.to + (props.to > props.from ? -4 : 4);
  return (
    <>
      <path
        class={props.class ?? "ink-line"}
        d={`M${props.from} ${props.y}H${end()}${head(end(), props.y, props.to > props.from ? 0 : 180)}`}
      />
      {props.label && (
        <text class="small" text-anchor="middle" x={(props.from + props.to) / 2} y={props.y - 5}>
          {props.label}
        </text>
      )}
    </>
  );
}

/** A small note pill beside a lane. */
function Note(props: Readonly<{ x: number; y: number; text: string; class?: string }>) {
  return (
    <>
      <rect
        class={props.class ?? "alt-soft"}
        height={18}
        rx={9}
        width={props.text.length * 6 + 16}
        x={props.x}
        y={props.y}
      />
      <text
        class={props.class === "hue" ? "small on-hue" : "small strong"}
        x={props.x + 8}
        y={props.y + 13}
      >
        {props.text}
      </text>
    </>
  );
}

/** Both clients' edits are sequenced once and fanned out; both end identical. */
function ConvergenceArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="red">
      <Lanes
        lanes={[
          [40, "A"],
          [160, "Server"],
          [280, "B"],
        ]}
      />
      <Message class="hue-line" from={40} label="edit" to={160} y={48} />
      <Message class="alt-line" from={280} label="edit" to={160} y={48} />
      <Note class="hue-soft" text="v7 · v8" x={133} y={60} />
      <Message from={160} label="v7, v8" to={40} y={98} />
      <Message from={160} label="v7, v8" to={280} y={98} />
      <rect class="hue-tint" height={26} rx={4} width={44} x={18} y={116} />
      <rect class="hue-tint" height={26} rx={4} width={44} x={258} y={116} />
      <path class="hue-line" d="M30 129l6 6l12-12M270 129l6 6l12-12" />
      <text class="glyph strong" text-anchor="middle" x={160} y={140}>
        =
      </text>
    </CardArt>
  );
}

/** A lost acknowledgement, a retry with the same id, and a duplicate answer: applied once. */
function ExactlyOnceArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="red">
      <Lanes
        lanes={[
          [56, "A"],
          [240, "Server"],
        ]}
      />
      <Message class="hue-line" from={56} label="commit m1" to={240} y={46} />
      <path class="error-line dash" d="M240 72H150" />
      <path class="error-line" d="M140 66l10 10M150 66l-10 10" />
      <text class="small" text-anchor="middle" x={196} y={67}>
        ack lost
      </text>
      <Message class="hue-line" from={56} label="retry m1" to={240} y={100} />
      <Message from={240} label="duplicate · v7" to={56} y={126} />
      <Note class="hue-soft" text="applied once" x={196} y={136} />
    </CardArt>
  );
}

/** Commits queue durably while offline, then drain in order on reconnect. */
function OfflineQueueArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="red">
      <Lanes
        lanes={[
          [56, "A"],
          [264, "Server"],
        ]}
      />
      <rect class="hue-tint" height={58} rx={6} width={112} x={20} y={36} />
      <text class="small hue-text" x={28} y={50}>
        offline
      </text>
      <For each={[0, 1, 2]}>
        {(index) => (
          <>
            <rect class="hue-soft" height={14} rx={7} width={28} x={92} y={40 + index * 17} />
            <text class="small strong" text-anchor="middle" x={106} y={51 + index * 17}>
              {index + 1}
            </text>
          </>
        )}
      </For>
      <Note class="hue" text="" x={42} y={102} />
      <text class="small" x={70} y={115}>
        reconnect
      </text>
      <path class="on-hue-line" d="M53 106v4h6l-4 6" stroke-width={1.5} />
      <Message class="hue-line" from={56} label="1, 2, 3 in order" to={264} y={138} />
    </CardArt>
  );
}

/** A late version is buffered until the gap closes; a stale base comes back as a conflict. */
function GapsAndConflictsArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="red">
      <Lanes
        lanes={[
          [40, "Server"],
          [196, "B"],
        ]}
      />
      <Message class="alt-line" from={40} label="v9" to={196} y={46} />
      <Note text="v9 held" x={206} y={36} />
      <Message class="alt-line" from={40} label="v8" to={196} y={74} />
      <Note text="v8, v9 applied" x={206} y={64} />
      <Message class="hue-line" from={196} label="edit on v6" to={40} y={108} />
      <Message class="error-line" from={40} label="conflict" to={196} y={136} />
      <Note class="error-soft" text="rebase, resend" x={206} y={126} />
    </CardArt>
  );
}

/** A restore spanning four versions travels, is stored and is applied as one batch. */
function AtomicBatchArt() {
  const versions = ["v10", "v11", "v12", "v13"] as const;
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="red">
      <Lanes
        lanes={[
          [40, "A"],
          [160, "Server"],
          [280, "B"],
        ]}
      />
      <Message class="hue-line" from={40} to={140} y={50} />
      <rect class="hue-soft" height={16} rx={8} width={52} x={62} y={34} />
      <text class="small strong" text-anchor="middle" x={88} y={46}>
        restore
      </text>
      <For each={versions}>
        {(version, index) => (
          <>
            <rect class="hue-soft" height={16} rx={3} width={40} x={140} y={42 + index() * 20} />
            <text class="small strong" text-anchor="middle" x={160} y={54 + index() * 20}>
              {version}
            </text>
          </>
        )}
      </For>
      <path class="hue-line" d="M134 42h-4v76h4M186 42h4v76h-4" />
      <text class="small hue-text" text-anchor="middle" x={160} y={136}>
        all or none
      </text>
      <Message class="alt-line" from={194} to={280} y={80} />
      <rect class="alt-soft" height={36} rx={6} width={56} x={252} y={96} />
      <text class="small strong" text-anchor="middle" x={280} y={111}>
        v10–v13
      </text>
      <text class="small" text-anchor="middle" x={280} y={125}>
        one step
      </text>
    </CardArt>
  );
}

/** Proof pictures by proof title, for the collaboration showcase's proof cards. */
export const COLLABORATION_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  "Convergence under ordering": ConvergenceArt,
  "Loss without double-apply": ExactlyOnceArt,
  "Offline is a first-class state": OfflineQueueArt,
  "Gaps and conflicts stay explicit": GapsAndConflictsArt,
  "Atomic multi-version batches": AtomicBatchArt,
};

/** Two grid generations: destroy() leaves nothing behind, createGrid() starts the next. */
function LifecycleArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="amber">
      <rect class="hue-soft" height={64} rx={6} width={92} x={16} y={24} />
      <text class="small hue-text" x={24} y={40}>
        generation 1
      </text>
      <Sheet ch={10} cols={3} cw={24} rows={3} x={26} y={48} />
      <path class="ink-line" d={`M112 56h50${head(162, 56, 0)}`} />
      <text class="small" text-anchor="middle" x={137} y={48}>
        destroy()
      </text>
      <rect class="rule dash" fill="none" height={64} rx={6} width={54} x={168} y={24} />
      <text class="small" text-anchor="middle" x={195} y={60}>
        empty
      </text>
      <path class="ink-line" d={`M222 56h14${head(236, 56, 0)}`} />
      <rect class="hue-soft" height={64} rx={6} width={72} x={240} y={24} />
      <text class="small hue-text" x={246} y={40}>
        gen 2
      </text>
      <Sheet ch={10} cols={2} cw={24} rows={3} x={252} y={48} />
      <text class="small" x={16} y={118}>
        no listeners, chrome or canvas
      </text>
      <text class="small" x={16} y={134}>
        survive teardown
      </text>
    </CardArt>
  );
}

/** Construction options rebuild the grid; a live option flips the running one. */
function ConstructionArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="amber">
      <For each={["renderer", "datasource"] as const}>
        {(option, index) => (
          <>
            <rect class="hue-soft" height={20} rx={10} width={92} x={16} y={26 + index() * 28} />
            <text class="small strong" x={28} y={40 + index() * 28}>
              {option}
            </text>
          </>
        )}
      </For>
      <path class="hue-line" d={`M112 50h52${head(164, 50, 0)}`} />
      <text class="small hue-text" text-anchor="middle" x={138} y={42}>
        rebuild
      </text>
      <Sheet ch={14} cols={3} cw={40} head={10} rows={5} x={176} y={20} />
      <rect class="panel" height={20} rx={10} width={92} x={16} y={112} />
      <circle class="alt" cx={98} cy={122} r={7} />
      <text class="small strong" x={28} y={126}>
        read-only
      </text>
      <path class="alt-line" d={`M112 122c30 0 44-10 60-22${head(172, 100, -40)}`} />
      <text class="small alt-text" x={120} y={140}>
        flips live
      </text>
    </CardArt>
  );
}

/** Pages come from the host's source, with its latency and abort path. */
function HostPagingArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="amber">
      <path class="panel" d="M20 40v72a32 9 0 0 0 64 0V40" />
      <ellipse class="hue-soft" cx={52} cy={40} rx={32} ry={9} />
      <text class="small" text-anchor="middle" x={52} y={136}>
        your source
      </text>
      <For each={[0, 1, 2]}>
        {(index) => (
          <rect
            class="hue"
            height={12}
            rx={6}
            width={18}
            x={110 + index * 26}
            y={60}
            opacity={1 - index * 0.25}
          />
        )}
      </For>
      <path class="hue-line dash" d={`M88 66h108${head(196, 66, 0)}`} />
      <circle class="ink-line" cx={142} cy={100} r={10} />
      <path class="ink-line" d="M142 100v-6M142 100l4 3" />
      <text class="small" x={158} y={104}>
        latency
      </text>
      <path class="error-line" d="M120 122l8 8M128 122l-8 8" />
      <text class="small" x={136} y={130}>
        abort
      </text>
      <Sheet ch={14} cols={2} cw={46} head={10} rows={6} x={204} y={20} />
    </CardArt>
  );
}

/** A worker that fails to start reports renderer-fallback; painting continues on the main thread. */
function WorkerFallbackArt() {
  return (
    <CardArt alt="blue" height={PROOF_HEIGHT} hue="amber">
      <rect class="rule dash" fill="none" height={56} rx={6} width={88} x={16} y={24} />
      <text class="small" text-anchor="middle" x={60} y={44}>
        worker
      </text>
      <path class="error-line" d="M52 54l16 16M68 54l-16 16" />
      <path class="ink-line" d={`M108 52h28${head(136, 52, 0)}`} />
      <rect class="alt-soft" height={22} rx={11} width={140} x={140} y={41} />
      <text class="small strong" x={152} y={56}>
        renderer-fallback
      </text>
      <rect class="hue-soft" height={56} rx={6} width={88} x={16} y={92} />
      <text class="small hue-text" text-anchor="middle" x={60} y={112}>
        main thread
      </text>
      <path class="hue-line" d="M48 126l8 8l16-16" />
      <text class="small" x={120} y={110}>
        requested: worker
      </text>
      <text class="small" x={120} y={128}>
        active: main thread
      </text>
    </CardArt>
  );
}

/** Proof pictures by proof title, for the vanilla workbench's "What this example demonstrates". */
export const VANILLA_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  "Explicit lifecycle": LifecycleArt,
  "Construction-bound truth": ConstructionArt,
  "Host-owned paging": HostPagingArt,
  "Honest Worker fallback": WorkerFallbackArt,
};

/** A small database cylinder whose top-left is (x, y). */
function Cylinder(props: Readonly<{ x: number; y: number; w: number; h: number }>) {
  const rx = () => props.w / 2;
  return (
    <>
      <path
        class="panel"
        d={`M${props.x} ${props.y + 8}v${props.h - 16}a${rx()} 8 0 0 0 ${props.w} 0V${props.y + 8}`}
      />
      <ellipse class="hue-soft" cx={props.x + rx()} cy={props.y + 8} rx={rx()} ry={8} />
    </>
  );
}

/** Two writers on the same base: one serialized queue accepts the first, the stale one gets a conflict. */
function AtomicSequencingArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="teal">
      <Note class="hue-soft" text="A · base v5" x={12} y={30} />
      <Note class="alt-soft" text="B · base v5" x={12} y={92} />
      <path
        class="ink-line"
        d={`M104 40c20 0 24 26 40 30${head(144, 70, 15)}M104 102c20 0 24-20 40-24${head(144, 78, -15)}`}
      />
      <rect class="panel" height={52} rx={8} width={74} x={148} y={48} />
      <text class="small strong" text-anchor="middle" x={185} y={66}>
        one queue
      </text>
      <For each={[0, 1, 2]}>
        {(index) => (
          <rect class="hue-tint" height={12} rx={3} width={16} x={160 + index * 18} y={76} />
        )}
      </For>
      <Message class="hue-line" from={222} to={246} y={60} />
      <Note class="hue" text="v6" x={250} y={51} />
      <Message class="error-line" from={222} to={246} y={92} />
      <Note class="error-soft" text="conflict" x={250} y={83} />
      <text class="small" x={12} y={146}>
        stale writers recover; nothing is lost
      </text>
    </CardArt>
  );
}

/** A retry with the same mutation id gets the original version back; one record is stored. */
function IdempotentRetryArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="teal">
      <Lanes
        lanes={[
          [48, "Client"],
          [196, "Adapter"],
        ]}
      />
      <Message class="hue-line" from={48} label="commit m7" to={196} y={48} />
      <path class="error-line dash" d="M196 72H110" />
      <path class="error-line" d="M100 66l10 10M110 66l-10 10" />
      <Message class="hue-line" from={48} label="retry m7" to={196} y={100} />
      <Message from={196} label="duplicate · v6" to={48} y={128} />
      <Cylinder h={68} w={60} x={250} y={44} />
      <rect class="hue" height={12} rx={3} width={40} x={260} y={74} />
      <text class="small" text-anchor="middle" x={280} y={128}>
        m7 × 1
      </text>
    </CardArt>
  );
}

/** The operation tail grows to a bound, then folds into one compacted snapshot record. */
function BoundedStorageArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="teal">
      <rect class="hue-soft" height={46} rx={6} width={78} x={14} y={22} />
      <text class="small strong" x={24} y={42}>
        snapshot
      </text>
      <text class="small" x={24} y={58}>
        compacted
      </text>
      <For each={[0, 1, 2, 3, 4, 5]}>
        {(index) => (
          <rect class="alt-soft" height={30} rx={4} width={18} x={110 + index * 24} y={30} />
        )}
      </For>
      <path class="hue-line" d={`M190 66c0 24-70 24-104 8${head(88, 72, -160)}`} />
      <text class="small" x={14} y={112}>
        records
      </text>
      <rect class="soft" height={8} rx={4} width={200} x={74} y={104} />
      <rect class="hue" height={8} rx={4} width={176} x={74} y={104} />
      <path class="error-line" d="M250 98v20" />
      <text class="small" x={14} y={138}>
        bytes
      </text>
      <rect class="soft" height={8} rx={4} width={200} x={74} y={130} />
      <rect class="hue" height={8} rx={4} width={110} x={74} y={130} />
      <path class="error-line" d="M250 124v20" />
    </CardArt>
  );
}

/** A reload brings committed state and the durable pending queue back from IndexedDB, once. */
function ReloadRecoveryArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="teal">
      <Cylinder h={84} w={70} x={16} y={34} />
      <text class="small" text-anchor="middle" x={51} y={142}>
        IndexedDB
      </text>
      <path class="hue-line" d={`M96 76h56${head(152, 76, 0)}`} />
      <path class="hue-line" d="M120 58a12 12 0 1 1 -2 -10" />
      <path class="hue-line" d={head(116, 48, -60)} />
      <rect class="panel" height={96} rx={8} width={140} x={160} y={28} />
      <rect class="soft" height={14} rx={6} width={138.5} x={160.75} y={28.75} />
      <rect class="hue-soft" height={22} rx={5} width={116} x={172} y={50} />
      <text class="small strong" x={180} y={65}>
        committed state
      </text>
      <rect class="alt-soft" height={22} rx={5} width={116} x={172} y={80} />
      <text class="small strong" x={180} y={95}>
        pending queue
      </text>
      <Note class="hue" text="exactly once" x={182} y={130} />
    </CardArt>
  );
}

/** Clearing 100,000 cells and undoing once: one compressed restoreBlock commit, one version. */
function LargeUndoArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="teal">
      <Sheet ch={12} cols={4} cw={18} rows={6} x={14} y={24} />
      <text class="small" x={14} y={118}>
        100,000 cells
      </text>
      <path class="hue-line" d={`M96 60h28${head(124, 60, 0)}`} />
      <text class="small hue-text" text-anchor="middle" x={110} y={50}>
        undo
      </text>
      <rect class="hue-soft" height={40} rx={8} width={104} x={130} y={40} />
      <text class="small strong" x={140} y={58}>
        restoreBlock
      </text>
      <text class="small" x={140} y={72}>
        one commit
      </text>
      <text class="small" x={248} y={42}>
        bytes
      </text>
      <rect class="alt" height={10} rx={3} width={58} x={248} y={50} />
      <rect class="hue" height={10} rx={3} width={14} x={248} y={66} />
      <Note class="panel" text="1 step · 1 version" x={130} y={98} />
    </CardArt>
  );
}

/** An undo over the transaction limit is rejected and dropped; older history stays undoable. */
function OversizedUndoArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="teal">
      <text class="small" x={14} y={24}>
        history
      </text>
      <rect class="error-soft" height={20} rx={4} width={96} x={14} y={32} />
      <path class="error-line" d="M20 42h84" />
      <For each={[0, 1, 2]}>
        {(index) => (
          <rect class="hue-soft" height={20} rx={4} width={96} x={14} y={58 + index * 24} />
        )}
      </For>
      <text class="small" x={14} y={146}>
        older steps stay
      </text>
      <rect class="soft" height={10} rx={5} width={150} x={140} y={40} />
      <rect class="error-soft" height={10} rx={5} width={150} x={140} y={40} />
      <path class="ink-line" d="M200 32v26" />
      <text class="small" x={204} y={70}>
        limit 128 bytes
      </text>
      <rect class="alt-soft" height={42} rx={8} width={160} x={136} y={86} />
      <text class="small strong" x={146} y={104}>
        mutation-rejected
      </text>
      <text class="small" x={146} y={119}>
        resource-limit issue
      </text>
    </CardArt>
  );
}

/** Proof pictures by proof title, for the database showcase. */
export const DATABASE_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  "Atomic sequencing": AtomicSequencingArt,
  "Idempotent retries": IdempotentRetryArt,
  "Bounded storage": BoundedStorageArt,
  "Reload recovery": ReloadRecoveryArt,
  "Large undo": LargeUndoArt,
  "Oversized undo": OversizedUndoArt,
};
