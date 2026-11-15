import { type ActionState, createActionGuard } from "@docs/lib/action-guard.js";
import type { XlsxWorkbookWarning } from "@sheetwrite/core";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

import type { RejectionReport, RoundTripReport } from "../scenarios/interoperability.js";
import type { InteropEngine } from "./engine.js";

/*
 * The interoperability page's live state, shared by its islands: the stage
 * (InteropStage.tsx), the spill proof and the labs. The engine (engine.ts)
 * loads once the workbook comes near the viewport and writes here.
 */

export interface WarningLog {
  operation: string;
  warnings: XlsxWorkbookWarning[];
}

export interface DigestState {
  state: "pending" | "verified" | "mismatch";
  actual?: string;
  /** The fetched file's size in bytes. */
  bytes?: number;
}

export interface IsolationProbe {
  registered: boolean;
  error: string | null;
}

export interface FixtureLoad {
  id: string;
  state: "loading" | "loaded" | "failed";
  detail: string;
}

export interface AnalyticalReadout {
  selectedRate: number | null;
  payment: number | null;
  statistical: number | null;
  letResult: number | null;
  npv: number | null;
  irr: number | null;
  scheduleEnd: number | null;
  spill: readonly (number | null)[];
}

export interface AnalyticalChange {
  address: string;
  committedCells: number;
  changedResults: readonly string[];
}

export interface BulkReport {
  rows: number;
  columns: number;
  ms: number;
  bytes: number;
}

export interface FileReport {
  name: string;
  bytes: number;
  ms: number;
  sheets: number;
  cells: number;
  formulas: number;
  warnings: number;
}

/** The label of the workbook the page starts with. */
export const STARTING_SOURCE_LABEL = "Q1 2026 · workplace equipment sales";

export const [engine, setEngine] = createSignal<InteropEngine | null>(null);
export const [sourceLabel, setSourceLabel] = createSignal(STARTING_SOURCE_LABEL);
export const [gridReady, setGridReady] = createSignal(false);
export const [status, setStatus] = createSignal("Booting the WASM engine…");
export const [probe, setProbe] = createSignal<IsolationProbe | null>(null);
export const [warningLog, setWarningLog] = createSignal<WarningLog | null>(null);
export const [roundTrip, setRoundTrip] = createSignal<RoundTripReport | null>(null);
export const [dragActive, setDragActive] = createSignal(false);
export const [bulkReport, setBulkReport] = createSignal<BulkReport | null>(null);
export const [fileReport, setFileReport] = createSignal<FileReport | null>(null);
export const [digests, setDigests] = createStore<Record<string, DigestState>>({});
export const [rejections, setRejections] = createStore<Record<string, RejectionReport>>({});
export const [abortReport, setAbortReport] = createSignal<RejectionReport | null>(null);
export const [cellCapReport, setCellCapReport] = createSignal<RejectionReport | null>(null);
export const [csvCapReport, setCsvCapReport] = createSignal<RejectionReport | null>(null);
export const [csvPreview, setCsvPreview] = createSignal<string | null>(null);
export const [tsvPreview, setTsvPreview] = createSignal<string | null>(null);
export const [pasteError, setPasteError] = createSignal<string | null>(null);
export const [fixtureLoad, setFixtureLoad] = createSignal<FixtureLoad | null>(null);
export const [modelReadout, setModelReadout] = createSignal<AnalyticalReadout | null>(null);
export const [modelChange, setModelChange] = createSignal<AnalyticalChange | null>(null);
/** When the security lab last ran all its attacks, or null before a run. */
export const [attacksRunAt, setAttacksRunAt] = createSignal<number | null>(null);

/** One guard for every file operation on the page. */
const [actionState, setActionState] = createSignal<ActionState>({ pending: false, error: null });
const guard = createActionGuard(setActionState);
export const actionPending = () => actionState().pending;
export const actionError = () => actionState().error;

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Runs a file operation under the page's guard; a failure becomes one readable sentence. */
export function run(command: (current: InteropEngine) => unknown): void {
  const current = engine();
  if (!current) return;
  void guard.run(
    () => command(current),
    (error) => `The file operation failed: ${describeError(error)}. Try again.`,
  );
}
