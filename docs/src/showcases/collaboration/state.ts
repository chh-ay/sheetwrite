import { type ActionState, createActionGuard } from "@docs/lib/action-guard.js";
import type { ShowcaseLinkState } from "@docs/showcases/collaboration-protocol.js";
import type { PresenceMessage, SyncStateSnapshot } from "@sheetwrite/core";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

import type { CollaborationEngine } from "./engine.js";

/*
 * The collaboration page's live state, shared by its two islands: the stage
 * (CollaborationStage.tsx) and the protocol faults after the code
 * (CollaborationFaults.tsx). The engine (engine.ts) loads once the clients
 * come near the viewport and writes here.
 */

export type ClientKey = "a" | "b";
export const CLIENT_KEYS: readonly ClientKey[] = ["a", "b"];

export const LOG_LIMIT = 10;
export const SERVER_LOG_LIMIT = 12;
/** Chaos leaves both clients with long queues and recoveries; allow them longer to drain. */
export const CHAOS_DRAIN_MS = 30_000;

export interface LogEntry {
  id: number;
  kind: "info" | "commit" | "remote" | "warn" | "error";
  text: string;
}

export interface ClientView {
  ready: boolean;
  online: boolean;
  syncState: SyncStateSnapshot | null;
  linkState: ShowcaseLinkState | null;
  total: string;
  /** The account behind this client's sample edit, read from the forecast. */
  account: string;
  roster: readonly PresenceMessage[];
  log: readonly LogEntry[];
}

/** A client before it mounts. A fresh object each time: the store mutates the objects it holds. */
export function emptyClientView(): ClientView {
  return {
    ready: false,
    online: true,
    syncState: null,
    linkState: null,
    total: "–",
    account: "the first deal",
    roster: [],
    log: [],
  };
}

export interface ChaosReport {
  phase: "storm" | "settling" | "converged" | "diverged" | "timed-out";
  edits: number;
  disconnects: number;
  reorders: number;
  mismatches: number;
  cells: number;
  ms: number;
}

/** What one atomic multi-version restore looked like on both clients. */
export interface BatchReport {
  versions: number;
  pieces: number;
  operationBytes: number;
  peerChanges: number;
  totalBefore: number;
  totalAfter: number;
  peerTotal: number;
  ms: number;
  passed: boolean;
}

export const [engine, setEngine] = createSignal<CollaborationEngine | null>(null);
export const [status, setStatus] = createSignal<"loading" | "ready" | "error">("loading");
export const [statusDetail, setStatusDetail] = createSignal("Starting the in-page server…");
export const [views, setViews] = createStore<Record<ClientKey, ClientView>>({
  a: emptyClientView(),
  b: emptyClientView(),
});
export const [serverLog, setServerLog] = createSignal<Array<LogEntry & { status: string }>>([]);
export const [serverVersion, setServerVersion] = createSignal(0);
export const [chaos, setChaos] = createSignal<ChaosReport | null>(null);
export const [batchReport, setBatchReport] = createSignal<BatchReport | null>(null);
export const [restoreRunning, setRestoreRunning] = createSignal(false);

/** The guard of the page's edits, server commits and reset. */
const [action_state, set_action_state] = createSignal<ActionState>({ pending: false, error: null });
export const action = createActionGuard(set_action_state);
export const actionPending = () => action_state().pending;
export const actionError = () => action_state().error;

/** The chaos run's own guard: it runs alongside the other actions. */
const [chaos_state, set_chaos_state] = createSignal<ActionState>({ pending: false, error: null });
export const chaosAction = createActionGuard(set_chaos_state);
export const chaosPending = () => chaos_state().pending;
export const chaosError = () => chaos_state().error;

let log_id = 0;
export const nextLogId = (): number => {
  log_id += 1;
  return log_id;
};

export function patchView(key: ClientKey, patch: Partial<ClientView>): void {
  setViews(key, (current) => ({ ...current, ...patch }));
}

export function pushClientLog(key: ClientKey, kind: LogEntry["kind"], text: string): void {
  const entry: LogEntry = { id: nextLogId(), kind, text };
  setViews(key, "log", (log) => [entry, ...log].slice(0, LOG_LIMIT));
}

/** Where each client stands against the server head: caught up with nothing queued. */
export const atHead = (key: ClientKey): boolean =>
  views[key].ready &&
  views[key].syncState?.serverVersion === serverVersion() &&
  views[key].syncState?.pendingCount === 0;
