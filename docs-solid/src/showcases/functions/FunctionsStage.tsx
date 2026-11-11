import type {
  FamilyId,
  FunctionsScenario,
  FunctionsSnapshot,
} from "@docs/showcases/scenarios/functions.js";
import { createSignal, Show } from "solid-js";

import { Select } from "../../components/Select.js";
import { ActionError } from "../../lib/use-action.js";
import { ShowcaseControlGroup, ShowcaseReadout, ShowcaseStage } from "../layout/ShowcaseLayout.js";
import { createLiveScenario, createScenarioAction } from "../lib/live-scenario.js";
import { ControlActions, ControlButton, DemoGrid } from "../ui/feature-controls.js";

/** One family as the panel shows it. */
export interface FunctionFamilyChoice {
  readonly id: FamilyId;
  readonly label: string;
  readonly summary: string;
  readonly firstInput: { readonly label: string; readonly value: string | number };
  readonly formulaNames: readonly string[];
}

/** Props of {@link FunctionsStage}. The route passes the scenario's data, so the island imports no scenario code before its grid loads. */
export interface FunctionsStageProps {
  readonly families: readonly FunctionFamilyChoice[];
  /** The family shown before the scenario reports one. */
  readonly firstFamily: FunctionFamilyChoice;
  readonly rowsUsed: number;
}

type Family = FunctionFamilyChoice;
type ScenarioAction = ReturnType<typeof createScenarioAction<FunctionsScenario>>;

/** A typed number stays a number; anything else is text, as a cell entry would be. */
const parsedInput = (text: string) =>
  text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text;

/** The first input of the shown family, set as typing into B2 would. */
function InputForm(props: { readonly family: Family; readonly action: ScenarioAction }) {
  const first = () => props.family.firstInput;
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
export function FunctionsStage(props: FunctionsStageProps) {
  const familyOf = (id: FamilyId | undefined): Family =>
    props.families.find((family) => family.id === id) ?? props.firstFamily;
  const live = createLiveScenario<FunctionsScenario, FunctionsSnapshot>(() =>
    import("./boot.js").then(({ createFunctionsScenario }) => createFunctionsScenario),
  );
  const action = createScenarioAction(live.scenario);
  const family = () => familyOf(live.snapshot()?.family);
  // Before the engine is ready, each row holds its place with "…".
  const results = () =>
    live.snapshot()?.results ?? family().formulaNames.map((name) => ({ name, value: "…" }));

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
              options={props.families.map((entry) => ({ label: entry.label, value: entry.id }))}
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
            rows={props.rowsUsed}
            testId="functions-grid"
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live function workbook"
    />
  );
}
