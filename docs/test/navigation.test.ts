import { describe, expect, it } from "bun:test";

import {
  breadcrumbsFor,
  documentNeighbours,
  type NavigationItem,
  navigationBadge,
} from "../src/lib/navigation.js";
import { sectionPages } from "../src/lib/section-cards.js";

describe("navigationBadge", () => {
  const RELEASE = "0.6.0";
  const volatile: NavigationItem = {
    label: "Volatile",
    href: "/docs/formulas/volatile/",
    updated: RELEASE,
  };
  const calculation: NavigationItem = {
    label: "Calculation",
    items: [volatile, { label: "Iterative", href: "/docs/formulas/iterative/", added: RELEASE }],
  };
  const old: NavigationItem = { label: "Old", href: "/docs/old/", added: "0.5.0" };

  it.each([
    // A group holding one updated and one new page shows new.
    [calculation, RELEASE, "new"],
    [volatile, RELEASE, "updated"],
    // Badges last through patch releases and clear at the next minor release.
    [old, "0.5.4", "new"],
    [volatile, "0.6.1", "updated"],
    [old, RELEASE, undefined],
    [calculation, "0.7.0", undefined],
  ] as const)("gives %o at %s the badge %s", (item, release, badge) => {
    expect(navigationBadge(item, release)).toBe(badge);
  });
});

describe("section overview pages", () => {
  it("are linked in the trail of their pages and end their own trail unlinked", () => {
    expect(breadcrumbsFor("/docs/start/installation/", "Installation")).toEqual([
      { href: "/docs/", label: "Documentation" },
      { href: "/docs/start/", label: "Getting started" },
      { label: "Installation" },
    ]);
    expect(breadcrumbsFor("/docs/start/", "Getting started")).toEqual([
      { href: "/docs/", label: "Documentation" },
      { label: "Getting started" },
    ]);
  });

  it("come before their section's pages in the reading order, and list them as cards", () => {
    expect(documentNeighbours("/docs/start/").next?.href).toBe("/docs/start/installation/");
    expect(documentNeighbours("/docs/start/installation/").previous?.href).toBe("/docs/start/");
    expect(sectionPages("/docs/start/").map((page) => page.href)).toContain(
      "/docs/start/installation/",
    );
  });
});
