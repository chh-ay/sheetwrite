import { describe, expect, it } from "bun:test";

import { numbersTable, type StoryMachine, timeWithSpread } from "../src/lib/speedup-story.ts";

/** Each header cell's text, in order. */
function headers(html: string): string[] {
  const head = html.match(/<thead>(.*?)<\/thead>/u)?.[1] ?? "";
  return [...head.matchAll(/<th scope="col">(.*?)<\/th>/gu)].map((match) => match[1] ?? "");
}

/** Each body row as its cells' text, tags removed. */
function bodyRows(html: string): string[][] {
  return [...html.matchAll(/<tr(?: class="[^"]*")?>(.*?)<\/tr>/gu)]
    .slice(1)
    .map((row) =>
      [...(row[1] ?? "").matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/gu)].map((cell) =>
        (cell[1] ?? "").replaceAll(/<[^>]+>/gu, ""),
      ),
    );
}

describe("speed story numbers table", () => {
  const machine: StoryMachine = {
    machine: "linux",
    name: "Linux",
    detail: "x86-64",
    note: "100,000 rows",
    interactions: [
      {
        id: "formatted-paint.top-left",
        label: "Formatted paint · top left",
        shortLabel: "Formatted cells",
        category: "Paint",
        measured: { value: 2, spread: [1.9, 2.1] },
      },
      {
        id: "scroll-down.top-left",
        label: "Scroll down · top left",
        shortLabel: "Down 50 px from the top",
        category: "Scroll",
        measured: { value: 1.23, spread: [1.16, 1.51] },
        base: 20.418,
      },
    ],
  };

  it("shows one machine in four columns, grouped by kind, each speedup and unit stated once", () => {
    const table = numbersTable(machine, "Handsontable");
    expect(headers(table)).toEqual(["Interaction", "Sheetwrite", "Handsontable", "Speedup"]);
    expect(bodyRows(table)).toEqual([
      ["Scroll"],
      ["Down 50 px from the top", "1.23\u00a0ms (1.16–1.51)", "20.4\u00a0ms", "16.6× faster"],
      ["Paint"],
      ["Formatted cells", "2.00\u00a0ms (1.90–2.10)", "did not complete", ""],
    ]);
    expect(timeWithSpread(0.95, 0.09, 1.2)).toBe(
      "0.95\u00a0ms <small>(90\u00a0µs–1.20\u00a0ms)</small>",
    );
  });
});
