import { lineStartOffsets } from "./source-offsets.js";

/**
 * Hidden typed preludes for documentation code fences.
 *
 * Partial snippets reference host state (`grid`, `workbook`, …) that no fence
 * declares, so standalone analysis degrades those hovers to `any`. A fence
 * opts into a named prelude via ```ts prelude="core" — the prelude text is
 * injected for type analysis only, never rendered, and every hover position is
 * mapped back to the original source. The TypeScript compiler stays the only
 * source of type truth; preludes only supply declarations.
 */

const CORE_TYPES =
  'import type { AggregateOp, ApplyTransactionResult, AutoFilter, CellAddress, CellBorders, CellEditor, CellPaintContext, CellRenderer, CellScalar, CellStyle, ChangeEvent, Column, ColumnarData, ColumnFilter, DataSource, DataValidationRule, DocumentOp, Grid, GridActions, GridCommandName, GridCommandState, GridConfig, GridEvents, GridOptions, GridTransaction, HighlightRange, KeyBindings, MutationPolicyMode, PersistenceAdapter, ProtectedRange, ProtectionResolver, Range, RemoteOperationOptions, ReplaceResult, ResolvedCell, RowGroup, SearchOptions, SearchResult, Selection, SheetId, SortKey, Store, SyncCoordinator, Theme, Transaction, VisibleWindowView, Workbook, WorkbookSnapshot } from "@sheetwrite/core";';
const CORE_VALUES =
  'import { createGrid, createGridFromSnapshot, initSheetwrite, validateWorkbookSnapshot } from "@sheetwrite/core";';
const CORE_PRELUDE = [
  CORE_TYPES,
  CORE_VALUES,
  "declare const host: HTMLElement;",
  "declare const grid: Grid;",
  "declare const workbook: Workbook;",
  "declare const data: ColumnarData;",
  "declare const store: Store;",
  "declare const people: readonly Record<string, CellScalar>[];",
  "declare const boldButton: HTMLButtonElement;",
  "declare const undoButton: HTMLButtonElement;",
].join("\n");
const FRAMEWORK_PRELUDE = [
  CORE_PRELUDE,
  'import type { GridReadyEvent, SimpleColumn } from "@sheetwrite/core/adapter";',
  "declare const columns: readonly SimpleColumn<Record<string, CellScalar>>[];",
  "declare const rows: readonly Record<string, CellScalar>[];",
  "declare const datasource: DataSource;",
  "declare const persist: (event: ChangeEvent) => void;",
  "declare const observe: (grid: Grid, generation: number, reason: string) => void;",
  "declare const connect: (grid: Grid) => void;",
  'declare const operationQueue: { push(...patches: Transaction["patches"]): void };',
  "declare const statusEditor: CellEditor;",
  "declare const assigneeAutocomplete: CellEditor;",
  "declare const editors: Record<string, CellEditor>;",
  "declare const setCommandStates: (states: Readonly<Record<GridCommandName, GridCommandState>>) => void;",
  "declare let commandStates: Readonly<Record<GridCommandName, GridCommandState>>;",
  "declare const setBindings: (bindings: KeyBindings) => void;",
  "declare let bindings: KeyBindings;",
].join("\n");

const HOVER_PRELUDES: ReadonlyMap<string, string> = new Map([
  ["core", CORE_PRELUDE],
  ["framework", FRAMEWORK_PRELUDE],
  [
    "react",
    [
      FRAMEWORK_PRELUDE,
      'import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/react";',
      'import type { RefObject } from "react";',
      "declare const gridRef: RefObject<Grid | null>;",
    ].join("\n"),
  ],
  [
    "vue",
    [FRAMEWORK_PRELUDE, 'import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/vue";'].join("\n"),
  ],
  [
    "svelte",
    [FRAMEWORK_PRELUDE, 'import { Sheetwrite, SheetwriteGrid } from "@sheetwrite/svelte";'].join(
      "\n",
    ),
  ],
  [
    "collaboration",
    [
      CORE_PRELUDE,
      'import type { PendingCommitStorage, VersionedOperation } from "@sheetwrite/core";',
      "declare const adapter: PersistenceAdapter;",
      "declare const persistenceAdapter: PersistenceAdapter;",
      "declare const sync: SyncCoordinator;",
      "declare const snapshot: WorkbookSnapshot;",
      "declare const loadedSnapshot: WorkbookSnapshot;",
      "declare const documentId: string;",
      "declare const signal: AbortSignal;",
      "declare const saveButton: HTMLButtonElement;",
      "declare const remoteOperationSource: AsyncIterable<VersionedOperation>;",
      "declare const showConflict: (conflict: unknown) => void;",
      "declare const requestFreshSnapshot: () => Promise<void>;",
      "declare const pendingStorage: PendingCommitStorage;",
    ].join("\n"),
  ],
  [
    "theming",
    [
      CORE_PRELUDE,
      "declare const darkBtn: HTMLButtonElement;",
      "declare const stage: HTMLElement;",
      "declare const DARK: Partial<Theme>;",
    ].join("\n"),
  ],
  [
    "architecture",
    [
      CORE_PRELUDE,
      "declare const payload: string;",
      "declare function computeWindow(index: unknown, contentTop: number, viewportHeight: number, overscan: number): { start: number; end: number };",
      "declare function toContent(scrollTop: number): number;",
      "declare function toScroll(contentOffset: number): number;",
    ].join("\n"),
  ],
  [
    "xlsx",
    [
      CORE_PRELUDE,
      'import type { SimpleColumn } from "@sheetwrite/core/adapter";',
      "declare const csvText: string;",
      "declare const columns: readonly SimpleColumn<Record<string, CellScalar>>[];",
      "declare const abortController: AbortController;",
      "declare const signal: AbortSignal;",
      "declare const sheet: SheetId;",
      "declare const range: { start: CellAddress; end: CellAddress };",
    ].join("\n"),
  ],
  [
    "wasm",
    [
      CORE_PRELUDE,
      "declare const source: BufferSource | URL | string | Request | WebAssembly.Module;",
    ].join("\n"),
  ],
]);

export function resolveHoverPrelude(name: string): string {
  const prelude = HOVER_PRELUDES.get(name);
  if (prelude === undefined) {
    throw new Error(
      `Unknown hover prelude "${name}"; known preludes: ${[...HOVER_PRELUDES.keys()].join(", ")}`,
    );
  }
  return prelude;
}

export interface OriginalPosition {
  line: number;
  character: number;
  start: number;
}

export interface PreludeInjection {
  /** Source fed to type analysis; the prelude occupies whole lines. */
  analysisSource: string;
  /**
   * Maps an analysis-source position back to the original source. Returns
   * null for positions inside the injected prelude lines.
   */
  toOriginal(position: { line: number; character: number }): OriginalPosition | null;
}

const SCRIPT_OPEN_TAG = /<script\b[^>]*>/i;

/**
 * Injects a prelude as complete lines. For plain TS/TSX the prelude is
 * prepended; for Vue/Svelte it is inserted directly after the first script
 * open tag, moving any same-line script content onto its own following line
 * so all mapping stays line- and column-exact.
 */
export function injectHoverPrelude(
  source: string,
  language: "ts" | "tsx" | "vue" | "svelte",
  prelude: string,
): PreludeInjection {
  const original_offsets = lineStartOffsets(source);
  const original = (line: number, character: number): OriginalPosition => ({
    line,
    character,
    start: (original_offsets[line] ?? 0) + character,
  });
  const prelude_lines = prelude.split("\n").length;

  if (language === "ts" || language === "tsx") {
    return {
      analysisSource: `${prelude}\n${source}`,
      toOriginal(position) {
        if (position.line < prelude_lines) return null;
        return original(position.line - prelude_lines, position.character);
      },
    };
  }

  const tag = SCRIPT_OPEN_TAG.exec(source);
  if (tag === null) {
    // Template-only snippet: synthesize a script block so the prelude can
    // type template expressions; the whole synthetic range maps to null.
    const script_open = language === "vue" ? '<script setup lang="ts">' : '<script lang="ts">';
    const synthetic_lines = prelude_lines + 2;
    return {
      analysisSource: `${script_open}\n${prelude}\n</script>\n${source}`,
      toOriginal(position) {
        if (position.line < synthetic_lines) return null;
        return original(position.line - synthetic_lines, position.character);
      },
    };
  }

  const insert_at = tag.index + tag[0].length;
  const before = source.slice(0, insert_at);
  const after = source.slice(insert_at);
  const tag_line = before.split("\n").length - 1;
  const tag_column = insert_at - (original_offsets[tag_line] ?? 0);
  // `after` starts on its own line, so injected lines are exactly
  // [tag_line + 1, tag_line + prelude_lines] and every original position keeps
  // whole-line granularity.
  const inserted_lines = prelude_lines + 1;
  const remainder_line = tag_line + prelude_lines + 1;

  return {
    analysisSource: `${before}\n${prelude}\n${after}`,
    toOriginal(position) {
      if (position.line < tag_line) return original(position.line, position.character);
      if (position.line === tag_line) {
        return position.character <= tag_column
          ? original(position.line, position.character)
          : null;
      }
      if (position.line < remainder_line) return null;
      if (position.line === remainder_line) {
        return original(tag_line, position.character + tag_column);
      }
      return original(position.line - inserted_lines, position.character);
    },
  };
}
