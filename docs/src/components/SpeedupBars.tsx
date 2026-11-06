import { type SpeedupMachine, speedupFigure } from "../lib/speedup-figure.js";
import { PerfBars } from "./PerfBars.js";

/** Sheetwrite against Handsontable per workbook size and machine, as performance bars. */
export default function SpeedupBars({
  id,
  machines,
}: Readonly<{ id: string; machines: readonly SpeedupMachine[] }>) {
  return <PerfBars figure={speedupFigure(id, machines)} />;
}
