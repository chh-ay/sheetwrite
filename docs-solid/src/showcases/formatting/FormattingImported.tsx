import { createEffect, For, on, onCleanup, Show } from "solid-js";

import { ShowcaseSection } from "../layout/ShowcaseLayout.js";
import { roundTripReport } from "./store.js";

/** The workbook the XLSX proof re-imported, once the reader has run it. */
export function FormattingImported() {
  return (
    <Show when={roundTripReport()}>
      {(report) => {
        let host!: HTMLDivElement;
        createEffect(
          on(report, (current) => {
            let dispose: (() => void) | undefined;
            let removed = false;
            void import("./boot.js").then(({ showImportedBudget }) => {
              if (!removed) dispose = showImportedBudget(host, current.snapshot);
            });
            onCleanup(() => {
              removed = true;
              dispose?.();
            });
          }),
        );
        return (
          <ShowcaseSection id="formatting-imported" title="The re-imported workbook">
            <div
              aria-label="Re-imported operating budget"
              class="sw-formatting-imported"
              ref={host}
            />
            <Show when={report().differences.length > 0}>
              <p>{report().differences.join(", ")}</p>
            </Show>
            <For each={report().warnings}>{(warning) => <p>{warning.message}</p>}</For>
          </ShowcaseSection>
        );
      }}
    </Show>
  );
}
