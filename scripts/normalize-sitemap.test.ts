import { describe, expect, it } from "bun:test";

import { normalizeSitemap, setLastmods } from "./normalize-sitemap.js";

const SITE = "https://www.sheetwrite.dev";

describe("sitemap normalization contract", () => {
  it("keeps one canonical trailing-slash page URL and drops fragments, queries, noindex routes and files", () => {
    const paths = [
      "/",
      "/react",
      "/react/",
      "/docs/api/core/grid/#grid-set-zoom",
      "/test/xlsx",
      "/docs/proof/",
      "/404",
      "/docs/start/installation/",
      // Query variants name the plain URL as canonical; sitemap XML escapes "&" as "&amp;".
      "/showcases/interoperability/?compatibility=formula.let",
      "/showcases/interoperability/?compatibility=x&amp;view=y",
      "/showcases/interoperability/",
      "/llms.txt",
      "/llms-full.txt",
    ];
    const { xml, kept, dropped } = normalizeSitemap(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
        .map((path) => `<url><loc>${SITE}${path}</loc></url>`)
        .join("\n")}\n</urlset>\n`,
    );
    const keptPaths = ["/", "/react/", "/docs/start/installation/", "/showcases/interoperability/"];
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual(
      keptPaths.map((path) => `${SITE}${path}`),
    );
    expect({ kept, dropped }).toEqual({
      kept: keptPaths.length,
      dropped: paths.length - keptPaths.length,
    });
  });
});

describe("sitemap lastmod", () => {
  it("replaces the crawler's build date and adds a missing lastmod", () => {
    const xml = setLastmods(
      "<url>\n    <loc>https://www.sheetwrite.dev/</loc>\n    <lastmod>2026-11-15</lastmod>\n  </url>\n<url><loc>https://www.sheetwrite.dev/docs/</loc></url>",
      (pathname) => (pathname === "/" ? "2026-10-30" : "2026-11-02"),
    );
    expect([...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1])).toEqual([
      "2026-10-30",
      "2026-11-02",
    ]);
  });
});
