import { type ColumnarData, createGrid, type Grid, initSheetwrite } from "@sheetwrite/core";
import { createSignal, onCleanup, onMount } from "solid-js";

type FixtureStatus = "loading" | "ready" | "busy" | "scrolled" | "trimmed" | "error";

// Keep the scroll below the string cache's reset limit while filling both text caches.
const ROW_COUNT = 200_000;
const ROW_HEIGHT = 28;
const SCROLLED_ROWS = 15_000;
const ROWS_PER_STEP = 24;
const RETURN_ROW = 1_000;
const SHARE_PERIOD = 1_000;
const AMOUNT_PER_ROW = 10.5;
const HEX_RADIX = 16;
const HEX_BYTE_DIGITS = 2;
const TEXT_COLUMNS = ["customer", "account", "city", "note"] as const;
const OUTPUT_STYLE = { "margin-left": "8px" };
const BUTTONS_STYLE = { display: "flex", gap: "8px", "margin-top": "8px" };
const GRID_HOST_STYLE = { height: "640px", "margin-top": "8px", width: "900px" };

function columnarRows(): ColumnarData {
  const columns: Record<string, string[] | Float64Array> = {};
  for (const key of TEXT_COLUMNS) {
    columns[key] = Array.from(
      { length: ROW_COUNT },
      (_, row) => `${key} ${row} of the memory fixture`,
    );
  }
  columns.amount = Float64Array.from({ length: ROW_COUNT }, (_, row) => row * AMOUNT_PER_ROW);
  columns.share = Float64Array.from(
    { length: ROW_COUNT },
    (_, row) => (row % SHARE_PERIOD) / SHARE_PERIOD,
  );

  return { rowCount: ROW_COUNT, columns };
}

function nextFrame(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  requestAnimationFrame(() => resolve());
  return promise;
}

async function settledFrames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

async function documentDigest(grid: Grid): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(grid.exportSnapshot()));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

  return Array.from(digest, (byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_DIGITS, "0")).join(
    "",
  );
}

function cachedStrings(grid: Grid): number {
  const snapshot = grid.getRuntimeResourceSnapshot("scroll", "settled");
  const owner = snapshot.jsOwners.find((entry) => entry.owner === "js.window.string-cache");

  return owner?.entries ?? 0;
}

/** The browser spec drives buttons and reads outputs without a global grid hook. */
export function GridMemoryFixture() {
  let host: HTMLElement | undefined;
  let grid: Grid | undefined;
  const [status, setStatus] = createSignal<FixtureStatus>("loading");
  const [digest, setDigest] = createSignal("");
  const [stringEntries, setStringEntries] = createSignal(0);

  onMount(() => {
    if (!host) return;
    const mountedHost = host;
    let disposed = false;

    initSheetwrite().then(
      async () => {
        if (disposed) return;
        const mountedGrid = createGrid(mountedHost, {
          workbook: {
            activeSheet: "s1",
            sheets: [
              {
                id: "s1",
                name: "Sheet 1",
                rowCount: ROW_COUNT,
                columns: [
                  ...TEXT_COLUMNS.map((key) => ({
                    key,
                    header: key,
                    width: 150,
                    type: "text" as const,
                  })),
                  {
                    key: "amount",
                    header: "amount",
                    width: 110,
                    type: "number",
                    numberFormat: "#,##0.00",
                  },
                  {
                    key: "share",
                    header: "share",
                    width: 90,
                    type: "number",
                    numberFormat: "0.0%",
                  },
                ],
              },
            ],
          },
          data: columnarRows(),
          config: { toolbar: false, contextMenu: false, find: false },
        });
        grid = mountedGrid;
        await settledFrames();
        setDigest(await documentDigest(mountedGrid));
        setStringEntries(cachedStrings(mountedGrid));
        setStatus("ready");
      },
      (error: unknown) => {
        console.error("The grid memory fixture could not start the engine.", error);
        if (!disposed) setStatus("error");
      },
    );

    onCleanup(() => {
      disposed = true;
      grid?.destroy();
      grid = undefined;
    });
  });

  const run = async (
    action: (activeGrid: Grid, scrollHost: HTMLElement) => Promise<void>,
    done: FixtureStatus,
  ) => {
    if (!grid || !host) throw new Error("The grid memory fixture has no grid.");
    const activeGrid = grid;

    setStatus("busy");
    await action(activeGrid, host);
    setDigest(await documentDigest(activeGrid));
    setStringEntries(cachedStrings(activeGrid));
    setStatus(done);
  };

  const scrollThrough = async (_activeGrid: Grid, scrollHost: HTMLElement): Promise<void> => {
    const scroller = scrollHost.querySelector<HTMLElement>(".sheetwrite-scroller");
    if (!scroller) throw new Error("The grid memory fixture has no scroller.");

    for (let row = 0; row <= SCROLLED_ROWS; row += ROWS_PER_STEP) {
      scroller.scrollTop = row * ROW_HEIGHT;
      await nextFrame();
    }

    // A fixed final viewport makes the before and after screenshots comparable.
    scroller.scrollTop = RETURN_ROW * ROW_HEIGHT;
    await settledFrames();
  };

  const trim = async (activeGrid: Grid): Promise<void> => {
    activeGrid.trimMemory();
    await settledFrames();
  };

  return (
    <>
      <output data-status={status()} id="grid-memory-status">
        {status()}
      </output>
      <output data-digest={digest()} id="grid-memory-document" style={OUTPUT_STYLE}>
        {digest()}
      </output>
      <output data-entries={stringEntries()} id="grid-memory-strings" style={OUTPUT_STYLE}>
        {stringEntries()}
      </output>
      <div style={BUTTONS_STYLE}>
        <button
          disabled={status() === "busy"}
          onClick={() => void run(scrollThrough, "scrolled")}
          type="button"
        >
          Scroll through
        </button>
        <button
          disabled={status() === "busy"}
          onClick={() => void run(trim, "trimmed")}
          type="button"
        >
          Trim memory
        </button>
      </div>
      <section
        aria-label="Grid memory browser fixture"
        ref={(element) => {
          host = element;
        }}
        style={GRID_HOST_STYLE}
      />
    </>
  );
}
