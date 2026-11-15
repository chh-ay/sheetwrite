import { cellA1 } from "@sheetwrite/core";
import { For, Show } from "solid-js";

import { ShowcaseSection } from "../layout/ShowcaseLayout.js";
import { roundTrip } from "./state.js";

/** Each array or spill formula before export, inside the exported file, and after import. */
export function SpillProof() {
  const examples = () => roundTrip()?.formulaExamples ?? [];
  const stored = () => examples().filter((example) => example.exported !== null).length;
  const encoded = () =>
    examples().filter((example) => example.exported?.includes("_xlfn.ANCHORARRAY(")).length;
  return (
    <Show when={examples().length > 0}>
      <ShowcaseSection id="interop-spill" title="Array constants and spill references">
        <div class="sw-si-source-proof" data-testid="interop-spill-proof">
          <p>
            Excel stores <code>A1#</code> as <code>_xlfn.ANCHORARRAY(A1)</code>. Each row shows the
            same formula as a grid source, as the text inside the exported .xlsx file, and after the
            file is imported again.
          </p>
          <div class="sw-si-tablewrap">
            <table class="sw-si-matrix">
              <thead>
                <tr>
                  <th>Cell</th>
                  <th>Before export</th>
                  <th>In the exported .xlsx</th>
                  <th>After import</th>
                </tr>
              </thead>
              <tbody>
                <For each={examples()}>
                  {(example) => (
                    <tr
                      data-exported={example.exported === null ? "missing" : "found"}
                      data-matched={example.before === example.after}
                      data-spill-encoding={
                        example.exported?.includes("_xlfn.ANCHORARRAY(") ? "anchorarray" : "plain"
                      }
                    >
                      <th>
                        {example.sheet} · {cellA1(example.row, example.col)}
                      </th>
                      <td>
                        <code>{example.before}</code>
                      </td>
                      <td>
                        <code>{example.exported ?? "Not found in the exported file"}</code>
                      </td>
                      <td>
                        <code>{example.after ?? "Not preserved"}</code>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <p class="sw-si-note" data-testid="interop-spill-file-check">
            Exported-file check: {stored()} of {examples().length} example formulas found in the
            bytes this page just wrote; {encoded()} stored as <code>_xlfn.ANCHORARRAY(...)</code>.
          </p>
        </div>
      </ShowcaseSection>
    </Show>
  );
}
