import { firstCalculationMs, milliseconds } from "./timing.js";

/** The header fact the stage measures: the model's load and first calculation. */
export function FirstCalculationFact() {
  return <span data-testid="recalc-first-calculation">{milliseconds(firstCalculationMs())}</span>;
}
