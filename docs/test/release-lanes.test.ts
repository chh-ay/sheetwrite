import { describe, expect, it } from "bun:test";

import { parseReleaseLanes, renderReleaseLanes } from "../src/lib/release-lanes.ts";

describe("release performance lanes", () => {
  it("reads each result in the words the release note uses", () => {
    const figure = parseReleaseLanes(
      'diagram title="Formulas" base="0.6.1"',
      [
        "Lookups | Linux: 0.011 of the time | Mac: 0.008 of the time",
        "Append a row | Range: about 60× faster",
        "COUNTIF | Range: 11.5–18× faster",
        "Sort | Range: 0.329–0.509 of the work",
        "Redefine a name | Linux: 19 ms instead of 491 ms",
        "Field list open | Mac: 12.95 µs instead of 1.629 ms",
        "CSV import | Mac: 7.3% less time",
      ].join("\n"),
      "lanes",
    );
    const ratios = figure.rows.flatMap((row) =>
      row.results.map((result) => result.ratios.map((ratio) => Number(ratio.toFixed(2)))),
    );
    expect(ratios).toEqual([
      [90.91],
      [125],
      [60],
      [11.5, 18],
      [1.96, 3.04],
      [25.84],
      [125.79],
      [1.08],
    ]);
  });

  it("keeps the note's words beside the marks", () => {
    const html = renderReleaseLanes(
      parseReleaseLanes(
        'title="Charts" base="0.6.1"',
        "Edit | Mac: 0.006 ms instead of 20.2 ms",
        "c",
      ),
      () => "",
    );
    expect(html).toContain("<b>0.006 ms instead of 20.2 ms</b>");
    expect(html).toContain("Times faster than 0.6.1");
  });

  it("fails the build on a result it can't read", () => {
    expect(() => parseReleaseLanes('title="T" base="0.6.1"', "Edit | Mac: faster", "x")).toThrow(
      'perf-lanes: "faster" is not',
    );
    expect(() => parseReleaseLanes('title="T" base="0.6.1"', "Edit | PC: 2× faster", "x")).toThrow(
      "starts with Linux:, Mac: or Range:",
    );
  });
});
