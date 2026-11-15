/**
 * The figure kit as build-time HTML, for figures that the docs generator
 * writes into Markdown and generated JSON. The kit's components are React,
 * rendered to static markup here; no page ships them.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Lane, type LaneProps } from "./Lane.js";
import { RangeRow, type RangeRowProps } from "./RangeRow.js";
import { type FigureShape, type FigureTone, markPath } from "./scale.js";

export function laneHtml(props: LaneProps): string {
  return renderToStaticMarkup(createElement(Lane, props));
}

export function rangeRowHtml(props: RangeRowProps): string {
  return renderToStaticMarkup(createElement(RangeRow, props));
}

/** A legend key: the mark a series is drawn with, as a small decorative SVG. */
export function legendMark(shape: FigureShape, tone: FigureTone): string {
  return `<svg class="fig-key" data-tone="${tone}" width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d="${markPath(shape, 5)}"/></svg>`;
}
