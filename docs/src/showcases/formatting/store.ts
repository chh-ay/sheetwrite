import { createSignal } from "solid-js";

import type { RoundTrip } from "./boot.js";

/**
 * The latest XLSX proof, shared by the page's two islands: the stage runs it
 * (FormattingStage.tsx) and the section after the code shows the re-imported
 * workbook (FormattingImported.tsx).
 */
export const [roundTripReport, setRoundTripReport] = createSignal<RoundTrip | null>(null);
