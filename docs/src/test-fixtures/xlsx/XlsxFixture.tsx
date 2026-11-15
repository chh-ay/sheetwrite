import {
  fromXlsxWorkbook,
  initSheetwrite,
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

export function XlsxFixture() {
  const [result, setResult] = createSignal<{
    status: "running" | "ready" | "error";
    text: string;
  }>({ status: "running", text: "running" });

  onMount(() => {
    let isCancelled = false;
    onCleanup(() => {
      isCancelled = true;
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
        if (!isCancelled) {
          setResult({
            status: "ready",
            text: JSON.stringify({ bytes: bytes.byteLength, formula: formula.src }),
          });
        }
      } catch (error) {
        if (!isCancelled) {
          setResult({
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
