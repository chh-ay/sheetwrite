import { describe, expect, it } from "bun:test";

import { scalePosition } from "../src/components/figures/scale.ts";
import { laneHtml } from "../src/components/figures/static.ts";
import {
  type PerfFigure,
  type PerfRow,
  perfVerdict,
  renderPerfBars,
} from "../src/lib/perf-bars.ts";
import { parsePerfCompare } from "../src/lib/perf-compare.ts";
import { renderReleaseChange } from "../src/lib/release-change.ts";
import { renderSpeedupStory } from "../src/lib/speedup-story.ts";

const TIME_FIGURE: PerfFigure = {
  id: "test",
  title: "Median time",
  unit: "ms",
  scale: "log",
  rowHeader: "Operation",
  groups: [],
};

function comparison(
  base: number,
  measured: number,
  spreads?: [[number, number], [number, number]],
): PerfRow {
  return {
    label: "Sort",
    bars: [
      {
        label: "0.5.4",
        role: "base",
        stat: { value: base, ...(spreads ? { spread: spreads[0] } : {}) },
      },
      {
        label: "0.6.0",
        role: "measured",
        stat: { value: measured, ...(spreads ? { spread: spreads[1] } : {}) },
      },
    ],
  };
}

describe("performance bar verdicts", () => {
  it("names how many times faster or slower the measured bar is, with the signed change", () => {
    expect(perfVerdict(comparison(20, 5), TIME_FIGURE)).toEqual({
      kind: "better",
      text: "4.0× faster",
      change: "−75%",
    });
    expect(perfVerdict(comparison(2, 3), TIME_FIGURE)).toEqual({
      kind: "worse",
      text: "1.5× slower",
      change: "+50%",
    });
  });

  it("reads within noise when the two spread bands overlap", () => {
    const row = comparison(10, 9, [
      [9.5, 11],
      [8.5, 9.6],
    ]);
    expect(perfVerdict(row, TIME_FIGURE)).toEqual({
      kind: "noise",
      text: "Within noise",
      change: "−10%",
    });
  });

  it("never turns a run that did not complete into a verdict", () => {
    const row: PerfRow = {
      label: "Scroll",
      bars: [
        { label: "Handsontable", role: "base", missing: "Did not complete" },
        { label: "Sheetwrite", role: "measured", stat: { value: 1 } },
      ],
    };
    expect(perfVerdict(row, TIME_FIGURE)).toEqual({
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

const changeWorkload = (id: string, base: number, measured: number) => ({
  id,
  label: id,
  base: { value: base, spread: [base * 0.95, base * 1.05] as const },
  measured: { value: measured, spread: [measured * 0.95, measured * 1.05] as const },
});

describe("engine change", () => {
  const html = renderReleaseChange(
    {
      id: "change",
      baseName: "0.6.0",
      measuredName: "0.7.0 engine",
      machines: [
        {
          machine: "linux",
          name: "Linux",
          detail: "x86-64",
          note: "",
          workloads: [
            changeWorkload("faster", 10, 5),
            changeWorkload("same", 10, 10.2),
            changeWorkload("slower", 10, 20),
          ],
        },
        { machine: "mac", name: "Mac", detail: "Apple Silicon", pending: "Pending: not captured." },
      ],
    },
    () => "",
  );
  const linux = html.slice(
    html.indexOf('data-machine="linux"'),
    html.indexOf('data-machine="mac"'),
  );

  it("draws only workloads whose run ranges do not overlap, and counts the rest as noise", () => {
    const drawn = [
      ...linux.matchAll(
        /class="change__row" data-verdict="(\w+)"><span class="change__label">(\w+)/gu,
      ),
    ];
    expect(drawn.map((match) => [match[2], match[1]])).toEqual([
      ["faster", "better"],
      ["slower", "worse"],
    ]);
    expect(linux).toContain("1 workload within noise");
    expect(linux).toContain("Median <b>2.0× faster</b>");
    expect(linux).toContain("Median <b>2.0× slower</b>");
  });

  it("shows every machine side by side, a pending machine with no mark", () => {
    const all = html.slice(html.indexOf('class="change__panel" data-machine="all"'));
    expect(all).toContain("Pending: not captured.");
    // One mark per measured workload: three on Linux, none on the pending Mac.
    expect([...all.matchAll(/<g data-tone="(\w+)"/gu)].map(([, tone]) => tone)).toEqual([
      "accent",
      "accent",
      "accent",
    ]);
    expect(all).toContain('<th scope="col">Mac: times faster than 0.6.0</th>');
  });
});

describe("speed story", () => {
  const html = renderSpeedupStory(
    {
      id: "story",
      baseName: "Handsontable",
      machines: [
        {
          machine: "linux",
          name: "Linux",
          detail: "x86-64",
          note: "captured",
          interactions: [
            {
              id: "scroll",
              label: "Scroll down",
              category: "Scroll",
              measured: { value: 0.5, spread: [0.4, 0.6] },
              base: 8.3,
            },
          ],
        },
        {
          machine: "mac",
          name: "Mac",
          detail: "Apple Silicon",
          note: "captured",
          interactions: [
            {
              id: "scroll",
              label: "Scroll down",
              category: "Scroll",
              measured: { value: 1, spread: [0.9, 1.1] },
            },
          ],
        },
      ],
    },
    () => "",
  );

  it("offers Linux, Mac and All, with the first machine checked", () => {
    expect(
      [...html.matchAll(/<input type="radio"[^>]*value="(\w+)"([^>]*)>/gu)].map(
        ([, value, rest]) => [value, (rest ?? "").includes("checked")],
      ),
    ).toEqual([
      ["linux", true],
      ["mac", false],
      ["all", false],
    ]);
  });

  it("gives each interaction a focusable row with every value, and a ratio chip", () => {
    expect(html).toContain(
      '<button aria-controls="story-linux-scroll-values" aria-describedby="story-linux-scroll-values" aria-expanded="false" class="fig-range-row__name" type="button">',
    );
    expect(html).toContain("<dt>Lowest–highest round</dt><dd>0.40\u00a0ms – 0.60\u00a0ms</dd>");
    expect(html).toContain("16.6× faster</span>");
  });

  it("lists a library that did not complete in words, not as a mark", () => {
    const mac = html.slice(html.indexOf('data-machine="mac" aria-label="Mac results"'));
    expect(mac).toContain("Handsontable median</dt><dd>did not complete");
  });
});

describe("figure kit", () => {
  it("places values on a log scale and clamps them to the lane", () => {
    const scale = { kind: "log", domain: [1, 1000] } as const;
    expect(scalePosition(scale, 10)).toBeCloseTo(33.33, 2);
    expect(scalePosition(scale, 0.5)).toBe(0);
    expect(scalePosition(scale, 5000)).toBe(100);
  });

  it("describes every series in the lane's SVG, and draws no mark for a pending one", () => {
    const html = laneHtml({
      label: "Countif",
      scale: { kind: "log", domain: [1, 16] },
      origin: 1,
      series: [
        {
          key: "a",
          label: "Linux",
          value: 4,
          valueText: "4.0× faster",
          shape: "circle",
          tone: "accent",
        },
        {
          key: "b",
          label: "Mac",
          value: null,
          valueText: "pending",
          shape: "diamond",
          tone: "violet",
        },
      ],
    });
    expect(html).toContain("<title>Countif</title><desc>Linux: 4.0× faster; Mac: pending</desc>");
    expect(html).not.toContain('data-tone="violet"');
  });
});

describe("machine switch", () => {
  it("starts with the first machine checked and names the figure it switches", () => {
    const group = (machine: "linux" | "mac") => ({
      label: machine === "linux" ? "Linux · x86-64" : "Mac · Apple Silicon",
      machine,
      rows: [
        { label: "Sort", bars: [{ label: "", role: "measured" as const, stat: { value: 1 } }] },
      ],
    });
    const html = renderPerfBars(
      {
        ...TIME_FIGURE,
        title: "Median recalculation time",
        groups: [group("linux"), group("mac")],
      },
      () => "",
    );
    expect(html).toContain('aria-label="Machine for median recalculation time"');
    expect(
      [...html.matchAll(/<input type="radio"[^>]*>/gu)].map(([input]) =>
        input.includes(" checked"),
      ),
    ).toEqual([true, false, false]);
  });
});
