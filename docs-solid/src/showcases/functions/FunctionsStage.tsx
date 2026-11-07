import {
  FAMILIES,
  FAMILY_ROWS_USED,
  type FamilyId,
  type FunctionsScenario,
  type FunctionsSnapshot,
} from "@docs/showcases/scenarios/functions.js";
import { createSignal, Show } from "solid-js";

import { Select } from "../../components/Select.js";
import { ActionError } from "../../lib/use-action.js";
import { ShowcaseControlGroup, ShowcaseReadout, ShowcaseStage } from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";

type Family = (typeof FAMILIES)[number];
type ScenarioAction = ReturnType<typeof createScenarioAction<FunctionsScenario>>;

const familyOf = (id: FamilyId | undefined): Family =>
  FAMILIES.find((family) => family.id === id) ?? FAMILIES[0];

/** A typed number stays a number; anything else is text, as a cell entry would be. */
const parsedInput = (text: string) =>
  text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text;

/** The first input of the shown family, set as typing into B2 would. */
function InputForm(props: { readonly family: Family; readonly action: ScenarioAction }) {
  const first = () => props.family.inputs[0];
  const [draft, setDraft] = createSignal("");
  return (
    <form
      class="sw-feature-input"
      onSubmit={(event) => {
        event.preventDefault();
        void props.action.run("The input", (current) =>
          current.setFirstInput(parsedInput(draft())),
        );
      }}
    >
      <label>
        <span>
          {first().label} <code>B2</code>
        </span>
        <input
          disabled={props.action.disabled()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder={String(first().value)}
          value={draft()}
        />
      </label>
      <ControlActions>
        <ControlButton
          disabled={props.action.disabled() || draft().trim() === ""}
          icon="check"
          type="submit"
        >
          Set {first().label.toLowerCase()}
        </ControlButton>
      </ControlActions>
      <ActionError error={props.action.error()} />
    </form>
  );
}

/** The functions showcase's island: one sheet per family, its input and live results. */
export function FunctionsStage() {
  const live = createLiveScenario<FunctionsScenario, FunctionsSnapshot>(() =>
    import("./boot.js").then(({ createFunctionsScenario }) => createFunctionsScenario),
  );
  const action = createScenarioAction(live.scenario);
  const family = () => familyOf(live.snapshot()?.family);
  // Before the engine is ready, each row holds its place with "…".
  const results = () =>
    live.snapshot()?.results ??
    family().formulas.map((entry) => ({ name: entry.name, value: "…" }));

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup description={family().summary} title="Function family">
            <Select
              id="functions-family"
              label="Family"
              onChange={(value) =>
                void action.run("The family", (current) => current.showFamily(value as FamilyId))
              }
              options={FAMILIES.map((entry) => ({ label: entry.label, value: entry.id }))}
              value={family().id}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Every formula on the sheet that reads the input recalculates."
            title="Change an input"
          >
            <Show keyed when={family()}>
              {(shown) => <InputForm action={action} family={shown} />}
            </Show>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Read from the engine after each change."
            title="Live results"
          >
            <ShowcaseReadout
              items={results().map((result) => ({
                label: result.name,
                value: <span data-testid={`function-result-${result.name}`}>{result.value}</span>,
              }))}
            />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <DemoGrid
            host={live.host}
            label="Function workbook"
            rows={FAMILY_ROWS_USED}
            testId="functions-grid"
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live function workbook"
    />
  );
}
