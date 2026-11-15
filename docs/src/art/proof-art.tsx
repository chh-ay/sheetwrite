// Small pictures for the showcases' "What the scenario proves" cards. Each
// proof picture is decorative: its card's title and text state the same
// facts. The collaboration and database cards are blueprint pictures.
import { For, type JSX } from "solid-js";

import { Bar, CardArt, docPath, foldPath, head, Sheet } from "./Art.js";
import { type CardBox, cardLayout, WIDE_CARD } from "./blueprint-cards.js";
import { BlueprintCard } from "./blueprint.js";

/** Proof pictures share the 2:1 framework-card canvas. */
const PROOF_HEIGHT = 160;

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

/** A proof card's picture: columns of boxes on the 2:1 proof card canvas. */
const proof = (...columns: (readonly CardBox[])[]) => (
  <BlueprintCard layout={cardLayout(WIDE_CARD, columns)} />
);

/** Proof pictures by proof title, for the collaboration showcase's proof cards. */
export const COLLABORATION_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  // Both clients' edits are sequenced once, and both end with the same cells.
  "Convergence under ordering": () =>
    proof(
      [{ title: "Client A" }, { title: "Client B" }],
      [{ title: "Server" }],
      [{ title: "Same cells", tone: "accent" }],
    ),
  // A retry with the same mutation id is applied once.
  "Loss without double-apply": () =>
    proof(
      [{ title: "Retry m7", lines: ["same id"] }],
      [{ title: "Server" }],
      [{ title: "Applied once", tone: "accent" }],
    ),
  // Edits queue while offline and drain in order on reconnect.
  "Offline is a first-class state": () =>
    proof(
      [{ title: "Offline", lines: ["edits queue"] }],
      [{ title: "Reconnect" }],
      [{ title: "Drain", lines: ["in order"], tone: "accent" }],
    ),
  // A version that arrives early waits for the gap; a stale base is a conflict.
  "Gaps and conflicts stay explicit": () =>
    proof(
      [{ title: "v43 early" }, { title: "Stale base" }],
      [
        { title: "Buffered", lines: ["until v42"] },
        { title: "Conflict", tone: "danger" },
      ],
    ),
  // A restore over four versions travels and applies as one batch.
  "Atomic multi-version batches": () =>
    proof(
      [{ title: "Restore", lines: ["4 versions"] }],
      [{ title: "One batch", tone: "accent" }],
      [{ title: "Applied" }],
    ),
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

/** Proof pictures by proof title, for the database showcase. */
export const DATABASE_PROOF_ART: Readonly<Record<string, () => JSX.Element>> = {
  // Two writers on the same base: one queue accepts the first, the second gets a conflict.
  "Atomic sequencing": () =>
    proof(
      [{ title: "A · base v5" }, { title: "B · base v5" }],
      [{ title: "Queue" }],
      [
        { title: "v6", tone: "accent" },
        { title: "Conflict", tone: "danger" },
      ],
    ),
  // A retry with the same mutation id gets the original version back.
  "Idempotent retries": () =>
    proof(
      [{ title: "Retry m7", lines: ["same id"] }],
      [{ title: "Adapter" }],
      [{ title: "Stored once", lines: ["returns v6"], tone: "accent" }],
    ),
  // The operation log grows to its limit, then folds into one snapshot.
  "Bounded storage": () =>
    proof(
      [{ title: "Log" }],
      [{ title: "Limit hit" }],
      [{ title: "Snapshot", lines: ["compacted"], tone: "accent" }],
    ),
  // A reload brings committed state and the pending queue back.
  "Reload recovery": () =>
    proof(
      [{ title: "IndexedDB" }],
      [{ title: "Reload" }],
      [{ title: "Committed", tone: "accent" }, { title: "Pending" }],
    ),
  // Undoing a 100,000-cell clear is one commit.
  "Large undo": () =>
    proof(
      [{ title: "Clear", lines: ["100,000 cells"] }],
      [{ title: "Undo" }],
      [{ title: "One commit", lines: ["restoreBlock"], tone: "accent" }],
    ),
  // An undo over the limit is rejected; older steps stay undoable.
  "Oversized undo": () =>
    proof(
      [{ title: "Undo", lines: ["too large"] }],
      [{ title: "Rejected", tone: "danger" }],
      [{ title: "Older steps", lines: ["kept"] }],
    ),
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
