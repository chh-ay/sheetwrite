import { describe, expect, it } from "bun:test";

import {
  breadcrumbsFor,
  documentNeighbours,
  type NavigationItem,
  navigationBadge,
  navigationPages,
} from "../src/lib/navigation.js";
import { sectionPages } from "../src/lib/section-cards.js";

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
  it("lifts the strongest badge of a group's pages to the group", () => {
    // "Calculation" holds one updated and one new page: new wins.
    expect(navigationBadge(calculation, RELEASE)).toBe("new");
    expect(navigationBadge(formulas, RELEASE)).toBe("new");
  });

  it("keeps badges through patch releases and clears them at the next minor release", () => {
    expect(navigationBadge(old, RELEASE)).toBeUndefined();
    expect(navigationBadge(old, "0.5.0")).toBe("new");
    expect(navigationBadge(old, "0.5.4")).toBe("new");
    expect(navigationBadge(volatile, "0.6.1")).toBe("updated");
    expect(navigationBadge(formulas, "0.7.0")).toBeUndefined();
  });

  it("marks an updated page that adds nothing new as updated", () => {
    expect(navigationBadge(volatile, RELEASE)).toBe("updated");
  });
});

describe("section overview pages", () => {
  it("link the section step in the trail of every page in the section", () => {
    expect(breadcrumbsFor("/docs/start/installation/", "Installation")).toEqual([
      { href: "/docs/", label: "Documentation" },
      { href: "/docs/start/", label: "Getting started" },
      { label: "Installation" },
    ]);
  });

  it("end their own trail without linking to themselves", () => {
    expect(breadcrumbsFor("/docs/start/", "Getting started")).toEqual([
      { href: "/docs/", label: "Documentation" },
      { label: "Getting started" },
    ]);
  });

  it("come before their section's pages in the reading order", () => {
    expect(documentNeighbours("/docs/start/").next?.href).toBe("/docs/start/installation/");
    expect(documentNeighbours("/docs/start/installation/").previous?.href).toBe("/docs/start/");
  });

  it("list the section's pages as cards", () => {
    expect(sectionPages("/docs/tutorials/").map((page) => page.href)).toContain(
      "/docs/tutorials/excel-in-react/",
    );
  });
});
