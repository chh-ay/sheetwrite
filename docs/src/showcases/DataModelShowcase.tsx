import type { RelationshipStatus } from "@sheetwrite/core";

import { ActionError } from "../lib/use-action.js";
import { ControlActions, ControlButton, DemoGrid } from "./feature-controls.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
  ShowcaseStatus,
  type ShowcaseStatusTone,
} from "./layout/ShowcaseLayout.js";
import {
  createDataModelScenario,
  PIVOT_ROWS_USED,
  ORDER_ROWS,
  RELATIONSHIPS,
  ROW_FIELDS,
  UNKNOWN_PRODUCT,
  type DataModelScenario,
  type DataModelSnapshot,
  type RowFieldId,
} from "./scenarios/data-model.js";
import DataModelSnippet from "./snippets/data-model.mdx";
import { DemoRadioGroup, DemoRadioItem } from "./ui/DemoRadioGroup.js";
import { useLiveScenario, useScenarioAction } from "./use-live-scenario.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

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

function RelationshipList({ snapshot }: { readonly snapshot: DataModelSnapshot | null }) {
  const readings = snapshot?.relationships ?? [];
  return (
    <ul className="sw-feature-statuses">
      {readings.map((reading) => {
        const { tone, text } = keyStatus(reading.status);
        return (
          <li data-testid={`model-relationship-${reading.id}`} key={reading.id}>
            <code>{reading.label}</code>
            <ShowcaseStatus tone={tone}>{text}</ShowcaseStatus>
          </li>
        );
      })}
    </ul>
  );
}

function DataModelControls({
  scenario,
  snapshot,
}: {
  readonly scenario: DataModelScenario | null;
  readonly snapshot: DataModelSnapshot | null;
}) {
  const { run, disabled, error } = useScenarioAction(scenario);

  return (
    <>
      <ShowcaseControlGroup
        title="Relationships"
        description="Orders point at Products and Regions by key. The engine checks the keys after every change."
      >
        <RelationshipList snapshot={snapshot} />
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="key"
            onClick={() => void run("The key change", (current) => current.duplicateProductKey())}
          >
            Repeat a product ID
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="warning"
            onClick={() => void run("The order change", (current) => current.orphanOrder())}
          >
            Order product {UNKNOWN_PRODUCT}
          </ControlButton>
          <ControlButton
            disabled={disabled}
            icon="link"
            onClick={() => void run("Relationships", (current) => current.openRelationships())}
          >
            Relationships…
          </ControlButton>
        </ControlActions>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Pivot over related tables"
        description="Group the orders by a column of a related table."
      >
        <DemoRadioGroup<RowFieldId>
          label="Pivot rows"
          onValueChange={(value) =>
            void run("The pivot change", (current) => current.setRowField(value))
          }
          value={snapshot?.rowField ?? "category"}
        >
          {ROW_FIELD_IDS.map((id) => (
            <DemoRadioItem key={id} value={id}>
              {ROW_FIELDS[id].label}
            </DemoRadioItem>
          ))}
        </DemoRadioGroup>
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="pivot"
            onClick={() => void run("The field list", (current) => current.openFieldList())}
          >
            PivotTable Fields…
          </ControlButton>
        </ControlActions>
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Formulas that read the pivot"
        description="GETPIVOTDATA reads the grand totals by data field name."
      >
        <ShowcaseReadout
          items={(snapshot?.reads ?? []).map((read) => ({
            label: read.label,
            value: <span data-testid={`model-read-${read.label}`}>{read.value}</span>,
          }))}
        />
        <ControlActions>
          <ControlButton
            disabled={disabled}
            icon="undo"
            onClick={() => void run("Undo", (current) => current.undo())}
          >
            Undo
          </ControlButton>
        </ControlActions>
        <ActionError error={error} />
      </ShowcaseControlGroup>
    </>
  );
}

export default function DataModelShowcase() {
  const { hostRef, scenario, snapshot, error } = useLiveScenario(createDataModelScenario);

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: DataModelSnippet }}
      controls={<DataModelControls scenario={scenario} snapshot={snapshot} />}
      demo={
        <>
          <DemoGrid
            hostRef={hostRef}
            label="Data model workbook"
            rows={PIVOT_ROWS_USED}
            testId="model-grid"
          />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live data model workbook"
      eyebrow="Analysis"
      facts={[
        { label: "Orders", value: ORDER_ROWS.toLocaleString("en") },
        { label: "Tables", value: "Orders, Products, Regions" },
        { label: "Relationships", value: RELATIONSHIPS.length.toLocaleString("en") },
      ]}
      guide={{ href: "/docs/features/analysis/data-model/", label: "Read the data model guide" }}
      id="data-model"
      task={
        <>
          Pivot orders by a column of a related table, with a measure that recalculates in every
          cell. Then break a key and see what the relationship and the pivot report.
        </>
      }
      title="One pivot across related tables"
    >
      <ShowcaseSection id="data-model-rules" title="How the model reads the tables">
        <ul>
          <li>
            A pivot over the model equals a pivot over Orders with each related column looked up for
            every order. An order without a matching product shows a blank row label.
          </li>
          <li>
            A repeated lookup key makes the lookup ambiguous, so the pivot shows{" "}
            <code>#VALUE!</code> until the key is unique again.
          </li>
          <li>
            The measure <code>=SUM(Orders[Amount])/COUNT(Orders[Amount])</code> is calculated again
            for each cell and total, so a total is the mean of all its orders.
          </li>
          <li>
            Relationships, measures and model pivots are saved in the workbook, undone and synced.
            Excel opens an exported file without them.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
