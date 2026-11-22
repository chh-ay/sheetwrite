/** @jsxImportSource react */
import { SheetwriteGrid } from "@sheetwrite/react";

import "@sheetwrite/react/styles.css";
import { useState } from "react";

import {
  INVALID_WASM_SOURCE,
  LIFECYCLE_DATA,
  LIFECYCLE_RESET_DATA,
  LIFECYCLE_WORKBOOK,
} from "./fixture.js";

export default function ReactFixture() {
  const [wasm_source, set_wasm_source] = useState<Uint8Array | undefined>(INVALID_WASM_SOURCE);
  const [data, set_data] = useState(LIFECYCLE_DATA);
  const [mounted, set_mounted] = useState(true);
  const [status, set_status] = useState<"loading" | "error" | "ready">("loading");
  const [errors, set_errors] = useState(0);
  const [ready, set_ready] = useState("");

  return (
    <main data-framework-lifecycle="react">
      <button
        type="button"
        data-lifecycle-retry
        onClick={() => {
          set_status("loading");
          set_wasm_source(undefined);
        }}
      >
        Retry React
      </button>
      <button type="button" data-lifecycle-reset onClick={() => set_data(LIFECYCLE_RESET_DATA)}>
        Reset React input
      </button>
      <button type="button" data-lifecycle-unmount onClick={() => set_mounted(false)}>
        Unmount React
      </button>
      <output data-lifecycle-status>{status}</output>
      <output data-lifecycle-errors>{errors}</output>
      <output data-lifecycle-ready>{ready}</output>
      {mounted ? (
        <SheetwriteGrid
          workbook={LIFECYCLE_WORKBOOK}
          data={data}
          height={320}
          wasmSource={wasm_source}
          fallback={<span data-lifecycle-fallback>React fallback</span>}
          onInitializationError={() => {
            set_errors((count) => count + 1);
            set_status("error");
          }}
          onReady={({ generation, reason }) => {
            set_ready(`${generation}:${reason}`);
            set_status("ready");
          }}
        />
      ) : null}
    </main>
  );
}
