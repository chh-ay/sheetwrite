import { describe, expect, it } from "bun:test";

import { renderMachineComparison } from "../src/lib/machine-compare.ts";
import { numbersTable, type StoryMachine, timeWithSpread } from "../src/lib/speedup-story.ts";

const icon = (name: string) => `<i data-icon="${name}"></i>`;

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

  it("shows one machine in four columns, the compared library by its own name", () => {
    expect(headers(numbersTable(machine, "Handsontable"))).toEqual([
      "Interaction",
      "Sheetwrite",
      "Handsontable",
      "Speedup",
    ]);
  });

  it("groups rows by kind and states each speedup once", () => {
    expect(bodyRows(numbersTable(machine, "Handsontable"))).toEqual([
      ["Scroll"],
      ["Down 50 px from the top", "1.23\u00a0ms (1.16–1.51)", "20.4\u00a0ms", "16.6× faster"],
      ["Paint"],
      ["Formatted cells", "2.00\u00a0ms (1.90–2.10)", "did not complete", ""],
    ]);
  });

  it("names the unit once when the median and its range share it", () => {
    expect(timeWithSpread(1.23, 1.16, 1.51)).toBe("1.23\u00a0ms <small>(1.16–1.51)</small>");
    expect(timeWithSpread(0.95, 0.09, 1.2)).toBe(
      "0.95\u00a0ms <small>(90\u00a0µs–1.20\u00a0ms)</small>",
    );
  });
});

describe("machine comparison table", () => {
  const html = renderMachineComparison(
    {
      id: "story-all",
      measure: "Times faster than Handsontable",
      parity: "as fast as Handsontable",
      rowHeader: "Interaction",
      machines: [
        { machine: "linux", name: "Linux", detail: "x86-64" },
        { machine: "mac", name: "Mac", detail: "arm64" },
      ],
      rows: [
        {
          label: "Scroll down · top left",
          results: {
            linux: { ratio: 16.6, text: "16.6× faster" },
            mac: { pending: "Handsontable did not complete" },
          },
        },
      ],
    },
    icon,
  );
  const table = html.match(/<table class="machines__data">.*?<\/table>/u)?.[0] ?? "";

  it("heads each machine's column with the machine's name", () => {
    expect(headers(table)).toEqual(["Interaction", "Linux", "Mac"]);
  });

  it("shows each result's own text without repeating the ratio", () => {
    expect(bodyRows(table)).toEqual([
      ["Scroll down · top left", "16.6× faster", "Handsontable did not complete"],
    ]);
  });
});
