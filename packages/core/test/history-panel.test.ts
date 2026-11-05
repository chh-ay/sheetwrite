import { afterEach, beforeAll, beforeEach, expect, it } from "bun:test";

import {
  createHistoryCommands,
  HistoryArchive,
  MemoryHistoryStorage,
} from "../src/history-archive.js";
import {
  type CommittedTransaction,
  createGridFromSnapshot,
  type DocumentOp,
  type Grid,
  initSheetwrite,
  MemoryPersistenceAdapter,
  SyncCoordinator,
  type WorkbookSnapshot,
} from "../src/index.js";
import { installCanvasTestStubs } from "../src/testing.js";

const DOCUMENT = "book";

beforeAll(async () => {
  await initSheetwrite();
});

let restoreStubs: () => void;
beforeEach(() => {
  restoreStubs = installCanvasTestStubs();
});
afterEach(() => {
  restoreStubs();
  document.body.replaceChildren();
});

function snapshot(): WorkbookSnapshot {
  return {
    schemaVersion: 1,
    documentId: DOCUMENT,
    version: 0,
    workbook: { activeSheet: "data" },
    sheets: [
      {
        id: "data",
        name: "Data",
        order: 0,
        rowCount: 3,
        columns: [{ key: "a", header: "A", width: 100, type: "number" }],
        cells: [
          {
            startRow: 0,
            startCol: 0,
            rowCount: 1,
            colCount: 1,
            cells: [{ rowOffset: 0, colOffset: 0, value: { kind: "literal", value: 1 } }],
          },
        ],
      },
    ],
  };
}

async function setup() {
  const adapter = new MemoryPersistenceAdapter(snapshot());
  const archive = await HistoryArchive.open({
    documentId: DOCUMENT,
    storage: new MemoryHistoryStorage(),
  });
  await archive.initialize(snapshot(), 0);
  adapter.recordHistory(DOCUMENT, {
    record: (commit: CommittedTransaction, capture: () => WorkbookSnapshot) =>
      archive.record(commit, capture),
  });

  const host = document.createElement("div");
  document.body.append(host);
  let sync: SyncCoordinator | undefined;
  const grid = createGridFromSnapshot(host, snapshot(), {
    config: {
      ribbon: true,
      history: createHistoryCommands({
        archive,
        authorId: "alice",
        authorName: (id) => (id === "alice" ? "Alice" : id),
        sync: () => {
          if (!sync) throw new Error("sync is not ready");
          return sync;
        },
      }),
    },
  });
  sync = new SyncCoordinator(grid, adapter, {
    documentId: DOCUMENT,
    serverVersion: 0,
    authorId: "alice",
  });

  return { archive, grid, host, sync };
}
/** Resolve when `read` sees the panel state; panel loading and archive calls are asynchronous. */
async function until<T>(read: () => T | null | undefined): Promise<T> {
  const value = read();
  if (value) return value;

  return new Promise<T>((resolve) => {
    const observer = new MutationObserver(() => {
      const next = read();
      if (!next) return;
      observer.disconnect();
      resolve(next);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

function panel(host: HTMLElement): HTMLElement {
  const element = host.querySelector<HTMLElement>(".sheetwrite-panel");
  if (!element) throw new Error("The history panel is not open");
  return element;
}

function buttonIn(root: ParentNode, text: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.startsWith(text),
  );
  if (!button) throw new Error(`No button "${text}"`);
  return button;
}

async function edit(grid: Grid, sync: SyncCoordinator, operation: DocumentOp): Promise<void> {
  expect(grid.applyTransaction({ patches: [operation] }).status).toBe("applied");
  await sync.flush();
}

it("keeps both history commands unavailable until a host supplies history", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const grid = createGridFromSnapshot(host, snapshot(), { config: { ribbon: true } });

  expect(grid.getCommandState("versionHistory").disabled).toBe(true);
  expect(grid.getCommandState("saveVersion").disabled).toBe(true);
  expect(host.querySelector('[data-command="versionHistory"]')).toBeNull();
  grid.destroy();
});

it("saves a named version, shows the edit and its author, and restores it as one undo step", async () => {
  const { grid, host, sync } = await setup();
  expect(grid.getCommandState("versionHistory").disabled).toBe(false);
  const review = await until(() =>
    [...host.querySelectorAll<HTMLElement>(".sheetwrite-ribbon-tab")].find(
      (tab) => tab.textContent === "Review",
    ),
  );
  review.click();
  expect(host.querySelector('[data-command="versionHistory"]')).not.toBeNull();

  grid.actions.saveVersion();
  const name = await until(() =>
    host.querySelector<HTMLInputElement>('[data-focus-key="version-name"]'),
  );
  name.value = "Before price change";
  buttonIn(panel(host), "Save Version").click();
  await until(() =>
    host.querySelector(".history-version")?.textContent?.includes("Before price change")
      ? true
      : null,
  );

  await edit(grid, sync, {
    op: "set",
    addr: { sheet: "data", row: 0, col: 0 },
    value: { kind: "literal", value: 5 },
  });

  buttonIn(panel(host), "Before price change").click();
  const change = await until(() => host.querySelector(".history-change"));
  expect(change.textContent).toContain("Changed (≠) data!A1");
  expect(change.textContent).toContain("1 → 5");
  expect(change.textContent).toContain("Last changed by Alice");

  buttonIn(panel(host), "Restore…").click();
  const confirm = await until(() => host.querySelector('[role="alertdialog"]'));
  buttonIn(confirm, "Confirm restore").click();
  await until(() =>
    grid.store.getCell({ sheet: "data", row: 0, col: 0 }).resolved === 1 ? true : null,
  );

  grid.undo();
  expect(grid.store.getCell({ sheet: "data", row: 0, col: 0 }).resolved).toBe(5);
  sync.destroy();
  grid.destroy();
});
