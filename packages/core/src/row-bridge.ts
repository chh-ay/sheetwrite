import { capturedClearCells } from "./clear-capture.js";
import { SheetwriteError } from "./errors.js";
import { DEFAULT_SHEET_ID } from "./grid-constants.js";
import { restoreBlockFacts } from "./restore-block.js";
import { cellRange, movedBlock, movedCellBounds } from "./store/ranges.js";
import type { CellScalar, CellValue } from "./types/cell.js";
import type { CellAddress, Range, SheetId } from "./types/coordinates.js";
import type { CommitReason, DocumentOp, SheetSnapshot } from "./types/document.js";
import type { CellChange, ChangeEvent, OperationSource, Transaction } from "./types/transaction.js";

/** A stable host identity for one data-space row. */
export type RowBridgeId = string | number;

/** Semantic column key accepted by the row bridge. */
export interface RowBridgeColumn<Row extends Record<string, CellScalar>> {
  /** Property of your row objects shown in this column. */
  readonly key: keyof Row & string;
}

/** Context supplied when a canonical row insertion needs a host identity. */
export interface RowBridgeInsertContext {
  /** Stable ID of the sheet the rows are inserted into. */
  readonly sheet: SheetId;
  /** Zero-based row where the inserted block starts. */
  readonly at: number;
  /** Position of this row inside the inserted block, from 0. */
  readonly offset: number;
  /** ID of the transaction that inserts the rows. */
  readonly transactionId: string;
}

/** Options for the framework-neutral, opt-in row bridge. */
export interface RowBridgeOptions<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
> {
  /** The row properties shown as columns, in column order. */
  readonly columns: readonly RowBridgeColumn<Row>[];
  /** The rows the grid starts with, in row order; the bridge reads their IDs and never changes them. */
  readonly defaultRows: readonly Row[];
  /** Returns the stable ID of a row; IDs must be unique. */
  readonly getRowId: (row: Row, index: number) => Id;
  /** Sheet identity used by the simple data-first adapter. Defaults to `sheet1`. */
  readonly sheet?: SheetId;
  /** Optional identity factory for rows created by an addRows operation. */
  readonly createRowId?: (context: RowBridgeInsertContext) => Id;
  /** Maximum entries in each recent identity window; defaults to 8,192. Must be a positive safe integer. */
  readonly maxRecentTransactions?: number;
}

/** A cell effect with semantic column and host row identity. */
export interface RowBridgeCell<Id extends RowBridgeId = RowBridgeId> {
  /** Stable ID of the cell's sheet. */
  readonly sheet: SheetId;
  /** Zero-based row of the cell in the document. */
  readonly row: number;
  /** Your ID of the cell's row; `null` for a row the bridge has no ID for. */
  readonly rowId: Id | null;
  /** Zero-based column of the cell. */
  readonly col: number;
  /** Row property the column shows; `null` for a column outside `columns`. */
  readonly columnKey: string | null;
  /** The cell's content before the change, when known. */
  readonly previous: CellValue | undefined;
  /** The cell's content after the change. */
  readonly next: CellValue | undefined;
}

/** The canonical transaction identity carried by each projected delta. */
export interface RowBridgeTransaction {
  /** Deterministic ID of the transaction, the same for the same patches and epoch. */
  readonly id: string;
  /** Whether the change was made here (`local`) or came from elsewhere (`remote`). */
  readonly source: OperationSource;
  /** The user action or API call that produced the change, such as `"paste"`. */
  readonly commitReason: CommitReason;
  /** Store epoch after the commit, when known. */
  readonly epoch: number | undefined;
  /** The committed document operations, in order. */
  readonly patches: readonly DocumentOp[];
}

interface RowBridgeDeltaBase<Id extends RowBridgeId = RowBridgeId> {
  /** The transaction the delta belongs to. */
  readonly transaction: RowBridgeTransaction;
  /** Same as `transaction.id`. */
  readonly transactionId: string;
  /** Same as `transaction.source`. */
  readonly source: OperationSource;
  /** State before the change: cell values for cell deltas, removed row IDs for row deletes. */
  readonly previous: unknown;
  /** State after the change: cell values, inserted row IDs, or the operation itself for metadata. */
  readonly next: unknown;
  /** The one document operation this delta projects. */
  readonly operation: DocumentOp;
  /** Your IDs of the rows the delta touches, in its own order; `null` where a row has no ID. */
  readonly rowIds: readonly (Id | null)[];
}

/** A single-cell edit, including edits from search, undo, and redo. */
interface RowBridgeCellDelta<Id extends RowBridgeId = RowBridgeId> extends RowBridgeDeltaBase<Id> {
  readonly kind: "cell";
  readonly cell: RowBridgeCell<Id>;
}

/** A setRange/setBlock/restoreBlock effect expanded to its exact changed cells. */
export interface RowBridgeRangeDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"range"`. */
  readonly kind: "range";
  /** The range the operation wrote. */
  readonly range: Range;
  /** The cells whose value changed. */
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** A clearRange effect expanded to its exact changed cells. */
export interface RowBridgeClearDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"clear"`. */
  readonly kind: "clear";
  /** The range the operation wrote. */
  readonly range: Range;
  /** The cells whose value changed. */
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** A paste transaction effect. A paste can contain multiple canonical patches. */
export interface RowBridgePasteDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"paste"`. */
  readonly kind: "paste";
  /** The range the operation wrote; `null` when the operation has no cell range. */
  readonly range: Range | null;
  /** The cells whose value changed. */
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** A fill-series transaction effect. */
export interface RowBridgeFillDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"fill"`. */
  readonly kind: "fill";
  /** The range the operation wrote; `null` when the operation has no cell range. */
  readonly range: Range | null;
  /** The cells whose value changed. */
  readonly cells: readonly RowBridgeCell<Id>[];
}

/** Stable row identity effects for insert, delete, and move operations. */
export interface RowBridgeRowStructureDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"row-structure"`. */
  readonly kind: "row-structure";
  /** Whether rows were inserted, deleted or moved. */
  readonly action: "insert" | "delete" | "move";
  /** Stable ID of the sheet whose rows changed. */
  readonly sheet: SheetId;
  /** Zero-based row where the change starts. */
  readonly at: number;
  /** Number of rows inserted, deleted or moved. */
  readonly count: number;
  /** For a move: zero-based first row of the block before the move. */
  readonly from?: number;
  /** For a move: zero-based first row of the block after the move. */
  readonly to?: number;
  /** IDs of inserted rows (and moved rows, for a move), in row order. */
  readonly inserted: readonly (Id | null)[];
  /** IDs of deleted rows, in row order. */
  readonly removed: readonly (Id | null)[];
}

/** A document operation that changes workbook or column metadata. */
export interface RowBridgeMetadataDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"metadata"`. */
  readonly kind: "metadata";
  /** What kind of metadata changed, such as `"column"` or `"chart"`. */
  readonly metadata:
    | "column"
    | "row"
    | "sheet"
    | "merge"
    | "table"
    | "validation"
    | "hyperlink"
    | "protected-range"
    | "note"
    | "named-range"
    | "calculation"
    | "relationship"
    | "measure"
    | "query"
    | "chart"
    | "pivot"
    | "dashboard";
}

/** A document operation that needs a host-side action rather than row mutation. */
export interface RowBridgeHostActionDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"host-action"`. */
  readonly kind: "host-action";
  /** The sheet-level change your app should mirror. */
  readonly action:
    | "add-sheet"
    | "remove-sheet"
    | "rename-sheet"
    | "move-sheet"
    | "set-sheet-visibility";
}

/** An explicit projection record for an operation with no row-space meaning. */
export interface RowBridgeUnprojectableDelta<
  Id extends RowBridgeId = RowBridgeId,
> extends RowBridgeDeltaBase<Id> {
  /** Tag to `switch` on across `RowBridgeDelta` kinds; always `"unprojectable"`. */
  readonly kind: "unprojectable";
  /** Why the operation has no row-level meaning. */
  readonly reason: string;
}

/** Every possible projection produced by a row bridge. */
export type RowBridgeDelta<Id extends RowBridgeId = RowBridgeId> =
  | RowBridgeCellDelta<Id>
  | RowBridgeRangeDelta<Id>
  | RowBridgeClearDelta<Id>
  | RowBridgePasteDelta<Id>
  | RowBridgeFillDelta<Id>
  | RowBridgeRowStructureDelta<Id>
  | RowBridgeMetadataDelta<Id>
  | RowBridgeHostActionDelta<Id>
  | RowBridgeUnprojectableDelta<Id>;

/** Reconciliation status for a canonical transaction response. */
export type RowBridgeReconciliationStatus =
  | "accepted"
  | "transformed"
  | "rejected"
  | "out-of-order"
  | "duplicate"
  | "remote";

/** Input to {@link RowBridge.reconcile}. */
export interface RowBridgeReconciliationInput<Id extends RowBridgeId = RowBridgeId> {
  /** What your server did with the transaction, such as `"accepted"` or `"rejected"`. */
  readonly status: RowBridgeReconciliationStatus;
  /** ID of the transaction the response is for, from `rowBridgeTransactionId`. */
  readonly transactionId?: string;
  /** Whether the transaction was made here or came from elsewhere. */
  readonly source?: OperationSource;
  /** Server version of the response; an older version than one already seen is out of order. */
  readonly version?: number;
  /** Canonical operations applied by the document engine. */
  readonly operations?: readonly DocumentOp[];
  /** Original host operations, used to identify a transformed acceptance. */
  readonly requestedOperations?: readonly DocumentOp[];
  /** The grid's `change` event for the transaction, when you have it. */
  readonly event?: ChangeEvent;
  /** The user action or API call that produced the transaction. */
  readonly commitReason?: CommitReason;
  /** Type-only marker that carries the row ID type; leave it unset. */
  readonly _type?: Id;
}

/** Result of projection or reconciliation. */
export interface RowBridgeProjection<Id extends RowBridgeId = RowBridgeId> {
  /** How the transaction was settled, such as `"accepted"` or `"remote"`. */
  readonly status: RowBridgeReconciliationStatus;
  /** The transaction the deltas come from. */
  readonly transaction: RowBridgeTransaction;
  /** One delta per document operation, in order. */
  readonly deltas: readonly RowBridgeDelta<Id>[];
}

/** Callback accepted by imperative and framework adapters. */
export type RowBridgeHandler<Id extends RowBridgeId = RowBridgeId> = (
  projection: RowBridgeProjection<Id>,
) => void;

interface MutableSheetState<Id extends RowBridgeId> {
  readonly rowIds: Array<Id | null>;
  /** Membership mirror of `rowIds`, so an insert can reject duplicates without scanning it. */
  readonly rowIdSet: Set<Id>;
  readonly columns: string[];
}

function assert_never(value: never): never {
  const unknown_value: unknown = value;
  let operation = "unknown";
  if (
    typeof unknown_value === "object" &&
    unknown_value !== null &&
    "op" in unknown_value &&
    typeof unknown_value.op === "string"
  ) {
    operation = unknown_value.op;
  }
  throw new Error(`Sheetwrite: unsupported document operation ${operation}`);
}

function stable_json(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return `bigint:${String(value)}`;
    if (typeof value === "undefined") return "undefined";
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => stable_json(entry)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable_json(record[key])}`)
    .join(",")}}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

/**
 * Canonical transaction ID from the operations' stable JSON. The text equals
 * `stable_json({ epoch, operations })`, built from JSON the caller already has.
 */
function transaction_id_for(epoch: number | undefined, operations_json: string): string {
  return `tx-${hash(`{"epoch":${stable_json(epoch)},"operations":${operations_json}}`)}`;
}

function transaction_for(
  event: ChangeEvent,
  operations_json: string,
  explicit_id?: string,
): RowBridgeTransaction {
  const operations = event.transaction.patches;
  const id = explicit_id ?? transaction_id_for(event.epoch, operations_json);
  return {
    id,
    source: event.source,
    commitReason: event.commitReason,
    epoch: event.epoch,
    patches: operations,
  };
}

function cell_address_key(addr: CellAddress): string {
  return `${addr.sheet}\u0000${addr.row}\u0000${addr.col}`;
}

/** Paste and fill commits report cell writes under their own delta kinds. */
function write_delta_kind(reason: CommitReason): "paste" | "fill" | undefined {
  if (reason === "paste" || reason === "fill") return reason;

  return undefined;
}

function operation_range(operation: DocumentOp): Range | null {
  switch (operation.op) {
    case "set":
      return cellRange(operation.addr);
    case "setRange":
    case "setBlock":
    case "restoreBlock":
    case "setRangeStyle":
    case "clearRange":
    case "permuteRows":
      return operation.range;
    case "moveCells":
      return movedBlock(operation);
    default:
      return null;
  }
}

function operation_columns(operation: DocumentOp): string[] {
  switch (operation.op) {
    case "addColumns":
      return operation.columns.map((column) => column.key);
    default:
      return [];
  }
}

// Direct-echo hosts need a recent echo window. It can exceed SyncCoordinator's
// 4,096 acknowledgement window because SyncCoordinator removes its echoes first.
const DEFAULT_MAX_RECENT_TRANSACTIONS = 8192;

interface RecentIdentity {
  identity: string;
  previous: RecentIdentity | undefined;
  next: RecentIdentity | undefined;
}

// A linked order avoids scanning deleted Set slots when the window is full.
// Reuse removed entries so sustained projection needs no new list nodes.
class RecentIdentities {
  private readonly entries = new Map<string, RecentIdentity>();
  private oldest: RecentIdentity | undefined;
  private newest: RecentIdentity | undefined;
  private unused: RecentIdentity | undefined;

  constructor(private readonly capacity: number) {}

  has(identity: string): boolean {
    return this.entries.has(identity);
  }

  delete(identity: string): void {
    const entry = this.entries.get(identity);
    if (entry === undefined) return;
    this.entries.delete(identity);
    this.unlink(entry);
    entry.identity = "";
    entry.next = this.unused;
    this.unused = entry;
  }

  remember(identity: string): void {
    let entry = this.entries.get(identity);
    if (entry !== undefined) {
      this.unlink(entry);
    } else {
      if (this.entries.size === this.capacity && this.oldest !== undefined) {
        entry = this.oldest;
        this.entries.delete(entry.identity);
        this.unlink(entry);
      } else if (this.unused !== undefined) {
        entry = this.unused;
        this.unused = entry.next;
      } else {
        entry = { identity, previous: undefined, next: undefined };
      }
      entry.identity = identity;
      this.entries.set(identity, entry);
    }
    entry.previous = this.newest;
    entry.next = undefined;
    if (this.newest === undefined) this.oldest = entry;
    else this.newest.next = entry;
    this.newest = entry;
  }

  private unlink(entry: RecentIdentity): void {
    if (entry.previous === undefined) this.oldest = entry.next;
    else entry.previous.next = entry.next;
    if (entry.next === undefined) this.newest = entry.previous;
    else entry.next.previous = entry.previous;
    entry.previous = undefined;
    entry.next = undefined;
  }
}

/**
 * Projects canonical document transactions into host-owned row changes.
 *
 * The bridge only owns compact data-space identity arrays. It never writes to
 * `defaultRows`, never renders, and never creates a second document store.
 */
export class RowBridge<
  Id extends RowBridgeId = RowBridgeId,
  Row extends Record<string, CellScalar> = Record<string, CellScalar>,
> {
  private readonly sheets = new Map<SheetId, MutableSheetState<Id>>();
  private readonly create_row_id: RowBridgeOptions<Row, Id>["createRowId"];
  private readonly local_fingerprints: RecentIdentities;
  private readonly seen_transaction_ids: RecentIdentities;
  private latest_version = -Infinity;

  /** Creates a bridge over `options.defaultRows`; `maxRecentTransactions` must be a positive safe integer. */
  constructor(options: RowBridgeOptions<Row, Id>) {
    const max_recent_transactions =
      options.maxRecentTransactions === undefined
        ? DEFAULT_MAX_RECENT_TRANSACTIONS
        : options.maxRecentTransactions;
    if (!Number.isSafeInteger(max_recent_transactions) || max_recent_transactions <= 0) {
      throw new SheetwriteError(
        "invalid-argument",
        "row-bridge",
        "Sheetwrite: maxRecentTransactions must be a positive safe integer",
      );
    }

    this.local_fingerprints = new RecentIdentities(max_recent_transactions);
    this.seen_transaction_ids = new RecentIdentities(max_recent_transactions);
    const column_keys = options.columns.map((column) => column.key);
    if (new Set(column_keys).size !== column_keys.length) {
      throw new SheetwriteError(
        "invalid-argument",
        "row-bridge",
        "Sheetwrite: row bridge columns must have unique semantic keys",
      );
    }

    const row_ids: Array<Id | null> = [];
    const row_id_set = new Set<Id>();
    for (let index = 0; index < options.defaultRows.length; index += 1) {
      const id = options.getRowId(options.defaultRows[index]!, index);
      if (id === undefined || id === null || (typeof id !== "string" && typeof id !== "number")) {
        throw new SheetwriteError(
          "invalid-argument",
          "row-bridge",
          `Sheetwrite: getRowId must return a stable string or number at row ${index}`,
        );
      }

      if (row_id_set.has(id))
        throw new SheetwriteError(
          "invalid-argument",
          "row-bridge",
          `Sheetwrite: duplicate row ID "${String(id)}"`,
        );
      row_id_set.add(id);
      row_ids.push(id);
    }

    this.sheets.set(options.sheet ?? DEFAULT_SHEET_ID, {
      rowIds: row_ids,
      rowIdSet: row_id_set,
      columns: column_keys,
    });
    this.create_row_id = options.createRowId;
  }

  /** Current data-space row identities; visual sort and filters do not affect this order. */
  rowIds(sheet: SheetId = DEFAULT_SHEET_ID): readonly (Id | null)[] {
    return [...(this.sheets.get(sheet)?.rowIds ?? [])];
  }

  /** Current semantic column keys in canonical column order. */
  columnKeys(sheet: SheetId = DEFAULT_SHEET_ID): readonly string[] {
    return [...(this.sheets.get(sheet)?.columns ?? [])];
  }

  /** Project an applied Grid change as an accepted, transformed, or remote result. */
  project(
    event: ChangeEvent,
    requestedOperations?: readonly DocumentOp[],
    transactionId?: string,
  ): RowBridgeProjection<Id> {
    const operations_json = stable_json(event.transaction.patches);
    const transformed =
      requestedOperations !== undefined && stable_json(requestedOperations) !== operations_json;
    const status = transformed ? "transformed" : event.source === "remote" ? "remote" : "accepted";
    return this.project_event(event, operations_json, status, transactionId);
  }

  /** Reconcile a canonical transaction response without synchronizing host rows implicitly. */
  reconcile(input: RowBridgeReconciliationInput<Id>): RowBridgeProjection<Id> {
    const event = input.event;
    const operations = event?.transaction.patches ?? input.operations ?? [];
    const source =
      input.source ?? event?.source ?? (input.status === "remote" ? "remote" : "local");
    const transaction_id = input.transactionId;
    if (input.version !== undefined) {
      if (input.version < this.latest_version) {
        return this.empty_result(
          "out-of-order",
          transaction_id,
          source,
          operations,
          input.commitReason,
          event?.epoch,
        );
      }

      this.latest_version = input.version;
    }

    if (
      input.status === "rejected" ||
      input.status === "out-of-order" ||
      input.status === "duplicate"
    ) {
      return this.empty_result(
        input.status,
        transaction_id,
        source,
        operations,
        input.commitReason,
        event?.epoch,
      );
    }

    if (event) {
      return this.project_event(event, stable_json(operations), input.status, transaction_id);
    }

    const synthetic: ChangeEvent = {
      transaction: { patches: [...operations] },
      changes: [],
      commitReason: input.commitReason ?? "api",
      source,
    };

    return this.project_event(synthetic, stable_json(operations), input.status, transaction_id);
  }

  private empty_result(
    status: RowBridgeReconciliationStatus,
    transaction_id: string | undefined,
    source: OperationSource,
    operations: readonly DocumentOp[],
    commit_reason = "api" as CommitReason,
    epoch?: number,
  ): RowBridgeProjection<Id> {
    const event: ChangeEvent = {
      transaction: { patches: [...operations], ...(epoch === undefined ? {} : { epoch }) },
      changes: [],
      commitReason: commit_reason,
      source,
      ...(epoch === undefined ? {} : { epoch }),
    };
    return {
      status,
      transaction: transaction_for(event, stable_json(operations), transaction_id),
      deltas: [],
    };
  }

  private project_event(
    event: ChangeEvent,
    operations_json: string,
    status: RowBridgeReconciliationStatus,
    explicit_id?: string,
  ): RowBridgeProjection<Id> {
    const operations = event.transaction.patches;
    const transaction = transaction_for(event, operations_json, explicit_id);
    const fingerprint = hash(operations_json);
    const has_transaction_identity = explicit_id !== undefined || event.epoch !== undefined;
    if (has_transaction_identity && this.seen_transaction_ids.has(transaction.id)) {
      return { status: "duplicate", transaction, deltas: [] };
    }

    if (event.source === "remote" && this.local_fingerprints.has(fingerprint)) {
      this.local_fingerprints.delete(fingerprint);
      if (has_transaction_identity) {
        this.seen_transaction_ids.remember(transaction.id);
      }

      return { status: "duplicate", transaction, deltas: [] };
    }

    if (event.epoch !== undefined && event.epoch < this.latest_version) {
      return { status: "out-of-order", transaction, deltas: [] };
    }

    if (event.epoch !== undefined) this.latest_version = Math.max(this.latest_version, event.epoch);
    if (has_transaction_identity) {
      this.seen_transaction_ids.remember(transaction.id);
    }

    if (event.source === "local") {
      this.local_fingerprints.remember(fingerprint);
    }

    const change_queues = new Map<string, CellChange[]>();
    for (const change of event.changes) {
      const key = cell_address_key(change.addr);
      const queue = change_queues.get(key);
      if (queue) queue.push(change);
      else change_queues.set(key, [change]);
    }

    const deltas: RowBridgeDelta<Id>[] = [];
    for (const operation of operations) {
      deltas.push(this.project_operation(operation, transaction, change_queues));
    }

    return { status, transaction, deltas };
  }

  private state(sheet: SheetId): MutableSheetState<Id> | null {
    return this.sheets.get(sheet) ?? null;
  }

  private row_id(sheet: SheetId, row: number): Id | null {
    return this.state(sheet)?.rowIds[row] ?? null;
  }

  private column_key(sheet: SheetId, col: number): string | null {
    return this.state(sheet)?.columns[col] ?? null;
  }

  private cells_for(
    operation: DocumentOp,
    change_queues: Map<string, CellChange[]>,
  ): RowBridgeCell<Id>[] {
    const addresses: CellAddress[] = [];
    const values = new Map<string, CellValue>();
    if (operation.op === "set") {
      addresses.push(operation.addr);
      values.set(cell_address_key(operation.addr), operation.value);
    } else if (operation.op === "setRange") {
      const range = operation.range;
      const start_row = Math.min(range.start.row, range.end.row);
      const start_col = Math.min(range.start.col, range.end.col);
      for (const cell of operation.cells) {
        const addr = {
          sheet: range.sheet,
          row: start_row + cell.rowOffset,
          col: start_col + cell.colOffset,
        };

        addresses.push(addr);
        values.set(cell_address_key(addr), cell.value);
      }
    } else if (operation.op === "setBlock" || operation.op === "restoreBlock") {
      const { block, range } =
        operation.op === "restoreBlock" ? restoreBlockFacts(operation) : operation;
      const start_row = Math.min(range.start.row, range.end.row);
      const start_col = Math.min(range.start.col, range.end.col);
      const formulas = new Map(block.formulas ?? []);
      const refs = new Map(block.refs ?? []);
      for (let offset = 0; offset < block.values.length; offset += 1) {
        const addr = {
          sheet: range.sheet,
          row: start_row + Math.floor(offset / block.colCount),
          col: start_col + (offset % block.colCount),
        };

        addresses.push(addr);

        const formula = formulas.get(offset);
        const target = refs.get(offset);
        values.set(
          cell_address_key(addr),
          formula !== undefined
            ? { kind: "formula", src: formula }
            : target !== undefined
              ? { kind: "ref", target }
              : { kind: "literal", value: block.values[offset] ?? null },
        );
      }
    } else if (operation.op === "clearRange") {
      const captured = capturedClearCells.get(operation);
      if (captured) {
        // The store listed exactly the cells this clear changed, in the order of
        // their change entries. A later write in the same transaction keeps its
        // own change, and a whole-column clear allocates nothing per empty cell.
        for (const addr of captured) addresses.push(addr);
      } else {
        // Without capture for this clear (reconcile, or capture off) every cell may have changed.
        const range = operation.range;
        const start_row = Math.min(range.start.row, range.end.row);
        const end_row = Math.max(range.start.row, range.end.row);
        const start_col = Math.min(range.start.col, range.end.col);
        const end_col = Math.max(range.start.col, range.end.col);

        for (let row = start_row; row <= end_row; row += 1) {
          for (let col = start_col; col <= end_col; col += 1) {
            const addr = { sheet: range.sheet, row, col };
            addresses.push(addr);
            if (operation.contents !== false) {
              values.set(cell_address_key(addr), { kind: "literal", value: null });
            }
          }
        }
      }
    } else if (operation.op === "permuteRows") {
      // Every cell of the range can take another row's content; the store
      // reports each new value as a change.
      const range = operation.range;
      const start_row = Math.min(range.start.row, range.end.row);
      const end_row = Math.max(range.start.row, range.end.row);
      const start_col = Math.min(range.start.col, range.end.col);
      const end_col = Math.max(range.start.col, range.end.col);

      for (let row = start_row; row <= end_row; row += 1) {
        for (let col = start_col; col <= end_col; col += 1) {
          addresses.push({ sheet: range.sheet, row, col });
        }
      }
    } else if (operation.op === "moveCells") {
      // The cells the block leaves and the cells it lands on (for a shift,
      // every cell from the first to the last); the store reports each new value as a change.
      for (const range of movedCellBounds(operation)) {
        for (let row = range.start.row; row <= range.end.row; row += 1) {
          for (let col = range.start.col; col <= range.end.col; col += 1) {
            addresses.push({ sheet: range.sheet, row, col });
          }
        }
      }
    }

    return addresses.map((addr) => {
      const key = cell_address_key(addr);
      const change = change_queues.get(key)?.shift();
      return {
        sheet: addr.sheet,
        row: addr.row,
        rowId: this.row_id(addr.sheet, addr.row),
        col: addr.col,
        columnKey: this.column_key(addr.sheet, addr.col),
        previous: change?.oldValue,
        next: change?.newValue ?? values.get(key),
      };
    });
  }

  private base<Kind extends RowBridgeDelta["kind"]>(
    transaction: RowBridgeTransaction,
    operation: DocumentOp,
    previous: unknown,
    next: unknown,
    row_ids: readonly (Id | null)[],
  ): RowBridgeDeltaBase<Id> & { readonly kind?: Kind } {
    return {
      transaction,
      transactionId: transaction.id,
      source: transaction.source,
      previous,
      next,
      operation,
      rowIds: row_ids,
    };
  }

  private project_operation(
    operation: DocumentOp,
    transaction: RowBridgeTransaction,
    change_queues: Map<string, CellChange[]>,
  ): RowBridgeDelta<Id> {
    switch (operation.op) {
      case "set":
        return this.cell_delta(operation, transaction, change_queues);

      case "setRange":
      case "setBlock":
      case "restoreBlock":
      case "permuteRows":
        return this.range_delta(operation, transaction, change_queues);

      case "moveCells": {
        const cells = this.cells_for(operation, change_queues);
        const base = this.cells_base(transaction, operation, cells);
        const kind = write_delta_kind(transaction.commitReason) ?? "range";
        return { ...base, kind, range: movedBlock(operation), cells };
      }

      case "clearRange": {
        const cells = this.cells_for(operation, change_queues);
        const base = this.cells_base(transaction, operation, cells);
        return { ...base, kind: "clear", range: operation.range, cells };
      }

      case "addRows":
        return this.insert_rows(operation, transaction);

      case "removeRows":
        return this.remove_rows(operation, transaction);

      case "moveRows":
        return this.move_rows(operation, transaction);

      case "addColumns":
        this.state(operation.sheet)?.columns.splice(
          operation.at,
          0,
          ...operation_columns(operation),
        );
        return this.metadata(transaction, operation, "column");

      case "removeColumns":
        this.state(operation.sheet)?.columns.splice(operation.at, operation.count);
        return this.metadata(transaction, operation, "column");

      case "moveColumns": {
        const columns = this.state(operation.sheet)?.columns;
        const moved = columns?.splice(operation.from, operation.count) ?? [];
        columns?.splice(operation.to, 0, ...moved);
        return this.metadata(transaction, operation, "column");
      }

      case "setColumn":
        return this.metadata(transaction, operation, "column");

      case "setRowMeta": {
        const row_ids = [this.row_id(operation.sheet, operation.row)];
        return this.metadata(transaction, operation, "row", row_ids);
      }

      case "setRangeStyle":
        return this.metadata(transaction, operation, "row");

      case "addMerge":
      case "removeMerge":
        return this.metadata(transaction, operation, "merge");

      case "addSheet": {
        const snapshot = operation.sheet;
        this.sheets.set(snapshot.id, this.sheet_state_for_snapshot(snapshot));
        return this.host_action(transaction, operation, "add-sheet", undefined, snapshot, []);
      }

      case "removeSheet": {
        const previous = this.sheets.get(operation.sheet)?.rowIds ?? [];
        this.sheets.delete(operation.sheet);
        return this.host_action(
          transaction,
          operation,
          "remove-sheet",
          previous,
          undefined,
          previous,
        );
      }

      case "renameSheet":
        return this.host_action(
          transaction,
          operation,
          "rename-sheet",
          undefined,
          operation.name,
          [],
        );

      case "moveSheet":
        return this.host_action(transaction, operation, "move-sheet", undefined, operation.to, []);

      case "setSheetVisibility": {
        const visibility = operation.visibility;
        return this.host_action(
          transaction,
          operation,
          "set-sheet-visibility",
          undefined,
          visibility,
          [],
        );
      }

      case "setSheetMeta":
        return this.metadata(transaction, operation, "sheet");

      case "addTable":
      case "updateTable":
      case "removeTable":
        return this.metadata(transaction, operation, "table");

      case "setValidationRule":
      case "removeValidationRule":
        return this.metadata(transaction, operation, "validation");

      case "setHyperlink":
      case "removeHyperlink":
        return this.metadata(transaction, operation, "hyperlink");

      case "setProtectedRange":
      case "removeProtectedRange":
        return this.metadata(transaction, operation, "protected-range");

      case "setNote": {
        const row_ids = [this.row_id(operation.addr.sheet, operation.addr.row)];
        return this.metadata(transaction, operation, "note", row_ids);
      }

      case "setNamedRange":
      case "removeNamedRange":
        return this.metadata(transaction, operation, "named-range");

      case "setCalculation":
      case "setExternalLinks":
        return this.metadata(transaction, operation, "calculation");

      case "setRelationship":
      case "removeRelationship":
        return this.metadata(transaction, operation, "relationship");

      case "setMeasure":
      case "removeMeasure":
        return this.metadata(transaction, operation, "measure");

      case "setQuery":
      case "removeQuery":
        return this.metadata(transaction, operation, "query");

      case "setChart":
      case "removeChart":
        return this.metadata(transaction, operation, "chart");

      case "setDashboardItem":
      case "removeDashboardItem":
        return this.metadata(transaction, operation, "dashboard");

      case "setPivot":
      case "removePivot":
        return this.metadata(transaction, operation, "pivot");

      default:
        return assert_never(operation);
    }
  }

  /** Paste and fill commits report their cell writes as paste or fill deltas. */
  private cell_delta(
    operation: Extract<DocumentOp, { op: "set" }>,
    transaction: RowBridgeTransaction,
    change_queues: Map<string, CellChange[]>,
  ): RowBridgeDelta<Id> {
    const cells = this.cells_for(operation, change_queues);
    const cell = cells[0];
    const row_ids = cell ? [cell.rowId] : [];
    const base = this.base(transaction, operation, cell?.previous, cell?.next, row_ids);
    const kind = write_delta_kind(transaction.commitReason);
    if (kind !== undefined) return { ...base, kind, range: operation_range(operation), cells };

    if (!cell) throw new Error("Sheetwrite: a cell write projects exactly one cell");

    return { ...base, kind: "cell", cell };
  }

  private range_delta(
    operation: Extract<
      DocumentOp,
      { op: "setRange" | "setBlock" | "restoreBlock" | "permuteRows" }
    >,
    transaction: RowBridgeTransaction,
    change_queues: Map<string, CellChange[]>,
  ): RowBridgeDelta<Id> {
    const cells = this.cells_for(operation, change_queues);
    const base = this.cells_base(transaction, operation, cells);
    const kind = write_delta_kind(transaction.commitReason) ?? "range";
    return { ...base, kind, range: operation.range, cells };
  }

  private cells_base(
    transaction: RowBridgeTransaction,
    operation: DocumentOp,
    cells: readonly RowBridgeCell<Id>[],
  ): RowBridgeDeltaBase<Id> {
    return this.base(
      transaction,
      operation,
      cells.map((cell) => cell.previous),
      cells.map((cell) => cell.next),
      cells.map((cell) => cell.rowId),
    );
  }

  private insert_rows(
    operation: Extract<DocumentOp, { op: "addRows" }>,
    transaction: RowBridgeTransaction,
  ): RowBridgeDelta<Id> {
    const state = this.state(operation.sheet);
    const inserted = this.inserted_row_ids(operation, transaction, state);
    state?.rowIds.splice(operation.at, 0, ...inserted);
    for (const id of inserted) if (id !== null) state?.rowIdSet.add(id);

    const base = this.base(transaction, operation, [], inserted, inserted);
    return {
      ...base,
      kind: "row-structure",
      action: "insert",
      sheet: operation.sheet,
      at: operation.at,
      count: operation.count,
      inserted,
      removed: [],
    };
  }

  /** Host row IDs for inserted rows; every ID must be new to the sheet. */
  private inserted_row_ids(
    operation: Extract<DocumentOp, { op: "addRows" }>,
    transaction: RowBridgeTransaction,
    state: MutableSheetState<Id> | null,
  ): Array<Id | null> {
    const inserted: Array<Id | null> = [];
    const inserted_ids = new Set<Id>();

    for (let offset = 0; offset < operation.count; offset += 1) {
      if (!this.create_row_id) {
        inserted.push(null);
        continue;
      }

      const id = this.create_row_id({
        sheet: operation.sheet,
        at: operation.at,
        offset,
        transactionId: transaction.id,
      });

      if (typeof id !== "string" && typeof id !== "number") {
        throw new SheetwriteError(
          "invalid-argument",
          "row-bridge",
          "Sheetwrite: createRowId must return a stable string or number",
        );
      }

      if (state?.rowIdSet.has(id) || inserted_ids.has(id)) {
        throw new SheetwriteError(
          "invalid-argument",
          "row-bridge",
          `Sheetwrite: duplicate inserted row ID "${String(id)}"`,
        );
      }

      inserted_ids.add(id);
      inserted.push(id);
    }

    return inserted;
  }

  private remove_rows(
    operation: Extract<DocumentOp, { op: "removeRows" }>,
    transaction: RowBridgeTransaction,
  ): RowBridgeDelta<Id> {
    const state = this.state(operation.sheet);
    const removed = state?.rowIds.splice(operation.at, operation.count) ?? [];
    for (const id of removed) if (id !== null) state?.rowIdSet.delete(id);

    const base = this.base(transaction, operation, removed, [], removed);
    return {
      ...base,
      kind: "row-structure",
      action: "delete",
      sheet: operation.sheet,
      at: operation.at,
      count: operation.count,
      inserted: [],
      removed,
    };
  }

  private move_rows(
    operation: Extract<DocumentOp, { op: "moveRows" }>,
    transaction: RowBridgeTransaction,
  ): RowBridgeDelta<Id> {
    // Reordering keeps the same identities, so `rowIdSet` needs no update.
    const state = this.state(operation.sheet);
    const moved = state?.rowIds.splice(operation.from, operation.count) ?? [];
    state?.rowIds.splice(operation.to, 0, ...moved);

    const base = this.base(transaction, operation, moved, moved, moved);
    return {
      ...base,
      kind: "row-structure",
      action: "move",
      sheet: operation.sheet,
      at: operation.to,
      from: operation.from,
      to: operation.to,
      count: operation.count,
      inserted: moved,
      removed: [],
    };
  }

  private host_action(
    transaction: RowBridgeTransaction,
    operation: DocumentOp,
    action: RowBridgeHostActionDelta["action"],
    previous: unknown,
    next: unknown,
    row_ids: readonly (Id | null)[],
  ): RowBridgeHostActionDelta<Id> {
    return {
      ...this.base(transaction, operation, previous, next, row_ids),
      kind: "host-action",
      action,
    };
  }

  private sheet_state_for_snapshot(snapshot: SheetSnapshot): MutableSheetState<Id> {
    return {
      rowIds: new Array<Id | null>(snapshot.rowCount).fill(null),
      rowIdSet: new Set<Id>(),
      columns: snapshot.columns.map((column) => column.key),
    };
  }

  private metadata(
    transaction: RowBridgeTransaction,
    operation: DocumentOp,
    metadata: RowBridgeMetadataDelta["metadata"],
    row_ids: readonly (Id | null)[] = [],
  ): RowBridgeMetadataDelta<Id> {
    return {
      ...this.base(transaction, operation, undefined, operation, row_ids),
      kind: "metadata",
      metadata,
    };
  }
}

/**
 * Create a typed bridge while preserving row and identity inference.
 *
 * @example
 * ```ts
 * import { createRowBridge } from "@sheetwrite/core";
 *
 * const bridge = createRowBridge({
 *   columns: [{ key: "amount" }],
 *   defaultRows: [{ id: "order-1", amount: 12 }],
 *   getRowId: (row) => row.id,
 * });
 * ```
 * @param options - Your rows, their IDs and the columns they show.
 * @returns A new bridge; the same as `new RowBridge(options)`.
 * @see RowBridgeOptions
 * @see RowBridge
 */
export function createRowBridge<
  Row extends Record<string, CellScalar>,
  Id extends RowBridgeId = RowBridgeId,
>(options: RowBridgeOptions<Row, Id>): RowBridge<Id> {
  return new RowBridge(options);
}

/**
 * Compute a deterministic identity for a canonical transaction.
 *
 * @param transaction - The transaction's patches and epoch.
 * @returns The ID, the same for the same patches and epoch.
 */
export function rowBridgeTransactionId(
  transaction: Pick<Transaction, "patches" | "epoch">,
): string {
  return transaction_id_for(transaction.epoch, stable_json(transaction.patches));
}
