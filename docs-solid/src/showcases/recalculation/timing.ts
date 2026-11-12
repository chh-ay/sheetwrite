import { createSignal } from "solid-js";

/** The model's load and first calculation, shared by the stage and the header fact. */
export const [firstCalculationMs, setFirstCalculationMs] = createSignal<number | null>(null);

/** A timing as the page shows it: one decimal under 10 ms, "…" until measured. */
export const milliseconds = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? "…"
    : `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;
