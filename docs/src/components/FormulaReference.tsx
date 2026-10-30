import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { DemoSelect } from "../showcases/ui/DemoSelect.js";

const ENGINE_OPTIONS = [
  { label: "Either engine", value: "all" },
  { label: "Default and full", value: "default" },
  { label: "Full only", value: "full" },
] as const;

/** Filters generated family rows without duplicating the checked formula inventory. */
export function FormulaReference({ children }: Readonly<{ children: ReactNode }>) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
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
  }, [query, engine]);

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
      {count === 0 ? <p>No functions match. Try another name or engine.</p> : null}
      {children}
    </div>
  );
}
