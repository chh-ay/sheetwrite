import type { Grid } from "@sheetwrite/core";
import { useEffect, useRef, useState } from "react";

import { Icon } from "../components/Icon.js";
import { errorText } from "../lib/errors.js";
import { ActionError } from "../lib/use-action.js";
import {
  ShowcaseControlGroup,
  ShowcaseKeys,
  ShowcaseLayout,
  ShowcaseSection,
  type ShowcaseStep,
  ShowcaseSteps,
} from "./layout/ShowcaseLayout.js";
import {
  ANALYSIS_WORKBOOK_TITLE,
  type AnalysisScenario,
  createAnalysisScenario,
} from "./scenarios/analysis.js";
import {
  DIP_REGION,
  LAUNCH_MONTH,
  LAUNCH_PRODUCT,
  PRICE_CHANGE_MONTH,
  PRICE_CHANGE_RATE,
  STORY_MONTHS,
  STORY_ORDER_ROWS,
} from "./scenarios/orders-story.js";
import AnalysisSetupSnippet from "./snippets/analysis-setup.mdx";
import { DemoButton } from "./ui/DemoButton.js";

import "@sheetwrite/core/styles.css";
import "@sheetwrite/core/shell.css";

declare global {
  interface Window {
    __sheetwriteAnalysisGrid?: Grid;
  }
}

/** `2026-03` as "March 2026", for the story text. */
function monthName(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (index ?? 1) - 1)).toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const PRICE_CHANGE_PERCENT = Math.round(PRICE_CHANGE_RATE * 100);

/** Chart keys, as the object layer implements them. */
const KEYS = [
  { keys: ["Enter"], does: "Open the selected chart's panel" },
  { keys: ["←", "→", "↑", "↓"], does: "Move the chart by one pixel" },
  { keys: ["Shift", "↓"], does: "Move the chart by one cell" },
  { keys: ["Delete"], does: "Remove the chart" },
  { keys: ["Esc"], does: "Return to the grid" },
] as const;

/** The walkthrough; the second step gets its "Go to the order" control at render. */
function analysisSteps(goToOrder: ShowcaseStep["control"]): ShowcaseStep[] {
  return [
    {
      action: "Find the dip",
      how: `Read the ${DIP_REGION} line in the Summary chart.`,
      result: `It falls in ${monthName(PRICE_CHANGE_MONTH)}, after a ${PRICE_CHANGE_PERCENT}% price rise, and recovers in part.`,
    },
    {
      action: "Edit an order",
      how: `Go to an ${DIP_REGION} order from ${monthName(PRICE_CHANGE_MONTH)}, type a new revenue and press Enter.`,
      result: "The pivot's total for that month and the chart move together.",
      control: goToOrder,
    },
    {
      action: "Rearrange the pivot",
      how: "Select a cell in the pivot to open its field list. Move Product to Rows with the field's actions menu.",
      result: `The pivot regroups. ${LAUNCH_PRODUCT} starts in ${monthName(LAUNCH_MONTH)}. Undo puts it back.`,
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

export default function AnalysisShowcase() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scenarioRef = useRef<AnalysisScenario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scenario = createAnalysisScenario(host);
    scenarioRef.current = scenario;
    let disposed = false;
    scenario.ready
      .then(() => {
        if (disposed) return;
        const grid = scenario.grid();
        if (grid) window.__sheetwriteAnalysisGrid = grid;
        setReady(grid !== null);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(errorText(cause));
      });

    return () => {
      disposed = true;
      scenario.dispose();
      scenarioRef.current = null;
      delete window.__sheetwriteAnalysisGrid;
    };
  }, []);

  const goToDipOrder = () => {
    const scenario = scenarioRef.current;
    const grid = scenario?.grid();
    const addr = scenario?.dipOrder();
    if (!grid || !addr) return;

    grid.setActiveSheet(addr.sheet);
    grid.setSelection({ kind: "cell", addr });
    grid.scrollToCell(addr);
    // Typing then edits the order, so the step works without a click.
    hostRef.current?.querySelector<HTMLElement>(".sheetwrite")?.focus();
  };

  return (
    <ShowcaseLayout
      code={{ title: "How it is built", Snippet: AnalysisSetupSnippet }}
      controls={
        <>
          <ShowcaseControlGroup title="Try it">
            <ShowcaseSteps
              steps={analysisSteps(
                <DemoButton disabled={!ready} onClick={goToDipOrder}>
                  <Icon name="search" />
                  Go to the order
                </DemoButton>,
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
          <div className="sw-showcase__grid" data-testid="analysis-window" ref={hostRef} />
          <ActionError error={error} />
        </>
      }
      demoLabel="Live analysis workbook"
      demoTitle={ANALYSIS_WORKBOOK_TITLE}
      eyebrow="Analysis"
      facts={[
        { label: "Orders", value: STORY_ORDER_ROWS.toLocaleString("en") },
        { label: "Months", value: String(STORY_MONTHS) },
        { label: "Pivot", value: "Revenue by month and region" },
      ]}
      guide={{ href: "/docs/features/analysis/pivot-tables/", label: "Read the pivot table guide" }}
      id="analysis"
      task="A pivot table and a live chart over two years of orders. Edit any order and both update in place; rearrange the pivot from its field list."
      title="Pivot it, chart it, then change the data"
    >
      <ShowcaseSection id="analysis-chart" title="The chart reads cells">
        <p>
          The chart reads cells, not the pivot: point it at any range, and it redraws when those
          cells change. Pivots over related tables and measures live on the{" "}
          <a href="/showcases/data-model/">data model showcase</a>.
        </p>
      </ShowcaseSection>
    </ShowcaseLayout>
  );
}
