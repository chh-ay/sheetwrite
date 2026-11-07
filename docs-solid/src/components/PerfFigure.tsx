import { createEffect, createSignal, onCleanup } from "solid-js";
import { perfFigureHtml, perfFigureUrl } from "virtual:perf-figures";

/**
 * Markup that ships in the page, not in a script: the server render inlines
 * `html`; when the page hydrates, the markup is read back from the element
 * `hostId`; after a client-side navigation it is fetched from `url`, a static
 * asset. Returns the markup, or null until it is there.
 */
function createStaticMarkup(
  hostId: string,
  html: string | null,
  url: string | null,
): () => string | null {
  const [markup, setMarkup] = createSignal<string | null>(
    html ??
      (typeof document === "undefined"
        ? null
        : (document.getElementById(hostId)?.innerHTML ?? null)),
  );
  createEffect(() => {
    if (markup() !== null || url === null) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then(setMarkup)
      // Markup that fails to load leaves its place empty; the page's text still reads.
      .catch(() => undefined);
    onCleanup(() => controller.abort());
  });
  return markup;
}

/**
 * A Performance page's figure: static HTML the docs generator built from the
 * committed captures, kept out of the page's script (see perf-figure-markup.ts
 * and createStaticMarkup). The figure needs no client code of its own.
 */
export default function PerfFigure(props: Readonly<{ name: string }>) {
  const hostId = `perf-figure-${props.name}`;
  const html = createStaticMarkup(hostId, perfFigureHtml(props.name), perfFigureUrl(props.name));
  return (
    <div
      class="perf-figure-host"
      id={hostId}
      // Built at docs generation from committed captures; every text value is escaped.
      innerHTML={html() ?? ""}
    />
  );
}
