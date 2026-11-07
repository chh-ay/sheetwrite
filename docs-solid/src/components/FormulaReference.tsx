import { createEffect, createSignal, createUniqueId, Show } from "solid-js";
import { isServer } from "solid-js/web";

import { DemoSelect } from "./DemoSelect.js";

/*
 * A formula family's filter, ported from docs/src/components/FormulaReference.tsx.
 * The family's table is static page markup beside it (islands/content.tsx
 * renders both); this island only hides and counts the table's rows.
 */

const ENGINE_OPTIONS = [
  { label: "Either engine", value: "all" },
  { label: "Default and full", value: "default" },
  { label: "Full only", value: "full" },
] as const;

/** The id of a family's table element, which the filter reads its rows from. */
export function formulaTableId(family: string): string {
  return `formula-table-${family}`;
}

/** The find field, the engine select and the match count over the family's table. */
export function FormulaFilter(props: { readonly family: string }) {
  const id = createUniqueId();
  // The island hydrates when the reader first uses it (islands/content.tsx), so
  // they may have typed into the server-rendered field already; keep that text.
  const typed = isServer
    ? ""
    : ((document.getElementById(`${id}-search`) as HTMLInputElement | null)?.value ?? "");
  const [query, setQuery] = createSignal(typed);
  const [engine, setEngine] = createSignal("all");
  const [count, setCount] = createSignal<number | null>(null);

  createEffect(() => {
    const needle = query().trim().toLowerCase();
    const wanted = engine();
    const table = document.getElementById(formulaTableId(props.family));
    let visible = 0;
    for (const family of table?.querySelectorAll<HTMLElement>(".sw-formula-family") ?? []) {
      let familyCount = 0;
      for (const row of family.querySelectorAll<HTMLElement>("[data-formula-name]")) {
        const matches =
          (row.dataset.formulaName ?? "").toLowerCase().includes(needle) &&
          (wanted === "all" || row.dataset.engine === wanted);
        row.hidden = !matches;
        if (matches) familyCount++;
      }
      family.hidden = familyCount === 0;
      visible += familyCount;
    }
    setCount(visible);
  });

  return (
    <>
      <div class="sw-formula-filter">
        <label for={`${id}-search`}>
          Find a function
          <input
            id={`${id}-search`}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="Name or alias, e.g. SUM"
            type="search"
            value={query()}
          />
        </label>
        <DemoSelect
          class="sw-formula-filter__engine"
          label="Available in"
          onValueChange={setEngine}
          options={ENGINE_OPTIONS}
          value={engine()}
        />
        <p role="status">{count() === null ? "All functions" : `${count()} functions`}</p>
      </div>
      <Show when={count() === 0}>
        <p>No functions match. Try another name or engine.</p>
      </Show>
    </>
  );
}
