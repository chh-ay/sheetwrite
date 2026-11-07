import { formatBytes } from "@docs/lib/format.js";
import { For, Show } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ShowcaseSection } from "../layout/ShowcaseLayout.js";
import { Button } from "../ui/Button.js";
import { ready, runAction } from "./DatabaseStage.js";
import { busy, engine, limitReport, stats, status } from "./state.js";

/** Props of {@link DatabaseLab}: the adapter's compaction bounds, for the storage note. */
export interface DatabaseLabProps {
  readonly maxTailRecords: number;
  readonly maxTailBytes: number;
}

/** The database page's failure lab: lost acknowledgements, conflicts, limits and storage. */
export function DatabaseLab(props: DatabaseLabProps) {
  let limitHost!: HTMLDivElement;
  const counters = () => [
    {
      id: "dbx-snapshot-version",
      label: "Snapshot revision",
      value: String(stats()?.snapshotVersion ?? 0),
    },
    { id: "dbx-tail", label: "Tail records", value: String(stats()?.tailLength ?? 0) },
    { id: "dbx-reads", label: "IDB reads", value: String(stats()?.reads ?? 0) },
    { id: "dbx-writes", label: "IDB writes", value: String(stats()?.writes ?? 0) },
  ];

  return (
    <ShowcaseSection id="database-failure-lab" title="Failure lab and storage">
      <details class="sw-dbx__diagnostics" data-testid="dbx-diagnostics">
        <summary>
          <Icon name="chevron-right" />
          Lose acknowledgements, force conflicts, and read the storage counters
        </summary>
        <div class="sw-dbx__diagnostics-body">
          <section class="sw-dbx__limit-proof">
            <h3>Oversized undo</h3>
            <Button
              data-testid="dbx-tight-limit"
              disabled={!ready()}
              onClick={() => engine()?.tryTightUndo(limitHost)}
            >
              Try a 128-byte undo limit
            </Button>
            <div class="sw-dbx__limit-grid" ref={limitHost} />
            <Show when={limitReport()}>
              {(report) => (
                <p
                  data-state={report().passed ? "passed" : "failed"}
                  data-testid="dbx-limit-report"
                  role="status"
                >
                  {report().passed
                    ? "resource-limit: the oversized undo changed nothing and was dropped. The older edit still undid normally."
                    : "The tight-limit proof did not meet every check."}
                </p>
              )}
            </Show>
          </section>
          <fieldset class="sw-dbx__control-group">
            <legend>Lost acknowledgement</legend>
            <Button
              disabled={!ready()}
              onClick={() => runAction((current) => current.loseNextAck())}
            >
              Lose next acknowledgement
            </Button>
            <Button
              disabled={!ready()}
              onClick={() => runAction((current) => current.retryPending())}
            >
              Retry pending commit
            </Button>
          </fieldset>
          <fieldset class="sw-dbx__control-group">
            <legend>Conflict and reset</legend>
            <Button
              disabled={!ready()}
              onClick={() => runAction((current) => current.externalCommit())}
            >
              External writer commit
            </Button>
            <Button
              aria-busy={busy() || undefined}
              disabled={busy() || status() === "loading"}
              onClick={() => runAction((current) => current.resetDemo())}
            >
              {busy() ? "Resetting…" : "Reset demo data"}
            </Button>
          </fieldset>
          <section aria-labelledby="dbx-counters-title" class="sw-dbx__storage">
            <h3 id="dbx-counters-title">Storage internals</h3>
            <dl class="sw-dbx__counters">
              <For each={counters()}>
                {(counter) => (
                  <div>
                    <dt>{counter.label}</dt>
                    <dd data-testid={counter.id}>{counter.value}</dd>
                  </div>
                )}
              </For>
            </dl>
            <p class="sw-dbx__note">
              Compaction folds the operation tail into snapshot revision after{" "}
              {props.maxTailRecords} tail records or{" "}
              {formatBytes(props.maxTailBytes, { kib: 0, mib: 1, groupKib: true })}.
            </p>
          </section>
        </div>
      </details>
    </ShowcaseSection>
  );
}
