import {
  type DataModelScenario,
  type DataModelSnapshot,
  PENDING_SNAPSHOT,
  PIVOT_ROWS_USED,
  ROW_FIELDS,
  type RowFieldId,
  UNKNOWN_PRODUCT,
} from "@docs/showcases/scenarios/data-model.js";
import type { RelationshipStatus } from "@sheetwrite/core";
import { For } from "solid-js";

import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseReadout,
  ShowcaseStage,
  ShowcaseStatus,
  type ShowcaseStatusTone,
} from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";
import { RadioGroup } from "../ui/RadioGroup.js";

const ROW_FIELD_IDS = Object.keys(ROW_FIELDS) as RowFieldId[];

/** What a relationship's key check means for the reader, and how loudly to say it. */
function keyStatus(status: RelationshipStatus): { tone: ShowcaseStatusTone; text: string } {
  switch (status.status) {
    case "ok":
      return status.unmatched === 0
        ? { tone: "ok", text: "Keys match" }
        : { tone: "warn", text: `${status.unmatched} order without a match` };
    case "duplicateKey":
      return { tone: "error", text: "A lookup key repeats" };
    case "typeMismatch":
      return { tone: "error", text: "Key types differ" };
    case "missingTable":
    case "missingColumn":
      return { tone: "error", text: "A table or column is gone" };
    case "unavailable":
      return { tone: "neutral", text: "Checking…" };
  }
}

/** The data model showcase's island: three related tables, their pivot and its reads. */
export function DataModelStage() {
  const live = createLiveScenario<DataModelScenario, DataModelSnapshot>(() =>
    import("./boot.js").then(({ createDataModelScenario }) => createDataModelScenario),
  );
  const action = createScenarioAction(live.scenario);
  const snapshot = () => live.snapshot() ?? PENDING_SNAPSHOT;

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="Orders point at Products and Regions by key. The engine checks the keys after every change."
            title="Relationships"
          >
            <ul class="sw-feature-statuses">
              <For each={snapshot().relationships}>
                {(reading) => (
                  <li data-testid={`model-relationship-${reading.id}`}>
                    <code>{reading.label}</code>
                    <ShowcaseStatus tone={keyStatus(reading.status).tone}>
                      {keyStatus(reading.status).text}
                    </ShowcaseStatus>
                  </li>
                )}
              </For>
            </ul>
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="key"
                onClick={() =>
                  void action.run("The key change", (current) => current.duplicateProductKey())
                }
              >
                Repeat a product ID
              </ControlButton>
              <ControlButton
                disabled={action.disabled()}
                icon="warning"
                onClick={() =>
                  void action.run("The order change", (current) => current.orphanOrder())
                }
              >
                Order product {UNKNOWN_PRODUCT}
              </ControlButton>
              <ControlButton
                disabled={action.disabled()}
                icon="link"
                onClick={() =>
                  void action.run("Relationships", (current) => current.openRelationships())
                }
              >
                Relationships…
              </ControlButton>
            </ControlActions>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Group the orders by a column of a related table."
            title="Pivot over related tables"
          >
            <RadioGroup
              label="Pivot rows"
              onChange={(value) =>
                void action.run("The pivot change", (current) => current.setRowField(value))
              }
              options={ROW_FIELD_IDS.map((id) => ({ value: id, label: ROW_FIELDS[id].label }))}
              value={snapshot().rowField}
            />
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="pivot"
                onClick={() =>
                  void action.run("The field list", (current) => current.openFieldList())
                }
              >
                PivotTable Fields…
              </ControlButton>
            </ControlActions>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="GETPIVOTDATA reads the grand totals by data field name."
            title="Formulas that read the pivot"
          >
            <ShowcaseReadout
              items={snapshot().reads.map((read) => ({
                label: read.label,
                value: <span data-testid={`model-read-${read.label}`}>{read.value}</span>,
              }))}
            />
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="undo"
                onClick={() => void action.run("Undo", (current) => current.undo())}
              >
                Undo
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
            label="Data model workbook"
            rows={PIVOT_ROWS_USED}
            testId="model-grid"
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live data model workbook"
    />
  );
}
