import { colToA1 } from "../a1.js";
import type { HistoryDiffCursor, HistoryDiffPage, HistoryVersion } from "../history-archive.js";
import { HISTORY_DIFF_NONE, HistoryDiffFlag } from "../history-archive.js";
import { createGridFromSnapshot } from "../persistence.js";
import type { SyncCoordinator } from "../sync.js";
import type { Grid, GridPanel } from "../types/grid.js";
import type { HistoryCommandsOptions } from "../version-history/history-ui.js";
import type { HistoryRestoreScope } from "../version-history/restore.js";
import { panelField, selectOf, rejectionMessage } from "./panel-dom.js";
import { parseRangeText, type RangeTextSheet } from "./range-text.js";
const PAGE_SIZE = 50;

/** All DOM and requests of one open history panel; no state survives its close. */
class HistoryPanel {
  private readonly lifetime = new AbortController();
  private request: AbortController | undefined;
  private preview: Grid | undefined;
  private comparison: AbortController | undefined;
  private versions: HistoryVersion[] = [];
  private listCursor: string | undefined;
  private selected: HistoryVersion | undefined;
  private readonly status = document.createElement("p");
  private readonly list = document.createElement("div");
  private readonly detail = document.createElement("div");
  private readonly name = document.createElement("input");
  private readonly nameForm = document.createElement("form");
  private readonly pending = document.createElement("p");
  private readonly more = document.createElement("button");
  private readonly sync: SyncCoordinator | undefined;
  private readonly disposeSync: (() => void) | undefined;

  constructor(
    private readonly grid: Grid,
    private readonly options: HistoryCommandsOptions,
    private readonly body: HTMLElement,
    save: boolean,
  ) {
    this.sync = options.sync?.(grid);
    this.status.setAttribute("role", "status");
    this.status.setAttribute("aria-live", "polite");
    this.pending.setAttribute("role", "status");
    this.list.setAttribute("role", "group");
    this.list.setAttribute("aria-label", "Saved versions");
    this.name.type = "text";
    this.name.maxLength = 256;
    this.name.required = true;
    const nameField = panelField("Version name", this.name, "version-name");
    this.nameForm.append(
      nameField.element,
      this.button("Save Version", () => this.save()),
    );
    this.nameForm.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        void this.run(() => this.save());
      },
      { signal: this.lifetime.signal },
    );
    this.nameForm.hidden = !save;
    this.more.type = "button";
    this.more.textContent = "More versions";
    this.more.addEventListener("click", () => void this.run(() => this.loadVersions(false)), {
      signal: this.lifetime.signal,
    });
    const create = this.button("Save a version…", async () => {
      this.nameForm.hidden = false;
      this.name.focus();
    });
    body.classList.add("sheetwrite-history");
    body.append(
      this.styles(),
      this.pending,
      create,
      this.nameForm,
      this.status,
      this.list,
      this.more,
      this.detail,
    );
    this.disposeSync = this.sync?.on(() => this.showPending());
    this.showPending();
    void this.run(async () => {
      await this.loadVersions(true);
      if (save) this.name.focus();
    });
  }

  close(): void {
    this.lifetime.abort();
    this.request?.abort();
    this.comparison?.abort();
    this.preview?.destroy();
    this.disposeSync?.();
    this.body.classList.remove("sheetwrite-history");
  }

  private styles(): HTMLStyleElement {
    const style = document.createElement("style");
    // The rules travel with the panel chunk, not the grid's first-paint CSS.
    style.textContent = `.sheetwrite-history{display:flex;flex-direction:column;gap:10px}.sheetwrite-history button,.sheetwrite-history select,.sheetwrite-history input{font:inherit}.sheetwrite-history button{cursor:pointer;max-width:100%;padding:6px 8px;border:1px solid currentColor;border-radius:4px;color:inherit;background:transparent}.sheetwrite-history button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.sheetwrite-history [role=group]{display:flex;flex-direction:column;gap:6px}.sheetwrite-history .history-version{text-align:left}.sheetwrite-history [aria-pressed=true]{border-width:2px;font-weight:600}.sheetwrite-history .history-diff{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.sheetwrite-history .history-change{padding:8px;border:1px solid currentColor;border-radius:4px;overflow-wrap:anywhere}.sheetwrite-history .history-added{border-style:dashed}.sheetwrite-history .history-removed{border-style:dotted}.sheetwrite-history .history-preview{height:260px;min-width:0}.sheetwrite-history [role=alertdialog]{padding:10px;border:2px solid currentColor;border-radius:4px}.sheetwrite-history small{display:block;opacity:.8}.sheetwrite-history h3{margin:12px 0 6px}.sheetwrite-history form{display:flex;flex-direction:column;gap:8px}.sheetwrite-history [hidden]{display:none}`;
    return style;
  }

  private button(label: string, action: () => Promise<void>): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => void this.run(action), { signal: this.lifetime.signal });
    return button;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!this.lifetime.signal.aborted) {
        this.status.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  }

  private showPending(): void {
    if (!this.sync) {
      this.pending.textContent = "Local version archive. Only committed changes are saved.";
      return;
    }
    const { connection, activity } = this.sync.state;
    this.pending.textContent =
      this.sync.pendingCount > 0
        ? `${this.sync.pendingCount} pending change(s). They are not archived yet.`
        : `${connection}; ${activity}. All local changes are committed.`;
  }

  private async save(): Promise<void> {
    const name = this.name.value.trim();
    if (!name) {
      this.name.reportValidity();
      return;
    }
    this.status.textContent = "Waiting for changes to commit…";
    await this.sync?.flush();
    this.lifetime.signal.throwIfAborted();
    if (this.sync && (this.sync.pendingCount > 0 || this.sync.state.activity !== "idle")) {
      throw new Error("The version was not saved. Commit the pending changes first.");
    }
    await this.options.archive.saveVersion(
      name,
      this.options.authorId,
      Date.now(),
      this.lifetime.signal,
    );
    this.name.value = "";
    this.nameForm.hidden = true;
    await this.loadVersions(true);
    this.status.textContent = `Saved “${name}”.`;
  }

  private async loadVersions(reset: boolean): Promise<void> {
    const page = await this.options.archive.listVersions({
      maxEntries: PAGE_SIZE,
      ...(reset || !this.listCursor ? {} : { cursor: this.listCursor }),
      signal: this.lifetime.signal,
    });
    this.lifetime.signal.throwIfAborted();
    if (reset) {
      this.versions = [];
      this.list.replaceChildren();
    }
    this.versions.push(...page.versions);
    this.listCursor = page.cursor;
    this.more.hidden = !page.cursor;
    for (const version of page.versions) {
      const button = this.button(version.name ?? "Automatic version", () => this.select(version));
      button.className = "history-version";
      button.dataset.version = version.id;
      button.setAttribute("aria-pressed", String(version.id === this.selected?.id));
      const info = document.createElement("small");
      info.textContent = `${this.author(version.authorId)} · ${new Date(version.time).toLocaleString()} · revision ${version.revision}`;
      button.append(info);
      this.list.append(button);
    }
    if (this.versions.length === 0)
      this.status.textContent = "No saved versions. Save the committed document to create one.";
  }

  private author(id: string): string {
    return this.options.authorName?.(id) ?? id;
  }

  private async select(version: HistoryVersion): Promise<void> {
    this.request?.abort();
    this.request = new AbortController();
    this.preview?.destroy();
    this.preview = undefined;
    this.selected = version;
    for (const button of this.list.querySelectorAll<HTMLButtonElement>("button[data-version]")) {
      button.setAttribute("aria-pressed", String(button.dataset.version === version.id));
    }
    this.detail.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = version.name ?? "Automatic version";
    const signal = AbortSignal.any([this.lifetime.signal, this.request.signal]);
    const sheets = await this.historicalSheets(version, signal);
    signal.throwIfAborted();
    this.detail.append(
      heading,
      this.button("Preview read-only", () => this.showPreview(version)),
      this.restoreForm(version, sheets),
    );
    const later = this.versions.filter(
      (candidate) => candidate.revision >= version.revision && candidate.id !== version.id,
    );
    const choices: Array<readonly [string, string]> = [
      ["head", "Current committed document"],
      ...later.map(
        (candidate) => [candidate.id, candidate.name ?? `Revision ${candidate.revision}`] as const,
      ),
    ];
    const target = selectOf(choices, "head");
    const field = panelField("Compare with", target, "compare-version");
    const diff = document.createElement("section");
    target.addEventListener(
      "change",
      () => void this.run(() => this.showDiff(version, target.value, diff)),
      { signal: this.lifetime.signal },
    );
    this.detail.append(field.element, diff);
    await this.showDiff(version, target.value, diff);
  }

  /** Keep only sheet geometry after replay; no historical cells stay in the panel. */
  private async historicalSheets(
    version: HistoryVersion,
    signal: AbortSignal,
  ): Promise<RangeTextSheet[]> {
    const snapshot = await this.options.archive.readVersion(version.id, signal);
    return snapshot.sheets.map(({ id, name, rowCount, columns }) => ({
      id,
      name,
      rowCount,
      columns: { length: columns.length },
    }));
  }

  private async showPreview(version: HistoryVersion): Promise<void> {
    const signal = AbortSignal.any([
      this.lifetime.signal,
      this.request?.signal ?? this.lifetime.signal,
    ]);
    this.status.textContent = "Opening read-only preview…";
    const snapshot = await this.options.archive.readVersion(version.id, signal);
    signal.throwIfAborted();
    this.preview?.destroy();
    this.detail.querySelector(".history-preview")?.remove();
    const host = document.createElement("div");
    host.className = "history-preview";
    host.setAttribute("aria-label", "Read-only version preview");
    this.detail.append(host);
    this.preview = createGridFromSnapshot(host, snapshot, {
      readOnly: true,
      config: { toolbar: false },
    });
    this.status.textContent = "Read-only preview. The live document has not changed.";
  }

  private async showDiff(
    from: HistoryVersion,
    to: string,
    host: HTMLElement,
    cursor?: HistoryDiffCursor,
  ): Promise<void> {
    this.comparison?.abort();
    this.comparison = new AbortController();
    const signal = AbortSignal.any([
      this.lifetime.signal,
      this.request?.signal ?? this.lifetime.signal,
      this.comparison.signal,
    ]);
    this.status.textContent = "Comparing versions…";
    const page = await this.options.archive.diffVersions({
      from: from.id,
      to,
      maxEntries: PAGE_SIZE,
      signal,
      ...(cursor ? { cursor } : {}),
    });
    signal.throwIfAborted();
    host.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = "Changes";
    host.append(heading);
    this.renderDiff(page, host);
    if (page.cursor) {
      host.append(this.button("Next changes", () => this.showDiff(from, to, host, page.cursor)));
    }
    this.status.textContent =
      page.cells.flags.length === 0 && page.sheets.length === 0 && page.workbook.length === 0
        ? "No source or style changes between these versions."
        : `Showing ${page.cells.flags.length} cell change(s).${page.logComplete ? "" : " Some earlier authors are not known because the log is no longer retained."}`;
  }

  private renderDiff(page: HistoryDiffPage, host: HTMLElement): void {
    const list = document.createElement("ul");
    list.className = "history-diff";
    for (const sheet of page.sheets) {
      const item = document.createElement("li");
      item.className = "history-change";
      item.textContent = `Sheet ${sheet.name}: ${sheet.change}${sheet.fields.length ? ` (${sheet.fields.join(", ")})` : ""}`;
      list.append(item);
    }
    if (page.workbook.length) {
      const item = document.createElement("li");
      item.textContent = `Workbook: ${page.workbook.join(", ")}`;
      list.append(item);
    }
    for (let at = 0; at < page.cells.flags.length; at++) {
      const flags = page.cells.flags[at] ?? 0;
      const added = (flags & HistoryDiffFlag.added) !== 0;
      const removed = (flags & HistoryDiffFlag.removed) !== 0;
      const kind = added ? "Added (+)" : removed ? "Removed (−)" : "Changed (≠)";
      const sheet = page.sheetIds[page.cells.sheet[at] ?? 0] ?? "";
      const row = page.cells.row[at] ?? 0;
      const col = page.cells.col[at] ?? 0;
      const author = page.authors[page.cells.author[at] ?? HISTORY_DIFF_NONE];
      const detail = page.details[at];
      const item = document.createElement("li");
      item.className = `history-change ${added ? "history-added" : removed ? "history-removed" : ""}`;
      const title = document.createElement("strong");
      title.textContent = `${kind} ${sheet}!${colToA1(col)}${row + 1}`;
      const values = document.createElement("p");
      values.textContent = `${detail?.before?.formula ?? detail?.before?.value ?? "Empty"} → ${detail?.after.formula ?? detail?.after.value ?? "Empty"}`;
      const by = document.createElement("small");
      by.textContent = author
        ? `Last changed by ${this.author(author)}`
        : "Baseline / author not known";
      item.append(title, values, by);
      if ((flags & HistoryDiffFlag.style) !== 0) {
        const style = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Style changed";
        const content = document.createElement("p");
        content.textContent = `${JSON.stringify(detail?.before?.style ?? {})} → ${JSON.stringify(detail?.after.style ?? {})}`;
        style.append(summary, content);
        item.append(style);
      }
      if (detail && detail.writers.length > 1) {
        const writers = document.createElement("small");
        writers.textContent = `Contributors: ${detail.writers.map((index) => this.author(page.authors[index] ?? "Unknown")).join(", ")}`;
        item.append(writers);
      }
      list.append(item);
    }
    host.append(list);
  }

  private restoreForm(version: HistoryVersion, sheets: readonly RangeTextSheet[]): HTMLElement {
    const form = document.createElement("div");
    const scope = selectOf(
      [
        ["workbook", "Whole workbook"],
        ["sheet", "One sheet"],
        ["range", "Selected range"],
      ],
      "workbook",
    );
    const field = panelField("Restore scope", scope, "restore-scope");
    const active =
      sheets.find((item) => item.id === this.grid.getActiveSheet())?.id ?? sheets[0]?.id ?? "";
    const sheet = selectOf(
      sheets.map((item) => [item.id, item.name]),
      active,
    );
    const sheetField = panelField("Sheet", sheet, "restore-sheet");
    const range = document.createElement("input");
    range.type = "text";
    range.placeholder = "A1:B10";
    const rangeField = panelField("Range (data rows)", range, "restore-range");
    const selection = this.grid.getSelection();
    if (selection?.kind === "range") {
      const { start, end } = selection.range;
      range.value = `${colToA1(start.col)}${start.row + 1}:${colToA1(end.col)}${end.row + 1}`;
    } else if (selection?.kind === "cell") {
      range.value = `${colToA1(selection.addr.col)}${selection.addr.row + 1}`;
    }
    const note = document.createElement("p");
    const update = (): void => {
      sheetField.element.hidden = scope.value === "workbook";
      rangeField.element.hidden = scope.value !== "range";
      note.textContent =
        scope.value === "range"
          ? "Values, formulas, styles, notes, merges and links in this range are restored. Sheet size, rules and objects outside it stay current."
          : "The sheet size and contents are restored. Removed tail references become #REF! until undo. Retained XLSX parts are not restored.";
    };
    scope.addEventListener("change", update, { signal: this.lifetime.signal });
    update();
    const confirm = document.createElement("div");
    const restore = this.button("Restore…", async () => {
      let target: HistoryRestoreScope;
      if (scope.value === "range") {
        const parsed = parseRangeText(range.value, sheets, sheet.value);
        if ("error" in parsed) throw new Error(parsed.error);
        target = { kind: "range", range: parsed.range };
      } else {
        target =
          scope.value === "sheet" ? { kind: "sheet", sheet: sheet.value } : { kind: "workbook" };
      }
      this.confirmRestore(version, target, confirm);
    });
    form.append(field.element, sheetField.element, rangeField.element, note, restore, confirm);
    return form;
  }

  private confirmRestore(
    version: HistoryVersion,
    scope: HistoryRestoreScope,
    host: HTMLElement,
  ): void {
    host.replaceChildren();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "alertdialog");
    dialog.setAttribute("aria-label", "Confirm version restore");
    const message = document.createElement("p");
    message.textContent = `Restore ${scope.kind} from “${version.name ?? "Automatic version"}”? This creates one new undoable change. In a shared document it is sent to everyone; the document must be idle.`;
    const cancel = this.button("Cancel", async () => {
      host.replaceChildren();
    });
    const accept = this.button("Confirm restore", async () => {
      const outcome = await this.options.archive.restoreVersion(this.grid, version.id, scope, {
        ...(this.sync ? { sync: this.sync } : {}),
        signal: this.lifetime.signal,
      });
      const error = rejectionMessage(outcome);
      if (error) throw new Error(error);
      host.replaceChildren();
      this.status.textContent =
        "Restored as one change. Undo returns the document to its previous state.";
      await this.sync?.flush();
      if (this.sync?.state.activity === "conflict") {
        this.status.textContent =
          "Another change won the server version. Reload the document, preview the version and restore again. This restore is not rebased.";
      }
    });
    dialog.append(message, cancel, accept);
    host.append(dialog);
    cancel.focus();
  }
}

/** Build the lazy Review › Version History panel for one live grid. */
export function historyPanel(grid: Grid, options: HistoryCommandsOptions, save = false): GridPanel {
  return {
    title: "Version History",
    render(body) {
      const panel = new HistoryPanel(grid, options, body, save);
      return () => panel.close();
    },
  };
}
