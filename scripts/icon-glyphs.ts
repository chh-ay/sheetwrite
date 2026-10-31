/**
 * The Sheetwrite command icon sheet: one 24-unit glyph per cell, drawn on one
 * grammar so the set reads as a family.
 *
 * - One stroke weight (1.6) with round caps and joins; `bold` parts (2.6) only
 *   where weight is the meaning (bold type, thick borders, frozen edges).
 * - Row and column commands draw rows as horizontal lines and columns as
 *   vertical lines, with no outer frame; the cells a command affects are
 *   tinted, so Insert, Hide and Freeze differ by what is tinted.
 * - Border glyphs draw unaffected edges as dotted `guide` parts and the
 *   applied edges solid, as Excel's border menu does.
 *
 * Each row is one command family. `scripts/icon-sheet.ts` lays the rows out on
 * a fixed pitch and generates the sheet SVG, the CSS crops and the name list.
 */

/** A stroke path, or a path with a tone. */
export type GlyphPart = string | { d: string; tone: "tint" | "guide" | "bold" };

type Glyph = readonly [name: string, parts: readonly GlyphPart[]];

const tint = (d: string): GlyphPart => ({ d, tone: "tint" });
const guide = (d: string): GlyphPart => ({ d, tone: "guide" });
const bold = (d: string): GlyphPart => ({ d, tone: "bold" });

/** The outer square of the border family. */
const BOX = "M4 4h16v16H4Z";
/** The rounded left and right edges of one wide cell, for the merge family. */
const CELL_EDGES =
  "M7 5H4.5A1.5 1.5 0 0 0 3 6.5v11A1.5 1.5 0 0 0 4.5 19H7M17 5h2.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H17";
/** The inner cross of the border family: the lines between the four quarters. */
const CROSS = "M12 4v16M4 12h16";
const LENS = "M16.5 10.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z";
const LENS_HANDLE = "m15 15 5.5 5.5";
const DOCUMENT =
  "M6.5 3H14l4.5 4.5v12A1.5 1.5 0 0 1 17 21H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3Z";
const DOCUMENT_FOLD = "M14 3v4.5h4.5";
const LETTER_A = "M3 19 8 6l5 13";
const LETTER_A_BAR = "M4.9 14.5h6.2";
const FUNNEL = "M4 5h16l-6 7.5V19l-4 2v-8.5Z";
/** The value and category axes every cartesian chart glyph shares. */
const AXES = "M4 4v16h16";
/** Three rising columns; Insert › Chart uses them as the chart family's face. */
const COLUMNS = "M7 20v-8h2.5v8M11.5 20V7H14v13M16 20V10h2.5v10";
const COLUMNS_FILL = "M7 12h2.5v8H7ZM11.5 7H14v13h-2.5ZM16 10h2.5v10H16Z";
const PIE = "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z";

/** A rectangle with the sheet's 1.5-unit corner radius, as most frames use. */
function frame(x: number, y: number, width: number, height: number): string {
  const r = 1.5;
  const w = width - 2 * r;
  const h = height - 2 * r;
  return `M${x + r} ${y}h${w}a${r} ${r} 0 0 1 ${r} ${r}v${h}a${r} ${r} 0 0 1-${r} ${r}h-${w}a${r} ${r} 0 0 1-${r}-${r}v-${h}a${r} ${r} 0 0 1 ${r}-${r}Z`;
}

export const ICON_ROWS: readonly (readonly Glyph[])[] = [
  // History, clipboard and search.
  [
    ["undo", ["M9 6 4.5 10.5 9 15", "M4.5 10.5H14a5 5 0 0 1 0 10h-3"]],
    ["redo", ["M15 6l4.5 4.5L15 15", "M19.5 10.5H10a5 5 0 0 0 0 10h3"]],
    [
      "paste",
      [
        "M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15",
        "M9.5 3h5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5Z",
        "M8.5 11h7M8.5 14.5h7M8.5 18h4",
      ],
    ],
    [
      "cut",
      [
        "M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
        "M20 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
        "M8 15.4 16.5 3.5",
        "M16 15.4 7.5 3.5",
      ],
    ],
    [
      "copy",
      [
        "M9.5 8h9A1.5 1.5 0 0 1 20 9.5v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 19.5v-10A1.5 1.5 0 0 1 9.5 8Z",
        "M16 5.5v-1A1.5 1.5 0 0 0 14.5 3h-9A1.5 1.5 0 0 0 4 4.5v10A1.5 1.5 0 0 0 5.5 16H8",
      ],
    ],
    ["find", [LENS, LENS_HANDLE]],
    ["zoomIn", [LENS, LENS_HANDLE, "M7.5 10.5h6M10.5 7.5v6"]],
    ["zoomOut", [LENS, LENS_HANDLE, "M7.5 10.5h6"]],
    ["autoSum", ["M18 5H6l6.5 7L6 19h12"]],
    [
      "clear",
      [
        tint("M4 15.5a1.5 1.5 0 0 1 0-2.1L8.5 9l6.5 6.5-4.4 4.5H8.5Z"),
        "M8.5 20 4 15.5a1.5 1.5 0 0 1 0-2.1L12.9 4.5a1.5 1.5 0 0 1 2.1 0l4.5 4.5a1.5 1.5 0 0 1 0 2.1L10.6 20Z",
        "M8.5 20H20",
        "M8.5 9 15 15.5",
      ],
    ],
  ],
  // Type.
  [
    [
      "bold",
      [bold("M7 4.5h6.25a3.75 3.75 0 0 1 0 7.5H7Z"), bold("M7 12h7.25a3.75 3.75 0 0 1 0 7.5H7Z")],
    ],
    ["italic", ["M10 4.5h8M6 19.5h8M14 4.5l-4 15"]],
    ["underline", ["M7 4v6.5a5 5 0 0 0 10 0V4", "M5 20.5h14"]],
    [
      "strikethrough",
      [
        "M4 12h16",
        "M16.5 7.5C15.9 5.7 14.1 4.5 12 4.5c-2.6 0-4.5 1.6-4.5 3.6 0 1.4.9 2.4 2.5 3",
        "M8 16.5c.6 1.8 2.4 3 4.5 3 2.6 0 4.5-1.6 4.5-3.6 0-.6-.1-1.1-.4-1.6",
      ],
    ],
    ["textColor", ["M6.5 17 12 4l5.5 13", "M8.4 12.5h7.2"]],
    [
      "fillColor",
      [
        tint("M5 11.5h13l-6.5 6.5Z"),
        "M5 11.5 11.5 5l6.5 6.5-6.5 6.5Z",
        "M9 2.5 11.5 5",
        "M19.5 15c.8 1.1 1.5 2.1 1.5 2.9a1.5 1.5 0 0 1-3 0c0-.8.7-1.8 1.5-2.9Z",
      ],
    ],
    ["fontGrow", [LETTER_A, LETTER_A_BAR, "m15.5 8 3-3 3 3"]],
    ["fontShrink", [LETTER_A, LETTER_A_BAR, "m15.5 5 3 3 3-3"]],
    ["clearFormat", ["M5 5h10", "M10 5v14", "m14 14 6 6", "m20 14-6 6"]],
    ["separator", ["M12 4v16"]],
  ],
  // Alignment and merging.
  [
    ["alignLeft", ["M4 6h16M4 10h10M4 14h16M4 18h10"]],
    ["alignCenter", ["M4 6h16M7 10h10M4 14h16M7 18h10"]],
    ["alignRight", ["M4 6h16M10 10h10M4 14h16M10 18h10"]],
    // Vertical alignment: an arrow into the edge the text moves to, as in Excel.
    ["alignTop", ["M4 4h16", "M12 20V8", "m8 12 4-4 4 4"]],
    ["alignMiddle", ["M4 12h16", "M12 3v5.5m-3-3 3 3 3-3", "M12 21v-5.5m-3 3 3-3 3 3"]],
    ["alignBottom", ["M4 20h16", "M12 4v12", "m8 12 4 4 4-4"]],
    ["wrap", ["M4 6h16", "M4 12h12.5a3.5 3.5 0 0 1 0 7H12", "m14 17-2 2 2 2", "M4 18h4"]],
    // Merging: a cell's rounded left and right edges, so the glyph reads as one
    // cell without a full box. Arrows show the direction; Merge & Center shows
    // centered text instead, so it never reads as a face.
    ["merge", [CELL_EDGES, "M6.5 12h4m-2-2 2 2-2 2", "M17.5 12h-4m2-2-2 2 2 2"]],
    [
      "unmerge",
      [CELL_EDGES, guide("M12 5v14"), "M10.5 12h-4m2-2-2 2 2 2", "M13.5 12h4m-2-2 2 2-2 2"],
    ],
    ["mergeAndCenter", [CELL_EDGES, "M8.5 9h7M7 12.5h10M9.5 16h5"]],
  ],
  // Borders: dotted guides, solid applied edges.
  [
    ["border", [BOX, CROSS]],
    ["borderAll", [BOX, CROSS]],
    ["borderOutside", [BOX, guide(CROSS)]],
    ["borderThickOutside", [bold(BOX), guide(CROSS)]],
    ["borderTop", [guide(BOX), guide(CROSS), "M4 4h16"]],
    ["borderBottom", [guide(BOX), guide(CROSS), "M4 20h16"]],
    ["borderLeft", [guide(BOX), guide(CROSS), "M4 4v16"]],
    ["borderRight", [guide(BOX), guide(CROSS), "M20 4v16"]],
    ["borderNone", [guide(BOX), guide(CROSS)]],
  ],
  // Number formats, links, notes and export.
  [
    [
      "currency",
      [
        "M12 3.5v17",
        "M16.5 7.5c-.6-1.4-2.3-2.5-4.5-2.5-2.5 0-4.3 1.4-4.3 3.3 0 4.3 9 2.4 9 7 0 1.9-1.9 3.2-4.7 3.2-2.3 0-4.1-1.1-4.8-2.6",
      ],
    ],
    [
      "percent",
      [
        "M18.5 5.5l-13 13",
        "M9.2 7a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0Z",
        "M19.2 17a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0Z",
      ],
    ],
    // Comma style: a thousands comma before zeros, beside the decimal glyphs.
    [
      "comma",
      [
        // A round dot on the baseline with a short tail, like the decimal glyphs' point.
        bold("M6 13h.01"),
        "M7 13.3c0 1.4-.7 2.5-2 3.2",
        "M13.5 10.5a2 2.6 0 0 1-4 0 2 2.6 0 0 1 4 0Z",
        "M19.5 10.5a2 2.6 0 0 1-4 0 2 2.6 0 0 1 4 0Z",
      ],
    ],
    [
      "decimalIncrease",
      [
        bold("M4.5 13h.01"),
        "M10.5 10.5a2 2.6 0 0 1-4 0 2 2.6 0 0 1 4 0Z",
        "M16.5 10.5a2 2.6 0 0 1-4 0 2 2.6 0 0 1 4 0Z",
        "M5 19h14m-3-2.5 3 2.5-3 2.5",
      ],
    ],
    [
      "decimalDecrease",
      [
        bold("M4.5 13h.01"),
        "M10.5 10.5a2 2.6 0 0 1-4 0 2 2.6 0 0 1 4 0Z",
        "M19 19H5m3-2.5L5 19l3 2.5",
      ],
    ],
    [
      "hyperlink",
      [
        "M10 14a4 4 0 0 0 5.66.34l3-3a4 4 0 0 0-5.66-5.66l-1.7 1.7",
        "M14 10a4 4 0 0 0-5.66-.34l-3 3a4 4 0 0 0 5.66 5.66l1.7-1.7",
      ],
    ],
    [
      "note",
      [
        tint("M14 20v-4.5a1.5 1.5 0 0 1 1.5-1.5H20Z"),
        "M5.5 4h13A1.5 1.5 0 0 1 20 5.5V14l-6 6H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Z",
        "M14 20v-4.5a1.5 1.5 0 0 1 1.5-1.5H20",
        "M8 9h8M8 12.5h5",
      ],
    ],
    ["exportCsv", [DOCUMENT, DOCUMENT_FOLD, "M8 12h7M8 15h7M8 18h4"]],
    [
      "exportXlsx",
      [DOCUMENT, DOCUMENT_FOLD, tint("M8 11h7v7H8Z"), "M8 11h7v7H8ZM11.5 11v7M8 14.5h7"],
    ],
  ],
  // Rows, columns and panes: the tint marks the cells the command touches.
  [
    [
      "insert",
      [
        guide("M3 5h12M3 19h12"),
        tint("M3 9.5h12v5H3Z"),
        "M3 9.5h12M3 14.5h12",
        "M19 9.5v5M16.5 12h5",
      ],
    ],
    [
      "delete",
      [
        guide("M3 5h12M3 19h12"),
        tint("M3 9.5h12v5H3Z"),
        "M3 9.5h12M3 14.5h12",
        "m16.5 9.5 5 5m0-5-5 5",
      ],
    ],
    // Row height and column width: two edges and the size between them.
    [
      "format",
      ["M4 4v16M20 4v16", "M7.5 12h9", "m10 9.5-2.5 2.5 2.5 2.5", "m14 9.5 2.5 2.5-2.5 2.5"],
    ],
    [
      "hideRows",
      [
        guide("M3 4h18M3 20h18"),
        tint("M3 10.8h18v2.4H3Z"),
        "M3 10.8h18M3 13.2h18",
        "M12 5.5v3.3m-1.8-1.8 1.8 1.8 1.8-1.8",
        "M12 18.5v-3.3m-1.8 1.8 1.8-1.8 1.8 1.8",
      ],
    ],
    [
      "unhideRows",
      [
        guide("M3 4h18M3 20h18"),
        tint("M3 10.8h18v2.4H3Z"),
        "M3 10.8h18M3 13.2h18",
        "M12 8.8V5.5m-1.8 1.8L12 5.5l1.8 1.8",
        "M12 15.2v3.3m-1.8-1.8 1.8 1.8 1.8-1.8",
      ],
    ],
    [
      "hideColumns",
      [
        guide("M4 3v18M20 3v18"),
        tint("M10.8 3h2.4v18h-2.4Z"),
        "M10.8 3v18M13.2 3v18",
        "M5.5 12h3.3m-1.8-1.8 1.8 1.8-1.8 1.8",
        "M18.5 12h-3.3m1.8-1.8-1.8 1.8 1.8 1.8",
      ],
    ],
    [
      "unhideColumns",
      [
        guide("M4 3v18M20 3v18"),
        tint("M10.8 3h2.4v18h-2.4Z"),
        "M10.8 3v18M13.2 3v18",
        "M8.8 12H5.5m1.8-1.8L5.5 12l1.8 1.8",
        "M15.2 12h3.3m-1.8-1.8 1.8 1.8-1.8 1.8",
      ],
    ],
    // The frozen top row and first column, bounded by heavy lines inside a
    // dotted sheet outline; without the outline the heavy lines read as a T.
    [
      "freeze",
      [
        guide("M3 3h18v18H3Z"),
        tint("M3 3h18v5.5H3Z"),
        tint("M3 8.5h5.5V21H3Z"),
        bold("M3 8.5h18M8.5 8.5V21"),
      ],
    ],
    ["groupRows", ["M10 6h10M10 12h10M10 18h10", "M7.5 6H5v12h2.5", "M5 12H3"]],
    [
      "ungroupRows",
      ["M10 6h10M10 12h10M10 18h10", guide("M7.5 6H5v12h2.5"), "m2.5 10.5 3 3m0-3-3 3"],
    ],
  ],
  // Sorting and filtering.
  [
    [
      "sortAsc",
      ["M6 4v16m-3-3 3 3 3-3", "M12.5 11 15 4.5l2.5 6.5M13.3 9h3.4", "M12.5 13.5h5l-5 6h5"],
    ],
    [
      "sortDesc",
      ["M6 4v16m-3-3 3 3 3-3", "M12.5 4.5h5l-5 6h5", "M12.5 20 15 13.5l2.5 6.5M13.3 18h3.4"],
    ],
    ["sortFilter", [FUNNEL]],
    ["clearFilter", ["M3 5h12l-4.5 5.5v6.5l-3 1.5v-8Z", "m15.5 14.5 5 5m0-5-5 5"]],
  ],
  // Charts, one glyph per chart kind, and pivot tables.
  [
    ["chart", [AXES, tint(COLUMNS_FILL), COLUMNS]],
    ["chartColumn", [AXES, tint(COLUMNS_FILL), COLUMNS]],
    [
      "chartBar",
      [
        AXES,
        tint("M4 6h9v2.5H4ZM4 10.75h13v2.5H4ZM4 15.5h6V18H4Z"),
        "M4 6h9v2.5H4M4 10.75h13v2.5H4M4 15.5h6V18H4",
      ],
    ],
    ["chartLine", [AXES, "m7 15.5 4-5 3.5 3L19 7"]],
    ["chartArea", [AXES, tint("M4 20v-5l4.5-5 4 3.5L20 8v12Z"), "m4 15 4.5-5 4 3.5L20 8"]],
    ["chartPie", [PIE, tint("M12 4a8 8 0 0 1 8 8h-8Z"), "M12 4v8h8"]],
    [
      "chartDoughnut",
      [
        PIE,
        "M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
        tint("M12 4a8 8 0 0 1 8 8h-4.5A3.5 3.5 0 0 0 12 8.5Z"),
        "M12 4v4.5M15.5 12H20",
      ],
    ],
    // Round dots: a zero-length bold stroke draws a disc, like the decimal point.
    ["chartScatter", [AXES, bold("M8 15.5h.01M11 11.5h.01M14 13.5h.01M16.5 8.5h.01M19 10.5h.01")]],
    // A table whose header row and column turn: the tint marks the headers,
    // and the bent arrow is the turn. One head stays legible at ribbon size.
    [
      "pivotTable",
      [
        tint("M9 4h11v5H9ZM4 9h5v11H4Z"),
        "M4 4h16v16H4Z",
        "M4 9h16M9 4v16",
        "M17 11.5V13a4 4 0 0 1-4 4h-1.5",
        "m13.5 15-2 2 2 2",
      ],
    ],
  ],
  // Formulas: functions, names and formula help.
  [
    // Excel's fx: an f with a crossbar beside an x.
    [
      "insertFunction",
      ["M13 4h-1.5A2.5 2.5 0 0 0 9 6.5V20", "M5.5 10H12", "m13.5 11 6.5 8.5m0-8.5-6.5 8.5"],
    ],
    // A name tag with the name written on it.
    [
      "defineName",
      [
        "M3.5 7.5A1.5 1.5 0 0 1 5 6h10.3a1.5 1.5 0 0 1 1.1.5l4 4.5a1.5 1.5 0 0 1 0 2l-4 4.5a1.5 1.5 0 0 1-1.1.5H5a1.5 1.5 0 0 1-1.5-1.5Z",
        "M7 12h6",
      ],
    ],
    // A list of names beside their references: the tint marks the name column.
    [
      "nameManager",
      [
        tint("M10.5 4v16h-5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Z"),
        frame(4, 4, 16, 16),
        "M10.5 4v16",
        "M13.5 8.5h3.5M13.5 12h3.5M13.5 15.5h3.5",
      ],
    ],
    // A question in a speech bubble: the formula explained in words.
    [
      "explainFormula",
      [
        "M5.5 3.5h13A1.5 1.5 0 0 1 20 5v10.5a1.5 1.5 0 0 1-1.5 1.5H11l-4 3.5V17H5.5A1.5 1.5 0 0 1 4 15.5V5a1.5 1.5 0 0 1 1.5-1.5Z",
        "M9.5 8.5a2.5 2.5 0 1 1 3.4 2.3c-.5.2-.9.7-.9 1.2v.5",
        bold("M12 14.6h.01"),
      ],
    ],
  ],
  // Data sources, links and the data model.
  [
    // A data source with an arrow into the sheet.
    [
      "getData",
      [
        "M4 6c0-1.4 2.7-2.5 6-2.5s6 1.1 6 2.5-2.7 2.5-6 2.5S4 7.4 4 6Z",
        "M4 6v11c0 1.4 2.7 2.5 6 2.5M16 6v5.5",
        "M4 11.5c0 1.4 2.7 2.5 6 2.5",
        "M18.5 13v7.5m-3-3 3 3 3-3",
      ],
    ],
    [
      "refreshAll",
      ["M5 12a7 7 0 0 1 13.06-3.5", "M18 4.5v4h-4", "M19 12a7 7 0 0 1-13.06 3.5", "M6 19.5v-4h4"],
    ],
    // A query is a source and a list of steps; the tint marks the output table.
    [
      "queries",
      [
        frame(6.5, 2.5, 11, 4.5),
        frame(6.5, 9.75, 11, 4.5),
        tint(frame(6.5, 17, 11, 4.5)),
        frame(6.5, 17, 11, 4.5),
        "M12 7v2.75M12 14.25V17",
      ],
    ],
    // A sheet with an arrow out of it: cells that read another workbook.
    [
      "editLinks",
      [
        "M10 5H5.5A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20h12a1.5 1.5 0 0 0 1.5-1.5V14",
        "M14 4h6v6M20 4l-8.5 8.5",
      ],
    ],
    // Two tables, header rows tinted, joined by one key.
    [
      "relationships",
      [
        tint("M3 6V4.5A1.5 1.5 0 0 1 4.5 3h5A1.5 1.5 0 0 1 11 4.5V6Z"),
        tint("M13 16v-1.5a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5V16Z"),
        frame(3, 3, 8, 8),
        frame(13, 13, 8, 8),
        "M3 6h8M13 16h8",
        "M7 11v6h6",
      ],
    ],
    // A cube: the model that holds the related tables.
    [
      "dataModel",
      [
        tint("M12 3 20 7.5 12 12 4 7.5Z"),
        "M12 3 20 7.5v9L12 21l-8-4.5v-9Z",
        "M4 7.5 12 12l8-4.5M12 12v9",
      ],
    ],
    // A calculator: a calculation saved once and reused.
    [
      "measure",
      [
        frame(5, 3, 14, 18),
        tint("M8 6h8v3.5H8Z"),
        "M8 6h8v3.5H8Z",
        bold("M9.5 13.5h.01M14.5 13.5h.01M9.5 17.5h.01M14.5 17.5h.01"),
      ],
    ],
  ],
  // Dashboards and version history.
  [
    // Tiles of different sizes on one sheet.
    [
      "dashboard",
      [
        frame(4, 4, 7, 9),
        tint(frame(13, 4, 7, 5)),
        frame(13, 4, 7, 5),
        frame(13, 11, 7, 9),
        frame(4, 15, 7, 5),
      ],
    ],
    // A filter panel: a header and its item buttons, the chosen one tinted.
    [
      "slicer",
      [
        frame(3.5, 3, 17, 18),
        "M3.5 7.5h17",
        tint(frame(6.5, 10, 11, 3.5)),
        frame(6.5, 10, 11, 3.5),
        frame(6.5, 15.5, 11, 3.5),
      ],
    ],
    // A card with one figure's rising trend.
    ["kpiCard", [frame(3, 5, 18, 14), "m7 15 3.5-3.5 2.5 2.5L17 9.5", "M14 9.5h3v3"]],
    // A clock with an arrow that turns back.
    [
      "versionHistory",
      ["M4.5 12A7.5 7.5 0 1 0 6.7 6.7L4.5 8.9", "M4.5 5.5v3.4h3.4", "M12 8v4l2.5 2.5"],
    ],
    // A bookmark with a plus: save this point in the history.
    [
      "saveVersion",
      ["M6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.5L5 21V4.5A1.5 1.5 0 0 1 6.5 3Z", "M12 7v6M9 10h6"],
    ],
  ],
];
