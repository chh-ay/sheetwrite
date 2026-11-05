import { useState, type FormEvent } from "react";

import { ActionError } from "../lib/use-action.js";
import { ControlActions, ControlButton, DemoGrid } from "./feature-controls.js";
import {
  ShowcaseControlGroup,
  ShowcaseLayout,
  ShowcaseReadout,
  ShowcaseSection,
} from "./layout/ShowcaseLayout.js";
import {
  createFunctionsScenario,
  FAMILIES,
  FUNCTION_NAMES,
  type FamilyId,
  type FunctionsScenario,
  type FunctionsSnapshot,
} from "./scenarios/functions.js";
import FunctionsSnippet from "./snippets/functions.mdx";
import { DemoSelect } from "./ui/DemoSelect.js";
import { useLiveScenario, useScenarioAction } from "./use-live-scenario.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

const familyOf = (id: FamilyId | undefined) =>
  FAMILIES.find((family) => family.id === id) ?? FAMILIES[0];

/** A typed number stays a number; anything else is text, as a cell entry would be. */
const parsedInput = (text: string) =>
  text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text;

function InputForm({
  scenario,
  snapshot,
}: {
  readonly scenario: FunctionsScenario | null;
  readonly snapshot: FunctionsSnapshot | null;
}) {
  const { run, disabled, error } = useScenarioAction(scenario);
  const family = familyOf(snapshot?.family);
  const [first] = family.inputs;
  const [draft, setDraft] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run("The input", (current) => current.setFirstInput(parsedInput(draft)));
  };

  return (
    <form className="sw-feature-input" onSubmit={submit}>
      <label>
        <span>
          {first.label} <code>B2</code>
        </span>
        <input
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={String(first.value)}
          value={draft}
        />
      </label>
      <ControlActions>
        <ControlButton disabled={disabled || draft.trim() === ""} icon="check" type="submit">
          Set {first.label.toLowerCase()}
        </ControlButton>
      </ControlActions>
      <ActionError error={error} />
    </form>
  );
}

function FunctionsControls({
  scenario,
  snapshot,
}: {
  readonly scenario: FunctionsScenario | null;
  readonly snapshot: FunctionsSnapshot | null;
}) {
  const { run, disabled } = useScenarioAction(scenario);
  const family = familyOf(snapshot?.family);

  return (
    <>
      <ShowcaseControlGroup title="Function family" description={family.summary}>
        <DemoSelect
          disabled={disabled}
          label="Family"
          onValueChange={(value) =>
            void run("The family", (current) => current.showFamily(value as FamilyId))
          }
          options={FAMILIES.map((entry) => ({ label: entry.label, value: entry.id }))}
          value={family.id}
        />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Change an input"
        description="Every formula on the sheet that reads the input recalculates."
      >
        <InputForm key={family.id} scenario={scenario} snapshot={snapshot} />
      </ShowcaseControlGroup>
      <ShowcaseControlGroup
        title="Live results"
        description="Read from the engine after each change."
      >
        <ShowcaseReadout
          items={(snapshot?.results ?? []).map((result) => ({
            label: result.name,
            value: <span data-testid={`function-result-${result.name}`}>{result.value}</span>,
          }))}
        />
      </ShowcaseControlGroup>
    </>
  );
}

export default function FunctionsShowcase() {
  const { hostRef, scenario, snapshot, error } = useLiveScenario(createFunctionsScenario);

  return (
    <ShowcaseLayout
      code={{ title: "The code behind it", Snippet: FunctionsSnippet }}
      controls={<FunctionsControls scenario={scenario} snapshot={snapshot} />}
      demo={
        <>
          <DemoGrid hostRef={hostRef} label="Function workbook" testId="functions-grid" />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live function workbook"
      eyebrow="Formulas"
      facts={[
        { label: "Families", value: FAMILIES.length.toLocaleString("en") },
        { label: "Functions shown", value: FUNCTION_NAMES.length.toLocaleString("en") },
        { label: "Engine", value: "@sheetwrite/formulas" },
      ]}
      guide={{ href: "/docs/reference/formula-functions/", label: "Browse every function" }}
      id="functions"
      task={
        <>
          Pick a family of Excel functions that 0.7.0 adds, change an input, and watch each result
          recalculate. Column F reads every formula back with <code>FORMULATEXT</code>.
        </>
      }
      title="New Excel functions, calculated live"
    >
      <ShowcaseSection id="functions-notes" title="Where they run">
        <ul>
          <li>
            Engineering, financial, the Excel 2007 statistics names, byte text and{" "}
            <code>GETPIVOTDATA</code> run in the full engine, <code>@sheetwrite/formulas</code>.
          </li>
          <li>
            <code>LOOKUP</code>, <code>TRIMRANGE</code>, the information functions and the new math
            functions run in both engines.
          </li>
          <li>
            A reference to another workbook keeps its text, moves when you fill it, and shows{" "}
            <code>#REF!</code> until the workbook has values for the link.
          </li>
        </ul>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
