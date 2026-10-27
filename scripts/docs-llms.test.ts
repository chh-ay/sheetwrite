import { describe, expect, it } from "bun:test";

import { inNavigationOrder } from "./docs-llms.js";

describe("llms reading order", () => {
  it("orders pages depth-first by the sidebar, then unlisted pages by route", () => {
    const sections = [
      {
        label: "Features",
        items: [
          {
            label: "Grid",
            items: [
              { label: "Search", href: "/docs/features/grid/search/" },
              { label: "Context menu", href: "/docs/features/grid/context-menu/" },
            ],
          },
        ],
      },
      { label: "Reference", items: [{ label: "Events", href: "/docs/reference/events/" }] },
    ];
    const documents = [
      { route: "/docs/reference/events/" },
      { route: "/docs/zeta/" },
      { route: "/docs/features/grid/context-menu/" },
      { route: "/docs/alpha/" },
      { route: "/docs/features/grid/search/" },
    ];
    expect(inNavigationOrder(documents, sections).map((document) => document.route)).toEqual([
      "/docs/features/grid/search/",
      "/docs/features/grid/context-menu/",
      "/docs/reference/events/",
      "/docs/alpha/",
      "/docs/zeta/",
    ]);
  });
});
