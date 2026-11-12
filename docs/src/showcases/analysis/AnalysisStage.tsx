import type { Grid } from "@sheetwrite/core";

import { Icon } from "../../components/Icon.js";
import { ActionError } from "../../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseKeys,
  ShowcaseStage,
  type ShowcaseStep,
  ShowcaseSteps,
} from "../layout/ShowcaseLayout.js";
import { createLiveScenario } from "../lib/live-scenario.js";
import type { AnalysisScenario } from "../scenarios/analysis.js";
import { Button } from "../ui/Button.js";

declare global {
  interface Window {
    __sheetwriteAnalysisGrid?: Grid;
  }
}

/** Chart keys, as the object layer implements them. */
const KEYS = [
  { keys: ["Enter"], does: "Open the selected chart's panel" },
  { keys: ["←", "→", "↑", "↓"], does: "Move the chart by one pixel" },
  { keys: ["Shift", "↓"], does: "Move the chart by one cell" },
  { keys: ["Delete"], does: "Remove the chart" },
  { keys: ["Esc"], does: "Return to the grid" },
] as const;

/** Props of {@link AnalysisStage}: the story's facts, read from the orders on the server. */
export interface AnalysisStageProps {
  readonly workbookTitle: string;
  readonly dipRegion: string;
  /** The price change's month, such as "March 2026". */
  readonly priceChangeMonth: string;
  readonly priceChangePercent: number;
  readonly launchProduct: string;
  readonly launchMonth: string;
}

/** The walkthrough; the second step gets its "Go to the order" control at render. */
function analysisSteps(
  props: AnalysisStageProps,
  goToOrder: ShowcaseStep["control"],
): ShowcaseStep[] {
  return [
    {
      action: "Find the dip",
      how: `Read the ${props.dipRegion} line in the Summary chart.`,
      result: `It falls in ${props.priceChangeMonth}, after a ${props.priceChangePercent}% price rise, and recovers in part.`,
    },
    {
      action: "Edit an order",
      how: `Go to an ${props.dipRegion} order from ${props.priceChangeMonth}, type a new revenue and press Enter.`,
      result: "The pivot's total for that month and the chart move together.",
      control: goToOrder,
    },
    {
      action: "Rearrange the pivot",
      how: "Select a cell in the pivot to open its field list. Move Product to Rows with the field's actions menu.",
      result: `The pivot regroups. ${props.launchProduct} starts in ${props.launchMonth}. Undo puts it back.`,
    },
    {
      action: "Insert a chart",
      how: "Select some of the pivot's months and regions, then open the arrow on Insert › Chart and pick Line.",
      result: "A line chart of your selection appears, and its panel changes the kind and titles.",
    },
    {
      action: "Move a chart",
      how: "Select a chart, then drag it or use the arrow keys. Right-click it to edit or delete it.",
      result: "Each move is one undo step.",
    },
  ];
}

/** The analysis showcase's island: the orders workbook with its pivot and chart. */
export function AnalysisStage(props: AnalysisStageProps) {
  let hostElement: HTMLElement | undefined;
  const live = createLiveScenario<AnalysisScenario>(
    () => import("./boot.js").then(({ createAnalysisScenario }) => createAnalysisScenario),
    {
      onReady: (scenario) => {
        const grid = scenario.grid();
        if (grid) window.__sheetwriteAnalysisGrid = grid;
      },
      onDispose: () => {
        delete window.__sheetwriteAnalysisGrid;
      },
    },
  );

  const goToDipOrder = () => {
    const scenario = live.scenario();
    const grid = scenario?.grid();
    const addr = scenario?.dipOrder();
    if (!grid || !addr) return;
    grid.setActiveSheet(addr.sheet);
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
    // Typing then edits the order, so the step works without a click.
    hostElement?.querySelector<HTMLElement>(".sheetwrite")?.focus();
  };

  return (
    <ShowcaseStage
      controls={
        <>
          <ShowcaseControlGroup title="Try it">
            <ShowcaseSteps
              steps={analysisSteps(
                props,
                <Button disabled={live.scenario()?.grid() == null} onClick={goToDipOrder}>
                  <Icon name="search" />
                  Go to the order
                </Button>,
              )}
            />
          </ShowcaseControlGroup>
          <ShowcaseControlGroup title="Keyboard">
            <ShowcaseKeys keys={KEYS} />
          </ShowcaseControlGroup>
        </>
      }
      demo={
        <>
          <div
            class="sw-showcase__grid"
            data-testid="analysis-window"
            ref={(element) => {
              hostElement = element;
              live.host(element);
            }}
          />
          <ActionError error={live.error()} />
        </>
      }
      demoLabel="Live analysis workbook"
      demoTitle={props.workbookTitle}
    />
  );
}
