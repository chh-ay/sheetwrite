import { ActionError } from "../lib/use-action.js";
import { ControlActions, ControlButton, DemoGrid } from "./feature-controls.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
  ShowcaseStatus,
} from "./layout/ShowcaseLayout.js";
import {
  authorName,
  BASELINE_NAME,
  BUDGET_ROWS_USED,
  createVersionHistoryScenario,
  SAM,
  type ChangeReading,
  type HistoryScenario,
  type HistorySnapshot,
} from "./scenarios/version-history.js";
import VersionHistorySnippet from "./snippets/version-history.mdx";
import { useLiveScenario, useScenarioAction } from "./use-live-scenario.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

function ChangeList({ changes }: { readonly changes: readonly ChangeReading[] | null }) {
  if (changes === null) return null;
  if (changes.length === 0) {
    return <ShowcaseStatus tone="neutral">No changes since {BASELINE_NAME}</ShowcaseStatus>;
  }
  return (
    <ol className="sw-feature-changes" data-testid="history-changes">
      {changes.map((change) => (
        <li key={change.cell}>
          <code>{change.cell}</code>
          <span>
            {change.before} → <strong>{change.after}</strong>
          </span>
          <small>{change.author}</small>
        </li>
      ))}
    </ol>
  );
}

function HistoryControls({
  scenario,
  snapshot,
}: {
  readonly scenario: HistoryScenario | null;
  readonly snapshot: HistorySnapshot | null;
}) {
  const { run, disabled, error } = useScenarioAction(scenario);

  return (
    <>
      <ShowcaseControlGroup
        title="Edit the budget"
        description={`You edit in the grid. ${authorName(SAM)} edits the same document from a second client.`}
      >
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="formula"
            onClick={() => void run("Your edit", (current) => current.editAsYou())}
          >
            Raise Marketing by 15%
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="users"
            onClick={() => void run("Sam's edit", (current) => current.editAsSam())}
          >
            {authorName(SAM)} cuts Travel in Q3–Q4
          </ControlButton>
        </ControlActions>
        <ShowcaseReadout
          items={[
            {
              label: "Document version",
              value: (
                <span data-testid="history-server-version">{snapshot?.serverVersion ?? 0}</span>
              ),
            },
          ]}
        />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Versions"
        description="Newest first, with who saved or changed each."
      >
        <ShowcaseReadout
          items={(snapshot?.versions ?? []).map((version) => ({
            label: version.label,
            value: version.author,
          }))}
        />
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="save"
            onClick={() => void run("Save version", (current) => current.saveVersion())}
          >
            Save version
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="history"
            onClick={() => void run("Version History", (current) => current.openVersionHistory())}
          >
            Version History…
          </ControlButton>
        </ControlActions>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title={`Compare with ${BASELINE_NAME}`}
        description="Changed cells, before and after, and who changed each."
      >
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="compare"
            onClick={() => void run("Compare", (current) => current.compareWithBaseline())}
            variant="primary"
          >
            Compare with now
          </ControlButton>
        </ControlActions>
        <ChangeList changes={snapshot?.changes ?? null} />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Restore"
        description={`Bring back part of ${BASELINE_NAME} as one undoable change for everyone.`}
      >
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="restore"
            onClick={() => void run("Restore", (current) => current.restoreSecondHalf())}
          >
            Restore Q3 and Q4
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="restore"
            onClick={() => void run("Restore", (current) => current.restoreSheet())}
          >
            Restore the whole sheet
          </ControlButton>
        </ControlActions>
        <ActionError error={error} />
      </ShowcaseControlGroup>
    </>
  );
}

export default function VersionHistoryShowcase() {
  const { hostRef, scenario, snapshot, error } = useLiveScenario(createVersionHistoryScenario);

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: VersionHistorySnippet }}
      controls={<HistoryControls scenario={scenario} snapshot={snapshot} />}
      demo={
        <>
          <DemoGrid
            hostRef={hostRef}
            label="Budget workbook"
            rows={BUDGET_ROWS_USED}
            testId="history-grid"
          />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live budget with version history"
      eyebrow="Collaboration"
      facts={[
        { label: "Authors", value: `${authorName("you")}, ${authorName(SAM)}` },
        { label: "Starts from", value: BASELINE_NAME },
        { label: "Entry point", value: "@sheetwrite/core/history", code: true },
      ]}
      guide={{
        href: "/docs/features/data/persistence/#opt-in-version-archives",
        label: "Read the version history guide",
      }}
      id="version-history"
      task={
        <>
          Edit a shared budget with a teammate, save a version, compare it with the approved budget
          and restore part of it.
        </>
      }
      title="Save, compare and restore versions"
    >
      <ShowcaseSection id="version-history-rules" title="How versions are kept">
        <ul>
          <li>
            The document authority journals each committed change in the archive, with its author.
            Edits that are not committed yet never reach a version.
          </li>
          <li>
            Versions are stored in content-addressed chunks, so unchanged cells are shared between
            them. A compare loads a small WASM kernel the first time it runs.
          </li>
          <li>
            A restore is one undoable change and one synced transaction, so Sam's client receives it
            like any other edit.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
