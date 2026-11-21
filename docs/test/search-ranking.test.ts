import { describe, expect, it } from "bun:test";

import { type PagefindResultData, rankEntries, searchTerms } from "../src/lib/search-ranking.js";

const page = (url: string, title: string, content = title): PagefindResultData => ({
  url,
  meta: { title },
  excerpt: "",
  content,
});

const pageUrls = (pages: readonly PagefindResultData[], query: string): string[] =>
  rankEntries(pages, query).map((entry) => entry.url);

describe("docs search ranking", () => {
  it("drops question words so a question finds the pages that hold its subject", () => {
    expect(searchTerms("how do I freeze rows")).toBe("freeze rows");
    expect(searchTerms("export to Excel")).toBe("export Excel");
    expect(searchTerms("how")).toBe("how");
  });

  it("lists the guide titled with a plain word before API pages that Pagefind ranks higher", () => {
    const pages = [
      page("/docs/api/charts/chart-change-event/", "ChartChangeEvent", "charts change event"),
      page("/docs/api/charts/charts-addon/", "chartsAddon", "charts add-on"),
      page("/docs/features/analysis/charts/", "Charts", "charts from a range"),
    ];
    expect(pageUrls(pages, "charts")[0]).toBe("/docs/features/analysis/charts/");
  });

  it("matches a guide title in the plural and lists it before the API type", () => {
    const pages = [
      page("/docs/api/core/data-source/", "DataSource", "datasource contract"),
      page("/docs/features/data/datasources/", "Datasources", "datasource pages"),
    ];
    expect(pageUrls(pages, "datasource")[0]).toBe("/docs/features/data/datasources/");
  });

  it("ranks a title that holds every word in another order above other pages", () => {
    const pages = [
      page(
        "/docs/api/core/xlsx-table-import-backend/",
        "XlsxTableImportBackend",
        "import xlsx table",
      ),
      page("/docs/import-export/xlsx-import/", "XLSX import", "import an xlsx file"),
    ];
    expect(pageUrls(pages, "import xlsx")[0]).toBe("/docs/import-export/xlsx-import/");
  });

  it("does not lift an API page whose one-word title a question holds", () => {
    const pages = [
      page("/docs/api/core/theme/", "Theme", "dark theme tokens"),
      page("/docs/features/formatting/styles/", "Styles and themes", "a dark theme"),
    ];
    expect(pageUrls(pages, "dark theme")[0]).toBe("/docs/features/formatting/styles/");
  });
});
