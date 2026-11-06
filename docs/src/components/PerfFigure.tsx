import { perfFigureHtml, perfFigureUrl } from "virtual:perf-figures";

import { useStaticMarkup } from "../lib/static-markup.js";

/**
 * A Performance page's figure: static HTML the docs generator built from the
 * committed captures, kept out of the page's script (see perf-figure-markup.ts
 * and useStaticMarkup). The figure needs no client code of its own.
 */
export default function PerfFigure({ name }: Readonly<{ name: string }>) {
  const hostId = `perf-figure-${name}`;
  const html = useStaticMarkup(hostId, perfFigureHtml(name), perfFigureUrl(name));
  return (
    <div
      className="perf-figure-host"
      // Built at docs generation from committed captures; every text value is escaped.
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
      id={hostId}
    />
  );
}
