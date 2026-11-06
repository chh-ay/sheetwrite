import { describe, expect, it } from "bun:test";

import type { ChartKind, ChartView } from "@sheetwrite/core";

import { renderChartSvg } from "../src/chart-svg.js";
import { thinToPixels } from "../src/thin.js";
import { tickScale } from "../src/ticks.js";
import { chartView, seriesView } from "./fixtures.js";

const SIZE = { width: 400, height: 300 };

function render(view: ChartView, size = SIZE): SVGSVGElement {
  return renderChartSvg(view, size);
}

function texts(svg: Element, selector: string): string[] {
  return [...svg.querySelectorAll(selector)].map((node) => node.textContent ?? "");
}

function numberAttribute(node: Element | null | undefined, name: string): number {
  const value = node?.getAttribute(name);
  if (value === null || value === undefined) throw new Error(`Missing attribute ${name}`);
  return Number(value);
}

/** Every coordinate pair of an `M x yL x y…` path. */
function pathPoints(d: string): Array<[number, number]> {
  return [...d.matchAll(/[ML](-?[\d.e-]+) (-?[\d.e-]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

describe("renderChartSvg", () => {
  const SALES = seriesView("Sales", [3, 5, 2], { categories: ["Jan", "Feb", "Mar"] });

  it.each<[ChartKind, string, number]>([
    ["column", ".sheetwrite-chart-bar", 3],
    ["bar", ".sheetwrite-chart-bar", 3],
    ["line", ".sheetwrite-chart-line", 1],
    ["area", ".sheetwrite-chart-area", 1],
    ["pie", ".sheetwrite-chart-slice", 3],
    ["doughnut", ".sheetwrite-chart-slice", 3],
    ["scatter", ".sheetwrite-chart-point", 3],
  ])("draws a %s chart with its marks", (kind, selector, count) => {
    const svg = render(chartView(kind, [SALES]));

    expect(svg.querySelectorAll(selector)).toHaveLength(count);
  });

  it("lays bars along the category axis for column charts and across it for bar charts", () => {
    const columns = [
      ...render(chartView("column", [SALES])).querySelectorAll(".sheetwrite-chart-bar"),
    ];
    const bars = [...render(chartView("bar", [SALES])).querySelectorAll(".sheetwrite-chart-bar")];

    // Column heights follow the values (3, 5, 2); bar widths do.
    const heights = columns.map((rect) => numberAttribute(rect, "height"));
    const widths = bars.map((rect) => numberAttribute(rect, "width"));
    expect(heights[1]).toBeGreaterThan(heights[0] ?? 0);
    expect(heights[0]).toBeGreaterThan(heights[2] ?? 0);
    expect(widths[1]).toBeGreaterThan(widths[0] ?? 0);
    expect(new Set(bars.map((rect) => rect.getAttribute("height"))).size).toBe(1);
  });

  it("names the chart by title and kind and describes each series", () => {
    const svg = render(
      chartView("line", [SALES, seriesView("Cost", [1, 2])], { title: "Revenue" }),
    );

    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("title")?.textContent).toBe("Revenue (Line chart)");
    expect(svg.querySelector("desc")?.textContent).toBe(
      "Series: Sales (3 points), Cost (2 points).",
    );
    expect(texts(svg, ".sheetwrite-chart-title")).toEqual(["Revenue"]);
  });

  it("draws axis titles and puts the legend where the definition says", () => {
    const svg = render(
      chartView("column", [SALES], { axes: { xTitle: "Month", yTitle: "Units" }, legend: "left" }),
    );

    expect(texts(svg, ".sheetwrite-chart-axis-title")).toEqual(["Month", "Units"]);
    expect(svg.querySelector(".sheetwrite-chart-legend")?.getAttribute("data-placement")).toBe(
      "left",
    );
    expect(texts(svg, ".sheetwrite-chart-legend-item text")).toEqual(["Sales"]);
    expect(
      render(chartView("column", [SALES], { legend: "none" })).querySelector(
        ".sheetwrite-chart-legend",
      ),
    ).toBeNull();
  });

  it("colors series from the eight chart variables, then starts again", () => {
    const series = Array.from({ length: 9 }, (_, index) => seriesView(`S${index}`, [1]));
    const groups = [
      ...render(chartView("column", series)).querySelectorAll(".sheetwrite-chart-series"),
    ];

    expect(groups[0]?.getAttribute("fill")).toBe("var(--sheetwrite-chart-1)");
    expect(groups[7]?.getAttribute("fill")).toBe("var(--sheetwrite-chart-8)");
    expect(groups[8]?.getAttribute("fill")).toBe("var(--sheetwrite-chart-1)");
  });

  it("labels value ticks with the source number format", () => {
    const svg = render(
      chartView("column", [
        seriesView("Revenue", [1200, 4800], { numberFormats: ["#,##0", "#,##0"] }),
      ]),
    );

    expect(texts(svg, ".sheetwrite-chart-value-axis text")).toEqual([
      "0",
      "1,000",
      "2,000",
      "3,000",
      "4,000",
      "5,000",
    ]);
  });

  // Excel's value axis is linked to the source format of the first series,
  // so a General first series keeps General ticks even when a later series
  // is a percentage.
  it("labels value ticks with the first series' format, also when it is General", () => {
    const svg = render(
      chartView("column", [
        seriesView("Sum of Amount", [180, 95]),
        seriesView("Share", [0.27, 0.15], { numberFormats: ["0%", "0%"] }),
      ]),
    );

    const ticks = texts(svg, ".sheetwrite-chart-value-axis text");
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.filter((tick) => tick.includes("%"))).toEqual([]);
    expect(ticks.at(-1)).toBe("200");
  });

  it("formats date categories with their format", () => {
    const svg = render(
      chartView("column", [
        seriesView("Sales", [1, 2], {
          categories: [45658, 45689],
          categoryFormats: ["yyyy-mm-dd", "yyyy-mm-dd"],
        }),
      ]),
    );

    expect(texts(svg, ".sheetwrite-chart-category-axis text")).toEqual([
      "2025-01-01",
      "2025-02-01",
    ]);
  });

  it("thins category labels that would overlap", () => {
    const count = 120;
    const categories = Array.from({ length: count }, (_, index) => `Week ${index + 1}`);
    const svg = render(
      chartView("column", [
        seriesView(
          "Sales",
          categories.map(() => 1),
          { categories },
        ),
      ]),
    );
    const labels = texts(svg, ".sheetwrite-chart-category-axis text");

    expect(labels[0]).toBe("Week 1");
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.length).toBeLessThan(count / 4);
  });

  describe("multi-level category labels", () => {
    const NULLS = [null, null, null, null];
    const REGIONS = seriesView("Sales", [3, 5, 2, 4], {
      categories: ["Retail", "Online", "Retail", "Online"],
      categoryLevels: [{ labels: ["East", null, "West", null], formats: NULLS }],
    });

    function levelLabels(svg: Element, level: number): Element[] {
      return [
        ...svg.querySelectorAll(`.sheetwrite-chart-category-axis text[data-level="${level}"]`),
      ];
    }

    function dividers(svg: Element): Element[] {
      return [...svg.querySelectorAll(".sheetwrite-chart-category-dividers line")];
    }

    it("draws the inner labels on the first row and each outer label once, centered on its group", () => {
      const svg = render(chartView("column", [REGIONS]));
      const inner = levelLabels(svg, 0);
      const outer = levelLabels(svg, 1);

      expect(inner.map((node) => node.textContent)).toEqual([
        "Retail",
        "Online",
        "Retail",
        "Online",
      ]);
      expect(outer.map((node) => node.textContent)).toEqual(["East", "West"]);
      const innerXs = inner.map((node) => numberAttribute(node, "x"));
      expect(numberAttribute(outer[0], "x")).toBeCloseTo(
        ((innerXs[0] ?? 0) + (innerXs[1] ?? 0)) / 2,
      );
      expect(numberAttribute(outer[1], "x")).toBeCloseTo(
        ((innerXs[2] ?? 0) + (innerXs[3] ?? 0)) / 2,
      );
      expect(numberAttribute(outer[0], "y")).toBeGreaterThan(numberAttribute(inner[0], "y"));
    });

    it("divides the categories, and the groups through every row of labels", () => {
      const lines = dividers(render(chartView("line", [REGIONS])));
      const lengths = lines.map(
        (line) => numberAttribute(line, "y2") - numberAttribute(line, "y1"),
      );

      // Boundaries 0 to 4; 0, 2 and 4 end or start a group.
      expect(lines).toHaveLength(5);
      expect(lengths[0]).toBeGreaterThan(lengths[1] ?? 0);
      expect(lengths[2]).toBe(lengths[0] ?? 0);
      expect(lengths[4]).toBe(lengths[0] ?? 0);
      expect(lengths[3]).toBe(lengths[1] ?? 0);
    });

    it("starts a group where an outer group starts, also under a blank label", () => {
      const svg = render(
        chartView("column", [
          seriesView("Sales", [1, 2, 3, 4], {
            categories: ["1", "2", "3", "4"],
            categoryLevels: [
              { labels: ["A", null, null, "B"], formats: NULLS },
              { labels: ["x", null, "y", null], formats: NULLS },
            ],
          }),
        ]),
      );
      const inner = levelLabels(svg, 0);
      const outermost = levelLabels(svg, 2);

      expect(levelLabels(svg, 1).map((node) => node.textContent)).toEqual(["x", "y"]);
      expect(outermost.map((node) => node.textContent)).toEqual(["A", "B"]);
      // B's group is the last category only, so its label sits over that category.
      expect(numberAttribute(outermost[1], "x")).toBeCloseTo(numberAttribute(inner[3], "x"));
      expect(dividers(svg)).toHaveLength(5);
    });

    it("turns crowded inner labels to read upward and keeps the outer labels level", () => {
      const count = 20;
      const categories = Array.from({ length: count }, (_, index) => `Category ${index + 1}`);
      const groups = categories.map((_, index) =>
        index % 10 === 0 ? `Group ${index / 10 + 1}` : null,
      );
      const svg = render(
        chartView("column", [
          seriesView(
            "Sales",
            categories.map(() => 1),
            { categories, categoryLevels: [{ labels: groups, formats: groups.map(() => null) }] },
          ),
        ]),
      );
      const inner = levelLabels(svg, 0);

      expect(inner.map((node) => node.textContent)).toEqual(categories);
      expect(inner.every((node) => node.getAttribute("transform")?.startsWith("rotate(-90"))).toBe(
        true,
      );
      expect(
        levelLabels(svg, 1).map((node) => [node.textContent, node.getAttribute("transform")]),
      ).toEqual([
        ["Group 1", null],
        ["Group 2", null],
      ]);
    });

    it("wraps an outer label onto more lines when its group is narrow", () => {
      const labels = ["North East", "South", null, null, null, null, null, null];
      const svg = render(
        chartView("column", [
          seriesView("Sales", [1, 1, 1, 1, 1, 1, 1, 1], {
            categories: ["a", "b", "c", "d", "e", "f", "g", "h"],
            categoryLevels: [{ labels, formats: labels.map(() => null) }],
          }),
        ]),
      );
      const [north, east, south] = levelLabels(svg, 1);

      expect([north, east, south].map((node) => node?.textContent)).toEqual([
        "North",
        "East",
        "South",
      ]);
      expect(numberAttribute(east, "x")).toBe(numberAttribute(north, "x"));
      expect(numberAttribute(east, "y")).toBeGreaterThan(numberAttribute(north, "y"));
    });

    it("draws the outer labels of a bar chart left of the inner labels, reading upward", () => {
      const svg = render(chartView("bar", [REGIONS]));
      const inner = levelLabels(svg, 0);
      const outer = levelLabels(svg, 1);

      expect(outer.map((node) => node.textContent)).toEqual(["East", "West"]);
      expect(outer.every((node) => node.getAttribute("transform")?.startsWith("rotate(-90"))).toBe(
        true,
      );
      expect(numberAttribute(outer[0], "x")).toBeLessThan(numberAttribute(inner[0], "x"));
      const innerYs = inner.map((node) => numberAttribute(node, "y"));
      expect(numberAttribute(outer[0], "y")).toBeCloseTo(
        ((innerYs[0] ?? 0) + (innerYs[1] ?? 0)) / 2,
      );
      expect(
        dividers(svg).every((line) => line.getAttribute("y1") === line.getAttribute("y2")),
      ).toBe(true);
    });

    it("draws one row of labels from the outside in when multi-level labels are off", () => {
      const svg = render(chartView("column", [REGIONS], { axes: { multiLevelLabels: false } }));

      expect(texts(svg, ".sheetwrite-chart-category-axis text")).toEqual([
        "East Retail",
        "Online",
        "West Retail",
        "Online",
      ]);
      expect(dividers(svg)).toEqual([]);
    });

    it("names pie slices from the outside in", () => {
      const svg = render(chartView("pie", [REGIONS]));

      expect(texts(svg, ".sheetwrite-chart-legend-item text")).toEqual([
        "East Retail",
        "Online",
        "West Retail",
        "Online",
      ]);
    });
  });

  it("leaves a gap for each null value", () => {
    const svg = render(chartView("line", [seriesView("Sales", [1, null, 3, 4, null])]));
    const lines = svg.querySelectorAll(".sheetwrite-chart-line");

    // The first point stands alone between gaps, so it is a marker, not a segment.
    expect(lines).toHaveLength(1);
    expect(pathPoints(lines[0]?.getAttribute("d") ?? "")).toHaveLength(2);
    expect(svg.querySelectorAll(".sheetwrite-chart-point")).toHaveLength(1);
    expect(
      render(chartView("column", [seriesView("Sales", [1, null, 3])])).querySelectorAll(
        ".sheetwrite-chart-bar",
      ),
    ).toHaveLength(2);
  });

  it("draws negative values below the zero baseline", () => {
    const svg = render(chartView("column", [seriesView("Profit", [5, -5])]));
    const baseline = numberAttribute(svg.querySelector(".sheetwrite-chart-baseline"), "y1");
    const [positive, negative] = [...svg.querySelectorAll(".sheetwrite-chart-bar")];

    expect(numberAttribute(positive, "y") + numberAttribute(positive, "height")).toBeCloseTo(
      baseline,
    );
    expect(numberAttribute(negative, "y")).toBeCloseTo(baseline);
    expect(numberAttribute(negative, "height")).toBeGreaterThan(0);
    expect(Number(texts(svg, ".sheetwrite-chart-value-axis text")[0])).toBeLessThanOrEqual(-5);
  });

  it.each([
    [{ truncated: true }, "Not all points are shown"],
    [{ referenceError: true }, "#REF!"],
  ])("shows a note when the view flags %o", (flags, note) => {
    const svg = render(chartView("column", [seriesView("Sales", [1, 2], flags)]));

    expect(texts(svg, ".sheetwrite-chart-note").join(" ")).toContain(note);
    expect(
      render(chartView("column", [seriesView("Sales", [1, 2])])).querySelector(
        ".sheetwrite-chart-note",
      ),
    ).toBeNull();
  });

  it("draws only the first series of a pie and labels each slice", () => {
    const svg = render(
      chartView("pie", [
        seriesView("Share", [1, 1, 2], { categories: ["North", "South", "West"] }),
        seriesView("Ignored", [9, 9, 9]),
      ]),
    );

    expect(svg.querySelectorAll(".sheetwrite-chart-slice")).toHaveLength(3);
    expect(texts(svg, ".sheetwrite-chart-slice-labels text")).toEqual(["25%", "25%", "50%"]);
    expect(texts(svg, ".sheetwrite-chart-legend-item text")).toEqual(["North", "South", "West"]);
  });

  it("names pie slices in their labels when there is no legend", () => {
    const svg = render(
      chartView("doughnut", [seriesView("Share", [3, 1], { categories: ["North", "South"] })], {
        legend: "none",
      }),
    );

    expect(texts(svg, ".sheetwrite-chart-slice-labels text")).toEqual(["North 75%", "South 25%"]);
  });

  it("places scatter points at their numeric x categories", () => {
    const svg = render(
      chartView("scatter", [seriesView("Growth", [1, 2, 3], { categories: [0, 10, 100] })]),
    );
    const xs = [...svg.querySelectorAll(".sheetwrite-chart-point")].map((point) =>
      numberAttribute(point, "cx"),
    );

    const [first = 0, second = 0, third = 0] = xs;
    expect((third - second) / (second - first)).toBeCloseTo(9);
  });

  it("draws a dense line with at most two points per pixel and keeps its extremes", () => {
    const count = 10_000;
    const values = Array.from({ length: count }, (_, index) => Math.sin(index / 50));
    values[4_321] = 100;
    values[7_654] = -100;
    const svg = render(chartView("line", [seriesView("Signal", values)]));
    const points = pathPoints(svg.querySelector(".sheetwrite-chart-line")?.getAttribute("d") ?? "");
    const ys = points.map(([, y]) => y);
    const plotWidth = SIZE.width;

    expect(points.length).toBeLessThanOrEqual(plotWidth * 2);
    // The spike is the top of the plot and the dip is the bottom, so both extremes survived.
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    expect(ys.filter((y) => y === top)).toHaveLength(1);
    expect(ys.filter((y) => y === bottom)).toHaveLength(1);
    expect(bottom - top).toBeGreaterThan(SIZE.height / 2);
  });
});

describe("thinToPixels", () => {
  it("keeps the minimum and maximum of every pixel", () => {
    const values = [5, 9, 1, 4, 7, 3, 8, 2];
    // Two pixels: indices 0-3 in pixel 0, 4-7 in pixel 1.
    const pixels = values.map((_, index) => Math.floor(index / 4) + 0.5);

    expect(thinToPixels(pixels, values)).toEqual([1, 2, 6, 7]);
  });

  it("keeps a gap marker so a thinned line still breaks", () => {
    const values = [1, 2, null, null, 3, 4];
    const pixels = values.map(() => 0);

    expect(thinToPixels(pixels, values)).toEqual([0, 2, 5]);
  });

  it("thins unsorted scatter x values by pixel", () => {
    const pixels = [3.2, 0.1, 3.9, 0.7];
    const values = [1, 5, 2, 6];

    expect(thinToPixels(pixels, values)).toEqual([0, 1, 2, 3]);
    expect(thinToPixels([0.1, 0.2, 0.3], [4, 9, 6])).toEqual([0, 1]);
  });
});

describe("tick steps", () => {
  it.each([
    [10, 5, 2],
    [12.5, 5, 2.5],
    [23, 5, 5],
    [0.7, 7, 0.1],
    [1000, 4, 250],
    [7, 1, 10],
  ])("rounds a span of %d in %d ticks to a step of %d", (span, ticks, step) => {
    expect(tickScale(0, span, ticks, false).step).toBe(step);
  });

  it("covers the data with exact decimal ticks", () => {
    expect(tickScale(0.1, 0.3, 4, false).ticks).toEqual([0.1, 0.15, 0.2, 0.25, 0.3]);
  });

  it("keeps distinct ticks for very small values", () => {
    expect(tickScale(1e-10, 5e-10, 4, false).ticks).toEqual([1e-10, 2e-10, 3e-10, 4e-10, 5e-10]);
  });

  it("adds no tick past data that ends on a tick", () => {
    // In floating point, 0.7 / 0.1 is 6.999999999999999 and 0.07 / 0.01 is 7.000000000000001.
    expect(tickScale(0.7, 1, 4, false).min).toBe(0.7);
    expect(tickScale(0.03, 0.07, 5, false).max).toBe(0.07);
  });

  it("starts at zero unless the data is far from zero", () => {
    expect(tickScale(20, 100, 5, true).min).toBe(0);
    expect(tickScale(95, 100, 5, true).min).toBeGreaterThan(0);
    expect(tickScale(-100, -20, 5, true).max).toBe(0);
  });
});
