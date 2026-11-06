import { useEffect, useId, useRef, useState } from "react";
import { formulaTableHtml, formulaTableUrl } from "virtual:formula-tables";

import { DemoSelect } from "../showcases/ui/DemoSelect.js";

const ENGINE_OPTIONS = [
  { label: "Either engine", value: "all" },
  { label: "Default and full", value: "default" },
  { label: "Full only", value: "full" },
] as const;

/** A family table's markup, or why it is missing. */
type TableState = { html: string } | { failed: true };

/**
 * The family table's markup: inlined by the server render, read back from the
 * prerendered page when it hydrates, and fetched after a client-side
 * navigation. The page's script never carries the rows.
 */
function useFamilyTable(family: string, elementId: string): TableState | null {
  const [table, setTable] = useState<TableState | null>(() => {
    const html =
      formulaTableHtml(family) ??
      (typeof document === "undefined" ? null : document.getElementById(elementId)?.innerHTML);
    return html ? { html } : null;
  });
  useEffect(() => {
    if (table !== null) return;
    const url = formulaTableUrl(family);
    if (url === null) {
      setTable({ failed: true });
      return;
    }
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then((html) => setTable({ html }))
      .catch(() => {
        if (!controller.signal.aborted) setTable({ failed: true });
      });
    return () => controller.abort();
  }, [family, table]);
  return table;
}

/**
 * A family's function table with its filter. The rows are static HTML (see
 * formula-tables.ts); the filter hides rows by their data attributes.
 */
export function FormulaReference({ family }: Readonly<{ family: string }>) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const tableId = `formula-table-${family}`;
  const table = useFamilyTable(family, tableId);
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState("all");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let visible = 0;
    for (const family of root.current?.querySelectorAll<HTMLElement>(".sw-formula-family") ?? []) {
      let familyCount = 0;
      for (const row of family.querySelectorAll<HTMLElement>("[data-formula-name]")) {
        const matches =
          (row.dataset.formulaName ?? "").toLowerCase().includes(query.trim().toLowerCase()) &&
          (engine === "all" || row.dataset.engine === engine);
        row.hidden = !matches;
        if (matches) familyCount++;
      }
      family.hidden = familyCount === 0;
      visible += familyCount;
    }
    setCount(visible);
  }, [query, engine, table]);

  return (
    <div className="sw-formula-reference" ref={root}>
      <div className="sw-formula-filter">
        <label htmlFor={`${id}-search`}>
          Find a function
          <input
            id={`${id}-search`}
            type="search"
            placeholder="Name or alias, e.g. SUM"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <DemoSelect
          className="sw-formula-filter__engine"
          label="Available in"
          options={ENGINE_OPTIONS}
          value={engine}
          onValueChange={setEngine}
        />
        <p role="status">{count === null ? "All functions" : `${count} functions`}</p>
      </div>
      {count === 0 && table !== null && "html" in table ? (
        <p>No functions match. Try another name or engine.</p>
      ) : null}
      {table !== null && "failed" in table ? (
        <p>The function table did not load. Reload the page to see it.</p>
      ) : null}
      <div
        className="sw-formula-reference__table"
        dangerouslySetInnerHTML={{ __html: table !== null && "html" in table ? table.html : "" }}
        id={tableId}
      />
    </div>
  );
}
