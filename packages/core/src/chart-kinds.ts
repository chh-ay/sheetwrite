// The chart kinds as the UI shows them. The ribbon (first load) and the chart
// panel (loaded on first use) share this table, so it lives outside panels/.

import { CHART_KIND_LABELS } from "./chart-definition.js";
import type { IconName } from "./icons/icon-names.js";
import type { ChartKind } from "./types/chart.js";

export interface ChartKindEntry {
  readonly kind: ChartKind;
  readonly label: string;
  readonly icon: IconName;
}

/** Every chart kind, in the order the ribbon menu and the kind picker list them. */
export const CHART_KINDS: readonly ChartKindEntry[] = [
  { kind: "column", label: CHART_KIND_LABELS.column, icon: "chartColumn" },
  { kind: "bar", label: CHART_KIND_LABELS.bar, icon: "chartBar" },
  { kind: "line", label: CHART_KIND_LABELS.line, icon: "chartLine" },
  { kind: "area", label: CHART_KIND_LABELS.area, icon: "chartArea" },
  { kind: "pie", label: CHART_KIND_LABELS.pie, icon: "chartPie" },
  { kind: "doughnut", label: CHART_KIND_LABELS.doughnut, icon: "chartDoughnut" },
  { kind: "scatter", label: CHART_KIND_LABELS.scatter, icon: "chartScatter" },
];
