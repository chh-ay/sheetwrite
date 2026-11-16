import { describe, expect, it } from "bun:test";

import { normalizeSitemap, pageSources, setLastmods } from "./normalize-sitemap.js";

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

describe("sitemap lastmod", () => {
  it("dates a page by the files it links as its source, else its formula data or route module", () => {
    const edit =
      '<a href="https://github.com/chh-ay/sheetwrite/edit/develop/docs/src/content/docs/features/accessibility.md">Edit</a>';
    const source =
      '<a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/grid.ts#L507">Source</a>' +
      '<a href="https://github.com/chh-ay/sheetwrite/blob/develop/packages/core/src/grid.ts#L9">Source</a>';
    expect(pageSources("/docs/features/accessibility/", edit)).toEqual([
      "docs/src/content/docs/features/accessibility.md",
    ]);
    expect(pageSources("/docs/api/core/create-grid/", source)).toEqual([
      "packages/core/src/grid.ts",
    ]);
    expect(pageSources("/docs/reference/formula-functions/math/", "")).toEqual([
      "test/conformance/formula-contract.inventory.json",
      "scripts/formula-reference.json",
    ]);
    expect(pageSources("/", "")).toEqual([
      "docs/src/routes/index.tsx",
      "docs/src/routes/index.index.tsx",
    ]);
    expect(pageSources("/showcases/sort/", "")).toEqual([
      "docs/src/routes/showcases.sort.tsx",
      "docs/src/routes/showcases.sort.index.tsx",
    ]);
  });

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
