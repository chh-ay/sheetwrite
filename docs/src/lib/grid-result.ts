import { formatNumber } from "../../../packages/core/src/number-format.js";

/**
 * Static result figures for docs pages. An author writes the cells a snippet
 * produces as a plain Markdown table inside `<div class="sw-grid-result">`;
 * the first table row is sheet row 1. At build time the table gains column
 * letters and row numbers, so it reads as a small sheet. Plain-text outputs
 * (llms-full.txt) keep the authored table.
 *
 * Optional div attributes take space-separated A1 references or ranges:
 * `data-selected` (the first cell is the active cell), `data-notes` and
 * `data-lists`. The markers are drawn by CSS, so cell text stays the real
 * value. `data-row-ids` puts one ID beside each row number. Other blocks in
 * the div (a `<dl>` legend, a mini menu) render under the sheet, and an
 * authored `<figcaption>` replaces `data-caption` when it needs inline code.
 *
 * `<sw-format value="1234.5" code="#,##0.00" locale="de-DE"></sw-format>`
 * anywhere on a page becomes the text the grid itself paints for that value,
 * because it calls the grid's number formatter.
 */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const RESULT_CLASS = "sw-grid-result";
const LEGEND_CLASS = "sw-grid-result__legend";
const ROW_ID_CLASS = "sw-grid-result__row-id";
const CELL_REFERENCE = /^([A-Z]+)(\d+)$/;

/** Div attribute (hast property name) → the cell attribute it sets. */
const CELL_MARKERS = [
  ["dataSelected", "dataSelected"],
  ["dataNotes", "dataNote"],
  ["dataLists", "dataList"],
] as const;
const FORMAT_TAG = "sw-format";
const FORMAT_PATTERN = /<sw-format\s+([^>]*)><\/sw-format>/g;

/** Spreadsheet column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLetters(index: number): string {
  let rest = index + 1;
  let letters = "";
  while (rest > 0) {
    const digit = (rest - 1) % 26;
    letters = String.fromCharCode(65 + digit) + letters;
    rest = Math.floor((rest - 1) / 26);
  }
  return letters;
}

/** HTML parsing decodes attributes once; plain-text output must do the same. */
function attribute(source: string, name: string): string | undefined {
  const value = new RegExp(`${name}="([^"]*)"`).exec(source)?.[1];
  return value?.replace(/&(quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, (entity, name: string) => {
    const named: Readonly<Record<string, string>> = {
      quot: '"',
      apos: "'",
      amp: "&",
      lt: "<",
      gt: ">",
    };
    const normalized = name.toLowerCase();
    if (normalized.startsWith("#")) {
      const code = normalized.startsWith("#x")
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\uFFFD";
    }
    return named[normalized] ?? entity;
  });
}

function formatted(value: string, code: string | undefined, locale: string | undefined): string {
  const number = Number(value);
  return formatNumber(Number.isFinite(number) ? number : value, code, locale);
}

/** Replaces each `<sw-format>` element in Markdown source with its formatted text. */
export function formatTokens(markdown: string): string {
  return markdown.replace(FORMAT_PATTERN, (_match, attributes: string) =>
    formatted(
      attribute(attributes, "value") ?? "",
      attribute(attributes, "code"),
      attribute(attributes, "locale"),
    ),
  );
}

function classNames(node: HastNode): string[] {
  const value = node.properties?.className;
  return Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? value.split(" ")
      : [];
}

function element(tagName: string, children: HastNode[], properties: Record<string, unknown> = {}) {
  return { type: "element", tagName, properties, children } satisfies HastNode;
}

function elements(node: HastNode, tagName: string): HastNode[] {
  return (node.children ?? []).filter((child) => child.tagName === tagName);
}

function textContent(node: HastNode): string {
  return node.value ?? (node.children ?? []).map(textContent).join("");
}

/** Spreadsheet column letters back to a 0-based index: A → 0, AA → 26. */
function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

interface SheetSize {
  rows: number;
  width: number;
}

/**
 * Expands `B1:B3` or `A2` into 0-based `[row, col]` cells. A reference outside
 * the authored table is an authoring mistake, so it fails the build.
 */
function referencedCells(reference: string, size: SheetSize): Array<[number, number]> {
  const corners = reference.split(":").map((part) => {
    const match = CELL_REFERENCE.exec(part);
    if (match === null) throw new Error(`${RESULT_CLASS}: "${reference}" is not an A1 reference`);
    const [, letters = "", digits = ""] = match;
    const cell: [number, number] = [Number(digits) - 1, columnIndex(letters)];
    if (cell[0] < 0 || cell[0] >= size.rows || cell[1] >= size.width) {
      throw new Error(
        `${RESULT_CLASS}: ${reference} is outside the ${size.rows} × ${size.width} table`,
      );
    }
    return cell;
  });
  const [start, last] = corners;
  if (start === undefined) return [];
  const end = last ?? start;
  const cells: Array<[number, number]> = [];
  for (let row = Math.min(start[0], end[0]); row <= Math.max(start[0], end[0]); row += 1) {
    for (let col = Math.min(start[1], end[1]); col <= Math.max(start[1], end[1]); col += 1) {
      cells.push([row, col]);
    }
  }
  return cells;
}

function references(value: unknown): string[] {
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
}

/** Cell attributes keyed by `row:col`, from the result div's marker attributes. */
function cellMarkers(
  properties: Record<string, unknown>,
  size: SheetSize,
): Map<string, Record<string, string>> {
  const markers = new Map<string, Record<string, string>>();
  const mark = ([row, col]: [number, number], attribute: string) => {
    const key = `${row}:${col}`;
    markers.set(key, { ...markers.get(key), [attribute]: "true" });
  };
  for (const [divAttribute, cellAttribute] of CELL_MARKERS) {
    for (const reference of references(properties[divAttribute])) {
      for (const cell of referencedCells(reference, size)) mark(cell, cellAttribute);
    }
  }

  // The grid's active cell is the anchor of the selection: its first cell.
  const [anchor] = references(properties.dataSelected);
  const [activeCell] = anchor === undefined ? [] : referencedCells(anchor, size);
  if (activeCell !== undefined) mark(activeCell, "dataActive");
  return markers;
}

function rowHeader(index: number, rowId: string | undefined): HastNode {
  const number: HastNode = { type: "text", value: String(index + 1) };
  return element(
    "th",
    rowId === undefined
      ? [number]
      : [number, element("span", [{ type: "text", value: rowId }], { className: [ROW_ID_CLASS] })],
    { scope: "row" },
  );
}

/** Plain numbers, money, percentages and accounting negatives. */
const NUMBER_TEXT = /^[-+(]?[$€£¥]?\d[\d,.\s]*%?\)?$/;
/** Dates such as 2026-01-31 or 31/01/2026: the grid stores them as serial numbers. */
const DATE_TEXT = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;

/**
 * The grid paints numbers and dates right-aligned. An author's Markdown
 * alignment wins, so a deliberate `:---` column keeps its choice.
 */
function alignment(cell: HastNode): Record<string, string> {
  if (cell.properties?.align !== undefined) return {};
  const value = textContent(cell).trim();
  return NUMBER_TEXT.test(value) || DATE_TEXT.test(value) ? { dataType: "number" } : {};
}

/**
 * One faded column and row past the content show that the figure is a corner
 * of a sheet, not a closed table. They hold nothing, so assistive technology
 * skips them.
 */
const EDGE = { className: ["sw-grid-result__edge"], ariaHidden: "true" };

function sheetTable(table: HastNode, properties: Record<string, unknown>): HastNode {
  const rows = [
    ...elements(table, "thead").flatMap((part) => elements(part, "tr")),
    ...elements(table, "tbody").flatMap((part) => elements(part, "tr")),
  ];
  const width = Math.max(
    0,
    ...rows.map((row) => elements(row, "th").length + elements(row, "td").length),
  );
  const markers = cellMarkers(properties, { rows: rows.length, width });
  const rowIds = references(properties.dataRowIds);
  if (rowIds.length > 0 && rowIds.length !== rows.length) {
    throw new Error(`${RESULT_CLASS}: ${rowIds.length} row IDs for ${rows.length} rows`);
  }

  const letters = element("tr", [
    element("th", [], { className: ["sw-grid-result__corner"], ariaHidden: "true" }),
    ...Array.from({ length: width }, (_, index) =>
      element("th", [{ type: "text", value: columnLetters(index) }], { scope: "col" }),
    ),
    element("th", [{ type: "text", value: columnLetters(width) }], EDGE),
  ]);
  const body = rows.map((row, rowIndex) =>
    element("tr", [
      rowHeader(rowIndex, rowIds[rowIndex]),
      ...(row.children ?? [])
        .filter((cell) => cell.tagName === "th" || cell.tagName === "td")
        .map((cell, colIndex) => ({
          ...cell,
          tagName: "td",
          properties: {
            ...cell.properties,
            ...alignment(cell),
            ...markers.get(`${rowIndex}:${colIndex}`),
          },
        })),
      element("td", [], EDGE),
    ]),
  );
  const edgeRow = element(
    "tr",
    [
      element("th", [{ type: "text", value: String(rows.length + 1) }]),
      ...Array.from({ length: width + 1 }, () => element("td", [])),
    ],
    EDGE,
  );
  return element("table", [element("thead", [letters]), element("tbody", [...body, edgeRow])], {
    className: ["sw-grid-result__sheet"],
  });
}

/**
 * Authored blocks around the table, in source order: a find widget written
 * first stays above the sheet, a legend or menu after it goes under. A `<dl>`
 * becomes the legend.
 */
function extraBlocks(div: HastNode, table: HastNode): { before: HastNode[]; after: HastNode[] } {
  const parts = div.children ?? [];
  const tableIndex = parts.indexOf(table);
  const blocks = (range: HastNode[]) =>
    range
      .filter((part) => part.type === "element" && part.tagName !== "figcaption")
      .map((part) =>
        part.tagName === "dl"
          ? { ...part, properties: { ...part.properties, className: [LEGEND_CLASS] } }
          : part,
      );
  return { before: blocks(parts.slice(0, tableIndex)), after: blocks(parts.slice(tableIndex + 1)) };
}

function caption(div: HastNode): HastNode | undefined {
  const authored = elements(div, "figcaption")[0];
  if (authored !== undefined) return authored;
  const text = div.properties?.dataCaption;
  return typeof text === "string"
    ? element("figcaption", [{ type: "text", value: text }])
    : undefined;
}

function transform(node: HastNode): void {
  const children = node.children ?? [];
  for (const [index, child] of children.entries()) {
    if (child.tagName === FORMAT_TAG) {
      const properties = child.properties ?? {};
      children[index] = {
        type: "text",
        value: formatted(
          String(properties.value ?? ""),
          properties.code === undefined ? undefined : String(properties.code),
          properties.locale === undefined ? undefined : String(properties.locale),
        ),
      };
      continue;
    }
    if (child.tagName === "div" && classNames(child).includes(RESULT_CLASS)) {
      const table = (child.children ?? []).find((part) => part.tagName === "table");
      if (table === undefined) throw new Error(`${RESULT_CLASS} must contain a Markdown table`);
      transform(table);
      const figcaption = caption(child);
      const { before, after } = extraBlocks(child, table);
      children[index] = element(
        "figure",
        [
          ...before,
          element("div", [sheetTable(table, child.properties ?? {})], {
            className: ["sw-grid-result__frame"],
          }),
          ...after,
          ...(figcaption === undefined ? [] : [figcaption]),
        ],
        {
          className: [RESULT_CLASS],
          ariaLabel: figcaption === undefined ? "Result" : textContent(figcaption),
        },
      );
      continue;
    }
    transform(child);
  }
}

/** Rehype plugin: run after raw HTML is parsed. */
export function renderGridResults() {
  return (tree: HastNode): void => transform(tree);
}
