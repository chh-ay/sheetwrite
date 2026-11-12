import { errorText } from "@docs/lib/errors.js";
import type { StyleCommand } from "@docs/showcases/scenarios/formatting.js";
import { createSignal, For, onCleanup, onMount } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ActionError, pendingProps, useAction } from "../../lib/use-action.js";
import { ShowcaseControlGroup, ShowcaseStage } from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import { Button } from "../ui/Button.js";
import type { FormattingBudget } from "./boot.js";
import { roundTripReport, setRoundTripReport } from "./store.js";

/** A family no browser has, to show the fallback to the theme font. */
export const UNAVAILABLE_FONT = "Northstar Unavailable Font";
export const FONT_FAMILIES = ["Arial", "Georgia", "Courier New", UNAVAILABLE_FONT] as const;

/** Props of {@link FormattingStage}, from the scenario's checked data. */
export interface FormattingStageProps {
  readonly formats: readonly { readonly label: string; readonly code: string }[];
  readonly styleCommands: readonly StyleCommand[];
}

/** The formatting showcase's island: the budget, its style controls and the XLSX proof. */
export function FormattingStage(props: FormattingStageProps) {
  let host!: HTMLDivElement;
  let formulaHost!: HTMLDivElement;
  const [budget, setBudget] = createSignal<FormattingBudget | null>(null);
  const [status, setStatus] = createSignal("Loading the budget…");
  const [bootError, setBootError] = createSignal<string | null>(null);
  const [format, setFormat] = createSignal("$#,##0.00");
  const action = useAction();

  onMount(() => {
    let disposed = false;
    const stopWaiting = whenNearViewport(host, () => {
      import("./boot.js")
        .then(({ startFormattingBudget }) => startFormattingBudget(host, formulaHost))
        .then((started) => {
          if (disposed) return started.dispose();
          setBudget(started);
          setStatus("Ready · editing B3:C3");
        })
        .catch((cause: unknown) => {
          if (!disposed) setBootError(errorText(cause));
        });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      budget()?.dispose();
    });
  });

  const run = (command: (current: FormattingBudget) => unknown) => {
    void action.run(
      () => {
        const current = budget();
        if (!current) throw new Error("The budget is not ready yet");
        setRoundTripReport(null);
        return command(current);
      },
      (cause) => `Formatting action failed: ${errorText(cause)}`,
    );
  };
  const disabled = () => budget() === null || action.pending;
  const report = roundTripReport;

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description={
              <>
                Controls style the revenue pair <strong>B3:C3</strong>; other cells stay a reference
                palette.
              </>
            }
            title="Emphasis and decoration"
          >
            <div class="sw-formatting-buttons">
              <For each={props.styleCommands}>
                {(command) => (
                  <Button
                    data-size="sm"
                    disabled={disabled()}
                    onClick={() =>
                      run((current) => {
                        current.applyStyleCommand(command);
                        setStatus(`${command} applied · B3:C3`);
                      })
                    }
                  >
                    {command}
                  </Button>
                )}
              </For>
            </div>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="General opts out of the column's currency format. Column G shows every format at once."
            title="Number format"
          >
            <div class="sw-formatting-buttons">
              <For each={props.formats}>
                {(option) => (
                  <Button
                    aria-pressed={format() === option.code}
                    data-size="sm"
                    disabled={disabled()}
                    onClick={() =>
                      run((current) => {
                        current.applyNumberFormat(option.code);
                        setFormat(option.code);
                        setStatus(`${option.label} applied · B3:C3`);
                      })
                    }
                  >
                    {option.label}
                  </Button>
                )}
              </For>
            </div>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Font family">
            <div class="sw-formatting-buttons">
              <For each={FONT_FAMILIES}>
                {(family) => (
                  <Button
                    data-size="sm"
                    disabled={disabled()}
                    onClick={() =>
                      run((current) => {
                        current.styleTarget({ fontFamily: family });
                        setStatus(`${family} applied · B3:C3`);
                      })
                    }
                  >
                    {family === UNAVAILABLE_FONT ? "Theme fallback" : family}
                  </Button>
                )}
              </For>
            </div>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Placement and size">
            <div class="sw-formatting-buttons">
              <For each={["left", "center", "right"] as const}>
                {(align) => (
                  <Button
                    data-size="sm"
                    disabled={disabled()}
                    onClick={() => run((current) => current.styleTarget({ align }))}
                  >
                    Align {align}
                  </Button>
                )}
              </For>
              <For each={["top", "middle", "bottom"] as const}>
                {(verticalAlign) => (
                  <Button
                    data-size="sm"
                    disabled={disabled()}
                    onClick={() => run((current) => current.styleTarget({ verticalAlign }))}
                  >
                    {verticalAlign}
                  </Button>
                )}
              </For>
              <Button
                data-size="sm"
                disabled={disabled()}
                onClick={() => run((current) => current.styleTarget({ fontSize: 18 }))}
              >
                18 px
              </Button>
              <Button
                data-size="sm"
                disabled={disabled()}
                onClick={() => run((current) => current.styleTarget({ wrap: true }))}
              >
                Wrap
              </Button>
            </div>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Export the current edits, decode them with @sheetwrite/xlsx and compare styles, column defaults and conditional rules."
            title="Prove it in XLSX"
          >
            <Button
              disabled={disabled()}
              {...pendingProps(action.pending)}
              onClick={() =>
                run(async (current) => {
                  setRoundTripReport(await current.roundTrip());
                })
              }
              variant="primary"
            >
              <Icon name="refresh" />
              Export, then re-import XLSX
            </Button>
            <output
              aria-live="polite"
              class="sw-formatting-report"
              data-testid="formatting-roundtrip"
            >
              {report()
                ? `${report()?.differences.length === 0 ? "Verified" : "Mismatch"} · ${report()?.checkedCells} cells compared · ${report()?.byteLength.toLocaleString("en-US")} XLSX bytes · ${report()?.differences.length} differences · ${report()?.warnings.length} warnings`
                : "Not run yet. The proof uses your current workbook, including live edits."}
            </output>
            <ActionError error={bootError() ?? action.error} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <div
            class="sw-formatting-formula"
            ref={(element) => {
              formulaHost = element;
            }}
          />
          <div
            aria-label="Operating budget"
            class="sw-formatting-grid"
            ref={(element) => {
              host = element;
            }}
          />
          <p class="sw-formatting-caption">
            Negative variance is highlighted by a live conditional rule. Edit the actuals to change
            it.
          </p>
        </>
      }
      demoActions={
        <span class="sw-formatting-status" data-testid="formatting-status" role="status">
          {status()}
        </span>
      }
      demoLabel="Live budget"
      demoTitle="Northstar / Finance"
    />
  );
}
