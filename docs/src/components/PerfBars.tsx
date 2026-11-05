import { iconHref } from "../icons/icon-href.js";
import { type PerfFigure, type PerfIconName, renderPerfBars } from "../lib/perf-bars.js";

function spriteIcon(name: PerfIconName): string {
  return `<svg aria-hidden="true" class="sw-icon" data-size="sm" focusable="false"><use href="${iconHref(name)}"></use></svg>`;
}

/**
 * Performance bars on a React page. The figure is the same static markup the
 * generated Markdown pages carry, so pages and docs share one renderer and the
 * bars need no client code; icons reference the sprite file.
 */
export function PerfBars({ figure }: Readonly<{ figure: PerfFigure }>) {
  return (
    <div
      className="perf-bars-host"
      // The renderer escapes every text value; the markup is built from committed captures.
      dangerouslySetInnerHTML={{ __html: renderPerfBars(figure, spriteIcon) }}
    />
  );
}
