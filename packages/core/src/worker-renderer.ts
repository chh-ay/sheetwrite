import { SheetwriteError } from "./errors.js";
import type { PanePaint, Renderer, RenderLayout, Theme, Viewport } from "./types/render.js";
import type { VisibleWindowView } from "./types/store.js";

export interface WorkerRendererOptions {
  /**
   * Force the SharedArrayBuffer paint path. Browsers normally require
   * `crossOriginIsolated`; tests and hosts that already enforce COOP/COEP can
   * opt in explicitly. When false/unavailable, the renderer keeps the transfer
   * path byte-for-byte compatible.
   */
  sharedMemory?: boolean;
}

interface SharedPackedOffsets {
  valueKinds: number;
  numberValues: number;
  stringPoolIds: number;
  stringLocalIds: number;
  styleIds: number;
  stringPoolUpdateIds: number;
}

interface SharedPackedLengths {
  valueKinds: number;
  numberValues: number;
  stringPoolIds: number;
  stringLocalIds: number;
  styleIds: number;
  stringPoolUpdateIds: number;
}

interface SharedPackedLayout {
  totalBytes: number;
  offsets: SharedPackedOffsets;
  lengths: SharedPackedLengths;
}

interface SharedRegion {
  buffer: SharedArrayBuffer;
  header: Int32Array;
  byteLength: number;
  generation: number;
}

// Cold module loading and OffscreenCanvas startup can take seconds on slower
// devices; ten seconds tolerates that path without leaving a blank grid forever.
const WORKER_READY_TIMEOUT_MS = 10_000;
const SHARED_REGION_COUNT = 2;
const SHARED_HEADER_INTS = 2;
const SHARED_HEADER_BYTES = SHARED_HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
const SHARED_STATE_SLOT = 0;
const SHARED_GENERATION_SLOT = 1;
const SHARED_FREE = 0;
const SHARED_BUSY = 1;
/**
 * Error and fatal texts come from the worker script, which `workerUrl` can
 * replace; an error message keeps only this many characters of them.
 */
const MAX_WORKER_TEXT_LENGTH = 256;

/** Why the paint worker stopped; `context.failure` of its `renderer-fallback` error. */
type WorkerFailure = "spawn" | "crash" | "protocol" | "timeout" | "fatal";

function worker_failure(failure: WorkerFailure, message: string, cause?: unknown): SheetwriteError {
  return new SheetwriteError("renderer-fallback", "renderer-worker", message, {
    cause,
    context: { requested: "worker", failure },
  });
}

function align(offset: number, alignment: number): number {
  return (offset + alignment - 1) & ~(alignment - 1);
}

function shared_packed_layout(cell_count: number, string_update_count: number): SharedPackedLayout {
  let offset = SHARED_HEADER_BYTES;

  const value_kinds = offset;
  offset += cell_count * Uint8Array.BYTES_PER_ELEMENT;

  offset = align(offset, Float64Array.BYTES_PER_ELEMENT);
  const number_values = offset;
  offset += cell_count * Float64Array.BYTES_PER_ELEMENT;

  offset = align(offset, Uint32Array.BYTES_PER_ELEMENT);
  const string_pool_ids = offset;
  offset += cell_count * Uint32Array.BYTES_PER_ELEMENT;

  offset = align(offset, Int32Array.BYTES_PER_ELEMENT);
  const string_local_ids = offset;
  offset += cell_count * Int32Array.BYTES_PER_ELEMENT;

  offset = align(offset, Uint32Array.BYTES_PER_ELEMENT);
  const style_ids = offset;
  offset += cell_count * Uint32Array.BYTES_PER_ELEMENT;

  offset = align(offset, Uint32Array.BYTES_PER_ELEMENT);
  const string_pool_update_ids = offset;
  offset += string_update_count * Uint32Array.BYTES_PER_ELEMENT;

  return {
    totalBytes: offset,
    offsets: {
      valueKinds: value_kinds,
      numberValues: number_values,
      stringPoolIds: string_pool_ids,
      stringLocalIds: string_local_ids,
      styleIds: style_ids,
      stringPoolUpdateIds: string_pool_update_ids,
    },
    lengths: {
      valueKinds: cell_count,
      numberValues: cell_count,
      stringPoolIds: cell_count,
      stringLocalIds: cell_count,
      styleIds: cell_count,
      stringPoolUpdateIds: string_update_count,
    },
  };
}

/**
 * OffscreenCanvas-in-Worker renderer: paint runs off the main thread, immune to
 * a contended main thread. Same `Renderer` interface as `CanvasRenderer`, so it
 * is a drop-in (`renderer: "worker"`). Custom cell renderers are not supported
 * here (functions can't be transferred to a worker).
 */
export class WorkerRenderer implements Renderer {
  private canvas: HTMLCanvasElement | null = null;
  private worker: Worker | null = null;
  private shared_cursor = 0;
  private readonly shared_regions: Array<SharedRegion | undefined> = new Array(SHARED_REGION_COUNT);
  private failed = false;
  private frame_generation = 0;
  private readiness_timeout: number | undefined;

  constructor(
    private readonly workerUrl?: string | URL,
    private readonly options: WorkerRendererOptions = {},
    private readonly onFailure?: (error: SheetwriteError) => void,
  ) {}

  mount(host: HTMLElement, theme: Theme): void {
    // Construct the worker first: if it throws (bundling/security), the canvas
    // is never transferred and the grid falls back to the main-thread renderer.
    // Keep the default as one `new Worker(new URL(..., import.meta.url))`
    // expression: Vite, webpack 5 and Parcel only bundle a worker (with its
    // imports) when they see that exact shape. Split apart, they copy the
    // file as a bare asset whose relative imports do not exist.
    let worker: Worker;
    try {
      worker =
        this.workerUrl === undefined
          ? new Worker(new URL("./worker.js", import.meta.url), { type: "module" })
          : new Worker(this.workerUrl, { type: "module" });
    } catch (error) {
      throw worker_failure("spawn", "Sheetwrite: paint worker could not start", error);
    }

    this.worker = worker;
    worker.addEventListener("error", this.on_worker_error);
    worker.addEventListener("message", this.on_worker_message);
    worker.addEventListener("messageerror", this.on_worker_message_error);

    const canvas = document.createElement("canvas");
    canvas.className = "sheetwrite-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.dataset.workerFrame = "0";

    try {
      const offscreen = canvas.transferControlToOffscreen();
      this.readiness_timeout = window.setTimeout(() => {
        this.fail(worker_failure("timeout", "Sheetwrite: paint worker did not become ready"));
      }, WORKER_READY_TIMEOUT_MS);
      worker.postMessage({ type: "init", canvas: offscreen, theme }, [offscreen]);
      host.appendChild(canvas);
      this.canvas = canvas;
    } catch (error) {
      this.destroy();
      throw worker_failure("spawn", "Sheetwrite: paint worker could not take the canvas", error);
    }
  }

  setLayout(layout: RenderLayout): void {
    this.worker?.postMessage({ type: "layout", layout });
  }

  setTheme(theme: Theme): void {
    this.worker?.postMessage({ type: "theme", theme });
  }

  setRenderers(): void {
    // Custom renderers are functions and cannot cross the worker boundary.
  }

  setViewport(viewport: Viewport): void {
    if (this.canvas) {
      this.canvas.style.width = `${viewport.width}px`;
      this.canvas.style.height = `${viewport.height}px`;
    }
    this.worker?.postMessage({ type: "viewport", viewport, dpr: globalThis.devicePixelRatio ?? 1 });
  }

  paint(view: VisibleWindowView): void {
    const {
      valueKinds: value_kinds,
      numberValues: number_values,
      stringPoolIds: string_pool_ids,
      stringLocalIds: string_local_ids,
      stringPoolUpdateIds: string_pool_update_ids,
      stringPoolUpdateValues: string_pool_update_values,
      localStrings: local_strings,
    } = view;
    if (value_kinds && number_values && string_pool_ids && string_local_ids) {
      if (
        this.can_use_shared_memory() &&
        this.post_shared_packed_view(
          view,
          value_kinds,
          number_values,
          string_pool_ids,
          string_local_ids,
          string_pool_update_ids,
          string_pool_update_values,
          local_strings,
        )
      ) {
        return;
      }

      // The renderer transfers only buffers it allocated: the view reuses its
      // own buffers across repaints.
      const owned_value_kinds = value_kinds.slice();
      const owned_number_values = number_values.slice();
      const owned_string_pool_ids = string_pool_ids.slice();
      const owned_string_local_ids = string_local_ids.slice();
      const owned_style_ids = view.styleIds.slice();
      const owned_string_pool_update_ids = string_pool_update_ids?.slice();
      const transfers: Transferable[] = [
        owned_value_kinds.buffer as ArrayBuffer,
        owned_number_values.buffer as ArrayBuffer,
        owned_string_pool_ids.buffer as ArrayBuffer,
        owned_string_local_ids.buffer as ArrayBuffer,
        owned_style_ids.buffer as ArrayBuffer,
      ];
      if (owned_string_pool_update_ids) {
        transfers.push(owned_string_pool_update_ids.buffer as ArrayBuffer);
      }
      this.worker?.postMessage(
        {
          type: "paintPacked",
          sheet: view.sheet,
          stringPoolEpoch: view.stringPoolEpoch,
          rows: view.rows,
          cols: view.cols,
          styles: view.styles,
          styleIds: owned_style_ids,
          valueKinds: owned_value_kinds,
          numberValues: owned_number_values,
          stringPoolIds: owned_string_pool_ids,
          stringLocalIds: owned_string_local_ids,
          stringPoolUpdateIds: owned_string_pool_update_ids,
          stringPoolUpdateValues: string_pool_update_values,
          localStrings: local_strings,
        },
        transfers,
      );
      return;
    }

    // Custom Store implementations may not expose raw arrays; keep the
    // compatibility path while preserving ownership of their style IDs.
    const style_ids = view.styleIds.slice();
    this.worker?.postMessage({ type: "paint", view: { ...view, styleIds: style_ids } }, [
      style_ids.buffer,
    ]);
  }

  paintPanes(panes: readonly PanePaint[], divider: { x: number | null; y: number | null }): void {
    const worker = this.worker;
    if (!worker) return;

    // Pane frames always use the transfer path: the SAB double-buffer protocol
    // hands one region per frame, not one per pane, and frozen frames are
    // bounded by the tiny frozen windows anyway.
    const transfers: Transferable[] = [];
    const payload = panes.map((pane) => {
      const { view } = pane;
      const {
        valueKinds: value_kinds,
        numberValues: number_values,
        stringPoolIds: string_pool_ids,
        stringLocalIds: string_local_ids,
        stringPoolUpdateIds: string_pool_update_ids,
      } = view;
      const packed =
        value_kinds && number_values && string_pool_ids && string_local_ids
          ? {
              sheet: view.sheet,
              stringPoolEpoch: view.stringPoolEpoch,
              rows: view.rows,
              cols: view.cols,
              styles: view.styles,
              styleIds: view.styleIds.slice(),
              valueKinds: value_kinds.slice(),
              numberValues: number_values.slice(),
              stringPoolIds: string_pool_ids.slice(),
              stringLocalIds: string_local_ids.slice(),
              stringPoolUpdateIds: string_pool_update_ids?.slice(),
              stringPoolUpdateValues: view.stringPoolUpdateValues,
              localStrings: view.localStrings,
            }
          : undefined;
      if (packed) {
        transfers.push(
          packed.valueKinds.buffer as ArrayBuffer,
          packed.numberValues.buffer as ArrayBuffer,
          packed.stringPoolIds.buffer as ArrayBuffer,
          packed.stringLocalIds.buffer as ArrayBuffer,
          packed.styleIds.buffer as ArrayBuffer,
        );
        if (packed.stringPoolUpdateIds) {
          transfers.push(packed.stringPoolUpdateIds.buffer as ArrayBuffer);
        }
      }

      return {
        packed,
        // Structured-clone fallback for custom stores without raw arrays.
        view: packed ? undefined : view,
        clip: pane.clip,
        scrollTop: pane.scrollTop,
        scrollLeft: pane.scrollLeft,
        rowTops: pane.rowTops,
        rowHeights: pane.rowHeights,
        rowNumbers: pane.rowNumbers,
        filteredRows: pane.filteredRows,
        filterHeader: pane.filterHeader,
      };
    });

    worker.postMessage({ type: "paintPanes", panes: payload, divider }, transfers);
  }

  /**
   * Drop the worker's string cache and the shared paint regions. The worker
   * still holds a region that it paints from, and the next frame allocates new
   * ones. The caller must make the next frame read its window again, so the
   * frame lists every string as a pool update.
   */
  trimMemory(): void {
    this.worker?.postMessage({ type: "trim" });
    this.shared_regions.fill(undefined);
  }

  destroy(): void {
    window.clearTimeout(this.readiness_timeout);
    this.readiness_timeout = undefined;
    const worker = this.worker;
    if (worker) {
      worker.removeEventListener("error", this.on_worker_error);
      worker.removeEventListener("message", this.on_worker_message);
      worker.removeEventListener("messageerror", this.on_worker_message_error);
      worker.postMessage({ type: "destroy" });
      worker.terminate();
    }
    this.worker = null;
    this.canvas?.remove();
    this.canvas = null;
    this.shared_regions.fill(undefined);
  }

  private readonly on_worker_error = (event: ErrorEvent): void => {
    event.preventDefault();
    // Before `ready`, an error event means the script did not load or start.
    const failure = this.readiness_timeout === undefined ? "crash" : "spawn";
    this.fail(
      worker_failure(
        failure,
        event.message
          ? event.message.slice(0, MAX_WORKER_TEXT_LENGTH)
          : "Sheetwrite: paint worker stopped with an uncaught error",
        event.error,
      ),
    );
  };

  /** A reply that cannot be deserialized means the two sides disagree on the protocol. */
  private readonly on_worker_message_error = (): void => {
    this.fail(
      worker_failure("protocol", "Sheetwrite: paint worker sent a reply that cannot be read"),
    );
  };

  private readonly on_worker_message = (event: MessageEvent<unknown>): void => {
    const data = event.data;
    const reply = data !== null && typeof data === "object" ? data : {};
    switch ("type" in reply ? reply.type : undefined) {
      case "ready":
        window.clearTimeout(this.readiness_timeout);
        this.readiness_timeout = undefined;
        break;
      case "fatal": {
        const reason = "reason" in reply ? reply.reason : undefined;
        this.fail(
          worker_failure(
            "fatal",
            typeof reason === "string"
              ? reason.slice(0, MAX_WORKER_TEXT_LENGTH)
              : "Sheetwrite: paint worker reported a fatal failure",
          ),
        );
        break;
      }
      case "painted":
        this.frame_generation++;
        if (this.canvas) this.canvas.dataset.workerFrame = String(this.frame_generation);
        break;
      default:
        // A worker from another release (a stale `workerUrl` copy) can send
        // replies this renderer does not know; painting on would be guesswork.
        this.fail(worker_failure("protocol", "Sheetwrite: paint worker sent an unknown reply"));
    }
  };

  private fail(error: SheetwriteError): void {
    if (this.failed) return;
    this.failed = true;
    const on_failure = this.onFailure;
    this.destroy();
    on_failure?.(error);
  }

  private can_use_shared_memory(): boolean {
    return (
      typeof SharedArrayBuffer === "function" &&
      (this.options.sharedMemory === true || globalThis.crossOriginIsolated === true)
    );
  }

  private post_shared_packed_view(
    view: VisibleWindowView,
    value_kinds: Uint8Array,
    number_values: Float64Array,
    string_pool_ids: Uint32Array,
    string_local_ids: Int32Array,
    string_pool_update_ids: Uint32Array | undefined,
    string_pool_update_values: readonly string[] | undefined,
    local_strings: readonly string[] | undefined,
  ): boolean {
    const worker = this.worker;
    if (!worker) return false;

    const layout = shared_packed_layout(value_kinds.length, string_pool_update_ids?.length ?? 0);
    for (let attempt = 0; attempt < SHARED_REGION_COUNT; attempt++) {
      const region_index = (this.shared_cursor + attempt) % SHARED_REGION_COUNT;
      const region = this.shared_region(region_index, layout.totalBytes);
      if (
        Atomics.compareExchange(region.header, SHARED_STATE_SLOT, SHARED_FREE, SHARED_BUSY) !==
        SHARED_FREE
      ) {
        continue;
      }

      region.generation = (region.generation + 1) | 0;
      if (region.generation === 0) region.generation = 1;
      Atomics.store(region.header, SHARED_GENERATION_SLOT, region.generation);
      this.copy_packed_view(
        region.buffer,
        layout,
        value_kinds,
        number_values,
        string_pool_ids,
        string_local_ids,
        view.styleIds,
        string_pool_update_ids,
      );

      this.shared_cursor = (region_index + 1) % SHARED_REGION_COUNT;
      worker.postMessage({
        type: "paintPackedShared",
        sheet: view.sheet,
        stringPoolEpoch: view.stringPoolEpoch,
        rows: view.rows,
        cols: view.cols,
        styles: view.styles,
        stringPoolUpdateValues: string_pool_update_values,
        localStrings: local_strings,
        shared: {
          buffer: region.buffer,
          generation: region.generation,
          offsets: layout.offsets,
          lengths: layout.lengths,
        },
      });
      return true;
    }

    return false;
  }

  private shared_region(index: number, byte_length: number): SharedRegion {
    let region = this.shared_regions[index];
    if (!region || region.byteLength < byte_length) {
      const buffer = new SharedArrayBuffer(byte_length);
      region = {
        buffer,
        header: new Int32Array(buffer, 0, SHARED_HEADER_INTS),
        byteLength: byte_length,
        generation: 0,
      };
      this.shared_regions[index] = region;
    }
    return region;
  }

  private copy_packed_view(
    buffer: SharedArrayBuffer,
    layout: SharedPackedLayout,
    value_kinds: Uint8Array,
    number_values: Float64Array,
    string_pool_ids: Uint32Array,
    string_local_ids: Int32Array,
    style_ids: Uint32Array,
    string_pool_update_ids: Uint32Array | undefined,
  ): void {
    const { offsets, lengths } = layout;
    new Uint8Array(buffer, offsets.valueKinds, lengths.valueKinds).set(value_kinds);
    new Float64Array(buffer, offsets.numberValues, lengths.numberValues).set(number_values);
    new Uint32Array(buffer, offsets.stringPoolIds, lengths.stringPoolIds).set(string_pool_ids);
    new Int32Array(buffer, offsets.stringLocalIds, lengths.stringLocalIds).set(string_local_ids);
    new Uint32Array(buffer, offsets.styleIds, lengths.styleIds).set(style_ids);
    if (string_pool_update_ids && lengths.stringPoolUpdateIds > 0) {
      new Uint32Array(buffer, offsets.stringPoolUpdateIds, lengths.stringPoolUpdateIds).set(
        string_pool_update_ids,
      );
    }
  }
}
