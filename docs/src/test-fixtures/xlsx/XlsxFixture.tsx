import {
  fromXlsxWorkbook,
  initSheetwrite,
  SheetwriteStore,
  toXlsxWorkbook,
  type WorkbookSnapshot,
} from "@sheetwrite/core";
import { xlsxAddon } from "@sheetwrite/xlsx";
import { createSignal, onCleanup, onMount } from "solid-js";

const snapshot: WorkbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "calc" },
  sheets: [
    {
      id: "input",
      name: "Input",
      order: 0,
      rowCount: 1,
      columns: [{ key: "value", header: "Value", width: 80, type: "number" }],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 1,
          colCount: 1,
          cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 21 } }],
        },
      ],
    },
    {
      id: "calc",
      name: "Calc",
      order: 1,
      rowCount: 1,
      columns: [{ key: "result", header: "Result", width: 80, type: "number" }],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 1,
          colCount: 1,
          cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "formula", src: "=Input!A1*2" } }],
        },
      ],
    },
  ],
};

/** A1:B5: a header and four items; the AutoFilter keeps the Qty values above 5. */
const auto_filter_snapshot: WorkbookSnapshot = {
  schemaVersion: 1,
  workbook: { activeSheet: "items" },
  sheets: [
    {
      id: "items",
      name: "Items",
      order: 0,
      rowCount: 5,
      columns: [
        { key: "item", header: "Item", width: 80, type: "text" },
        { key: "qty", header: "Qty", width: 80, type: "number" },
      ],
      autoFilter: {
        range: { sheet: "items", start: { row: 0, col: 0 }, end: { row: 4, col: 1 } },
      },
      filters: [[1, { kind: "custom", join: "and", conditions: [{ op: "gt", value: 5 }] }]],
      cells: [
        {
          startRow: 0,
          startCol: 0,
          rowCount: 5,
          colCount: 2,
          cells: (
            [
              ["Item", "Qty"],
              ["apple", 3],
              ["fig", 7],
              ["kiwi", 1],
              ["pear", 12],
            ] as const
          ).flatMap((row, row_offset) =>
            row.map((value, col_offset) => ({
              rowOffset: row_offset,
              colOffset: col_offset,
              value: { kind: "literal" as const, value },
            })),
          ),
        },
      ],
    },
  ],
};

/** JSON with every object's keys sorted, so equal values compare equal whatever their key order. */
function sorted_json(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    field !== null && typeof field === "object" && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([a], [b]) => (a < b ? -1 : 1)))
      : field,
  );
}

/**
 * Write a filtered store to XLSX and read it back: the AutoFilter and its
 * condition must survive, and the read store must show the same rows.
 */
async function auto_filter_round_trip(): Promise<number> {
  const store = SheetwriteStore.fromSnapshot(auto_filter_snapshot);
  try {
    const imported = await fromXlsxWorkbook(await toXlsxWorkbook(store));
    const sheet = imported.sheets[0];
    if (
      sorted_json(sheet?.autoFilter) !== sorted_json(auto_filter_snapshot.sheets[0]?.autoFilter) ||
      sorted_json(sheet?.filters) !== sorted_json(auto_filter_snapshot.sheets[0]?.filters)
    ) {
      throw new Error(
        `The AutoFilter changed in an XLSX round trip: ${JSON.stringify({
          autoFilter: sheet?.autoFilter,
          filters: sheet?.filters,
        })}`,
      );
    }
    const reloaded = SheetwriteStore.fromSnapshot(imported);
    try {
      return reloaded.viewRowCount("items");
    } finally {
      reloaded.dispose();
    }
  } finally {
    store.dispose();
  }
}

export function XlsxFixture() {
  const [result, set_result] = createSignal<{
    status: "running" | "ready" | "error";
    text: string;
  }>({ status: "running", text: "running" });

  onMount(() => {
    let is_cancelled = false;
    onCleanup(() => {
      is_cancelled = true;
    });

    void (async () => {
      try {
        await initSheetwrite({ addons: [xlsxAddon()] });
        const bytes = await toXlsxWorkbook(snapshot);
        const imported = await fromXlsxWorkbook(bytes);
        const formula = imported.sheets[1]?.cells[0]?.cells[0]?.value;
        if (
          imported.sheets.length !== snapshot.sheets.length ||
          formula?.kind !== "formula" ||
          formula.src !== "=Input!A1*2"
        ) {
          throw new Error("Workbook XLSX round-trip changed browser-visible semantics");
        }
        const shown_rows = await auto_filter_round_trip();
        if (!is_cancelled) {
          set_result({
            status: "ready",
            text: JSON.stringify({
              bytes: bytes.byteLength,
              formula: formula.src,
              shownRows: shown_rows,
            }),
          });
        }
      } catch (error) {
        if (!is_cancelled) {
          set_result({
            status: "error",
            text: error instanceof Error ? (error.stack ?? error.message) : String(error),
          });
        }
      }
    })();
  });

  return (
    <pre id="result" data-status={result().status}>
      {result().text}
    </pre>
  );
}
