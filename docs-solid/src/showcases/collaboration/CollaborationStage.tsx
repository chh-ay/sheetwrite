import { isRepeatClick } from "@docs/lib/action-guard.js";
import {
  COLLABORATION_ACTORS,
  type ShowcaseActor,
} from "@docs/showcases/collaboration-protocol.js";
import { For, type JSX, onCleanup, onMount, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ActionError, pendingProps } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import { Button } from "../ui/Button.js";
import {
  actionError,
  actionPending,
  atHead,
  type BatchReport,
  batchReport,
  chaos,
  CHAOS_DRAIN_MS,
  chaosAction,
  chaosError,
  chaosPending,
  CLIENT_KEYS,
  type ClientKey,
  type ClientView,
  engine,
  restoreRunning,
  serverLog,
  serverVersion,
  setEngine,
  status,
  statusDetail,
  views,
} from "./state.js";

/** Milliseconds as a short duration: sub-second stays in ms, longer reads in s. */
function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(0)} ms`;
}

const actorOf = (key: ClientKey): ShowcaseActor =>
  key === "a" ? COLLABORATION_ACTORS[0] : COLLABORATION_ACTORS[1];

type ChallengePhase = "initial" | "offline" | "queued" | "reconnecting" | "resolved";

function challengePhase(): ChallengePhase {
  const bram = views.b;
  const pending = bram.syncState?.pendingCount ?? 0;
  if (!bram.online) return pending === 0 ? "offline" : "queued";
  if (pending > 0) return "reconnecting";
  return serverVersion() > 0 ? "resolved" : "initial";
}

function challengeCopy(phase: ChallengePhase): readonly [string, string] {
  const pending = views.b.syncState?.pendingCount ?? 0;
  switch (phase) {
    case "initial":
      return ["Start with a disconnect", "Take Bram offline. His Grid remains editable."];
    case "offline":
      return [
        "Bram is offline",
        "Queue a real Grid edit while the server stays at its current head.",
      ];
    case "queued":
      return [
        `${pending} edit${pending === 1 ? "" : "s"} waiting`,
        "Reconnect to sequence the durable queue and broadcast the result to Ana.",
      ];
    case "reconnecting":
      return ["Queue is draining", "The server is sequencing Bram’s pending work in order."];
    case "resolved":
      return ["Clients converged", "Both Grids now reflect the sequenced server history."];
  }
}

function BatchReportView(props: Readonly<{ report: BatchReport }>) {
  return (
    <div
      class="sw-clb__batch"
      data-state={props.report.passed ? "passed" : "failed"}
      data-testid="clb-batch-report"
      role="status"
    >
      <strong>
        {props.report.passed
          ? "Atomic batch passed: every version or none."
          : "The batch restore did not meet every check."}
      </strong>
      <p>
        Ana cleared 100,000 usage cells and undid it once. The undo committed{" "}
        {props.report.versions} server versions as one atomic batch ({props.report.pieces}{" "}
        operations, {(props.report.operationBytes / 1024 / 1024).toFixed(1)} MiB of document
        operations). Bram applied the batch in {props.report.peerChanges} transaction.
      </p>
      <ShowcaseReadout
        items={[
          {
            label: "Ana's billable units",
            value: `${props.report.totalBefore.toLocaleString("en-US")} → ${props.report.totalAfter.toLocaleString("en-US")}`,
          },
          {
            label: "Bram's billable units",
            value: props.report.peerTotal.toLocaleString("en-US"),
          },
          { label: "Took", value: formatDuration(props.report.ms) },
        ]}
      />
    </div>
  );
}

/** Where each client is against the server head. */
function ConvergenceReadout() {
  const clientsAtHead = () => CLIENT_KEYS.filter(atHead).length;
  return (
    <ShowcaseReadout
      items={[
        ...CLIENT_KEYS.map((key) => ({
          label: actorOf(key).displayName,
          get value() {
            const pending = views[key].syncState?.pendingCount ?? 0;
            const version = views[key].syncState?.serverVersion ?? 0;
            return pending > 0
              ? `v${version} · ${pending} queued`
              : `v${version} · ${atHead(key) ? "caught up" : "catching up"}`;
          },
        })),
        {
          label: "Server head",
          value: (
            <span aria-live="polite" data-state={clientsAtHead() === 2 ? "current" : "waiting"}>
              <span data-testid="clb-server-version">v{serverVersion()}</span>
              {clientsAtHead() === 2 ? " · both caught up" : " · waiting for clients"}
            </span>
          ),
        },
      ]}
    />
  );
}

/** The side panel: stress drills, the offline reconnect, convergence and the server log. */
function ProtocolControls() {
  const stormBusy = () => chaos()?.phase === "storm" || chaos()?.phase === "settling";
  const ready = () => status() === "ready";
  const phase = challengePhase;

  return (
    <>
      <ShowcaseControlGroup
        description="Six seconds of concurrent edits, dropped connections and reordered broadcasts, or one atomic batch of 100,000 cells."
        title="Stress the protocol"
      >
        <div class="sw-clb__chaos" data-phase={chaos()?.phase ?? "idle"}>
          <Button
            data-testid="clb-chaos"
            {...pendingProps(chaosPending())}
            disabled={chaosPending() || !ready() || stormBusy() || restoreRunning()}
            onClick={() => {
              const current = engine();
              if (current) {
                void chaosAction.run(current.runChaos, () => "The chaos test failed. Try again.");
              }
            }}
            variant="primary"
          >
            <Icon name="bolt" />
            {chaos()?.phase === "storm"
              ? "Chaos running…"
              : chaos()?.phase === "settling"
                ? "Reconnecting…"
                : "Run a chaos test"}
          </Button>
        </div>
        <Button
          data-testid="clb-restore"
          disabled={!ready() || restoreRunning() || stormBusy()}
          onClick={() => engine()?.restoreUsage()}
        >
          <Icon name="undo" />
          {restoreRunning() ? "Restoring usage…" : "Clear 100,000 cells, then undo"}
        </Button>
        <output aria-live="polite" class="sw-clb__chaos-report" data-testid="clb-chaos-report">
          {(() => {
            const current = chaos();
            if (current === null) return "";
            if (current.phase === "converged") {
              return `Converged: ${current.edits} edits, ${current.disconnects} disconnects, ${current.reorders} reordered broadcasts. All ${current.cells} cells match on both clients.`;
            }
            if (current.phase === "diverged") {
              return `Not converged: ${current.mismatches} of ${current.cells} cells differ.`;
            }
            if (current.phase === "timed-out") {
              return `Not settled: work was still queued or recovering after ${CHAOS_DRAIN_MS / 1000} seconds.`;
            }
            return `${current.edits} edits · ${current.disconnects} disconnects · ${current.reorders} reordered · ${(current.ms / 1000).toFixed(1)} s`;
          })()}
        </output>
        <Show when={batchReport()}>{(report) => <BatchReportView report={report()} />}</Show>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup description={challengeCopy(phase())[1]} title="Reconnect offline">
        <ol
          aria-label="Offline reconnect sequence"
          class="sw-clb__steps"
          data-phase={phase()}
          data-testid="clb-sequence"
        >
          <li data-current={phase() === "initial" ? "true" : undefined}>
            <Button
              disabled={!ready() || !views.b.online}
              onClick={() => engine()?.toggleOnline("b", false)}
            >
              <Icon name="cloud-off" />
              Take Bram offline
            </Button>
          </li>
          <li data-current={phase() === "offline" ? "true" : undefined}>
            <Button
              aria-busy={actionPending() || undefined}
              disabled={!ready() || views.b.online || actionPending()}
              onClick={() => engine()?.sampleEdit("b")}
            >
              <Icon name="plus" />
              {actionPending() ? "Queuing edit…" : "Queue one Grid edit"}
            </Button>
          </li>
          <li data-current={phase() === "queued" ? "true" : undefined}>
            <Button
              disabled={!ready() || views.b.online}
              onClick={() => engine()?.toggleOnline("b", true)}
            >
              <Icon name="cloud" />
              Reconnect
            </Button>
          </li>
        </ol>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup title="Convergence">
        <ConvergenceReadout />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup title="Server decisions">
        <ol aria-live="polite" class="sw-clb__server-log" data-testid="clb-server-log">
          <For
            each={serverLog()}
            fallback={<li class="sw-clb__log-empty">Waiting for the first commit.</li>}
          >
            {(entry) => <li data-ack={entry.status}>{entry.text}</li>}
          </For>
        </ol>
      </ShowcaseControlGroup>
    </>
  );
}

interface ClientPanelProps {
  actor: ShowcaseActor;
  children: JSX.Element;
  slug: ClientKey;
  view: ClientView;
}

function ClientPanel(props: Readonly<ClientPanelProps>) {
  const connection = () => (props.view.online ? "online" : "offline");
  const pending = () => props.view.syncState?.pendingCount ?? 0;
  return (
    <article
      aria-label={`Client ${props.actor.displayName}`}
      class="sw-clb__client"
      data-client={props.slug}
      data-connection={connection()}
    >
      <header class="sw-clb__client-head">
        <span class="sw-clb__actor">{props.actor.displayName}</span>
        <span
          class="sw-clb__connection"
          data-connection={connection()}
          data-testid={`clb-${props.slug}-connection`}
        >
          {connection()}
        </span>
        <label class="sw-proofs-switch" data-state={props.view.online ? "on" : "paused"}>
          <input
            aria-label={`${props.actor.displayName} online`}
            checked={props.view.online}
            disabled={!props.view.ready}
            onChange={(event) => engine()?.toggleOnline(props.slug, event.currentTarget.checked)}
            onClick={(event) => {
              // The second click of a double-click must not undo the first.
              if (isRepeatClick(event)) event.preventDefault();
            }}
            type="checkbox"
          />
          <span aria-hidden="true" class="sw-proofs-switch-track">
            <span class="sw-proofs-switch-thumb" />
          </span>
          <span aria-hidden="true" class="sw-proofs-switch-copy">
            <span class="sw-proofs-switch-state">{props.view.online ? "Online" : "Offline"}</span>
          </span>
        </label>
      </header>

      {props.children}

      <div class="sw-clb__client-action">
        <Button
          aria-busy={actionPending() || undefined}
          disabled={!props.view.ready || actionPending()}
          onClick={() => engine()?.sampleEdit(props.slug)}
        >
          <Icon name="plus" />
          {actionPending() ? "Applying edit…" : `Add $500 to ${props.view.account}`}
        </Button>
        <p aria-live="polite">
          <span>Latest</span>
          {props.view.log[0]?.text ?? "No sync events yet."}
        </p>
      </div>

      <dl class="sw-clb__stats">
        <div>
          <dt>Version</dt>
          <dd data-testid={`clb-${props.slug}-version`}>
            v{props.view.syncState?.serverVersion ?? 0}
          </dd>
        </div>
        <div>
          <dt>Queue</dt>
          <dd
            data-state={pending() > 0 ? "queued" : undefined}
            data-testid={`clb-${props.slug}-pending`}
          >
            {pending()}
          </dd>
        </div>
        <div>
          <dt>Forecast total</dt>
          <dd data-testid={`clb-${props.slug}-total`}>{props.view.total}</dd>
        </div>
        <div class="sw-clb__presence">
          <dt>Presence</dt>
          <dd>
            <ul
              aria-label={`Collaborators visible to ${props.actor.displayName}`}
              data-testid={`clb-${props.slug}-roster`}
            >
              <For
                each={props.view.roster}
                fallback={<li class="sw-clb__presence-empty">No one yet</li>}
              >
                {(message) => <li>{message.actor.displayName ?? message.actor.id}</li>}
              </For>
            </ul>
          </dd>
        </div>
      </dl>
    </article>
  );
}

/** Props of {@link CollaborationStage}. */
export interface CollaborationStageProps {
  readonly demoLabel: string;
}

/** The collaboration showcase's island: two live clients, one server, and the drills. */
export function CollaborationStage(props: CollaborationStageProps) {
  const hosts = {} as Record<ClientKey, HTMLDivElement>;

  onMount(() => {
    let disposed = false;
    const stopWaiting = whenNearViewport(hosts.a, () => {
      void import("./engine.js").then(({ createCollaborationEngine }) => {
        if (!disposed) setEngine(createCollaborationEngine(hosts));
      });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      engine()?.dispose();
      setEngine(null);
    });
  });

  return (
    <ShowcaseStage
      controls={<ProtocolControls />}
      demo={
        <section aria-label="Collaboration protocol showcase" class="sw-clb" data-state={status()}>
          <ActionError error={actionError() ?? chaosError()} />
          <div class="sw-clb__workbench">
            <For each={CLIENT_KEYS}>
              {(key) => (
                <ClientPanel actor={actorOf(key)} slug={key} view={views[key]}>
                  <div
                    aria-label={`${actorOf(key).displayName}'s workbook`}
                    class="sw-clb__grid"
                    data-testid={`clb-${key}-grid`}
                    ref={(element) => {
                      hosts[key] = element;
                    }}
                    role="application"
                  />
                </ClientPanel>
              )}
            </For>
          </div>
        </section>
      }
      demoActions={
        <span class="sw-clb__status" data-status={status()} data-testid="clb-status">
          <ShowcaseStatus
            tone={status() === "ready" ? "ok" : status() === "error" ? "error" : "neutral"}
          >
            {status() === "ready" ? "Live" : status() === "error" ? "Error" : "Loading"}
          </ShowcaseStatus>
          <span class="sw-clb__status-detail">{statusDetail()}</span>
        </span>
      }
      demoLabel={props.demoLabel}
      demoTitle="Shared forecast"
    />
  );
}
