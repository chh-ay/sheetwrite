import { describe, expect, it } from "bun:test";

import { type PerfFigure, type PerfRow, perfVerdict } from "../src/lib/perf-bars.ts";
import { parsePerfCompare } from "../src/lib/perf-compare.ts";

// The release and performance pages render these figures from real captures in
// scripts/docs.test.ts and scripts/release-performance-docs.test.ts.

describe("performance bar verdicts", () => {
  it("never turns a run that did not complete into a verdict", () => {
    const figure: PerfFigure = {
      id: "test",
      title: "Median time",
      unit: "ms",
      scale: "log",
      rowHeader: "Operation",
      groups: [],
    };
    const row: PerfRow = {
      label: "Scroll",
      bars: [
        { label: "Handsontable", role: "base", missing: "Did not complete" },
        { label: "Sheetwrite", role: "measured", stat: { value: 1 } },
      ],
    };
    expect(perfVerdict(row, figure)).toEqual({
      kind: "missing",
      text: "Handsontable: Did not complete",
    });
  });
});

describe("release-note comparisons", () => {
  it("reads each line as one operation, in milliseconds or bytes", () => {
    const figure = parsePerfCompare(
      [
        '<perf-compare title="Median time" base="0.4.0" measured="0.5.0" machine="linux">',
        "Insert rows | 34.7 s | 5 ms",
        "Create a spill | 10.6 ms | 11.2–13.5 ms",
        "</perf-compare>",
      ].join("\n"),
      "notes",
    );
    expect(figure.unit).toBe("ms");
    expect(figure.groups[0]?.machine).toBe("linux");
    expect(figure.groups[0]?.rows.map((row) => row.bars.map((bar) => bar.stat))).toEqual([
      [{ value: 34_700 }, { value: 5 }],
      [{ value: 10.6 }, { value: 11.2, spread: [11.2, 13.5] }],
    ]);
  });

  it("rejects a figure that mixes times and sizes, and a value without a unit", () => {
    const block = (line: string) =>
      `<perf-compare title="T" base="a" measured="b" machine="mac">\n${line}\n</perf-compare>`;
    expect(() => parsePerfCompare(block("Import | 1 s | 300 MiB"), "x")).toThrow(
      /mixes times and sizes/,
    );
    expect(() => parsePerfCompare(block("Import | 1 | 2"), "x")).toThrow(/is not a value/);
  });
});
