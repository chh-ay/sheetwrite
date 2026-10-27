import { describe, expect, it } from "bun:test";

import { formatNumber } from "@sheetwrite/core";

import { columnLetters, formatTokens, renderGridResults } from "../src/lib/grid-result.js";

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const text = (value: string): Node => ({ type: "text", value });
const cell = (tagName: string, ...children: Node[]): Node => ({
  type: "element",
  tagName,
  properties: {},
  children,
});

function textOf(node: Node): string {
  return node.value ?? (node.children ?? []).map(textOf).join("");
}

/** A result div around a 2×2 table: Item/Total, then Pen/12. */
function resultDiv(properties: Record<string, unknown>, ...extras: Node[]): Node {
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["sw-grid-result"], ...properties },
    children: [
      cell(
        "table",
        cell("thead", cell("tr", cell("th", text("Item")), cell("th", text("Total")))),
        cell("tbody", cell("tr", cell("td", text("Pen")), cell("td", text("12")))),
      ),
      ...extras,
    ],
  };
}

function render(div: Node): Node {
  const tree: Node = { type: "root", children: [div] };
  renderGridResults()(tree);
  return tree.children?.[0] ?? text("");
}

/** The faded edge column and row are decoration, hidden from assistive technology. */
const isEdge = (node: Node): boolean => node.properties?.ariaHidden === "true";

/** Authored body rows of the rendered sheet: thead holds the column letters. */
function sheetRows(figure: Node): Node[] {
  const table = figure.children?.[0]?.children?.[0];
  return (table?.children?.[1]?.children ?? []).filter((row) => !isEdge(row));
}

/** Cells that carry a marker, as A1 references. */
function marked(figure: Node, marker: string): string[] {
  return sheetRows(figure).flatMap((row, rowIndex) =>
    (row.children ?? [])
      .slice(1)
      .filter((sheetCell) => !isEdge(sheetCell))
      .flatMap((sheetCell, colIndex) =>
        sheetCell.properties?.[marker] === "true"
          ? [`${columnLetters(colIndex)}${rowIndex + 1}`]
          : [],
      ),
  );
}

describe("grid result figures", () => {
  it("names columns like a spreadsheet", () => {
    expect([0, 25, 26, 51, 702].map(columnLetters)).toEqual(["A", "Z", "AA", "AZ", "AAA"]);
  });

  it("turns an authored table into a sheet with letters, row numbers, and grid-formatted values", () => {
    const tree: Node = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "div",
          properties: { className: ["sw-grid-result"], dataCaption: "Totals" },
          children: [
            cell(
              "table",
              cell("thead", cell("tr", cell("th", text("Item")), cell("th", text("Total")))),
              cell(
                "tbody",
                cell(
                  "tr",
                  cell("td", text("Pen")),
                  cell("td", {
                    type: "element",
                    tagName: "sw-format",
                    properties: { value: "1234.5", code: "#,##0.00", locale: "de-DE" },
                    children: [],
                  }),
                ),
              ),
            ),
          ],
        },
      ],
    };
    renderGridResults()(tree);
    const figure = tree.children?.[0];
    expect(figure?.tagName).toBe("figure");
    const rows = (figure?.children?.[0]?.children?.[0]?.children ?? []).flatMap(
      (part) => part.children ?? [],
    );
    expect(rows.map((row) => (row.children ?? []).map(textOf))).toEqual([
      ["", "A", "B", "C"],
      ["1", "Item", "Total", ""],
      ["2", "Pen", formatNumber(1234.5, "#,##0.00", "de-DE"), ""],
      ["3", "", "", ""],
    ]);

    // One more column and row show that the sheet continues; they are not content.
    expect(rows.at(-1)?.properties?.ariaHidden).toBe("true");
    expect(rows.map((row) => row.children?.at(-1)?.properties?.ariaHidden)).toEqual([
      "true",
      "true",
      "true",
      undefined,
    ]);
    expect(textOf(figure?.children?.[1] ?? text(""))).toBe("Totals");
  });

  it("aligns numbers and dates to the right, as the grid paints them, unless the author chose", () => {
    const authoredLeft: Node = { ...cell("td", text("7")), properties: { align: "left" } };
    const div = resultDiv({});
    div.children = [
      cell(
        "table",
        cell("thead", cell("tr", cell("th", text("Item")), cell("th", text("Total")))),
        cell(
          "tbody",
          cell("tr", cell("td", text("-1,234.50")), cell("td", text("12%"))),
          cell("tr", authoredLeft, cell("td", text("2026-01-31"))),
          cell("tr", cell("td", text("31/01/2026")), cell("td", text("Job 1-2"))),
        ),
      ),
    ];
    const figure = render(div);
    const aligned = sheetRows(figure).map((row) =>
      (row.children ?? [])
        .slice(1)
        .filter((sheetCell) => !isEdge(sheetCell))
        .map((sheetCell) => sheetCell.properties?.dataType ?? sheetCell.properties?.align ?? ""),
    );
    expect(aligned).toEqual([
      ["", ""],
      ["number", "number"],
      ["left", "number"],
      ["number", ""],
    ]);
  });

  it("formats the same tokens in plain text", () => {
    expect(formatTokens('Total: <sw-format value="0.25" code="0%"></sw-format>.')).toBe(
      `Total: ${formatNumber(0.25, "0%")}.`,
    );
  });

  it("decodes quoted format sections once for plain-text output", () => {
    const code = '0.00;[Red](0.00);"none";"value: "@';
    for (const value of [-12.3, 0, "sample"]) {
      const escaped = code.replaceAll('"', "&quot;");
      expect(formatTokens(`<sw-format value="${value}" code="${escaped}"></sw-format>`)).toBe(
        formatNumber(value, code),
      );
    }
    expect(formatTokens('<sw-format value="0" code="&quot;&amp;quot;&quot;"></sw-format>')).toBe(
      "&quot;",
    );
  });

  it("marks selected, note and list cells by A1 reference, with the first selected cell active", () => {
    const figure = render(
      resultDiv({ dataSelected: "B1:B2", dataNotes: "A2", dataLists: "B2 A1" }),
    );
    expect(marked(figure, "dataSelected")).toEqual(["B1", "B2"]);
    expect(marked(figure, "dataActive")).toEqual(["B1"]);
    expect(marked(figure, "dataNote")).toEqual(["A2"]);
    expect(marked(figure, "dataList")).toEqual(["A1", "B2"]);
  });

  it("shows each row ID beside its row number", () => {
    const figure = render(resultDiv({ dataRowIds: "header invoice-1" }));
    expect(sheetRows(figure).map((row) => textOf(row.children?.[0] ?? text("")))).toEqual([
      "1header",
      "2invoice-1",
    ]);
  });

  it("puts authored blocks under the sheet and the authored caption last", () => {
    const legend = cell("dl", cell("dt", text("A2 · note")), cell("dd", text("Checked")));
    const menu = cell("div", text("Copy value"));
    const caption = cell("figcaption", text("Result: "), cell("code", text("A2")));
    const figure = render(resultDiv({}, text("\n"), legend, caption, menu));
    expect((figure.children ?? []).map((part) => part.tagName)).toEqual([
      "div",
      "dl",
      "div",
      "figcaption",
    ]);
    expect(figure.children?.[1]?.properties?.className).toEqual(["sw-grid-result__legend"]);
    expect(textOf(figure.children?.[3] ?? text(""))).toBe("Result: A2");
    expect(figure.properties?.ariaLabel).toBe("Result: A2");
  });

  it("keeps a block written before the table above the sheet", () => {
    const div = resultDiv({});
    const widget = cell("div", text("Find"));
    div.children = [widget, ...(div.children ?? [])];
    const figure = render(div);
    const [first, second] = figure.children ?? [];
    expect(first).toBe(widget);
    expect(second?.properties?.className).toEqual(["sw-grid-result__frame"]);
  });

  it("rejects a marker that points outside the table", () => {
    expect(() => render(resultDiv({ dataNotes: "C1" }))).toThrow("C1");
    expect(() => render(resultDiv({ dataSelected: "A1:A3" }))).toThrow("A3");
    expect(() => render(resultDiv({ dataRowIds: "one two three" }))).toThrow("3 row IDs");
  });
});
