import { useEffect, useState } from "react";
import { speedStoryHtml, speedStoryUrl } from "virtual:speed-story";

/** The host's id, so hydration reads the prerendered story back from the page. */
const HOST_ID = "speed-story";

/**
 * The speed story on a React page: the markup the docs generator built from
 * the committed captures, the same markup the Render page carries. The server
 * render inlines it; hydration reads it back from the page; a client-side
 * navigation fetches it as a static asset. The script never carries it, and
 * the story itself needs no client code: the switch and disclosures are form
 * controls and `<details>`.
 */
export default function SpeedupBars() {
  const [html, setHtml] = useState<string | null>(
    () =>
      speedStoryHtml ??
      (typeof document === "undefined"
        ? null
        : (document.getElementById(HOST_ID)?.innerHTML ?? null)),
  );
  useEffect(() => {
    if (html !== null || speedStoryUrl === null) return;
    const controller = new AbortController();
    fetch(speedStoryUrl, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then(setHtml)
      // A story that fails to load leaves its section empty; the page links to every result.
      .catch(() => undefined);
    return () => controller.abort();
  }, [html]);
  return (
    <div
      className="speed-story-host"
      // Built at docs generation from committed captures; every text value is escaped.
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
      id={HOST_ID}
    />
  );
}
