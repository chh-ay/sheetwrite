import { useEffect, useState } from "react";

/**
 * Markup that ships in the page, not in a script: the server render inlines
 * `html`; when the page hydrates, the markup is read back from the element
 * `hostId`; after a client-side navigation it is fetched from `url`, a static
 * asset. Returns the markup, or null until it is there.
 */
export function useStaticMarkup(
  hostId: string,
  html: string | null,
  url: string | null,
): string | null {
  const [markup, setMarkup] = useState<string | null>(
    () =>
      html ??
      (typeof document === "undefined"
        ? null
        : (document.getElementById(hostId)?.innerHTML ?? null)),
  );
  useEffect(() => {
    if (markup !== null || url === null) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then(setMarkup)
      // Markup that fails to load leaves its place empty; the page's text still reads.
      .catch(() => undefined);
    return () => controller.abort();
  }, [markup, url]);
  return markup;
}
