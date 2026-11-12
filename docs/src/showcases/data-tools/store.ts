import { createSignal } from "solid-js";

import type { DataSnapshot } from "../scenarios/data-tools.js";

/**
 * The dispatch queue's latest snapshot, shared by the page's two islands: the
 * stage writes it (DataToolsStage.tsx) and the event log below the code reads
 * it (DataEvents.tsx).
 */
export const [dataSnapshot, setDataSnapshot] = createSignal<DataSnapshot | null>(null);
