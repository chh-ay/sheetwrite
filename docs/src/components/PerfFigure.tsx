import { perfFigureHtml } from "virtual:perf-figures";

/**
 * A Performance page's figure: static HTML the docs generator built from the
 * committed captures (see docs/src/lib/perf-figure-markup.ts). Pages render
 * once at build time, so the figure ships in the page and needs no script.
 */
export default function PerfFigure(props: Readonly<{ name: string }>) {
  const html = perfFigureHtml(props.name);
  if (html === null) throw new Error(`No performance figure named "${props.name}"`);
  return (
    <div
      class="perf-figure-host"
      id={`perf-figure-${props.name}`}
      // Built at docs generation from committed captures; every text value is escaped.
      innerHTML={html}
    />
  );
}
