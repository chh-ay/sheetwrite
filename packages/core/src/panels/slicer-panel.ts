// Insert › Filters › Slicer on a dashboard: Excel's Insert Slicers list. Each
// checked table column becomes a slicer item in the next free place, all in
// one transaction, so one undo removes them (#231).

import { firstFreeBox } from "../dashboard/dashboard-layout.js";
import type { SheetId } from "../types/coordinates.js";
import type { DashboardItem } from "../types/dashboard.js";
import type { Grid, GridPanel } from "../types/grid.js";
import { panelSection, rejectionMessage } from "./panel-dom.js";

/** Width and height, in dashboard cells, of a new slicer. */
const SLICER_BOX = { w: 3, h: 6 } as const;

/** Slicer items for `columns` on `sheet`, each in the first place still free. */
function slicerItems(
  grid: Grid,
  sheet: SheetId,
  columns: readonly { table: string; column: string }[],
): DashboardItem[] {
  const items: DashboardItem[] = [
    ...(grid.store.getWorkbook().sheets.find((candidate) => candidate.id === sheet)?.dashboard
      ?.items ?? []),
  ];
  const ids = new Set(items.map((item) => item.id));
  const added: DashboardItem[] = [];
  for (const field of columns) {
    let number = 1;
    while (ids.has(`slicer-${number}`)) number += 1;
    const item: DashboardItem = {
      id: `slicer-${number}`,
      box: firstFreeBox(items, SLICER_BOX.w, SLICER_BOX.h),
      kind: "slicer",
      field,
    };
    ids.add(item.id);
    items.push(item);
    added.push(item);
  }
  return added;
}

/** The Insert Slicers panel for the dashboard `sheet`. */
export function slicerPanel(grid: Grid, sheet: SheetId): GridPanel {
  return {
    title: "Insert Slicers",
    render(body) {
      const form = document.createElement("form");
      const tables = grid.store.getWorkbook().sheets.flatMap((owner) => owner.tables ?? []);
      // Each checkbox value is an index into `choices`.
      const choices: { table: string; column: string }[] = [];
      for (const table of tables) {
        const section = panelSection(table.name);
        for (const column of table.columns) {
          const label = document.createElement("label");
          label.className = "sheetwrite-panel-check";
          const box = document.createElement("input");
          box.type = "checkbox";
          box.value = String(choices.length);
          choices.push({ table: table.id, column: column.id });
          label.append(box, column.name);
          section.appendChild(label);
        }
        form.appendChild(section);
      }

      const status = document.createElement("p");
      status.className = "sheetwrite-panel-note";
      status.setAttribute("role", "status");
      status.textContent =
        tables.length === 0 ? "Add a table first: a slicer lists a table column." : "";
      const insert = document.createElement("button");
      insert.type = "submit";
      insert.className = "sheetwrite-panel-control";
      insert.textContent = "Insert";
      insert.disabled = tables.length === 0;
      form.append(status, insert);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const columns = [...form.querySelectorAll<HTMLInputElement>("input:checked")].flatMap(
          (box) => choices.slice(Number(box.value), Number(box.value) + 1),
        );
        if (columns.length === 0) {
          status.textContent = "Check the columns to slice by.";
          return;
        }
        const patches = slicerItems(grid, sheet, columns).map((item) => ({
          op: "setDashboardItem" as const,
          sheet,
          item,
        }));
        const message = rejectionMessage(grid.applyTransaction({ patches }));
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
