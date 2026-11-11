import { formatBytes } from "@docs/lib/format.js";
import { For, onCleanup, onMount, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import { Button } from "../ui/Button.js";
import type { DatabaseEngine } from "./engine.js";
import {
  actionError,
  autosave,
  busy,
  type CrashReport,
  crashReport,
  engine,
  log,
  recoveryState,
  runGuarded,
  setEngine,
  stats,
  status,
  statusDetail,
  syncState,
  total,
  type UndoReport,
  undoReport,
  undoRunning,
} from "./state.js";

/** Every held edit came back, and the ledger shows the same total as before the reload. */
function reloadTestPassed(report: CrashReport): boolean {
  return report.restored === report.expected && report.totalAfter === report.totalBefore;
}

/** Runs one engine action under the page's single action guard. */
export function runAction(command: (current: DatabaseEngine) => Promise<void> | void): void {
  const current = engine();
  if (!current) return;
  void import("./engine.js").then(({ failureMessage }) =>
    runGuarded(() => command(current), failureMessage),
  );
}

/** The page can act: the session is live and no other action is running. */
export const ready = () => status() === "ready" && !busy();

function CrashReportView(props: Readonly<{ report: CrashReport }>) {
  const passed = () => reloadTestPassed(props.report);
  return (
    <div
      class="sw-dbx__report"
      data-state={passed() ? "passed" : "failed"}
      data-testid="dbx-crash-report"
      role="status"
    >
      <strong>
        {passed() ? "Reload test passed." : "Reload test failed: the restored state differs."}
      </strong>
      <p>
        The page reloaded with {props.report.expected} unsaved edits. IndexedDB restored{" "}
        {props.report.restored}, and autosave saved them.
      </p>
      <ShowcaseReadout
        items={[
          {
            label: "Before reload",
            value: `$${Number(props.report.totalBefore).toLocaleString("en-US")}`,
          },
          {
            label: "After recovery",
            value: `$${Number(props.report.totalAfter).toLocaleString("en-US")}`,
          },
        ]}
      />
    </div>
  );
}

function UndoReportView(props: Readonly<{ report: UndoReport }>) {
  return (
    <div
      class="sw-dbx__report"
      data-state={props.report.passed ? "passed" : "failed"}
      data-testid="dbx-undo-report"
      role="status"
    >
      <strong>
        {props.report.passed
          ? "Large undo passed: one history step, one commit."
          : "The large undo did not pass every check."}
      </strong>
      <p>
        Cleared 100,000 usage cells; the undo restored them as{" "}
        {props.report.versions === 1
          ? "one server version"
          : `${props.report.versions} server versions`}{" "}
        in {props.report.undoSteps} history step{props.report.undoSteps === 1 ? "" : "s"}.
      </p>
      <ShowcaseReadout
        items={[
          {
            label: "Billable units",
            value: `${props.report.before.toLocaleString("en")} → ${props.report.cleared.toLocaleString("en")} → ${props.report.after.toLocaleString("en")}`,
          },
          {
            label: "Restore block",
            value: `${formatBytes(props.report.decodedBytes, { kib: 0, mib: 1, groupKib: true })} → ${formatBytes(props.report.wireBytes, { kib: 0, mib: 1, groupKib: true })}`,
          },
        ]}
      />
    </div>
  );
}

/** Props of {@link DatabaseStage}. */
export interface DatabaseStageProps {
  readonly demoLabel: string;
}

/** The database showcase's island: the IndexedDB ledger, its durable state and journal. */
export function DatabaseStage(props: DatabaseStageProps) {
  let host!: HTMLDivElement;

  onMount(() => {
    let disposed = false;
    const stopWaiting = whenNearViewport(host, () => {
      void import("./engine.js").then(({ createDatabaseEngine }) => {
        if (disposed) return;
        const created = createDatabaseEngine(host);
        setEngine(created);
        void created.boot(null, "Loaded from IndexedDB");
      });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      engine()?.dispose();
      setEngine(null);
    });
  });

  const pendingCount = () => syncState()?.pendingCount ?? 0;

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="Reload the real page with unsaved edits, or clear 100,000 usage cells and undo them as one step."
            title="Reload and undo"
          >
            <Button
              data-testid="dbx-crash"
              disabled={!ready()}
              onClick={() => runAction((current) => current.reloadWithUnsavedEdits())}
              variant="primary"
            >
              <Icon name="refresh" />
              Reload with unsaved edits
            </Button>
            <Button
              data-testid="dbx-large-undo"
              disabled={!ready() || undoRunning()}
              onClick={() => runAction((current) => current.clearAndUndoUsage())}
            >
              <Icon name="undo" />
              {undoRunning() ? "Restoring usage…" : "Clear 100,000 cells, then undo"}
            </Button>
            <Show when={crashReport()}>{(report) => <CrashReportView report={report()} />}</Show>
            <Show when={undoReport()}>{(report) => <UndoReportView report={report()} />}</Show>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Durable state">
            <ShowcaseReadout
              items={[
                {
                  label: "Revision",
                  value: <span data-testid="dbx-version">{stats()?.currentVersion ?? 0}</span>,
                },
                {
                  label: "Pending writes",
                  value: (
                    <span
                      data-state={pendingCount() > 0 ? "queued" : undefined}
                      data-testid="dbx-pending"
                    >
                      {pendingCount()}
                    </span>
                  ),
                },
                { label: "Q1 revenue", value: <span data-testid="dbx-total">${total()}</span> },
                {
                  label: "Allocated",
                  value: (
                    <span data-testid="dbx-bytes">
                      {(() => {
                        const current = stats();
                        return current
                          ? formatBytes(current.storedBytes, { kib: 0, mib: 1, groupKib: true })
                          : "0 B";
                      })()}
                    </span>
                  ),
                },
                {
                  label: "Session",
                  value: <span data-testid="dbx-reload">{recoveryState()}</span>,
                },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Add one subscriber seat. Pause autosave, save the queue, or reopen this session."
            title="Save by hand"
          >
            <fieldset aria-label="Durability actions" class="sw-dbx__controls">
              <Button
                aria-label="Add one subscriber seat — Commit sample edit"
                disabled={!ready()}
                onClick={() => runAction((current) => current.commitSampleEdit())}
              >
                <Icon name="plus" />
                Add one seat
              </Button>
              <label class="sw-proofs-switch" data-state={autosave() ? "on" : "paused"}>
                <input
                  aria-label="Autosave"
                  checked={autosave()}
                  disabled={!ready()}
                  onChange={(event) => {
                    const on = event.currentTarget.checked;
                    engine()?.setAutosave(on);
                    if (on) runAction((current) => current.saveNow());
                  }}
                  type="checkbox"
                />
                <span aria-hidden="true" class="sw-proofs-switch-track">
                  <span class="sw-proofs-switch-thumb" />
                </span>
                <span aria-hidden="true" class="sw-proofs-switch-copy">
                  <span>Autosave</span>
                  <span class="sw-proofs-switch-state">{autosave() ? "On" : "Paused"}</span>
                </span>
              </label>
              <Button
                aria-label="Save pending now"
                disabled={!ready()}
                onClick={() => runAction((current) => current.saveNow())}
              >
                <Icon name="save" />
                Save pending
              </Button>
              <Button
                aria-label="Close and reopen session"
                disabled={!ready()}
                onClick={() => runAction((current) => current.reopenSession())}
              >
                <Icon name="restore" />
                Reopen session
              </Button>
            </fieldset>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Commit journal">
            <ol aria-live="polite" class="sw-dbx__log" data-testid="dbx-log">
              <For
                each={log()}
                fallback={
                  <li class="sw-dbx__log-empty">
                    Change an amount in the Grid. The durable write and acknowledgement appear here.
                  </li>
                }
              >
                {(entry) => <li data-kind={entry.kind}>{entry.text}</li>}
              </For>
            </ol>
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <section
          aria-busy={status() === "loading"}
          aria-label="IndexedDB persistence showcase"
          class="sw-dbx"
          data-state={status()}
          data-testid="dbx-instrument"
        >
          <ActionError error={status() === "error" ? statusDetail() : actionError()} />
          <Show when={status() === "error"}>
            <Button
              aria-busy={busy() || undefined}
              disabled={busy()}
              onClick={() => runAction((current) => current.boot(null, "Loaded from IndexedDB"))}
            >
              <Icon name="refresh" />
              {busy() ? "Retrying…" : "Retry loading"}
            </Button>
          </Show>
          <div
            aria-label="Quarterly subscription revenue workbook"
            class="sw-dbx__grid"
            data-testid="dbx-grid"
            ref={(element) => {
              host = element;
            }}
            role="application"
          />
        </section>
      }
      demoActions={
        <span
          class="sw-dbx__status"
          data-activity={syncState()?.activity ?? "hydrating"}
          data-status={status()}
          data-testid="dbx-status"
        >
          <ShowcaseStatus
            tone={status() === "ready" ? "ok" : status() === "error" ? "error" : "neutral"}
          >
            {status() === "ready" ? "Ready" : status() === "error" ? "Error" : "Loading"}
          </ShowcaseStatus>
          <span class="sw-dbx__status-detail">{statusDetail()}</span>
        </span>
      }
      demoLabel={props.demoLabel}
      demoTitle="Subscription revenue · IndexedDB"
    />
  );
}
