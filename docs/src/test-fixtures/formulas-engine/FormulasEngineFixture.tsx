import { errorText } from "@docs/lib/errors.js";
import { createGrid, type Grid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import * as formulas from "@sheetwrite/formulas";
import { createSignal, onCleanup, onMount } from "solid-js";

import "@sheetwrite/core/styles.css";

const DISTRIBUTION_GRID_STYLE = { width: "600px", height: "300px" } as const;

const workbook: Workbook = {
  activeSheet: "distribution",
  sheets: [
    {
      id: "distribution",
      name: "Distribution",
      rowCount: 2,
      columns: [{ key: "probability", header: "Probability", width: 240, type: "number" }],
    },
  ],
};

export function FormulasEngineFixture() {
  let host: HTMLElement | undefined;
  const [status, setStatus] = createSignal("loading");
  const [value, setValue] = createSignal("");

  onMount(() => {
    const element = host;
    if (!element) return;
    let isDisposed = false;
    let grid: Grid | undefined;
    onCleanup(() => {
      isDisposed = true;
      grid?.destroy();
    });

    const isFullEngine = new URLSearchParams(location.search).get("engine") === "full";
    void initSheetwrite({ engine: isFullEngine ? formulas : undefined }).then(
      () => {
        if (isDisposed) return;
        grid = createGrid(element, { workbook });
        const address = { sheet: "distribution", row: 0, col: 0 };
        const result = grid.applyTransaction({
          patches: [
            {
              op: "set",
              addr: address,
              value: { kind: "formula", src: "=NORM.S.DIST(1,TRUE)" },
            },
          ],
        });
        if (result.status !== "applied") throw new Error("Formula fixture edit was not applied.");
        setValue(String(grid.store.getCell(address).resolved));
        setStatus("ready");
      },
      (error: unknown) => {
        if (!isDisposed) setStatus(errorText(error));
      },
    );
  });

  return (
    <>
      <output id="formula-engine-status" data-status={status()}>
        {status()}
      </output>
      <output id="formula-engine-value">{value()}</output>
      <section
        ref={(element) => {
          host = element;
        }}
        aria-label="Distribution grid"
        style={DISTRIBUTION_GRID_STYLE}
      />
    </>
  );
}
