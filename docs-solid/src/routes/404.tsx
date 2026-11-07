import { createFileRoute } from "@tanstack/solid-router";
import { NoHydration } from "solid-js/web";

import { SiteTopbar } from "../components/SiteTopbar.js";

/**
 * Prerendered to /404.html, which static hosts serve for every URL without a
 * page (the deployment supplies the 404 status). The prerenderer rejects 404
 * responses, so the page renders here with a normal status.
 */
export const Route = createFileRoute("/404")({
  head: () => ({
    meta: [{ title: "Page not found — Sheetwrite" }, { name: "robots", content: "noindex" }],
  }),
  component: SiteNotFound,
});

/** The site page for any URL without a page, as docs/src/components/RouteFallbacks.tsx renders it. */
function SiteNotFound() {
  return (
    <NoHydration>
      <div class="sw-showcase-frame">
        <SiteTopbar pathname="/404/" />
        <main class="sw-showcase-page sw-route-fallback" id="main-content">
          <h1>Page not found</h1>
          <p>This page does not exist. It may have moved.</p>
          <p>
            <a href="/">Home</a> · <a href="/docs/">Documentation</a> ·{" "}
            <a href="/showcases/">Showcases</a>
          </p>
        </main>
      </div>
    </NoHydration>
  );
}
