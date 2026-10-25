/** Create a fresh, stroke-based SVG icon for each rendered toolbar button. */
function svgIcon(...paths: string[]): () => SVGSVGElement {
  return () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const d of paths) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  };
}

/** Shared stroke icons for flat-toolbar and ribbon commands. */
export const COMMAND_ICONS = {
  bold: svgIcon("M7 4h6a4 4 0 0 1 0 8H7Z", "M7 12h7a4 4 0 0 1 0 8H7Z"),
  undo: svgIcon("M9 7 4 12l5 5", "M4 12h9a7 7 0 0 1 7 7"),
  redo: svgIcon("m15 7 5 5-5 5", "M20 12h-9a7 7 0 0 0-7 7"),
  italic: svgIcon("M10 4h8M6 20h8M14 4l-4 16"),
  underline: svgIcon("M6 3v7a6 6 0 0 0 12 0V3", "M4 21h16"),
  strikethrough: svgIcon(
    "M4 12h16",
    "M17 6.5A5 5 0 0 0 13 5h-2a3 3 0 0 0-1 5.8",
    "M7 17.5A5 5 0 0 0 11 19h2a3 3 0 0 0 1-5.8",
  ),
  alignLeft: svgIcon("M4 6h16M4 10h10M4 14h16M4 18h10"),
  alignCenter: svgIcon("M4 6h16M7 10h10M4 14h16M7 18h10"),
  alignRight: svgIcon("M4 6h16M10 10h10M4 14h16M10 18h10"),
  border: svgIcon("M4 4h16v16H4Z", "M12 4v16M4 12h16"),
  clearFormat: svgIcon("m4 15 9-9 6 6-8 8H7Z", "M14 20h6"),
  merge: svgIcon("M4 5h16v14H4Z", "m9 4 3 3-3 3M15 4l-3 3 3 3"),
  unmerge: svgIcon("M4 5h16v14H4Z", "m10 4-3 3 3 3M14 4l3 3-3 3"),
  sortAsc: svgIcon("M8 18V6m0 0L4 10m4-4 4 4", "M15 7h5M15 12h4M15 17h3"),
  sortDesc: svgIcon("M8 6v12m0 0-4-4m4 4 4-4", "M15 7h3M15 12h4M15 17h5"),
  exportCsv: svgIcon("M4 4h12l4 4v12H4Z", "M8 12h8M8 16h8"),
  exportXlsx: svgIcon("M4 4h12l4 4v12H4Z", "m9 11 6 6m0-6-6 6"),
  separator: svgIcon("M12 4v16"),
  textColor: svgIcon("m5 18 7-14 7 14M8 13h8M4 21h16"),
  fillColor: svgIcon("m4 13 8-9 8 9-8 7Z", "M3 22h18"),
  alignTop: svgIcon("M4 4h16M8 8h8M8 12h8M8 16h8"),
  alignMiddle: svgIcon("M4 12h3m10 0h3M9 6h6M9 12h6M9 18h6"),
  alignBottom: svgIcon("M4 20h16M8 8h8M8 12h8M8 16h8"),
  wrap: svgIcon("M4 6h16M4 11h12a4 4 0 0 1 0 8h-5m3-3-3 3 3 3M4 16h3"),
  paste: svgIcon("M8 5H5v16h14V5h-3M8 3h8v5H8Z"),
  cut: svgIcon(
    "m8 8 12 12M8 16 20 4M4 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M4 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  ),
  copy: svgIcon("M8 8h12v13H8ZM4 16H3V3h12v1"),
  fontGrow: svgIcon("m3 20 5-13 5 13M5 15h6M16 7h6m-3-3v6"),
  fontShrink: svgIcon("m3 20 5-13 5 13M5 15h6M16 7h6"),
  borderAll: svgIcon("M4 4h16v16H4ZM12 4v16M4 12h16"),
  borderOutside: svgIcon("M4 4h16v16H4Z"),
  borderThickOutside: svgIcon("M3 3h18v18H3ZM5 5h14v14H5Z"),
  borderTop: svgIcon("M4 4h16M4 9v11h16V9"),
  borderBottom: svgIcon("M4 20h16M4 15V4h16v11"),
  borderLeft: svgIcon("M4 4v16M9 4h11v16H9"),
  borderRight: svgIcon("M20 4v16M15 4H4v16h11"),
  borderNone: svgIcon("M4 4h3m4 0h2m4 0h3M4 20h3m4 0h2m4 0h3M4 9v6M20 9v6"),
  mergeAndCenter: svgIcon("M3 5h18v14H3ZM6 12h5m-3-3 3 3-3 3M18 12h-5m3-3-3 3 3 3"),
  currency: svgIcon("M12 2v20M18 6H9a4 4 0 0 0 0 8h6a4 4 0 0 1 0 8H6"),
  percent: svgIcon("m5 20 14-16M6 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M18 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6"),
  comma: svgIcon("M10 14h4v4l-4 4"),
  decimalIncrease: svgIcon("M4 8h2M9 4v8M14 4v8M4 18h16m-4-4 4 4-4 4"),
  decimalDecrease: svgIcon("M4 8h2M9 4v8M14 4v8M20 18H4m4-4-4 4 4 4"),
  insert: svgIcon("M4 4h16v16H4ZM12 8v8M8 12h8"),
  delete: svgIcon("M4 4h16v16H4ZM8 12h8"),
  format: svgIcon("M4 4h16v16H4ZM4 10h16M10 10v10"),
  autoSum: svgIcon("M19 4H5l8 8-8 8h14"),
  sortFilter: svgIcon("M3 4h18l-7 8v7l-4 2v-9Z"),
  find: svgIcon("M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6"),
  clear: svgIcon("m4 15 9-9 7 7-7 7H9ZM9 10l7 7M4 22h17"),
  freeze: svgIcon("M4 4h16v16H4ZM4 10h16M10 4v16"),
  zoomIn: svgIcon("M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6M7 10h6M10 7v6"),
  zoomOut: svgIcon("M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6M7 10h6"),
  hyperlink: svgIcon(
    "m10 14 4-4M9 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  ),
  note: svgIcon("M4 3h16v13l-5 5H4ZM15 21v-5h5M8 8h8M8 12h8"),
  groupRows: svgIcon("M8 4H4v16h4M12 12h8M16 8v8"),
  ungroupRows: svgIcon("M8 4H4v16h4M12 12h8"),
  clearFilter: svgIcon("M3 4h18l-7 8v8h-4v-8ZM16 16l6 6m0-6-6 6"),
};
