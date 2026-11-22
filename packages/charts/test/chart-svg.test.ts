import { describe, expect, it } from "bun:test";

import type { ChartKind, ChartView } from "@sheetwrite/core";

import { renderChartSvg } from "../src/chart-svg.js";
import { thinToPixels } from "../src/thin.js";
import { chartView, seriesView } from "./fixtures.js";

const SIZE = { width: 400, height: 300 };
const render = (view: ChartView) => renderChartSvg(view, SIZE);

function texts(svg: Element, selector: string): string[] {
  return [...svg.querySelectorAll(selector)].map((node) => node.textContent ?? "");
}

function number_attribute(node: Element | null | undefined, name: string): number {
  const value = node?.getAttribute(name);
  if (value === null || value === undefined) throw new Error(`Missing attribute ${name}`);
  return Number(value);
}

/** Every coordinate pair of an `M x yL x y…` path. */
function path_points(d: string | null | undefined): Array<[number, number]> {
  return [...(d ?? "").matchAll(/[ML](-?[\d.e-]+) (-?[\d.e-]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ]);
}

describe("renderChartSvg", () => {
  const SALES = seriesView("Sales", [3, 5, 2], { categories: ["Jan", "Feb", "Mar"] });

  it.each<[ChartKind, string, number]>([
    ["area", ".sheetwrite-chart-area", 1],
    ["doughnut", ".sheetwrite-chart-slice", 3],
  ])("draws a %s chart with its marks", (kind, selector, count) => {
    expect(render(chartView(kind, [SALES])).querySelectorAll(selector)).toHaveLength(count);
  });

  it("lays bars along the category axis for column charts and across it for bar charts", () => {
    const sizes = (kind: ChartKind, name: string) =>
      [...render(chartView(kind, [SALES])).querySelectorAll(".sheetwrite-chart-bar")].map((rect) =>
        number_attribute(rect, name),
      );
    const [jan = 0, feb = 0, mar = 0] = sizes("column", "height");
    const [jan_width = 0, feb_width = 0] = sizes("bar", "width");

    expect(feb > jan && jan > mar).toBe(true);
    expect(feb_width).toBeGreaterThan(jan_width);
    expect(new Set(sizes("bar", "height")).size).toBe(1);
  });

  it("draws each series of a column chart with more categories than pixels as one path of its bars", () => {
    const values = Array.from({ length: 1_000 }, (_, index) => (index % 7) + 1);
    const gaps = values.map((value, index) => (index % 2 === 0 ? value : null));
    const svg = render(
      chartView("column", [seriesView("Dense", values), seriesView("Gaps", gaps)]),
    );

    expect(svg.querySelectorAll(".sheetwrite-chart-bar")).toHaveLength(0);
    const [dense, sparse] = [...svg.querySelectorAll(".sheetwrite-chart-bars")].map((path) => [
      ...(path.getAttribute("d") ?? "").matchAll(
        /M(-?[\d.e-]+) (-?[\d.e-]+)h(-?[\d.e-]+)v(-?[\d.e-]+)h(-?[\d.e-]+)Z/g,
      ),
    ]);
    // One closed rectangle per value; a gap draws nothing.
    expect(dense).toHaveLength(1_000);
    expect(sparse).toHaveLength(500);
    // Bars stand on one baseline, as tall as their values, side by side in value order.
    const height = (index: number) => Number(dense?.[index]?.[4]);
    const bottom = (index: number) => Number(dense?.[index]?.[2]) + height(index);
    expect(height(6) / height(0)).toBeCloseTo(7);
    expect(bottom(6)).toBeCloseTo(bottom(0));
    expect(Number(dense?.[1]?.[1])).toBeGreaterThan(Number(dense?.[0]?.[1]));
  });

  it("names the chart, describes its series, and draws axis titles and the legend", () => {
    const axes = { xTitle: "Month", yTitle: "Units" };
    const series = [SALES, seriesView("Cost", [1, 2])];
    const svg = render(chartView("line", series, { title: "Revenue", axes, legend: "left" }));

    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelector("title")?.textContent).toBe("Revenue (Line chart)");
    expect(svg.querySelector("desc")?.textContent).toBe(
      "Series: Sales (3 points), Cost (2 points).",
    );
    expect(texts(svg, ".sheetwrite-chart-title")).toEqual(["Revenue"]);
    expect(texts(svg, ".sheetwrite-chart-axis-title")).toEqual(["Month", "Units"]);
    const legend = svg.querySelector(".sheetwrite-chart-legend");
    expect(legend?.getAttribute("data-placement")).toBe("left");
    expect(texts(svg, ".sheetwrite-chart-legend-item text")).toEqual(["Sales", "Cost"]);
  });

  // Excel's value axis is linked to the source format of the first series,
  // so a General first series keeps General ticks even when a later series
  // is a percentage.
  it("labels value ticks with the first series' format, also when it is General", () => {
    const share = seriesView("Share", [0.27, 0.15], { numberFormats: ["0%", "0%"] });
    const svg = render(chartView("column", [seriesView("Sum of Amount", [180, 95]), share]));
    const ticks = texts(svg, ".sheetwrite-chart-value-axis text");

    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.filter((tick) => tick.includes("%"))).toEqual([]);
    expect(ticks.at(-1)).toBe("200");
  });

  describe("multi-level category labels", () => {
    const level_labels = (svg: Element, level: number): Element[] => [
      ...svg.querySelectorAll(`.sheetwrite-chart-category-axis text[data-level="${level}"]`),
    ];
    const contents = (nodes: Element[]) => nodes.map((node) => node.textContent);
    const is_upward = (node: Element) => node.getAttribute("transform")?.startsWith("rotate(-90");

    it("draws the outer labels of a bar chart left of the inner labels, reading upward", () => {
      const regions = seriesView("Sales", [3, 5, 2, 4], {
        categories: ["Retail", "Online", "Retail", "Online"],
        categoryLevels: [
          { labels: ["East", null, "West", null], formats: [null, null, null, null] },
        ],
      });
      const svg = render(chartView("bar", [regions]));
      const inner = level_labels(svg, 0);
      const outer = level_labels(svg, 1);
      const inner_middle = (number_attribute(inner[0], "y") + number_attribute(inner[1], "y")) / 2;
      const dividers = [...svg.querySelectorAll(".sheetwrite-chart-category-dividers line")];

      expect(contents(outer)).toEqual(["East", "West"]);
      expect(outer.every(is_upward)).toBe(true);
      expect(number_attribute(outer[0], "x")).toBeLessThan(number_attribute(inner[0], "x"));
      expect(number_attribute(outer[0], "y")).toBeCloseTo(inner_middle);
      expect(dividers.every((line) => line.getAttribute("y1") === line.getAttribute("y2"))).toBe(
        true,
      );
    });

    it("turns crowded inner labels to read upward and keeps the outer labels level", () => {
      const categories = Array.from({ length: 20 }, (_, index) => `Category ${index + 1}`);
      const groups = categories.map((_, index) =>
        index % 10 === 0 ? `Group ${index / 10 + 1}` : null,
      );
      const series = seriesView(
        "Sales",
        categories.map(() => 1),
        { categories, categoryLevels: [{ labels: groups, formats: groups.map(() => null) }] },
      );
      const svg = render(chartView("column", [series]));
      const inner = level_labels(svg, 0);
      const outer = level_labels(svg, 1);

      expect(contents(inner)).toEqual(categories);
      expect(inner.every(is_upward)).toBe(true);
      expect(contents(outer)).toEqual(["Group 1", "Group 2"]);
      expect(outer.some(is_upward)).toBe(false);
    });

    it("wraps an outer label onto more lines when its group is narrow", () => {
      const labels = ["North East", "South", null, null, null, null, null, null];
      const series = seriesView("Sales", [1, 1, 1, 1, 1, 1, 1, 1], {
        categories: ["a", "b", "c", "d", "e", "f", "g", "h"],
        categoryLevels: [{ labels, formats: labels.map(() => null) }],
      });
      const outer = level_labels(render(chartView("column", [series])), 1);
      const [north, east] = outer;

      expect(contents(outer)).toEqual(["North", "East", "South"]);
      expect(number_attribute(east, "x")).toBe(number_attribute(north, "x"));
      expect(number_attribute(east, "y")).toBeGreaterThan(number_attribute(north, "y"));
    });
  });

  // #700: the value axis of a wide bar chart drew labels into each other.
  describe("value-axis labels", () => {
    /** The renderer's font size, and its estimate of a glyph's width as a share of it. */
    const FONT_SIZE = 11;
    const GLYPH_WIDTH_RATIO = 0.6;
    /**
     * A browser's text box is taller than the font size: it runs about this
     * share of it above and below a centered label, and below the baseline of
     * other labels. The boxes here use these generous heights so labels that
     * merely touch count as overlapping.
     */
    const CENTERED_HALF_HEIGHT = 0.6;
    const DESCENT = 0.25;
    /** Every 40 px from 200 to 2,600: tick rounding packs labels tightest at some widths only. */
    const LENGTHS = Array.from({ length: 61 }, (_, index) => 200 + index * 40);
    const MONEY = ["$#,##0", "$#,##0", "$#,##0"];
    const REVENUE = seriesView("Revenue", [1_234_567, 2_345_678, 987_654], {
      categories: ["Americas", "APAC", "EMEA"],
      numberFormats: MONEY,
    });
    const SPEND = seriesView("Revenue", [3, 5, 2], {
      categories: [1_250_000, 2_500_000, 4_750_000],
      categoryFormats: MONEY,
    });

    interface LabelBox {
      text: string;
      left: number;
      right: number;
      top: number;
      bottom: number;
    }

    /** The box of an unrotated label from its anchor, baseline and estimated width. */
    function label_box(node: Element): LabelBox {
      const text = node.textContent ?? "";
      const width = text.length * FONT_SIZE * GLYPH_WIDTH_RATIO;
      const x = number_attribute(node, "x");
      const y = number_attribute(node, "y");
      const anchor = node.getAttribute("text-anchor");
      const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
      const centered = node.getAttribute("dominant-baseline") === "central";
      return {
        text,
        left,
        right: left + width,
        top: centered ? y - FONT_SIZE * CENTERED_HALF_HEIGHT : y - FONT_SIZE,
        bottom: centered ? y + FONT_SIZE * CENTERED_HALF_HEIGHT : y + FONT_SIZE * DESCENT,
      };
    }

    function horizontal_spans(svg: Element, selector: string): Array<[number, number]> {
      return [...svg.querySelectorAll(selector)]
        .map(label_box)
        .map((box): [number, number] => [box.left, box.right]);
    }

    function vertical_spans(svg: Element, selector: string): Array<[number, number]> {
      return [...svg.querySelectorAll(selector)]
        .map(label_box)
        .map((box): [number, number] => [box.top, box.bottom])
        .sort(([top], [other_top]) => top - other_top);
    }

    function expect_apart(spans: Array<[number, number]>, end: number): void {
      expect(spans.length).toBeGreaterThan(0);
      spans.slice(1).forEach(([start], index) => {
        expect(start).toBeGreaterThanOrEqual(spans[index]?.[1] ?? Number.POSITIVE_INFINITY);
      });
      expect(spans[0]?.[0]).toBeGreaterThanOrEqual(0);
      expect(spans.at(-1)?.[1]).toBeLessThanOrEqual(end);
    }

    it.each<[ChartKind, ChartView, string]>([
      ["bar", chartView("bar", [REVENUE]), ".sheetwrite-chart-value-axis text"],
      ["scatter", chartView("scatter", [SPEND]), ".sheetwrite-chart-category-axis text"],
    ])("keeps the %s chart's horizontal value labels apart at every width", (_, view, selector) => {
      const counts = LENGTHS.map((width) => {
        const spans = horizontal_spans(renderChartSvg(view, { width, height: 300 }), selector);
        expect_apart(spans, width);
        return spans.length;
      });

      // Wider charts still get more labels, not just the two ends.
      expect(counts.at(-1)).toBeGreaterThan(counts[0] ?? 0);
      expect(counts.at(-1)).toBeGreaterThan(2);
    });

    it("keeps the column chart's vertical value labels apart at every height", () => {
      for (const height of LENGTHS) {
        const svg = renderChartSvg(chartView("column", [REVENUE]), { width: 400, height });
        expect_apart(vertical_spans(svg, ".sheetwrite-chart-value-axis text"), height);
      }
    });

    /** A year of monthly revenue: category labels wider than their bands on narrow charts. */
    const MONTHLY = seriesView(
      "Revenue",
      [532, 508, 579, 557, 518, 494, 545, 573, 629, 691, 764, 838].map((value) => value * 1_000),
      {
        categories: Array.from(
          { length: 12 },
          (_, month) => `2026-${String(month + 1).padStart(2, "0")}`,
        ),
        numberFormats: Array.from({ length: 12 }, () => "$#,##0"),
      },
    );

    // Where the axes meet, a scatter chart's lowest y label sits beside its
    // first x label, and a column chart's $0 beside its first category.
    it.each<[ChartKind, ChartView]>([
      ["scatter", chartView("scatter", [SPEND])],
      ["column", chartView("column", [MONTHLY])],
    ])("keeps the %s chart's labels apart where the axes meet, at every width", (_, view) => {
      for (const width of LENGTHS) {
        const svg = renderChartSvg(view, { width, height: 300 });
        const boxes = [
          ...svg.querySelectorAll(
            ".sheetwrite-chart-value-axis text, .sheetwrite-chart-category-axis text",
          ),
        ].map(label_box);
        const touching = boxes.flatMap((box, index) =>
          boxes
            .slice(index + 1)
            .filter(
              (other) =>
                box.left < other.right &&
                other.left < box.right &&
                box.top < other.bottom &&
                other.top < box.bottom,
            )
            .map((other) => `${box.text} / ${other.text} at ${width} px`),
        );

        expect(touching).toEqual([]);
        expect(boxes.every((box) => box.left >= 0 && box.right <= width)).toBe(true);
      }
    });
  });

  it("leaves a gap for each null value and notes a truncated series", () => {
    const sales = seriesView("Sales", [1, null, 3, 4, null], { truncated: true });
    const svg = render(chartView("line", [sales]));
    const lines = svg.querySelectorAll(".sheetwrite-chart-line");
    const columns = render(chartView("column", [seriesView("Sales", [1, null, 3])]));

    // The first point stands alone between gaps, so it is a marker, not a segment.
    expect(lines).toHaveLength(1);
    expect(path_points(lines[0]?.getAttribute("d"))).toHaveLength(2);
    expect(svg.querySelectorAll(".sheetwrite-chart-point")).toHaveLength(1);
    expect(columns.querySelectorAll(".sheetwrite-chart-bar")).toHaveLength(2);
    expect(texts(svg, ".sheetwrite-chart-note").join(" ")).toContain("Not all points are shown");
  });

  it("places scatter points at their numeric x categories", () => {
    const growth = seriesView("Growth", [1, 2, 3], { categories: [0, 10, 100] });
    const points = render(chartView("scatter", [growth])).querySelectorAll(
      ".sheetwrite-chart-point",
    );
    const [first = 0, second = 0, third = 0] = [...points].map((point) =>
      number_attribute(point, "cx"),
    );

    expect((third - second) / (second - first)).toBeCloseTo(9);
  });

  it("draws a dense line with at most two points per pixel and keeps its extremes", () => {
    const values = Array.from({ length: 10_000 }, (_, index) => Math.sin(index / 50));
    values[4_321] = 100;
    values[7_654] = -100;
    const svg = render(chartView("line", [seriesView("Signal", values)]));
    const ys = path_points(svg.querySelector(".sheetwrite-chart-line")?.getAttribute("d")).map(
      ([, y]) => y,
    );
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);

    expect(ys.length).toBeLessThanOrEqual(SIZE.width * 2);
    // The spike is the top of the plot and the dip is the bottom, so both extremes survived.
    expect(ys.filter((y) => y === top || y === bottom)).toHaveLength(2);
    expect(bottom - top).toBeGreaterThan(SIZE.height / 2);
  });
});

it("keeps a gap marker so a line thinned to pixels still breaks", () => {
  expect(thinToPixels([0, 0, 0, 0, 0, 0], [1, 2, null, null, 3, 4])).toEqual([0, 2, 5]);
});
