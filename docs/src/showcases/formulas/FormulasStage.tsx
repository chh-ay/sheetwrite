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
  const [workbook, setWorkbook] = createSignal<FormulasWorkbook | null>(null);
  const [state, setState] = createSignal<GridState>("loading");
  const [error, setError] = createSignal("");
  const [activeSheet, setActiveSheet] = createSignal<string>(ANALYSIS_SHEET_ID);
  const [selected, setSelected] = createSignal<FormulaPanel["id"]>(FORMULA_PANELS[0].id);
  const [promoted, setPromoted] = createSignal(false);
  const [recalc, setRecalc] = createSignal<Recalc | null>(null);
  const [draft, setDraft] = createSignal(PLAYGROUND_EXAMPLE);
  const [playground, setPlayground] = createSignal<{ result: string; ms: number } | null>(null);
  const [revision, setRevision] = createSignal(0);

  onMount(() => {
    let disposed = false;
    const stopWaiting = whenNearViewport(host, () => {
      import("./boot.js")
        .then(({ startFormulasWorkbook }) =>
          startFormulasWorkbook(
            host,
            {
              onFollow: setSelected,
              onActiveSheet: setActiveSheet,
              onChange: () => setRevision((value) => value + 1),
            },
            () => disposed,
          ),
        )
        .then((started) => {
          if (started === null) return;
          if (disposed) return started.dispose();
          setWorkbook(started);
          setRecalc(started.firstRecalc);
          setState("ready");
        })
        .catch((cause: unknown) => {
          if (disposed) return;
          setState("error");
          setError(errorText(cause));
        });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      workbook()?.dispose();
    });
  });

  const ready = () => state() === "ready";
  const panel = () =>
    FORMULA_PANELS.find((candidate) => candidate.id === selected()) ?? FORMULA_PANELS[0];
  const panelValue = createMemo(() => {
    revision();
    const current = workbook();
    return current === null ? "—" : current.describeResult(panel().row, panel().col);
  });

  const showPanel = (next: FormulaPanel) => {
    setSelected(next.id);
    const grid = workbook()?.grid;
    if (!grid) return;
    grid.setActiveSheet(ANALYSIS_SHEET_ID);
    const addr = { sheet: ANALYSIS_SHEET_ID, row: next.row, col: next.col };
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
  };
  const togglePromotion = () => {
    const result = workbook()?.togglePromotion();
    if (!result) return;
    setRecalc(result);
    setPromoted(workbook()?.promoted() ?? false);
  };
  const switchSheet = (sheet: string) => {
    workbook()?.grid.setActiveSheet(sheet);
    setActiveSheet(sheet);
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
              onClick={togglePromotion}
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
                      onClick={() => showPanel(candidate)}
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
                <span data-testid="formulas-detail-value">{panelValue()}</span>
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
                if (result) setPlayground(result);
              }}
            >
              <input
                aria-label="Formula"
                autocomplete="off"
                data-testid="formulas-draft"
                onInput={(event) => setDraft(event.currentTarget.value)}
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
          role="grid"
        />
      }
      demoActions={
        <div aria-label="Sheet" class="sw-fx-sheets" role="group">
          <For each={SHEETS}>
            {(sheet) => (
              <Button
                aria-pressed={activeSheet() === sheet.id}
                data-size="sm"
                disabled={!ready()}
                onClick={() => switchSheet(sheet.id)}
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
