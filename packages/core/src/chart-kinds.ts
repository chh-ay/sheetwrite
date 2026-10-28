// The chart kinds as the UI shows them. The ribbon (first load) and the chart
// panel (loaded on first use) share this table, so it lives outside panels/.

import type { IconName } from "./icons/icon-names.js";
import type { ChartKind } from "./types/chart.js";

export interface ChartKindEntry {
  readonly kind: ChartKind;
  readonly label: string;
  readonly icon: IconName;
}

/** Every chart kind, in the order the ribbon menu and the kind picker list them. */
export const CHART_KINDS: readonly ChartKindEntry[] = [
  { kind: "column", label: "Column", icon: "chartColumn" },
  { kind: "bar", label: "Bar", icon: "chartBar" },
  { kind: "line", label: "Line", icon: "chartLine" },
  { kind: "area", label: "Area", icon: "chartArea" },
  { kind: "pie", label: "Pie", icon: "chartPie" },
  { kind: "doughnut", label: "Doughnut", icon: "chartDoughnut" },
  { kind: "scatter", label: "Scatter", icon: "chartScatter" },
];
