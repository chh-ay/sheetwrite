import { createFileRoute } from "@tanstack/react-router";
import { SiteNotFound } from "../components/RouteFallbacks.js";

/**
 * Prerendered to /404.html, which static hosts serve for every URL without a
 * page. The prerenderer rejects 404 responses, so the page renders here with a
 * normal status; on the client a missing URL renders the same component as the
 * root not-found page.
 */
export const Route = createFileRoute("/404")({
  head: () => ({
    meta: [{ title: "Page not found — Sheetwrite" }, { name: "robots", content: "noindex" }],
  }),
  component: SiteNotFound,
});
