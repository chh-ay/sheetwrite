import { describe, expect, it } from "bun:test";

import {
  breadcrumbsFor,
  DOCS_NAVIGATION,
  documentNeighbours,
  type NavigationItem,
  navigationBadge,
  navigationPages,
} from "../src/lib/navigation.js";

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
const formulas: NavigationItem = {
  label: "Formulas",
  href: "/docs/formulas/",
  items: [{ label: "References", href: "/docs/formulas/references/" }, calculation],
};
const old: NavigationItem = { label: "Old", href: "/docs/old/", added: "0.5.0" };
const tree: readonly NavigationItem[] = [{ label: "Overview", href: "/docs/" }, formulas, old];

describe("navigationPages", () => {
  it("lists pages depth-first, a group's own page before its children, and skips page-less groups", () => {
    expect(navigationPages(tree).map((page) => page.href)).toEqual([
      "/docs/",
      "/docs/formulas/",
      "/docs/formulas/references/",
      "/docs/formulas/volatile/",
      "/docs/formulas/iterative/",
      "/docs/old/",
    ]);
  });
});

describe("navigationBadge", () => {
  it.each([
    // A group holding one updated and one new page shows new.
    [calculation, RELEASE, "new"],
    [formulas, RELEASE, "new"],
    [volatile, RELEASE, "updated"],
    // Badges last through patch releases and clear at the next minor release.
    [old, "0.5.0", "new"],
    [old, "0.5.4", "new"],
    [volatile, "0.6.1", "updated"],
    [old, RELEASE, undefined],
    [formulas, "0.7.0", undefined],
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

  it("come before their section's pages in the reading order", () => {
    expect(documentNeighbours("/docs/start/").next?.href).toBe("/docs/start/installation/");
    expect(documentNeighbours("/docs/start/installation/").previous?.href).toBe("/docs/start/");
  });
});

it("gives every sidebar entry and every section overview an icon", () => {
  const missing: string[] = [];
  const visit = (items: readonly NavigationItem[], trail: string): void => {
    for (const item of items) {
      if (item.icon === undefined) missing.push(`${trail} › ${item.label}`);
      visit(item.items ?? [], trail);
    }
  };
  for (const section of DOCS_NAVIGATION) {
    if (section.href !== undefined && section.icon === undefined) missing.push(section.label);
    visit(section.items, section.label);
  }
  expect(missing).toEqual([]);
});
