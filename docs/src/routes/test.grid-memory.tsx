import {
  type ColumnarData,
  createGrid,
  type Grid,
  initSheetwrite,
  type Workbook,
} from "@sheetwrite/core";

import "@sheetwrite/core/styles.css";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/test/grid-memory")({
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  component: GridMemoryFixture,
});

type FixtureStatus = "loading" | "ready" | "busy" | "scrolled" | "trimmed" | "error";

// Scrolling 15,000 rows of four unique text columns puts about 60,000 strings
// in the window string cache, just under its 65,536-entry limit (a full cache
// starts again from empty), and fills the number text cache.
const ROW_COUNT = 200_000;
const ROW_HEIGHT = 28;
const SCROLLED_ROWS = 15_000;
const ROWS_PER_STEP = 24;
const TEXT_COLUMNS = ["customer", "account", "city", "note"] as const;

function workbook(): Workbook {
  return {
    activeSheet: "s1",
    sheets: [
      {
        id: "s1",
        name: "Sheet 1",
        rowCount: ROW_COUNT,
        columns: [
          ...TEXT_COLUMNS.map((key) => ({ key, header: key, width: 150, type: "text" as const })),
          { key: "amount", header: "amount", width: 110, type: "number", numberFormat: "#,##0.00" },
          { key: "share", header: "share", width: 90, type: "number", numberFormat: "0.0%" },
        ],
      },
    ],
  };
}

function columnarRows(): ColumnarData {
  const columns: Record<string, string[] | Float64Array> = {};
  for (const key of TEXT_COLUMNS) {
    columns[key] = Array.from(
      { length: ROW_COUNT },
      (_, row) => `${key} ${row} of the memory fixture`,
    );
  }
  columns.amount = Float64Array.from({ length: ROW_COUNT }, (_, row) => row * 10.5);
  columns.share = Float64Array.from({ length: ROW_COUNT }, (_, row) => (row % 1_000) / 1_000);

  return { rowCount: ROW_COUNT, columns };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function settledFrames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

async function documentDigest(grid: Grid): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(grid.exportSnapshot()));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cachedStrings(grid: Grid): number {
  const snapshot = grid.getRuntimeResourceSnapshot("scroll", "settled");
  const owner = snapshot.jsOwners.find((entry) => entry.owner === "js.window.string-cache");

  return owner?.entries ?? 0;
}

/**
 * Browser fixture for `Grid.trimMemory()`. The spec drives it with the buttons
 * and reads the state from the `<output>` elements, so the page needs no
 * global test hook.
 */
function GridMemoryFixture() {
  const hostRef = useRef<HTMLElement>(null);
  const gridRef = useRef<Grid | null>(null);
  const [status, setStatus] = useState<FixtureStatus>("loading");
  const [digest, setDigest] = useState("");
  const [stringEntries, setStringEntries] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    initSheetwrite().then(
      async () => {
        if (disposed) return;
        const grid = createGrid(host, {
          workbook: workbook(),
          data: columnarRows(),
          config: { toolbar: false, contextMenu: false, find: false },
        });
        gridRef.current = grid;
        await settledFrames();
        setDigest(await documentDigest(grid));
        setStringEntries(cachedStrings(grid));
        setStatus("ready");
      },
      (error: unknown) => {
        console.error("The grid memory fixture could not start the engine.", error);
        if (!disposed) setStatus("error");
      },
    );

    return () => {
      disposed = true;
      gridRef.current?.destroy();
      gridRef.current = null;
    };
  }, []);

  const run = async (
    action: (grid: Grid, host: HTMLElement) => Promise<void>,
    done: FixtureStatus,
  ) => {
    const grid = gridRef.current;
    const host = hostRef.current;
    if (!grid || !host) throw new Error("The grid memory fixture has no grid.");

    setStatus("busy");
    await action(grid, host);
    setDigest(await documentDigest(grid));
    setStringEntries(cachedStrings(grid));
    setStatus(done);
  };

  const scrollThrough = async (_grid: Grid, host: HTMLElement): Promise<void> => {
    const scroller = host.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (!scroller) throw new Error("The grid memory fixture has no scroller.");

    for (let row = 0; row <= SCROLLED_ROWS; row += ROWS_PER_STEP) {
      scroller.scrollTop = row * ROW_HEIGHT;
      await nextFrame();
    }

    // Come back to a fixed place, so the before and after frames match.
    scroller.scrollTop = 1_000 * ROW_HEIGHT;
    await settledFrames();
  };

  const trim = async (grid: Grid): Promise<void> => {
    grid.trimMemory();
    await settledFrames();
  };

  return (
    <main style={{ padding: 16 }}>
      <output data-status={status} id="grid-memory-status">
        {status}
      </output>
      <output data-digest={digest} id="grid-memory-document" style={{ marginLeft: 8 }}>
        {digest}
      </output>
      <output data-entries={stringEntries} id="grid-memory-strings" style={{ marginLeft: 8 }}>
        {stringEntries}
      </output>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          disabled={status === "busy"}
          onClick={() => void run(scrollThrough, "scrolled")}
          type="button"
        >
          Scroll through
        </button>
        <button
          disabled={status === "busy"}
          onClick={() => void run(trim, "trimmed")}
          type="button"
        >
          Trim memory
        </button>
      </div>
      <section
        aria-label="Grid memory browser fixture"
        ref={hostRef}
        style={{ height: 640, marginTop: 8, width: 900 }}
      />
    </main>
  );
}
