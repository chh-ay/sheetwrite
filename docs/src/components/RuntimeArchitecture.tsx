import { For } from "solid-js";

const layers = [
  {
    label: "Host",
    detail: "Lifecycle, persistence, collaboration, and product UI",
  },
  {
    label: "TypeScript core",
    detail: "Grid API, transactions, virtualization, interaction, and renderer coordination",
  },
  {
    label: "Rust / WASM",
    detail: "Columnar cells, formulas, query scans, snapshots, and packed render windows",
  },
] as const;

export default function RuntimeArchitecture() {
  return (
    // The figcaption needs <figure>, and the diagram must stay a named region landmark.
    <figure
      aria-label="Sheetwrite runtime ownership and data flow"
      class="sw-architecture"
      role="region"
    >
      <div class="sw-architecture__flow">
        <For each={layers}>
          {(layer, index) => (
            <div class="sw-architecture__step">
              <div>
                <span>{String(index() + 1).padStart(2, "0")}</span>
                <strong>{layer.label}</strong>
                <p>{layer.detail}</p>
              </div>
              {index() < layers.length - 1 ? <span aria-hidden="true">↓</span> : null}
            </div>
          )}
        </For>
      </div>
      <figcaption>
        Ownership moves downward through narrow contracts; events and resolved windows move upward.
      </figcaption>
    </figure>
  );
}
