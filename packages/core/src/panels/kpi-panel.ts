// Insert › Dashboard › KPI Card: choose a data model measure. The card shows
// its value in the filter context of the dashboard's slicers (#231).

import { firstFreeBox } from "../dashboard/dashboard-layout.js";
import type { SheetId } from "../types/coordinates.js";
import type { DashboardItem } from "../types/dashboard.js";
import type { Grid, GridPanel } from "../types/grid.js";
import { rejectionMessage } from "./panel-dom.js";

/** Width and height, in dashboard cells, of a new KPI card. */
const KPI_BOX = { w: 3, h: 3 } as const;

/** A KPI card for measure `measure` on `sheet`, in the first place still free. */
function kpiItem(grid: Grid, sheet: SheetId, measure: string): DashboardItem {
  const items =
    grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)?.dashboard?.items ??
    [];
  const ids = new Set(items.map((item) => item.id));
  let number = 1;
  while (ids.has(`kpi-${number}`)) number += 1;
  return {
    id: `kpi-${number}`,
    box: firstFreeBox(items, KPI_BOX.w, KPI_BOX.h),
    kind: "kpi",
    measure,
  };
}

/** The Insert KPI Card panel for the dashboard `sheet`. */
export function kpiPanel(grid: Grid, sheet: SheetId): GridPanel {
  return {
    title: "Insert KPI Card",
    render(body) {
      const form = document.createElement("form");
      const measures = grid.store.getWorkbook().dataModel?.measures ?? [];
      const label = document.createElement("label");
      label.textContent = "Measure";
      const select = document.createElement("select");
      select.className = "sheetwrite-panel-control";
      for (const measure of measures) select.add(new Option(measure.name, measure.id));
      label.appendChild(select);

      const status = document.createElement("p");
      status.className = "sheetwrite-panel-note";
      status.setAttribute("role", "status");
      status.textContent =
        measures.length === 0 ? "Add a measure first: a KPI card shows a measure." : "";
      const insert = document.createElement("button");
      insert.type = "submit";
      insert.className = "sheetwrite-panel-control";
      insert.textContent = "Insert";
      insert.disabled = measures.length === 0;
      form.append(label, status, insert);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const item = kpiItem(grid, sheet, select.value);
        const message = rejectionMessage(
          grid.applyTransaction({ patches: [{ op: "setDashboardItem", sheet, item }] }),
        );
        if (message !== null) {
          status.textContent = message;
          return;
        }
        grid.openPanel(null);
      });
      body.appendChild(form);
      return () => {};
    },
  };
}
