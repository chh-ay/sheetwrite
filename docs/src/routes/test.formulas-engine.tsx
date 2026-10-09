import { createGrid, type Grid, initSheetwrite, type Workbook } from "@sheetwrite/core";
import "@sheetwrite/core/styles.css";
import * as formulas from "@sheetwrite/formulas";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/test/formulas-engine")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: FormulasEngineFixture,
});

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

function FormulasEngineFixture() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("loading");
  const [value, setValue] = useState("");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let grid: Grid | undefined;
    const fullEngine = new URLSearchParams(location.search).get("engine") === "full";
    void initSheetwrite(undefined, fullEngine ? formulas : undefined).then(
      () => {
        if (disposed) return;
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
        if (!disposed) setStatus(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      disposed = true;
      grid?.destroy();
    };
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Formula engine browser fixture</h1>
      <output id="formula-engine-status" data-status={status}>
        {status}
      </output>
      <output id="formula-engine-value">{value}</output>
      <section ref={host} aria-label="Distribution grid" style={{ width: 600, height: 300 }} />
    </main>
  );
}
