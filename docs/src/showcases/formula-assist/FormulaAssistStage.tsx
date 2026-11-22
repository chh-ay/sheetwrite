import type {
  FormulaAssistScenario,
  FormulaAssistSnapshot,
  OPEN_CELLS,
} from "@docs/showcases/scenarios/formula-assist.js";
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

/** Props of {@link FormulaAssistStage}, from the scenario's data. */
export interface FormulaAssistStageProps {
  /** How many cells the budget leaves open for the reader to type. */
  readonly openCells: number;
}

/** The cells the controls jump to, with their labels. */
const TARGETS: readonly { readonly id: keyof typeof OPEN_CELLS; readonly label: string }[] = [
  { id: "rowTotal", label: "Finance's total" },
  { id: "share", label: "Finance's share" },
  { id: "monthTotal", label: "March's total" },
  { id: "secondRowTotal", label: "People's total" },
  { id: "secondShare", label: "People's share" },
];

/** The keys, as the side panel lists them. */
const KEYS = [
  { label: "Tab", value: "Take the whole suggestion" },
  { label: "Ctrl+→ (⌥→ on macOS)", value: "Take one word" },
  { label: "Esc", value: "Hide it until you type" },
] as const;

function Progress(props: { readonly snapshot: FormulaAssistSnapshot; readonly openCells: number }) {
  return (
    <Show
      fallback={
        <ShowcaseStatus tone="ok">
          {props.snapshot.filled} of {props.openCells} open cells filled
        </ShowcaseStatus>
      }
      when={props.snapshot.filled === 0}
    >
      <ShowcaseStatus tone="neutral">
        {props.openCells} cells are waiting for a formula
      </ShowcaseStatus>
    </Show>
  );
}

/** The formula assist showcase's island: the budget, the open cells and the keys. */
export function FormulaAssistStage(props: FormulaAssistStageProps) {
  const live = createLiveScenario<FormulaAssistScenario, FormulaAssistSnapshot>(() =>
    import("./boot.js").then(
      ({ createFormulaAssistScenario: create_formula_assist_scenario }) =>
        create_formula_assist_scenario,
    ),
  );
  const action = createScenarioAction(live.scenario);

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="Each button selects an empty cell and puts the caret in the formula bar. Type = and the rest of the formula appears."
            title="Type a formula"
          >
            <ControlActions>
              <For each={TARGETS}>
                {(target) => (
                  <ControlButton
                    disabled={action.disabled()}
                    icon="function"
                    onClick={() =>
                      void action.run(target.label, (current) => current.focusCell(target.id))
                    }
                  >
                    {target.label}
                  </ControlButton>
                )}
              </For>
            </ControlActions>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Excel's own keys keep working; these act only while a suggestion shows."
            title="Keys"
          >
            <ShowcaseReadout items={KEYS} />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup description="Empty the open cells again." title="Start over">
            <Show when={live.snapshot()}>
              {(snapshot) => <Progress openCells={props.openCells} snapshot={snapshot()} />}
            </Show>
            <ControlActions>
              <ControlButton
                disabled={action.disabled()}
                icon="undo"
                onClick={() => void action.run("Reset", (current) => current.reset())}
              >
                Reset
              </ControlButton>
            </ControlActions>
            <ActionError error={action.error()} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <DemoGrid host={live.host} label="Budget workbook" testId="formula-assist-grid" />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live budget with formula assist"
    />
  );
}
