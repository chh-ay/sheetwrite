import type {
  CellAddress,
  ChangeEvent,
  DataValidationRule,
  Grid,
  GridConfig,
  GridEvents,
  ProtectedRange,
  ProtectionResolver,
  Range,
  Selection,
} from "@sheetwrite/core";
import { cellA1, MemoryPersistenceAdapter, SyncCoordinator } from "@sheetwrite/core";
import workerUrl from "@sheetwrite/core/worker?worker&url";
import type { GridReadyEvent } from "@sheetwrite/vue";
import { SheetwriteGrid } from "@sheetwrite/vue";
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  type FunctionalComponent,
} from "vue";

import { iconHref } from "../icons/icon-href.js";
import type { IconName } from "../icons/icon-names.js";
import { createActionGuard, type ActionState } from "../lib/action-guard.js";
import { observeSiteTheme } from "../lib/site-theme.js";
import {
  BUSINESS_DOCUMENT_ID,
  BUSINESS_ROWS,
  BUSINESS_THEME,
  businessSuppliersSeedOps,
  createBusinessData,
  createBusinessWorkbook,
} from "./scenarios/business.js";

import "@sheetwrite/vue/styles.css";
import type { RenderingMode } from "./ui/rendering-mode.js";

/** A decorative icon from the Sheetwrite sprite; the text beside it carries the meaning. */
function sheetwrite_icon(name: IconName) {
  return h("svg", { class: "sw-icon", "aria-hidden": "true", focusable: "false" }, [
    h("use", { href: iconHref(name) }),
  ]);
}

// The scenario module owns the governed workbook (validation rules, protected
// totals, notes, merges, frozen panes). This component owns what Vue is for:
// reactive configuration bound to adapter props, structured rejection state,
// notes/metadata and workbook operations through the public Grid API, and a
// host persistence pipeline mirrored into plain refs. The in-memory reference
// adapter demonstrates host state only — the durable IndexedDB protocol proof
// lives at /showcases/database/.

interface VueGridHandle {
  grid: Grid | null;
}

declare global {
  interface Window {
    __sheetwriteVueWorkbench?: { grid: Grid };
  }
}

type HostRole = "reviewer" | "finance-lead";
type FeedKind = "event" | "rejected" | "lifecycle" | "sync";
type TaskId =
  | "validation"
  | "protection"
  | "change"
  | "notes"
  | "formatting"
  | "sheets"
  | "persistence"
  | "renderer";
type ChallengeState = "ready" | "rejected" | "authorized" | "accepted";

interface FeedEntry {
  key: number;
  kind: FeedKind;
  code: string;
  detail: string;
}

/** Hoisted: a stable identity means the adapter never reconfigures chrome per render. */
const GRID_CONFIG: GridConfig = {
  toolbar: true,
  contextMenu: [
    { action: "copy", label: "Copy account value" },
    { action: "paste" },
    { action: "clearContents" },
    { action: "separator" },
    { action: "exportXlsx", label: "Export business workbook" },
  ],
};
/** The rail log shows the newest entries the 640px rail holds without a scroll. */
const FEED_LIMIT = 5;
const ARCHIVE_SHEET_ID = "archive";
const CHALLENGE_CELL: CellAddress = { sheet: "orders", row: 0, col: 6 };
const CHALLENGE_VALUE = 999;
/** One header readout, one word per challenge state. */
const CHALLENGE_LABELS: Record<ChallengeState, string> = {
  ready: "Awaiting attempt",
  rejected: "Rejected",
  authorized: "Authorized",
  accepted: "Accepted",
};
const TASKS: ReadonlyArray<{ id: TaskId; label: string }> = [
  { id: "validation", label: "Validation" },
  { id: "protection", label: "Protection" },
  { id: "change", label: "Change" },
  { id: "notes", label: "Notes" },
  { id: "formatting", label: "Formatting" },
  { id: "sheets", label: "Sheets" },
  { id: "persistence", label: "Persistence" },
  { id: "renderer", label: "Renderer" },
];

const integer = new Intl.NumberFormat("en-US");

function describe_value(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(blank)";
  if (typeof value === "number") return integer.format(value);
  return String(value);
}

// Declared business columns fit the stage beside the 23rem rail down to a
// 1280px viewport (760px of columns plus the 48px row gutter), so the
// protected Total column stays visible without scrolling to it.
const STAGE_COLUMN_WIDTHS: ReadonlyArray<ReadonlyArray<number>> = [
  [76, 170, 110, 104, 64, 100, 136],
  [300, 240, 220],
];
const ARCHIVE_COLUMN_WIDTHS = [380, 380] as const;

function create_workbench_workbook() {
  const workbook = createBusinessWorkbook();
  for (const [sheet_index, sheet] of workbook.sheets.entries()) {
    const widths = STAGE_COLUMN_WIDTHS[sheet_index];
    for (const [column_index, column] of sheet.columns.entries()) {
      column.width = widths?.[column_index] ?? column.width;
    }
  }
  return workbook;
}

/**
 * Workbench state and lifetime: the Grid handle, reset-bound adapter inputs,
 * sync, permissions and every task panel's controls. Call it from `setup()`.
 */
function use_vue_workbench() {
  const grid_component = shallowRef<VueGridHandle | null>(null);

  // Reset-bound adapter inputs. Replacing any of them rebuilds the Grid, so
  // they are regenerated together and only while nothing is pending.
  const workbook = shallowRef(create_workbench_workbook());
  const data = shallowRef(createBusinessData());
  const mutation_policy = ref<"atomic" | "partial">("atomic");
  const renderer_mode = ref<RenderingMode>("canvas");

  // Live adapter inputs — plain reactive state, no Grid replacement.
  const read_only = ref(false);
  const role = ref<HostRole>("reviewer");

  // Adapter lifecycle state published by @ready.
  const ready = ref(false);
  const generation = ref(0);
  const ready_reason = ref("—");
  const boot_error = ref<string | null>(null);
  const reset_state = shallowRef<ActionState>({ pending: false, error: null });
  const reset_action = createActionGuard((state) => {
    reset_state.value = state;
  });
  let complete_reset: (() => void) | undefined;
  let fail_reset: ((cause: unknown) => void) | undefined;

  // Inspector state for the focused cell.
  const selected = shallowRef<CellAddress | null>(null);
  const selected_value = ref("(blank)");
  const selected_rule = shallowRef<DataValidationRule | null>(null);
  const selected_protection = shallowRef<ProtectedRange | null>(null);
  const note_draft = ref("");
  const note_stored = ref<string | null>(null);

  // Workbook state mirrored from the document model.
  const sheets = ref<ReadonlyArray<{ id: string; name: string }>>([]);
  const active_sheet = ref("");
  const rename_draft = ref("");

  // Host persistence state mirrored from the sync pipeline.
  const pending_count = ref(0);
  const server_version = ref(0);
  const last_ack = ref("—");
  const sync_busy = ref(false);

  const feed = ref<FeedEntry[]>([]);
  const active_task = ref<TaskId>("protection");
  const challenge_state = ref<ChallengeState>("ready");
  const challenge_issue = ref("Protected totals require the finance-lead role.");

  const grid_of = () => grid_component.value?.grid ?? null;
  let sync: SyncCoordinator | null = null;
  let off_sync: (() => void) | null = null;
  let off_rejected: (() => void) | null = null;
  let mutation_sequence = 0;
  let feed_sequence = 0;

  /**
   * Host permission policy: stable identity, reactive decision. The barrier
   * consults it for every operation intersecting a protected range. Workbook
   * chrome remains available to reviewers, while protected cell content
   * requires the finance-lead role.
   */
  const protection_resolver: ProtectionResolver = (request) => {
    switch (request.operation.op) {
      case "addSheet":
      case "renameSheet":
      case "moveSheet":
      case "setSheetVisibility":
        return "allow";
      default:
        if (request.protectedRange.permissionKey !== "orders:totals") return "deny";
        return role.value === "finance-lead" ? "allow" : "deny";
    }
  };

  function push_feed(kind: FeedKind, code: string, detail: string): void {
    feed.value = [{ key: ++feed_sequence, kind, code, detail }, ...feed.value].slice(0, FEED_LIMIT);
  }

  function refresh_sync(): void {
    pending_count.value = sync?.pendingCount ?? 0;
    server_version.value = sync?.serverVersion ?? 0;
  }

  function refresh_workbook(): void {
    const grid = grid_of();
    if (!grid) return;
    const model = grid.store.getWorkbook();
    sheets.value = model.sheets.map((sheet) => ({ id: String(sheet.id), name: sheet.name }));
    active_sheet.value = String(grid.getActiveSheet());
    const active = model.sheets.find((sheet) => String(sheet.id) === active_sheet.value);
    rename_draft.value = active?.name ?? "";
  }

  function refresh_inspector(): void {
    const grid = grid_of();
    const addr = selected.value;
    if (!grid || !addr) {
      selected_value.value = "(blank)";
      selected_rule.value = null;
      selected_protection.value = null;
      note_stored.value = null;
      note_draft.value = "";
      return;
    }
    selected_value.value = describe_value(grid.store.getCell(addr).resolved);
    const sheet = grid.store.getWorkbook().sheets.find((entry) => entry.id === addr.sheet);
    const covers = (range: Range) =>
      range.sheet === addr.sheet &&
      addr.row >= Math.min(range.start.row, range.end.row) &&
      addr.row <= Math.max(range.start.row, range.end.row) &&
      addr.col >= Math.min(range.start.col, range.end.col) &&
      addr.col <= Math.max(range.start.col, range.end.col);
    selected_rule.value = sheet?.validationRules?.find((rule) => covers(rule.range)) ?? null;
    selected_protection.value =
      sheet?.protectedRanges?.find((range) => covers(range.range)) ?? null;
    note_stored.value = grid.getNote(addr);
    note_draft.value = note_stored.value ?? "";
  }

  const selected_label = computed(() =>
    selected.value === null
      ? "none"
      : `${String(selected.value.sheet)}!${cellA1(selected.value.row, selected.value.col)}`,
  );

  const access_label = computed(() => {
    if (selected.value === null) return { text: "—", tone: "allow" as const };
    if (read_only.value) return { text: "read-only grid", tone: "deny" as const };
    if (selected_protection.value === null) return { text: "editable", tone: "allow" as const };
    return role.value === "finance-lead"
      ? { text: "override allowed (finance lead)", tone: "allow" as const }
      : {
          text: `locked · ${selected_protection.value.label ?? "protected"}`,
          tone: "deny" as const,
        };
  });

  const persist_state = computed(() => {
    if (sync_busy.value) {
      return { text: `Committing to host · v${server_version.value}`, state: "pending" as const };
    }
    return pending_count.value === 0
      ? { text: `All changes on host · v${server_version.value}`, state: "synced" as const }
      : {
          text: `${pending_count.value} pending commit(s) · host v${server_version.value}`,
          state: "pending" as const,
        };
  });

  function bind_host_persistence(grid: Grid): void {
    off_sync?.();
    sync?.destroy();
    // The suppliers directory and row metadata are part of the seed, not
    // local work: apply them as remote input, then hand the identical
    // snapshot to the reference adapter so client and host start at v0.
    grid.applyRemoteOperations(businessSuppliersSeedOps());
    const adapter = new MemoryPersistenceAdapter({
      ...grid.exportSnapshot(),
      documentId: BUSINESS_DOCUMENT_ID,
      version: 0,
    });
    sync = new SyncCoordinator(grid, adapter, {
      documentId: BUSINESS_DOCUMENT_ID,
      serverVersion: 0,
      createMutationId: () => `vue-biz-${++mutation_sequence}`,
    });
    off_sync = sync.on((event) => {
      refresh_sync();
      if (event.type === "pending") {
        push_feed(
          "sync",
          "sync",
          `queued ${event.mutation.clientMutationId} at v${event.mutation.baseVersion}`,
        );
      } else if (event.type === "acknowledged") {
        last_ack.value = `${event.clientMutationId} → v${event.version}${event.duplicate ? " (duplicate)" : ""}`;
        push_feed("sync", "sync", `acknowledged ${last_ack.value}`);
      } else if (event.type === "conflict") {
        push_feed("rejected", "sync", `conflict · host v${event.response.currentVersion}`);
      }
    });
    last_ack.value = "—";
    refresh_sync();
  }

  function on_ready(event: GridReadyEvent): void {
    const grid = event.grid;
    generation.value = event.generation;
    ready_reason.value = event.reason;
    ready.value = true;
    boot_error.value = null;
    window.__sheetwriteVueWorkbench = { grid };
    off_rejected?.();
    off_rejected = grid.on("mutation-rejected", ({ issues }) => {
      for (const issue of issues) {
        const detail =
          issue.kind === "validation"
            ? `${issue.ruleId} · ${issue.message}`
            : issue.kind === "protection"
              ? `${issue.protectedRangeId} · ${issue.message}`
              : issue.message;
        push_feed("rejected", "mutation-rejected", detail);
        challenge_issue.value = detail;
      }
      challenge_state.value = "rejected";
      active_task.value = "protection";
      refresh_inspector();
    });
    bind_host_persistence(grid);
    refresh_workbook();
    grid.setSelection({ kind: "cell", addr: CHALLENGE_CELL });
    refresh_inspector();
    complete_reset?.();
    complete_reset = undefined;
    fail_reset = undefined;
    push_feed("lifecycle", "@ready", `generation ${event.generation} (${event.reason})`);
  }

  function on_grid_change(event: ChangeEvent): void {
    push_feed(
      "event",
      "@grid-change",
      `${event.source} · ${event.commitReason} · ${event.transaction.patches.length} op(s)`,
    );
    refresh_sync();
    refresh_workbook();
    refresh_inspector();
    const committed_challenge = event.transaction.patches.some(
      (patch) =>
        patch.op === "set" &&
        patch.addr.sheet === CHALLENGE_CELL.sheet &&
        patch.addr.row === CHALLENGE_CELL.row &&
        patch.addr.col === CHALLENGE_CELL.col &&
        patch.value.kind === "literal" &&
        patch.value.value === CHALLENGE_VALUE,
    );
    if (role.value === "finance-lead" && committed_challenge) {
      challenge_state.value = "accepted";
      challenge_issue.value = `orders!G1 now ${CHALLENGE_VALUE}; host commit queued.`;
      active_task.value = "protection";
    }
  }

  function on_selection_change(value: Selection | null): void {
    selected.value = value?.kind === "cell" ? value.addr : null;
    refresh_inspector();
  }

  function set_role(next: HostRole): void {
    role.value = next;
    if (next === "finance-lead" && challenge_state.value === "rejected") {
      challenge_state.value = "authorized";
      challenge_issue.value =
        "Finance lead authorized. Commit the same G1 override to prove the policy changed.";
    }
    refresh_inspector();
  }

  function commit_challenge(): void {
    const grid = grid_of();
    if (!grid || !ready.value) return;
    grid.setActiveSheet("orders");
    grid.setSelection({ kind: "cell", addr: CHALLENGE_CELL });
    grid.scrollToCell(CHALLENGE_CELL);
    grid.applyTransaction({
      patches: [
        {
          op: "set",
          addr: CHALLENGE_CELL,
          value: { kind: "literal", value: CHALLENGE_VALUE },
        },
      ],
    });
  }

  async function sync_to_host(): Promise<void> {
    if (!sync || sync_busy.value) return;
    sync_busy.value = true;
    try {
      for (let guard = 0; guard < 64; guard++) {
        const head = sync.pendingCommits().find((record) => record.status === "pending");
        if (!head) break;
        await sync.send(head.clientMutationId);
      }
    } catch (error) {
      push_feed("rejected", "sync", `send failed: ${String(error)}`);
    } finally {
      sync_busy.value = false;
      refresh_sync();
    }
  }

  function save_note(clear: boolean): void {
    const grid = grid_of();
    const addr = selected.value;
    if (!grid || !addr) return;
    const text = clear ? null : note_draft.value.trim() === "" ? null : note_draft.value.trim();
    grid.setNote(addr, text);
  }

  function rename_active_sheet(): void {
    const grid = grid_of();
    const name = rename_draft.value.trim();
    if (!grid || name === "") return;
    grid.renameSheet(grid.getActiveSheet(), name);
  }

  function add_archive_sheet(): void {
    const grid = grid_of();
    if (!grid || sheets.value.some((sheet) => sheet.id === ARCHIVE_SHEET_ID)) return;
    const result = grid.addSheet({
      id: ARCHIVE_SHEET_ID,
      name: "Archive FY25",
      rowCount: 20,
      columns: [
        { key: "po", header: "PO", width: ARCHIVE_COLUMN_WIDTHS[0], type: "text" },
        { key: "closed", header: "Closed", width: ARCHIVE_COLUMN_WIDTHS[1], type: "text" },
      ],
    });
    if (result.status === "applied") grid.setActiveSheet(result.sheet);
  }

  function open_suppliers(): void {
    grid_of()?.setActiveSheet("suppliers");
  }

  function reset_grid_input(code: string, detail: string): void {
    void reset_action.run(
      () =>
        new Promise<void>((resolve, reject) => {
          complete_reset = resolve;
          fail_reset = reject;
          ready.value = false;
          boot_error.value = null;
          challenge_state.value = "ready";
          challenge_issue.value = "Protected totals require the finance-lead role.";
          workbook.value = create_workbench_workbook();
          data.value = createBusinessData();
          push_feed("lifecycle", code, detail);
        }),
      () => "Cannot rebuild the workbook. Try loading it again.",
    );
  }

  function toggle_policy(): void {
    if (!ready.value || pending_count.value > 0) return;
    mutation_policy.value = mutation_policy.value === "atomic" ? "partial" : "atomic";
    reset_grid_input(
      ":mutation-policy",
      `${mutation_policy.value} — reset-bound input, grid rebuilds`,
    );
  }

  function set_renderer(next: RenderingMode): void {
    if (!ready.value || pending_count.value > 0 || renderer_mode.value === next) return;
    renderer_mode.value = next;
    reset_grid_input(":renderer", `${next} — reset-bound input, grid rebuilds`);
  }

  let stop_observing_theme: (() => void) | null = null;
  onMounted(() => {
    stop_observing_theme = observeSiteTheme(() => grid_of()?.replaceTheme(BUSINESS_THEME));
  });

  onBeforeUnmount(() => {
    stop_observing_theme?.();
    off_sync?.();
    off_rejected?.();
    sync?.destroy();
    sync = null;
    delete window.__sheetwriteVueWorkbench;
  });

  const inspector_rows = () => [
    h("div", [h("dt", "Cell"), h("dd", selected_label.value)]),
    h("div", [h("dt", "Value"), h("dd", selected_value.value)]),
    h("div", [
      h("dt", "Rule"),
      h(
        "dd",
        selected_rule.value ? `${selected_rule.value.id} · ${selected_rule.value.policy}` : "none",
      ),
    ]),
    h("div", [
      h("dt", "Access"),
      h("dd", { "data-tone": access_label.value.tone }, access_label.value.text),
    ]),
  ];

  function task_tab(task: (typeof TASKS)[number], index: number) {
    const active = active_task.value === task.id;
    return h(
      "button",
      {
        id: `vue-task-${task.id}`,
        type: "button",
        role: "tab",
        tabindex: active ? 0 : -1,
        "aria-selected": active,
        "aria-controls": `vue-panel-${task.id}`,
        onClick: () => {
          active_task.value = task.id;
        },
        onKeydown: (event: KeyboardEvent) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? TASKS.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + TASKS.length) % TASKS.length;
          const next_task = TASKS[next];
          if (!next_task) return;

          active_task.value = next_task.id;
          requestAnimationFrame(() => document.getElementById(`vue-task-${next_task.id}`)?.focus());
        },
      },
      task.label,
    );
  }

  function panel_attrs(id: TaskId) {
    return {
      id: `vue-panel-${id}`,
      class: "sw-vuewb-taskpanel",
      role: "tabpanel",
      "aria-labelledby": `vue-task-${id}`,
      hidden: active_task.value !== id,
    };
  }

  const event_feed = () =>
    h(
      "ol",
      { class: "sw-vuewb-feed", "data-testid": "feed", "aria-label": "Adapter events" },
      feed.value.length > 0
        ? feed.value.map((entry) =>
            h("li", { key: entry.key, "data-kind": entry.kind }, [
              h("code", entry.code),
              h("span", entry.detail),
            ]),
          )
        : [
            h("li", { "data-kind": "event" }, [
              h("code", "feed"),
              h("span", "Interact with the workbook to populate this feed."),
            ]),
          ],
    );

  function on_initialization_error(error: unknown): void {
    ready.value = false;
    boot_error.value = "Cannot load the workbook. Try loading it again.";
    fail_reset?.(error);
    complete_reset = undefined;
    fail_reset = undefined;
    push_feed("rejected", "@initialization-error", String(error));
  }

  return {
    gridComponent: grid_component,
    workbook,
    data,
    mutationPolicy: mutation_policy,
    rendererMode: renderer_mode,
    readOnly: read_only,
    role,
    ready,
    generation,
    bootError: boot_error,
    resetState: reset_state,
    onInitializationError: on_initialization_error,
    pendingCount: pending_count,
    serverVersion: server_version,
    feed,
    challengeState: challenge_state,
    protectionResolver: protection_resolver,
    pushFeed: push_feed,
    refreshWorkbook: refresh_workbook,
    selectedLabel: selected_label,
    onReady: on_ready,
    onGridChange: on_grid_change,
    onSelectionChange: on_selection_change,
    setRole: set_role,
    commitChallenge: commit_challenge,
    resetGridInput: reset_grid_input,
    taskTab: task_tab,
    eventFeed: event_feed,
    selectedRule: selected_rule,
    inspectorRows: inspector_rows,
    panelAttrs: panel_attrs,
    challengeIssue: challenge_issue,
    selected,
    noteDraft: note_draft,
    noteStored: note_stored,
    accessLabel: access_label,
    saveNote: save_note,
    sheets,
    activeSheet: active_sheet,
    renameDraft: rename_draft,
    renameActiveSheet: rename_active_sheet,
    addArchiveSheet: add_archive_sheet,
    openSuppliers: open_suppliers,
    readyReason: ready_reason,
    lastAck: last_ack,
    syncBusy: sync_busy,
    persistState: persist_state,
    syncToHost: sync_to_host,
    togglePolicy: toggle_policy,
    setRenderer: set_renderer,
  };
}

type VueWorkbench = ReturnType<typeof use_vue_workbench>;

/** The validation task panel. */
const ValidationPanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const {
    selectedRule: selected_rule,
    inspectorRows: inspector_rows,
    panelAttrs: panel_attrs,
  } = workbench;

  return h("section", panel_attrs("validation"), [
    h("div", { class: "sw-vuewb-section__head" }, [
      h("div", [
        h("h3", "Validation"),
        h("p", "The selected cell resolves its workbook rule before any commit."),
      ]),
    ]),
    h("dl", { class: "sw-vuewb-inspector" }, inspector_rows()),
    h(
      "div",
      {
        class: "sw-vuewb-task-summary",
        "data-state": selected_rule.value ? "active" : "idle",
      },
      [
        h("strong", selected_rule.value ? selected_rule.value.id : "No rule on this cell"),
        h(
          "span",
          selected_rule.value
            ? `${selected_rule.value.policy} validation is enforced at the mutation barrier.`
            : "Select a Status or Quantity cell to inspect its validation contract.",
        ),
      ],
    ),
  ]);
};

/** The protection task panel. */
const ProtectionPanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const {
    role,
    challengeState: challenge_state,
    challengeIssue: challenge_issue,
    setRole: set_role,
    inspectorRows: inspector_rows,
    panelAttrs: panel_attrs,
  } = workbench;

  return h("section", panel_attrs("protection"), [
    h("div", { class: "sw-vuewb-challenge__head" }, [
      h("span", "PROTECTED EDIT"),
      h("strong", "Override the protected G1 total"),
    ]),
    h("dl", { class: "sw-vuewb-inspector", "data-testid": "inspector" }, inspector_rows()),
    h(
      "output",
      {
        class: "sw-vuewb-policy-result",
        "data-testid": "policy-result",
        "data-state": challenge_state.value,
        role: challenge_state.value === "rejected" ? "alert" : "status",
        "aria-live": "polite",
      },
      [
        h(
          "strong",
          challenge_state.value === "accepted"
            ? "Accepted"
            : challenge_state.value === "rejected"
              ? "Rejected"
              : challenge_state.value === "authorized"
                ? "Role changed"
                : "Protected",
        ),
        h("span", challenge_issue.value),
      ],
    ),
    h("ol", { class: "sw-vuewb-steps", "aria-label": "Protected edit workflow" }, [
      h("li", { "data-state": challenge_state.value === "ready" ? "current" : "done" }, [
        h("span", "1"),
        h("div", [h("strong", "Attempt"), h("small", "G1 = 999")]),
      ]),
      h(
        "li",
        {
          "data-state":
            challenge_state.value === "rejected"
              ? "current"
              : challenge_state.value === "authorized" || challenge_state.value === "accepted"
                ? "done"
                : "waiting",
        },
        [h("span", "2"), h("div", [h("strong", "Authorize"), h("small", "Finance lead")])],
      ),
      h("li", { "data-state": challenge_state.value === "accepted" ? "done" : "waiting" }, [
        h("span", "3"),
        h("div", [h("strong", "Commit"), h("small", "Queue mutation")]),
      ]),
    ]),
    h("div", { class: "sw-vuewb-challenge__actions" }, [
      h(
        "button",
        {
          type: "button",
          "data-testid": "challenge-authorize",
          disabled: role.value === "finance-lead" || challenge_state.value === "accepted",
          onClick: () => set_role("finance-lead"),
        },
        "Authorize finance lead",
      ),
    ]),
  ]);
};

/** The change task panel. */
const ChangePanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const {
    pendingCount: pending_count,
    serverVersion: server_version,
    challengeState: challenge_state,
    challengeIssue: challenge_issue,
    selectedLabel: selected_label,
    panelAttrs: panel_attrs,
  } = workbench;

  return h("section", panel_attrs("change"), [
    h("div", { class: "sw-vuewb-section__head" }, [
      h("div", [h("h3", "Change"), h("p", "Policy outcome and host work stay causally adjacent.")]),
    ]),
    h("div", { class: "sw-vuewb-task-summary", "data-state": challenge_state.value }, [
      h(
        "strong",
        challenge_state.value === "accepted"
          ? "Mutation queued"
          : challenge_state.value === "rejected"
            ? "Mutation rejected"
            : "Awaiting governed edit",
      ),
      h("span", challenge_issue.value),
    ]),
    h("dl", { class: "sw-vuewb-change-meters" }, [
      h("div", [h("dt", "Cell"), h("dd", selected_label.value)]),
      h("div", [h("dt", "Pending"), h("dd", String(pending_count.value))]),
      h("div", [h("dt", "Host"), h("dd", `v${server_version.value}`)]),
    ]),
    h(
      "p",
      { class: "sw-vuewb-taskhint" },
      "The header action writes 999 into G1. A rejected attempt leaves the cell untouched.",
    ),
  ]);
};

/** The notes task panel. */
const NotesPanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const {
    readOnly: read_only,
    selected,
    noteDraft: note_draft,
    noteStored: note_stored,
    selectedLabel: selected_label,
    accessLabel: access_label,
    saveNote: save_note,
    inspectorRows: inspector_rows,
    panelAttrs: panel_attrs,
  } = workbench;

  return h("section", panel_attrs("notes"), [
    h("div", { class: "sw-vuewb-section__head" }, [
      h("div", [
        h("h3", "Notes"),
        h("p", `Selected ${selected_label.value} · ${access_label.value.text}`),
      ]),
    ]),
    h("dl", { class: "sw-vuewb-inspector sw-vuewb-inspector--compact" }, inspector_rows()),
    h("div", { class: "sw-vuewb-note" }, [
      h("label", { for: "vue-cell-note" }, "Selected-cell note"),
      h("textarea", {
        id: "vue-cell-note",
        "data-testid": "note-input",
        placeholder: selected.value === null ? "Select a cell to annotate" : "Add a note…",
        disabled: selected.value === null || read_only.value,
        value: note_draft.value,
        onInput: (event: Event) => {
          note_draft.value = (event.target as HTMLTextAreaElement).value;
        },
      }),
      h("div", { class: "sw-vuewb-note__actions" }, [
        h(
          "button",
          {
            type: "button",
            "data-testid": "note-save",
            disabled: selected.value === null || read_only.value,
            onClick: () => save_note(false),
          },
          "Save note",
        ),
        h(
          "button",
          {
            type: "button",
            "data-testid": "note-clear",
            disabled: selected.value === null || read_only.value || note_stored.value === null,
            onClick: () => save_note(true),
          },
          "Clear",
        ),
      ]),
    ]),
  ]);
};

/** The formatting task panel. */
const FormattingPanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const { inspectorRows: inspector_rows, panelAttrs: panel_attrs } = workbench;

  return h("section", panel_attrs("formatting"), [
    h("div", { class: "sw-vuewb-section__head" }, [
      h("div", [
        h("h3", "Format the live selection"),
        h("p", "Use the Grid toolbar above the rows; style commits enter the same host queue."),
      ]),
    ]),
    h("dl", { class: "sw-vuewb-inspector" }, inspector_rows()),
    h("p", { class: "sw-vuewb-taskhint" }, [
      h("strong", "Try this: "),
      "select Supplier, press Bold, then inspect Pending in the Persistence task.",
    ]),
  ]);
};

/** The sheets task panel. */
const SheetsPanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const {
    readOnly: read_only,
    ready,
    sheets,
    activeSheet: active_sheet,
    renameDraft: rename_draft,
    renameActiveSheet: rename_active_sheet,
    addArchiveSheet: add_archive_sheet,
    openSuppliers: open_suppliers,
    panelAttrs: panel_attrs,
  } = workbench;

  return h("section", panel_attrs("sheets"), [
    h("div", { class: "sw-vuewb-section__head" }, [
      h("div", [
        h("h3", "Sheet operations"),
        h("p", "Rename, add, or open through the public Grid API."),
      ]),
    ]),
    h("div", { class: "sw-vuewb-workbook" }, [
      h(
        "p",
        { class: "sw-vuewb-workbook__state", "data-testid": "workbook-state" },
        `${sheets.value.length} sheet(s) · active ${active_sheet.value || "—"}`,
      ),
      h("div", { class: "sw-vuewb-workbook__rename" }, [
        h("input", {
          type: "text",
          "data-testid": "rename-input",
          "aria-label": "Active sheet name",
          disabled: !ready.value || read_only.value,
          value: rename_draft.value,
          onInput: (event: Event) => {
            rename_draft.value = (event.target as HTMLInputElement).value;
          },
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === "Enter") rename_active_sheet();
          },
        }),
        h(
          "button",
          {
            type: "button",
            "data-testid": "rename-apply",
            disabled: !ready.value || read_only.value,
            onClick: rename_active_sheet,
          },
          "Rename",
        ),
      ]),
      h("div", { class: "sw-vuewb-workbook__row" }, [
        h(
          "button",
          {
            type: "button",
            "data-testid": "add-sheet",
            disabled:
              !ready.value ||
              read_only.value ||
              sheets.value.some((sheet) => sheet.id === ARCHIVE_SHEET_ID),
            onClick: add_archive_sheet,
          },
          sheets.value.some((sheet) => sheet.id === ARCHIVE_SHEET_ID)
            ? "Archive added"
            : "Add archive sheet",
        ),
        h(
          "button",
          {
            type: "button",
            "data-testid": "open-suppliers",
            disabled: !ready.value,
            onClick: open_suppliers,
          },
          "Open suppliers",
        ),
      ]),
    ]),
    h(
      "p",
      { class: "sw-vuewb-taskhint" },
      "The Grid tab strip above the rows drives the same document model as these controls.",
    ),
  ]);
};

/** The persistence task panel. */
const PersistencePanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const {
    generation,
    readyReason: ready_reason,
    pendingCount: pending_count,
    serverVersion: server_version,
    lastAck: last_ack,
    syncBusy: sync_busy,
    persistState: persist_state,
    syncToHost: sync_to_host,
    panelAttrs: panel_attrs,
  } = workbench;

  return h("section", panel_attrs("persistence"), [
    h("div", { class: "sw-vuewb-section__head" }, [
      h("div", [
        h("h3", "Host persistence"),
        h("p", "Local document changes stay pending until acknowledged."),
      ]),
      h("a", { href: "/showcases/database/" }, ["Durable proof", sheetwrite_icon("arrow-right")]),
    ]),
    h("div", { class: "sw-vuewb-persist" }, [
      h(
        "output",
        {
          "data-testid": "persistence",
          "data-state": persist_state.value.state,
          "aria-live": "polite",
        },
        persist_state.value.text,
      ),
      h("dl", { class: "sw-vuewb-persist__meters" }, [
        h("div", [
          h("dt", "Pending"),
          h("dd", { "data-testid": "pending-count" }, String(pending_count.value)),
        ]),
        h("div", [
          h("dt", "Host version"),
          h("dd", { "data-testid": "server-version" }, `v${server_version.value}`),
        ]),
        h("div", [
          h("dt", "Generation"),
          h("dd", { "data-testid": "generation" }, `${generation.value} · ${ready_reason.value}`),
        ]),
      ]),
      h(
        "p",
        { class: "sw-vuewb-persist__ack", "data-testid": "last-ack" },
        `Last acknowledgement: ${last_ack.value}`,
      ),
      h(
        "button",
        {
          type: "button",
          "data-testid": "sync",
          "data-variant": "primary",
          disabled: pending_count.value === 0 || sync_busy.value,
          onClick: () => void sync_to_host(),
        },
        sync_busy.value ? "Committing…" : "Sync to host",
      ),
    ]),
    h(
      "p",
      { class: "sw-vuewb-taskhint" },
      "Sync acknowledges queued commits in order and advances the host version once each.",
    ),
  ]);
};

/** The renderer task panel. */
const RendererPanel: FunctionalComponent<{ workbench: VueWorkbench }> = ({ workbench }) => {
  const {
    mutationPolicy: mutation_policy,
    rendererMode: renderer_mode,
    readOnly: read_only,
    role,
    ready,
    generation,
    pendingCount: pending_count,
    pushFeed: push_feed,
    togglePolicy: toggle_policy,
    setRenderer: set_renderer,
    panelAttrs: panel_attrs,
  } = workbench;

  return h("section", panel_attrs("renderer"), [
    h("div", { class: "sw-vuewb-section__head" }, [
      h("div", [
        h("h3", "Renderer and adapter"),
        h("p", "Renderer changes rebuild the Vue-owned Grid; live props do not."),
      ]),
    ]),
    h("div", { class: "sw-vuewb-renderers", role: "group", "aria-label": "Renderer mode" }, [
      h(
        "button",
        {
          type: "button",
          "aria-pressed": renderer_mode.value === "canvas",
          disabled: !ready.value || pending_count.value > 0,
          onClick: () => set_renderer("canvas"),
        },
        "Canvas · main thread",
      ),
      h(
        "button",
        {
          type: "button",
          "aria-pressed": renderer_mode.value === "worker",
          disabled: !ready.value || pending_count.value > 0,
          onClick: () => set_renderer("worker"),
        },
        "Worker · off thread",
      ),
    ]),
    h("details", { class: "sw-vuewb-disclosure" }, [
      h("summary", "Adapter settings"),
      h("div", { class: "sw-vuewb-settings" }, [
        h(
          "button",
          {
            type: "button",
            "data-testid": "readonly",
            "aria-pressed": read_only.value,
            onClick: () => {
              read_only.value = !read_only.value;
              push_feed("event", ":read-only", String(read_only.value));
            },
          },
          "Read only",
        ),
        h(
          "button",
          {
            type: "button",
            "data-testid": "mutation-policy",
            disabled: !ready.value || pending_count.value > 0,
            title:
              pending_count.value > 0
                ? "Sync pending commits first — this input rebuilds the Grid."
                : "Reset-bound adapter input: toggling replaces the Grid.",
            onClick: toggle_policy,
          },
          `Policy: ${mutation_policy.value}`,
        ),
      ]),
    ]),
    h("details", { class: "sw-vuewb-disclosure" }, [
      h("summary", "Vue bindings"),
      h("dl", { class: "sw-vuewb-props", "data-testid": "props" }, [
        h("div", [h("dt", ":read-only"), h("dd", String(read_only.value))]),
        h("div", [h("dt", ":mutation-policy"), h("dd", mutation_policy.value)]),
        h("div", [h("dt", ":protection-resolver"), h("dd", role.value)]),
        h("div", [h("dt", ":renderer"), h("dd", renderer_mode.value)]),
        h("div", [h("dt", ":workbook"), h("dd", `generation ${generation.value}`)]),
      ]),
    ]),
    h(
      "p",
      { class: "sw-vuewb-taskhint" },
      "Live props update in place; reset-bound props replace the Grid and restart @ready.",
    ),
  ]);
};

const App = defineComponent({
  setup() {
    const workbench = use_vue_workbench();
    const {
      gridComponent: grid_component,
      workbook,
      data,
      mutationPolicy: mutation_policy,
      rendererMode: renderer_mode,
      readOnly: read_only,
      role,
      ready,
      generation,
      bootError: boot_error,
      resetState: reset_state,
      onInitializationError: on_initialization_error,
      pendingCount: pending_count,
      serverVersion: server_version,
      feed,
      challengeState: challenge_state,
      protectionResolver: protection_resolver,
      pushFeed: push_feed,
      refreshWorkbook: refresh_workbook,
      selectedLabel: selected_label,
      onReady: on_ready,
      onGridChange: on_grid_change,
      onSelectionChange: on_selection_change,
      setRole: set_role,
      commitChallenge: commit_challenge,
      resetGridInput: reset_grid_input,
      taskTab: task_tab,
      eventFeed: event_feed,
    } = workbench;

    return () =>
      h("section", { class: "sw-demo-app sw-vuewb-app", "data-framework": "vue" }, [
        h("div", { class: "sw-demo-main sw-vuewb-main" }, [
          h("header", { class: "sw-demo-controlbar sw-vuewb-controlbar" }, [
            h("div", { class: "sw-demo-controlbar__identity" }, [
              h("span", { class: "sw-demo-product__mark", "aria-hidden": "true" }, [
                sheetwrite_icon("sheet"),
              ]),
              h("div", [
                h("h2", "Purchase order review"),
                h("span", `${integer.format(BUSINESS_ROWS)} live rows · challenge G1`),
              ]),
            ]),
            h(
              "div",
              {
                class: "sw-demo-controlbar__controls",
                role: "toolbar",
                "aria-label": "Workbench configuration",
              },
              [
                h("fieldset", { class: "sw-vuewb-role", "aria-label": "Host role" }, [
                  h("legend", "Acting as"),
                  (["reviewer", "finance-lead"] as const).map((candidate) =>
                    h(
                      "button",
                      {
                        type: "button",
                        "aria-pressed": role.value === candidate,
                        "data-testid": `role-${candidate}`,
                        onClick: () => set_role(candidate),
                      },
                      candidate === "reviewer" ? "Reviewer" : "Finance lead",
                    ),
                  ),
                ]),
              ],
            ),
            h(
              "output",
              {
                class: "sw-workbench-readout sw-vuewb-readout",
                "data-state": challenge_state.value,
                "aria-live": "polite",
              },
              [
                sheetwrite_icon("shield"),
                h("span", { class: "sw-vuewb-readout__label" }, "Challenge"),
                h("strong", CHALLENGE_LABELS[challenge_state.value]),
              ],
            ),
            h(
              "button",
              {
                type: "button",
                class: "sw-workbench-primary",
                "data-testid": "challenge-attempt",
                disabled: !ready.value || read_only.value || challenge_state.value === "accepted",
                onClick: commit_challenge,
              },
              role.value === "reviewer" ? "Attempt 999 as reviewer" : "Commit 999 override",
            ),
          ]),
          h(
            "p",
            {
              class: "sw-action-error",
              role: "alert",
              "data-action-error": "",
              hidden: boot_error.value === null && reset_state.value.error === null,
            },
            boot_error.value ?? reset_state.value.error ?? "",
          ),
          boot_error.value !== null || reset_state.value.pending
            ? h(
                "button",
                {
                  type: "button",
                  disabled: reset_state.value.pending,
                  "aria-busy": reset_state.value.pending || undefined,
                  onClick: () => reset_grid_input("retry", "Retrying workbook initialization"),
                },
                reset_state.value.pending ? "Loading workbook…" : "Retry loading",
              )
            : null,
          h("div", { class: "sw-vuewb-workspace" }, [
            h("div", { class: "sw-demo-grid sw-vuewb-grid" }, [
              h(SheetwriteGrid, {
                ref: grid_component,
                workbook: workbook.value,
                data: data.value,
                presentation: "data-grid",
                theme: BUSINESS_THEME,
                readOnly: read_only.value,
                mutationPolicy: mutation_policy.value,
                protectionResolver: protection_resolver,
                renderer: renderer_mode.value,
                workerUrl: renderer_mode.value === "worker" ? workerUrl : undefined,
                config: GRID_CONFIG,
                style: "height: 100%",
                onReady: on_ready,
                onGridChange: on_grid_change,
                onSelectionChange: on_selection_change,
                onEditBegin: (event: GridEvents["edit-begin"]) => {
                  push_feed("event", "@edit-begin", cellA1(event.addr.row, event.addr.col));
                },
                onEditCommit: (event: GridEvents["edit-commit"]) => {
                  push_feed("event", "@edit-commit", cellA1(event.addr.row, event.addr.col));
                },
                onActiveSheetChange: (event: GridEvents["active-sheet"]) => {
                  push_feed("event", "@active-sheet-change", String(event.sheet));
                  refresh_workbook();
                },
                onInitializationError: on_initialization_error,
              }),
            ]),
            h("aside", { class: "sw-vuewb-panel", "aria-label": "Policy and workbook tasks" }, [
              h(
                "nav",
                { class: "sw-vuewb-tasktabs", role: "tablist", "aria-label": "Workbook tasks" },
                [...TASKS.map(task_tab)],
              ),
              h(ValidationPanel, { workbench }),
              h(ProtectionPanel, { workbench }),
              h(ChangePanel, { workbench }),
              h(NotesPanel, { workbench }),
              h(FormattingPanel, { workbench }),
              h(SheetsPanel, { workbench }),
              h(PersistencePanel, { workbench }),
              h(RendererPanel, { workbench }),
              h("section", { class: "sw-vuewb-eventrail", "data-testid": "event-panel" }, [
                h("header", [
                  h("strong", "Adapter events"),
                  h("span", `${feed.value.length} recent · Vue + Grid`),
                ]),
                event_feed(),
              ]),
            ]),
          ]),
          h("footer", { class: "sw-demo-status sw-demo-status--metrics" }, [
            h("span", `Selection · ${selected_label.value}`),
            h("span", { class: "sw-vuewb-status--role" }, `Role · ${role.value}`),
            h("span", `Pending · ${pending_count.value}`),
            h("span", { class: "sw-vuewb-status--host" }, `Host · v${server_version.value}`),
            h(
              "span",
              { class: "sw-vuewb-status--renderer" },
              `${renderer_mode.value} · gen ${generation.value}`,
            ),
          ]),
        ]),
      ]);
  },
});

export default App;
