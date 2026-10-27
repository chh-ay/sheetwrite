const button = document.querySelector<HTMLButtonElement>("#load-charts");
if (!button) throw new Error("missing charts loader button");
button.addEventListener("click", async () => {
  // Dynamic import intentionally makes the bundler emit charts as a lazy chunk.
  const charts = await import("@sheetwrite/charts");
  button.dataset.ready = String(typeof charts.createChartViewCache === "function");
});
