import { describe, expect, it } from "bun:test";

import { documentStructuredData } from "../src/lib/seo.js";

interface ListItem {
  readonly position: number;
  readonly name: string;
  readonly item?: string;
}

function breadcrumbs(json: string): ListItem[] {
  const parsed = JSON.parse(json) as { "@graph": Array<Record<string, unknown>> };
  const list = parsed["@graph"].find((node) => node["@type"] === "BreadcrumbList");
  return (list?.itemListElement ?? []) as ListItem[];
}

describe("documentation breadcrumb structured data", () => {
  it("gives every breadcrumb a URL when a section in the trail has no page", () => {
    const items = breadcrumbs(
      documentStructuredData({
        title: "ColumnarData",
        description: "Columnar data type.",
        href: "/docs/api/core/columnar-data/",
        trail: [
          { label: "Docs", href: "/docs/" },
          { label: "API" },
          { label: "Core", href: "/docs/api/core/" },
          { label: "ColumnarData" },
        ],
      }),
    );

    expect(items.map((item) => [item.position, item.name, item.item])).toEqual([
      [1, "Docs", "https://www.sheetwrite.dev/docs/"],
      [2, "Core", "https://www.sheetwrite.dev/docs/api/core/"],
      [3, "ColumnarData", "https://www.sheetwrite.dev/docs/api/core/columnar-data/"],
    ]);
  });
});
