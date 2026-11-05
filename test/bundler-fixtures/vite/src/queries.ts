const button = document.querySelector<HTMLButtonElement>("#load-queries");
if (!button) throw new Error("Missing query loader button");

button.dataset.ready = "false";
button.addEventListener("click", async () => {
  const { loadQueryEngine } = await import("@sheetwrite/queries");
  const engine = await loadQueryEngine();
  const source = engine.parse(new TextEncoder().encode("Value\n1\n2\n"), {
    format: "csv",
    columns: [{ id: "value", name: "Value", type: "number" }],
  });
  const output = engine.execute(source, [
    {
      kind: "group",
      keys: [],
      aggregates: [{ id: "total", name: "Total", op: "sum", column: "value" }],
    },
  ]);
  const summary = output.columns[0];
  if (summary === undefined || summary.type !== "number") {
    throw new Error("Query fixture returned no numeric total");
  }

  const total = summary.values[0];
  if (total === undefined) throw new Error("Query fixture returned no aggregate row");

  button.dataset.rows = String(output.rowCount);
  button.dataset.result = String(total);
  button.dataset.ready = "true";
});
