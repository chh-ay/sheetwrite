import type * as WasmExports from "./pkg/sheetwrite_wasm.js";

export * from "./pkg/sheetwrite_wasm.js";

/** Sources accepted by asynchronous initialization: a fetchable URL/request/response, raw module bytes, or a precompiled `WebAssembly.Module`. */
export type { InitInput } from "./pkg/sheetwrite_wasm.js";

/** Result of module initialization: the instantiated exports plus the shared linear memory. */
export type { InitOutput } from "./pkg/sheetwrite_wasm.js";

/** Sources accepted by synchronous initialization: raw module bytes or a precompiled `WebAssembly.Module`. */
export type { SyncInitInput } from "./pkg/sheetwrite_wasm.js";

/**
 * Initialize the WASM module. Idempotent and re-entrant: concurrent
 * same-source callers share one in-flight init; a concurrent different-source
 * call rejects; a different-source call after success warns and no-ops; a
 * rejected init is retryable. When `source` is omitted the loader picks the
 * right strategy for the runtime.
 *
 * @example
 * ```ts
 * import { initSheetwrite } from "@sheetwrite/core";
 * import * as formulas from "@sheetwrite/formulas";
 *
 * await initSheetwrite(undefined, formulas);
 * ```
 * @see /docs/start/choose-an-engine/
 */
export declare function load(
 source?: BufferSource | URL | string | Request | WebAssembly.Module,
): Promise<void>;

/** Whether the WASM module has finished initializing. */
export declare function isLoaded(): boolean;

/** Engine objects and caches owned by one independently collectible WASM instance. */
export type EngineInstance = Omit<typeof WasmExports, "default"> & {
 getModule(): WebAssembly.Module;

 getMemory(): WebAssembly.Memory;

 /** Drop all glue roots after releasing owned resources. This instance is then unusable. */
 retire(): void;

 functionNames?: () => string[];
};

/** Initialize a fresh engine; a compiled module can be reused without retaining its memory. */
export declare function createEngine(source?: Parameters<typeof load>[0]): Promise<EngineInstance>;
