import {
  authorName,
  BASELINE_NAME,
  BUDGET_ROWS_USED,
  type ChangeReading,
  type HistoryScenario,
  type HistorySnapshot,
  SAM,
} from "@docs/showcases/scenarios/version-history.js";
import { For, Show } from "solid-js";

import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
} from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";

function ChangeList(props: { readonly changes: readonly ChangeReading[] }) {
  return (
    <Show
      fallback={<ShowcaseStatus tone="neutral">No changes since {BASELINE_NAME}</ShowcaseStatus>}
      when={props.changes.length > 0}
    >
      <ol class="sw-feature-changes" data-testid="history-changes">
        <For each={props.changes}>
          {(change) => (
            <li>
              <code>{change.cell}</code>
              <span>
                {change.before} → <strong>{change.after}</strong>
              </span>
              <small>{change.author}</small>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}

/** The version history showcase's island: a shared budget, its versions and restores. */
export function VersionHistoryStage() {
  const live = createLiveScenario<HistoryScenario, HistorySnapshot>(() =>
    import("./boot.js").then(({ createVersionHistoryScenario }) => createVersionHistoryScenario),
  );
  const action = createScenarioAction(live.scenario);
  // Before the archive opens, the row its baseline version fills waits with "…".
  const versions = () => live.snapshot()?.versions ?? [{ label: BASELINE_NAME, author: "…" }];

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description={`You edit in the grid. ${authorName(SAM)} edits the same document from a second client.`}
            title="Edit the budget"
          >
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="formula"
                onClick={() => void action.run("Your edit", (current) => current.editAsYou())}
              >
                Raise Marketing by 15%
              </ControlButton>
              <ControlButton
                disabled={action.disabled()}
                icon="users"
                onClick={() => void action.run("Sam's edit", (current) => current.editAsSam())}
              >
                {authorName(SAM)} cuts Travel in Q3–Q4
              </ControlButton>
            </ControlActions>
            <ShowcaseReadout
              items={[
                {
                  label: "Document version",
                  value: (
                    <span data-testid="history-server-version">
                      {live.snapshot()?.serverVersion ?? 0}
                    </span>
                  ),
                },
              ]}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Newest first, with who saved or changed each."
            title="Versions"
          >
            <ShowcaseReadout
              items={versions().map((version) => ({
                label: version.label,
                value: version.author,
              }))}
            />
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="save"
                onClick={() => void action.run("Save version", (current) => current.saveVersion())}
              >
                Save version
              </ControlButton>
              <ControlButton
                disabled={action.disabled()}
                icon="history"
                onClick={() =>
                  void action.run("Version History", (current) => current.openVersionHistory())
                }
              >
                Version History…
              </ControlButton>
            </ControlActions>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Changed cells, before and after, and who changed each."
            title={`Compare with ${BASELINE_NAME}`}
          >
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="compare"
                onClick={() =>
                  void action.run("Compare", (current) => current.compareWithBaseline())
                }
                variant="primary"
              >
                Compare with now
              </ControlButton>
            </ControlActions>
            <Show when={live.snapshot()?.changes}>
              {(changes) => <ChangeList changes={changes()} />}
            </Show>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description={`Bring back part of ${BASELINE_NAME} as one undoable change for everyone.`}
            title="Restore"
          >
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="restore"
                onClick={() => void action.run("Restore", (current) => current.restoreSecondHalf())}
              >
                Restore Q3 and Q4
              </ControlButton>
              <ControlButton
                disabled={action.disabled()}
                icon="restore"
                onClick={() => void action.run("Restore", (current) => current.restoreSheet())}
              >
                Restore the whole sheet
              </ControlButton>
            </ControlActions>
            <ActionError error={action.error()} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <DemoGrid
            host={live.host}
            label="Budget workbook"
            rows={BUDGET_ROWS_USED}
            testId="history-grid"
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live budget with version history"
    />
  );
}
