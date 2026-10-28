import { describe, expect, it } from "bun:test";

import { normalizeSitemap } from "./normalize-sitemap.js";

const wrap = (urls: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((loc) => `<url><loc>${loc}</loc></url>`)
    .join("\n")}\n</urlset>\n`;

describe("sitemap normalization contract", () => {
  it("keeps one canonical trailing-slash URL per page and drops fragments and noindex routes", () => {
    const { xml, kept, dropped } = normalizeSitemap(
      wrap([
        "https://www.sheetwrite.dev/",
        "https://www.sheetwrite.dev/react",
        "https://www.sheetwrite.dev/react/",
        "https://www.sheetwrite.dev/docs/api/core/grid/#grid-set-zoom",
        "https://www.sheetwrite.dev/test/xlsx",
        "https://www.sheetwrite.dev/docs/proof/",
        "https://www.sheetwrite.dev/404",
        "https://www.sheetwrite.dev/docs/start/installation/",
      ]),
    );
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      "https://www.sheetwrite.dev/",
      "https://www.sheetwrite.dev/react/",
      "https://www.sheetwrite.dev/docs/start/installation/",
    ]);
    expect(kept).toBe(3);
    expect(dropped).toBe(5);
  });

  it("drops query variants, whose pages name the plain URL as canonical, and non-page files", () => {
    const { xml, dropped } = normalizeSitemap(
      wrap([
        "https://www.sheetwrite.dev/showcases/interoperability/",
        "https://www.sheetwrite.dev/showcases/interoperability/?compatibility=formula.let",
        // Sitemap XML escapes "&", so a two-parameter query arrives as "&amp;".
        "https://www.sheetwrite.dev/showcases/interoperability/?compatibility=x&amp;view=y",
        "https://www.sheetwrite.dev/llms.txt",
        "https://www.sheetwrite.dev/llms-full.txt",
      ]),
    );

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(["https://www.sheetwrite.dev/showcases/interoperability/"]);
    expect(dropped).toBe(4);
  });
});
