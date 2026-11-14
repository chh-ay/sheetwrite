// Small sequence pictures for the showcases' "What the scenario proves" cards
// and the library/host boundary. Each proof picture is decorative: its card's
// title and text state the same facts.
import { For, type JSX } from "solid-js";

import { Bar, CardArt, docPath, foldPath, head, Sheet } from "./Art.js";

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
  // The arrowhead's tip touches the receiving lane's lifeline.
  return (
    <>
      <path
        class={props.class ?? "ink-line"}
        d={`M${props.from} ${props.y}H${props.to}${head(props.to, props.y, props.to > props.from ? 0 : 180)}`}
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
      <path class="hue-line mark" d="M30 129l6 6l12-12M270 129l6 6l12-12" />
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
      <Message class="alt-line" from={190} to={280} y={80} />
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
      <path class="ink-line" d={`M108 56h60${head(168, 56, 0)}`} />
      <text class="small" text-anchor="middle" x={137} y={48}>
        destroy()
      </text>
      <rect class="rule dash" fill="none" height={64} rx={6} width={54} x={168} y={24} />
      <text class="small" text-anchor="middle" x={195} y={60}>
        empty
      </text>
      <path class="ink-line" d={`M222 56h18${head(240, 56, 0)}`} />
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
      <path class="hue-line" d={`M108 36h68${head(176, 36, 0)}`} />
      <text class="small hue-text" text-anchor="middle" x={138} y={42}>
        rebuild
      </text>
      <Sheet ch={14} cols={3} cw={40} head={10} rows={5} x={176} y={20} />
      <rect class="panel" height={20} rx={10} width={92} x={16} y={112} />
      <circle class="alt" cx={98} cy={122} r={7} />
      <text class="small strong" x={28} y={126}>
        read-only
      </text>
      <path class="alt-line" d={`M108 122c34 0 50-12 68-22${head(176, 100, -30)}`} />
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
      <path class="panel" d="M20 40v72a32 9 0 0 0 64 0V40z" />
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
      <path class="hue-line dash" d={`M84 66h120${head(204, 66, 0)}`} />
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
      <path class="ink-line" d={`M104 52h36${head(140, 52, 0)}`} />
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
        d={`M${props.x} ${props.y + 8}v${props.h - 16}a${rx()} 8 0 0 0 ${props.w} 0V${props.y + 8}z`}
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
        d={`M94 40c24 0 32 26 54 30${head(148, 70, 15)}M94 102c24 0 32-20 54-24${head(148, 78, -15)}`}
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
      <Message class="hue-line" from={222} to={250} y={60} />
      <Note class="hue" text="v6" x={250} y={51} />
      <Message class="error-line" from={222} to={250} y={92} />
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
      <path class="rule" d="M110 64h88" />
      <path class="hue-line" d={`M190 64c0 22-70 22-98-2${head(92, 62, -160)}`} />
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
      <path class="hue-line" d={`M86 76h74${head(160, 76, 0)}`} />
      <path class="hue-line mark" d="M120 58a12 12 0 1 1 -2 -10" />
      <path class="hue-line mark" d={head(116, 48, -60)} />
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
      <path class="hue-line" d={`M86 60h44${head(130, 60, 0)}`} />
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

/** A labelled chip list in a panel: a component's state. */
function StatePanel(
  props: Readonly<{ x: number; y: number; title: string; items: readonly string[] }>,
) {
  return (
    <>
      <rect
        class="panel"
        height={30 + props.items.length * 24}
        rx={8}
        width={112}
        x={props.x}
        y={props.y}
      />
      <text class="small hue-text" x={props.x + 10} y={props.y + 18}>
        {props.title}
      </text>
      <For each={props.items}>
        {(item, index) => (
          <Note class="hue-soft" text={item} x={props.x + 8} y={props.y + 26 + index() * 24} />
        )}
      </For>
    </>
  );
}

/** React state drives the grid's filters, ranking and search. */
function ControlledQueriesArt() {
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="react">
      <StatePanel
        items={["market", "segment", "rank", "search"]}
        title="React state"
        x={12}
        y={14}
      />
      <path class="hue-line" d={`M124 70h52${head(176, 70, 0)}`} />
      <Sheet
        ch={18}
        cols={3}
        cw={40}
        fill={<rect class="hue-tint" height={36} width={120} x={176} y={44} />}
        head={14}
        rows={6}
        x={176}
        y={30}
      />
      <path class="hue" d="M262 16h14l-5 6v5l-4 2v-7z" />
    </CardArt>
  );
}

/** KPI cards read real formulas over the grid and recalculate on every edit. */
function FormulaKpisArt() {
  const kpis = ["SUM(named range)", "AVG", "SUMIF · market"] as const;
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="react">
      <Sheet
        ch={18}
        cols={2}
        cw={40}
        fill={<rect class="hue-tint" height={90} width={40} x={52} y={30} />}
        head={12}
        rows={6}
        x={12}
        y={18}
      />
      <For each={kpis}>
        {(kpi, index) => (
          <>
            <path
              class="ink-line"
              d={`M96 ${70 + (index() - 1) * 6}C116 ${70 + (index() - 1) * 6} 116 ${36 + index() * 44} 134 ${36 + index() * 44}`}
            />
            <rect class="panel" height={36} rx={6} width={172} x={136} y={18 + index() * 44} />
            <text class="small hue-text" x={146} y={34 + index() * 44}>
              ={kpi}
            </text>
            <rect
              class="ink"
              height={6}
              rx={3}
              width={40 + index() * 16}
              x={146}
              y={41 + index() * 44}
            />
          </>
        )}
      </For>
    </CardArt>
  );
}

/** A dataset reload or renderer swap rebuilds the grid; React state re-applies on ready. */
function ResetReconciliationArt() {
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="react">
      <rect class="panel" height={56} rx={6} width={86} x={12} y={22} />
      <Sheet ch={10} cols={3} cw={22} rows={3} x={22} y={38} />
      <path class="ink-line" d={`M98 50h54${head(152, 50, 0)}`} />
      <text class="small" text-anchor="middle" x={124} y={42}>
        rebuild
      </text>
      <rect class="hue-soft" height={56} rx={6} width={86} x={152} y={22} />
      <Sheet ch={10} cols={3} cw={22} rows={3} x={162} y={38} />
      <text class="small" x={248} y={46}>
        new grid
      </text>
      <Note class="alt-soft" text="React state" x={150} y={116} />
      <path class="alt-line" d={`M195 116V78${head(195, 78, -90)}`} />
      <text class="small alt-text" x={204} y={102}>
        on ready
      </text>
      <text class="small" x={12} y={100}>
        dataset reload
      </text>
      <text class="small" x={12} y={116}>
        renderer swap
      </text>
    </CardArt>
  );
}

/** CSV import lands as one undoable commit; CSV and XLSX exports leave the grid. */
function DataWorkflowsArt() {
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="react">
      <path class="panel" d={docPath(12, 30, 56, 70)} />
      <path class="rule" d={foldPath(12, 30, 56)} />
      <text class="small hue-text" x={20} y={82}>
        CSV
      </text>
      <path class="hue-line" d={`M68 64h46${head(114, 64, 0)}`} />
      <Sheet ch={16} cols={3} cw={28} head={10} rows={5} x={114} y={20} />
      <Note class="hue-soft" text="one undoable commit" x={92} y={122} />
      <path class="alt-line" d={`M198 50h40${head(238, 50, 0)}M198 80h40${head(238, 80, 0)}`} />
      <Note text="CSV" x={238} y={41} />
      <Note text="XLSX" x={238} y={71} />
    </CardArt>
  );
}

/** One causal view: the cell, its access rule, the rejection, the role change, the accepted commit. */
function PolicyTimelineArt() {
  const steps = [
    ["cell", "hue-soft"],
    ["rule", "panel"],
    ["rejected", "error-soft"],
    ["role", "alt-soft"],
    ["commit", "hue"],
  ] as const;
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="vue">
      <path class="rule" d="M24 80h272" stroke-width={2} />
      <For each={steps}>
        {([label, tone], index) => (
          <>
            <circle class={tone} cx={32 + index() * 64} cy={80} r={9} />
            <text
              class="small strong"
              text-anchor="middle"
              x={32 + index() * 64}
              y={index() % 2 === 0 ? 60 : 108}
            >
              {label}
            </text>
          </>
        )}
      </For>
      <path class="hue-line" d="M24 130h272" stroke-dasharray="2 4" />
      <text class="small" x={24} y={146}>
        one view, in causal order
      </text>
    </CardArt>
  );
}

/** Reactive props drive the adapter; every workbook change crosses the Grid API. */
function VueAuthorityArt() {
  const chain = [
    ["props", "hue-soft"],
    ["adapter", "panel"],
    ["Grid API", "panel"],
  ] as const;
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="vue">
      <For each={chain}>
        {([label, tone], index) => (
          <>
            <rect class={tone} height={34} rx={8} width={72} x={12 + index() * 84} y={60} />
            <text class="small strong" text-anchor="middle" x={48 + index() * 84} y={81}>
              {label}
            </text>
            <path
              class="hue-line"
              d={`M${84 + index() * 84} 77H${Math.min(96 + index() * 84, 256)}${head(Math.min(96 + index() * 84, 256), 77, 0)}`}
            />
          </>
        )}
      </For>
      <Sheet ch={14} cols={2} cw={28} head={10} rows={5} x={256} y={34} />
      <text class="small hue-text" x={12} y={44}>
        reactive
      </text>
    </CardArt>
  );
}

/** The note editor and event feed sit beside the grid; native tabs own the sheets. */
function WorkbookToolsArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="vue">
      <Sheet ch={16} cols={3} cw={36} head={10} rows={5} x={12} y={14} />
      <rect class="hue-line" height={16} width={36} x={48} y={40} />
      <path class="alt" d="M78 40h6v6z" />
      <rect class="hue-soft" height={14} rx={3} width={36} x={12} y={110} />
      <rect class="panel" height={14} rx={3} width={36} x={52} y={110} />
      <rect class="panel" height={14} rx={3} width={36} x={92} y={110} />
      <text class="small" x={12} y={142}>
        native sheet tabs
      </text>
      <rect class="alt-soft" height={52} rx={6} width={150} x={158} y={14} />
      <text class="small strong" x={168} y={32}>
        note editor
      </text>
      <Bar class="alt" w={100} x={168} y={42} />
      <Bar class="alt" w={70} x={168} y={52} />
      <rect class="panel" height={66} rx={6} width={150} x={158} y={76} />
      <text class="small strong" x={168} y={94}>
        event feed
      </text>
      <For each={[0, 1, 2]}>
        {(index) => <Bar w={110 - index * 18} x={168} y={104 + index * 11} />}
      </For>
    </CardArt>
  );
}

/** An accepted edit enters the pending queue before the host's version advances. */
function HostAcknowledgementArt() {
  return (
    <CardArt alt="violet" height={PROOF_HEIGHT} hue="vue">
      <Note class="hue-soft" text="accepted edit" x={12} y={30} />
      <path class="hue-line" d={`M60 48v26${head(60, 74, 90)}`} />
      <rect class="panel" height={58} rx={8} width={110} x={12} y={74} />
      <text class="small hue-text" x={22} y={92}>
        pending queue
      </text>
      <For each={[0, 1, 2]}>
        {(index) => (
          <rect class="hue-soft" height={14} rx={7} width={24} x={22 + index * 30} y={104} />
        )}
      </For>
      <path class="ink-line" d={`M122 103h54${head(176, 103, 0)}`} />
      <text class="small" text-anchor="middle" x={148} y={95}>
        then
      </text>
      <Note text="host v12" x={176} y={94} />
      <path class="alt-line" d={`M240 103h38${head(278, 103, 0)}`} />
      <Note class="alt-soft" text="v13" x={278} y={94} />
    </CardArt>
  );
}

/** The grid stays editable while the connection is down. */
function OfflineEditsArt() {
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="svelte">
      <rect class="panel" height={124} rx={8} width={196} x={12} y={20} />
      <Sheet ch={18} cols={4} cw={44} head={12} rows={5} x={22} y={30} />
      <rect class="hue-tint" height={18} width={44} x={66} y={78} />
      <rect class="hue-line" height={18} width={44} x={66} y={78} />
      <path class="hue" d="M104 92v14l4-3.5 3 6 3-1.4-3-6h6z" />
      <path class="panel" d="M232 76a12 12 0 0 1 2-24a17 17 0 0 1 32-4a12 12 0 0 1 4 28z" />
      <path class="ink-line" d="M234 42l34 40" stroke-width={2.5} />
      <text class="small" text-anchor="middle" x={252} y={104}>
        offline
      </text>
      <text class="small hue-text" text-anchor="middle" x={252} y={124}>
        still editable
      </text>
    </CardArt>
  );
}

/** IndexedDB owns each edit; reconnect drains the outbox in order. */
function DurableOutboxArt() {
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="svelte">
      <Cylinder h={96} w={84} x={14} y={28} />
      <For each={[0, 1, 2]}>
        {(index) => (
          <>
            <rect class="hue-soft" height={16} rx={8} width={60} x={26} y={52 + index * 22} />
            <text class="small strong" x={34} y={64 + index * 22}>
              edit {index + 1}
            </text>
          </>
        )}
      </For>
      <text class="small" text-anchor="middle" x={56} y={144}>
        outbox
      </text>
      <path class="hue-line" d={`M86 76h130${head(216, 76, 0)}`} />
      <text class="small hue-text" text-anchor="middle" x={160} y={68}>
        1, 2, 3 in order
      </text>
      <path class="panel" d="M228 100a14 14 0 0 1 2-28a20 20 0 0 1 38-6a15 15 0 0 1 6 34z" />
      <path class="alt-line" d="M238 84l6 6l12-12" stroke-width={2.5} />
    </CardArt>
  );
}

/** Presence stays on the board; queue state and server versions sit beside it. */
function CausalBoardArt() {
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="svelte">
      <Sheet ch={20} cols={4} cw={40} head={12} rows={5} x={12} y={18} />
      <rect class="hue-line" height={20} width={40} x={52} y={50} />
      <path class="hue" d="M88 62v14l4-3.5 3 6 3-1.4-3-6h6z" />
      <rect class="alt-line" height={20} width={40} x={132} y={90} />
      <path class="alt" d="M168 102v14l4-3.5 3 6 3-1.4-3-6h6z" />
      <rect class="panel" height={52} rx={6} width={112} x={196} y={18} />
      <text class="small" x={206} y={36}>
        queue
      </text>
      <text class="small strong" x={206} y={56}>
        2 pending
      </text>
      <rect class="panel" height={52} rx={6} width={112} x={196} y={80} />
      <text class="small" x={206} y={98}>
        server
      </text>
      <text class="small strong" x={206} y={118}>
        v8
      </text>
    </CardArt>
  );
}

/** Version conflicts and remount restoration stay visible on demand. */
function ExplicitRecoveryArt() {
  return (
    <CardArt alt="green" height={PROOF_HEIGHT} hue="svelte">
      <Note class="error-soft" text="version conflict" x={12} y={22} />
      <text class="small" x={12} y={62}>
        base v6 · head v8
      </text>
      <rect class="panel" height={66} rx={8} width={92} x={190} y={20} />
      <Sheet ch={12} cols={3} cw={24} rows={3} x={200} y={36} />
      <path class="hue-line mark" d="M236 104a26 26 0 1 1 18 -6" />
      <path class="hue-line mark" d={head(254, 98, -40)} />
      <text class="small hue-text" x={12} y={110}>
        remount
      </text>
      <text class="small" x={12} y={128}>
        state restored
      </text>
      <path class="ink-line dash" d={`M124 31h66${head(190, 31, 0)}`} />
    </CardArt>
  );
}

/** Proof pictures by proof title, for the React, Vue and Svelte workbenches. */
export const FRAMEWORK_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  "Controlled queries": ControlledQueriesArt,
  "Formulas and KPIs": FormulaKpisArt,
  "Reset reconciliation": ResetReconciliationArt,
  "Data workflows": DataWorkflowsArt,
  "Policy result beside the mutation": PolicyTimelineArt,
  "Vue-native authority": VueAuthorityArt,
  "Attached workbook tools": WorkbookToolsArt,
  "Host acknowledgement": HostAcknowledgementArt,
  "Offline ticket edits": OfflineEditsArt,
  "Durable outbox": DurableOutboxArt,
  "Causal collaboration": CausalBoardArt,
  "Explicit recovery": ExplicitRecoveryArt,
};
