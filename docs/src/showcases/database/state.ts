import { type ActionState, createActionGuard } from "@docs/lib/action-guard.js";
import type { ShowcaseDatabaseStats } from "@docs/showcases/showcase-database.js";
import type { SyncStateSnapshot } from "@sheetwrite/core";
import { createSignal } from "solid-js";

import type { DatabaseEngine } from "./engine.js";

/*
 * The database page's live state, shared by its two islands: the stage
 * (DatabaseStage.tsx) and the failure lab after the code (DatabaseLab.tsx).
 * The engine (engine.ts) loads once the ledger comes near the viewport and
 * writes here.
 */

export interface LogEntry {
  id: number;
  kind: "info" | "pending" | "commit" | "warn" | "error";
  text: string;
}

/** One page reload's own record of the durable queue it restored. */
export interface CrashReport {
  expected: number;
  restored: number;
  totalBefore: string;
  totalAfter: string;
}

export interface UndoReport {
  before: number;
  cleared: number;
  after: number;
  decodedBytes: number;
  wireBytes: number;
  versions: number;
  undoSteps: number;
  passed: boolean;
}

export interface LimitReport {
  rejected: boolean;
  clearedStayedCleared: boolean;
  olderEditRestored: boolean;
  passed: boolean;
}

export const LOG_LIMIT = 14;
/** When the adapter folds its operation tail into a snapshot. */
export const COMPACTION = { maxTailRecords: 8, maxTailBytes: 64 * 1024 } as const;

export const [engine, setEngine] = createSignal<DatabaseEngine | null>(null);
export const [status, setStatus] = createSignal<"loading" | "ready" | "error">("loading");
export const [statusDetail, setStatusDetail] = createSignal("Opening IndexedDB…");
export const [stats, setStats] = createSignal<ShowcaseDatabaseStats | null>(null);
export const [syncState, setSyncState] = createSignal<SyncStateSnapshot | null>(null);
export const [autosave, setAutosave] = createSignal(true);
export const [total, setTotal] = createSignal("–");
export const [log, setLog] = createSignal<LogEntry[]>([]);
export const [recoveryState, setRecoveryState] = createSignal("Opening IndexedDB…");
export const [crashReport, setCrashReport] = createSignal<CrashReport | null>(null);
export const [undoReport, setUndoReport] = createSignal<UndoReport | null>(null);
export const [undoRunning, setUndoRunning] = createSignal(false);
export const [limitReport, setLimitReport] = createSignal<LimitReport | null>(null);

/** One guard for every database action, so both islands' controls wait for the same run. */
const [actionState, setActionState] = createSignal<ActionState>({ pending: false, error: null });
const guard = createActionGuard(setActionState);
export const busy = () => actionState().pending;
export const actionError = () => actionState().error;
export const runGuarded = guard.run;

let logId = 0;
export function pushLog(kind: LogEntry["kind"], text: string): void {
  logId += 1;
  const entry: LogEntry = { id: logId, kind, text };
  setLog((entries) => [entry, ...entries].slice(0, LOG_LIMIT));
}
