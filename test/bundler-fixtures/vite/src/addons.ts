// A page that installs every add-on at startup with static imports. Each
// add-on's heavy code must still load lazily, outside this page's initial graph.
import { chartsAddon } from "@sheetwrite/charts";
import { createGrid, initSheetwrite } from "@sheetwrite/core";
import { externalLinksAddon } from "@sheetwrite/core/external-links";
import { functionsAddon } from "@sheetwrite/core/functions";
import { historyAddon } from "@sheetwrite/core/history";
import { queriesAddon } from "@sheetwrite/queries";
import { xlsxAddon } from "@sheetwrite/xlsx";

await initSheetwrite({
  addons: [
    chartsAddon(),
    xlsxAddon(),
    queriesAddon(),
    functionsAddon(),
    historyAddon(),
    externalLinksAddon(),
  ],
});

const host = document.querySelector<HTMLElement>("#grid");
if (!host) throw new Error("missing grid host");

createGrid(host, {
  workbook: {
    activeSheet: "s1",
    sheets: [{ id: "s1", name: "Sheet1", rowCount: 2, columns: [] }],
  },
});
