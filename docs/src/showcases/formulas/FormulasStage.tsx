import { errorText } from "@docs/lib/errors.js";
import {
  ANALYSIS_SHEET_ID,
  FORMULA_PANELS,
  type FormulaPanel,
  ORDER_ROWS,
  ORDERS_SHEET_ID,
  PLAYGROUND_EXAMPLE,
} from "@docs/showcases/scenarios/formulas.js";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { HighlightedCode } from "../../components/HighlightedCode.js";
import { Icon } from "../../components/Icon.js";
import { ShowcaseControlGroup, ShowcaseStage } from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import { Button } from "../ui/Button.js";
import type { FormulasWorkbook, Recalc } from "./boot.js";

type GridState = "loading" | "ready" | "error";

/** Props of {@link FormulasStage}: each panel's A1 address and the playground's. */
export interface FormulasStageProps {
  readonly addresses: Readonly<Record<string, string>>;
  readonly playgroundAddress: string;
}

const SHEETS = [
  { id: ANALYSIS_SHEET_ID, label: "Analysis" },
  { id: ORDERS_SHEET_ID, label: `Orders · ${ORDER_ROWS.toLocaleString("en")} rows` },
];

/** The formulas showcase's island: the order ledger, its dashboard and the playground. */
export function FormulasStage(props: FormulasStageProps) {
  let host!: HTMLDivElement;
  const [workbook, set_workbook] = createSignal<FormulasWorkbook | null>(null);
  const [state, set_state] = createSignal<GridState>("loading");
  const [error, set_error] = createSignal("");
  const [active_sheet, set_active_sheet] = createSignal<string>(ANALYSIS_SHEET_ID);
  const [selected, set_selected] = createSignal<FormulaPanel["id"]>(FORMULA_PANELS[0].id);
  const [promoted, set_promoted] = createSignal(false);
  const [recalc, set_recalc] = createSignal<Recalc | null>(null);
  const [draft, set_draft] = createSignal(PLAYGROUND_EXAMPLE);
  const [playground, set_playground] = createSignal<{ result: string; ms: number } | null>(null);
  const [revision, set_revision] = createSignal(0);

  onMount(() => {
    let disposed = false;
    const stop_waiting = whenNearViewport(host, () => {
      import("./boot.js")
        .then(({ startFormulasWorkbook: start_formulas_workbook }) =>
          start_formulas_workbook(
            host,
            {
              onFollow: set_selected,
              onActiveSheet: set_active_sheet,
              onChange: () => set_revision((value) => value + 1),
            },
            () => disposed,
          ),
        )
        .then((started) => {
          if (started === null) return;
          if (disposed) return started.dispose();
          set_workbook(started);
          set_recalc(started.firstRecalc);
          set_state("ready");
        })
        .catch((cause: unknown) => {
          if (disposed) return;
          set_state("error");
          set_error(errorText(cause));
        });
    });
    onCleanup(() => {
      disposed = true;
      stop_waiting();
      workbook()?.dispose();
    });
  });

  const ready = () => state() === "ready";
  const panel = () =>
    FORMULA_PANELS.find((candidate) => candidate.id === selected()) ?? FORMULA_PANELS[0];
  const panel_value = createMemo(() => {
    revision();
    const current = workbook();
    return current === null ? "—" : current.describeResult(panel().row, panel().col);
  });

  const show_panel = (next: FormulaPanel) => {
    set_selected(next.id);
    const grid = workbook()?.grid;
    if (!grid) return;
    grid.setActiveSheet(ANALYSIS_SHEET_ID);
    const addr = { sheet: ANALYSIS_SHEET_ID, row: next.row, col: next.col };
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
  };
  const toggle_promotion = () => {
    const result = workbook()?.togglePromotion();
    if (!result) return;
    set_recalc(result);
    set_promoted(workbook()?.promoted() ?? false);
  };
  const switch_sheet = (sheet: string) => {
    workbook()?.grid.setActiveSheet(sheet);
    set_active_sheet(sheet);
  };

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup
            description="One transaction rewrites every APAC order; every answer follows."
            title="Change the data"
          >
            <Button
              aria-pressed={promoted()}
              data-testid="formulas-promotion"
              disabled={!ready()}
              onClick={toggle_promotion}
              variant="primary"
            >
              <Icon name={promoted() ? "undo" : "bolt"} />
              {promoted() ? "Undo the APAC promotion" : "Run an APAC promotion: +20% units"}
            </Button>
            <output aria-live="polite" class="sw-fx-recalc" data-testid="formulas-recalc">
              <Show
                fallback={
                  <Show fallback={<span>Loading the full formula engine…</span>} when={recalc()}>
                    {(current) => (
                      <>
                        <strong>{current().ms.toFixed(0)} ms</strong>
                        <span>
                          {current().label}
                          {current().cells > 0
                            ? ` · ${current().cells.toLocaleString("en")} cells`
                            : ""}
                        </span>
                      </>
                    )}
                  </Show>
                }
                when={state() === "error"}
              >
                <span>The engine did not start: {error()}</span>
              </Show>
            </output>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Jump to a formula and read it."
            title="Formula recipes"
          >
            <ol aria-label="Formula recipes" class="sw-fx-recipes">
              <For each={FORMULA_PANELS}>
                {(candidate) => (
                  <li>
                    <Button
                      aria-pressed={candidate.id === selected()}
                      data-size="sm"
                      data-testid={`formulas-recipe-${candidate.id}`}
                      disabled={!ready()}
                      onClick={() => show_panel(candidate)}
                      variant="quiet"
                    >
                      <code>{props.addresses[candidate.id]}</code>
                      {candidate.title}
                    </Button>
                  </li>
                )}
              </For>
            </ol>
            <article class="sw-fx-detail" data-testid="formulas-detail">
              <p class="sw-fx-detail__kicker">
                {props.addresses[panel().id]} · {panel().families.join(" · ")} · first value{" "}
                <span data-testid="formulas-detail-value">{panel_value()}</span>
              </p>
              <h3>{panel().title}</h3>
              <p>{panel().explanation}</p>
              <HighlightedCode code={panel().formula} language="formula" />
            </article>
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title={`Try your own formula in ${props.playgroundAddress}`}>
            <form
              class="sw-fx-try"
              onSubmit={(event) => {
                event.preventDefault();
                const result = workbook()?.runDraft(draft());
                if (result) set_playground(result);
              }}
            >
              <input
                aria-label="Formula"
                autocomplete="off"
                data-testid="formulas-draft"
                onInput={(event) => set_draft(event.currentTarget.value)}
                spellcheck={false}
                value={draft()}
              />
              <Button data-testid="formulas-run" disabled={!ready()} type="submit">
                <Icon name="function" />
                Calculate
              </Button>
              <output aria-live="polite" data-testid="formulas-draft-result">
                {playground()
                  ? `${playground()?.result} · ${playground()?.ms.toFixed(1)} ms`
                  : "Orders columns A–H: month, region, product, channel, units, price, revenue, order code."}
              </output>
            </form>
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <div
          aria-label="Sales analysis workbook"
          class="sw-showcase__grid"
          data-state={state()}
          data-testid="formulas-grid"
          ref={(element) => {
            host = element;
          }}
          role="group"
        />
      }
      demoActions={
        <div aria-label="Sheet" class="sw-fx-sheets" role="group">
          <For each={SHEETS}>
            {(sheet) => (
              <Button
                aria-pressed={active_sheet() === sheet.id}
                data-size="sm"
                disabled={!ready()}
                onClick={() => switch_sheet(sheet.id)}
                variant="quiet"
              >
                {sheet.label}
              </Button>
            )}
          </For>
        </div>
      }
      demoLabel="Live formula workbook"
      demoTitle="Sales analysis.xlsx"
    />
  );
}
