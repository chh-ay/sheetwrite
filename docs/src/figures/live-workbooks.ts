import type { ColumnarData, Workbook } from "@sheetwrite/core";

/** The document a `<LiveGrid name>` mounts: a workbook and its first sheet's values. */
export interface LiveWorkbook {
  workbook: Workbook;
  data: ColumnarData;
}

/**
 * The workbooks of the live grids on docs pages, by name. Each loads only
 * when its grid scrolls into view.
 */
export const LIVE_WORKBOOKS: Readonly<Record<string, () => LiveWorkbook>> = {
  /** The Sales sheet of "Your first grid", with its total. */
  "first-grid": () => ({
    workbook: {
      activeSheet: "sales",
      sheets: [
        {
          id: "sales",
          name: "Sales",
          rowCount: 4,
          columns: [
            { key: "product", header: "Product", width: 180, type: "text" },
            { key: "amount", header: "Amount", width: 100, type: "number" },
          ],
        },
      ],
    },
    data: {
      rowCount: 4,
      columns: {
        product: ["Notebook", "Pen", "Folder", null],
        amount: [12, 4, 9, null],
      },
    },
  }),
};
