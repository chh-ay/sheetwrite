import { describe, expect, it } from "bun:test";

import { formatNumber } from "@sheetwrite/core";

import { colToA1 } from "../../packages/core/src/a1.js";
import { formatTokens, renderGridResults } from "../src/lib/grid-result.js";

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

/** A result div around a 2×2 table, optionally replacing its final cell value. */
function resultDiv(
  properties: Record<string, unknown>,
  value: Node = text("12"),
  ...extras: Node[]
): Node {
  return {
    type: "element",
    tagName: "div",
    properties: { className: ["sw-grid-result"], ...properties },
    children: [
      cell(
        "table",
        cell("thead", cell("tr", cell("th", text("Item")), cell("th", text("Total")))),
        cell("tbody", cell("tr", cell("td", text("Pen")), cell("td", value))),
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
        sheetCell.properties?.[marker] === "true" ? [`${colToA1(colIndex)}${rowIndex + 1}`] : [],
      ),
  );
}

describe("grid result figures", () => {
  it("turns an authored table into a sheet with letters, row numbers, and grid-formatted values", () => {
    const figure = render(
      resultDiv(
        { dataCaption: "Totals" },
        {
          type: "element",
          tagName: "sw-format",
          properties: { value: "1234.5", code: "#,##0.00", locale: "de-DE" },
          children: [],
        },
      ),
    );
    expect(figure.tagName).toBe("figure");
    const rows = (figure.children?.[0]?.children?.[0]?.children ?? []).flatMap(
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
    expect(textOf(figure.children?.[1] ?? text(""))).toBe("Totals");
  });

  it("rejects missing and blank sw-format values instead of displaying zero", () => {
    for (const value of [undefined, "", " \t "]) {
      const properties = value === undefined ? { code: "0.00" } : { value, code: "0.00" };
      const token: Node = { type: "element", tagName: "sw-format", properties, children: [] };
      const attributes = value === undefined ? 'code="0.00"' : `value="${value}" code="0.00"`;

      expect(() => render(cell("p", token))).toThrow(
        "sw-grid-result: sw-format requires a non-blank value",
      );
      expect(() => formatTokens(`<sw-format ${attributes}></sw-format>`)).toThrow(
        "sw-grid-result: sw-format requires a non-blank value",
      );
    }
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

  it("marks cells by A1 reference, the first selected cell active, and shows row IDs", () => {
    const figure = render(
      resultDiv({
        dataSelected: "B1:B2",
        dataNotes: "A2",
        dataLists: "B2 A1",
        dataRowIds: "header invoice-1",
      }),
    );
    expect(marked(figure, "dataSelected")).toEqual(["B1", "B2"]);
    expect(marked(figure, "dataActive")).toEqual(["B1"]);
    expect(marked(figure, "dataNote")).toEqual(["A2"]);
    expect(marked(figure, "dataList")).toEqual(["A1", "B2"]);
    expect(sheetRows(figure).map((row) => textOf(row.children?.[0] ?? text("")))).toEqual([
      "1header",
      "2invoice-1",
    ]);
  });

  it("puts authored blocks under the sheet, formats their sw-format tokens, and the caption last", () => {
    const token = (value: string): Node => ({
      type: "element",
      tagName: "sw-format",
      properties: { value, code: "#,##0.00", locale: "de-DE" },
      children: [],
    });
    const legend = cell("dl", cell("dt", text("B2")), cell("dd", token("1234.5")));
    const menu = cell("div", text("Copy value"));
    const caption = cell("figcaption", text("Total: "), token("99"));
    const figure = render(resultDiv({}, undefined, text("\n"), legend, caption, menu));

    expect((figure.children ?? []).map((part) => part.tagName)).toEqual([
      "div",
      "dl",
      "div",
      "figcaption",
    ]);
    expect(figure.children?.[1]?.properties?.className).toEqual(["sw-grid-result__legend"]);
    const total = `Total: ${formatNumber(99, "#,##0.00", "de-DE")}`;
    expect(textOf(figure.children?.[1] ?? text(""))).toBe(
      `B2${formatNumber(1234.5, "#,##0.00", "de-DE")}`,
    );
    expect(textOf(figure.children?.[3] ?? text(""))).toBe(total);
    expect(figure.properties?.ariaLabel).toBe(total);
  });

  it("rejects a marker that points outside the table", () => {
    expect(() => render(resultDiv({ dataNotes: "C1" }))).toThrow("C1");
    expect(() => render(resultDiv({ dataSelected: "A1:A3" }))).toThrow("A3");
    expect(() => render(resultDiv({ dataRowIds: "one two three" }))).toThrow("3 row IDs");
  });
});
