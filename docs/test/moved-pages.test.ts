import { describe, expect, it } from "bun:test";

import { forwardedHeading, movedPageTarget } from "../src/lib/moved-pages.js";

const moved = {
  "/docs/guides/configuration/": {
    to: "/docs/features/grid/options-and-presentation/",
    anchors: {
      gridoptions: "/docs/features/grid/options-and-presentation/#gridoptions",
      "datasource-pages": "/docs/features/data/datasources/#requests-and-pages",
      search: "/docs/features/grid/search/",
    },
  },
};

describe("moved pages", () => {
  it("sends an old page and heading to the page that holds the heading now", () => {
    expect(movedPageTarget("/docs/guides/configuration/", "", moved)).toBe(
      "/docs/features/grid/options-and-presentation/",
    );
    expect(movedPageTarget("/docs/guides/configuration/", "#datasource-pages", moved)).toBe(
      "/docs/features/data/datasources/#requests-and-pages",
    );
    expect(movedPageTarget("/docs/guides/configuration/", "#unknown", moved)).toBe(
      "/docs/features/grid/options-and-presentation/#unknown",
    );
    expect(movedPageTarget("/docs/start/installation/", "#x", moved)).toBeUndefined();
  });

  it("forwards an old fragment that arrives on the redirect target to its new page", () => {
    const target = "/docs/features/grid/options-and-presentation/";
    expect(forwardedHeading(target, "#datasource-pages", moved)).toBe(
      "/docs/features/data/datasources/#requests-and-pages",
    );
    expect(forwardedHeading(target, "#search", moved)).toBe("/docs/features/grid/search/");
    // A heading that stayed on the target page needs no second navigation.
    expect(forwardedHeading(target, "#gridoptions", moved)).toBeUndefined();
    expect(forwardedHeading(target, "", moved)).toBeUndefined();
    expect(
      forwardedHeading("/docs/features/grid/search/", "#datasource-pages", moved),
    ).toBeUndefined();
  });

  it("ignores a fragment with a malformed escape", () => {
    expect(movedPageTarget("/docs/guides/configuration/", "#%", moved)).toBe(
      "/docs/features/grid/options-and-presentation/",
    );
    expect(
      forwardedHeading("/docs/features/grid/options-and-presentation/", "#%E0%A4%A", moved),
    ).toBeUndefined();
  });
});
