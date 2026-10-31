import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test";

import { SheetwriteError } from "../src/errors.js";
import type { Theme } from "../src/types.js";
import { WorkerRenderer } from "../src/worker-renderer.js";
import { createWorkerMessageHandler, type WorkerAcknowledgement } from "../src/worker.js";

const THEME: Theme = {
  font: "12px sans-serif",
  bg: "#fff",
  fg: "#111",
  gridLine: "#ddd",
  headerBg: "#eee",
  headerFg: "#222",
  selection: "#def",
  selectionBorder: "#08f",
  rowHeight: 20,
  headerHeight: 24,
  rowHeaderWidth: 40,
  searchMatch: "#ff0",
  searchActiveMatch: "#fa0",
  highlight: "#cfc",
};

let constructed: ListenerCountingWorker | null = null;

/** A Worker stand-in that counts the listeners still registered on it. */
class ListenerCountingWorker extends EventTarget {
  listeners = 0;
  terminations = 0;

  constructor() {
    super();
    constructed = this;
  }

  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
    this.listeners += 1;
    super.addEventListener(...args);
  }

  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>): void {
    this.listeners -= 1;
    super.removeEventListener(...args);
  }

  postMessage(): void {}

  terminate(): void {
    this.terminations += 1;
  }

  reply(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }

  crash(message: string): void {
    const event = new Event("error", { cancelable: true });
    Object.defineProperties(event, {
      error: { value: new Error(message) },
      message: { value: message },
    });
    this.dispatchEvent(event);
  }
}

const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
const transferDescriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "transferControlToOffscreen",
);

function restore(target: object, key: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  jest.useFakeTimers();
  constructed = null;
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: ListenerCountingWorker,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
    configurable: true,
    value: () => new EventTarget(),
  });
});

afterEach(() => {
  jest.useRealTimers();
  restore(globalThis, "Worker", workerDescriptor);
  restore(HTMLCanvasElement.prototype, "transferControlToOffscreen", transferDescriptor);
});

function mount(): {
  renderer: WorkerRenderer;
  worker: ListenerCountingWorker;
  failures: SheetwriteError[];
} {
  const failures: SheetwriteError[] = [];
  const renderer = new WorkerRenderer("/worker.js", {}, (error) => failures.push(error));
  renderer.mount(document.createElement("div"), THEME);
  if (!constructed) throw new Error("Worker was not constructed");
  return { renderer, worker: constructed, failures };
}

function failureKind(error: SheetwriteError | undefined): unknown {
  return error?.context?.failure;
}

describe("worker renderer failures", () => {
  it("types a worker that cannot start", () => {
    Object.defineProperty(globalThis, "Worker", {
      configurable: true,
      value: class {
        constructor() {
          throw new DOMException("blocked", "SecurityError");
        }
      },
    });

    const renderer = new WorkerRenderer("/worker.js");
    let thrown: unknown;
    try {
      renderer.mount(document.createElement("div"), THEME);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(SheetwriteError);
    expect(thrown).toMatchObject({
      code: "renderer-fallback",
      operation: "renderer-worker",
      context: { requested: "worker", failure: "spawn" },
    });
  });

  it("reports a load failure before ready as spawn and a later one as crash", () => {
    const early = mount();
    early.worker.crash("module script failed");
    expect(early.failures.map(failureKind)).toEqual(["spawn"]);

    const late = mount();
    late.worker.reply({ type: "ready" });
    late.worker.crash("paint threw");
    expect(late.failures.map(failureKind)).toEqual(["crash"]);
    expect(late.failures[0]?.message).toBe("paint threw");
    expect(late.failures[0]?.cause).toBeInstanceOf(Error);
  });

  it("fails once on an unknown or unreadable reply and frees its listeners and timer", () => {
    for (const send of [
      (worker: ListenerCountingWorker) => worker.reply({ type: "repainted" }),
      (worker: ListenerCountingWorker) => worker.reply("ready"),
      (worker: ListenerCountingWorker) => worker.dispatchEvent(new MessageEvent("messageerror")),
    ]) {
      const { worker, failures } = mount();
      expect(worker.listeners).toBe(3);

      send(worker);
      worker.crash("after the failure");
      jest.advanceTimersByTime(30_000);

      expect(failures.map(failureKind)).toEqual(["protocol"]);
      expect(worker.listeners).toBe(0);
      expect(worker.terminations).toBe(1);
    }
  });

  it("frees listeners and the readiness timer on destroy", () => {
    const { renderer, worker, failures } = mount();
    renderer.destroy();
    jest.advanceTimersByTime(30_000);

    expect(failures).toHaveLength(0);
    expect(worker.listeners).toBe(0);
    expect(worker.terminations).toBe(1);
  });

  it("keeps a fatal reason within the error text budget", () => {
    const { worker, failures } = mount();
    worker.reply({ type: "fatal", reason: "x".repeat(100_000) });

    expect(failures.map(failureKind)).toEqual(["fatal"]);
    expect(failures[0]?.message.length).toBe(256);
  });
});

describe("worker request protocol", () => {
  it("reports an unknown or unreadable request as fatal once", () => {
    const replies: WorkerAcknowledgement[] = [];
    const handle = createWorkerMessageHandler((reply) => replies.push(reply));

    handle({ type: "repaint" });
    handle(null);

    expect(replies).toEqual([
      { type: "fatal", reason: "Sheetwrite: paint worker received an unknown request" },
    ]);
  });
});
