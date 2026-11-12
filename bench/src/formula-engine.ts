import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as formulas from "@sheetwrite/formulas";
import * as defaultEngine from "@sheetwrite/wasm";
import type * as HistoryKernel from "@sheetwrite/wasm/history";

export const ENGINE_PACKAGE = process.env.SHEETWRITE_BENCH_ENGINE === "full" ? "formulas" : "wasm";
/**
 * The paired formula gate runs this harness once per side and points this at
 * the side's checkout. Only the engine package comes from there, so an older
 * base needs built engine artifacts, not this benchmark code. The checkout is
 * chosen at run time, so its loader can only be imported dynamically.
 */
export const ENGINE_ROOT = process.env.SHEETWRITE_BENCH_ENGINE_ROOT;
export const engine: typeof defaultEngine =
  ENGINE_ROOT === undefined
    ? ENGINE_PACKAGE === "formulas"
      ? formulas
      : defaultEngine
    : await import(
        pathToFileURL(resolve(ENGINE_ROOT, `packages/${ENGINE_PACKAGE}/loader-node.mjs`)).href
      );
export const { CellStore, initSync } = engine;
// Fixtures run on either provider, so they use the store type both share.
export type CellStore = InstanceType<defaultEngine.EngineInstance["CellStore"]>;

const ENGINE_PKG_URL =
  ENGINE_ROOT === undefined
    ? new URL(`../../packages/${ENGINE_PACKAGE}/pkg/`, import.meta.url)
    : pathToFileURL(`${resolve(ENGINE_ROOT, `packages/${ENGINE_PACKAGE}/pkg`)}/`);
export const WASM_PATH = new URL("sheetwrite_wasm_bg.wasm", ENGINE_PKG_URL);
export const ENGINE_GLUE_PATH = new URL("sheetwrite_wasm.js", ENGINE_PKG_URL);

/** The version-history diff kernel, from the same checkout as the engine. */
export const historyKernel: typeof HistoryKernel = await import(
  pathToFileURL(
    resolve(
      ENGINE_ROOT ?? fileURLToPath(new URL("../..", import.meta.url)),
      "packages/wasm/history-node.mjs",
    ),
  ).href
);
await historyKernel.loadHistoryKernel();
