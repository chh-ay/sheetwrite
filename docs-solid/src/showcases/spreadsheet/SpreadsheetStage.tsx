import { errorText } from "@docs/lib/errors.js";
import type { Grid } from "@sheetwrite/core";
import { createSignal, For, onCleanup, onMount } from "solid-js";

import { Icon } from "../../components/Icon.js";
import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseKeys,
  ShowcaseStage,
  type ShowcaseStep,
  ShowcaseSteps,
} from "../layout/ShowcaseLayout.js";
import { whenNearViewport } from "../lib/near-viewport.js";
import { Button } from "../ui/Button.js";

declare global {
  interface Window {
    __sheetwriteSpreadsheetGrid?: Grid;
  }
}

/** Widths for the fold demo: Excel's ribbon at a laptop width, then a narrow window. */
const WIDTHS = [
  { id: "wide", label: "Wide", width: null },
  { id: "narrow", label: "Narrow", width: 640 },
] as const;
type WidthId = (typeof WIDTHS)[number]["id"];

/** The ribbon's keyboard model, as the shell implements it. */
const KEYS = [
  { keys: ["Tab"], does: "Reach the ribbon tabs" },
  { keys: ["←", "→"], does: "Move between tabs" },
  { keys: ["Esc"], does: "Return to the grid" },
] as const;

/** Props of {@link SpreadsheetStage}, from the page's checked data. */
export interface SpreadsheetStageProps {
  /** The last row of the Sales sheet's order table, for the AutoSum step. */
  readonly salesLastRow: number;
}

/** The walkthrough; the last step gets its fold control at render. */
function spreadsheetSteps(
  salesLastRow: number,
  foldRibbon: ShowcaseStep["control"],
): ShowcaseStep[] {
  return [
    {
      action: "Total a column",
      how: `Select Sales!G2:G${salesLastRow}, then Home › Editing › AutoSum.`,
      result: "A SUM lands under the last row.",
    },
    {
      action: "Format a region",
      how: "Pick a region cell, then Fill Color, Borders or Merge & Center.",
      result: "The format is stored on the cells and survives XLSX export.",
    },
    {
      action: "Change a price",
      how: "Edit a unit price on the Sales sheet.",
      result: "Summary recalculates across sheets.",
    },
    {
      action: "Read a note",
      how: "Point at the amber corner on Sales!G3 to read it. Select the cell and press Shift+F2 to edit.",
      result: "The note opens beside the cell. Clear the note to delete it.",
    },
    {
      action: "Use the right-click menu",
      how: "Right-click a cell, then Insert › Row above.",
      result: "Undo removes the new row.",
    },
    {
      action: "Narrow the window",
      how: "Switch between a wide and a narrow window.",
      result:
        "The ribbon turns compact, one row like Excel's simplified ribbon, and groups fold into dropdowns.",
      control: foldRibbon,
    },
  ];
}

/** The spreadsheet showcase's island: the shell around one grid, and its walkthrough. */
export function SpreadsheetStage(props: SpreadsheetStageProps) {
  let host!: HTMLDivElement;
  const [error, setError] = createSignal<string | null>(null);
  const [ready, setReady] = createSignal(false);
  const [width, setWidth] = createSignal<WidthId>("wide");

  onMount(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    const stopWaiting = whenNearViewport(host, () => {
      import("./boot.js")
        .then(({ createSpreadsheetScenario }) => {
          if (disposed) return;
          const scenario = createSpreadsheetScenario(host);
          dispose = () => {
            scenario.dispose();
            delete window.__sheetwriteSpreadsheetGrid;
          };
          return scenario.ready.then(() => {
            if (disposed) return;
            const grid = scenario.grid();
            if (grid) window.__sheetwriteSpreadsheetGrid = grid;
            setReady(true);
          });
        })
        .catch((cause: unknown) => {
          if (!disposed) setError(errorText(cause));
        });
    });
    onCleanup(() => {
      disposed = true;
      stopWaiting();
      dispose?.();
    });
  });

  const frameWidth = () => WIDTHS.find((option) => option.id === width())?.width ?? null;
  const toggle = () => setWidth(width() === "narrow" ? "wide" : "narrow");

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup title="Try it">
            <ShowcaseSteps
              steps={spreadsheetSteps(
                props.salesLastRow,
                <Button disabled={!ready()} onClick={toggle}>
                  <Icon name={width() === "narrow" ? "monitor" : "laptop"} />
                  {width() === "narrow" ? "Unfold the ribbon" : "Fold the ribbon"}
                </Button>,
              )}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup
            description="Double-click a tab to hide or show the panel."
            title="Keyboard"
          >
            <ShowcaseKeys keys={KEYS} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <div
            class="sw-spreadsheet-window"
            data-testid="spreadsheet-window"
            style={frameWidth() === null ? undefined : { "max-width": `${frameWidth()}px` }}
          >
            <div class="sw-showcase__grid" ref={host} />
          </div>
          <ActionError error={error()} />
        </>
      }
      demoActions={
        <div aria-label="Window width" class="sw-spreadsheet-widths" role="group">
          <For each={WIDTHS}>
            {(option) => (
              <Button
                aria-pressed={width() === option.id}
                data-size="sm"
                disabled={!ready()}
                onClick={() => setWidth(option.id)}
                variant="quiet"
              >
                {option.label}
              </Button>
            )}
          </For>
        </div>
      }
      demoLabel="Live spreadsheet"
      demoTitle="Northwind / 2026 sales.xlsx"
    />
  );
}
