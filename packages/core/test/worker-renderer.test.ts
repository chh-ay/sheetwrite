import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import type { SheetwriteError } from "../src/errors.js";
import { DEFAULT_THEME, GridImpl, initSheetwrite } from "../src/grid.js";
import { installCanvasTestStubs } from "../src/testing.js";
import type { GridEvents, PanePaint, RenderLayout, VisibleWindowView } from "../src/types.js";
import { WorkerRenderer } from "../src/worker-renderer.js";
import { createWorkerMessageHandler, type WorkerAcknowledgement } from "../src/worker.js";
import { makeColumnarData, makeWorkbook, mountHost } from "./fixtures.js";

let latest_constructed_worker: RecordingWorker | null = null;

class RecordingWorker extends EventTarget {
  readonly messages: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  terminations = 0;

  constructor() {
    super();
    latest_constructed_worker = this;
  }

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer });
  }

  emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  terminate(): void {
    this.terminations += 1;
  }

  fail(error: Error): void {
    const event = new Event("error", { cancelable: true });
    Object.defineProperties(event, { error: { value: error }, message: { value: error.message } });
    this.dispatchEvent(event);
  }
}

const worker_descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
const transfer_descriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "transferControlToOffscreen",
);

function restore(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  latest_constructed_worker = null;
  const offscreen = new EventTarget();
  Object.defineProperties(offscreen, {
    width: { value: 0, writable: true },
    height: { value: 0, writable: true },
    getContext: { value: () => ({}) },
  });
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: RecordingWorker });
  Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
    configurable: true,
    value: () => offscreen,
  });
});

afterEach(() => {
  jest.useRealTimers();
  restore(globalThis, "Worker", worker_descriptor);
  restore(HTMLCanvasElement.prototype, "transferControlToOffscreen", transfer_descriptor);
});

function latest_worker(): RecordingWorker {
  const worker = latest_constructed_worker;
  if (!worker) throw new Error("worker was not constructed");
  return worker;
}

interface TransferablePackedArrays {
  valueKinds: Uint8Array;
  numberValues: Float64Array;
  stringPoolIds: Uint32Array;
  stringLocalIds: Int32Array;
  styleIds: Uint32Array;
  stringPoolUpdateIds?: Uint32Array;
}

function make_packed_view(): VisibleWindowView {
  return {
    sheet: "s1",
    stringPoolEpoch: 17,
    rows: { start: 0, end: 1 },
    cols: [0, 1],
    values: ["alpha", 42],
    styleIds: new Uint32Array([0, 1]),
    styles: [{}, { bold: true }],
    valueKinds: new Uint8Array([2, 1]),
    numberValues: new Float64Array([0, 42]),
    stringPoolIds: new Uint32Array([7, 0xffffffff]),
    stringLocalIds: new Int32Array([-1, -1]),
    stringPoolUpdateIds: new Uint32Array([7]),
    stringPoolUpdateValues: ["alpha"],
    localStrings: [],
  };
}

/** A worker handler that paints one text column and records the drawn text. */
function text_drawing_worker() {
  const drawn_text: string[] = [];
  const context = new Proxy<Record<string, unknown>>(
    {},
    {
      get(target, property) {
        if (property in target) return target[String(property)];
        if (property === "measureText") return (text: string) => ({ width: text.length * 7 });
        if (property === "fillText") return (text: string) => drawn_text.push(text);
        return () => undefined;
      },
    },
  );
  const canvas = new EventTarget();
  Object.defineProperties(canvas, {
    width: { value: 640, writable: true },
    height: { value: 480, writable: true },
    getContext: { value: () => context },
  });
  const handler = createWorkerMessageHandler(() => undefined);
  handler({ type: "init", canvas, theme: DEFAULT_THEME });
  handler({
    type: "layout",
    layout: {
      columns: [{ key: "name", header: "Name", width: 160, type: "text" }],
      rowHeight: 20,
      headerHeight: 24,
      totalRows: 1,
    },
  });
  handler({
    type: "viewport",
    viewport: { width: 640, height: 480, scrollTop: 0, scrollLeft: 0 },
    dpr: 1,
  });
  const frame = {
    type: "paintPacked",
    ...make_packed_view(),
    cols: [0],
    valueKinds: new Uint8Array([2]),
    numberValues: new Float64Array([0]),
    stringPoolIds: new Uint32Array([0]),
    stringLocalIds: new Int32Array([-1]),
    styleIds: new Uint32Array([0]),
    stringPoolUpdateIds: new Uint32Array([0]),
    stringPoolUpdateValues: ["old epoch text"],
  };

  return { handler, drawnText: drawn_text, frame };
}

describe("WorkerRenderer", () => {
  it("falls back to transfers instead of overwriting busy shared regions", () => {
    const renderer = new WorkerRenderer(undefined, { sharedMemory: true });
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);

    renderer.paint(make_packed_view());
    renderer.paint(make_packed_view());
    renderer.paint(make_packed_view());

    expect(worker.messages).toHaveLength(3);
    for (const { message } of worker.messages.slice(0, 2)) {
      expect(message).toMatchObject({
        type: "paintPackedShared",
        shared: {
          buffer: expect.any(SharedArrayBuffer),
          offsets: expect.any(Object),
          lengths: expect.any(Object),
        },
      });
    }

    const fallback = worker.messages[2]!;
    expect(fallback.message).toMatchObject({
      type: "paintPacked",
      sheet: "s1",
      stringPoolEpoch: 17,
    });
    expect(fallback.transfer?.length).toBe(6);
  });
  it("posts a generic frozen pane as is and transfers copies of a packed one", () => {
    const renderer = new WorkerRenderer();
    const worker = new RecordingWorker();
    Reflect.set(renderer, "worker", worker);
    const packed = make_packed_view();
    const generic: VisibleWindowView = {
      sheet: "s1",
      stringPoolEpoch: 0,
      rows: { start: 1, end: 2 },
      cols: [0],
      values: ["fallback"],
      styleIds: new Uint32Array([0]),
      styles: [{}],
    };
    const clip = { x: 0, y: 0, w: 100, h: 40 };
    const panes: PanePaint[] = [
      { view: packed, clip, scrollTop: 0, scrollLeft: 0 },
      { view: generic, clip, scrollTop: 20, scrollLeft: 10 },
    ];

    renderer.paintPanes(panes, { x: 100, y: null });

    expect(worker.messages).toHaveLength(1);
    expect(worker.messages[0]!.message).toMatchObject({
      type: "paintPanes",
      divider: { x: 100, y: null },
      panes: [
        { packed: { sheet: "s1", stringPoolEpoch: 17 }, clip, scrollTop: 0, scrollLeft: 0 },
        { packed: undefined, clip, scrollTop: 20, scrollLeft: 10 },
      ],
    });
    const posted = worker.messages[0]!;
    const message = posted.message as {
      panes: Array<{ packed?: TransferablePackedArrays; view?: VisibleWindowView }>;
    };
    expect(message.panes.map((pane) => pane.view)).toEqual([undefined, generic]);
    const posted_packed = message.panes[0]!.packed!;
    expect(posted.transfer).toEqual([
      posted_packed.valueKinds.buffer,
      posted_packed.numberValues.buffer,
      posted_packed.stringPoolIds.buffer,
      posted_packed.stringLocalIds.buffer,
      posted_packed.styleIds.buffer,
      posted_packed.stringPoolUpdateIds!.buffer,
    ]);
    expect(posted_packed.valueKinds).not.toBe(packed.valueKinds);
    expect(posted_packed.styleIds).not.toBe(packed.styleIds);
  });

  it("drops its cached strings on a trim message", () => {
    const { handler, drawnText: drawn_text, frame } = text_drawing_worker();
    const without_updates = {
      ...frame,
      stringPoolUpdateIds: undefined,
      stringPoolUpdateValues: undefined,
    };
    handler(frame);
    drawn_text.length = 0;
    handler(without_updates);
    expect(drawn_text).toContain("old epoch text");

    drawn_text.length = 0;
    handler({ type: "trim" });
    handler(without_updates);

    expect(drawn_text).not.toContain("old epoch text");
    handler(frame);
    expect(drawn_text).toContain("old epoch text");
    handler({ type: "destroy" });
  });

  it("round-trips sender lifecycle payloads through the worker handler before acknowledging", () => {
    jest.useFakeTimers();
    const failures: unknown[] = [];
    const renderer = new WorkerRenderer("/worker.js", {}, (error) => failures.push(error));
    try {
      const host = document.createElement("div");
      const layout: RenderLayout = {
        columns: [],
        rowHeight: 20,
        headerHeight: 24,
        totalRows: 0,
      };
      const theme = DEFAULT_THEME;

      renderer.mount(host, theme);
      const worker = latest_worker();
      const canvas = host.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("worker canvas was not mounted");

      renderer.setLayout(layout);
      renderer.setTheme(theme);
      renderer.setViewport({ width: 640, height: 480, scrollTop: 12, scrollLeft: 8 });
      renderer.paintPanes([], { x: null, y: null });
      expect(canvas.style.width).toBe("640px");
      expect(canvas.style.height).toBe("480px");

      const paint_payload = worker.messages.at(-1)?.message;
      if (!paint_payload) throw new Error("paint payload was not posted");
      const premature_acknowledgements: unknown[] = [];
      createWorkerMessageHandler((message) => premature_acknowledgements.push(message))(
        paint_payload,
      );
      expect(premature_acknowledgements).toEqual([]);

      const acknowledgements: unknown[] = [];
      const handle_worker_message = createWorkerMessageHandler((message) => {
        acknowledgements.push(message);
        worker.emitMessage(message);
      });
      for (const { message } of worker.messages.slice(0, -1)) {
        handle_worker_message(message);
      }
      expect(acknowledgements).toEqual([{ type: "ready" }]);
      jest.advanceTimersByTime(30_000);
      expect(failures).toHaveLength(0);
      expect(canvas.dataset.workerFrame).toBe("0");

      handle_worker_message(paint_payload);
      expect(acknowledgements).toEqual([{ type: "ready" }, { type: "painted" }]);
      expect(canvas.dataset.workerFrame).toBe("1");

      renderer.destroy();
      handle_worker_message(worker.messages.at(-1)?.message);
      expect(acknowledgements).toEqual([{ type: "ready" }, { type: "painted" }]);
      expect(worker.terminations).toBe(1);
      expect(host.querySelector("canvas")).toBeNull();
    } finally {
      renderer.destroy();
    }
  });

  it("keeps a fatal reason within the error text budget", () => {
    const failures: SheetwriteError[] = [];
    const renderer = new WorkerRenderer("/worker.js", {}, (error) => failures.push(error));
    renderer.mount(document.createElement("div"), DEFAULT_THEME);
    latest_worker().emitMessage({ type: "fatal", reason: "x".repeat(100_000) });

    expect(failures.map((error) => error.context?.failure)).toEqual(["fatal"]);
    expect(failures[0]?.message.length).toBe(256);
    renderer.destroy();
  });

  it("reports an unknown or unreadable request as fatal once", () => {
    const replies: WorkerAcknowledgement[] = [];
    const handle = createWorkerMessageHandler((reply) => replies.push(reply));

    handle({ type: "repaint" });
    handle(null);

    expect(replies).toEqual([{ type: "fatal", reason: expect.any(String) }]);
  });

  it("falls back to the canvas exactly once when a constructed worker fails asynchronously", async () => {
    await initSheetwrite();
    const restore_stubs = installCanvasTestStubs();
    try {
      const host = mountHost();
      const events: Array<GridEvents["renderer-fallback"]> = [];
      const grid = new GridImpl(host, {
        workbook: makeWorkbook(5),
        data: makeColumnarData(5),
        renderer: "worker",
        workerUrl: "/worker-that-fails-after-construction.js",
      });
      grid.on("renderer-fallback", (event) => events.push(event));
      expect(grid.rendererKind()).toBe("worker");
      expect(host.querySelectorAll("canvas")).toHaveLength(1);
      const worker = latest_worker();

      const failure = new Error("module load failed");
      worker.fail(failure);
      await Promise.resolve();
      worker.fail(new Error("duplicate failure"));
      await Promise.resolve();

      expect(grid.rendererKind()).toBe("canvas");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        requested: "worker",
        error: {
          code: "renderer-fallback",
          operation: "renderer-worker",
          message: failure.message,
        },
      });
      expect(worker.terminations).toBe(1);
      grid.destroy();
      expect(host.querySelectorAll("canvas")).toHaveLength(0);
    } finally {
      restore_stubs();
    }
  });
});
